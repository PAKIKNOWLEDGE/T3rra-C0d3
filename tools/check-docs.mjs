#!/usr/bin/env node
/**
 * Gate: the docs do not cite things that are not there.
 *
 * Fails on a markdown link whose relative target does not resolve. Reports (without failing)
 * repo-relative paths written in backticks that do not exist yet — those are usually plans,
 * and a plan is allowed to name a file before it exists.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
};

const files = [...walk("docs"), "AGENTS.md"].filter((file) => existsSync(file));
const failures = [];
const unresolvedPlans = [];
const PLAN_PREFIXES = ["app/", "docs/", "demo/", "spike/", "traces/", "tools/", "test/"];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const base = dirname(file);

  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = target.split("#")[0];
    if (clean === "") continue;
    if (!existsSync(normalize(join(base, clean)))) failures.push(`${file}: link does not resolve -> ${target}`);
  }

  for (const match of text.matchAll(/`([A-Za-z0-9_./-]+)`/g)) {
    const candidate = match[1];
    if (!PLAN_PREFIXES.some((prefix) => candidate.startsWith(prefix))) continue;
    if (candidate.includes("*") || candidate.endsWith("/")) continue;
    if (!existsSync(candidate)) unresolvedPlans.push(`${file}: ${candidate}`);
  }
}

console.log(`docs scanned: ${files.length}`);
if (unresolvedPlans.length > 0) {
  console.log(`\nplanned but not present yet (not a failure): ${unresolvedPlans.length}`);
  for (const item of unresolvedPlans.slice(0, 15)) console.log(`      ${item}`);
}
if (failures.length === 0) {
  console.log("\nPASS  every relative doc link resolves");
} else {
  console.log(`\nFAIL  ${failures.length} broken link(s)`);
  for (const failure of failures) console.log(`      - ${failure}`);
}
process.exit(failures.length === 0 ? 0 : 1);