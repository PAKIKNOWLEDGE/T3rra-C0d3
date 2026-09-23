#!/usr/bin/env node
/**
 * Gate: every 【实测】 claim in the adapter table has a trace behind it, and every kind a
 * trace shows is in the table. This is the gate a blind review asked for — it exists because
 * two claims in that table (load ordering, per-model `effort`) were true in a console log and
 * nowhere on disk.
 *
 * It deliberately FAILS when a claim outruns its evidence. Fixing the claim or landing the
 * evidence are both acceptable repairs; editing this gate is not.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { collectObservations, parseCitedTracePaths, parseDocKindTable } from "./lib.mjs";

const DOC = "docs/adapters/opencode-acp.md";
const TRACE_DIR = "traces/opencode";

const doc = readFileSync(DOC, "utf8");
const traceFiles = readdirSync(TRACE_DIR).filter((name) => name.endsWith(".jsonl")).sort();
const traceText = new Map(traceFiles.map((name) => [name, readFileSync(`${TRACE_DIR}/${name}`, "utf8")]));

const observedKinds = new Set();
const observedMethods = new Set();
for (const text of traceText.values()) {
  const { kinds, methods } = collectObservations(text);
  kinds.forEach((kind) => observedKinds.add(kind));
  methods.forEach((method) => observedMethods.add(method));
}

const claimedKinds = parseDocKindTable(doc);
const failures = [];

for (const kind of claimedKinds) {
  if (!observedKinds.has(kind)) failures.push(`table claims \`${kind}\` as measured, but no trace shows it`);
}
for (const kind of observedKinds) {
  if (!claimedKinds.has(kind)) failures.push(`trace shows \`${kind}\`, which the table never lists`);
}
if (/effort/i.test(doc) && ![...traceText.values()].some((text) => text.includes("effort"))) {
  failures.push("the doc discusses `effort` values, but no trace records any");
}
if (/(回放先流|响应后到|respond last|replay streams before)/.test(doc) && ![...traceText.values()].some((text) => text.includes("load_timing"))) {
  failures.push("the doc claims session/load ordering, but no trace records the load response timing");
}
for (const cited of parseCitedTracePaths(doc)) {
  if (!existsSync(`${TRACE_DIR}/${cited}`)) failures.push(`the doc cites a trace that does not exist: ${cited}`);
}

console.log(`traces: ${traceFiles.length} file(s), ${observedKinds.size} update kinds, ${observedMethods.size} methods`);
console.log(`kinds:  ${[...observedKinds].sort().join(", ")}`);
console.log(`methods:${[...observedMethods].sort().join(", ")}`);
if (failures.length === 0) {
  console.log(`\nPASS  ${DOC} is backed by ${TRACE_DIR}/`);
} else {
  console.log(`\nFAIL  ${failures.length} claim(s) outrun the traces in ${TRACE_DIR}/`);
  for (const failure of failures) console.log(`      - ${failure}`);
}
process.exit(failures.length === 0 ? 0 : 1);