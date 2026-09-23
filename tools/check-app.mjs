#!/usr/bin/env node
/**
 * Gate: no dangling controls in the app shell, and no runtime vocabulary baked into it.
 *
 * A control is "dangling" when clicking it cannot have an observable effect, or when it names
 * a concept the runtime does not have. Only part of that is machine-checkable, and this gate
 * only claims the part it can check:
 *
 *   1. every button/select/input in app/index.html carries an id, and that id appears
 *      somewhere in app/**\/*.ts — i.e. something is actually wired to it;
 *   2. no option value or unbuilt capability is written into the shell as static text
 *      (the option menu is rendered from `configOptions`, so a literal `BUILD` on screen
 *      means someone hardcoded a whitelist — exactly the failure the owner forbade).
 *
 * The rest of the dangler test — "does clicking do something sensible" — needs eyes, and the
 * eyes are the owner's (no headless browsers here).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SHELL = "app/index.html";
const notes = [];

/** Vocabulary that belongs to the runtime or to an unbuilt capability — never to the shell. */
const RUNTIME_VOCABULARY = [
  "ASK", // an omp-era mode the engine never had
  "DO", // same
  "PLAN", // engine option value: rendered from configOptions only
  "BUILD", // ditto
  "EFFORT", // appears per model, rendered from configOptions only
  "THINKING", // not an option name in this engine at all
  "DIFF", // HTTP-side capability, not wired
  "REVERT", // ditto
  "PTY", // ditto
  "TODO", // upstream concept the contract forbids
  "SUBAGENT", // ditto
];

const collectTs = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
};

const html = readFileSync(SHELL, "utf8");
const tsText = collectTs("app").map((file) => readFileSync(file, "utf8")).join("\n");
const body = html.slice(html.indexOf("<body>"));

const failures = [];
const controls = [...body.matchAll(/<(button|select|input)\b([^>]*)>/g)];
let wired = 0;
for (const [, tag, attributes] of controls) {
  const id = /\sid="([^"]+)"/.exec(attributes);
  if (id === null) {
    failures.push(`<${tag}> without an id: every control must be wired to something`);
    continue;
  }
  if (tsText.includes(`"${id[1]}"`) || tsText.includes(`'${id[1]}'`)) wired += 1;
  else failures.push(`<${tag} id="${id[1]}"> has no reference in app/**/*.ts — dangling control?`);
}

// Blind spot that let a real violation through: three rail items were written as <div>s, so the
// control check above never looked at them and the gate stayed green while the screen showed
// three dead keys. The fix is not a smarter smell test — it is a *manifest*: every element a
// user can see must be classified (wired, or static with a stated reason). An element nobody
// classified fails the build, so "I forgot to count it" cannot happen quietly again.
const MANIFEST = "app/ui-manifest.json";
const CONTROLS = new Set(["BUTTON", "SELECT", "INPUT", "TEXTAREA", "A"]);
const CLICKABLE_SMELLS = [/\stitle="/, /\saria-current="/, /\scursor:\s*pointer/, /\shover:\s*/];
const BODY_TAGS = new Set(["DIV", "SPAN", "LI", "SECTION", "ASIDE", "NAV", "MAIN", "HEADER", "FOOTER", "LABEL"]);

const mustClassify = new Map();
for (const [tag, attributes] of [...body.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((m) => [m[1].toUpperCase(), m[2]])) {
  const id = /\sid="([^"]+)"/.exec(attributes);
  const isControl = CONTROLS.has(tag);
  const smells = CLICKABLE_SMELLS.some((pattern) => pattern.test(attributes));
  if (!isControl && !(BODY_TAGS.has(tag) && smells)) continue;
  if (id === null) {
    failures.push(`<${tag.toLowerCase()}> is a control or looks like one but has no id, so it cannot be classified`);
    continue;
  }
  mustClassify.set(id[1], { tag, attributes });
}

if (!existsSync(MANIFEST)) {
  failures.push(`${MANIFEST} is missing: every visible element must be classified (wired, or static with a reason)`);
} else {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const classified = manifest.elements ?? {};
  for (const [id, { tag, attributes }] of mustClassify) {
    const entry = classified[id];
    if (entry === undefined) {
      failures.push(`#${id} (<${tag.toLowerCase()}>) is not classified in ${MANIFEST} — wired, or static with a reason`);
      continue;
    }
    if (entry.wired === true && !tsText.includes(`"${id}"`) && !tsText.includes(`'${id}'`)) {
      failures.push(`#${id} claims wired but nothing in app/**/*.ts refers to it`);
    }
    if (entry.wired !== true && typeof entry.static !== "string") {
      failures.push(`#${id} must be either "wired": true or "static": "<reason>"`);
    }
    if (entry.wired !== true && /\stitle="/.test(attributes)) {
      // A tooltip is not a reason a user can act on; the manifest is where the reason belongs.
      notes.push(`#${id} carries a title tooltip; its reason is recorded in the manifest`);
    }
  }
  const shellIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const id of Object.keys(classified)) {
    // Stale means "the shell no longer has this element" — not "it carries no interactive cue".
    // Containers are legitimately classified even though the smell test ignores them.
    if (!shellIds.has(id)) failures.push(`${MANIFEST} classifies #${id}, which ${SHELL} does not contain (stale entry)`);
  }
  notes.push(`${mustClassify.size} visible element(s) classified`);
}

// Static text only: scripts, styles and comments are not what the operator reads.
const textOnly = body
  .replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<style[\s\S]*?<\/style>/g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&[a-z]+;/g, " ");
for (const word of RUNTIME_VOCABULARY) {
  if (new RegExp(`\\b${word}\\b`).test(textOnly)) {
    failures.push(`"${word}" appears as static text in ${SHELL}: runtime vocabulary must come from data, not from the shell`);
  }
}

// The renderer reaches for ids by name and throws at runtime if one is missing; that failure
// is cheap to catch statically, and a typo here would otherwise surface only in the browser.
const RENDERER = "app/src/ui/console.ts";
if (!existsSync(RENDERER)) {
  failures.push(`${RENDERER} is missing`);
} else {
  const renderer = readFileSync(RENDERER, "utf8");
  const wanted = [...new Set([...renderer.matchAll(/need(?:<[^>]*>)?\("([^"]+)"\)/g)].map((m) => m[1]))];
  const shellIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const absent = wanted.filter((id) => !shellIds.has(id));
  for (const id of absent) failures.push(`${RENDERER} needs #${id}, which ${SHELL} does not define`);
  notes.push(`${wanted.length - absent.length}/${wanted.length} renderer ids resolve`);
}

// Fonts: a missing file is a silent font change, and silent font changes are how a design
// drifts. Every url() in the font stylesheet must resolve next to it.
const FONT_CSS = "app/fonts/fonts.css";
if (!existsSync(FONT_CSS)) {
  failures.push(`${FONT_CSS} is missing: the shell links it`);
} else {
  const css = readFileSync(FONT_CSS, "utf8");
  const targets = [...new Set([...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]))];
  const missing = targets.filter((target) => !existsSync(join("app/fonts", target)));
  for (const target of missing) failures.push(`font file referenced but absent: app/fonts/${target}`);
  notes.push(`${targets.length - missing.length}/${targets.length} font files present`);
}

console.log(`${SHELL}: ${controls.length} control(s), ${wired} wired, ${RUNTIME_VOCABULARY.length} forbidden words checked`);
if (notes.length > 0) console.log(`fonts: ${notes.join(", ")}`);
if (failures.length === 0) {
  console.log("\nPASS  no dangling controls, no baked-in runtime vocabulary");
} else {
  console.log(`\nFAIL  ${failures.length} problem(s)`);
  for (const failure of failures) console.log(`      - ${failure}`);
}
process.exit(failures.length === 0 ? 0 : 1);