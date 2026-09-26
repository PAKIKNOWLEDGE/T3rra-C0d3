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

import type { AgentEvent, AgentEventKind, ConfigOption, ContextUsage, PendingPermission, SessionSummary, ToolDetails } from "../contract/events.ts";

export type BlockName = "session" | "options" | "usage" | "stream" | "tools" | "transport";

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
      readonly details: ToolDetails;
      readonly startedAtMs: number;
      readonly updatedAtMs: number;
      readonly durationMs: number;
      readonly atMs: number;
    };

export interface ToolEntry {
  readonly toolCallId: string;
  readonly title: string;
  readonly hint: string;
  readonly status: string;
  readonly details: ToolDetails;
  readonly startedAtMs: number;
  readonly updatedAtMs: number;
  readonly durationMs: number;
}

export interface ConsoleView {
  readonly sessionId: string | undefined;
  readonly options: readonly ConfigOption[];
  readonly usage: ContextUsage | undefined;
  readonly stream: readonly StreamEntry[];
  readonly tools: readonly ToolEntry[];
  readonly sessions: readonly SessionSummary[];
  /**
   * Why the session list could not be obtained, or undefined when the last attempt succeeded.
   * Kept apart from `sessions` so a failure can never be displayed as "there are none" (F6).
   */
  readonly sessionsUnavailable: string | undefined;
  /** Why the turn ended in error; the turn is over, but it did not end well (F7). */
  readonly promptError: string | undefined;
  /** Why the byte channel is down, or undefined while it is up (F7). */
  readonly linkDown: string | undefined;
  readonly stopReason: string | undefined;
  /** Live approval waiting on the operator; undefined when none (or already resolved). */
  readonly permission: PendingPermission | undefined;
  readonly unmapped: number;
  readonly exited: { readonly code: number | null; readonly signal: string | null } | undefined;
  readonly from: Readonly<Record<BlockName, readonly AgentEventKind[]>>;
}

export const VIEW_BLOCKS: readonly BlockName[] = ["session", "options", "usage", "stream", "tools", "transport"];

/**
 * Each block declares the event kinds it consumes. This is a *static* declaration on purpose:
 * a union computed from whatever happened to arrive proves nothing, while a written-down map
 * can be checked against both the contract's full kind list and the captured traffic.
 */
export const BLOCK_PROVENANCE: Readonly<Record<BlockName, readonly AgentEventKind[]>> = {
  session: ["session.opened", "sessions.updated", "sessions.unavailable", "sessions.removed", "permission.requested", "permission.resolved", "prompt.ended", "prompt.failed", "permission.cancelled"],
  options: ["options.updated"],
  usage: ["usage.updated"],
  stream: ["message.appended", "thought.appended", "tool.started", "tool.updated"],
  tools: ["tool.started", "tool.updated"],
  transport: ["engine.stderr", "engine.exited", "link.down", "message.unmapped"],
};

export const emptyView = (): ConsoleView => ({
  sessionId: undefined,
  options: [],
  usage: undefined,
  stream: [],
  tools: [],
  sessions: [],
  sessionsUnavailable: undefined,
  promptError: undefined,
  linkDown: undefined,
  stopReason: undefined,
  permission: undefined,
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
  // A refresh can replay the same persisted user message after a local copy has already
  // been restored. Drop only an exact duplicate with a real message id; distinct turns may
  // legitimately reuse the same text, and empty ids are not safe identities.
  if (entry.type === "user" && entry.key !== "user:" && stream.some((item) => item.type === "user" && item.key === entry.key && item.text === entry.text)) {
    return stream;
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
  return [...stream.slice(0, index), { ...existing, ...entry, atMs: existing.atMs, startedAtMs: existing.startedAtMs }, ...stream.slice(index + 1)];
};

const mergeToolDetails = (current: ToolDetails | undefined, patch: Partial<ToolDetails> | undefined): ToolDetails => ({
  locations: patch?.locations === undefined || patch.locations.length === 0 ? current?.locations ?? [] : patch.locations,
  input: patch?.input ?? current?.input,
  output: patch?.output ?? current?.output,
  error: patch?.error ?? current?.error,
});

export const reduceView = (view: ConsoleView, event: AgentEvent, nowMs?: number): ConsoleView => {
  const at = nowMs ?? 0;
  switch (event.kind) {
    case "session.opened":
      return { ...view, sessionId: event.sessionId };

    case "sessions.updated":
      return { ...view, sessions: event.sessions, sessionsUnavailable: undefined };

    case "sessions.unavailable":
      // Failure keeps the previous rows on screen and declares itself. Rendering it as an empty
      // list would turn "cannot tell" into "there are none" — the exact defect audit F6 names.
      return { ...view, sessionsUnavailable: event.reason };

    case "sessions.removed":
      return { ...view, sessions: view.sessions.filter((item) => item.sessionId !== event.sessionId) };

    case "options.updated":
      return {
        ...view,
        options: event.options,
        // A runtime that re-declares its options re-declares the whole list; an empty list
        // means "none declared yet", which is why it is not treated as a removal.
      };

    case "usage.updated":
      return { ...view, usage: event.usage };

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
      const snapshot = {
        toolCallId: event.toolCallId,
        title: event.title,
        hint: event.hint,
        status: event.status,
        details: event.details,
        startedAtMs: at,
        updatedAtMs: at,
        durationMs: 0,
      };
      return {
        ...view,
        stream: knownInStream
          ? view.stream
          : [
              ...view.stream,
              {
                key,
                type: "tool",
                ...snapshot,
                atMs: at,
              },
            ],
        tools: knownInTools
          ? view.tools
          : [...view.tools, snapshot],
      };
    }

    case "tool.updated": {
      const key = `tool:${event.toolCallId}`;
      const tool = view.tools.find((item) => item.toolCallId === event.toolCallId);
      const streamTool = view.stream.find((item): item is Extract<StreamEntry, { type: "tool" }> => item.type === "tool" && item.toolCallId === event.toolCallId);
      const startedAtMs = tool?.startedAtMs ?? streamTool?.startedAtMs ?? at;
      const snapshot = {
        toolCallId: event.toolCallId,
        title: event.title ?? tool?.title ?? streamTool?.title ?? event.toolCallId,
        hint: event.hint ?? tool?.hint ?? streamTool?.hint ?? "",
        status: event.status,
        details: mergeToolDetails(tool?.details ?? streamTool?.details, event.details),
        startedAtMs,
        updatedAtMs: at,
        durationMs: Math.max(0, at - startedAtMs),
      };
      return {
        ...view,
        stream: upsertTool(view.stream, { key, type: "tool", ...snapshot, atMs: streamTool?.atMs ?? at }),
        tools: view.tools.some((item) => item.toolCallId === event.toolCallId)
          ? view.tools.map((item) => (item.toolCallId === event.toolCallId ? snapshot : item))
          : [...view.tools, snapshot],
      };
    }

    case "permission.requested":
      return {
        ...view,
        permission: { requestId: event.requestId, summary: event.summary, options: event.options },
      };

    case "permission.resolved":
      return view.permission?.requestId === event.requestId ? { ...view, permission: undefined } : view;

    case "prompt.ended":
      return { ...view, stopReason: event.stopReason };

    case "prompt.failed":
      // An errored `session/prompt` still ends the turn; without this arm `busy` never clears
      // and the dock sits on `[ RUNNING ]` with a stopped engine behind it (audit F7).
      return { ...view, promptError: event.reason };

    case "link.down":
      return { ...view, linkDown: event.reason };

    case "permission.cancelled":
      // The request will never be answered. Clearing the dock without inventing an
      // `optionId` is what keeps this honest (audit F10).
      return view.permission?.requestId === event.requestId ? { ...view, permission: undefined } : view;

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
