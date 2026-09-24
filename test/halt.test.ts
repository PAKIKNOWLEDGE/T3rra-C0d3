import { describe, expect, it } from "vitest";
import { cancelNotificationLine } from "../app/src/engine/cancel.ts";

/**
 * HALT is a JSON-RPC notification, and the whole architecture consequence hangs on that word:
 * `session/cancel` is only dispatched on the notification branch. Put an `id` on it and the
 * engine answers -32601, which is what an earlier probe did and what the repo then mistook for
 * "the engine cannot be interrupted" (docs/engine-contract-audit.md F1).
 */
describe("cancel line (HALT)", () => {
  it("is a notification: no id, no answer expected", () => {
    const parsed = JSON.parse(cancelNotificationLine("ses_aaa111"));
    expect(parsed).toEqual({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: "ses_aaa111" } });
    expect("id" in parsed).toBe(false);
  });

  it("is newline framed for the stdio pipe", () => {
    expect(cancelNotificationLine("ses_aaa111").endsWith("\n")).toBe(true);
    expect(cancelNotificationLine("ses_aaa111").slice(0, -1).startsWith("{")).toBe(true);
  });

  it("carries the session id and nothing else", () => {
    const parsed = JSON.parse(cancelNotificationLine("ses_x")) as { params: Record<string, unknown> };
    expect(Object.keys(parsed.params)).toEqual(["sessionId"]);
  });
});
