import { describe, expect, it } from "vitest";
import { resolveEngineCandidates } from "../app/src/engine/resolve.ts";
import { checkBoundary, checkDemo, collectObservations, parseCitedTracePaths, parseDocKindTable } from "../tools/lib.mjs";

describe("engine resolution", () => {
  it("puts opencode first when the environment says so", () => {
    const { candidates, reason } = resolveEngineCandidates({ T3RRA_ENGINE: "opencode", APPDATA: "C:\\roaming" });
    expect(reason).toBe("env-preference");
    expect(candidates[0]).toBe("opencode");
    expect(candidates).toContain("omp");
  });

  it("defaults to opencode first; T3RRA_ENGINE=omp is the escape hatch", () => {
    const { candidates, reason } = resolveEngineCandidates({ APPDATA: "C:\\roaming" });
    expect(reason).toBe("default-order");
    expect(candidates[0]).toBe("opencode");
    expect(candidates).toContain("omp");
    expect(resolveEngineCandidates({ T3RRA_ENGINE: "omp" }).candidates[0]).toBe("omp");
  });

  it("lets an explicit binary override everything, including the legacy variable", () => {
    expect(resolveEngineCandidates({ T3RRA_ENGINE_BIN: "D:\\oc.exe", T3RRA_ENGINE: "opencode" })).toEqual({
      candidates: ["D:\\oc.exe"],
      reason: "explicit-bin",
    });
    expect(resolveEngineCandidates({ T3RRA_OMP_BIN: "D:\\omp.exe" }).candidates).toEqual(["D:\\omp.exe"]);
  });
});

describe("trace observations", () => {
  it("reads update kinds and methods off a trace, ignoring junk lines", () => {
    const trace = [
      JSON.stringify({ t_ms: 1, dir: "out", method: "initialize" }),
      JSON.stringify({ t_ms: 2, dir: "in", method: "session/update", kind: "tool_call" }),
      JSON.stringify({ t_ms: 3, dir: "in", method: "session/update", kind: "?" }),
      JSON.stringify({ t_ms: 4, dir: "in", method: "session/request_permission" }),
      "not json at all",
    ].join("\n");
    const { kinds, methods, lines } = collectObservations(trace);
    expect([...kinds]).toEqual(["tool_call"]);
    expect(methods.has("session/request_permission")).toBe(true);
    expect(lines).toBe(4);
  });
});

describe("adapter doc parsing", () => {
  it("collects the backticked kinds of the message table and the traces it cites", () => {
    const markdown = [
      "## 二、报文全集",
      "",
      "| kind | 出现场景 |",
      "| --- | --- |",
      "| `usage_update` | 真 prompt 结束时 |",
      "| `tool_call` / `tool_call_update` | 成对出现 |",
      "| 未出现 | `session/request_permission` |",
      "",
      "替身证据：traces/opencode/opencode-acp-x-prompt.jsonl",
    ].join("\n");
    expect([...parseDocKindTable(markdown)].sort()).toEqual(["tool_call", "tool_call_update", "usage_update"]);
    expect([...parseCitedTracePaths(markdown)]).toEqual(["opencode-acp-x-prompt.jsonl"]);
  });

  it("does not mistake a capability table in another section for message kinds", () => {
    // Regression: an earlier version of this parser read every backticked first cell in the
    // file, so the lossy-column table made it claim `thinking` was an observed kind.
    const markdown = ["## 二、报文全集", "| `tool_call` | x |", "## 四、有损列", "| thinking | 有 | notes |"].join("\n");
    expect([...parseDocKindTable(markdown)]).toEqual(["tool_call"]);
  });
});

describe("demo gate", () => {
  const good = `<html><head><style>.a{color:red}@media (prefers-reduced-motion: reduce){*{animation:none}}</style></head>
<body><div class="a" id="x">hi</div><script>document.getElementById("x");</script></body></html>`;

  it("passes a spec that honours the checkable rules", () => {
    expect(checkDemo(good).failures).toEqual([]);
  });

  it("catches duplicate ids, dangling id references and unstyled classes", () => {
    const bad = good.replace('<div class="a" id="x">hi</div>', '<div class="a zz" id="x">hi</div><div id="x"></div>').replace('getElementById("x")', 'getElementById("nope")');
    const { failures } = checkDemo(bad);
    expect(failures.join(" | ")).toMatch(/duplicate ids: x/);
    expect(failures.join(" | ")).toMatch(/classes with no style rule: zz/);
    expect(failures.join(" | ")).toMatch(/missing from the DOM: nope/);
  });

  it("catches external references and a missing reduced-motion block", () => {
    const leaky = `<html><head><style>.a{color:red}</style></head><body><img src="https://example.com/x.png"><script></script></body></html>`;
    const { failures } = checkDemo(leaky);
    expect(failures.join(" | ")).toMatch(/external references/);
    expect(failures.join(" | ")).toMatch(/prefers-reduced-motion/);
  });
});

describe("boundary gate", () => {
  const visual = { path: "app/src/ui/console.ts", source: 'import type { ConsoleView } from "../view/derive.ts";\nimport { join } from "node:path";\n' };
  const engineShaped = { path: "app/src/engine/acp.ts", source: 'import type { AgentEvent } from "../contract/events.ts";\n' };

  it("lets the visual layer depend on the contract and on itself", () => {
    const { violations, scanned } = checkBoundary([visual, engineShaped]);
    expect(violations).toEqual([]);
    expect(scanned).toEqual(["app/src/ui/console.ts"]);
  });

  it("catches a visual file reaching into the engine layer", () => {
    const bad = { ...visual, source: 'import { translateLine } from "../engine/acp.ts";\n' };
    const { violations } = checkBoundary([bad]);
    expect(violations).toEqual([{ file: "app/src/ui/console.ts", specifier: "../engine/acp.ts", target: "app/src/engine/acp" }]);
  });

  it("catches a same-directory reference into engine and a reference to the dev-time bridge", () => {
    const files = [
      { path: "app/src/view/derive.ts", source: 'import { probe } from "../engine/probe.ts";\n' },
      { path: "app/src/ui/turns.ts", source: 'import { PREFIX } from "../../plugins/engine-bridge.ts";\n' },
    ];
    const { violations } = checkBoundary(files);
    expect(violations.map((v) => v.target)).toEqual(["app/src/engine/probe", "app/plugins/engine-bridge"]);
  });

  it("does not treat a specifier that only appears in prose as an import", () => {
    const commented = { ...visual, source: '/* the engine/acp.ts layer is upstream of us */\n// from "engine/acp.ts" is fine to mention\n' };
    expect(checkBoundary([commented]).violations).toEqual([]);
  });

  it("still allows the assembly root to import the engine layer", () => {
    const assembly = { path: "app/src/main.ts", source: 'import { translateLine } from "./engine/acp.ts";\n' };
    const { violations, scanned } = checkBoundary([assembly]);
    expect(violations).toEqual([]);
    expect(scanned).toEqual([]);
  });
});