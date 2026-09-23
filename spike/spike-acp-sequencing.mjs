#!/usr/bin/env node
/*
 * Two zero-token questions left open by the docs+spike cross-check:
 *
 *   A. Grok's docs say the ACP surface exposes "Effort (when the model has variants)".
 *      Our handshake only ever showed `model` + `mode` — because the default model may have
 *      no variants. So: switch the model and watch whether a third option appears.
 *
 *   B. The ACP spec says session/load MUST replay the whole conversation and respond only
 *      after every entry has streamed. Our first probe could not tell the order apart,
 *      because it never timestamped the response. It matters: if opencode answers first,
 *      an adapter must not treat "load resolved" as "history complete".
 *
 * Zero tokens: no prompt is ever sent; loading replays stored history.
 *
 *   node spike/spike-acp-sequencing.mjs
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REPLAY_WINDOW_MS = 10_000;
const OURS = new Set(["ses_f3b63e3afffeKelLa6rgUHWaik", "ses_f3b64a366ffeQXQi7ZwIsWyscq", "ses_f3338f7e7ffeKQ6qVGBamuAKkK"]);
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
const tracePath = join(traceDir, `opencode-acp-${stamp()}-sequencing-redacted.jsonl`);

const trace = [];
const record = (entry, t0) => trace.push({ t_ms: Date.now() - t0, ...entry });

async function main() {
  const bin = await resolveBinary();
  if (!bin) { console.error("opencode not found. Set T3RRA_ENGINE_BIN."); process.exit(2); }
  const scratch = join(tmpdir(), "t3rra-spike-cwd");
  mkdirSync(scratch, { recursive: true });

  const child = spawn(bin, ["acp"], { cwd: scratch, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const t0 = Date.now();
  child.stderr.setEncoding("utf8");
  let stderrBytes = 0;
  child.stderr.on("data", (c) => { stderrBytes += c.length; });

  const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");
  const pending = new Map();
  let nextId = 1;
  const request = (method, params) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej, method });
      send({ jsonrpc: "2.0", id, method, params });
    });

  let updatesSeen = 0;
  const optionIds = (result) => (result?.configOptions ?? []).map((o) => `${o.id}=${o.currentValue}`);
  const modelValues = [];

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
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
        const waiter = pending.get(msg.id);
        if (waiter) {
          pending.delete(msg.id);
          msg.error ? waiter.rej(new Error(`${waiter.method}: ${JSON.stringify(msg.error).slice(0, 200)}`)) : waiter.res(msg.result);
        }
        continue;
      }
      if (msg.method === "session/update") {
        updatesSeen++;
        record({ dir: "in", method: "session/update", kind: msg.params?.update?.sessionUpdate ?? "?" }, t0);
        continue;
      }
      record({ dir: "in", method: msg.method }, t0);
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "spike client declares no capabilities" } });
    }
  });

  await request("initialize", { protocolVersion: 1, clientInfo: { name: "t3rra-spike", version: "0.0.0" }, clientCapabilities: {} });
  const session = await request("session/new", { cwd: scratch, mcpServers: [] });
  const sessionId = session.sessionId;

  console.log(`session/new options: ${JSON.stringify(optionIds(session))}`);
  const modelOption = (session.configOptions ?? []).find((o) => o.id === "model");
  for (const o of modelOption?.options ?? []) modelValues.push(o.value);

  // ---- A: does a third option appear for other models? ------------------------
  console.log(`\n=== A. effort/variants per model (${modelValues.length} models advertised) ===`);
  record({ dir: "meta", method: "options_at_new", option_ids: optionIds(session) }, t0);
  for (const value of modelValues) {
    try {
      const updated = await request("session/set_config_option", { sessionId, configId: "model", value });
      const ids = optionIds(updated);
      console.log(`  ${value.padEnd(42)} -> ${JSON.stringify(ids)}`);
      // Landed on purpose: the doc claims per-model `effort` values, and a console log is not
      // evidence. Option ids/values are not user data — this is safe to keep.
      record({ dir: "meta", method: "set_config_option", model: value, option_ids: ids }, t0);
    } catch (err) {
      console.log(`  ${value.padEnd(42)} -> ${String(err).slice(0, 120)}`);
      break; // an unsupported method will fail for every value; stop shouting
    }
  }

  // ---- B: does load respond before or after replay? ---------------------------
  const list = await request("session/list", {});
  const sessions = (list?.sessions ?? list?.items ?? []).filter((s) => !OURS.has(s.sessionId ?? s.id));
  const when = (e) => new Date(e.updatedAt ?? 0).getTime();
  /* session/list exposes no message count, so "has history" cannot be read off the list.
     Pass --session <id-prefix> to aim at a session already known to replay content. */
  const wanted = process.argv.includes("--session") ? process.argv[process.argv.indexOf("--session") + 1] : null;
  const target = wanted
    ? sessions.find((s) => String(s.sessionId ?? s.id).startsWith(wanted))
    : [...sessions].sort((a, b) => when(b) - when(a))[0];
  if (!target) { console.log("\nno matching non-spike session to load."); child.stdin.end(); child.kill(); return; }

  console.log(`\n=== B. load sequencing (session ${String(target.sessionId).slice(0, 12)}…) ===`);
  const beforeLoad = updatesSeen;
  const tLoadSent = Date.now() - t0;
  let tResponse = null;
  const loadPromise = request("session/load", { sessionId: target.sessionId, cwd: target.cwd ?? scratch, mcpServers: [] })
    .then((r) => { tResponse = Date.now() - t0; return r; })
    .catch((err) => { tResponse = Date.now() - t0; return { error: String(err).slice(0, 200) }; });
  const loaded = await loadPromise;
  const atResponse = updatesSeen;
  /* Landed on purpose: the adapter doc claims the replay streams *before* the response
     resolves (ACP: "respond only after all entries streamed"). That ordering is only
     checkable if the response timestamp is in the trace, so it goes in. */
  record(
    {
      dir: "meta",
      method: "load_timing",
      load_sent_ms: tLoadSent,
      load_response_ms: tResponse,
      updates_before_response: atResponse - beforeLoad,
      updates_after_response_so_far: 0,
    },
    t0,
  );
  await new Promise((r) => setTimeout(r, REPLAY_WINDOW_MS));
  record({ dir: "meta", method: "load_timing", phase: "settled", updates_total: updatesSeen - beforeLoad }, t0);

  console.log(`  load sent at        ${tLoadSent} ms`);
  console.log(`  load responded at   ${tResponse} ms  (updates so far: ${atResponse - beforeLoad})`);
  console.log(`  updates after resp: ${updatesSeen - atResponse}`);
  console.log(`  result: ${JSON.stringify(loaded).slice(0, 160)}`);
  console.log(`  verdict: ${atResponse - beforeLoad > 0
    ? "replay streams BEFORE the response resolves (spec-conformant: respond last)"
    : "response resolves FIRST, replay streams after it (adapter must not treat resolve as 'history complete')"}`);

  child.stdin.end();
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  child.stdout.destroy();
  child.stderr.destroy();
  console.log(`stderr bytes: ${stderrBytes}`);
  console.log(`trace: ${tracePath}`);
  writeFileSync(tracePath, trace.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
}

main().catch((err) => {
  console.error(`probe failed: ${err?.stack ?? err}`);
  writeFileSync(tracePath, trace.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  process.exit(1);
});