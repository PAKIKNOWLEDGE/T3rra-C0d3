import { describe, expect, it } from "vitest";
import {
  HARD_LIMIT_MS,
  MIN_SAMPLES,
  beginWaiting,
  discardSamples,
  endTurn,
  judgeSilence,
  observeActivity,
  report,
  startCadence,
  thresholdMs,
  toSeconds,
} from "../app/src/view/cadence.ts";

/** Replay a timeline of (phase, at) activity points, exactly as the renderer would. */
const replay = (points: readonly (readonly [string, number])[], startWaitingAt = 0) => {
  let cadence = beginWaiting(startCadence(), startWaitingAt);
  for (const [phase, at] of points) {
    cadence = observeActivity(cadence, phase as Parameters<typeof observeActivity>[1], at);
  }
  return cadence;
};

describe("silence judgement (rules §二.7-9)", () => {
  it("uses the median of measured gaps, not a mean or a constant", () => {
    const cadence = replay([
      ["streaming", 100],
      ["streaming", 200],
      ["streaming", 400],
      ["streaming", 800],
    ]);
    const silence = judgeSilence(cadence, true, 800);
    // gaps: 100, 200, 400 -> median 200, regardless of the outlier
    expect(silence.baselineMs).toBe(200);
    expect(silence.samples).toBe(3);
    expect(thresholdMs(silence.baselineMs)).toEqual({ slow: 1600, stalled: 5000 });
  });

  it("calls ×8 slow and ×25 stalled, and stays ok below that", () => {
    const cadence = replay([
      ["streaming", 100],
      ["streaming", 200],
      ["streaming", 300],
      ["streaming", 400],
    ]);
    expect(judgeSilence(cadence, true, 400 + 100).level).toBe("ok");
    expect(judgeSilence(cadence, true, 400 + 100 * 8).level).toBe("slow");
    expect(judgeSilence(cadence, true, 400 + 100 * 25).level).toBe("stalled");
    expect(judgeSilence(cadence, true, 400 + 100 * 8).ratio).toBe(8);
  });

  it("refuses a verdict below three samples, but still reports the quiet seconds", () => {
    const cadence = replay([
      ["streaming", 100],
      ["streaming", 200],
    ]);
    const silence = judgeSilence(cadence, true, 9000);
    expect(silence.samples).toBe(1);
    expect(silence.level).toBe("unmeasured");
    expect(silence.ratio).toBeNull();
    expect(toSeconds(silence.quietMs)).toBe(8);
  });

  it("treats the hard limit as a backstop, never as a measurement", () => {
    const cadence = replay([["streaming", 100]]);
    const silence = judgeSilence(cadence, true, 100 + HARD_LIMIT_MS + 1);
    expect(silence.backstopExceeded).toBe(true);
    expect(silence.level).toBe("unmeasured"); // honest: we still cannot measure it
    expect(silence.ratio).toBeNull();
  });

  it("attributes a gap to the phase that was waiting, not the one that opened", () => {
    let cadence = beginWaiting(startCadence(), 0);
    cadence = observeActivity(cadence, "streaming", 100);
    cadence = observeActivity(cadence, "streaming", 200);
    cadence = observeActivity(cadence, "streaming", 300);
    // the tool call arrives after 1000ms of silence: that gap belongs to `streaming`
    cadence = observeActivity(cadence, "tool", 1300);
    expect(cadence.samples.streaming).toEqual([100, 100, 1000]);
    expect(cadence.phase).toBe("tool");
  });

  it("discards gaps measured while nothing was running", () => {
    let cadence = endTurn(startCadence());
    cadence = observeActivity(cadence, "tool", 60_000);
    expect(cadence.samples.tool).toEqual([]);
    expect(cadence.lastSignAtMs).toBe(60_000);
  });

  it("keeps samples across a reconnect but drops them when the model changes (rule 9)", () => {
    const cadence = replay([
      ["streaming", 100],
      ["streaming", 200],
      ["streaming", 300],
    ]);
    expect(cadence.samples.streaming).toHaveLength(2);
    expect(discardSamples(cadence).samples.streaming).toHaveLength(0);
    expect(judgeSilence(discardSamples(cadence), true, 5000).level).toBe("unmeasured");
  });

  it("reports the quiet time as a fact even when the baseline is missing", () => {
    const cadence = beginWaiting(startCadence(), 0);
    const silence = judgeSilence(cadence, true, 4200);
    expect(silence.quietMs).toBe(4200);
    expect(silence.level).toBe("unmeasured");
    expect(silence.samples).toBe(0);
  });

  it("never judges while nothing is running", () => {
    const cadence = replay([
      ["streaming", 100],
      ["streaming", 200],
      ["streaming", 300],
    ]);
    const idle = judgeSilence(cadence, false, 999_999);
    expect(idle.level).toBe("unmeasured");
    expect(idle.quietMs).toBeNull();
    expect(MIN_SAMPLES).toBe(3);
  });

  it("names the sign it measured from, and still refuses a verdict on one sample", () => {
    let cadence = beginWaiting(startCadence(), 0);
    cadence = observeActivity(cadence, "tool", 500, "tool.updated");
    const now = report(cadence, true, 900);
    expect(now.lastSignKind).toBe("tool.updated");
    expect(now.level).toBe("unmeasured");
    expect(now.quietMs).toBe(400);
  });
});