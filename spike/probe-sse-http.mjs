#!/usr/bin/env node
/*
 * Does the bridge actually stream, or does my probe lie?
 *
 * The app subscribes with EventSource; my earlier probes used fetch()'s body reader. This one
 * uses a plain node:http request, so three different consumers can be compared. Timestamps on
 * every frame, because "it arrived late" and "it never arrived" need different fixes.
 *
 *   node spike/probe-sse-http.mjs [baseUrl] [seconds]
 */

import http from "node:http";

const base = new URL(process.argv[2] ?? "http://localhost:5191");
const seconds = Number(process.argv[3] ?? 15);
const client = `http-${Date.now()}`;
const path = (suffix) => `/__t3${suffix}?client=${encodeURIComponent(client)}`;

const t0 = Date.now();
const at = () => String(Date.now() - t0).padStart(6);

const post = (suffix, body) =>
  new Promise((done) => {
    const payload = JSON.stringify(body ?? {});
    const req = http.request({ hostname: base.hostname, port: base.port, path: path(suffix), method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, (res) => {
      let text = "";
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => {
        console.log(`@${at()} POST ${suffix} -> ${res.statusCode} ${text.slice(0, 120)}`);
        done(text);
      });
    });
    req.end(payload);
  });

const stream = http.get({ hostname: base.hostname, port: base.port, path: path("/events"), headers: { Accept: "text/event-stream" } }, (res) => {
  console.log(`@${at()} SSE ${res.statusCode} ${res.headers["content-type"]}`);
  res.setEncoding("utf8");
  let buffer = "";
  res.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const name = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "(comment)";
      const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
      if (name === "(comment)") continue;
      console.log(`@${at()} [${name}] ${data.replace(/\\n/g, "\n").slice(0, 180)}`);
    }
  });
});

await new Promise((done) => setTimeout(done, 400));
const probe = await fetch(`${base.origin}${path("/probe")}`).then((response) => response.json());
console.log(`@${at()} engine: ${probe.binary}`);
await post("/spawn", { cwd: probe.cwd });
await post("/write", { line: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientInfo: { name: "sse-http-probe", version: "0" }, clientCapabilities: {} } }) });
await new Promise((done) => setTimeout(done, 500));
await post("/write", { line: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: probe.cwd, mcpServers: [] } }) });
await new Promise((done) => setTimeout(done, seconds * 1000));
stream.destroy();
await post("/kill", {});
console.log(`@${at()} done`);