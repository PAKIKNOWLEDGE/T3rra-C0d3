/**
 * Dev-only byte pipe to the engine. This is the rehearsal for the Tauri shell, not the shell:
 * it exposes /probe, /spawn, /write, /kill, /http (generic tunnel) and an SSE line stream.
 * It understands nothing about ACP event vocabulary (rule 4): /http only forwards method+path+body
 * to a local `opencode serve`.
 *
 * Why it exists at all: a browser cannot spawn a subprocess, and the first milestone is a
 * window that shows a real stream. When the Tauri shell lands, this file is deleted and the
 * renderer keeps using the same `Transport` interface.
 *
 * Engine resolution is shared with the app (`app/src/engine/resolve.ts`), so the dev pipe and
 * the future shell cannot drift apart on ordering.
 */

import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Plugin, ViteDevServer } from "vite";
import type { ServerResponse } from "node:http";
import type { IncomingMessage } from "node:http";
import { isSupportedOpenCodeVersion, resolveEngineCandidates } from "../src/engine/resolve.ts";

const PREFIX = "/__t3";
const REAP_DELAY_MS = 60_000;
const KEEPALIVE_MS = 15_000;
const SERVE_READY_TIMEOUT_MS = 20_000;
const FOLDER_PICKER_TIMEOUT_MS = 60_000;
const MAX_BUFFERED_LINES = 2_000;

interface Client {
  child: ChildProcessWithoutNullStreams | undefined;
  cwd: string | undefined;

  serve: ChildProcess | undefined;
  servePort: number | undefined;
  serveReady: Promise<number> | undefined;
  streams: Set<ServerResponse>;
  bufferedLines: string[];
  reap: ReturnType<typeof setTimeout> | undefined;
}

const DEBUG = process.env["T3RRA_BRIDGE_DEBUG"] === "1";
const stamp = (): string => String(Date.now() % 1_000_000).padStart(6, "0");
const debug = (message: string): void => {
  if (DEBUG) console.log(`[bridge ${stamp()}] ${message}`);
};

const json = (res: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
};

const readBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") return {};
  try {
    return (JSON.parse(text) as Record<string, unknown> | null) ?? {};
  } catch {
    return {};
  }
};

/** A disposable folder the engine may read and write freely — never the owner's source. */
const sandboxDir = (): string => {
  const dir = resolve(process.cwd(), "app", ".sandbox");
  mkdirSync(dir, { recursive: true });
  return dir;
};

const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => done(port));
    });
  });

const probeVersion = (binary: string, requireSupportedOpenCode: boolean): Promise<boolean> =>
  new Promise((done) => {
    const child = spawn(binary, ["--version"], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer | string) => { output += String(chunk); });
    child.on("error", () => done(false));
    child.once("close", (code) => done(code === 0 && (!requireSupportedOpenCode || isSupportedOpenCodeVersion(output))));
  });

const resolveBinary = async (): Promise<string | null> => {
  const env = {
    T3RRA_ENGINE_BIN: process.env["T3RRA_ENGINE_BIN"],
    T3RRA_OMP_BIN: process.env["T3RRA_OMP_BIN"],
    T3RRA_ENGINE: process.env["T3RRA_ENGINE"],
    APPDATA: process.env["APPDATA"],
    HOME: process.env["HOME"] ?? homedir(),
  } as const;
  const { candidates } = resolveEngineCandidates(env);
  const explicitOmp = env.T3RRA_ENGINE === "omp" || (env.T3RRA_ENGINE_BIN === undefined && env.T3RRA_OMP_BIN !== undefined);
  for (const candidate of candidates) if (await probeVersion(candidate, !explicitOmp)) return candidate;
  return null;
};

export const engineBridge = (): Plugin => {
  const clients = new Map<string, Client>();

  const clientFor = (id: string): Client => {
    const existing = clients.get(id);
    if (existing !== undefined) return existing;
    const created: Client = { child: undefined, cwd: undefined, serve: undefined, servePort: undefined, serveReady: undefined, streams: new Set(), bufferedLines: [], reap: undefined };
    clients.set(id, created);
    return created;
  };

  const emit = (client: Client, event: string, data: string): void => {
    debug(`emit ${event} ${data.length}B to ${client.streams.size} stream(s)`);
    if (event === "line" && client.streams.size === 0) {
      client.bufferedLines.push(data);
      if (client.bufferedLines.length > MAX_BUFFERED_LINES) client.bufferedLines.splice(0, client.bufferedLines.length - MAX_BUFFERED_LINES);
    }
    for (const stream of client.streams) {
      stream.write(`event: ${event}\ndata: ${data.replace(/\n/g, "\\n")}\n\n`);
      // SSE that sits in a buffer is indistinguishable from an engine that never spoke.
      if (typeof (stream as ServerResponse & { flush?: () => void }).flush === "function") (stream as ServerResponse & { flush: () => void }).flush();
    }
  };

  const scheduleReap = (id: string, client: Client): void => {
    if (client.reap !== undefined) clearTimeout(client.reap);
    client.reap = setTimeout(() => {
      if (client.streams.size === 0) {
        client.child?.kill();
        client.serve?.kill();
        clients.delete(id);
      }
    }, REAP_DELAY_MS);
  };

  const clientIdOf = (req: IncomingMessage): string | null => {
    const url = new URL(req.url ?? "", "http://localhost");
    return url.searchParams.get("client");
  };

  const ensureServe = (client: Client): Promise<number> => {
    if (client.servePort !== undefined && client.serve !== undefined && client.serve.exitCode === null) return Promise.resolve(client.servePort);
    if (client.serveReady !== undefined) return client.serveReady;

    client.serveReady = (async () => {
      const binary = await resolveBinary();
      if (binary === null) throw new Error("engine not found: set T3RRA_ENGINE_BIN, or put opencode on PATH");
      const port = await freePort();
      const child = spawn(binary, ["serve", "--port", String(port)], {
        cwd: sandboxDir(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      client.serve = child;
      debug(`serve spawn port=${port}`);

      const stdout = child.stdout;
      const stderr = child.stderr;
      if (stdout === null || stderr === null) throw new Error("opencode serve stdio not available");

      await new Promise<void>((done, fail) => {
        const timer = setTimeout(() => fail(new Error(`opencode serve not ready in ${SERVE_READY_TIMEOUT_MS}ms`)), SERVE_READY_TIMEOUT_MS);
        let buf = "";
        const onData = (chunk: Buffer | string): void => {
          buf += String(chunk);
          if (/listening|http:\/\/|127\.0\.0\.1|localhost/i.test(buf)) {
            clearTimeout(timer);
            stdout.off("data", onData);
            done();
          }
        };
        stdout.on("data", onData);
        stderr.on("data", (chunk: Buffer | string) => debug(`serve stderr ${String(chunk).trim().slice(0, 200)}`));
        child.once("error", (error) => {
          clearTimeout(timer);
          fail(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          fail(new Error(`opencode serve exited early (code ${code})`));
        });
      });

      client.servePort = port;
      return port;
    })().catch((error: unknown) => {
      client.serveReady = undefined;
      client.serve = undefined;
      client.servePort = undefined;
      throw error;
    });

    return client.serveReady;
  };

  const killClient = (client: Client): void => {
    client.child?.kill();
    client.child = undefined;
    client.cwd = undefined;
    client.bufferedLines = [];
    client.serve?.kill();
    client.serve = undefined;
    client.servePort = undefined;
    client.serveReady = undefined;
  };

  return {
    name: "t3rra-engine-bridge",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(`${PREFIX}/events`, (req, res) => {
        const id = clientIdOf(req);
        if (id === null) {
          json(res, 400, { ok: false, error: "client query parameter required" });
          return;
        }
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.flushHeaders();
        res.socket?.setNoDelay(true);
        res.write(": connected\n\n");
        debug(`stream attached for ${id}`);
        const client = clientFor(id);
        client.streams.add(res);
        for (const line of client.bufferedLines) {
          res.write(`event: line\ndata: ${line.replace(/\n/g, "\\n")}\n\n`);
        }
        client.bufferedLines = [];
        const keepAlive = setInterval(() => res.write(": keepalive\n\n"), KEEPALIVE_MS);
        req.on("close", () => {
          clearInterval(keepAlive);
          client.streams.delete(res);
          scheduleReap(id, client);
        });
      });

      server.middlewares.use(`${PREFIX}/probe`, (req, res) => {
        const id = clientIdOf(req);
        const client = id === null ? undefined : clientFor(id);
        void resolveBinary().then((binary) => json(res, 200, { binary, cwd: client?.cwd ?? sandboxDir() }));
      });

      server.middlewares.use(`${PREFIX}/spawn`, (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            json(res, 405, { ok: false, error: "use POST" });
            return;
          }
          const id = clientIdOf(req);
          if (id === null) {
            json(res, 400, { ok: false, error: "client query parameter required" });
            return;
          }
          const binary = await resolveBinary();
          if (binary === null) {
            json(res, 500, { ok: false, error: "supported opencode not found: set T3RRA_ENGINE_BIN, or explicitly set T3RRA_ENGINE=omp" });
            return;
          }
          const client = clientFor(id);
          const body = await readBody(req);
          const cwd = typeof body["cwd"] === "string" && body["cwd"] !== "" ? body["cwd"] : sandboxDir();
          if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
            json(res, 400, { ok: false, error: `cwd is not an existing directory: ${cwd}` });
            return;
          }
          if (client.child !== undefined && client.child.exitCode === null && client.cwd === cwd) {
            json(res, 200, { ok: true, reused: true, binary, cwd });
            return;
          }
          client.child?.kill();
          client.bufferedLines = [];
          // Plain `acp`, no `--port`: the child used to be started on a known port so that an
          // HTTP `session/{id}/abort` could reach the process owning the turn. That whole route
          // was built on a false premise (an earlier probe sent `session/cancel` as a *request*
          // and read the resulting -32601 as "ACP cannot interrupt"). Interrupting is a stdio
          // notification and is measured to work —
          // traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl.
          const child = spawn(binary, ["acp"], { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
          client.child = child;
          client.cwd = cwd;
          json(res, 200, { ok: true, binary, cwd });

          child.on("error", (error) => emit(client, "engine-error", JSON.stringify({ message: String(error) })));
          child.once("close", (code, signal) => {
            if (client.child === child) client.child = undefined;
            if (client.child === undefined && client.cwd === cwd) client.cwd = undefined;
            emit(client, "exit", JSON.stringify({ code, signal }));
          });

          // Byte-blind framing: split on LF and forward each non-empty line verbatim.
          // Deliberately not readline — U+2028/U+2029 are legal inside JSON strings and a
          // line-based reader treats them as breaks.
          let out = "";
          child.stdout.setEncoding("utf8");
          child.stdout.on("data", (chunk: string) => {
            debug(`stdout ${chunk.length}B`);
            out += chunk;
            let index: number;
            while ((index = out.indexOf("\n")) !== -1) {
              const line = out.slice(0, index).replace(/\r$/, "");
              out = out.slice(index + 1);
              if (line !== "") emit(client, "line", line);
            }
          });
          child.stderr.setEncoding("utf8");
          child.stderr.on("data", (chunk: string) => {
            for (const line of chunk.split("\n")) if (line.trim() !== "") emit(client, "engine-error", JSON.stringify({ message: line }));
          });
        })().catch((error: unknown) => json(res, 500, { ok: false, error: String(error) }));
      });

      server.middlewares.use(`${PREFIX}/choose-folder`, (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            json(res, 405, { ok: false, error: "use POST" });
            return;
          }
          if (process.platform !== "win32") {
            json(res, 501, { ok: false, error: "native folder picker is only implemented on Windows" });
            return;
          }
          // Use Windows Script Host for the native shell picker. A hidden PowerShell
          // process could leave a modal .NET dialog without a usable message pump, which
          // made the browser wait forever. WScript owns the Shell.Application dialog and
          // writes the selected path to a temporary UTF-16 file before exiting.
          const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const scriptPath = join(tmpdir(), `t3rra-folder-picker-${token}.vbs`);
          const resultPath = join(tmpdir(), `t3rra-folder-picker-${token}.txt`);
          const script = [
            'Option Explicit',
            'Dim shell, folder, fso, file, outputPath',
            'outputPath = WScript.Arguments(0)',
            'Set shell = CreateObject("Shell.Application")',
            'Set folder = shell.BrowseForFolder(0, "Choose project directory", 0)',
            'Set fso = CreateObject("Scripting.FileSystemObject")',
            'Set file = fso.CreateTextFile(outputPath, True, True)',
            'If folder Is Nothing Then',
            '  file.Write ""',
            'Else',
            '  file.Write folder.Self.Path',
            'End If',
            'file.Close',
          ].join("\r\n");
          writeFileSync(scriptPath, script, "ascii");
          const child = spawn("wscript.exe", [scriptPath, resultPath], {
            stdio: "ignore",
            windowsHide: false,
          });
          let settled = false;
          const finish = (status: number, payload: unknown): void => {
            if (settled) return;
            settled = true;
            json(res, status, payload);
          };
          const cleanup = (): void => {
            for (const path of [scriptPath, resultPath]) {
              try { unlinkSync(path); } catch { /* best effort */ }
            }
          };
          const timeout = setTimeout(() => {
            if (settled) return;
            child.kill();
            cleanup();
            finish(504, { ok: false, error: "folder picker timed out" });
          }, FOLDER_PICKER_TIMEOUT_MS);
          const finishWithTimeout = (status: number, payload: unknown): void => {
            clearTimeout(timeout);
            cleanup();
            finish(status, payload);
          };
          child.once("error", (cause) => finishWithTimeout(500, { ok: false, error: String(cause) }));
          child.once("close", (code) => {
            if (code !== 0) {
              finishWithTimeout(500, { ok: false, error: `folder picker exited with code ${code}` });
              return;
            }
            let path = "";
            try {
              path = readFileSync(resultPath, "utf16le").replace(/^\uFEFF/, "").trim();
            } catch (cause) {
              finishWithTimeout(500, { ok: false, error: `folder picker result unavailable: ${String(cause)}` });
              return;
            }
            finishWithTimeout(200, { ok: true, path: path === "" ? null : path });
          });
        })().catch((error: unknown) => json(res, 500, { ok: false, error: String(error) }));
      });

      server.middlewares.use(`${PREFIX}/project-config`, (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            json(res, 405, { ok: false, error: "use POST" });
            return;
          }
          const url = new URL(req.url ?? "", "http://localhost");
          const cwd = url.searchParams.get("cwd");
          if (cwd === null || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
            json(res, 400, { ok: false, error: "cwd must be an existing directory" });
            return;
          }
          const body = await readBody(req);
          const method = body["method"];
          if (method !== "GET" && method !== "PATCH") {
            json(res, 400, { ok: false, error: "method must be GET or PATCH" });
            return;
          }
          const jsoncFile = join(cwd, "opencode.jsonc");
          if (existsSync(jsoncFile)) {
            json(res, 409, { ok: false, error: "opencode.jsonc is present; edit that JSONC file manually" });
            return;
          }
          const jsonFile = join(cwd, "opencode.json");
          let config: Record<string, unknown> = {};
          if (existsSync(jsonFile)) {
            try {
              const parsed = JSON.parse(readFileSync(jsonFile, "utf8")) as unknown;
              if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("config root must be an object");
              config = parsed as Record<string, unknown>;
            } catch (error) {
              json(res, 409, { ok: false, error: `opencode.json is not valid JSON: ${String(error)}` });
              return;
            }
          }
          if (method === "PATCH") {
            const next = body["config"];
            if (next === null || typeof next !== "object" || Array.isArray(next)) {
              json(res, 400, { ok: false, error: "config must be an object" });
              return;
            }
            writeFileSync(jsonFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
            config = next as Record<string, unknown>;
          }
          json(res, 200, { ok: true, config });
        })().catch((error: unknown) => json(res, 500, { ok: false, error: String(error) }));
      });

      server.middlewares.use(`${PREFIX}/write`, (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            json(res, 405, { ok: false, error: "use POST" });
            return;
          }
          const id = clientIdOf(req);
          const body = await readBody(req);
          const line = body["line"];
          if (typeof line !== "string" || line === "") {
            json(res, 400, { ok: false, error: "line must be a non-empty string" });
            return;
          }
          const stdin = (id === null ? undefined : clients.get(id))?.child?.stdin;
          if (stdin === undefined || stdin.destroyed) {
            json(res, 409, { ok: false, error: "no engine running for this client" });
            return;
          }
          stdin.write(line.endsWith("\n") ? line : `${line}\n`);
          json(res, 200, { ok: true });
        })().catch((error: unknown) => json(res, 500, { ok: false, error: String(error) }));
      });

      // Generic HTTP tunnel: path/body come from the app; this process only forwards bytes
      // to a local `opencode serve` (rule 4 — no ACP/event vocabulary here).
      server.middlewares.use(`${PREFIX}/http`, (req, res) => {
        void (async () => {
          if (req.method !== "POST") {
            json(res, 405, { ok: false, error: "use POST" });
            return;
          }
          const id = clientIdOf(req);
          if (id === null) {
            json(res, 400, { ok: false, error: "client query parameter required" });
            return;
          }
          const body = await readBody(req);
          const method = typeof body["method"] === "string" ? body["method"].toUpperCase() : "";
          const path = typeof body["path"] === "string" ? body["path"] : "";
          if (method === "" || !path.startsWith("/")) {
            json(res, 400, { ok: false, error: "method and path required (path must start with /)" });
            return;
          }
          const client = clientFor(id);
          // Every HTTP path goes to the lazily-started serve, which is how the owner accepted
          // #2 (session delete). The old per-path exception that sent `/abort` to the ACP child's
          // port is gone: nothing needs a same-process HTTP face now that interrupting is a
          // stdio notification.
          //
          // Known and declared, not papered over: deleting on this process while the ACP child
          // still holds the session in memory leaves that child listing the deleted session
          // (docs/engine-contract-audit.md F21, measured in
          // traces/opencode/opencode-acp-2026-09-24T11-00-34-512Z-split-brain.jsonl).
          const port = await ensureServe(client);
          const payload = body["body"] === undefined || body["body"] === null ? undefined : body["body"];
          const init: RequestInit = { method };
          if (payload !== undefined) {
            init.headers = { "Content-Type": "application/json" };
            init.body = JSON.stringify(payload);
          }
          const upstream = await fetch(`http://127.0.0.1:${port}${path}`, init);
          const text = await upstream.text();
          res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Content-Length": Buffer.byteLength(text) });
          res.end(text);
        })().catch((error: unknown) => {
          debug(`http tunnel error ${String(error)}`);
          json(res, 502, { ok: false, error: String(error) });
        });
      });

      server.middlewares.use(`${PREFIX}/kill`, (req, res) => {
        const id = clientIdOf(req);
        const client = id === null ? undefined : clients.get(id);
        if (client !== undefined) killClient(client);
        json(res, 200, { ok: true });
      });

      server.httpServer?.once("close", () => {
        for (const client of clients.values()) {
          if (client.reap !== undefined) clearTimeout(client.reap);
          killClient(client);
        }
        clients.clear();
      });
    },
  };
};

export const ENGINE_BRIDGE_PREFIX = PREFIX;
export const appSandboxDir = sandboxDir;
