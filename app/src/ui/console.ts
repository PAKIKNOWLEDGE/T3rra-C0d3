/**
 * The renderer. Reads a `ConsoleView` plus a small set of *real* session facts, and nothing
 * else (rules-inherited §一.1) — no wire objects, no engine knowledge.
 *
 * What it will NOT do, on purpose:
 *  - invent a number: the anchor shows elapsed seconds from the clock; the silence judgement
 *    (×8 slow / ×25 stalled) is not implemented yet, so the comparison line says so out loud
 *    (`SILENCE NOT MEASURED`) instead of guessing at a plausible-looking verdict;
 *  - build a control it cannot honour: mode/model/effort come from the runtime's own list,
 *    and the input stays disabled until a session actually exists.
 */

import type { ConsoleView } from "../view/derive.ts";
import { toSeconds, type SilenceReport } from "../view/cadence.ts";

const need = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`console shell is missing #${id}`);
  return node as T;
};

/** Facts about the run that come from the process and the clock, not from the event stream. */
/** One line of the raw event log: the EVENTS view shows translated events, verbatim. */
export interface EventLogEntry {
  readonly at: string;
  readonly kind: string;
  readonly detail: string;
}

export interface SessionFacts {
  readonly engine?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly topic?: string | undefined;
  readonly binary?: string | undefined;
  readonly cwd?: string | undefined;
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
  onOptionChange(handler: (optionId: string, value: string) => void): void;
  onViewChange(handler: (view: "process" | "events") => void): void;
  onNewSession(handler: () => void): void;
  setView(view: "process" | "events"): void;
  renderEvents(entries: readonly EventLogEntry[]): void;
  setLink(state: "ok" | "down"): void;
  setFacts(facts: SessionFacts): void;
  setPlaceholder(text: string): void;
  setCommandEnabled(enabled: boolean): void;
  render(view: ConsoleView): void;
}

const escapeText = (text: string): string => text;

export const mountConsole = (): ConsoleHandles => {
  const engine = need("engine");
  const sessionId = need("sessionId");
  const linkLabel = need("linkLabel");
  const phase = need("phase");
  const phaseNote = need("phaseNote");
  const topic = need("topic");
  const hollowLine = need("hollowLine");
  const metaEngine = need("metaEngine");
  const metaModel = need("metaModel");
  const metaMode = need("metaMode");
  const anchorNum = need("anchorNum");
  const anchorUnit = need("anchorUnit");
  const verdict = need("verdict");
  const compare = need("compare");
  const stream = need("stream");
  const stamp = need("stamp");
  const options = need("options");
  const modes = need("modes");
  const tools = need("tools");
  const pSession = need("pSession");
  const pStarted = need("pStarted");
  const pStop = need("pStop");
  const pPermission = need("pPermission");
  const pBinary = need("pBinary");
  const pCwd = need("pCwd");
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
  const registerOperator = need<HTMLButtonElement>("regOperator");
  const registerExpert = need<HTMLButtonElement>("regExpert");
  const input = need<HTMLInputElement>("promptInput");
  const submit = need<HTMLButtonElement>("promptSubmit");
  const restart = need<HTMLButtonElement>("restart");

  let optionHandler: (optionId: string, value: string) => void = () => {};
  let optionSignature = "";
  let facts: SessionFacts = {};

  /**
   * Options are rendered by what the runtime says they are, not by an id whitelist:
   *   - `category === "mode"` is a small closed set that decides how the instruction is read,
   *     so it becomes the dock's paired chips (next to the prompt, where the mode matters);
   *   - everything else (`model`, `effort`, …) is a setting and stays in the dossier.
   * A dropdown for two choices would have been the app drifting away from the design.
   */
  const renderOptions = (view: ConsoleView): void => {
    const signature = view.options.map((option) => `${option.category}/${option.id}=${option.currentValue}`).join("|");
    if (signature === optionSignature) return;
    optionSignature = signature;

    const modality = view.options.filter((option) => option.category === "mode");
    const settings = view.options.filter((option) => option.category !== "mode");

    modes.replaceChildren();
    for (const option of modality) {
      for (const choice of option.choices) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.textContent = choice.name === "" ? choice.value : choice.name.toUpperCase();
        chip.setAttribute("aria-pressed", String(choice.value === option.currentValue));
        chip.addEventListener("click", () => optionHandler(option.id, choice.value));
        modes.append(chip);
      }
    }

    options.replaceChildren();
    if (settings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "NOT DECLARED YET";
      options.append(empty);
      return;
    }
    for (const option of settings) {
      const label = document.createElement("label");
      const caption = document.createElement("span");
      caption.className = "micro";
      caption.textContent = `${option.name} · ${option.category}`;
      const select = document.createElement("select");
      select.setAttribute("aria-label", option.name);
      for (const choice of option.choices) {
        const node = document.createElement("option");
        node.value = choice.value;
        node.textContent = choice.name;
        if (choice.value === option.currentValue) node.selected = true;
        select.append(node);
      }
      select.addEventListener("change", () => optionHandler(option.id, select.value));
      label.append(caption, select);
      options.append(label);
    }
  };

  const renderTools = (view: ConsoleView): void => {
    tools.replaceChildren();
    if (view.tools.length === 0) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<span class="k"><span class="diamond d-none">◇</span> none</span><span class="v">no tool call yet</span>';
      tools.append(row);
      return;
    }
    for (const tool of view.tools) {
      const done = /complete|success|done/i.test(tool.status);
      const row = document.createElement("div");
      row.className = "row hover";
      const key = document.createElement("span");
      key.className = "k";
      const diamond = document.createElement("span");
      diamond.className = `diamond ${done ? "d-done" : "d-run"}`;
      diamond.textContent = done ? "◆" : "◆";
      key.append(diamond, document.createTextNode(` ${escapeText(tool.title || "(untitled tool)")}`));
      const value = document.createElement("span");
      value.className = "v";
      value.textContent = `${tool.hint === "" ? "tool" : tool.hint} · ${tool.status === "" ? "NO STATUS" : tool.status}`;
      row.append(key, value);
      tools.append(row);
    }
  };

  const renderEntry = (type: "message" | "thought" | "user", text: string): HTMLElement => {
    const wrap = document.createElement("div");
    wrap.className = `entry ${type}`;
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = type === "thought" ? "reasoning" : type === "user" ? "operator" : "agent";
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = text;
    wrap.append(who, body);
    return wrap;
  };

  /**
   * The stage's anchor and verdict, derived only from what was measured.
   *  - busy with a baseline: the anchor is the quiet seconds and the verdict is the level;
   *  - busy without one: the seconds are still a fact, but the verdict says `Not Established`
   *    (rule 7: fewer than three samples means no judgement, and the hard limit is a backstop,
   *    never a measurement);
   *  - not busy: the anchor falls back to the session clock, and the comparison line says the
   *    silence is not measured at all, rather than pretending the session is stalling.
   */
  const renderStage = (): void => {
    const busy = facts.busy === true;
    const silence = facts.silence;
    if (!busy) {
      const seconds = facts.elapsedSeconds;
      anchorNum.textContent = seconds === undefined ? "—" : String(seconds);
      anchorUnit.textContent = seconds === undefined ? "" : "s";
      verdict.textContent = facts.sessionId === undefined ? "Idle" : "Ready";
      compare.textContent = "NO RUN IN FLIGHT · SILENCE NOT MEASURED";
      return;
    }
    const quiet = toSeconds(silence?.quietMs ?? null);
    anchorNum.textContent = quiet === null ? "—" : String(quiet);
    anchorUnit.textContent = quiet === null ? "" : "s";

    const samples = silence?.samples ?? 0;
    if (silence === undefined || silence.level === "unmeasured") {
      verdict.textContent = "Not Established";
      compare.textContent = [
        quiet === null ? "QUIET —" : `QUIET ${quiet}s`,
        `CADENCE NOT ESTABLISHED (${samples}/3 SAMPLES)`,
        silence?.backstopExceeded === true ? "HARD LIMIT EXCEEDED" : null,
      ]
        .filter((part) => part !== null)
        .join(" · ");
      return;
    }
    verdict.textContent = silence.level === "stalled" ? "Stalled" : silence.level === "slow" ? "Slow" : "Nominal";
    const baseline = silence.baselineMs === null ? "—" : `${Math.round(silence.baselineMs)}ms`;
    const ratio = silence.ratio === null ? "—" : `×${silence.ratio.toFixed(1)}`;
    compare.textContent = `QUIET ${quiet ?? "—"}s · USUALLY ${baseline} · ${ratio} (STALLS AT ×25)`;
  };

  const renderSignal = (): void => {
    const silence = facts.silence;
    const samples = silence?.samples ?? 0;
    sLevel.textContent = silence === undefined || silence.level === "unmeasured" ? "NOT ESTABLISHED" : silence.level.toUpperCase();
    sQuiet.textContent = silence?.quietMs === null || silence?.quietMs === undefined ? "—" : `${toSeconds(silence.quietMs)}s`;
    sBaseline.textContent = silence?.baselineMs === null || silence?.baselineMs === undefined ? "—" : `${Math.round(silence.baselineMs)}ms`;
    sSamples.textContent = `${samples} / 3`;
    sThresholds.textContent =
      silence?.baselineMs === null || silence?.baselineMs === undefined
        ? "SLOW ×8 · STALLED ×25"
        : `SLOW ${Math.round(silence.baselineMs * 8)}ms · STALLED ${Math.round(silence.baselineMs * 25)}ms`;
    sLastSign.textContent = silence?.lastSignKind ?? "—";
  };

  // The register is pure presentation of what is already known, so it is wired here rather
  // than in main: EXPERT reveals the transport facts that OPERATOR does not need.
  const syncRegister = (expert: boolean): void => {
    document.documentElement.dataset["expert"] = expert ? "true" : "false";
    registerOperator.setAttribute("aria-pressed", String(!expert));
    registerExpert.setAttribute("aria-pressed", String(expert));
    transportPanel.hidden = !expert;
  };
  registerOperator.addEventListener("click", () => syncRegister(false));
  registerExpert.addEventListener("click", () => syncRegister(true));
  syncRegister(false);

  const applyView = (view: "process" | "events"): void => {
    processView.hidden = view !== "process";
    eventsView.hidden = view !== "events";
    viewProcessButton.setAttribute("aria-current", String(view === "process"));
    viewEventsButton.setAttribute("aria-current", String(view === "events"));
  };

  const renderEventLog = (entries: readonly EventLogEntry[]): void => {
    const pinned = eventsView.scrollTop + eventsView.clientHeight >= eventsView.scrollHeight - 24;
    eventsList.replaceChildren();
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "row";
      const at = document.createElement("span");
      at.className = "at";
      at.textContent = "—";
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = "none";
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = "no event in this session yet";
      empty.append(at, kind, detail);
      eventsList.append(empty);
      return;
    }
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "row";
      const at = document.createElement("span");
      at.className = "at";
      at.textContent = entry.at;
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = entry.kind;
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = entry.detail;
      row.append(at, kind, detail);
      eventsList.append(row);
    }
    if (pinned) eventsView.scrollTop = eventsView.scrollHeight;
  };

  return {
    onViewChange(handler): void {
      viewProcessButton.addEventListener("click", () => handler("process"));
      viewEventsButton.addEventListener("click", () => handler("events"));
    },
    onNewSession(handler): void {
      newSessionButton.addEventListener("click", handler);
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
        if (text === "") return;
        input.value = "";
        handler(text);
      };
      submit.addEventListener("click", fire);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          fire();
        }
      });
    },
    onRestart(handler): void {
      restart.addEventListener("click", handler);
    },
    onOptionChange(handler): void {
      optionHandler = handler;
    },
    setLink(state): void {
      document.documentElement.dataset["link"] = state;
      linkLabel.textContent = state === "ok" ? "LINK OK" : "LINK DOWN";
    },
    setFacts(next): void {
      facts = { ...facts, ...next };
      if (next.engine !== undefined) {
        engine.textContent = next.engine;
        metaEngine.textContent = next.engine;
      }
      if (next.sessionId !== undefined) {
        sessionId.textContent = next.sessionId;
        pSession.textContent = next.sessionId;
      }
      if (next.startedAt !== undefined) pStarted.textContent = next.startedAt;
      if (next.topic !== undefined) {
        topic.textContent = next.topic;
        hollowLine.textContent = next.sessionId === undefined ? "No Session Title" : `session ${next.sessionId}`;
      }
      if (next.binary !== undefined) pBinary.textContent = next.binary;
      if (next.cwd !== undefined) pCwd.textContent = next.cwd;
      if (next.exit !== undefined) pExit.textContent = next.exit;
      if (next.lastError !== undefined) pLastError.textContent = next.lastError;
      if (next.phase !== undefined) phase.textContent = next.phase;
      if (next.phaseNote !== undefined) phaseNote.textContent = next.phaseNote;
      document.documentElement.dataset["busy"] = next.busy === true ? "true" : "false";
      renderStage();
      renderSignal();
    },
    setPlaceholder(text): void {
      input.placeholder = text;
    },
    setCommandEnabled(enabled): void {
      input.disabled = !enabled;
      submit.disabled = !enabled;
      submit.classList.toggle("primary", enabled);
    },
    render(view): void {
      const model = view.options.find((option) => option.id === "model");
      const mode = view.options.find((option) => option.id === "mode");
      const effort = view.options.find((option) => option.id === "effort");
      metaModel.textContent = model === undefined ? "NOT DECLARED" : `${model.currentValue}${effort === undefined ? "" : ` · ${effort.currentValue}`}`;
      metaMode.textContent = mode === undefined ? "NOT DECLARED" : mode.currentValue;

      pStop.textContent = view.stopReason ?? "NOT REPORTED";
      pPermission.textContent = view.permissionSummary ?? "NOT REQUESTED";
      pUnmapped.textContent = String(view.unmapped);
      pProvenance.textContent = Object.entries(view.from)
        .map(([block, kinds]) => `${block}:${kinds.length}`)
        .join(" · ");

      renderStage();
      renderSignal();

      stamp.textContent = [
        facts.startedAt === undefined ? "no session filed" : `filed ${facts.startedAt}`,
        facts.sessionId === undefined ? "session —" : `session ${facts.sessionId}`,
        facts.cwd === undefined ? "cwd —" : `cwd ${facts.cwd}`,
        view.options.find((option) => option.id === "model")?.currentValue ?? "model NOT DECLARED",
      ].join(" · ");

      const pinned = stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 24;
      stream.replaceChildren();
      for (const entry of view.stream) stream.append(renderEntry(entry.type, entry.text));
      if (pinned) stream.scrollTop = stream.scrollHeight;

      renderTools(view);
      renderOptions(view);
    },
  };
};