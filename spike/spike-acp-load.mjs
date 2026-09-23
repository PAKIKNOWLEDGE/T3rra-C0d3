#!/usr/bin/env node
/*
 * Redacted session/load probe against `opencode acp`.
 *
 * Question it answers (docs/recommendation.md §4, Q4): when opencode replays a session that
 * HAS history, what actually comes over the wire — and as which notifications?
 *
 * Privacy is a design constraint here, not a footnote:
 *   - the trace records only { t_ms, dir, method, kind } plus coarse counts
 *   - message text, tool inputs, file paths and cwd are NEVER written or printed
 *   - the session id is printed truncated
 * Zero tokens: loading replays stored history, it does not call a model.
 *
 *   node spike/spike-acp-load.mjs
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REPLAY_WINDOW_MS = 12_000;
const CANDIDATES = [
  process.env.T3RRA_ENGINE_BIN,
  "opencode",
  join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"),
].filter(Boolean);

const probe = (candidate) =>
  new Promise((res) => {
    const child = spawn(candidate, ["--version"], { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
    child.on("error", () => res(false));
    child.once("close", (code) => res(code === 0));
  });
async function resolveBinary() {
  for (const candidate of CANDIDATES) if (await probe(candidate)) return candidate;
  return null;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const traceDir = join(ROOT, "traces", "opencode");
mkdirSync(traceDir, { recursive: true });
const tracePath = join(traceDir, `opencode-acp-${stamp()}-load-redacted.jsonl`);

const trace = [];
const record = (entry, t0) => {
  trace.push({ t_ms: Date.now() - t0, ...entry });
};

async function main() {
  const bin = await resolveBinary();
  if (!bin) {
    console.error("opencode not found. Set T3RRA_ENGINE_BIN.");
    process.exit(2);
  }
  const scratch = join(tmpdir(), "t3rra-spike-cwd");
  mkdirSync(scratch, { recursive: true });

  const child = spawn(bin, ["acp"], { cwd: scratch, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const t0 = Date.now();
  child.stderr.setEncoding("utf8");
  let stderrLines = 0;
  child.stderr.on("data", (chunk) => { stderrLines += chunk.split("\n").filter((l) => l.trim()).length; });

  const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
  const pending = new Map();
  let nextId = 1;
  const request = (method, params) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej, method });
      send({ jsonrpc: "2.0", id, method, params });
    });

  // kind histogram of what comes back; nothing else is retained
  const kinds = new Map();
  const bump = (kind) => kinds.set(kind, (kinds.get(kind) ?? 0) + 1);

  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        record({ dir: "in_unparsed" }, t0);
        continue;
      }
      if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
        const waiter = pending.get(msg.id);
        if (waiter) {
          pending.delete(msg.id);
          msg.error ? waiter.rej(new Error(`${waiter.method}: ${JSON.stringify(msg.error).slice(0, 200)}`)) : waiter.res(msg.result);
        }
        continue;
      }
      if (msg.method === "session/update") {
        const kind = msg.params?.update?.sessionUpdate ?? "(no sessionUpdate field)";
        bump(kind);
        record({ dir: "in", method: "session/update", kind }, t0);
        continue;
      }
      // agent -> client request: name only, no params
      bump(`request:${msg.method}`);
      record({ dir: "in", method: msg.method }, t0);
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "spike client declares no capabilities" } });
    }
  });

  await request("initialize", { protocolVersion: 1, clientInfo: { name: "t3rra-spike", version: "0.0.0" }, clientCapabilities: {} });

  // ---- list sessions, then load the newest one that has history -----------------
  const list = await request("session/list", {});
  const sessions = list?.sessions ?? list?.items ?? (Array.isArray(list) ? list : []);
  console.log(`session/list: ${sessions.length} session(s)`);
  if (!sessions.length) {
    console.log("no session to load — nothing to prove.");
    child.stdin.end(); child.kill();
    return;
  }
  console.log(`entry fields: ${JSON.stringify(Object.keys(sessions[0]))}   (keys only, no values)`);

  /* Skip the empty sessions this spike family created — loading one proves nothing about
     replay. Metadata only is used to choose; titles are never read, printed, or written. */
  const OURS = new Set(["ses_f3b63e3afffeKelLa6rgUHWaik", "ses_f3b64a366ffeQXQi7ZwIsWyscq", "ses_f3338f7e7ffeKQ6qVGBamuAKkK"]);
  const ours = sessions.filter((s) => OURS.has(s.sessionId ?? s.id)).length;
  const candidates = sessions.filter((s) => !OURS.has(s.sessionId ?? s.id));
  console.log(`sessions created by this spike family (skipped): ${ours}   loadable: ${candidates.length}`);

  const history = (entry) =>
    Number(entry.messageCount ?? entry.messages ?? entry.message_count ?? (Array.isArray(entry.history) ? entry.history.length : 0)) || 0;
  const when = (entry) => new Date(entry.updatedAt ?? entry.time?.updated ?? entry.createdAt ?? 0).getTime();
  const ranked = [...candidates].sort((a, b) => history(b) - history(a) || when(b) - when(a));
  if (!ranked.length) {
    console.log("nothing but our own empty sessions — abort, no evidence to gain.");
    child.stdin.end(); child.kill();
    return;
  }
  const newest = ranked[0];
  const id = newest.sessionId ?? newest.id;
  console.log(`picked: ${String(id).slice(0, 12)}…  reported history: ${history(newest)}  cwd present: ${Boolean(newest.cwd)}`);

  const before = new Map(kinds);
  const loadStart = Date.now();
  try {
    const loaded = await request("session/load", {
      sessionId: id,
      cwd: newest.cwd ?? scratch,
      mcpServers: [],
    });
    console.log(`session/load: ok — result keys: ${JSON.stringify(Object.keys(loaded ?? {}))}`);
  } catch (err) {
    console.log(`session/load failed: ${String(err).slice(0, 300)}`);
  }
  await new Promise((r) => setTimeout(r, REPLAY_WINDOW_MS));

  child.stdin.end();
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  child.stdout.destroy();
  child.stderr.destroy();

  const replayed = (k) => (kinds.get(k) ?? 0) - (before.get(k) ?? 0);
  console.log(`\n=== replayed in ~${REPLAY_WINDOW_MS / 1000}s of load (kinds only, no content) ===`);
  for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${kind}${replayed(kind) ? `   (${replayed(kind)} during load)` : ""}`);
  }
  console.log(`stderr lines: ${stderrLines}`);
  console.log(`trace: ${tracePath}`);
  writeFileSync(tracePath, trace.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
}

main().catch((err) => {
  console.error(`probe failed: ${err?.stack ?? err}`);
  writeFileSync(tracePath, trace.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  process.exit(1);
});