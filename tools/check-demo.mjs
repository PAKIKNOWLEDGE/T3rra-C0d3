#!/usr/bin/env node
/**
 * Gate: the specs describe themselves honestly.
 *
 * What it can prove about a single-file HTML specimen: no external references, no duplicate
 * ids, every id the inline script reaches for exists, no class without a style rule, a
 * reduced-motion block, and an inline script that parses.
 *
 * What it cannot prove, and does not claim: layout, contrast, animation, or that the file
 * looks like anything at all. That stays with the owner's eyes (no headless browsers here).
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { checkDemo } from "./lib.mjs";

const DEMO_DIR = "demo";
const files = readdirSync(DEMO_DIR).filter((name) => name.endsWith(".html")).sort();

let failed = 0;
for (const file of files) {
  const html = readFileSync(`${DEMO_DIR}/${file}`, "utf8");
  const { failures, notes } = checkDemo(html);

  const script = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (script !== null) {
    const tmp = ".check.tmp.mjs";
    writeFileSync(tmp, script[1], "utf8");
    try {
      execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    } catch (error) {
      const detail = String(error.stderr ?? error).slice(0, 200);
      failures.push(`inline script does not parse: ${detail}`);
    } finally {
      rmSync(tmp, { force: true });
    }
  }

  if (failures.length === 0) {
    console.log(`PASS  ${file}  (${notes.join(", ")})`);
  } else {
    failed += 1;
    console.log(`FAIL  ${file}`);
    for (const failure of failures) console.log(`      - ${failure}`);
  }
}

console.log(failed === 0 ? `\n${files.length}/${files.length} demo specs pass the machine-checkable checks` : `\n${failed} of ${files.length} failed`);
process.exit(failed === 0 ? 0 : 1);