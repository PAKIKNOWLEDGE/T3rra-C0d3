/**
 * Pure helpers behind the workspace gates. Kept separate from the CLIs so the gates
 * themselves can be tested — a gate nobody tests is a gate that quietly stops working.
 */

const KIND_TOKEN = /`([a-z][a-z_]{2,})`/g;

/** The slice of a markdown file that belongs to one `## …` section. */
const sectionOf = (markdown, headingPrefix) => {
  const start = markdown.indexOf(headingPrefix);
  if (start < 0) return "";
  const rest = markdown.slice(start + headingPrefix.length);
  const next = rest.indexOf("\n## ");
  return next < 0 ? rest : rest.slice(0, next);
};

/**
 * Kinds the adapter doc claims, read from the message-enumeration table's first column.
 * Scoped to one section on purpose: other tables in the same file list *capabilities*,
 * and treating those as kinds is how a gate starts lying.
 */
export const parseDocKindTable = (markdown) => {
  const kinds = new Set();
  for (const line of sectionOf(markdown, "## 二").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const firstCell = trimmed.slice(1).split("|")[0] ?? "";
    for (const match of firstCell.matchAll(KIND_TOKEN)) kinds.add(match[1]);
  }
  return kinds;
};

/** Paths the docs cite as evidence, e.g. `traces/opencode/opencode-acp-…-load-redacted.jsonl`. */
export const parseCitedTracePaths = (markdown) => {
  const paths = new Set();
  for (const match of markdown.matchAll(/traces\/opencode\/([A-Za-z0-9._-]+)/g)) paths.add(match[1]);
  return paths;
};

/**
 * What a trace file actually shows: update kinds plus the agent→client requests.
 * One JSON object per line, written by the spikes.
 */
export const collectObservations = (traceText) => {
  const kinds = new Set();
  const methods = new Set();
  let lines = 0;
  for (const raw of traceText.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    lines += 1;
    if (typeof entry.method === "string") methods.add(entry.method);
    // Two record shapes exist on purpose: the redacted probes write `kind`, the full-message
    // probes keep the payload. Both are evidence; the collector reads either.
    if (entry.method === "session/update") {
      const kind = typeof entry.kind === "string" && entry.kind !== "?" ? entry.kind : entry.params?.update?.sessionUpdate;
      if (typeof kind === "string" && kind !== "") kinds.add(kind);
    }
  }
  return { kinds, methods, lines };
};

const REF_RE = /<(?:script|link|img|iframe)[^>]*(?:src|href)=["']([^"']+)["']/gi;
const ID_RE = /\sid="([^"]+)"/g;

/** Static checks a single-file specimen can actually prove about itself. */
export const checkDemo = (html) => {
  const failures = [];
  const notes = [];

  const external = [...html.matchAll(REF_RE)].map((m) => m[1]).filter((href) => /^(https?:)?\/\//.test(href) || href.startsWith("data:"));
  if (external.length > 0) failures.push(`external references: ${external.join(", ")}`);

  const ids = [...html.matchAll(ID_RE)].map((m) => m[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) failures.push(`duplicate ids: ${[...new Set(duplicates)].join(", ")}`);

  const script = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (script === null) failures.push("no inline <script> block found");
  else {
    const refs = [...script[1].matchAll(/(?:getElementById|byId|set)\("([^"]+)"/g)].map((m) => m[1]);
    const missing = [...new Set(refs)].filter((id) => !ids.includes(id));
    if (missing.length > 0) failures.push(`JS id references missing from the DOM: ${missing.join(", ")}`);
  }

  const style = /<style>([\s\S]*?)<\/style>/.exec(html);
  if (style === null) failures.push("no inline <style> block found");
  else {
    const markup = html.slice(html.indexOf("<body>"));
    const classes = new Set();
    for (const match of markup.matchAll(/class="([^"]+)"/g)) match[1].split(/\s+/).forEach((c) => c !== "" && classes.add(c));
    const unstyled = [...classes].filter((name) => !new RegExp(`\\.${name}\\b`).test(style[1]));
    if (unstyled.length > 0) failures.push(`classes with no style rule: ${unstyled.join(", ")}`);
    if (!/prefers-reduced-motion/.test(style[1])) failures.push("no prefers-reduced-motion block");
  }

  notes.push(`${ids.length} ids`);
  return { failures, notes };
};