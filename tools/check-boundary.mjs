#!/usr/bin/env node
/**
 * Gate: the visual layer does not depend on the engine layer.
 *
 * Why this exists: the owner's floor under this project is "the visual layer stays, worst
 * case we swap the backend". That floor is only worth something while the dependency
 * direction is enforced, so here it stops being a claim about architecture and becomes a
 * check that can fail.
 *
 * What it can prove: no file under app/src/ui/ or app/src/view/ imports app/src/engine/,
 * app/plugins/ or app/src/main.ts.
 * What it cannot prove: that the seam is *complete* (the contract types could still carry
 * engine-specific shapes), that swapping engines is cheap, or anything about how the UI
 * looks. Those stay with the contract doc and the owner's eyes.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { checkBoundary } from "./lib.mjs";

const SRC_DIR = "app/src";

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
};

const files = walk(SRC_DIR).map((path) => ({ path, source: readFileSync(path, "utf8") }));
const { violations, scanned } = checkBoundary(files);

if (scanned.length === 0) {
  console.log("FAIL  the boundary gate scanned 0 visual-layer files");
  console.log("      a gate that inspects nothing passes vacuously — that is the failure mode this repo already paid for once");
  process.exit(1);
}

for (const violation of violations) {
  console.log(`FAIL  ${violation.file} imports ${violation.specifier} → ${violation.target}`);
}

const summary = `${scanned.length} visual-layer files scanned, ${violations.length} boundary violations`;
if (violations.length === 0) console.log(`PASS  the visual layer does not reach into the engine layer\n\n${summary}`);
else console.log(`\n${summary}`);

process.exit(violations.length === 0 ? 0 : 1);
