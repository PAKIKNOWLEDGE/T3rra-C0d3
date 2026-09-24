/**
 * Boot: connect the byte channel, perform the ACP handshake, send an instruction, and feed
 * every line through the adapter into the view.
 *
 * Request/response bookkeeping lives here (the adapter maps notifications; "which request was
 * this response for" is ours). Client capabilities are sent EMPTY on purpose: the captured
 * traces show that declaring nothing is what keeps this frontend inert — the engine then never
 * asks us for a filesystem, a terminal, or permission.
 *
 * The stage title is the operator's *own instruction* — the one fact about "what is happening"
 * that we actually hold (rules-inherited §四: the stage owns the task topic; the tool stream
 * lives in the feed). Before the first instruction it says so, rather than inventing a topic.
 */

import { translateLine } from "./engine/acp.ts";
import { mapResponse } from "./engine/responses.ts";
import { deleteSession } from "./engine/engine-http.ts";
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
  phase: "[ STARTING ]",
  phaseNote: "BYTES ONLY · NO ENGINE YET",
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
/** Target of an in-flight session/load — the response may omit sessionId. */
let pendingLoadId: string | undefined;
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
    case "permission.requested": return event.summary;
    case "prompt.ended": return `stop reason ${event.stopReason}`;
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

const apply = (events: readonly AgentEvent[]): void => {
  logEvents(events);
  const now = Date.now();
  for (const event of events) {
    view = reduceView(view, event, now);
    const phase = phaseOf(event);
    if (phase !== null) cadence = observeActivity(cadence, phase, now, event.kind);
    if (event.kind === "prompt.ended") cadence = endTurn(cadence);
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
const handleResponse = (id: number, method: string, result: unknown): boolean => {
  let mapping = mapResponse(method, result);
  if (method === "session/load") {
    // Replay can arrive with no sessionId on the response; the operator asked for pendingLoadId.
    const openId = mapping.sessionId ?? pendingLoadId;
    pendingLoadId = undefined;
    if (openId !== undefined) {
      const events = [...mapping.events];
      if (!events.some((event) => event.kind === "session.opened")) {
        events.push({
          kind: "session.opened",
          from: { method: "session/load.response", variant: undefined },
          sessionId: openId,
        });
      }
      mapping = { ...mapping, sessionId: openId, events };
    }
  }
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
      phase: "[ READY ]",
      phaseNote: "AWAITING INSTRUCTION · SESSION OPEN",
    });
    ui.setCommandEnabled(true);
    ui.setPlaceholder("AWAITING COMMAND");
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
      phase: "[ RUNNING ]",
      phaseNote: "STREAMING · INTERRUPT NOT AVAILABLE OVER ACP (session/cancel: METHOD NOT FOUND)",
      ...silenceNow(),
    });
    send("session/prompt", { sessionId: view.sessionId, prompt: [{ type: "text", text }] });
  }
  for (const event of mapping.events) {
    if (event.kind === "prompt.ended") {
      patch({ busy: false, phase: "[ READY ]", phaseNote: `TURN ENDED · ${event.stopReason.toUpperCase()}` });
      patch(silenceNow());
    }
  }
  return mapping.recognised;
};

const handleLine = (line: string): void => {
  let id: number | undefined;
  let method: string | undefined;
  let parsed: { id?: number; result?: unknown; error?: unknown } | undefined;
  try {
    parsed = JSON.parse(line) as typeof parsed;
    if (parsed !== undefined && typeof parsed.id === "number" && pending.has(parsed.id)) {
      id = parsed.id;
      method = pending.get(parsed.id)?.method;
      pending.delete(parsed.id);
      if (parsed.error !== undefined) patch({ lastError: JSON.stringify(parsed.error).slice(0, 160) });
    }
  } catch {
    // not JSON — the adapter counts it as unmapped, which is the honest outcome
  }
  if (id !== undefined && method !== undefined && parsed !== undefined && handleResponse(id, method, parsed.result)) return;
  apply(translateLine(line).events);

};

const handshake = async (): Promise<void> => {
  const probe = await transport.probe();
  patch({ binary: probe.binary ?? "NOT FOUND", cwd: probe.cwd ?? "NOT STATED" });
  if (probe.binary === null) {
    patch({ phase: "[ NO ENGINE ]", phaseNote: "SET T3RRA_ENGINE_BIN OR PUT OPENCODE ON PATH" });
    ui.setPlaceholder("ENGINE NOT FOUND · SET T3RRA_ENGINE_BIN");
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
  ui.setPlaceholder("PICK A SESSION · + NEW · OR TYPE TO OPEN ONE");
  patch({ phase: "[ READY ]", phaseNote: "ENGINE UP · NO SESSION UNTIL YOU ASK" });
};

transport.onLine(handleLine);
transport.onExit((info) => {
  ui.setLink("down");
  patch({ busy: false, phase: "[ ENGINE EXITED ]", phaseNote: "LINK DOWN · PRESS RESTART", exit: `code ${info.code ?? "—"} · signal ${info.signal ?? "—"}` });
  ui.setCommandEnabled(false);
  apply([{ kind: "engine.exited", from: { method: "process", variant: undefined }, code: info.code, signal: info.signal }]);
});
transport.onError((message) => {
  patch({ lastError: message.slice(0, 160) });
  apply([{ kind: "engine.stderr", from: { method: "stderr", variant: undefined }, text: message }]);
});

let currentView: "process" | "events" = "process";
ui.onViewChange((next) => {
  currentView = next;
  ui.setView(next);
  if (next === "events") ui.renderEvents(eventLog);
});

/** `＋ NEW`: a fresh session in the same engine. The response handler takes it from there. */
ui.onNewSession(() => {
  if (facts.binary === undefined) return;
  patch({ phase: "[ OPENING SESSION ]", phaseNote: "NEW SESSION REQUESTED", busy: false });
  ui.setView("process");
  send("session/new", { cwd: facts.cwd ?? ".", mcpServers: [] });
});

ui.onSessionsRefresh(() => {
  refreshSessions();
});

ui.onSessionLoad((sessionId, cwd) => {
  if (facts.binary === undefined) return;
  pendingLoadId = sessionId;
  // Move the current-session rail immediately so the marker does not wait on the response.
  if (view.sessionId !== sessionId) {
    const sessions = view.sessions;
    view = { ...emptyView(), sessions, sessionId };
    ui.render(view);
  }
  patch({
    sessionId,
    phase: "[ LOADING ]",
    phaseNote: `session/load ${sessionId.slice(0, 12)}…`,
    busy: false,
    topic: undefined,
  });
  ui.setView("process");
  ui.setCommandEnabled(false);
  ui.setPlaceholder("REPLAYING HISTORY");
  send("session/load", {
    sessionId,
    cwd: cwd === "" ? facts.cwd ?? "." : cwd,
    mcpServers: [],
  });
});

ui.onSessionDelete((sessionId) => {
  if (facts.binary === undefined) return;
  patch({ phase: "[ DELETING ]", phaseNote: `DELETE session ${sessionId.slice(0, 12)}…` });
  void deleteSession((method, path, body) => transport.http(method, path, body), sessionId)
    .then((result) => {
      if (result.status >= 400) {
        patch({ lastError: `delete failed: HTTP ${result.status}`.slice(0, 160), phase: "[ READY ]", phaseNote: "DELETE FAILED" });
        return;
      }
      apply([
        {
          kind: "sessions.removed",
          from: { method: "http.delete.response", variant: undefined },
          sessionId,
        },
      ]);
      patch({ phase: "[ READY ]", phaseNote: `DELETED ${sessionId.slice(0, 12)}…` });
      if (view.sessionId === sessionId) {
        // Open session is gone — do not auto-create another (that was the junk-session bug).
        const sessions = view.sessions.filter((item) => item.sessionId !== sessionId);
        view = { ...emptyView(), sessions };
        patch({ sessionId: undefined, topic: undefined, phase: "[ READY ]", phaseNote: "SESSION DELETED · PICK ANOTHER OR + NEW" });
        ui.setCommandEnabled(true);
        ui.setPlaceholder("PICK A SESSION · + NEW · OR TYPE TO OPEN ONE");
      }
      refreshSessions();
    })
    .catch((error: unknown) => {
      patch({ lastError: String(error).slice(0, 160), phase: "[ READY ]", phaseNote: "DELETE FAILED" });
    });
});

ui.onSubmit((text) => {
  if (view.sessionId === undefined) {
    if (facts.binary === undefined) return;
    // No session yet: create one, then send this instruction when the open lands.
    queuedPrompt = text;
    ui.setPlaceholder("OPENING SESSION FOR INSTRUCTION");
    patch({ phase: "[ OPENING SESSION ]", phaseNote: "NEW SESSION FOR FIRST INSTRUCTION", busy: false });
    send("session/new", { cwd: facts.cwd ?? ".", mcpServers: [] });
    return;
  }
  // The operator's own line is a fact of the operator, not a claim about the runtime.
  apply([{ kind: "message.appended", from: { method: "operator", variant: undefined }, role: "user", messageId: `local-${nextId}`, text }]);
  // Stage title = a short task theme, never the whole instruction (a long prompt in h1
  // blows the stage open and pushes the feed off-screen). Full text lives in the stream.
  if (facts.topic === undefined) patch({ topic: shortTopic(text) });
  cadence = beginWaiting(cadence, Date.now());
  patch({ busy: true, phase: "[ RUNNING ]", phaseNote: "STREAMING · INTERRUPT NOT AVAILABLE OVER ACP (session/cancel: METHOD NOT FOUND)", ...silenceNow() });
  send("session/prompt", { sessionId: view.sessionId, prompt: [{ type: "text", text }] });
});

ui.onRestart(() => {
  view = emptyView();
  facts = { phase: "[ RESTARTING ]", phaseNote: "KILLING THE ENGINE PROCESS" };
  patch({ busy: false, sessionId: undefined, topic: undefined });
  ui.setCommandEnabled(false);
  ui.setPlaceholder("RESTARTING ENGINE");
  void transport
    .kill()
    .then(handshake)
    .catch((error: unknown) => patch({ lastError: String(error).slice(0, 160) }));
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
  if (facts.sessionId === undefined) return;
  elapsed += 1;
  patch({ elapsedSeconds: elapsed, ...silenceNow() });
}, 1000);

ui.render(view);
ui.setView("process");
patch({});
void handshake().catch((error: unknown) => {
  ui.setLink("down");
  patch({ phase: "[ ERROR ]", phaseNote: "HANDSHAKE FAILED", lastError: String(error).slice(0, 160) });
});

export {};