/**
 * Boot: connect the byte channel, perform the ACP handshake, send an instruction, and feed
 * every line through the adapter into the view. Request/response bookkeeping lives here —
 * the adapter maps notifications, while "which request was this response for" is ours.
 *
 * Client capabilities are sent EMPTY on purpose. The captured traces show that declaring
 * nothing is what keeps this frontend inert: the engine then never asks us for a filesystem,
 * a terminal, or permission, so the first milestone needs no capability surface at all.
 */

import { translateLine } from "./engine/acp.ts";
import { createBridgeTransport, type Transport } from "./engine/transport.ts";
import { emptyView, reduceView, type ConsoleView } from "./view/derive.ts";
import { mountConsole } from "./ui/console.ts";

interface PendingRequest {
  readonly method: string;
}

const ui = mountConsole();
const transport: Transport = createBridgeTransport(crypto.randomUUID());

let view: ConsoleView = emptyView();
let nextId = 1;
let agentVersion: string | undefined;
const pending = new Map<number, PendingRequest>();

const apply = (events: ReturnType<typeof translateLine>["events"]): void => {
  for (const event of events) view = reduceView(view, event);
  ui.render(view);
};

const send = (method: string, params: unknown): number => {
  const id = nextId++;
  pending.set(id, { method });
  void transport.write(JSON.stringify({ jsonrpc: "2.0", id, method, params })).catch((error: unknown) => {
    ui.setTransport({ lastError: String(error).slice(0, 120) });
  });
  return id;
};

/** Responses carry facts the notifications do not: the session id and the option menu. */
const handleResponse = (id: number, method: string, result: unknown): boolean => {
  if (method === "initialize") {
    const info = (result as { agentInfo?: { name?: string; version?: string } }).agentInfo;
    agentVersion = [info?.name, info?.version].filter((part) => part !== undefined && part !== "").join(" ");
    if (agentVersion !== "") ui.setEngineInfo(agentVersion);
    return true;
  }
  if (method === "session/new") {
    const payload = result as { sessionId?: string; configOptions?: readonly unknown[] };
    const events = [];
    if (typeof payload.sessionId === "string") {
      events.push({ kind: "session.opened" as const, from: { method: "session/new.response", variant: undefined }, sessionId: payload.sessionId });
    }
    const optionEvent = translateLine(JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "config_option_update", configOptions: payload.configOptions ?? [] } } }));
    events.push(...optionEvent.events);
    apply(events);
    return true;
  }
  return false;
};

const handleLine = (line: string): void => {
  let id: number | undefined;
  let method: string | undefined;
  try {
    const message = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
    if (typeof message.id === "number" && pending.has(message.id)) {
      id = message.id;
      method = pending.get(message.id)?.method;
      pending.delete(message.id);
      if (message.error !== undefined) ui.setTransport({ lastError: JSON.stringify(message.error).slice(0, 120) });
    }
  } catch {
    // not JSON — the adapter will count it as unmapped, which is the honest outcome
  }
  if (id !== undefined && method !== undefined && handleResponse(id, method, JSON.parse(line).result)) return;
  apply(translateLine(line).events);
};

const handshake = async (): Promise<void> => {
  const probe = await transport.probe();
  ui.setTransport({ binary: probe.binary ?? "NOT FOUND", cwd: probe.cwd ?? "—" });
  if (probe.binary === null) {
    ui.setPhase("[ NO ENGINE ]");
    ui.setPlaceholder("ENGINE NOT FOUND · SET T3RRA_ENGINE_BIN");
    return;
  }
  await transport.spawn();
  send("initialize", { protocolVersion: 1, clientInfo: { name: "t3rra-console", version: "0.1.0" }, clientCapabilities: {} });
  await new Promise((done) => setTimeout(done, 500));
  send("session/new", { cwd: probe.cwd ?? ".", mcpServers: [] });
  ui.setLink("ok");
  ui.setPhase("[ READY ]");
  ui.setPlaceholder("AWAITING COMMAND");
};

transport.onLine(handleLine);
transport.onExit((info) => {
  ui.setLink("down");
  ui.setPhase("[ ENGINE EXITED ]");
  apply([{ kind: "engine.exited", from: { method: "process", variant: undefined }, code: info.code, signal: info.signal }]);
});
transport.onError((message) => {
  ui.setTransport({ lastError: message.slice(0, 120) });
  apply([{ kind: "engine.stderr", from: { method: "stderr", variant: undefined }, text: message }]);
});

ui.onSubmit((text) => {
  if (view.sessionId === undefined) {
    ui.setPlaceholder("NO SESSION YET");
    return;
  }
  // The operator's own line is a fact of the operator, not a claim about the runtime.
  apply([{ kind: "message.appended", from: { method: "operator", variant: undefined }, role: "user", messageId: `local-${nextId}`, text }]);
  ui.setPhase("[ RUNNING ]");
  send("session/prompt", { sessionId: view.sessionId, prompt: [{ type: "text", text }] });
});

ui.onRestart(() => {
  view = emptyView();
  ui.render(view);
  void transport.kill().then(handshake).catch((error: unknown) => ui.setTransport({ lastError: String(error).slice(0, 120) }));
});

ui.onOptionChange((optionId, value) => {
  if (view.sessionId === undefined) return;
  send("session/set_config_option", { sessionId: view.sessionId, configId: optionId, value });
});

ui.render(view);
void handshake().catch((error: unknown) => {
  ui.setLink("down");
  ui.setPhase("[ ERROR ]");
  ui.setTransport({ lastError: String(error).slice(0, 120) });
});

export {};