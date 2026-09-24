import type { StreamEntry } from "../view/derive.ts";

export interface Turn {
  /** The operator instruction that opened this turn, when there is one. */
  readonly opener: StreamEntry | undefined;
  readonly items: readonly StreamEntry[];
}

/**
 * A new turn starts at every user message. Agent content before the first user line
 * forms one preamble turn (session load / greeting) so nothing is orphaned.
 */
export const groupTurns = (stream: readonly StreamEntry[]): readonly Turn[] => {
  const turns: Turn[] = [];
  let current: StreamEntry[] = [];
  let opener: StreamEntry | undefined;

  const push = (): void => {
    if (current.length === 0) return;
    turns.push({ opener, items: current });
    current = [];
  };

  for (const entry of stream) {
    if (entry.type === "user") {
      push();
      opener = entry;
      current = [entry];
    } else {
      current.push(entry);
    }
  }
  push();
  return turns;
};
