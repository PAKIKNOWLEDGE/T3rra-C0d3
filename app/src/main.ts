/**
 * Boot: connect the byte channel, perform the ACP handshake, send an instruction, and feed
 * every line through the adapter into the view.
 *
 * Request/response bookkeeping lives here (the adapter maps notifications; "which request was
 * this response for" is ours). Client capabilities are sent EMPTY on purpose: the captured
 * traces show that declaring nothing is what keeps this frontend inert — the engine then never
 * asks us for a filesystem, a terminal, or permission.
 *
 * The page title's topic is the operator's *own instruction* — the one fact about "what is
 * happening" that we actually hold; the tool stream lives in the record. Before the first
 * instruction it says so, rather than inventing a topic.
 */

import { translateLine } from "./engine/acp.ts";
import { mapResponse, errorReasonOf, failureEvents } from "./engine/responses.ts";
import { deleteSession } from "./engine/engine-http.ts";
import { cancelNotificationLine } from "./engine/cancel.ts";
import type { AgentEvent } from "./contract/events.ts";
import { createBridgeTransport, type Transport } from "./engine/transport.ts";
import { emptyView, reduceView, type ConsoleView } from "./view/derive.ts";
import { beginWaiting, discardSamples, endTurn, observeActivity, report, startCadence, type ActivityPhase, type Cadence } from "./view/cadence.ts";
import { mountConsole, type EventLogEntry, type SessionFacts } from "./ui/console.ts";

const ui = mountConsole();
const transport: Transport = createBridgeTransport(crypto.randomUUID());

let view: ConsoleView = emptyView();
let nextId = 1;
const pending = new Map<number, { method: string }>();

let facts: SessionFacts = {
  phase: "启动中",
  phaseNote: "只有字节通道，还没有引擎",
  busy: false,
};
const patch = (next: SessionFacts): void => {
  facts = { ...facts, ...next };
  ui.setFacts(next);
};

/**
 * Which activity a sign belongs to. Only signs of the runtime *working on the turn* count:
 * option chatter and transport notices are not work, and the idle-to-first-event gap is
 * dropped by the cadence module anyway (rule 8).
 */
const phaseOf = (event: AgentEvent): ActivityPhase | null => {
  switch (event.kind) {
    case "message.appended":
    case "thought.appended":
      return "streaming";
    case "tool.started":
    case "tool.updated":
      return "tool";
    default:
      return null;
  }
};

let cadence: Cadence = startCadence();
let eventLog: EventLogEntry[] = [];
const sessionStartedAt = { at: Date.now() };
/** A load we asked for but have not seen the response to — kept so a dropped response is
 *  visible, never to invent a `session.opened` (audit F6 removed that fabrication). */
/** Instruction typed before a session existed; sent after session/new opens. */
let queuedPrompt: string | undefined;

/** A one-line, factual description of an event for the EVENTS view. */
const describe = (event: AgentEvent): string => {
  const src = `${event.from.method}${event.from.variant === undefined ? "" : `/${event.from.variant}`}`;
  switch (event.kind) {
    case "session.opened": return `session ${event.sessionId}`;
    case "sessions.updated": return `${event.sessions.length} session(s) from list`;
    case "sessions.removed": return `deleted ${event.sessionId}`;
    case "options.updated":
      return `${event.options.length} option(s): ${event.options.map((option) => `${option.id}=${option.currentValue}`).join(", ")}`;
    case "message.appended": return `${event.role} · ${event.text.length} chars · ${src}`;
    case "thought.appended": return `reasoning · ${event.text.length} chars`;
    case "tool.started": return `${event.title === "" ? "(untitled)" : event.title} · ${event.hint === "" ? "tool" : event.hint}`;
    case "tool.updated": return `${event.toolCallId} · ${event.status === "" ? "no status" : event.status}`;
    case "permission.requested": return `${event.summary || event.requestId} · ${event.options.length} option(s)`;
    case "permission.resolved": return `${event.requestId} → ${event.optionId}`;
    case "prompt.ended": return `stop reason ${event.stopReason}`;
    case "prompt.failed": return `turn failed · ${event.reason}`;
    case "sessions.unavailable": return `list unavailable · ${event.reason}`;
    case "link.down": return `channel down · ${event.reason}`;
    case "permission.cancelled": return `${event.requestId} → cancelled`;
    case "engine.stderr": return event.text;
    case "engine.exited": return `code ${event.code ?? "—"} · signal ${event.signal ?? "—"}`;
    case "message.unmapped": return `from ${src}`;
  }
};

const logEvents = (events: readonly AgentEvent[]): void => {
  if (events.length === 0) return;
  const now = Date.now();
  for (const event of events) {
    eventLog.push({ at: `+${((now - sessionStartedAt.at) / 1000).toFixed(1)}s`, kind: event.kind, detail: describe(event) });
  }
  eventLog = eventLog.slice(-500);
};
const silenceNow = (): SessionFacts => ({ silence: report(cadence, facts.busy === true, Date.now()) });

/** First line of the instruction, whitespace-collapsed, capped — stage title only. */
const shortTopic = (text: string): string => {
  const line = (text.split(/\r?\n/)[0] ?? text).replace(/\s+/g, " ").trim();
  const limit = 28;
  return line.length <= limit ? line : `${line.slice(0, limit - 1)}…`;
};

/**
 * Gate for every user action. Returns false and **says so on screen** when the engine
 * is not ready — never a bare return. A silent early-return is a dead control by
 * another name (the 6190ad4 class of bug).
 */
const engineReady = (action: string): boolean => {
  const binary = facts.binary;
  if (binary === undefined || binary === "NOT FOUND") {
    patch({
      lastError: `${action} blocked: engine not ready`,
      phase: "没有引擎",
      phaseNote: "按右下「重启」，或检查 T3RRA_ENGINE_BIN",
    });
    ui.setCommandEnabled(true);
    ui.setPlaceholder("引擎没就绪 · 按右下「重启」");
    return false;
  }
  return true;
};

const apply = (events: readonly AgentEvent[]): void => {
  logEvents(events);
  const now = Date.now();
  for (const event of events) {
    view = reduceView(view, event, now);
    const phase = phaseOf(event);
    if (phase !== null) cadence = observeActivity(cadence, phase, now, event.kind);
    // A turn ends two ways and both must release `busy` and close the cadence sample: politely
    // (`prompt.ended`) or by error (`prompt.failed`). Only the first was handled, which is how a
    // failed prompt left the dock stuck on `[ RUNNING ]` over an already idle engine (audit F7).
    if (event.kind === "prompt.ended" || event.kind === "prompt.failed") {
      cadence = endTurn(cadence);
      patch(
        event.kind === "prompt.ended"
          ? { busy: false, phase: "就绪", phaseNote: `本轮结束 · ${event.stopReason}`, ...silenceNow() }
          : { busy: false, phase: "就绪", phaseNote: "本轮失败 · 原因写在记录末尾", lastError: event.reason, ...silenceNow() },
      );
    }
    if (event.kind === "sessions.unavailable") {
      patch({ phaseNote: `会话列表取不到 · ${event.reason.slice(0, 60)}`, ...silenceNow() });
    }
  }
  ui.render(view);
  patch(silenceNow());
  if (currentView === "events") ui.renderEvents(eventLog);
};

const send = (method: string, params: unknown): number => {
  const id = nextId++;
  pending.set(id, { method });
  void transport.write(JSON.stringify({ jsonrpc: "2.0", id, method, params })).catch((error: unknown) => {
    patch({ lastError: String(error).slice(0, 160) });
  });
  return id;
};

const refreshSessions = (): void => {
  send("session/list", {});
};

/** Responses carry facts the notifications do not: the session id and the option menu. */
const handleResponse = (method: string, result: unknown): boolean => {
  let mapping = mapResponse(method, result);
  if (mapping.agentName !== undefined) patch({ engine: mapping.agentName });
  if (mapping.sessionId !== undefined) {
    if (view.sessionId !== undefined && view.sessionId !== mapping.sessionId) {
      // A different session: stream/log belonged to the old one; keep the sessions panel list.
      const sessions = view.sessions;
      view = { ...emptyView(), sessions };
      eventLog = [];
      sessionStartedAt.at = Date.now();
    }
    cadence = startCadence(); // a new session has no measured cadence of its own yet
    patch({
      sessionId: mapping.sessionId,
      startedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      phase: "就绪",
      phaseNote: "会话已打开 · 等你下指令",
    });
    ui.setCommandEnabled(true);
    ui.setPlaceholder("下达指令");
    refreshSessions();
  }
  if (mapping.events.length > 0) apply(mapping.events);
  // First instruction that waited for session/new: fire after session.opened is in the view.
  if (queuedPrompt !== undefined && view.sessionId !== undefined) {
    const text = queuedPrompt;
    queuedPrompt = undefined;
    apply([
      {
        kind: "message.appended",
        from: { method: "operator", variant: undefined },
        role: "user",
        messageId: `local-${nextId}`,
        text,
      },
    ]);
    if (facts.topic === undefined) patch({ topic: shortTopic(text) });
    cadence = beginWaiting(cadence, Date.now());
    patch({
      busy: true,
      phase: "运行中",
      phaseNote: "正在输出 · Esc 或「中止」打断本轮",
      ...silenceNow(),
    });
    send("session/prompt", { sessionId: view.sessionId, prompt: [{ type: "text", text }] });
  }
  // Turn-end state is driven from `apply()` only — one funnel for the event stream (rule 3).
  return mapping.recognised;
};

/**
 * A line is a *response* to something we sent only when it has no `method` and carries a
 * `result`/`error` for an id we are actually waiting on.
 *
 * Checking the shape rather than the number is deliberate. Audit F5 proposed separating the
 * client and engine id *ranges*, which cannot work in JSON-RPC: the engine picks its own ids
 * (measured starting at `0`, traces/opencode/opencode-acp-2026-09-23T05-59-54-343Z-prompt.jsonl:29)
 * and we have no say in them. What we can do is refuse to treat an inbound *request* as a
 * response just because the integers happen to collide — that collision is how an approval
 * prompt gets swallowed and the turn hangs forever.
 */
interface OutgoingResponse {
  readonly id: number;
  /** The method we sent under this id; undefined if we somehow lost the record. */
  readonly method: string | undefined;
  readonly result: unknown;
  readonly error: unknown;
}

const asOutgoingResponse = (parsed: { id?: number | string; method?: string; result?: unknown; error?: unknown } | undefined): OutgoingResponse | undefined => {
  if (parsed === undefined || typeof parsed.id !== "number" || parsed.method !== undefined) return undefined;
  if (parsed.result === undefined && parsed.error === undefined) return undefined;
  const entry = pending.get(parsed.id);
  if (entry === undefined) return undefined;
  pending.delete(parsed.id);
  return { id: parsed.id, method: entry.method, result: parsed.result, error: parsed.error };
};

const handleLine = (line: string): void => {
  let parsed: { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: unknown } | undefined;
  try {
    parsed = JSON.parse(line) as typeof parsed;
  } catch {
    // not JSON — the adapter counts it as unmapped, which is the honest outcome
  }

  const response = asOutgoingResponse(parsed);
  if (response !== undefined) {
    const known = response.method ?? "unknown";
    if (response.error !== undefined) {
      patch({ lastError: errorReasonOf(response.error) });
      if (known === "session/new" || known === "session/load") {
        // Failed opens must leave the dock usable and say why — no silent dead end (rule §五.3).
        queuedPrompt = undefined;
        ui.setCommandEnabled(true);
        ui.setPlaceholder("打开失败 · 新建会话，或再发一次");
        patch({ phase: "就绪", phaseNote: `打开失败 · ${known === "session/load" ? "换一个会话，或新建" : "再新建一次"}` });
      }
      apply(failureEvents(known, response.error));
      return;
    }
    if (handleResponse(known, response.result)) return;
    apply([{ kind: "message.unmapped", from: { method: `${known}.response`, variant: undefined } }]);
    return;
  }

  // Notification or an engine→client request. Route by the session it names (audit F4): before
  // this, chunks from another session — or from a turn already abandoned — were appended to
  // whatever the operator was looking at.
  const translation = translateLine(line);
  if (translation.sessionId !== undefined && view.sessionId !== undefined && translation.sessionId !== view.sessionId) {
    patch({ lastError: `dropped update for session ${translation.sessionId.slice(0, 12)}… (showing ${view.sessionId.slice(0, 12)}…)`, phaseNote: "丢弃了一条别的会话的更新" });
    return;
  }
  apply(translation.events);
};

const handshake = async (): Promise<void> => {
  const probe = await transport.probe();
  patch({ binary: probe.binary ?? "NOT FOUND", cwd: probe.cwd ?? "NOT STATED" });
  if (probe.binary === null) {
    patch({ phase: "没有引擎", phaseNote: "设置 T3RRA_ENGINE_BIN，或把 opencode 放进 PATH" });
    ui.setPlaceholder("没找到引擎 · 设置 T3RRA_ENGINE_BIN");
    ui.setCommandEnabled(false);
    return;
  }
  await transport.spawn();
  send("initialize", { protocolVersion: 1, clientInfo: { name: "t3rra-console", version: "0.2.0" }, clientCapabilities: {} });
  await new Promise((done) => setTimeout(done, 600));
  // Do NOT session/new here — opening the page must not create a junk session.
  refreshSessions();
  ui.setLink("ok");
  ui.setCommandEnabled(true);
  ui.setPlaceholder("选一个会话、新建，或直接输入指令开新会话");
  patch({ phase: "就绪", phaseNote: "引擎已启动 · 你不开口就不建会话" });
};

transport.onLine(handleLine);
transport.onExit((info) => {
  ui.setLink("down");
  patch({ busy: false, phase: "引擎已退出", phaseNote: "链路断开 · 按右下「重启」", exit: `code ${info.code ?? "—"} · signal ${info.signal ?? "—"}` });
  ui.setCommandEnabled(false);
  apply([{ kind: "engine.exited", from: { method: "process", variant: undefined }, code: info.code, signal: info.signal }]);
});
transport.onError((message) => {
  patch({ lastError: message.slice(0, 160) });
  apply([{ kind: "engine.stderr", from: { method: "stderr", variant: undefined }, text: message }]);
});
// The channel dropping used to be invisible: LINK stayed OK over a dead stream (audit F7).
// Recovery is on-screen and clickable — RESTART is the way out, so point at it.
transport.onLinkDown((reason) => {
  ui.setLink("down");
  patch({ busy: false, phase: "链路断开", phaseNote: `通道 ${reason} · 按右下「重启」`, lastError: `byte channel down: ${reason}` });
  apply([{ kind: "link.down", from: { method: "stream", variant: undefined }, reason }]);
});

let currentView: "process" | "events" = "process";
ui.onViewChange((next) => {
  currentView = next;
  ui.setView(next);
  if (next === "events") ui.renderEvents(eventLog);
});

/** `＋ NEW` and the empty-list CREATE: a fresh session in the same engine. */
const createSession = (why: string): void => {
  if (!engineReady(why)) return;
  queuedPrompt = undefined;
  patch({ phase: "正在开会话", phaseNote: `${why} · session/new`, busy: false, topic: undefined });
  ui.setView("process");
  ui.setCommandEnabled(true);
  ui.setPlaceholder("等新会话打开");
  send("session/new", { cwd: facts.cwd === undefined || facts.cwd === "NOT STATED" ? "." : facts.cwd, mcpServers: [] });
};

ui.onNewSession(() => {
  createSession("新建会话");
});
ui.onSessionCreate(() => {
  createSession("空态新建");
});

ui.onSessionsRefresh(() => {
  if (!engineReady("LIST")) return;
  refreshSessions();
});

ui.onSessionLoad((sessionId, cwd) => {
  if (!engineReady("LOAD")) return;
  // Move the current-session rail immediately so the marker does not wait on the response.
  if (view.sessionId !== sessionId) {
    const sessions = view.sessions;
    view = { ...emptyView(), sessions, sessionId };
    ui.render(view);
  }
  patch({
    sessionId,
    phase: "载入中",
    phaseNote: `session/load ${sessionId.slice(0, 12)}…`,
    busy: false,
    topic: undefined,
  });
  ui.setView("process");
  ui.setCommandEnabled(false);
  ui.setPlaceholder("正在回放历史");
  send("session/load", {
    sessionId,
    cwd: cwd === "" || cwd === "NOT STATED" ? facts.cwd === undefined || facts.cwd === "NOT STATED" ? "." : facts.cwd : cwd,
    mcpServers: [],
  });
});

ui.onSessionDelete((sessionId) => {
  if (!engineReady("DELETE")) return;
  patch({ phase: "删除中", phaseNote: `删除会话 ${sessionId.slice(0, 12)}…` });
  void deleteSession((method, path, body) => transport.http(method, path, body), sessionId)
    .then((result) => {
      if (result.status >= 400) {
        patch({ lastError: `delete failed: HTTP ${result.status}`.slice(0, 160), phase: "就绪", phaseNote: "删除失败" });
        return;
      }
      apply([
        {
          kind: "sessions.removed",
          from: { method: "http.delete.response", variant: undefined },
          sessionId,
        },
      ]);
      patch({ phase: "就绪", phaseNote: `已删除 ${sessionId.slice(0, 12)}…` });
      if (view.sessionId === sessionId) {
        // Open session is gone — do not auto-create another (that was the junk-session bug).
        const sessions = view.sessions.filter((item) => item.sessionId !== sessionId);
        view = { ...emptyView(), sessions };
        patch({ sessionId: undefined, topic: undefined, phase: "就绪", phaseNote: "会话已删除 · 选另一个，或新建" });
        ui.setCommandEnabled(true);
        ui.setPlaceholder("选一个会话、新建，或直接输入指令开新会话");
      }
      refreshSessions();
    })
    .catch((error: unknown) => {
      patch({ lastError: String(error).slice(0, 160), phase: "就绪", phaseNote: "删除失败" });
    });
});

/**
 * Approval reply is a JSON-RPC *response* to the engine's request, not a new request —
 * same id, `result.outcome` shape proven by traces/opencode/*-prompt.jsonl.
 */
ui.onPermissionSelect((requestId, optionId) => {
  if (!engineReady("APPROVAL")) return;
  const rawId: number | string = /^\d+$/.test(requestId) ? Number(requestId) : requestId;
  void transport
    .write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: rawId,
        result: { outcome: { outcome: "selected", optionId } },
      }),
    )
    .then(() => {
      apply([
        {
          kind: "permission.resolved",
          from: { method: "permission.reply", variant: undefined },
          requestId,
          optionId,
        },
      ]);
      patch({ phase: "就绪", phaseNote: `已答复批准 · ${optionId}` });
    })
    .catch((error: unknown) => {
      patch({ lastError: String(error).slice(0, 160), phase: "待批准", phaseNote: "答复没发出去 · 再点一次" });
    });
});

ui.onSubmit((text) => {
  if (view.sessionId === undefined) {
    if (!engineReady("TYPE TO OPEN")) return;
    // No session yet: create one, then send this instruction when the open lands.
    queuedPrompt = text;
    ui.setPlaceholder("正在为这条指令开会话");
    patch({ phase: "正在开会话", phaseNote: "为第一条指令新建会话", busy: false });
    send("session/new", { cwd: facts.cwd === undefined || facts.cwd === "NOT STATED" ? "." : facts.cwd, mcpServers: [] });
    return;
  }
  // The operator's own line is a fact of the operator, not a claim about the runtime.
  apply([{ kind: "message.appended", from: { method: "operator", variant: undefined }, role: "user", messageId: `local-${nextId}`, text }]);
  // Stage title = a short task theme, never the whole instruction (a long prompt in h1
  // blows the stage open and pushes the feed off-screen). Full text lives in the stream.
  if (facts.topic === undefined) patch({ topic: shortTopic(text) });
  cadence = beginWaiting(cadence, Date.now());
  patch({ busy: true, phase: "运行中", phaseNote: "正在输出 · Esc 或「中止」打断本轮", ...silenceNow() });
  send("session/prompt", { sessionId: view.sessionId, prompt: [{ type: "text", text }] });
});

/**
 * Answer a still-unanswered `session/request_permission` with `cancelled`.
 *
 * ACP requires the client to cancel outstanding permission requests when a turn ends or the
 * session tears down, and the engine folds `cancelled` into `reject` on its side
 * (docs/engine-contract-audit.md F10). Before this there was no such branch: the request was
 * simply never answered and the engine waited on a decision that no longer existed.
 *
 * The reply is a *response to an engine request*, so it carries the engine's id — that is why
 * `respondToEngineRequest` is kept separate from `send()`'s outgoing bookkeeping (F5).
 */
const cancelOutstandingPermission = (why: string): void => {
  const outstanding = view.permission;
  if (outstanding !== undefined) {
    const requestId = Number(outstanding.requestId);
    if (Number.isInteger(requestId)) {
      void transport
        .write(JSON.stringify({ jsonrpc: "2.0", id: requestId, result: { outcome: { outcome: "cancelled" } } }))
        .catch((error: unknown) => patch({ lastError: `could not cancel permission: ${String(error).slice(0, 120)}` }));
      apply([{ kind: "permission.cancelled", from: { method: "session/request_permission", variant: undefined }, requestId: outstanding.requestId }]);
      patch({ phaseNote: `批准请求已撤回 · ${why}` });
    } else {
      // An id we cannot answer with is its own defect: say which, and still close the dock.
      patch({ lastError: `permission ${outstanding.requestId} has no numeric request id; cannot answer cancelled`, phaseNote: `批准请求没能撤回 · ${why}` });
      apply([{ kind: "permission.cancelled", from: { method: "session/request_permission", variant: undefined }, requestId: outstanding.requestId }]);
    }
  }
};

ui.onRestart(() => {
  const binary = facts.binary;
  const cwd = facts.cwd;
  cancelOutstandingPermission("重启");
  // A restart orphans every request we had outstanding; leaving them in `pending` is how a
  // later engine message got mistaken for an old response (audit F5).
  pending.clear();
  view = emptyView();
  // Merge, never replace — replacing dropped `binary` and left + NEW silently dead.
  patch({
    phase: "重启中",
    phaseNote: "正在结束引擎进程",
    busy: false,
    sessionId: undefined,
    topic: undefined,
    binary,
    cwd,
  });
  ui.setCommandEnabled(true);
  ui.setPlaceholder("引擎重启中 · 就绪后再新建会话");
  void transport
    .kill()
    .then(handshake)
    .catch((error: unknown) => patch({ lastError: String(error).slice(0, 160) }));
});

/**
 * HALT = a `session/cancel` **notification** on stdio — no `id`, no HTTP.
 *
 * Why not the previous design (`POST /session/{id}/abort` on the ACP child's own port, with
 * the bridge splitting traffic by path shape): that whole routing split existed only because
 * an earlier probe concluded ACP has no interrupt. The probe was wrong — it sent
 * `session/cancel` as a *request*, so the SDK's notification-only dispatch answered `-32601`
 * (docs/engine-contract-audit.md F1). Measured end to end instead:
 * traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl — 53ms
 * after the id-less notification, the in-flight `session/prompt` answered
 * `stopReason:"cancelled"` 【实测】.
 *
 * What the UI may claim: a notification carries no acknowledgement, so "sent" is all HALT can
 * ever assert. The turn ends through the ordinary stream (`prompt.ended`), and that is the
 * only authority for "stopped". If nothing arrives within the window, say so — do not hold
 * `[ HALTING ]` open forever, which would be the same false success the HTTP `abort` returned
 * (an unconditional `true`, F2).
 */
const CANCEL_CONFIRM_WINDOW_MS = 10_000;

/** The request id of the turn currently awaiting its `session/prompt` response, if any. */
const pendingPromptId = (): number | undefined => {
  for (const [id, entry] of pending) if (entry.method === "session/prompt") return id;
  return undefined;
};

ui.onHalt(() => {
  if (!engineReady("HALT")) return;
  const sessionId = view.sessionId;
  if (sessionId === undefined || facts.busy !== true) {
    patch({ lastError: "HALT needs a running turn — none is in flight", phaseNote: "没有在跑的轮次 · 中止无效" });
    return;
  }
  const turnId = pendingPromptId();
  patch({ phase: "中止中", phaseNote: `已发出 session/cancel · ${sessionId.slice(0, 12)}…` });
  void transport.write(cancelNotificationLine(sessionId))
    .catch((error: unknown) => {
      patch({ lastError: String(error).slice(0, 160), phase: "运行中", phaseNote: "中止没发出去 · 再按一次，或「重启」" });
    });

  // Watchdog: if the turn we asked to cancel is still unanswered when the window closes, the
  // interrupt did not take. Report it; `prompt.ended` clears the suspicion when it does land.
  setTimeout(() => {
    const unconfirmed = facts.busy === true && pendingPromptId() === turnId;
    if (unconfirmed) {
      patch({
        lastError: `no turn end within ${CANCEL_CONFIRM_WINDOW_MS / 1000}s after session/cancel — engine may still be running`,
        phaseNote: "10 秒内没收到本轮结束 · 再按「中止」，或「重启」",
      });
    }
  }, CANCEL_CONFIRM_WINDOW_MS);
});

ui.onOptionChange((optionId, value) => {
  if (view.sessionId === undefined) {
    patch({ lastError: "option change needs an open session" });
    return;
  }
  // Optimistic: mode/model chips must move on click even if the response is slow or omits options.
  view = {
    ...view,
    options: view.options.map((option) => (option.id === optionId ? { ...option, currentValue: value } : option)),
  };
  ui.render(view);
  // Rule 9: a different model has a different cadence, so its samples are not evidence.
  if (optionId === "model") cadence = discardSamples(cadence);
  send("session/set_config_option", { sessionId: view.sessionId, configId: optionId, value });
});

// The clock is the only thing allowed to change the anchor while nothing is streaming.
let elapsed = 0;
setInterval(() => {
  if (facts.sessionId !== undefined) {
    elapsed += 1;
    patch({ elapsedSeconds: elapsed, ...silenceNow() });
  }
}, 1000);

ui.render(view);
ui.setView("process");
patch({});
void handshake().catch((error: unknown) => {
  ui.setLink("down");
  patch({ phase: "出错", phaseNote: "握手失败", lastError: String(error).slice(0, 160) });
});

export {};