import { describe, expect, it } from "vitest";
import { BLOCK_PROVENANCE, VIEW_BLOCKS, reduceAll, type StreamEntry } from "../app/src/view/derive.ts";
import type { AgentEvent } from "../app/src/contract/events.ts";
import { EVENT_KINDS } from "../app/src/contract/events.ts";

const src = { method: "session/update", variant: undefined } as const;

const message = (messageId: string, text: string, role: "agent" | "user" = "agent"): AgentEvent => ({
  kind: "message.appended",
  from: src,
  role,
  messageId,
  text,
});

const toolStart = (toolCallId: string, title: string, hint = ""): AgentEvent => ({
  kind: "tool.started",
  from: src,
  toolCallId,
  title,
  hint,
});

const toolUpdate = (toolCallId: string, status: string): AgentEvent => ({
  kind: "tool.updated",
  from: src,
  toolCallId,
  status,
});

describe("unified stream timeline", () => {
  it("keeps tools in arrival order between messages", () => {
    // Same messageId continues the engine's message; a tool between chunks must not
    // swallow the tail — continuation opens a new timeline segment after the tool.
    const view = reduceAll([message("m1", "before "), toolStart("t1", "Read file", "read"), message("m1", "after"), toolUpdate("t1", "completed")]);
    expect(view.stream.map((entry) => entry.type)).toEqual(["message", "tool", "message"]);
    const tool = view.stream.find((entry) => entry.type === "tool");
    expect(tool).toMatchObject({ type: "tool", title: "Read file", status: "completed" });
    const texts = view.stream.flatMap((entry) => (entry.type === "tool" ? [] : [entry.text]));
    expect(texts.join("")).toBe("before after");
  });

  it("stamps first-seen time on stream entries", () => {
    const view = reduceAll([message("m1", "hi")], 1_700_000_000_000);
    expect(view.stream[0]?.atMs).toBe(1_700_000_000_000);
  });

  it("still exposes a tools list for the dossier panel", () => {
    const view = reduceAll([toolStart("t1", "Bash", "shell"), toolUpdate("t1", "done")]);
    expect(view.tools).toHaveLength(1);
    expect(view.tools[0]?.status).toBe("done");
  });
});

describe("provenance coverage (rules-inherited §一.2)", () => {
  it("declares a home for every event kind the contract can emit", () => {
    const declared = new Set(VIEW_BLOCKS.flatMap((block) => BLOCK_PROVENANCE[block]));
    const homeless = EVENT_KINDS.filter((kind) => !declared.has(kind));
    expect(homeless).toEqual([]);
  });
});

describe("stream entry grouping helpers", () => {
  it("user entries open a new turn", async () => {
    const { groupTurns } = await import("../app/src/ui/turns.ts");
    const entries: StreamEntry[] = [
      { key: "user:a", type: "user", text: "one", atMs: 1 },
      { key: "message:b", type: "message", text: "two", atMs: 2 },
      { key: "user:c", type: "user", text: "three", atMs: 3 },
      { key: "thought:d", type: "thought", text: "four", atMs: 4 },
    ];
    const turns = groupTurns(entries);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.items.map((e) => e.type)).toEqual(["user", "message"]);
    expect(turns[1]?.items.map((e) => e.type)).toEqual(["user", "thought"]);
  });
});
