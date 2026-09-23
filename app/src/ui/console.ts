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

const need = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`console shell is missing #${id}`);
  return node as T;
};

/** Facts about the run that come from the process and the clock, not from the event stream. */
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
  readonly phase?: string | undefined;
  readonly phaseNote?: string | undefined;
  readonly busy?: boolean | undefined;
}

export interface ConsoleHandles {
  onSubmit(handler: (text: string) => void): void;
  onRestart(handler: () => void): void;
  onOptionChange(handler: (optionId: string, value: string) => void): void;
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
  const transportPanel = need("transportPanel");
  const registerOperator = need<HTMLButtonElement>("regOperator");
  const registerExpert = need<HTMLButtonElement>("regExpert");
  const input = need<HTMLInputElement>("promptInput");
  const submit = need<HTMLButtonElement>("promptSubmit");
  const restart = need<HTMLButtonElement>("restart");

  let optionHandler: (optionId: string, value: string) => void = () => {};
  const optionNodes = new Map<string, HTMLSelectElement>();
  let facts: SessionFacts = {};

  const renderOptions = (view: ConsoleView): void => {
    const signature = view.options.map((option) => `${option.id}=${option.currentValue}`).join("|");
    const current = [...optionNodes.entries()].map(([id, node]) => `${id}=${node.value}`).join("|");
    if (signature === current && optionNodes.size === view.options.length) return; // nothing moved
    if (view.options.length === 0) {
      if (optionNodes.size === 0) options.innerHTML = '<div class="empty">NOT DECLARED YET</div>';
      return;
    }
    options.replaceChildren();
    optionNodes.clear();
    for (const option of view.options) {
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
      optionNodes.set(option.id, select);
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

  return {
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
      const seconds = facts.elapsedSeconds;
      anchorNum.textContent = seconds === undefined ? "—" : String(seconds);
      anchorUnit.textContent = seconds === undefined ? "" : "s";
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

      // The anchor is the clock. Silence judgement is not implemented, and saying so is better
      // than inventing a stall: `SILENCE NOT MEASURED` is an absence, not a verdict.
      const running = facts.busy === true;
      verdict.textContent = running ? "Running" : facts.sessionId === undefined ? "Idle" : "Ready";
      compare.textContent = running
        ? `STREAMING · ${view.stream.length} ENTRY(IES) · SILENCE NOT MEASURED`
        : "NO RUN IN FLIGHT · SILENCE NOT MEASURED";

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