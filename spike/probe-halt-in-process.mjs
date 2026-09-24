#!/usr/bin/env node
/*
 * The decisive HALT measurement: a prompt streams inside `opencode acp --port P`; we POST
 * /session/{id}/abort to THAT process's own port and observe whether the run actually stops.
 *
 * Why: spike/probe-http-abort.mjs measured that abort on a SEPARATE `opencode serve` returns
 * 200 but does not stop the ACP child's turn (cross-process abort is a no-op; the running
 * state lives in the process that owns the session). spike/probe-acp-http-face.mjs measured
 * that the acp child itself serves the full HTTP API (GET /doc, /global/health = 200).
 * This probe closes the loop: same-process abort -> turn stopped? usable after?
 *
 * Costs a few tokens on a free model. Standalone: it owns the child, no bridge needed.
 *
 *   $env:T3RRA_ENGINE_BIN="<path to opencode.exe>"; node spike/probe-halt-in-process.mjs
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.T3RRA_ACP_TEST_PORT ?? 43998);
const MODEL = process.env.T3RRA_PROBE_MODEL ?? "opencode/nemotron-3.5-lightning-free";
const ABORT_AFTER_UPDATES = 6;
const STREAM_WAIT_MS = Number(process.env.T3RRA_STREAM_WAIT_MS ?? 150_000);
const STOP_WAIT_MS = 45_000;
const binary = process.env.T3RRA_ENGINE_BIN ?? "opencode";
const sandbox = join(process.cwd(), "app", ".sandbox");

const trace = [];
const t0 = Date.now();
const at = () => String(Date.now() - t0).padStart(6);
const record = (entry) => trace.push({ t_ms: Date.now() - t0, ...entry });

let nextId = 1;
const waiting = new Map();
let sessionId;
let updates = 0;
let abortSentAt;
let updatesAfterAbort = 0;
let lastUpdateAt;
let mainStop;
let mainStopAt;
let followStop;
let followStreamed;

const child = spawn(binary, ["acp", "--port", String(PORT)], { cwd: sandbox, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
record({ dir: "process", event: "spawn", pid: child.pid, port: PORT });
console.log(`@${at()} spawned pid=${child.pid} port=${PORT}`);

let buf = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buf += chunk;
  let index;
  while ((index = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, index).replace(/\r$/, "");
    buf = buf.slice(index + 1);
    if (line === "") continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (typeof message.id === "number" && waiting.has(message.id)) {
      const { method, phase } = waiting.get(message.id);
      waiting.delete(message.id);
      record({ dir: "in", id: message.id, method, error: message.error ?? null, result: message.error ? null : message.result });
      if (message.error !== undefined) console.log(`@${at()} RESPONSE ${method}: ERROR ${JSON.stringify(message.error)}`);
      else console.log(`@${at()} RESPONSE ${method}`);
      if (method === "session/new" && typeof message.result?.sessionId === "string") sessionId = message.result.sessionId;
      if (method === "session/prompt" && phase === "main") { mainStop = message.result?.stopReason ?? "NO_STOP_REASON"; mainStopAt = Date.now() - t0; console.log(`@${at()} main turn ended: ${mainStop}`); }
      if (method === "session/prompt" && phase === "follow") { followStop = message.result?.stopReason ?? "NO_STOP_REASON"; console.log(`@${at()} follow-up turn ended: ${followStop}`); }
      continue;
    }
    if (message.method === "session/update") {
      const variant = message.params?.update?.sessionUpdate;
      // Only signs the model is actually producing count — config chatter must not trigger the abort.
      if (variant !== "agent_message_chunk" && variant !== "agent_thought_chunk" && variant !== "tool_call" && variant !== "tool_call_update") continue;
      updates += 1;
      lastUpdateAt = Date.now() - t0;
      record({ dir: "in", method: "session/update", variant });
      if (abortSentAt !== undefined && mainStop === undefined) {
        updatesAfterAbort += 1;
        if (updatesAfterAbort <= 5) console.log(`@${at()} update AFTER abort (${updatesAfterAbort}): ${variant}`);
      }
      if (mainStop !== undefined && !followStreamed) {
        // a sign the FOLLOW-UP turn is producing output = the session is usable after the halt
        followStreamed = true;
        record({ dir: "in", method: "session/update", variant, note: "follow-up streaming" });
        console.log(`@${at()} follow-up turn is streaming (${variant})`);
      }
      if (updates % 10 === 1) console.log(`@${at()} update ${variant} (${updates} so far)`);
      if (abortSentAt === undefined && updates === ABORT_AFTER_UPDATES && sessionId !== undefined) {
        abortSentAt = Date.now() - t0;
        console.log(`@${at()} --- aborting ${sessionId} on the ACP process' OWN port ${PORT} ---`);
        void fetch(`http://127.0.0.1:${PORT}/session/${encodeURIComponent(sessionId)}/abort`, { method: "POST", signal: AbortSignal.timeout(8000) })
          .then(async (response) => {
            const text = await response.text();
            record({ dir: "http", method: "POST", path: `/session/${sessionId}/abort`, status: response.status, body: text.slice(0, 200) });
            console.log(`@${at()} abort -> HTTP ${response.status} ${text.slice(0, 80)}`);
          })
          .catch((error) => {
            record({ dir: "http", method: "POST", path: `/session/${sessionId}/abort`, error: String(error) });
            console.log(`@${at()} abort FAILED: ${String(error)}`);
          });
      }
    }
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => console.log(`@${at()} stderr: ${String(chunk).slice(0, 200)}`));
child.on("error", (error) => record({ dir: "process", event: "error", error: String(error) }));
child.once("close", (code, signal) => { record({ dir: "process", event: "close", code, signal }); console.log(`@${at()} child closed code=${code} signal=${signal}`); });

const call = (method, params, phase) => {
  const id = nextId++;
  waiting.set(id, { method, phase });
  record({ dir: "out", id, method });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const until = async (predicate, label, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (predicate()) return true; await sleep(150); }
  console.log(`@${at()} (timed out waiting for ${label})`);
  return false;
};

// Does the engine broadcast an idle/stop sign over stdio right after the abort? Watch for
// anything the trace has not shown before (e.g. usage_update at turn end).
call("initialize", { protocolVersion: 1, clientInfo: { name: "halt-probe", version: "0" }, clientCapabilities: {} });
await until(() => waiting.size === 0, "initialize response");
await call("session/new", { cwd: sandbox, mcpServers: [] });
await until(() => sessionId !== undefined, "session/new response");
console.log(`@${at()} session: ${sessionId}`);
call("session/set_config_option", { sessionId, configId: "model", value: MODEL });
await sleep(1200);
call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Count from 1 to 300, one number per line. After each hundred, add a short reflection." }] }, "main");

const streaming = await until(() => updates >= ABORT_AFTER_UPDATES, "streaming to start (abort trigger)", STREAM_WAIT_MS);
const ended = streaming ? await until(() => mainStop !== undefined, "main turn to end", STOP_WAIT_MS) : false;
const stoppedWithinMs = mainStop !== undefined ? (mainStopAt ?? 0) - (abortSentAt ?? 0) : undefined;

if (mainStop !== undefined) {
  console.log(`@${at()} usability check: follow-up prompt`);
  call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Reply with exactly one word: alive" }] }, "follow");
  await until(() => followStop !== undefined || followStreamed, "follow-up turn to stream or end", 90_000);
}

const usableAfter = followStop !== undefined || followStreamed;
const verdict =
  abortSentAt === undefined ? "NO_STREAM_WITHIN_WINDOW"
    : mainStop === undefined ? "ABORT_SENT_BUT_TURN_NOT_STOPPED"
      : `STOPPED_IN_${stoppedWithinMs ?? "?"}MS_AFTER_${updatesAfterAbort}_FLUSHED_UPDATES`;

record({ dir: "verdict", verdict, updates, updatesAfterAbort, stoppedWithinMs, mainStop, followStop, followStreamed, usableAfter });
console.log(`
================ in-process HALT probe ================
abort sent at:          ${abortSentAt ?? "NEVER"} ms
updates total:          ${updates} (in-flight after abort: ${updatesAfterAbort})
abort->stop latency:    ${stoppedWithinMs ?? "—"} ms
main stopReason:        ${mainStop ?? "NOT REPORTED"}
follow-up streamed:     ${followStreamed === true ? "YES" : "NO"}
follow-up stopReason:   ${followStop ?? "NOT REPORTED"}
usable after halt:      ${usableAfter ? "YES" : "NOT PROVEN"}
verdict:                ${verdict}
`);

const dir = "traces/opencode";
mkdirSync(dir, { recursive: true });
const file = `${dir}/opencode-acp-${new Date().toISOString().replace(/[:.]/g, "-")}-halt-in-process.jsonl`;
writeFileSync(file, trace.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
console.log(`trace: ${file}`);
child.kill();
await sleep(300);
process.exit(0);
