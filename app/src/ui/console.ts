/**
 * The renderer. Reads a `ConsoleView` plus a small set of *real* session facts, and nothing
 * else (rules §一.1) — no wire objects, no engine knowledge.
 *
 * Visual language: ARK family of the 3NDM1N15T4T0R design language (docs/design.md). Every
 * component of the gold-standard specimen is mapped to a real fact here; where the specimen
 * showed a number we do not have (context ring, diff counts, plan), nothing is drawn.
 *
 * What it will NOT do, on purpose:
 *  - invent a number: counts are counted from the stream, times come from the clock, and the
 *    silence report (×8 / ×25 from cadence.ts) is shown only once it is established;
 *  - build a control it cannot honour: mode/model/effort come from the runtime's own list,
 *    work-order cards expose only fields the contract really carries, and
 *    the input stays disabled until the engine is up.
 */

import type { ConsoleView, StreamEntry } from "../view/derive.ts";
import type { SessionSummary } from "../contract/events.ts";
import { toSeconds, type SilenceReport } from "../view/cadence.ts";
import { renderMarkdown } from "./markdown.ts";
import { groupTurns } from "./turns.ts";

const need = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`console shell is missing #${id}`);
  return node as T;
};

/** One line of the raw event log: the EVENTS view shows translated events, verbatim. */
export interface EventLogEntry {
  readonly at: string;
  readonly kind: string;
  readonly detail: string;
}

/** Facts about the run that come from the process and the clock, not from the event stream. */
export interface SessionFacts {
  readonly engine?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly topic?: string | undefined;
  readonly binary?: string | undefined;
  readonly cwd?: string | undefined;
  readonly permissionEdit?: "default" | "ask" | "allow" | "deny" | undefined;
  readonly exit?: string | undefined;
  readonly lastError?: string | undefined;
  readonly elapsedSeconds?: number | undefined;
  readonly silence?: SilenceReport | undefined;
  readonly phase?: string | undefined;
  readonly phaseNote?: string | undefined;
  readonly busy?: boolean | undefined;
}

export interface ConsoleHandles {
  onSubmit(handler: (text: string) => void): void;
  onRestart(handler: () => void): void;
  onHalt(handler: () => void): void;
  onOptionChange(handler: (optionId: string, value: string) => void): void;
  onViewChange(handler: (view: "process" | "events") => void): void;
  onNewSession(handler: () => void): void;
  onSessionCreate(handler: () => void): void;
  onSessionsRefresh(handler: () => void): void;
  onCwdApply(handler: (cwd: string) => void): void;
  onCwdBrowse(handler: () => void): void;
  onPermissionPolicyChange(handler: (policy: "default" | "ask" | "allow" | "deny") => void): void;
  setCwdInput(value: string): void;
  setPermissionPolicy(value: "default" | "ask" | "allow" | "deny"): void;
  onSessionLoad(handler: (sessionId: string, cwd: string) => void): void;
  onSessionDelete(handler: (sessionId: string) => void): void;
  onPermissionSelect(handler: (requestId: string, optionId: string) => void): void;
  setView(view: "process" | "events"): void;
  renderEvents(entries: readonly EventLogEntry[]): void;
  setLink(state: "ok" | "down"): void;
  setFacts(facts: SessionFacts): void;
  setPlaceholder(text: string): void;
  setCommandEnabled(enabled: boolean): void;
  render(view: ConsoleView): void;
}

/** Engine-declared tool kind → card category. The kind is the engine's claim, shown verbatim
 *  on the card; the colour only repeats that claim (acp.ts: kind is not trustworthy as a
 *  *title*, which is why the title stays the card's name). */
const KIND: Readonly<Record<string, { readonly cls: string; readonly zh: string; readonly icon: string }>> = {
  execute: { cls: "k-exec", zh: "终端", icon: "i-term" },
  read: { cls: "k-read", zh: "读取", icon: "i-read" },
  search: { cls: "k-read", zh: "搜索", icon: "i-read" },
  fetch: { cls: "k-read", zh: "抓取", icon: "i-read" },
  edit: { cls: "k-edit", zh: "编辑", icon: "i-edit" },
  delete: { cls: "k-edit", zh: "删除", icon: "i-edit" },
  move: { cls: "k-edit", zh: "移动", icon: "i-edit" },
  think: { cls: "k-other", zh: "思考", icon: "i-think" },
};
const kindOf = (hint: string): { readonly cls: string; readonly zh: string; readonly icon: string } =>
  KIND[hint.toLowerCase()] ?? { cls: "k-other", zh: "工具", icon: "i-tool" };

type ToolState = "run" | "done" | "fail" | "other";
const toolState = (status: string): ToolState => {
  if (/fail|error|reject|cancel/i.test(status)) return "fail";
  if (/complete|success|done/i.test(status)) return "done";
  if (/run|pending|progress/i.test(status) || status === "") return "run";
  return "other";
};

const LEVEL_ZH: Readonly<Record<string, string>> = { nominal: "正常", slow: "偏慢", stalled: "停滞" };

const pad2 = (n: number): string => String(n).padStart(2, "0");
const clock = (seconds: number): string => `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const icon = (id: string, className = "i"): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
};

export const mountConsole = (): ConsoleHandles => {
  const root = document.documentElement;
  const pageTitle = need("pageTitle");
  const pageTitleZh = need("pageTitleZh");
  const sessionCode = need("sessionCode");
  const topic = need("topic");
  const resOrders = need("resOrders");
  const resTime = need("resTime");
  const resContextRing = need("resContextRing");
  const resContextPct = need("resContextPct");
  const resContextUsed = need("resContextUsed");
  const engine = need("engine");
  const linkLabel = need("linkLabel");
  const metaModel = need("metaModel");
  const phase = need("phase");
  const phaseNote = need("phaseNote");
  const stream = need("stream");
  const options = need("options");
  const modes = need("modes");
  const tools = need("tools");
  const sessionsList = need("sessionsList");
  const sessionsCount = need("sessionsCount");
  const sessionsRefresh = need<HTMLButtonElement>("sessionsRefresh");
  const approvalBar = need("approvalBar");
  const approvalSummary = need("approvalSummary");
  const approvalActions = need("approvalActions");
  const approvalWait = need("approvalWait");
  const approvalId = need("approvalId");
  const statPrompts = need("statPrompts");
  const statReplies = need("statReplies");
  const statTools = need("statTools");
  const statThoughts = need("statThoughts");
  const pSession = need("pSession");
  const pStarted = need("pStarted");
  const pStop = need("pStop");
  const pPermission = need("pPermission");
  const pBinary = need("pBinary");
  const pCwd = need("pCwd");
  const cwdInput = need<HTMLInputElement>("cwdInput");
  const cwdApply = need<HTMLButtonElement>("cwdApply");
  const cwdBrowse = need<HTMLButtonElement>("cwdBrowse");
  const permissionPolicy = need<HTMLSelectElement>("permissionPolicy");
  const pExit = need("pExit");
  const pLastError = need("pLastError");
  const pUnmapped = need("pUnmapped");
  const pProvenance = need("pProvenance");
  const sLevel = need("sLevel");
  const sQuiet = need("sQuiet");
  const sBaseline = need("sBaseline");
  const sSamples = need("sSamples");
  const sThresholds = need("sThresholds");
  const sLastSign = need("sLastSign");
  const processView = need("processView");
  const eventsView = need("eventsView");
  const eventsList = need("eventsList");
  const viewProcessButton = need<HTMLButtonElement>("viewProcess");
  const viewEventsButton = need<HTMLButtonElement>("viewEvents");
  const newSessionButton = need<HTMLButtonElement>("newSession");
  const transportPanel = need("transportPanel");
  const infoToggle = need<HTMLButtonElement>("infoToggle");
  const input = need<HTMLTextAreaElement>("promptInput");
  const submit = need<HTMLButtonElement>("promptSubmit");
  const halt = need<HTMLButtonElement>("halt");
  const restart = need<HTMLButtonElement>("restart");
  const toolInspector = need("toolInspector");
  const toolInspectorClose = need<HTMLButtonElement>("toolInspectorClose");
  const toolInspectorKind = need("toolInspectorKind");
  const toolInspectorTitle = need("toolInspectorTitle");
  const toolInspectorStatus = need("toolInspectorStatus");
  const toolInspectorId = need("toolInspectorId");
  const toolInspectorBody = need("toolInspectorBody");

  let optionHandler: (optionId: string, value: string) => void = () => {};
  let sessionLoadHandler: (sessionId: string, cwd: string) => void = () => {};
  let sessionDeleteHandler: (sessionId: string) => void = () => {};
  /** Set by `onSessionCreate`; the empty states' CREATE buttons reuse this one action. */
  let sessionCreateHandler: () => void = () => {};
  /** Set by `onSessionsRefresh`; reused by the RETRY button the failed-list state creates. */
  let sessionsRefreshHandler: () => void = () => {};
  let permissionSelectHandler: (requestId: string, optionId: string) => void = () => {};
  let optionSignature = "";
  let sessionSignature = "";
  let permissionSignature = "";
  let haltHandler: (() => void) | undefined;
  let facts: SessionFacts = {};
  let lastView: ConsoleView | undefined;
  /** When the pending approval first reached the screen — the clock behind 「已等待」. */
  let permissionSince: number | undefined;
  /**
   * Turn outcome, per turn. `stopReason` / `promptError` persist in the view across turns, so
   * a banner keyed on them alone would show last turn's halt under this turn. We snapshot both
   * when a turn starts and only speak about values that changed since.
   */
  let outcomeBaseline: { stop: string | undefined; error: string | undefined } | undefined;
  /** Thought blocks the operator collapsed — keyed by stream key, survives re-render. */
  const collapsedThoughts = new Set<string>();
  /** One floating inspector is open at a time, keyed by the engine's stable tool call id. */
  let openToolId: string | undefined;

  const formatStamp = (atMs: number): string => {
    if (atMs <= 0) return "";
    const date = new Date(atMs);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  };

  /**
   * Options are rendered by what the runtime says they are, not by an id whitelist:
   *   - `category === "mode"` is a small closed set that decides how the instruction is read,
   *     so it becomes the dock's linked segment buttons (next to the prompt, where it matters);
   *   - everything else (`model`, `effort`, …) is a setting and stays in the right column.
   */
  const renderOptions = (view: ConsoleView): void => {
    const signature = view.options.map((option) => `${option.category}/${option.id}=${option.currentValue}`).join("|");
    if (signature === optionSignature) return;
    optionSignature = signature;

    const modality = view.options.filter((option) => option.category === "mode");
    const settings = view.options.filter((option) => option.category !== "mode");

    modes.replaceChildren();
    for (const option of modality) {
      option.choices.forEach((choice, index) => {
        if (index > 0) modes.append(el("i"));
        const chip = el("button", undefined, choice.name === "" ? choice.value : choice.name);
        chip.type = "button";
        chip.setAttribute("aria-pressed", String(choice.value === option.currentValue));
        chip.addEventListener("click", () => optionHandler(option.id, choice.value));
        modes.append(chip);
      });
    }

    options.replaceChildren();
    if (settings.length === 0) {
      options.append(el("div", "empty", "引擎尚未声明"));
      return;
    }
    for (const option of settings) {
      const label = el("label");
      const caption = el("span", undefined, `${option.name} · ${option.category}`);
      const select = el("select");
      select.setAttribute("aria-label", option.name);
      for (const choice of option.choices) {
        const node = el("option", undefined, choice.name);
        node.value = choice.value;
        if (choice.value === option.currentValue) node.selected = true;
        select.append(node);
      }
      select.addEventListener("change", () => optionHandler(option.id, select.value));
      label.append(caption, select);
      options.append(label);
    }
  };

  const stateText = (status: string, state: ToolState): string => {
    if (state === "done") return "完成";
    if (state === "fail") return `失败 · ${status}`;
    if (state === "run") return facts.busy === true ? "运行中" : "未收到结束";
    return status;
  };

  const durationText = (durationMs: number): string => {
    if (!Number.isFinite(durationMs) || durationMs < 0) return "未报告";
    if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
  };

  const detailText = (value: string | undefined): string => value === undefined || value === "" ? "未报告" : value;

  const detailRow = (label: string, value: string): HTMLElement => {
    const row = el("div", "row");
    row.append(el("span", "k", label), el("span", "v", value));
    return row;
  };

  const closeToolInspector = (): void => {
    openToolId = undefined;
    root.dataset["toolOpen"] = "false";
    toolInspector.setAttribute("aria-hidden", "true");
    toolInspectorBody.replaceChildren(el("div", "empty", "点击工单卡查看引擎报告的详情"));
  };

  const renderToolInspector = (view: ConsoleView | undefined): void => {
    const entry = view?.stream.find((item): item is Extract<StreamEntry, { type: "tool" }> => item.type === "tool" && item.toolCallId === openToolId);
    if (entry === undefined) {
      closeToolInspector();
      return;
    }
    const state = toolState(entry.status);
    const kind = kindOf(entry.hint);
    const accent = state === "fail" ? "var(--red)" : kind.cls === "k-exec" ? "var(--yellow)" : kind.cls === "k-read" ? "var(--cyan)" : kind.cls === "k-edit" ? "var(--lime)" : "var(--gray-k)";
    toolInspector.style.setProperty("--inspector-k", accent);
    toolInspectorKind.textContent = entry.hint === "" ? "TOOL" : entry.hint.toUpperCase();
    toolInspectorTitle.textContent = entry.title === "" ? "（无标题工具）" : entry.title;
    toolInspectorStatus.textContent = stateText(entry.status, state);
    toolInspectorId.textContent = entry.toolCallId;
    toolInspectorBody.replaceChildren();
    const locations = entry.details.locations.join("\n");
    const hasDetails = locations !== "" || entry.details.input !== undefined || entry.details.output !== undefined || entry.details.error !== undefined;
    if (!hasDetails) {
      toolInspectorBody.append(el("div", "empty", "引擎未报告更多过程"));
    } else {
      toolInspectorBody.append(
        detailRow("目标", detailText(locations)),
        detailRow("参数", detailText(entry.details.input)),
        detailRow("状态", detailText(entry.status)),
        detailRow("耗时", durationText(entry.durationMs)),
        detailRow("输出", detailText(entry.details.output)),
        detailRow("错误", detailText(entry.details.error)),
      );
    }
    root.dataset["toolOpen"] = "true";
    toolInspector.setAttribute("aria-hidden", "false");
  };

  /** Right-column index of every work order in the session. */
  const renderTools = (view: ConsoleView): void => {
    tools.replaceChildren();
    if (view.tools.length === 0) {
      tools.append(el("li", "none", "还没有工单"));
      return;
    }
    view.tools.forEach((tool, index) => {
      const state = toolState(tool.status);
      const kind = kindOf(tool.hint);
      const row = el("li", state === "fail" ? "k-fail" : kind.cls);
      row.append(
        el("span", "no", pad2(index + 1)),
        el("span", "p", tool.title === "" ? "（无标题工具）" : tool.title),
        el("span", "s", stateText(tool.status, state)),
      );
      tools.append(row);
    });
  };

  /** One work order = one base-station card (DESIGN-LANGUAGE §5.2). Click opens only real
   *  fields reported by the engine; absence stays visible instead of being filled with guesses. */
  const renderStation = (entry: Extract<StreamEntry, { type: "tool" }>, ordinal: number): HTMLElement => {
    const state = toolState(entry.status);
    const kind = kindOf(entry.hint);
    const card = el("button", `st ${state === "fail" ? "k-fail" : kind.cls}${state === "run" ? " is-run" : ""}`);
    card.type = "button";
    const expanded = openToolId === entry.toolCallId;
    card.setAttribute("aria-expanded", String(expanded));
    card.setAttribute("aria-label", `${entry.title === "" ? "工具" : entry.title} · ${expanded ? "收起详情" : "展开详情"}`);
    card.append(icon(kind.icon, "i wm"));
    const name = el("span", "nm");
    const bars = el("span", "bars");
    bars.append(el("i"), el("i"), el("i"));
    name.append(el("span", "tx", entry.title === "" ? "（无标题工具）" : entry.title), bars);
    const status = el("span", "ss", stateText(entry.status, state));
    if (state === "run" && facts.busy === true) {
      const arrows = el("span", "arr");
      arrows.append(el("i", undefined, "▶"), el("i", undefined, "▶"), el("i", undefined, "▶"));
      status.append(arrows);
    }
    const declared = el("span", "en kd", `${kind.zh} · ${entry.hint === "" ? "kind 未声明" : entry.hint} · ${formatStamp(entry.atMs)}`);
    const number = el("span", "n");
    number.append(el("small", undefined, "#"), document.createTextNode(pad2(ordinal)));
    card.append(name, status, declared, number, el("span", "open-mark", expanded ? "‹" : "›"));
    card.addEventListener("click", () => {
      if (openToolId === entry.toolCallId) closeToolInspector();
      else openToolId = entry.toolCallId;
      if (lastView !== undefined) {
        renderStream(lastView);
        renderToolInspector(lastView);
      }
    });
    return card;
  };

  const renderMessage = (entry: Extract<StreamEntry, { type: "message" | "user" | "thought" }>, ordinal: number): HTMLElement => {
    if (entry.type === "user") {
      const article = el("article", "msg order");
      const header = el("header");
      const stamp = el("span", "seg2");
      stamp.append(el("span", "a", "已发出"), el("span", "b", formatStamp(entry.atMs) || "—"));
      header.append(el("span", "tag-black", `指令 ${pad2(ordinal)}`), el("span", "spacer"), stamp);
      article.append(header, el("div", "body", entry.text));
      return article;
    }

    if (entry.type === "thought") {
      const article = el("article", "msg thought");
      const toggle = el("button", "thought-toggle");
      toggle.type = "button";
      const open = !collapsedThoughts.has(entry.key);
      toggle.setAttribute("aria-expanded", String(open));
      const chevron = el("span", "chev", open ? "▾ 收起" : "▸ 展开");
      toggle.append(el("span", "chip-light", "思考"), el("span", "en", `Reasoning · ${entry.text.length} 字`), chevron, el("span", "spacer"));
      const time = el("time", undefined, formatStamp(entry.atMs));
      toggle.append(time);
      const body = el("div", "body prose");
      body.hidden = !open;
      body.append(renderMarkdown(entry.text));
      toggle.addEventListener("click", () => {
        const nowCollapsed = !collapsedThoughts.has(entry.key);
        if (nowCollapsed) collapsedThoughts.add(entry.key);
        else collapsedThoughts.delete(entry.key);
        toggle.setAttribute("aria-expanded", String(!nowCollapsed));
        body.hidden = nowCollapsed;
        chevron.textContent = nowCollapsed ? "▸ 展开" : "▾ 收起";
      });
      const header = el("header");
      header.append(toggle);
      article.append(header, body);
      return article;
    }

    const article = el("article", "msg reply");
    const header = el("header");
    header.append(
      el("span", "chip-light", facts.engine ?? "引擎"),
      el("span", "en", "回复"),
      el("span", "spacer"),
      el("time", undefined, formatStamp(entry.atMs)),
    );
    const body = el("div", "body prose");
    body.append(renderMarkdown(entry.text));
    article.append(header, body);
    return article;
  };

  /** Consecutive tool entries of one turn become one 「工单」 section of station cards. */
  const renderWorks = (cards: readonly HTMLElement[], first: number, last: number): HTMLElement => {
    const section = el("section", "works");
    const cap = el("div", "cap");
    cap.append(
      el("span", "chip-sec", "工单"),
      el("span", "en", first === last ? `Work order · #${pad2(first)}` : `Work orders · #${pad2(first)}–#${pad2(last)}`),
      el("span", "line"),
    );
    const tiles = el("div", "tiles");
    tiles.append(...cards);
    section.append(cap, tiles);
    return section;
  };

  const createButton = (): HTMLButtonElement => {
    const button = el("button", "bluetile");
    button.type = "button";
    button.id = "streamCreate";
    button.append(el("span", "wm", "NEW"), document.createTextNode("新建会话"), icon("i-newsess"));
    button.addEventListener("click", () => sessionCreateHandler());
    return button;
  };

  /** Empty record: say what is true and offer the next step (AGENTS §五.4: no dead-end panel). */
  const renderVoid = (view: ConsoleView): HTMLElement => {
    const box = el("div", "void");
    if (view.sessionId === undefined) {
      box.append(
        el("div", "h", "还没有打开会话"),
        el("div", "p", "从左栏选一个会话继续，或者新建一个。也可以直接在下方输入指令，发送时会自动开一个新会话。"),
        createButton(),
      );
    } else {
      box.append(el("div", "h", "会话已打开"), el("div", "p", "这里还没有记录。在下方下达第一条指令。"));
    }
    return box;
  };

  /** What ended the turn, if this turn produced such a fact. Never carried over from a past turn. */
  const renderOutcome = (view: ConsoleView): HTMLElement | undefined => {
    if (facts.busy === true || outcomeBaseline === undefined) return undefined;
    if (view.promptError !== undefined && view.promptError !== outcomeBaseline.error) {
      const line = el("div", "haltline", "本轮失败");
      line.append(el("span", "en", view.promptError.slice(0, 160)));
      return line;
    }
    if (view.stopReason === "cancelled" && view.stopReason !== outcomeBaseline.stop) {
      const line = el("div", "haltline", "本轮已被你中止");
      line.append(el("span", "en", "引擎已确认 cancelled"));
      return line;
    }
    return undefined;
  };

  const renderStream = (view: ConsoleView): void => {
    const pinned = processView.scrollTop + processView.clientHeight >= processView.scrollHeight - 24;
    stream.replaceChildren();

    if (view.stream.length === 0) {
      stream.append(renderVoid(view));
    }

    let prompts = 0;
    let orders = 0;
    for (const turn of groupTurns(view.stream)) {
      let cards: HTMLElement[] = [];
      let first = 0;
      const flush = (): void => {
        if (cards.length === 0) return;
        stream.append(renderWorks(cards, first, orders));
        cards = [];
      };
      for (const entry of turn.items) {
        if (entry.type === "tool") {
          orders += 1;
          if (cards.length === 0) first = orders;
          cards.push(renderStation(entry, orders));
          continue;
        }
        flush();
        if (entry.type === "user") prompts += 1;
        stream.append(renderMessage(entry, prompts));
      }
      flush();
    }

    const outcome = renderOutcome(view);
    if (outcome !== undefined) stream.append(outcome);
    if (view.linkDown !== undefined) {
      const line = el("div", "haltline", "字节通道已断开");
      line.append(el("span", "en", `${view.linkDown} · 按右下「重启」恢复`));
      stream.append(line);
    }
    if (pinned) processView.scrollTop = processView.scrollHeight;
  };

  const renderCounts = (view: ConsoleView): void => {
    const count = (type: StreamEntry["type"]): number => view.stream.filter((entry) => entry.type === type).length;
    statPrompts.textContent = pad2(count("user"));
    statReplies.textContent = pad2(count("message"));
    statTools.textContent = pad2(count("tool"));
    statThoughts.textContent = pad2(count("thought"));
    resOrders.textContent = pad2(view.tools.length);
  };

  /** One session tile. The whole tile is the LOAD affordance; × is delete only. */
  const sessionRow = (item: SessionSummary, ordinal: number, view: ConsoleView): HTMLElement => {
    const isCurrent = item.sessionId === view.sessionId;
    const row = el("div", "sess tile");
    row.dataset["sessionId"] = item.sessionId;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", `打开会话 ${item.title !== "" ? item.title : item.sessionId}`);
    if (isCurrent) row.setAttribute("aria-current", "true");

    const waiting = isCurrent && view.permission !== undefined;
    if (waiting) {
      const corner = el("span", "corner");
      corner.setAttribute("aria-label", "等你批准");
      row.append(corner);
    }

    const title =
      item.title !== ""
        ? item.title
        : item.sessionId.length > 18
          ? `${item.sessionId.slice(0, 12)}…${item.sessionId.slice(-4)}`
          : item.sessionId;

    const meta = el("span", "m");
    if (isCurrent) {
      const [color, word] = waiting
        ? ["var(--orange)", "等你批准"]
        : facts.busy === true
          ? ["var(--yellow)", "运行中"]
          : ["var(--lime)", "已打开"];
      const pill = el("span", "pill-dark");
      const dot = el("i");
      dot.style.background = color;
      pill.append(dot, document.createTextNode(word));
      meta.append(pill);
    }
    meta.append(el("span", "d", item.updatedAt === "" ? "时间未告知" : item.updatedAt));

    const del = el("button", "del", "×");
    del.type = "button";
    del.setAttribute("aria-label", `删除会话 ${item.sessionId}`);
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      const label = item.title !== "" ? item.title : item.sessionId;
      if (window.confirm(`删除这个会话？\n${label}\n\n在这个界面里无法撤销。`)) sessionDeleteHandler(item.sessionId);
    });

    const load = (): void => {
      // Re-opening the same session replays it — still a real action, not a no-op.
      sessionLoadHandler(item.sessionId, item.cwd);
    };
    row.addEventListener("click", load);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        load();
      }
    });

    row.append(el("span", "no", pad2(ordinal)), el("span", "t", title), del, meta);
    return row;
  };

  const renderSessions = (view: ConsoleView): void => {
    const signature = [
      view.sessions.map((item) => `${item.sessionId}:${item.title}:${item.updatedAt}`).join("|"),
      view.sessionId ?? "",
      view.sessionsUnavailable ?? "",
      view.permission === undefined ? "" : "ask",
      facts.busy === true ? "busy" : "",
    ].join("#");
    if (signature === sessionSignature) return;
    sessionSignature = signature;

    sessionsCount.textContent = pad2(view.sessions.length);
    sessionsList.replaceChildren();
    // Newest first gets the highest number: the number is the tile's place in the list.
    const numbered = (): HTMLElement[] => view.sessions.map((item, index) => sessionRow(item, view.sessions.length - index, view));

    if (view.sessionsUnavailable !== undefined) {
      // A failed list is not an empty list: say "cannot tell", never "there are none" (audit F6),
      // keep the rows we still hold, and offer a way out.
      const failed = el("div", "empty bad");
      failed.append(el("span", undefined, `会话列表取不到：${view.sessionsUnavailable.slice(0, 80)}`));
      const retry = el("button", "mini go", "↻ 重新获取");
      retry.type = "button";
      retry.id = "sessionsRetry";
      retry.addEventListener("click", () => sessionsRefreshHandler());
      failed.append(retry);
      sessionsList.append(failed, ...numbered());
      return;
    }
    if (view.sessions.length === 0) {
      // Empty list must offer the recovery action here — a dead-end panel is a dead control.
      const empty = el("div", "empty");
      empty.append(el("span", undefined, "还没有会话"));
      const create = el("button", "mini go", "＋ 新建会话");
      create.type = "button";
      create.id = "sessionsCreate";
      create.addEventListener("click", () => sessionCreateHandler());
      empty.append(create);
      sessionsList.append(empty);
      return;
    }
    sessionsList.append(...numbered());
  };

  const renderWait = (): void => {
    approvalWait.textContent = permissionSince === undefined ? "00:00" : clock(Math.max(0, Math.floor((Date.now() - permissionSince) / 1000)));
  };

  const renderApproval = (view: ConsoleView): void => {
    const pending = view.permission;
    root.dataset["ask"] = pending === undefined ? "false" : "true";
    const signature =
      pending === undefined ? "none" : `${pending.requestId}#${pending.options.map((option) => option.optionId).join(",")}`;
    if (signature === permissionSignature) return;
    permissionSignature = signature;

    if (pending === undefined) {
      approvalBar.hidden = true;
      permissionSince = undefined;
      approvalSummary.textContent = "未告知";
      approvalId.textContent = "—";
      approvalActions.replaceChildren();
      return;
    }

    permissionSince = Date.now();
    renderWait();
    approvalBar.hidden = false;
    approvalSummary.textContent = pending.summary === "" ? "引擎没有给出摘要" : pending.summary;
    approvalId.textContent = pending.requestId;
    approvalActions.replaceChildren();
    // Render exactly the engine's options — no whitelist (rule: only what runtime declares).
    for (const option of pending.options) {
      const button = el("button");
      button.type = "button";
      const kind = option.kind.toLowerCase();
      if (kind.includes("reject") || kind.includes("deny")) button.className = "reject";
      else if (kind.includes("allow") && kind.includes("once")) button.className = "allow";
      if (button.className === "allow") {
        const ok = el("span", "ok");
        ok.append(icon("i-check"));
        button.append(ok);
      }
      button.append(document.createTextNode(option.name === "" ? option.optionId : option.name));
      button.addEventListener("click", () => permissionSelectHandler(pending.requestId, option.optionId));
      approvalActions.append(button);
    }
    processView.scrollTop = processView.scrollHeight;
  };

  const renderTitle = (view: ConsoleView | undefined): void => {
    const id = facts.sessionId;
    sessionCode.textContent = id === undefined ? "S-····" : `S-${id.slice(-4).toUpperCase()}`;
    const listed = view?.sessions.find((item) => item.sessionId === id)?.title;
    topic.textContent = facts.topic ?? (listed !== undefined && listed !== "" ? listed : id === undefined ? "未开会话" : "未命名会话");
  };

  const renderClock = (): void => {
    const seconds = facts.elapsedSeconds;
    resTime.textContent = seconds === undefined ? "--:--" : clock(seconds);
    renderWait();
  };

  const formatCount = (value: number): string => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
  const renderUsage = (view: ConsoleView): void => {
    const usage = view.usage;
    if (usage === undefined) {
      resContextRing.style.setProperty("--usage-pct", "0%");
      resContextPct.textContent = "--";
      resContextUsed.textContent = "未报告";
      resContextRing.setAttribute("aria-label", "上下文用量未报告");
      return;
    }
    const ratio = Math.max(0, Math.min(1, usage.used / usage.size));
    const percent = Math.round(ratio * 100);
    resContextRing.style.setProperty("--usage-pct", `${percent}%`);
    resContextPct.textContent = `${percent}%`;
    resContextUsed.textContent = `${formatCount(usage.used)} / ${formatCount(usage.size)}`;
    resContextRing.setAttribute("aria-label", `上下文用量 ${percent}%`);
  };

  const renderSignal = (): void => {
    const silence = facts.silence;
    const samples = silence?.samples ?? 0;
    const measured = silence !== undefined && silence.level !== "unmeasured";
    sLevel.textContent = measured ? LEVEL_ZH[silence.level] ?? silence.level : "未建立";
    const quiet = toSeconds(silence?.quietMs ?? null);
    sQuiet.textContent = quiet === null ? "—" : `${quiet}s`;
    sBaseline.textContent = silence?.baselineMs === null || silence?.baselineMs === undefined ? "—" : `${Math.round(silence.baselineMs)}ms`;
    sSamples.textContent = `${samples} / 3`;
    sThresholds.textContent =
      silence?.baselineMs === null || silence?.baselineMs === undefined
        ? "偏慢 ×8 · 停滞 ×25"
        : `偏慢 ${Math.round(silence.baselineMs * 8)}ms · 停滞 ${Math.round(silence.baselineMs * 25)}ms`;
    sLastSign.textContent = silence?.lastSignKind ?? "—";
  };

  // Diagnostics is pure presentation of what is already known, so it is wired here rather than
  // in main: it reveals the transport facts the everyday screen does not need.
  const syncExpert = (expert: boolean): void => {
    root.dataset["expert"] = expert ? "true" : "false";
    infoToggle.setAttribute("aria-pressed", String(expert));
    infoToggle.setAttribute("aria-label", expert ? "隐藏传输诊断" : "显示传输诊断");
    transportPanel.hidden = !expert;
  };
  infoToggle.addEventListener("click", () => syncExpert(infoToggle.getAttribute("aria-pressed") !== "true"));
  syncExpert(false);
  toolInspectorClose.addEventListener("click", closeToolInspector);
  root.dataset["toolOpen"] = "false";
  toolInspector.setAttribute("aria-hidden", "true");

  const applyView = (view: "process" | "events"): void => {
    root.dataset["view"] = view;
    processView.hidden = view !== "process";
    eventsView.hidden = view !== "events";
    viewProcessButton.setAttribute("aria-current", String(view === "process"));
    viewEventsButton.setAttribute("aria-current", String(view === "events"));
    pageTitle.textContent = view === "process" ? "RECORD" : "EVENTS";
    pageTitleZh.textContent = view === "process" ? "作业记录" : "事件日志";
  };

  const renderEventLog = (entries: readonly EventLogEntry[]): void => {
    const pinned = eventsView.scrollTop + eventsView.clientHeight >= eventsView.scrollHeight - 24;
    eventsList.replaceChildren();
    if (entries.length === 0) {
      const row = el("div", "evt");
      row.append(el("span", "at", "—"), el("span", "kind", "none"), el("span", "detail", "这个会话还没有事件"));
      eventsList.append(row);
      return;
    }
    for (const entry of entries) {
      const row = el("div", "evt");
      row.append(el("span", "at", entry.at), el("span", "kind", entry.kind), el("span", "detail", entry.detail));
      eventsList.append(row);
    }
    if (pinned) eventsView.scrollTop = eventsView.scrollHeight;
  };

  const syncBusy = (wasBusy: boolean): void => {
    const busy = facts.busy === true;
    root.dataset["busy"] = busy ? "true" : "false";
    // One slot, two faces: 「发送」 while idle, 「中止」 while a turn is in flight.
    submit.hidden = busy;
    halt.hidden = !busy;
    halt.disabled = !busy;
    if (busy && !wasBusy) {
      outcomeBaseline = { stop: lastView?.stopReason, error: lastView?.promptError };
    }
  };

  return {
    onViewChange(handler): void {
      viewProcessButton.addEventListener("click", () => handler("process"));
      viewEventsButton.addEventListener("click", () => handler("events"));
    },
    onNewSession(handler): void {
      newSessionButton.addEventListener("click", handler);
    },
    onSessionCreate(handler): void {
      sessionCreateHandler = handler;
    },
    onSessionsRefresh(handler): void {
      sessionsRefresh.addEventListener("click", handler);
      sessionsRefreshHandler = handler; // the failure-state RETRY reuses this one action
    },
    onCwdApply(handler): void {
      const fire = (): void => handler(cwdInput.value.trim());
      cwdApply.addEventListener("click", fire);
      cwdInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          fire();
        }
      });
    },
    onCwdBrowse(handler): void {
      cwdBrowse.addEventListener("click", handler);
    },
    onPermissionPolicyChange(handler): void {
      permissionPolicy.addEventListener("change", () => {
        const value = permissionPolicy.value;
        handler(value === "ask" || value === "allow" || value === "deny" ? value : "default");
      });
    },
    setCwdInput(value): void {
      cwdInput.value = value;
    },
    setPermissionPolicy(value): void {
      permissionPolicy.value = value;
    },
    onSessionLoad(handler): void {
      sessionLoadHandler = handler;
    },
    onSessionDelete(handler): void {
      sessionDeleteHandler = handler;
    },
    onPermissionSelect(handler): void {
      permissionSelectHandler = handler;
    },
    setView(view): void {
      applyView(view);
    },
    renderEvents(entries): void {
      renderEventLog(entries);
    },
    onSubmit(handler): void {
      const fire = (): void => {
        const text = input.value.trim();
        if (text === "") {
          input.focus();
          return;
        }
        input.value = "";
        handler(text);
      };
      submit.addEventListener("click", fire);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          fire();
        }
        // Esc in the command box interrupts the running turn — same path as 「中止」, so the
        // only observable outcome is the halt path's (action or visible error).
        if (event.key === "Escape" && facts.busy === true) {
          event.preventDefault();
          haltHandler?.();
        }
      });
    },
    onRestart(handler): void {
      restart.addEventListener("click", handler);
    },
    onHalt(handler): void {
      haltHandler = handler;
      halt.addEventListener("click", handler);
    },
    onOptionChange(handler): void {
      optionHandler = handler;
    },
    setLink(state): void {
      root.dataset["link"] = state;
      linkLabel.textContent = state === "ok" ? "已连接" : "未连接";
    },
    setFacts(next): void {
      const wasBusy = facts.busy === true;
      facts = { ...facts, ...next };
      if (next.engine !== undefined) engine.textContent = next.engine;
      if ("sessionId" in next) pSession.textContent = next.sessionId ?? "未告知";
      if (next.startedAt !== undefined) pStarted.textContent = next.startedAt;
      if (next.binary !== undefined) pBinary.textContent = next.binary === "NOT FOUND" ? "没找到" : next.binary;
      if (next.cwd !== undefined) pCwd.textContent = next.cwd === "NOT STATED" ? "未告知" : next.cwd;
      if (next.cwd !== undefined && document.activeElement !== cwdInput) cwdInput.value = next.cwd === "NOT STATED" ? "" : next.cwd;
      if (next.permissionEdit !== undefined && document.activeElement !== permissionPolicy) permissionPolicy.value = next.permissionEdit;
      if (next.exit !== undefined) pExit.textContent = next.exit;
      if (next.lastError !== undefined) pLastError.textContent = next.lastError;
      if (next.phase !== undefined) phase.textContent = next.phase;
      if (next.phaseNote !== undefined) phaseNote.textContent = next.phaseNote;
      syncBusy(wasBusy);
      renderTitle(lastView);
      renderClock();
      renderSignal();
      if (lastView !== undefined && "busy" in next && (next.busy === true) !== wasBusy) {
        // Busy flips the station cards' ▶▶▶ and the session pill; re-render from the last view.
        renderStream(lastView);
        renderSessions(lastView);
      }
    },
    setPlaceholder(text): void {
      input.placeholder = text;
    },
    setCommandEnabled(enabled): void {
      input.disabled = !enabled;
      submit.disabled = !enabled;
    },
    render(view): void {
      lastView = view;
      const model = view.options.find((option) => option.id === "model");
      const effort = view.options.find((option) => option.id === "effort");
      metaModel.textContent = model === undefined ? "模型未声明" : `${model.currentValue}${effort === undefined ? "" : ` · ${effort.currentValue}`}`;

      pStop.textContent = view.stopReason ?? "未报告";
      pPermission.textContent =
        view.permission !== undefined
          ? view.permission.summary === ""
            ? `等待中 · ${view.permission.requestId}`
            : view.permission.summary
          : "没有请求";
      pUnmapped.textContent = String(view.unmapped);
      pProvenance.textContent = Object.entries(view.from)
        .map(([block, kinds]) => `${block}:${kinds.length}`)
        .join(" · ");

      renderTitle(view);
      renderCounts(view);
      renderUsage(view);
      renderStream(view);
      renderToolInspector(view);
      renderTools(view);
      renderOptions(view);
      renderSessions(view);
      renderApproval(view);
    },
  };
};
