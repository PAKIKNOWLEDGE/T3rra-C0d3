#!/usr/bin/env node
/*
 * One-off ACP probe against `opencode acp`. Adapted from t3rra-core's scripts/spike-acp.mjs,
 * whose discipline this keeps verbatim:
 *
 *   - not part of any app build, never imported by src/, never shipped
 *   - its only product is the trace file it writes
 *   - client capabilities are sent EMPTY, on purpose: the question is what the engine does
 *     when the client declares nothing
 *   - handshake only == zero tokens spent (there is a --prompt switch, off by default)
 *
 * Why: docs/archive/recommendation.md §4 asks four falsifiable questions, and every one of them is
 * a message-level question. Running `opencode acp` answers them; reading its source would
 * not answer question 1 (does the message exist in the bytes) any better.
 *
 *   node spike/spike-acp-opencode.mjs            # handshake only — zero tokens
 *   node spike/spike-acp-opencode.mjs --prompt   # handshake + one short instruction
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const WITH_PROMPT = process.argv.includes("--prompt");
const MODEL = process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : null;
/* Permission has to be asked for before the engine will ask US. The config is written into
   the scratch project dir only (never the user's global config), from the shape in the
   official schema (traces/opencode/opencode-config.schema.json): permission.<tool> = ask. */
const WANT_PERMISSION = process.argv.includes("--write");
const HANDSHAKE_SETTLE_MS = 3000;
const PROMPT_TIMEOUT_MS = 240_000;

/* Resolve the engine the way the future adapter will: explicit override, then PATH, then the
   known install location. npm's shim is a .ps1/.cmd pair — spawn the real binary instead. */
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
const base = join(traceDir, `opencode-acp-${stamp()}${WITH_PROMPT ? "-prompt" : "-handshake"}`);
const tracePath = `${base}.jsonl`;

const SCRATCH_CWD = join(tmpdir(), "t3rra-spike-cwd");
mkdirSync(SCRATCH_CWD, { recursive: true });
const PROJECT_CONFIG = join(SCRATCH_CWD, "opencode.json");
if (WANT_PERMISSION) {
  writeFileSync(
    PROJECT_CONFIG,
    JSON.stringify({ "$schema": "https://opencode.ai/config.json", permission: { edit: "ask", bash: "ask" } }, null, 2),
    "utf8",
  );
}
/* Leaving this behind would silently make every later spike start asking for permission —
   the experiment must clean up after itself. */
const cleanup = () => { if (WANT_PERMISSION) rmSync(PROJECT_CONFIG, { force: true }); };

const trace = [];
const record = (dir, msg, t0) => {
  const line = { t_ms: Date.now() - t0, dir, ...msg };
  trace.push(line);
  return line;
};
const askedOfUs = [];

async function main() {
  const bin = await resolveBinary();
  if (!bin) {
    console.error("opencode not found. Set T3RRA_ENGINE_BIN to the full path.");
    process.exit(2);
  }
  console.log(`binary: ${bin}`);
  console.log(`scratch cwd: ${SCRATCH_CWD}`);

  const child = spawn(bin, ["acp"], { cwd: SCRATCH_CWD, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const t0 = Date.now();

  const stderrLines = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    for (const line of chunk.split("\n")) {
      if (line.trim()) {
        stderrLines.push(line);
        record("stderr", { method: "stderr", params: { text: line } }, t0);
      }
    }
  });

  let exited = null;
  child.on("close", (code, signal) => {
    exited = { code, signal };
    record("event", { method: "process_exit", params: { code, signal } }, t0);
  });
  child.on("error", (err) => record("event", { method: "process_error", params: { message: String(err) } }, t0));

  const send = (msg) => {
    record("out", msg, t0);
    child.stdin.write(JSON.stringify(msg) + "\n");
  };

  const pending = new Map();
  let nextId = 1;
  const request = (method, params) =>
    new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej, method });
      send({ jsonrpc: "2.0", id, method, params });
    });

  /* Inbound framing: one JSON object per LF. Deliberately not readline — U+2028/U+2029 are
     legal inside JSON strings and would split a line. */
  let buffer = "";
  const notifications = [];
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
      } catch (err) {
        record("in_unparsed", { method: "parse_error", params: { text: line, error: String(err) } }, t0);
        continue;
      }
      record("in", msg, t0);
      handle(msg);
    }
  });

  function handle(msg) {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const waiter = pending.get(msg.id);
      if (waiter) {
        pending.delete(msg.id);
        if (msg.error) waiter.rej(new Error(`${waiter.method}: ${JSON.stringify(msg.error)}`));
        else waiter.res(msg.result);
      }
      return;
    }
    if (msg.id !== undefined) {
      if (msg.method === "session/request_permission") {
        /* The whole point of --write: does the "dead" approval verdict come alive here?
           We answer with the reject option so the full ACP flow is exercised, and we print
           only ids/kinds — never the tool input. */
        const options = msg.params?.options ?? [];
        console.log(`\n!! permission requested — toolCall kind=${msg.params?.toolCall?.kind} options=${JSON.stringify(options.map((o) => ({ optionId: o.optionId, kind: o.kind })))}`);
        const reject = options.find((o) => /reject|deny|cancel/i.test(`${o.optionId} ${o.kind ?? ""} ${o.name ?? ""}`)) ?? options[options.length - 1];
        askedOfUs.push("session/request_permission(answered: reject)");
        record({ dir: "in", method: "session/request_permission", params: { chosen: reject?.optionId ?? null, optionIds: options.map((o) => o.optionId) } }, t0);
        send({ jsonrpc: "2.0", id: msg.id, result: { outcome: { outcome: "selected", optionId: reject?.optionId } } });
        return;
      }
      askedOfUs.push(msg.method);
      console.log(`\n!! engine reached back for: ${msg.method}\n   params: ${JSON.stringify(msg.params).slice(0, 400)}`);
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "spike client declares no capabilities" } });
      return;
    }
    notifications.push(msg.method === "session/update" ? msg.params : { method: msg.method, params: msg.params });
  }

  // ---- handshake ------------------------------------------------------------
  const init = await request("initialize", {
    protocolVersion: 1,
    clientInfo: { name: "t3rra-spike", version: "0.0.0" },
    clientCapabilities: {},
  });
  console.log(`\nagent: ${init.agentInfo?.name} ${init.agentInfo?.version}`);
  console.log(`protocolVersion: ${init.protocolVersion}`);
  console.log(`authMethods: ${JSON.stringify(init.authMethods ?? [])}`);
  console.log(`agentCapabilities: ${JSON.stringify(init.agentCapabilities)}`);

  // omp answered `authenticate` with {} unconditionally; opencode's method ids differ, so try
  // what it advertises and record what actually comes back instead of assuming.
  for (const method of init.authMethods ?? []) {
    try {
      const result = await request("authenticate", { methodId: method.id });
      console.log(`authenticate(${method.id}): ${JSON.stringify(result)}`);
    } catch (err) {
      console.log(`authenticate(${method.id}) failed: ${String(err).slice(0, 200)}`);
    }
  }

  const session = await request("session/new", { cwd: SCRATCH_CWD, mcpServers: [] });
  writeFileSync(`${base}-session-new.json`, JSON.stringify(session, null, 2), "utf8");
  console.log(`\nsessionId: ${session.sessionId}`);
  console.log(`modes: ${JSON.stringify(session.modes ?? null)}`);
  console.log("configOptions:");
  for (const opt of session.configOptions ?? []) {
    console.log(`  - ${opt.id} [${opt.category ?? "-"}] current=${opt.currentValue}`);
    if (opt.options?.length) console.log(`      ${opt.options.map((o) => o.value).join(", ")}`);
  }

  await new Promise((r) => setTimeout(r, HANDSHAKE_SETTLE_MS));

  /* Optionally switch model before prompting — free zen models cost nothing, which is the
     only reason the prompt switch exists at all. The response carries the full updated
     option list, so this also shows what the UI must re-render after a model change. */
  if (MODEL) {
    try {
      const updated = await request("session/set_config_option", { sessionId: session.sessionId, configId: "model", value: MODEL });
      const ids = (updated?.configOptions ?? []).map((o) => `${o.id}=${o.currentValue}`);
      console.log(`\nmodel set to ${MODEL} — options now: ${JSON.stringify(ids)}`);
    } catch (err) {
      console.log(`\nset model failed: ${String(err).slice(0, 200)}`);
    }
  }

  /* Question 4 of docs/archive/recommendation.md §4: does session/load replay? The zero-token way to
     ask is to load the session we just created — it is empty, so no instruction is spent and
     no pre-existing user session is copied into the trace. */
  try {
    const before = notifications.length;
    const loaded = await request("session/load", { sessionId: session.sessionId, cwd: SCRATCH_CWD, mcpServers: [] });
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`\nsession/load: ok — replayed updates: ${notifications.length - before}, result keys: ${JSON.stringify(Object.keys(loaded ?? {}))}`);
  } catch (err) {
    console.log(`\nsession/load failed: ${String(err).slice(0, 300)}`);
  }

  if (WITH_PROMPT) {
    const before = notifications.length;
    console.log("\nprompting…");
    let timer;
    const response = await Promise.race([
      request("session/prompt", {
        sessionId: session.sessionId,
        prompt: [
          {
            type: "text",
            text: WANT_PERMISSION
              ? "Create a file named spike-permission-probe.txt in this directory containing exactly: ok. Then stop."
              : "Look at this directory. Report how many files it contains and what the single largest one is. Change nothing, create nothing.",
          },
        ],
      }),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error("prompt timeout")), PROMPT_TIMEOUT_MS);
      }),
    ])
      .catch((err) => ({ error: String(err) }))
      .finally(() => clearTimeout(timer));
    console.log(`\nstopReason: ${response.stopReason ?? `(error: ${response.error})`}`);
    console.log(`usage: ${JSON.stringify(response.usage)}`);
    console.log(`updates for this prompt: ${notifications.length - before}`);
  }

  child.stdin.end();
  child.kill();
  await new Promise((r) => setTimeout(r, 500));
  child.stdout.destroy();
  child.stderr.destroy();
  cleanup();

  const byKind = new Map();
  for (const n of notifications) {
    const kind = n.update?.sessionUpdate ?? n.method ?? "(unknown)";
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
  }
  console.log(`\n=== session/update kinds observed ===`);
  for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(4)}  ${kind}`);
  console.log(`\nreached back for: ${askedOfUs.length ? [...new Set(askedOfUs)].join(", ") : "NOTHING (declared no capabilities, asked for none)"}`);
  console.log(`stderr lines: ${stderrLines.length}`);
  for (const line of stderrLines.slice(0, 12)) console.log(`  | ${line}`);
  console.log(`process: ${JSON.stringify(exited)}`);

  writeFileSync(tracePath, trace.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  console.log(`\ntrace: ${tracePath}`);
  console.log(`messages: ${trace.length}`);
}

main().catch((err) => {
  console.error(`spike failed: ${err?.stack ?? err}`);
  cleanup();
  writeFileSync(tracePath, trace.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  process.exit(1);
});