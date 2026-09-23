/**
 * The renderer. Reads a `ConsoleView` and nothing else (rules-inherited §一.1): no wire
 * objects, no session state, no engine knowledge. Options are rendered exactly as the
 * runtime declares them — no whitelist, no fixed trio (§六 of the old dock, rule 6).
 */

import type { ConsoleView } from "../view/derive.ts";

const need = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`console shell is missing #${id}`);
  return node as T;
};

export interface TransportFacts {
  readonly binary?: string | undefined;
  readonly cwd?: string | undefined;
  readonly exit?: string | undefined;
  readonly lastError?: string | undefined;
}

export interface ConsoleHandles {
  onSubmit(handler: (text: string) => void): void;
  onRestart(handler: () => void): void;
  onOptionChange(handler: (optionId: string, value: string) => void): void;
  setLink(state: "ok" | "down"): void;
  setPhase(text: string): void;
  setEngineInfo(text: string): void;
  setPlaceholder(text: string): void;
  setTransport(facts: TransportFacts): void;
  render(view: ConsoleView): void;
}

export const mountConsole = (): ConsoleHandles => {
  const engine = need("engine");
  const engineMeta = need("engineMeta");
  const sessionId = need("sessionId");
  const linkLabel = need("linkLabel");
  const unmapped = need("unmapped");
  const phase = need("phase");
  const stopReason = need("stopReason");
  const stream = need("stream");
  const tools = need("tools");
  const options = need("options");
  const binary = need("binary");
  const cwd = need("cwd");
  const exit = need("exit");
  const lastError = need("lastError");
  const permission = need("permission");
  const input = need<HTMLInputElement>("promptInput");
  const submit = need<HTMLButtonElement>("promptSubmit");
  const restart = need<HTMLButtonElement>("restart");

  let optionHandler: (optionId: string, value: string) => void = () => {};
  const optionNodes = new Map<string, HTMLSelectElement>();

  const onSubmit = (handler: (text: string) => void): void => {
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
  };

  const renderOptions = (view: ConsoleView): void => {
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

  return {
    onSubmit,
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
    setPhase(text): void {
      phase.textContent = text;
    },
    setEngineInfo(text): void {
      engineMeta.textContent = text === "" ? "NOT STATED" : text;
    },
    setPlaceholder(text): void {
      input.placeholder = text;
    },
    setTransport(facts): void {
      if (facts.binary !== undefined) {
        binary.textContent = facts.binary;
        engine.textContent = facts.binary;
      }
      if (facts.cwd !== undefined) cwd.textContent = facts.cwd;
      if (facts.exit !== undefined) exit.textContent = facts.exit;
      if (facts.lastError !== undefined) lastError.textContent = facts.lastError;
    },
    render(view): void {
      sessionId.textContent = view.sessionId ?? "NOT STATED";
      unmapped.textContent = String(view.unmapped);
      stopReason.textContent = view.stopReason ?? "NOT REPORTED";
      permission.textContent = view.permissionSummary ?? "NOT REQUESTED";

      const pinned = stream.scrollTop + stream.clientHeight >= stream.scrollHeight - 24;
      stream.replaceChildren();
      for (const entry of view.stream) {
        const wrap = document.createElement("div");
        wrap.className = `entry ${entry.type}`;
        const who = document.createElement("div");
        who.className = "who";
        who.textContent = entry.type === "thought" ? "REASONING" : entry.type === "user" ? "OPERATOR" : "AGENT";
        const body = document.createElement("div");
        body.className = "body";
        body.textContent = entry.text;
        wrap.append(who, body);
        stream.append(wrap);
      }
      if (pinned) stream.scrollTop = stream.scrollHeight;

      tools.replaceChildren();
      for (const tool of view.tools) {
        const row = document.createElement("div");
        row.className = "tool";
        row.dataset["status"] = tool.status;
        const title = document.createElement("span");
        title.className = "title";
        title.textContent = tool.title === "" ? "(untitled tool)" : tool.title;
        const status = document.createElement("span");
        status.className = "status";
        status.textContent = `${tool.hint === "" ? "tool" : tool.hint} · ${tool.status === "" ? "NO STATUS" : tool.status}`;
        row.append(title, status);
        tools.append(row);
      }

      renderOptions(view);
    },
  };
};