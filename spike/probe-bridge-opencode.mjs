#!/usr/bin/env node
/*
 * End-to-end check of t3rra-core's dev bridge against whatever engine T3RRA_ENGINE selects,
 * WITHOUT a browser: the bridge is byte-blind, so we can drive ACP through it ourselves.
 *
 *   node spike/probe-bridge-opencode.mjs [baseUrl]
 *
 * What it proves: the product's own transport + engine resolution + opencode's ACP answer
 * each other. What it does NOT prove: anything the renderer draws (that is the owner's eyes).
 */

const BASE = process.argv[2] ?? "http://127.0.0.1:5180";
const CLIENT = "bridge-probe";
const qs = (extra = "") => `${BASE}/__t3${extra}?client=${CLIENT}`;

const post = async (path, body) => {
  const res = await fetch(qs(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const main = async () => {
  const probe = await fetch(qs("/probe")).then((r) => r.json());
  console.log(`probe:   ${JSON.stringify(probe)}`);

  const spawned = await post("/spawn", { cwd: probe.cwd ?? process.cwd() });
  console.log(`spawn:   ${spawned.status} ${JSON.stringify(spawned.body)}`);

  const send = async (msg) => {
    const r = await post("/write", { line: JSON.stringify(msg) });
    if (r.status !== 200) console.log(`write:   ${r.status} ${JSON.stringify(r.body)}`);
  };

  const seen = [];
  const controller = new AbortController();
  const stream = fetch(qs("/events"), { signal: controller.signal }).then(async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload) seen.push(payload);
        }
      }
    }
  }).catch(() => {});

  await new Promise((r) => setTimeout(r, 400));
  await send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1, clientInfo: { name: "t3rra-bridge-probe", version: "0" }, clientCapabilities: {} } });
  await new Promise((r) => setTimeout(r, 1200));
  const init = seen.find((l) => l.includes('"result"'));
  console.log(`init:    ${init ? init.slice(0, 220) : "(no response)"}`);

  await send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: probe.cwd ?? process.cwd(), mcpServers: [] } });
  await new Promise((r) => setTimeout(r, 1500));

  const kinds = seen.map((l) => {
    try {
      const m = JSON.parse(l);
      if (m.method === "session/update") return `update:${m.params?.update?.sessionUpdate}`;
      if (m.id === 2) return "session/new response";
      return m.method ?? `id:${m.id}`;
    } catch {
      return "unparsed";
    }
  });
  console.log(`events:  ${seen.length} line(s) — ${[...new Set(kinds)].join(", ")}`);

  controller.abort();
  await post("/kill", {});
  console.log("killed engine");
};

main().catch((err) => { console.error(String(err)); process.exit(1); });