#!/usr/bin/env node
/*
 * 删除路径的两种顺序，哪一种能真正消除 split-brain（F21）？
 *
 * 已知事实【实测】：经 `serve` 发 DELETE 得 200、随后 GET 得 404，但 ACP 子进程的 stdio
 * `session/list` 仍列出该会话（traces/opencode/*-split-brain.jsonl）。原因是那份会话还在
 * ACP 进程的内存里（run-state 是进程内内存态）。
 *
 * 本探针测两条候选路径：
 *   A: 先 stdio `session/close`，再 serve DELETE
 *   B: 先 serve DELETE，再 stdio `session/close`
 * 各自用 stdio `session/list` 判定“引擎是否还认为它存在”。
 *
 * provider-free：只用 initialize / session/new / session/close / session/list + HTTP，不花 token。
 * 副作用：在全局 opencode 存储里建两条 TEST 会话并删除它们的库行（内存态随子进程退出消失）。
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
const SERVE_PORT = Number(process.env.T3RRA_DELETE_VERIFY_PORT ?? 56791);
const SERVE_WAIT_MS = Number(process.env.T3RRA_SERVE_WAIT_MS ?? 4_000);

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const httpJson = (method, path) =>
  new Promise((done) => {
    const req = httpRequest({ host: "127.0.0.1", port: SERVE_PORT, path, method }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => done({ status: res.statusCode ?? 0, text: text.slice(0, 400) }));
    });
    req.on("error", (error) => done({ status: 0, text: String(error).slice(0, 200) }));
    req.end();
  });

async function main() {
  const bin = await resolveBinary();
  if (bin === null) {
    console.error("opencode not found. Set T3RRA_ENGINE_BIN.");
    process.exit(2);
  }
  const cwd = join(tmpdir(), "t3rra-spike-cwd");
  mkdirSync(cwd, { recursive: true });
  const traceDir = join(ROOT, "traces", "opencode");
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
      record({ dir: "in", raw: line.slice(0, 3000) });
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

  let nextId = 1;
  const send = (object) => {
    record({ dir: "out", raw: JSON.stringify(object) });
    child.stdin.write(`${JSON.stringify(object)}\n`);
  };
  const request = (method, params, timeoutMs = 15_000) =>
    new Promise((done) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        if (pending.delete(id)) done({ error: { message: `${method} timed out after ${timeoutMs}ms` } });
      }, timeoutMs);
      pending.set(id, (message) => {
        clearTimeout(timer);
        done(message);
      });
      send({ jsonrpc: "2.0", id, method, params });
    });

  const listed = async (sessionId) => {
    const result = await request("session/list", { cwd });
    const rows = result.result?.sessions ?? [];
    return rows.some((row) => row.sessionId === sessionId);
  };

  let serve;
  const verdict = {};
  try {
    await request("initialize", { protocolVersion: 1, clientInfo: { name: "t3rra-spike", version: "0" }, clientCapabilities: {} });
    const madeA = await request("session/new", { cwd, mcpServers: [] });
    const madeB = await request("session/new", { cwd, mcpServers: [] });
    const idA = madeA.result?.sessionId;
    const idB = madeB.result?.sessionId;
    if (typeof idA !== "string" || typeof idB !== "string") throw new Error(`session/new failed: ${JSON.stringify({ madeA, madeB }).slice(0, 240)}`);
    log(`TEST-A ${idA}`);
    log(`TEST-B ${idB}`);
    if (!(await listed(idA)) || !(await listed(idB))) throw new Error("baseline: new sessions not listed via stdio");

    serve = spawn(bin, ["serve", "--port", String(SERVE_PORT)], { cwd, stdio: "ignore", windowsHide: true });
    await sleep(SERVE_WAIT_MS);

    // 顺序 A：先 stdio close，再 serve DELETE
    const closeA = await request("session/close", { sessionId: idA });
    log(`A close -> ${JSON.stringify(closeA).slice(0, 120)}`);
    const delA = await httpJson("DELETE", `/session/${encodeURIComponent(idA)}`);
    log(`A DELETE -> ${delA.status}`);
    const aStillListed = await listed(idA);
    verdict.A_close_then_delete = { stdioClose: closeA.error === undefined ? "ok" : "error", deleteStatus: delA.status, stillListedAfter: aStillListed };
    log(`A close → DELETE：stdio 仍列出? ${aStillListed}`);

    // 顺序 B：先 serve DELETE，再 stdio close
    const delB = await httpJson("DELETE", `/session/${encodeURIComponent(idB)}`);
    log(`B DELETE -> ${delB.status}`);
    const midB = await listed(idB);
    const closeB = await request("session/close", { sessionId: idB });
    log(`B close -> ${JSON.stringify(closeB).slice(0, 120)}`);
    const bStillListed = await listed(idB);
    verdict.B_delete_then_close = { deleteStatus: delB.status, listedAfterDeleteOnly: midB, stdioClose: closeB.error === undefined ? "ok" : "error", stillListedAfter: bStillListed };
    log(`B DELETE → close：仅删后仍列出? ${midB}；close 之后仍列出? ${bStillListed}`);

    record({ dir: "verdict", ...verdict });
  } catch (error) {
    verdict.error = String(error).slice(0, 300);
    log(`PROBE_ERROR ${verdict.error}`);
    record({ dir: "verdict", ...verdict });
  } finally {
    const file = join(traceDir, `opencode-acp-${stamp()}-delete-verify.jsonl`);
    writeFileSync(file, `${trace.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");
    console.log(`\ntrace: ${file}`);
    serve?.kill();
    child.kill();
    await sleep(300);
    console.log(JSON.stringify(verdict, null, 2));
  }
}

void main();
