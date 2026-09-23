import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COUNTED_VARIANTS, MAPPED_VARIANTS, translateLine } from "../app/src/engine/acp.ts";
import type { AgentEvent } from "../app/src/contract/events.ts";
import { EVENT_KINDS } from "../app/src/contract/events.ts";
import { BLOCK_PROVENANCE, VIEW_BLOCKS, reduceAll } from "../app/src/view/derive.ts";

const TRACE_DIR = "traces/opencode";
const traceFiles = readdirSync(TRACE_DIR).filter((name) => name.endsWith(".jsonl"));

interface TraceLine {
  readonly method?: string;
  readonly kind?: string;
  readonly params?: { readonly update?: { readonly sessionUpdate?: string } };
}

/** Every `sessionUpdate` variant the captured engine traffic actually contains. */
const observedVariants = (): ReadonlySet<string> => {
  const variants = new Set<string>();
  for (const file of traceFiles) {
    for (const raw of readFileSync(`${TRACE_DIR}/${file}`, "utf8").split("\n")) {
      const line = raw.trim();
      if (line === "") continue;
      let entry: TraceLine;
      try {
        entry = JSON.parse(line) as TraceLine;
      } catch {
        continue;
      }
      if (entry.method !== "session/update") continue;
      const variant = entry.params?.update?.sessionUpdate ?? entry.kind;
      if (typeof variant === "string" && variant !== "" && variant !== "?") variants.add(variant);
    }
  }
  return variants;
};

describe("adapter vs captured traffic (rules-inherited §二.23, §八)", () => {
  const variants = observedVariants();

  it("has captured at least one variant to check against", () => {
    expect(variants.size).toBeGreaterThan(0);
  });

  it("maps or deliberately counts every variant the traces contain", () => {
    const counted = new Set(COUNTED_VARIANTS.map((entry) => entry.variant));
    const undecided = [...variants].filter((variant) => !MAPPED_VARIANTS.includes(variant) && !counted.has(variant));
    expect(undecided, "a new sessionUpdate variant appeared: decide to map it, or record why not").toEqual([]);
  });

  it("gives every counted variant a stated reason", () => {
    for (const entry of COUNTED_VARIANTS) expect(entry.why.length).toBeGreaterThan(10);
  });
});

describe("provenance coverage (rules-inherited §一.2)", () => {
  const declared = new Set(VIEW_BLOCKS.flatMap((block) => BLOCK_PROVENANCE[block]));

  it("declares a home for every event kind the contract can emit", () => {
    const homeless = EVENT_KINDS.filter((kind) => !declared.has(kind));
    expect(homeless, "an event kind no block derives from is an event kind nobody can see").toEqual([]);
  });

  it("derives from every kind the captured traffic actually produces", () => {
    const produced = new Set<string>();
    for (const file of traceFiles) {
      for (const raw of readFileSync(`${TRACE_DIR}/${file}`, "utf8").split("\n")) {
        const line = raw.trim();
        if (line === "") continue;
        for (const event of translateLine(line).events) produced.add(event.kind);
      }
    }
    expect(produced.size).toBeGreaterThan(0);
    const missed = [...produced].filter((kind) => !declared.has(kind as AgentEvent["kind"]));
    expect(missed, "traffic produces a kind that no block declares").toEqual([]);
  });
});

describe("translation specifics", () => {
  const line = (update: Record<string, unknown>): string => JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { update } });

  it("merges chunks of one message and keeps thoughts separate from the message body", () => {
    const events = [
      translateLine(line({ sessionUpdate: "agent_message_chunk", messageId: "m1", content: { type: "text", text: "half " } })),
      translateLine(line({ sessionUpdate: "agent_message_chunk", messageId: "m1", content: { type: "text", text: "done" } })),
      translateLine(line({ sessionUpdate: "agent_thought_chunk", messageId: "m1", content: { type: "text", text: "thinking" } })),
    ].flatMap((result) => result.events);
    const view = reduceAll(events);
    expect(view.stream.map((entry) => `${entry.type}:${entry.text}`)).toEqual(["message:half done", "thought:thinking"]);
  });

  it("uses the tool title as identity, not the kind", () => {
    // The captured traces show `kind` mislabelling a directory listing as `read`.
    const { events } = translateLine(line({ sessionUpdate: "tool_call", toolCallId: "t1", title: "List files", kind: "read" }));
    expect(events[0]).toMatchObject({ kind: "tool.started", title: "List files", hint: "read" });
  });

  it("counts unmapped traffic instead of guessing at it", () => {
    const { events } = translateLine(line({ sessionUpdate: "usage_update", size: 12345 }));
    expect(events[0]?.kind).toBe("message.unmapped");
    expect(reduceAll(events).unmapped).toBe(1);
  });

  it("surfaces a permission request as its own fact, not as a notice", () => {
    const { events } = translateLine(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "session/request_permission", params: { toolCall: { kind: "edit", title: "Write file" } } }));
    expect(events[0]).toMatchObject({ kind: "permission.requested", requestId: "7", summary: "edit · Write file" });
  });

  it("reads the stop reason off a prompt response and nothing else", () => {
    const ok = translateLine(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { stopReason: "end_turn" } }));
    expect(ok.isResponse).toBe(true);
    expect(ok.events[0]).toMatchObject({ kind: "prompt.ended", stopReason: "end_turn" });
    const opts = translateLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sessionId: "ses_x", configOptions: [] } }));
    expect(opts.events).toEqual([]);
  });
});