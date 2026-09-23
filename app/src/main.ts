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
import type { AgentEvent } from "./contract/events.ts";
import { createBridgeTransport, type Transport } from "./engine/transport.ts";
import { emptyView, reduceView, type ConsoleView } from "./view/derive.ts";
import { mountConsole, type SessionFacts } from "./ui/console.ts";

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

const apply = (events: ReturnType<typeof translateLine>["events"]): void => {
  for (const event of events) view = reduceView(view, event);
  ui.render(view);
};

const send = (method: string, params: unknown): number => {
  const id = nextId++;
  pending.set(id, { method });
  void transport.write(JSON.stringify({ jsonrpc: "2.0", id, method, params })).catch((error: unknown) => {
    patch({ lastError: String(error).slice(0, 160) });
  });
  return id;
};

/** Responses carry facts the notifications do not: the session id and the option menu. */
const handleResponse = (id: number, method: string, result: unknown): boolean => {
  const mapping = mapResponse(method, result);
  if (mapping.agentName !== undefined) patch({ engine: mapping.agentName });
  if (mapping.sessionId !== undefined) {
    patch({
      sessionId: mapping.sessionId,
      startedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
      phase: "[ READY ]",
      phaseNote: "AWAITING INSTRUCTION · SESSION OPEN",
    });
    ui.setCommandEnabled(true);
    ui.setPlaceholder("AWAITING COMMAND");
  }
  if (mapping.events.length > 0) apply(mapping.events);
  for (const event of mapping.events) {
    if (event.kind === "prompt.ended") {
      patch({ busy: false, phase: "[ READY ]", phaseNote: `TURN ENDED · ${event.stopReason.toUpperCase()}` });
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
  send("session/new", { cwd: probe.cwd ?? ".", mcpServers: [] });
  ui.setLink("ok");
  patch({ phase: "[ OPENING SESSION ]", phaseNote: "ENGINE UP · SESSION PENDING" });
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

ui.onSubmit((text) => {
  if (view.sessionId === undefined) {
    ui.setPlaceholder("NO SESSION YET");
    return;
  }
  // The operator's own line is a fact of the operator, not a claim about the runtime.
  apply([{ kind: "message.appended", from: { method: "operator", variant: undefined }, role: "user", messageId: `local-${nextId}`, text }]);
  if (facts.topic === undefined) patch({ topic: text });   // the stage title comes from the instruction
  patch({ busy: true, phase: "[ RUNNING ]", phaseNote: "STREAMING · ESC NOT WIRED (session/cancel UNVERIFIED)" });
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
  if (view.sessionId === undefined) return;
  send("session/set_config_option", { sessionId: view.sessionId, configId: optionId, value });
});

// The clock is the only thing allowed to change the anchor while nothing is streaming.
let elapsed = 0;
setInterval(() => {
  if (facts.sessionId === undefined) return;
  elapsed += 1;
  patch({ elapsedSeconds: elapsed });
}, 1000);

ui.render(view);
patch({});
void handshake().catch((error: unknown) => {
  ui.setLink("down");
  patch({ phase: "[ ERROR ]", phaseNote: "HANDSHAKE FAILED", lastError: String(error).slice(0, 160) });
});

export {};