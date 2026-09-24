#!/usr/bin/env node
/*
 * Does `opencode acp --port N` also serve the HTTP (serve) API in the same process?
 *
 * Why: the cross-process abort probe (spike/probe-http-abort.mjs, trace *-abort-probe.jsonl)
 * measured that POST /session/{id}/abort on a SEPARATE `opencode serve` does NOT stop the
 * ACP child's running turn. An interrupt can only work inside the process that owns the run.
 * If the ACP process serves the API itself, HALT = abort against the ACP child's own port.
 *
 * Zero tokens: no prompt is sent. Spawns the binary directly (this probe owns the child),
 * does the stdio handshake, then pokes the HTTP face.
 *
 *   node spike/probe-acp-http-face.mjs
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.T3RRA_ACP_TEST_PORT ?? 43999);
const trace = [];
const t0 = Date.now();
const record = (entry) => trace.push({ t_ms: Date.now() - t0, ...entry });

const binary = process.env.T3RRA_ENGINE_BIN ?? "opencode";
const sandbox = join(process.cwd(), "app", ".sandbox");

const child = spawn(binary, ["acp", "--port", String(PORT)], {
  cwd: sandbox,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
console.log(`spawned ${binary} acp --port ${PORT} (pid ${child.pid})`);

let buf = "";
let nextId = 1;
const waiting = new Map();
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buf += chunk;
  let index;
  while ((index = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, index).replace(/\r$/, "");
    buf = buf.slice(index + 1);
    if (line === "") continue;
    let message;
    try { message = JSON.parse(line); } catch { record({ dir: "in", raw: line.slice(0, 200) }); continue; }
    if (typeof message.id === "number" && waiting.has(message.id)) {
      const method = waiting.get(message.id);
      waiting.delete(message.id);
      record({ dir: "in", id: message.id, method, result_keys: Object.keys(message.result ?? {}), error: message.error ?? null });
      console.log(`RESPONSE #${message.id} ${method}: ${JSON.stringify(message.result ?? message.error).slice(0, 200)}`);
      continue;
    }
    record({ dir: "in", method: message.method ?? "unknown", variant: message.params?.update?.sessionUpdate });
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => console.log(`stderr: ${String(chunk).slice(0, 300)}`));
child.on("error", (error) => { record({ dir: "process", event: "error", error: String(error) }); console.log(`spawn error: ${String(error)}`); });
child.once("close", (code, signal) => {
  record({ dir: "process", event: "close", code, signal });
  console.log(`child closed code=${code} signal=${signal}`);
});

const call = (method, params) => {
  const id = nextId++;
  waiting.set(id, method);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

call("initialize", { protocolVersion: 1, clientInfo: { name: "acp-http-face-probe", version: "0" }, clientCapabilities: {} });
await sleep(2500);
call("session/new", { cwd: sandbox, mcpServers: [] });
await sleep(1500);

const httpProbe = async (label, init) => {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}${init.path ?? ""}`, { method: init.method ?? "GET", headers: init.body ? { "Content-Type": "application/json" } : undefined, body: init.body ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(4000) });
    const text = await response.text();
    record({ dir: "http", label, status: response.status, body: text.slice(0, 300) });
    console.log(`HTTP ${label}: ${response.status} ${text.slice(0, 160)}`);
  } catch (error) {
    record({ dir: "http", label, error: String(error).slice(0, 200) });
    console.log(`HTTP ${label}: FAILED ${String(error).slice(0, 160)}`);
  }
};

await httpProbe("GET /", { path: "/" });
await httpProbe("GET /doc", { path: "/doc" });
await httpProbe("GET /global/health", { path: "/global/health" });
await httpProbe("POST /session/ses_probe_nonexistent/abort", { path: "/session/ses_probe_nonexistent/abort", method: "POST" });

child.kill();
await sleep(300);

const dir = "traces/opencode";
mkdirSync(dir, { recursive: true });
const file = `${dir}/opencode-acp-${new Date().toISOString().replace(/[:.]/g, "-")}-acp-http-face.jsonl`;
writeFileSync(file, trace.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
console.log(`trace: ${file}`);
process.exit(0);
