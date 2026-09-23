#!/usr/bin/env node
/*
 * Raw frame reader for the app's dev bridge. No adapter, no view: it performs the ACP
 * handshake, sends one prompt, and prints every SSE frame (event name + payload) plus
 * anything the engine wrote on stderr. A silent prompt stops being a mystery this way.
 *
 * Debugging aid, not part of any build.
 *
 *   node spike/probe-bridge-raw.mjs [baseUrl] [seconds]
 */

const base = process.argv[2] ?? "http://localhost:5191";
const runForSeconds = Number(process.argv[3] ?? 45);
const client = `raw-${Date.now()}`;
const url = (path) => `${base}/__t3${path}?client=${encodeURIComponent(client)}`;

const post = async (path, body) => {
  const response = await fetch(url(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const payload = await response.json().catch(() => null);
  console.log(`POST ${path} -> ${response.status} ${JSON.stringify(payload)?.slice(0, 200)}`);
  return payload;
};

const probe = await fetch(url("/probe")).then((response) => response.json());
console.log(`binary: ${probe.binary}\ncwd:    ${probe.cwd}`);

/** sessionId captured from whichever response carries it. */
let sessionId;
let nextId = 1;
const waiting = new Map();

const controller = new AbortController();
const reading = (async () => {
  const response = await fetch(url("/events"), { signal: controller.signal });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const eventName = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "(none)";
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
      if (data === "" && eventName === "(none)") continue;
      const shown = data.replace(/\\n/g, "\n");
      if (eventName !== "line") console.log(`[${eventName}] ${shown.slice(0, 300)}`);
      try {
        const message = JSON.parse(shown);
        if (typeof message.id === "number" && waiting.has(message.id)) {
          const method = waiting.get(message.id);
          waiting.delete(message.id);
          console.log(`[response] #${message.id} ${method}: ${message.error !== undefined ? `ERROR ${JSON.stringify(message.error)}` : JSON.stringify(Object.keys(message.result ?? {}))}`);
          if (typeof message.result?.sessionId === "string") sessionId = message.result.sessionId;
        } else if (typeof message.method === "string") {
          const variant = message.params?.update?.sessionUpdate;
          if (variant !== undefined && variant !== "available_commands_update") {
            console.log(`[update] ${variant} ${JSON.stringify(message.params?.update).slice(0, 160)}`);
          }
        }
      } catch {
        /* not JSON: reported above as a raw frame */
      }
    }
  }
})().catch(() => {});

const call = async (method, params) => {
  const id = nextId++;
  waiting.set(id, method);
  await post("/write", { line: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return id;
};

await post("/spawn", { cwd: probe.cwd });
await call("initialize", { protocolVersion: 1, clientInfo: { name: "raw-probe", version: "0" }, clientCapabilities: {} });
await new Promise((done) => setTimeout(done, 500));
await call("session/new", { cwd: probe.cwd, mcpServers: [] });
await new Promise((done) => setTimeout(done, 800));
console.log(`session: ${sessionId ?? "(none captured)"}`);

if (sessionId !== undefined) {
  console.log("--- prompting ---");
  await call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Say the single word: ok" }] });
} else {
  console.log("--- no session id, cannot prompt ---");
}

await new Promise((done) => setTimeout(done, runForSeconds * 1000));
controller.abort();
await post("/kill", {});
await reading;
console.log("done");