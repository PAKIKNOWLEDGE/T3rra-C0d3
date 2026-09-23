#!/usr/bin/env node
/*
 * Does this engine support cancelling a running turn, and what does it look like when you do?
 *
 * Why: the design has an interrupt in the dock, and a control we cannot honour is a dangling
 * control. Before the button gets drawn, the method has to be observed.
 *
 * Costs a few tokens on a free model (the prompt asks for a long answer so there is something
 * to cancel) — no money, and the trace is the deliverable.
 *
 *   node spike/probe-session-cancel.mjs
 */

import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";

const base = new URL(process.env.T3RRA_BRIDGE_URL ?? "http://localhost:5191");
const client = `cancel-probe-${Date.now()}`;
const path = (suffix) => `/__t3${suffix}?client=${encodeURIComponent(client)}`;
const MODEL = process.env.T3RRA_PROBE_MODEL ?? "opencode/nemotron-3.5-lightning-free";

const trace = [];
const t0 = Date.now();
const at = () => String(Date.now() - t0).padStart(6);
const record = (entry) => { trace.push({ t_ms: Date.now() - t0, ...entry }); };

let nextId = 1;
const waiting = new Map();
let sessionId;

const post = (suffix, body) => new Promise((done, fail) => {
  const payload = JSON.stringify(body ?? {});
  const request = http.request({ hostname: base.hostname, port: base.port, path: path(suffix), method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, (response) => {
    let text = "";
    response.on("data", (chunk) => (text += chunk));
    response.on("end", () => (response.statusCode === 200 ? done(text) : fail(new Error(`${suffix} -> ${response.statusCode} ${text}`))));
  });
  request.on("error", fail);
  request.end(payload);
});

const call = async (method, params) => {
  const id = nextId++;
  waiting.set(id, method);
  record({ dir: "out", id, method });
  await post("/write", { line: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return id;
};

const probe = await new Promise((done) => {
  http.get({ hostname: base.hostname, port: base.port, path: path("/probe") }, (response) => {
    let text = "";
    response.on("data", (chunk) => (text += chunk));
    response.on("end", () => done(JSON.parse(text)));
  });
});
console.log(`binary: ${probe.binary}`);

let updates = 0;
let cancelSent = false;
let stopReason;

const streaming = new Promise((done) => {
  const stream = http.get({ hostname: base.hostname, port: base.port, path: path("/events") }, (response) => {
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
        if (name === "engine-error") console.log(`@${at()} engine stderr: ${data.slice(0, 200)}`);
        if (name !== "line" || data === "") continue;
        let message;
        try { message = JSON.parse(data); } catch { continue; }
        if (typeof message.id === "number" && waiting.has(message.id)) {
          const method = waiting.get(message.id);
          waiting.delete(message.id);
          if (method === "session/new" && typeof message.result?.sessionId === "string") sessionId = message.result.sessionId;
          record({ dir: "in", id: message.id, method, error: message.error ?? null, result: message.error ? null : message.result });
          if (message.error !== undefined) console.log(`@${at()} RESPONSE #${message.id} ${method}: ERROR ${JSON.stringify(message.error)}`);
          else console.log(`@${at()} RESPONSE #${message.id} ${method}: keys ${JSON.stringify(Object.keys(message.result ?? {}))}`);
          if (method === "session/prompt" && !cancelSent) stopReason = message.result?.stopReason;
          continue;
        }
        if (message.method === "session/update") {
          updates += 1;
          const variant = message.params?.update?.sessionUpdate;
          record({ dir: "in", method: "session/update", variant });
          if (variant !== undefined && variant !== "available_commands_update") {
            if (updates % 10 === 1) console.log(`@${at()} update ${variant} (${updates} so far)`);
            // cancel once the turn is demonstrably producing output
            if (!cancelSent && updates >= 3 && sessionId !== undefined) {
              cancelSent = true;
              console.log(`@${at()} --- sending session/cancel ---`);
              void call("session/cancel", { sessionId });
            }
          }
        }
      }
    });
    response.on("end", () => { stream.destroy(); done(); });
  });
});

await post("/spawn", { cwd: probe.cwd });
await call("initialize", { protocolVersion: 1, clientInfo: { name: "cancel-probe", version: "0" }, clientCapabilities: {} });
await new Promise((done) => setTimeout(done, 900));
await call("session/new", { cwd: probe.cwd, mcpServers: [] });
const until = async (predicate, label, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (predicate()) return true; await new Promise((r) => setTimeout(r, 200)); }
  console.log(`(timed out waiting for ${label})`);
  return false;
};
await until(() => sessionId !== undefined, "session/new");
console.log(`session: ${sessionId ?? "(none)"}`);
await call("session/set_config_option", { sessionId, configId: "model", value: MODEL });
await new Promise((done) => setTimeout(done, 1000));

await call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Count from 1 to 300, one number per line." }] });
await until(() => stopReason !== undefined || Date.now() - t0 > 45000, "turn to end", 45000);
await new Promise((done) => setTimeout(done, 1500));

console.log(`\ncancel sent: ${cancelSent}`);
console.log(`updates:     ${updates}`);
console.log(`stopReason:  ${stopReason ?? "NOT REPORTED"}`);
const dir = "traces/opencode";
mkdirSync(dir, { recursive: true });
const file = `${dir}/opencode-acp-${new Date().toISOString().replace(/[:.]/g, "-")}-cancel-probe.jsonl`;
writeFileSync(file, trace.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
console.log(`trace: ${file}`);
await post("/kill", {});
await new Promise((done) => setTimeout(done, 300));
process.exit(0);