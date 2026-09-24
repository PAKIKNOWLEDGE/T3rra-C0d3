#!/usr/bin/env node
/*
 * HALT evidence: can the bridge's separate `opencode serve` abort a prompt that is
 * streaming inside the ACP child? The ACP face has no `session/cancel` (probe-session-cancel
 * measured -32601); the HTTP face has POST /session/{sessionID}/abort (openapi shows it).
 * Whether the abort crosses process boundaries is the open question (capability-map §4.4).
 *
 * Shape: ACP handshake -> session/new -> long prompt -> after 6 streamed updates send the
 * abort through the /__t3/http tunnel. If updates keep flowing 5s later, also try
 * POST /api/session/{id}/interrupt. Finally send one short prompt to prove the session is
 * still usable after the abort. The trace file is the deliverable.
 *
 * The app must be running (it hosts the bridge):
 *   npm run dev
 *   node spike/probe-http-abort.mjs                    # bridge on :5191
 *   $env:T3RRA_BRIDGE_URL="http://localhost:5192"; node spike/probe-http-abort.mjs
 */

import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";

const base = new URL(process.env.T3RRA_BRIDGE_URL ?? "http://localhost:5191");
const client = `abort-probe-${Date.now()}`;
const path = (suffix) => `/__t3${suffix}?client=${encodeURIComponent(client)}`;
const MODEL = process.env.T3RRA_PROBE_MODEL ?? "opencode/nemotron-3.5-lightning-free";
const ABORT_AFTER_UPDATES = 6;
const INTERRUPT_PROBE_MS = 5_000;

const trace = [];
const t0 = Date.now();
const at = () => String(Date.now() - t0).padStart(6);
const record = (entry) => { trace.push({ t_ms: Date.now() - t0, ...entry }); };

let nextId = 1;
const waiting = new Map();
let sessionId;
let updates = 0;
let abortSentAt;
let updatesAfterAbort = 0;
let lastUpdateAt;
let mainStop;
let followStop;

const request = (suffix, method, body) => new Promise((done, fail) => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const req = http.request(
    {
      hostname: base.hostname, port: base.port, path: path(suffix), method,
      headers: payload === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    },
    (response) => {
      let text = "";
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => done({ status: response.statusCode ?? 0, text }));
    },
  );
  req.on("error", fail);
  req.end(payload);
});

const post = (suffix, body) => request(suffix, "POST", body ?? {}).then((r) => {
  if (r.status < 200 || r.status >= 300) throw new Error(`${suffix} -> ${r.status} ${r.text.slice(0, 200)}`);
  return r;
});

const call = async (method, params, phase) => {
  const id = nextId++;
  waiting.set(id, { method, phase });
  record({ dir: "out", id, method });
  await post("/write", { line: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return id;
};

const httpTunnel = async (method, upPath) => {
  const sentAt = Date.now() - t0;
  const result = await post("/http", { method, path: upPath });
  record({ dir: "http", method, path: upPath, t_send: sentAt, t_response: Date.now() - t0, status: result.status, body: result.text.slice(0, 200) });
  return result;
};

const probe = await new Promise((done) => {
  http.get({ hostname: base.hostname, port: base.port, path: path("/probe") }, (response) => {
    let text = "";
    response.on("data", (chunk) => (text += chunk));
    response.on("end", () => done(JSON.parse(text)));
  });
});
console.log(`@${at()} binary: ${probe.binary} · cwd: ${probe.cwd}`);

const stream = new Promise((done) => {
  const req = http.get({ hostname: base.hostname, port: base.port, path: path("/events") }, (response) => {
    response.setEncoding("utf8");
    let buffer = "";
    response.on("data", (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const name = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
        const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("").replace(/\\n/g, "\n");
        if (name === "engine-error") { console.log(`@${at()} engine stderr: ${data.slice(0, 160)}`); continue; }
        if (name !== "line" || data === "") continue;
        let message;
        try { message = JSON.parse(data); } catch { continue; }
        if (typeof message.id === "number" && waiting.has(message.id)) {
          const { method, phase } = waiting.get(message.id);
          waiting.delete(message.id);
          if (method === "session/new" && typeof message.result?.sessionId === "string") sessionId = message.result.sessionId;
          record({ dir: "in", id: message.id, method, error: message.error ?? null, result: message.error ? null : message.result });
          if (message.error !== undefined) console.log(`@${at()} RESPONSE #${message.id} ${method}: ERROR ${JSON.stringify(message.error)}`);
          else console.log(`@${at()} RESPONSE #${message.id} ${method}: ${JSON.stringify(Object.keys(message.result ?? {}))}`);
          if (method === "session/prompt" && phase === "main") { mainStop = message.result?.stopReason ?? "NO_STOP_REASON"; console.log(`@${at()} main turn ended: ${mainStop}`); }
          if (method === "session/prompt" && phase === "follow") { followStop = message.result?.stopReason ?? "NO_STOP_REASON"; console.log(`@${at()} follow-up turn ended: ${followStop}`); }
          continue;
        }
        if (message.method === "session/update") {
          const variant = message.params?.update?.sessionUpdate;
          if (variant === undefined || variant === "available_commands_update") continue;
          updates += 1;
          lastUpdateAt = Date.now() - t0;
          record({ dir: "in", method: "session/update", variant });
          if (abortSentAt !== undefined) {
            updatesAfterAbort += 1;
            if (updatesAfterAbort <= 3) console.log(`@${at()} update AFTER abort (${updatesAfterAbort}): ${variant}`);
          }
          if (updates % 10 === 1) console.log(`@${at()} update ${variant} (${updates} so far)`);
          if (abortSentAt === undefined && updates === ABORT_AFTER_UPDATES && sessionId !== undefined) {
            abortSentAt = Date.now() - t0;
            console.log(`@${at()} --- aborting session ${sessionId} over HTTP tunnel ---`);
            void httpTunnel("POST", `/session/${encodeURIComponent(sessionId)}/abort`)
              .then((r) => console.log(`@${at()} abort -> ${r.status} ${r.text.slice(0, 120)}`))
              .catch((error) => console.log(`@${at()} abort tunnel FAILED: ${String(error).slice(0, 200)}`));
          }
        }
      }
    });
    response.on("end", () => done());
  });
  req.on("error", (error) => { console.log(`stream error: ${error}`); done(); });
});

await post("/spawn", { cwd: probe.cwd });
await call("initialize", { protocolVersion: 1, clientInfo: { name: "abort-probe", version: "0" }, clientCapabilities: {} });
await new Promise((done) => setTimeout(done, 900));
await call("session/new", { cwd: probe.cwd, mcpServers: [] });

const until = async (predicate, label, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (predicate()) return true; await new Promise((r) => setTimeout(r, 200)); }
  console.log(`(timed out waiting for ${label})`);
  return false;
};

await until(() => sessionId !== undefined, "session/new response");
console.log(`@${at()} session: ${sessionId}`);

await call("session/set_config_option", { sessionId, configId: "model", value: MODEL });
await new Promise((done) => setTimeout(done, 1_000));
await call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Count from 1 to 300, one number per line. After each hundred, add a short reflection." }], }, "main");

const ended = await until(() => mainStop !== undefined, "main turn to end", 60_000);

// If updates kept flowing well past the abort, try the v2 interrupt endpoint too.
if (abortSentAt !== undefined && lastUpdateAt !== undefined && lastUpdateAt > abortSentAt + INTERRUPT_PROBE_MS) {
  console.log(`@${at()} stream still alive after abort -> probing /api interrupt`);
  try {
    const r = await httpTunnel("POST", `/api/session/${encodeURIComponent(sessionId)}/interrupt`);
    console.log(`@${at()} interrupt -> ${r.status} ${r.text.slice(0, 120)}`);
    await until(() => mainStop !== undefined, "turn to end after interrupt", 30_000);
  } catch (error) {
    console.log(`@${at()} interrupt tunnel FAILED: ${String(error).slice(0, 200)}`);
  }
}

// The session must stay usable after a HALT — one short follow-up proves it or says why not.
if (mainStop !== undefined) {
  console.log(`@${at()} follow-up prompt to prove usability`);
  await call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Reply with exactly one word: alive" }] }, "follow");
  await until(() => followStop !== undefined, "follow-up turn", 30_000);
}

const verdict =
  mainStop === undefined ? "NO_STOP_REPORTED"
    : updatesAfterAbort === 0 && ended ? "STOPPED_CLEAN"
      : ended ? "STOPPED_AFTER_ABORT"
        : "STILL_RUNNING";

console.log(`
================ abort probe ================
abort sent at:        ${abortSentAt ?? "NEVER (not enough updates)"} ms
updates total:        ${updates} (after abort: ${updatesAfterAbort})
last update at:       ${lastUpdateAt ?? "—"} ms
main stopReason:      ${mainStop ?? "NOT REPORTED"}
follow-up stopReason: ${followStop ?? "NOT REPORTED"}
verdict:              ${verdict}
`);

const dir = "traces/opencode";
mkdirSync(dir, { recursive: true });
const file = `${dir}/opencode-acp-${new Date().toISOString().replace(/[:.]/g, "-")}-abort-probe.jsonl`;
writeFileSync(file, trace.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
console.log(`trace: ${file}`);
await post("/kill", {});
await new Promise((done) => setTimeout(done, 300));
process.exit(0);
