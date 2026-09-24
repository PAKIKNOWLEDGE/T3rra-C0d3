#!/usr/bin/env node
/*
 * Split-brain：会话在 ACP 子进程的内存里、经由**另一个** `opencode serve` 删除之后，
 * stdio 上的 `session/list` 还会不会列出它？
 *
 * 这条实验是盲审提出的，直接打在验收清单 #2（会话删除）上，而 #2 已被仓库主人勾过。
 *
 * 已入库结果：`traces/opencode/opencode-acp-2026-09-24T10-35-48-113Z-split-brain.jsonl`
 * verdict `splitBrainStillListed:true`，`deleteStatus:200`，`serveGetStatus:404`【实测】——
 * 即：DELETE 成功、serve 侧 GET 已经 404，但 stdio `session/list` 仍然列出该会话。
 * 顺带补齐 F11 缺的行形状证据：真实 `session/list` 行含 `sessionId` / `cwd` / `title`
 * （新建会话**有** title，形如 `New session - <ISO>`）/ `updatedAt`（**ISO 字符串**，不是毫秒数）。
 *
 * provider-free：只碰 initialize / session/new / session/list / HTTP DELETE，不花 token。
 * 副作用：在全局 opencode 存储里留下（并删掉）一条 TEST 前缀会话。
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
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
const SERVE_PORT = Number(process.env.T3RRA_SPLIT_BRAIN_PORT ?? 56790);
const SERVE_WAIT_MS = Number(process.env.T3RRA_SPLIT_BRAIN_WAIT_MS ?? 4_000);

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const httpJson = (method, path, port = SERVE_PORT) =>
  new Promise((done) => {
    const request = httpRequest({ host: "127.0.0.1", port, path, method }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => done({ status: response.statusCode ?? 0, text: text.slice(0, 1500) }));
    });
    request.on("error", (error) => done({ status: 0, text: String(error).slice(0, 200) }));
    request.end();
  });

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
  const pending = new Map();
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
    }
  });

  const send = (object) => {
    record({ dir: "out", raw: JSON.stringify(object) });
    child.stdin.write(`${JSON.stringify(object)}\n`);
  };
  const request = (id, method, params, timeoutMs = 15_000) =>
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

  let serve;
  let verdict = "UNKNOWN";
  try {
    const init = await request(1, "initialize", { protocolVersion: 1, clientInfo: { name: "t3rra-spike", version: "0" }, clientCapabilities: {} });
    if (init.error !== undefined) throw new Error(`initialize failed: ${JSON.stringify(init.error).slice(0, 200)}`);

    const created = await request(2, "session/new", { cwd, mcpServers: [] });
    const liveId = created.result?.sessionId;
    if (typeof liveId !== "string") throw new Error(`session/new returned no sessionId: ${JSON.stringify(created).slice(0, 200)}`);
    log(`live session: ${liveId}`);

    const listBefore = await request(3, "session/list", { cwd });
    record({ dir: "note", step: "list-after-new", value: listBefore.result });
    const rowsBefore = listBefore.result?.sessions ?? [];
    log(`list #1 rows: ${rowsBefore.length}, contains live: ${rowsBefore.some((row) => row.sessionId === liveId)}`);

    serve = spawn(bin, ["serve", "--port", String(SERVE_PORT)], { cwd, stdio: "ignore", windowsHide: true });
    await sleep(SERVE_WAIT_MS);

    const deleted = await httpJson("DELETE", `/session/${encodeURIComponent(liveId)}`);
    log(`serve DELETE -> ${deleted.status} ${deleted.text.slice(0, 40)}`);
    const fetched = await httpJson("GET", `/session/${encodeURIComponent(liveId)}`);
    log(`serve GET after delete -> ${fetched.status} ${fetched.text.slice(0, 60)}`);

    const listAfter = await request(4, "session/list", { cwd });
    record({ dir: "note", step: "list-after-delete", value: listAfter.result });
    const rowsAfter = listAfter.result?.sessions ?? [];
    const stillListed = rowsAfter.some((row) => row.sessionId === liveId);
    log(`stdio list still contains the DB-deleted session? ${stillListed}`);
    verdict = stillListed ? "SPLIT_BRAIN_CONFIRMED" : "SPLIT_BRAIN_NOT_REPRODUCED";

    record({ dir: "verdict", verdict, splitBrainStillListed: stillListed, deleteStatus: deleted.status, serveGetStatus: fetched.status, rowsBefore: rowsBefore.length, rowsAfter: rowsAfter.length });
    log(`verdict: ${verdict}`);
  } catch (error) {
    verdict = `PROBE_ERROR ${String(error).slice(0, 200)}`;
    log(verdict);
    record({ dir: "verdict", verdict });
  } finally {
    const file = join(traceDir, `opencode-acp-${stamp()}-split-brain.jsonl`);
    writeFileSync(file, `${trace.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
    log(`trace: ${file}`);
    serve?.kill();
    child.kill();
    await sleep(300);
    console.log(`\nverdict: ${verdict}`);
  }
}

void main();
