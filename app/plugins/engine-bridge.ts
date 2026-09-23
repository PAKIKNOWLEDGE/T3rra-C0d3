/**
 * Dev-only byte pipe to the engine. This is the rehearsal for the Tauri shell, not the shell:
 * it exposes /probe, /spawn, /write, /kill and an SSE line stream, and it understands nothing
 * about ACP. Its whole vocabulary is "spawn a process, forward bytes" (rule 4).
 *
 * Why it exists at all: a browser cannot spawn a subprocess, and the first milestone is a
 * window that shows a real stream. When the Tauri shell lands, this file is deleted and the
 * renderer keeps using the same `Transport` interface.
 *
 * Engine resolution is shared with the app (`app/src/engine/resolve.ts`), so the dev pipe and
 * the future shell cannot drift apart on ordering.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { ServerResponse } from "node:http";
import type { IncomingMessage } from "node:http";
import { resolveEngineCandidates } from "../src/engine/resolve.ts";

const PREFIX = "/__t3";
const REAP_DELAY_MS = 60_000;
const KEEPALIVE_MS = 15_000;

interface Client {
  child: ChildProcessWithoutNullStreams | undefined;
  streams: Set<ServerResponse>;
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

const probeVersion = (binary: string): Promise<boolean> =>
  new Promise((done) => {
    const child = spawn(binary, ["--version"], { stdio: "ignore", windowsHide: true });
    child.on("error", () => done(false));
    child.once("close", (code) => done(code === 0));
  });

const resolveBinary = async (): Promise<string | null> => {
  const { candidates } = resolveEngineCandidates({
    T3RRA_ENGINE_BIN: process.env["T3RRA_ENGINE_BIN"],
    T3RRA_OMP_BIN: process.env["T3RRA_OMP_BIN"],
    T3RRA_ENGINE: process.env["T3RRA_ENGINE"],
    APPDATA: process.env["APPDATA"],
    HOME: process.env["HOME"] ?? homedir(),
  });
  for (const candidate of candidates) if (await probeVersion(candidate)) return candidate;
  return null;
};

export const engineBridge = (): Plugin => {
  const clients = new Map<string, Client>();

  const clientFor = (id: string): Client => {
    const existing = clients.get(id);
    if (existing !== undefined) return existing;
    const created: Client = { child: undefined, streams: new Set(), reap: undefined };
    clients.set(id, created);
    return created;
  };

  const emit = (client: Client, event: string, data: string): void => {
    debug(`emit ${event} ${data.length}B to ${client.streams.size} stream(s)`);
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
        clients.delete(id);
      }
    }, REAP_DELAY_MS);
  };

  const clientIdOf = (req: IncomingMessage): string | null => {
    const url = new URL(req.url ?? "", "http://localhost");
    return url.searchParams.get("client");
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
        const keepAlive = setInterval(() => res.write(": keepalive\n\n"), KEEPALIVE_MS);
        req.on("close", () => {
          clearInterval(keepAlive);
          client.streams.delete(res);
          scheduleReap(id, client);
        });
      });

      server.middlewares.use(`${PREFIX}/probe`, (req, res) => {
        void resolveBinary().then((binary) => json(res, 200, { binary, cwd: sandboxDir() }));
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
            json(res, 500, { ok: false, error: "engine not found: set T3RRA_ENGINE_BIN, or put opencode/omp on PATH" });
            return;
          }
          const client = clientFor(id);
          client.child?.kill();

          const body = await readBody(req);
          const cwd = typeof body["cwd"] === "string" && body["cwd"] !== "" ? body["cwd"] : sandboxDir();
          const child = spawn(binary, ["acp"], { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
          client.child = child;
          json(res, 200, { ok: true, binary, cwd });

          child.on("error", (error) => emit(client, "engine-error", JSON.stringify({ message: String(error) })));
          child.once("close", (code, signal) => {
            if (client.child === child) client.child = undefined;
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

      server.middlewares.use(`${PREFIX}/kill`, (req, res) => {
        const id = clientIdOf(req);
        const client = id === null ? undefined : clients.get(id);
        if (client !== undefined) {
          client.child?.kill();
          client.child = undefined;
        }
        json(res, 200, { ok: true });
      });

      server.httpServer?.once("close", () => {
        for (const client of clients.values()) {
          if (client.reap !== undefined) clearTimeout(client.reap);
          client.child?.kill();
        }
        clients.clear();
      });
    },
  };
};

export const ENGINE_BRIDGE_PREFIX = PREFIX;
export const appSandboxDir = sandboxDir;