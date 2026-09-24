#!/usr/bin/env node
/*
 * 实验：`session/cancel` 以 **notification**（不带 `id`）发出，能否在纯 stdio 上端到端掐断
 * 一个正在跑的 turn——不需要 HTTP 端口，不需要第二个进程。
 *
 * 这条实验决定 `app/plugins/engine-bridge.ts` 里的双进程分流（spawn `acp --port` + 按路径
 * 形状把 abort 转给 ACP 端口）是不是承重结构。先前的 `spike/probe-session-cancel.mjs` 把同名
 * 方法当 **request** 发（带 `id`），拿到 -32601，于是仓库得出"ACP 没有中断能力"的结论。那个结论
 * 是错的：SDK 只在 notification 分支路由这个方法名。
 *
 * 已入库结果：`traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl`
 * verdict `CANCELLED_VIA_NOTIFICATION`，notification 发出后 53ms 收到 prompt 响应
 * `stopReason:"cancelled"`【实测：opencode 1.18.32】。
 * 那份 trace 由本脚本的一次性版本产出，差异只在输出路径与 cwd 解析；报文内容逐字节未改。
 *
 * 副作用：spawn `opencode acp`；在一个全新 tmpdir cwd 下建一条会话，会在全局 opencode 存储
 * 里留一行。这条实验**需要真模型 turn**（免费模型限流会影响它）——本仓库其余探针刻意做成
 * provider-free，这条是例外，因为它测的就是在途 turn 能否被掐断。
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CANDIDATES = [
  process.env.T3RRA_ENGINE_BIN,
  "opencode",
  join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"),
].filter(Boolean);
const MODEL = process.env.T3RRA_PROBE_MODEL ?? "opencode/nemotron-3.5-lightning-free";
const OBSERVE_MS = Number(process.env.T3RRA_CANCEL_OBSERVE_MS ?? 6_000);

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
const tracePath = () => join(traceDir, `opencode-acp-${stamp()}-cancel-notification.jsonl`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const bin = await resolveBinary();
  if (bin === null) {
    console.error("opencode not found. Set T3RRA_ENGINE_BIN.");
    process.exit(2);
  }
  const cwd = join(tmpdir(), "t3rra-spike-cwd");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(traceDir, { recursive: true });

  const trace = [];
  const t0 = Date.now();
  const record = (entry) => trace.push({ t_ms: Date.now() - t0, ...entry });
  const log = (message) => console.log(`@${String(Date.now() - t0).padStart(6)} ${message}`);

  const child = spawn(bin, ["acp"], { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  const pending = new Map();
  let updateCount = 0;

  // LF framing only — U+2028/U+2029 are legal inside JSON strings, so a line-based reader
  // (readline) would split payloads. Same discipline as the bridge.
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      if (line === "") continue;
      record({ dir: "in", raw: line.slice(0, 4000) });
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof message.id === "number" && (message.result !== undefined || message.error !== undefined)) {
        const settle = pending.get(message.id);
        if (settle !== undefined) {
          pending.delete(message.id);
          settle(message);
        }
      }
      if (message.method === "session/update") updateCount += 1;
    }
  });
  child.stderr.on("data", (chunk) => record({ dir: "stderr", text: String(chunk).slice(0, 400) }));

  const send = (object) => {
    record({ dir: "out", raw: JSON.stringify(object) });
    child.stdin.write(`${JSON.stringify(object)}\n`);
  };
  const request = (id, method, params, timeoutMs = 120_000) =>
    new Promise((done) => {
      const timer = setTimeout(() => {
        if (pending.delete(id)) done({ error: { message: `${method} timed out after ${timeoutMs}ms` } });
      }, timeoutMs);
      pending.set(id, (message) => {
        clearTimeout(timer);
        done(message);
      });
      send({ jsonrpc: "2.0", id, method, params });
    });

  let verdict = "UNKNOWN";
  try {
    const init = await request(1, "initialize", { protocolVersion: 1, clientInfo: { name: "t3rra-spike", version: "0" }, clientCapabilities: {} });
    if (init.error !== undefined) throw new Error(`initialize failed: ${JSON.stringify(init.error)}`);
    log("initialize ok");

    const created = await request(2, "session/new", { cwd, mcpServers: [] });
    const sessionId = created.result?.sessionId;
    if (typeof sessionId !== "string") throw new Error(`session/new returned no sessionId: ${JSON.stringify(created).slice(0, 200)}`);
    log(`session ${sessionId}`);

    const modelSet = await request(3, "session/set_config_option", { sessionId, configId: "model", value: MODEL });
    if (modelSet.error !== undefined) throw new Error(`set_config_option failed: ${JSON.stringify(modelSet.error).slice(0, 200)}`);
    log(`model set to ${MODEL}`);

    const promptReply = request(4, "session/prompt", { sessionId, prompt: [{ type: "text", text: "Count from 1 to 500, one number per line. Do not stop early." }] });
    await sleep(OBSERVE_MS);
    log(`updates before cancel: ${updateCount}`);

    // 本实验的全部要点在这一行：没有 `id` 字段。
    send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } });
    log("--- sent session/cancel notification (no id) ---");

    const reply = await Promise.race([promptReply, sleep(60_000).then(() => null)]);
    if (reply?.result?.stopReason === "cancelled") verdict = "CANCELLED_VIA_NOTIFICATION";
    else if (reply?.error !== undefined) verdict = `ERROR_RESPONSE ${JSON.stringify(reply.error).slice(0, 120)}`;
    else if (reply?.result !== undefined) verdict = `ENDED_NOT_CANCELLED stopReason=${reply.result.stopReason}`;
    else verdict = "NO_RESPONSE_WITHIN_60S";
    log(`prompt reply after cancel: ${JSON.stringify(reply ?? null).slice(0, 200)}`);

    await sleep(2_000);
    record({ dir: "verdict", verdict, updateCount });
    log(`verdict: ${verdict} (total updates ${updateCount})`);
  } catch (error) {
    verdict = `PROBE_ERROR ${String(error).slice(0, 200)}`;
    log(verdict);
    record({ dir: "verdict", verdict });
  } finally {
    const file = tracePath();
    writeFileSync(file, `${trace.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
    log(`trace: ${file}`);
    child.kill();
    await sleep(300);
    console.log(`\nverdict: ${verdict}`);
  }
}

void main();
