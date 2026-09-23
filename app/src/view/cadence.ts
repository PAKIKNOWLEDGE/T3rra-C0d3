/**
 * Silence judgement — rules-inherited §二.7–9, implemented as numbers.
 *
 *   7. never judge by absolute milliseconds: the baseline is the **median** of the gaps actually
 *      measured for the phase that was waiting; ×8 is slow, ×25 is stalled; fewer than three
 *      samples means **no judgement at all** (`CADENCE NOT ESTABLISHED`); the ten-minute hard
 *      limit is a backstop and may never impersonate a measurement.
 *   8. a gap belongs to the phase that was *active while waiting*, not to the phase the new
 *      event opened — and gaps measured while nothing was running are discarded.
 *   9. changing the model discards the samples; reconnecting the same model keeps them.
 *
 * Pure on purpose: the clock is injected, so a whole timeline can be replayed in a test.
 * The module never invents a number — an unmeasurable silence returns `null`, not a verdict.
 */

/** What the runtime was doing while the clock ran. */
export type ActivityPhase = "idle" | "waiting" | "streaming" | "tool";

/** `unmeasured` is the honest answer when there is no baseline or nothing is running. */
export type SilenceLevel = "unmeasured" | "ok" | "slow" | "stalled";

export const SLOW_FACTOR = 8;
export const STALLED_FACTOR = 25;
export const MIN_SAMPLES = 3;
export const HARD_LIMIT_MS = 10 * 60 * 1000;
const SAMPLE_WINDOW = 50;

export interface Cadence {
  readonly phase: ActivityPhase;
  /**
   * Gaps are kept **per phase**. Rule 7 says the baseline is the median for the *current*
   * phase, and rule 8 says a gap belongs to the phase that was waiting — so a slow first
   * token and a slow tool must not share one number. (An earlier version of this module mixed
   * them into a single list; the tests caught it, which is what tests are for.)
   */
  readonly samples: Readonly<Record<ActivityPhase, readonly number[]>>;
  readonly lastSignAtMs: number | null;
  /** What the last sign was, so the panel can name it instead of saying "something". */
  readonly lastSignKind: string | null;
}

export interface Silence {
  readonly level: SilenceLevel;
  /** How long the current phase has been without a sign. Always a fact when a sign exists. */
  readonly quietMs: number | null;
  readonly baselineMs: number | null;
  readonly ratio: number | null;
  readonly samples: number;
  /** Backstop only: silence past the hard limit while unmeasured. Never a level on its own. */
  readonly backstopExceeded: boolean;
}

const emptySamples = (): Record<ActivityPhase, readonly number[]> => ({ idle: [], waiting: [], streaming: [], tool: [] });

export const startCadence = (): Cadence => ({ phase: "idle", samples: emptySamples(), lastSignAtMs: null, lastSignKind: null });

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const low = sorted[middle - 1];
  const high = sorted[middle];
  return low === undefined || high === undefined ? null : (low + high) / 2;
};

/**
 * Record that activity of `phase` was observed at `nowMs`. The gap since the previous sign is
 * attributed to the phase that was waiting (rule 8); idle-to-something gaps are dropped.
 */
export const observeActivity = (cadence: Cadence, phase: ActivityPhase, nowMs: number, kind?: string): Cadence => {
  const waitingPhase = cadence.phase;
  let samples = cadence.samples;
  if (cadence.lastSignAtMs !== null && waitingPhase !== "idle" && nowMs >= cadence.lastSignAtMs) {
    const gap = nowMs - cadence.lastSignAtMs;
    samples = { ...samples, [waitingPhase]: [...samples[waitingPhase], gap].slice(-SAMPLE_WINDOW) };
  }
  return { phase, samples, lastSignAtMs: nowMs, lastSignKind: kind ?? phase };
};

/** A prompt was just sent: the runtime is expected to start answering. */
export const beginWaiting = (cadence: Cadence, nowMs: number): Cadence => ({
  phase: "waiting",
  samples: cadence.samples,
  lastSignAtMs: nowMs,
  lastSignKind: "session/prompt",
});

/** The turn is over; nothing is running, so nothing may be judged (rule 7). */
export const endTurn = (cadence: Cadence): Cadence => ({ phase: "idle", samples: cadence.samples, lastSignAtMs: null, lastSignKind: null });

/** Rule 9: a different model has a different cadence, so its history is not evidence. */
export const discardSamples = (cadence: Cadence): Cadence => ({ ...cadence, samples: emptySamples() });

export const judgeSilence = (cadence: Cadence, busy: boolean, nowMs: number): Silence => {
  const current = cadence.samples[cadence.phase];
  const samples = current.length;
  const baselineMs = median(current);
  const quietMs = cadence.lastSignAtMs === null || !busy ? null : Math.max(nowMs - cadence.lastSignAtMs, 0);
  const backstopExceeded = quietMs !== null && samples < MIN_SAMPLES && quietMs >= HARD_LIMIT_MS;

  if (!busy || quietMs === null) {
    return { level: "unmeasured", quietMs, baselineMs, ratio: null, samples, backstopExceeded: false };
  }
  if (samples < MIN_SAMPLES || baselineMs === null || baselineMs <= 0) {
    // Not enough evidence to judge. The seconds are still reported; the verdict is refused.
    return { level: "unmeasured", quietMs, baselineMs, ratio: null, samples, backstopExceeded };
  }
  const ratio = quietMs / baselineMs;
  const level: SilenceLevel = ratio >= STALLED_FACTOR ? "stalled" : ratio >= SLOW_FACTOR ? "slow" : "ok";
  return { level, quietMs, baselineMs, ratio, samples, backstopExceeded };
};

export const thresholdMs = (baselineMs: number | null): { readonly slow: number | null; readonly stalled: number | null } =>
  baselineMs === null ? { slow: null, stalled: null } : { slow: baselineMs * SLOW_FACTOR, stalled: baselineMs * STALLED_FACTOR };

/** Floor to whole seconds, the unit the stage reports in. */
export const toSeconds = (ms: number | null): number | null => (ms === null ? null : Math.floor(ms / 1000));

/** What the panels need: the judgement plus the name of the sign it was measured from. */
export type SilenceReport = Silence & { readonly lastSignKind: string | null };

export const report = (cadence: Cadence, busy: boolean, nowMs: number): SilenceReport => ({
  ...judgeSilence(cadence, busy, nowMs),
  lastSignKind: cadence.lastSignKind,
});