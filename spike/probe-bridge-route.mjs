#!/usr/bin/env node
/*
 * Zero-token proof that the bridge's generic /http tunnel targets the ACP child's OWN port
 * (the route HALT rides). Discriminator: the opencode.exe process count before/after tunnel
 * calls — a lazily started `opencode serve` would add one process; staying at one means the
 * request was served by the child itself. Also deletes a session it creates, through the
 * same tunnel, to show DELETE works on that port too.
 *
 *   $env:T3RRA_BRIDGE_URL="http://localhost:5191"; node spike/probe-bridge-route.mjs
 */

import http from "node:http";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const base = new URL(process.env.T3RRA_BRIDGE_URL ?? "http://localhost:5191");
const client = `bridge-route-${Date.now()}`;
const p = (suffix) => `/__t3${suffix}?client=${encodeURIComponent(client)}`;

const trace = [];
const t0 = Date.now();
const at = () => String(Date.now() - t0).padStart(6);
const record = (entry) => { trace.push({ t_ms: Date.now() - t0, ...entry }); };

const req = (suffix, method, body) => new Promise((done, fail) => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const r = http.request({ hostname: base.hostname, port: base.port, path: p(suffix), method, headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {} }, (res) => {
    let text = "";
    res.on("data", (c) => (text += c));
    res.on("end", () => done({ status: res.statusCode ?? 0, text }));
  });
  r.on("error", fail);
  r.end(payload);
});

const get = (suffix) => new Promise((done, fail) => {
  http.get({ hostname: base.hostname, port: base.port, path: p(suffix) }, (res) => {
    let text = "";
    res.on("data", (c) => (text += c));
    res.on("end", () => done({ status: res.statusCode ?? 0, text }));
  }).on("error", fail);
});

const countEngines = () => execSync('tasklist /FI "IMAGENAME eq opencode.exe" /NH', { encoding: "utf8" }).split("\n").filter((l) => /opencode/i.test(l)).length;
const sleep = (ms) => new Promise((d) => setTimeout(d, ms));

const probe = await get("/probe");
record({ dir: "http", step: "probe", result: probe.text.slice(0, 200) });
console.log(`@${at()} probe: ${probe.text.slice(0, 120)}`);

const spawned = await req("/spawn", "POST", {});
record({ dir: "http", step: "spawn", result: spawned.text.slice(0, 200) });
await sleep(2000);
const afterSpawn = countEngines();
record({ dir: "count", step: "after-spawn", engines: afterSpawn });
console.log(`@${at()} engines after spawn: ${afterSpawn}`);

// The exact route HALT rides: POST /session/{id}/abort through the tunnel (fake id — reachability).
let tunnelStatus = 0;
let tunnelBody = "";
for (let attempt = 1; attempt <= 8 && (tunnelStatus < 200 || tunnelStatus >= 300); attempt += 1) {
  const r = await req("/http", "POST", { method: "POST", path: "/session/ses_bridge_route_fake/abort" });
  tunnelStatus = r.status;
  tunnelBody = r.text.slice(0, 120);
  record({ dir: "tunnel", step: "abort-fake", attempt, status: r.status, body: tunnelBody });
  if (r.status < 200 || r.status >= 300) await sleep(1000);
}
console.log(`@${at()} tunnel abort (fake) -> ${tunnelStatus} ${tunnelBody}`);
const afterTunnel = countEngines();
record({ dir: "count", step: "after-tunnel", engines: afterTunnel });
console.log(`@${at()} engines after tunnel: ${afterTunnel} ${afterTunnel === afterSpawn ? "(no lazy serve — tunnel hit the ACP port)" : "(SECOND PROCESS — fell back to serve!)"}`);

// DELETE through the same tunnel, against a session this probe creates and drops.
let nextId = 1;
const waiting = new Map();
let newSessionId;
const streamDone = new Promise((done) => {
  const r = http.get({ hostname: base.hostname, port: base.port, path: p("/events") }, (res) => {
    res.setEncoding("utf8");
    let buf = "";
    res.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const name = frame.split("\n").find((l) => l.startsWith("event:"))?.slice(6).trim();
        const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("").replace(/\\n/g, "\n");
        if (name !== "line" || data === "") continue;
        let message;
        try { message = JSON.parse(data); } catch { continue; }
        if (typeof message.id === "number" && waiting.has(message.id)) {
          const method = waiting.get(message.id);
          waiting.delete(message.id);
          record({ dir: "in", id: message.id, method, result_keys: Object.keys(message.result ?? {}), error: message.error ?? null });
          if (method === "session/new" && typeof message.result?.sessionId === "string") newSessionId = message.result.sessionId;
        }
      }
    });
  });
  r.on("error", done);
  setTimeout(done, 25_000);
});

const call = async (method, params) => {
  const myId = nextId++;
  waiting.set(myId, method);
  await req("/write", "POST", { line: JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) });
};

await call("initialize", { protocolVersion: 1, clientInfo: { name: "bridge-route-probe", version: "0" }, clientCapabilities: {} });
await sleep(900);
const cwd = JSON.parse(probe.text).cwd;
await call("session/new", { cwd, mcpServers: [] });
const seen = async (predicate, ms) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (predicate()) return true; await sleep(200); }
  return false;
};
await seen(() => newSessionId !== undefined, 6000);
console.log(`@${at()} session/new -> ${newSessionId ?? "NOT SEEN"}`);
let deleteStatus = 0;
if (newSessionId !== undefined) {
  const del = await req("/http", "POST", { method: "DELETE", path: `/session/${encodeURIComponent(newSessionId)}` });
  deleteStatus = del.status;
  record({ dir: "tunnel", step: "delete-created", id: newSessionId, status: del.status, body: del.text.slice(0, 120) });
  console.log(`@${at()} tunnel DELETE ${newSessionId} -> ${del.status} ${del.text.slice(0, 40)}`);
}
await call("session/list", {});
await sleep(2000);

const verdict = afterSpawn >= 1 && afterTunnel === afterSpawn && tunnelStatus >= 200 && tunnelStatus < 300 && deleteStatus >= 200 && deleteStatus < 300
  ? "TUNNEL_ON_ACP_PORT_AND_DELETE_OK"
  : "CHECK_TRACE";
record({ dir: "verdict", verdict, afterSpawn, afterTunnel, tunnelStatus, deleteStatus });
console.log(`\nverdict: ${verdict}\n`);

const dir = "traces/opencode";
mkdirSync(dir, { recursive: true });
const file = `${dir}/opencode-acp-${new Date().toISOString().replace(/[:.]/g, "-")}-bridge-route.jsonl`;
writeFileSync(file, trace.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
console.log(`trace: ${file}`);
await req("/kill", "POST", {});
await streamDone;
process.exit(0);
