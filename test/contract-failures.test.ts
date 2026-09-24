import { describe, expect, it } from "vitest";
import { errorReasonOf, failureEvents, mapResponse } from "../app/src/engine/responses.ts";
import { translateLine } from "../app/src/engine/acp.ts";
import { emptyView, reduceView } from "../app/src/view/derive.ts";

/**
 * Failure paths of the engine contract (docs/engine-contract-audit.md F4 / F6 / F7).
 *
 * These exist because the previous behaviour was *plausible*: a broken `session/list` produced
 * an empty list, which is exactly what a working `session/list` with no sessions produces. The
 * only way to keep those apart is to test both shapes side by side, so that is what this file does.
 * Payloads are the shapes recorded in traces/opencode/ — not invented field names.
 */
describe("failed responses (F6 / F7)", () => {
  it("does not turn a session/list error into 'there are no sessions'", () => {
    const error = { code: -32603, message: "internal error" };
    const kinds = failureEvents("session/list", error).map((event) => event.kind);
    expect(kinds).toEqual(["sessions.unavailable"]);
    expect(kinds).not.toContain("sessions.updated");
  });

  it("keeps a genuinely empty list as an empty list, which is a different fact", () => {
    const mapping = mapResponse("session/list", { sessions: [] });
    expect(mapping.events.map((event) => event.kind)).toEqual(["sessions.updated"]);
  });

  it("ends the turn honestly when session/prompt answers with an error", () => {
    const [event] = failureEvents("session/prompt", { code: -32603, message: "boom" });
    expect(event?.kind).toBe("prompt.failed");
    // The reducer must accept it; the pre-fix contract had no such kind, so `busy` could only
    // ever be cleared by a success.
    const view = reduceView(reduceView(emptyView(), { kind: "prompt.ended", from: { method: "x", variant: undefined }, stopReason: "end_turn" }), event ?? ({} as never));
    expect(view.promptError).toBe("code -32603 · boom");
  });

  it("surfaces a reason string instead of swallowing an error with no message", () => {
    expect(errorReasonOf({ code: 1 })).toBe("code 1");
    expect(errorReasonOf("plain")).toBe("plain");
    expect(errorReasonOf(null)).toBe("engine returned an error with no message");
  });
});

describe("unavailable list keeps the last known rows (F6)", () => {
  const rows = [
    { sessionId: "ses_a", title: "A", updatedAt: "2026-09-24T10:35:50.218Z", cwd: "C:\\w" },
    { sessionId: "ses_b", title: "B", updatedAt: "2026-09-24T10:36:50.218Z", cwd: "C:\\w" },
  ];

  it("does not erase a list it could not refetch", () => {
    const loaded = reduceView(emptyView(), { kind: "sessions.updated", from: { method: "session/list.response", variant: undefined }, sessions: rows });
    const failed = reduceView(loaded, { kind: "sessions.unavailable", from: { method: "session/list.error", variant: undefined }, reason: "code -32603" });
    expect(failed.sessions).toHaveLength(2);
    expect(failed.sessionsUnavailable).toBe("code -32603");
  });

  it("clears the failure banner once a later attempt succeeds", () => {
    const failed = reduceView(emptyView(), { kind: "sessions.unavailable", from: { method: "session/list.error", variant: undefined }, reason: "nope" });
    const recovered = reduceView(failed, { kind: "sessions.updated", from: { method: "session/list.response", variant: undefined }, sessions: rows });
    expect(recovered.sessionsUnavailable).toBeUndefined();
  });
});

describe("cancelled approvals (F10)", () => {
  it("drops the dock without inventing an option the operator never picked", () => {
    const asked = reduceView(emptyView(), {
      kind: "permission.requested",
      from: { method: "session/request_permission", variant: undefined },
      requestId: "0",
      summary: "edit · src/main.ts",
      options: [{ optionId: "once", kind: "allow_once", name: "Allow once" }],
    });
    expect(asked.permission?.requestId).toBe("0");
    const cancelled = reduceView(asked, { kind: "permission.cancelled", from: { method: "session/cancel", variant: undefined }, requestId: "0" });
    expect(cancelled.permission).toBeUndefined();
  });

  it("ignores a cancellation for a request that is not the one on screen", () => {
    const asked = reduceView(emptyView(), {
      kind: "permission.requested",
      from: { method: "session/request_permission", variant: undefined },
      requestId: "7",
      summary: "bash",
      options: [],
    });
    const stale = reduceView(asked, { kind: "permission.cancelled", from: { method: "session/cancel", variant: undefined }, requestId: "3" });
    expect(stale.permission?.requestId).toBe("7");
  });
});

/** F4: every `session/update` names its session; the adapter must hand that to the router. */
describe("per-line session attribution (F4)", () => {
  // Shape taken from traces/opencode/opencode-acp-2026-09-23T07-16-56-546Z-prompt.jsonl:23-28
  // (both chunk kinds carry `messageId`; the text is one token, not a sentence).
  const updateOf = (sessionId: string): string =>
    JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId, update: { sessionUpdate: "agent_thought_chunk", messageId: "prt_0ccd38fd6001xWICjt6trYr4EF", content: { type: "text", text: "The" } } },
    });

  it("reports the session a chunk belongs to", () => {
    expect(translateLine(updateOf("ses_f2cdf1561ffe8sRFoSJr1q7QMh")).sessionId).toBe("ses_f2cdf1561ffe8sRFoSJr1q7QMh");
  });

  it("says undefined rather than guessing a session", () => {
    const line = JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "available_commands_update", availableCommands: [] } } });
    expect(translateLine(line).sessionId).toBeUndefined();
  });

  it("still attributes an engine permission request to its session", () => {
    const line = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "session/request_permission", params: { sessionId: "ses_x", options: [] } });
    expect(translateLine(line).sessionId).toBe("ses_x");
  });

  it("does not claim a response line belongs to a session", () => {
    const line = JSON.stringify({ jsonrpc: "2.0", id: 4, result: { stopReason: "cancelled" } });
    const translated = translateLine(line);
    expect(translated.isResponse).toBe(true);
    expect(translated.sessionId).toBeUndefined();
  });
});
