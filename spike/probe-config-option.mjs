#!/usr/bin/env node
/*
 * Set one config option on a live session and print exactly what comes back.
 *
 * Why it exists: the dock's mode chips appeared to do nothing. The question "did the engine
 * refuse, or did the UI drop the answer?" has to be answered by the engine, not by guessing
 * at the screen — the ACP response carries the authoritative post-change option list.
 *
 *   node spike/probe-config-option.mjs mode=plan
 *   node spike/probe-config-option.mjs effort=low
 *   node spike/probe-config-option.mjs            # just print the option list
 */

import http from "node:http";

const base = new URL(process.env.T3RRA_BRIDGE_URL ?? "http://localhost:5191");
const spec = process.argv[2] ?? "";
const client = `config-probe-${Date.now()}`;
const path = (suffix) => `/__t3${suffix}?client=${encodeURIComponent(client)}`;

let nextId = 1;
const waiting = new Map();
let sessionId;

const post = (suffix, body) =>
  new Promise((done, fail) => {
    const payload = JSON.stringify(body ?? {});
    const request = http.request({ hostname: base.hostname, port: base.port, path: path(suffix), method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, (response) => {
      let text = "";
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => (response.statusCode === 200 ? done(text) : fail(new Error(`${suffix} -> ${response.statusCode} ${text}`))));
    });
    request.on("error", fail);
    request.end(payload);
  });

const call = async (method, params) => {
  const id = nextId++;
  waiting.set(id, method);
  await post("/write", { line: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return id;
};

const optionsOf = (result) => (result?.configOptions ?? []).map((option) => `${option.id}=${option.currentValue}(${option.options?.length ?? 0} choices)`);

const probe = await new Promise((done) => {
  http.get({ hostname: base.hostname, port: base.port, path: path("/probe") }, (response) => {
    let text = "";
    response.on("data", (chunk) => (text += chunk));
    response.on("end", () => done(JSON.parse(text)));
  });
});
console.log(`binary: ${probe.binary}`);

const settled = new Promise((done) => {
  const stream = http.get({ hostname: base.hostname, port: base.port, path: path("/events") }, (response) => {
    response.setEncoding("utf8");
    let buffer = "";
    response.on("data", (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const name = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
        const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("").replace(/\\n/g, "\n");
        if (name === "engine-error") console.log(`  engine stderr: ${data.slice(0, 200)}`);
        if (name !== "line" || data === "") continue;
        let message;
        try {
          message = JSON.parse(data);
        } catch {
          continue;
        }
        if (typeof message.id === "number" && waiting.has(message.id)) {
          const method = waiting.get(message.id);
          waiting.delete(message.id);
          if (message.error !== undefined) console.log(`RESPONSE #${message.id} ${method}: ERROR ${JSON.stringify(message.error)}`);
          else {
            console.log(`RESPONSE #${message.id} ${method}: ${JSON.stringify(optionsOf(message.result))}`);
            if (typeof message.result?.sessionId === "string") sessionId = message.result.sessionId;
          }
        } else if (message.method === "session/update") {
          const variant = message.params?.update?.sessionUpdate;
          if (variant !== undefined && variant !== "available_commands_update") console.log(`  update: ${variant}`);
        }
      }
    });
    response.on("end", () => {
      stream.destroy();
      done();
    });
  });
});

await post("/spawn", { cwd: probe.cwd });
await call("initialize", { protocolVersion: 1, clientInfo: { name: "config-probe", version: "0" }, clientCapabilities: {} });

/** The engine answers session/new in seconds, not milliseconds; poll instead of guessing. */
const until = async (predicate, label, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((done) => setTimeout(done, 200));
  }
  console.log(`(timed out waiting for ${label})`);
  return false;
};

await until(() => sessionId !== undefined || process.env["CONFIG_PROBE_SKIP"] === "1", "initialize", 15000);
await call("session/new", { cwd: probe.cwd, mcpServers: [] });
await until(() => sessionId !== undefined, "session/new", 30000);
console.log(`session: ${sessionId ?? "(none)"}`);

if (sessionId !== undefined && spec.includes("=")) {
  const [configId, value] = spec.split("=");
  console.log(`--- setting ${configId} = ${value} ---`);
  await call("session/set_config_option", { sessionId, configId, value });
  await new Promise((done) => setTimeout(done, 1500));
}

await post("/kill", {});
await new Promise((done) => setTimeout(done, 300));
process.exit(0);