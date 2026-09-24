/**
 * Events → the view the renderer reads. Pure fold; no DOM, no clock, no I/O.
 *
 * Inherited rules this file exists to satisfy:
 *  - rule 1: the renderer reads *this*, never the session state or the wire
 *  - rule 2: each block declares `from` — the kinds it consumed — and the union is checked
 *    against the captured traces in `test/acp-coverage.test.ts`
 *  - rule 12: a missing reading stays missing (`NOT REPORTED`), it never becomes a plausible value
 *
 * The stream is a **unified timeline**: messages, thoughts and tools in arrival order,
 * so the conversation view can interleave tool rows without inventing sequence.
 */

import type { AgentEvent, AgentEventKind, ConfigOption } from "../contract/events.ts";

export type BlockName = "session" | "options" | "stream" | "tools" | "transport";

export type StreamEntry =
  | {
      readonly key: string;
      readonly type: "message" | "thought" | "user";
      readonly text: string;
      readonly atMs: number;
    }
  | {
      readonly key: string;
      readonly type: "tool";
      readonly toolCallId: string;
      readonly title: string;
      readonly hint: string;
      readonly status: string;
      readonly atMs: number;
    };

export interface ToolEntry {
  readonly toolCallId: string;
  readonly title: string;
  readonly hint: string;
  readonly status: string;
}

export interface ConsoleView {
  readonly sessionId: string | undefined;
  readonly options: readonly ConfigOption[];
  readonly stream: readonly StreamEntry[];
  readonly tools: readonly ToolEntry[];
  readonly stopReason: string | undefined;
  readonly permissionSummary: string | undefined;
  readonly unmapped: number;
  readonly exited: { readonly code: number | null; readonly signal: string | null } | undefined;
  readonly from: Readonly<Record<BlockName, readonly AgentEventKind[]>>;
}

export const VIEW_BLOCKS: readonly BlockName[] = ["session", "options", "stream", "tools", "transport"];

/**
 * Each block declares the event kinds it consumes. This is a *static* declaration on purpose:
 * a union computed from whatever happened to arrive proves nothing, while a written-down map
 * can be checked against both the contract's full kind list and the captured traffic.
 */
export const BLOCK_PROVENANCE: Readonly<Record<BlockName, readonly AgentEventKind[]>> = {
  session: ["session.opened", "permission.requested", "prompt.ended"],
  options: ["options.updated"],
  stream: ["message.appended", "thought.appended", "tool.started", "tool.updated"],
  tools: ["tool.started", "tool.updated"],
  transport: ["engine.stderr", "engine.exited", "message.unmapped"],
};

export const emptyView = (): ConsoleView => ({
  sessionId: undefined,
  options: [],
  stream: [],
  tools: [],
  stopReason: undefined,
  permissionSummary: undefined,
  unmapped: 0,
  exited: undefined,
  from: BLOCK_PROVENANCE,
});

/** Append a text chunk to the entry it belongs to; chunking is the engine's, not ours.
 * Merge only when this chunk continues the *immediately previous* entry of the same key —
 * a tool (or another speaker) in between closes the segment, so later chunks open a
 * continuation entry and the timeline keeps true arrival order. */
const appendTextChunk = (
  stream: readonly StreamEntry[],
  entry: Extract<StreamEntry, { type: "message" | "thought" | "user" }>,
): readonly StreamEntry[] => {
  const last = stream[stream.length - 1];
  if (last !== undefined && last.type !== "tool" && last.key === entry.key && "text" in last) {
    return [...stream.slice(0, -1), { ...last, text: last.text + entry.text }];
  }
  if (stream.some((item) => item.key === entry.key)) {
    return [...stream, { ...entry, key: `${entry.key}@${stream.length}` }];
  }
  return [...stream, entry];
};

const upsertTool = (
  stream: readonly StreamEntry[],
  entry: Extract<StreamEntry, { type: "tool" }>,
): readonly StreamEntry[] => {
  const index = stream.findIndex((item) => item.key === entry.key);
  if (index < 0) return [...stream, entry];
  const existing = stream[index];
  if (existing === undefined || existing.type !== "tool") return [...stream, entry];
  return [...stream.slice(0, index), { ...existing, ...entry, atMs: existing.atMs }, ...stream.slice(index + 1)];
};

export const reduceView = (view: ConsoleView, event: AgentEvent, nowMs?: number): ConsoleView => {
  const at = nowMs ?? 0;
  switch (event.kind) {
    case "session.opened":
      return { ...view, sessionId: event.sessionId };

    case "options.updated":
      return {
        ...view,
        options: event.options,
        // A runtime that re-declares its options re-declares the whole list; an empty list
        // means "none declared yet", which is why it is not treated as a removal.
      };

    case "message.appended":
      return {
        ...view,
        stream: appendTextChunk(view.stream, {
          key: `${event.role === "user" ? "user" : "message"}:${event.messageId}`,
          type: event.role === "user" ? "user" : "message",
          text: event.text,
          atMs: at,
        }),
      };

    case "thought.appended":
      return {
        ...view,
        stream: appendTextChunk(view.stream, {
          key: `thought:${event.messageId}`,
          type: "thought",
          text: event.text,
          atMs: at,
        }),
      };

    case "tool.started": {
      const key = `tool:${event.toolCallId}`;
      const knownInStream = view.stream.some((entry) => entry.key === key);
      const knownInTools = view.tools.some((tool) => tool.toolCallId === event.toolCallId);
      return {
        ...view,
        stream: knownInStream
          ? view.stream
          : [
              ...view.stream,
              {
                key,
                type: "tool",
                toolCallId: event.toolCallId,
                title: event.title,
                hint: event.hint,
                status: "running",
                atMs: at,
              },
            ],
        tools: knownInTools
          ? view.tools
          : [...view.tools, { toolCallId: event.toolCallId, title: event.title, hint: event.hint, status: "running" }],
      };
    }

    case "tool.updated": {
      const key = `tool:${event.toolCallId}`;
      const tool = view.tools.find((item) => item.toolCallId === event.toolCallId);
      return {
        ...view,
        stream: upsertTool(view.stream, {
          key,
          type: "tool",
          toolCallId: event.toolCallId,
          title: tool?.title ?? event.toolCallId,
          hint: tool?.hint ?? "",
          status: event.status,
          atMs: at,
        }),
        tools: view.tools.some((item) => item.toolCallId === event.toolCallId)
          ? view.tools.map((item) => (item.toolCallId === event.toolCallId ? { ...item, status: event.status } : item))
          : view.tools,
      };
    }

    case "permission.requested":
      return { ...view, permissionSummary: event.summary };

    case "prompt.ended":
      return { ...view, stopReason: event.stopReason };

    case "engine.stderr":
    case "engine.exited":
    case "message.unmapped":
      return {
        ...view,
        unmapped: event.kind === "message.unmapped" ? view.unmapped + 1 : view.unmapped,
        exited: event.kind === "engine.exited" ? { code: event.code, signal: event.signal } : view.exited,
      };
  }
};

export const reduceAll = (events: readonly AgentEvent[], nowMs = 0): ConsoleView =>
  events.reduce((view, event) => reduceView(view, event, nowMs), emptyView());
