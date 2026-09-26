import { describe, expect, it } from "vitest";
import { canRecoverRunningTurn, linkDownFacts, routeSessionUpdate, sessionListFailureFacts, shouldApplyPermissionSync } from "../app/src/main-flow.ts";

describe("assembly-root wiring decisions", () => {
  it("keeps list failure visible as a failure instead of clearing rows", () => {
    expect(sessionListFailureFacts("code -32603")).toEqual({ phaseNote: "会话列表取不到 · code -32603" });
  });

  it("drops updates from a different session with a visible reason", () => {
    expect(routeSessionUpdate("ses_other_123456", "ses_current_abcdef")).toEqual({
      accept: false,
      lastError: "dropped update for session ses_other_12… (showing ses_current_…)",
      phaseNote: "丢弃了一条别的会话的更新",
    });
    expect(routeSessionUpdate("ses_current_abcdef", "ses_current_abcdef")).toEqual({ accept: true });
  });

  it("normalizes link-down facts for the visible recovery path", () => {
    expect(linkDownFacts("stream reconnecting")).toEqual({
      busy: false,
      phase: "链路断开",
      phaseNote: "通道 stream reconnecting · 按右下「重启」",
      lastError: "byte channel down: stream reconnecting",
    });
  });

  it("ignores a stale permission read after a newer policy or cwd change", () => {
    expect(shouldApplyPermissionSync(3, 4, "C:\\project", "C:\\project")).toBe(false);
    expect(shouldApplyPermissionSync(4, 4, "C:\\old", "C:\\new")).toBe(false);
    expect(shouldApplyPermissionSync(4, 4, "C:\\project", "C:\\project")).toBe(true);
  });

  it("restores the locked boundary only when a refresh has a complete turn record", () => {
    expect(canRecoverRunningTurn(true, "ses_current", 7)).toBe(true);
    expect(canRecoverRunningTurn(true, "ses_current", undefined)).toBe(false);
    expect(canRecoverRunningTurn(false, "ses_current", 7)).toBe(false);
  });
});
