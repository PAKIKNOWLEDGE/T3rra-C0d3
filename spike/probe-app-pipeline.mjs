#!/usr/bin/env node
/*
 * Prove the pipeline up to (but not including) the DOM, without a browser.
 *
 * Drives the app's own dev bridge as the renderer would — probe → spawn → initialize →
 * session/new → optional model switch → prompt — and pushes every line through the app's real
 * adapter and reducer. The last hop (view → pixels) is the owner's eyes.
 *
 * SSE is read with a plain node:http request on purpose: fetch()'s body reader buffers
 * long-lived streams and made an earlier version of this file report "silent engine" for a
 * pipe that was answering in milliseconds.
 *
 *   node spike/probe-app-pipeline.mjs [baseUrl] [--model <value>] [--text "<instruction>"]
 */

import http from "node:http";
import { translateLine } from "../app/src/engine/acp.ts";
import { emptyView, reduceView } from "../app/src/view/derive.ts";

const args = process.argv.slice(2);
const baseUrl = new URL(args.find((arg) => arg.startsWith("http")) ?? "http://localhost:5191");
const modelIndex = args.indexOf("--model");
const model = modelIndex >= 0 ? args[modelIndex + 1] : undefined;
const textIndex = args.indexOf("--text");
const instruction = textIndex >= 0 ? args[textIndex + 1] : "Say the single word: ok";

const client = `pipeline-${Date.now()}`;
const path = (suffix) => `/__t3${suffix}?client=${encodeURIComponent(client)}`;
const t0 = Date.now();
const at = () => String(Date.now() - t0).padStart(6);

let view = emptyView();
let nextId = 1;
const pending = new Map();

const post = (suffix, body) =>
  new Promise((done, fail) => {
    const payload = JSON.stringify(body ?? {});
    const request = http.request({ hostname: baseUrl.hostname, port: baseUrl.port, path: path(suffix), method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, (response) => {
      let text = "";
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => (response.statusCode === 200 ? done(text) : fail(new Error(`${suffix} -> ${response.statusCode} ${text}`))));
    });
    request.on("error", fail);
    request.end(payload);
  });

const apply = (events) => {
  for (const event of events) view = reduceView(view, event);
};

/** Responses carry facts notifications do not: the session id and the option menu. */
const handleResponse = (id, method, message) => {
  const keys = message.error !== undefined ? `ERROR ${JSON.stringify(message.error).slice(0, 200)}` : `keys ${JSON.stringify(Object.keys(message.result ?? {}))}`;
  console.log(`@${at()} response #${id} ${method}: ${keys}`);
  if (method === "initialize") {
    const info = message.result?.agentInfo ?? {};
    console.log(`@${at()} engine: ${info.name ?? "?"} ${info.version ?? "?"}`);
    return;
  }
  if (method === "session/new" || method === "session/set_config_option") {
    const payload = message.result ?? {};
    if (typeof payload.sessionId === "string") {
      apply([{ kind: "session.opened", from: { method: "session/new.response", variant: undefined }, sessionId: payload.sessionId }]);
    }
    if (payload.configOptions !== undefined) {
      apply(translateLine(JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "config_option_update", configOptions: payload.configOptions } } })).events);
    }
    console.log(`@${at()} options: ${view.options.map((option) => `${option.id}=${option.currentValue}`).join(", ") || "(none)"}`);
  }
};

const stream = http.get({ hostname: baseUrl.hostname, port: baseUrl.port, path: path("/events"), headers: { Accept: "text/event-stream" } }, (response) => {
  response.setEncoding("utf8");
  let buffer = "";
  response.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const name = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
      if (name === "engine-error") console.log(`@${at()} engine stderr: ${data.slice(0, 200)}`);
      if (name === "exit") console.log(`@${at()} engine exited: ${data}`);
      if (name !== "line") continue;
      const line = data.replace(/\\n/g, "\n");
      if (line === "") continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        apply(translateLine(line).events);
        continue;
      }
      if (typeof message.id === "number" && pending.has(message.id)) {
        const method = pending.get(message.id);
        pending.delete(message.id);
        handleResponse(message.id, method, message);
        continue;
      }
      apply(translateLine(line).events);
      const variant = message.params?.update?.sessionUpdate;
      if (variant !== undefined && variant !== "available_commands_update") console.log(`@${at()} update ${variant}`);
    }
  });
});

const call = async (method, params) => {
  const id = nextId++;
  pending.set(id, method);
  await post("/write", { line: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
  return id;
};

const waitFor = async (predicate, label, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((done) => setTimeout(done, 150));
  }
  console.log(`@${at()} (timed out waiting for ${label})`);
  return false;
};

const probe = await new Promise((done) => {
  http.get({ hostname: baseUrl.hostname, port: baseUrl.port, path: path("/probe") }, (response) => {
    let text = "";
    response.on("data", (chunk) => (text += chunk));
    response.on("end", () => done(JSON.parse(text)));
  });
});
console.log(`@${at()} binary: ${probe.binary}`);
console.log(`@${at()} cwd:    ${probe.cwd}`);

await post("/spawn", { cwd: probe.cwd });
await call("initialize", { protocolVersion: 1, clientInfo: { name: "pipeline-probe", version: "0" }, clientCapabilities: {} });
await waitFor(() => view.sessionId !== undefined, "initialize", 10000);
await call("session/new", { cwd: probe.cwd, mcpServers: [] });
await waitFor(() => view.sessionId !== undefined, "session/new", 15000);

if (model !== undefined && view.sessionId !== undefined) {
  await call("session/set_config_option", { sessionId: view.sessionId, configId: "model", value: model });
  await new Promise((done) => setTimeout(done, 1200));
}

if (view.sessionId !== undefined) {
  console.log(`@${at()} prompting: ${JSON.stringify(instruction)}`);
  await call("session/prompt", { sessionId: view.sessionId, prompt: [{ type: "text", text: instruction }] });
  await waitFor(() => view.stopReason !== undefined, "the prompt to end", 240000);
}

stream.destroy();
await post("/kill", {});
console.log(`\nstop:     ${view.stopReason ?? "NOT REPORTED"}`);
console.log(`stream:   ${view.stream.length} entry(ies) — ${view.stream.map((entry) => `${entry.type}(${entry.text.length})`).join(", ")}`);
console.log(`tools:    ${view.tools.map((tool) => `${tool.title || "(untitled)"}:${tool.status || "-"}`).join(", ") || "(none)"}`);
console.log(`unmapped: ${view.unmapped}`);
if (view.stream.length > 0) console.log(`first text: ${JSON.stringify(view.stream[0].text.slice(0, 200))}`);