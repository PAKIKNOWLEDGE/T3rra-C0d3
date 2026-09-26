/**
 * The event contract — the only shape the UI is allowed to reason about.
 *
 * Re-implemented from the inherited rules (docs/rules.md §一), not copied:
 *  - rule 3: the event stream is the single source of truth, one direction
 *  - rule 2: every event carries `from`, so any block derived from events can declare its
 *    provenance and the union can be machine-checked against the captured traces
 *  - rule 12 / no-invented-numbers: a wire field we cannot state honestly is *not* mapped
 *    (`usage_update` reports context-window fill; a per-turn total is a different quantity,
 *    so neither becomes a number on screen)
 *
 * `message.unmapped` exists on purpose: an unrecognised message is counted, never guessed.
 * Rule 5: `task` / `plan` / `memory` are not runtime concepts and have no place here.
 */

/** Where an event came from on the wire. `variant` is ACP's `sessionUpdate` when there is one. */
export interface EventSource {
  readonly method: string;
  readonly variant: string | undefined;
}

export interface ConfigOptionChoice {
  readonly value: string;
  readonly name: string;
}

/** One runtime-declared option (model / mode / effort). Rendered as given — no whitelist (rule 6 of the old dock). */
export interface ConfigOption {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly currentValue: string;
  readonly choices: readonly ConfigOptionChoice[];
}

/**
 * One row from `session/list`. Only the four fields the engine actually reports —
 * no message count (rule 12 / adapters: list has no round-trip total).
 */
export interface SessionSummary {
  readonly sessionId: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly cwd: string;
}

/** One engine-supplied permission choice. Rendered as given — no id whitelist. */
export interface PermissionOption {
  readonly optionId: string;
  readonly kind: string;
  readonly name: string;
}

/** A live `session/request_permission` waiting for the operator. */
export interface PendingPermission {
  readonly requestId: string;
  readonly summary: string;
  readonly options: readonly PermissionOption[];
}

export type AgentEvent =
  | { readonly kind: "session.opened"; readonly from: EventSource; readonly sessionId: string }
  | { readonly kind: "sessions.updated"; readonly from: EventSource; readonly sessions: readonly SessionSummary[] }
  | { readonly kind: "sessions.removed"; readonly from: EventSource; readonly sessionId: string }
  | { readonly kind: "options.updated"; readonly from: EventSource; readonly options: readonly ConfigOption[] }
  | { readonly kind: "message.appended"; readonly from: EventSource; readonly role: "agent" | "user"; readonly messageId: string; readonly text: string }
  | { readonly kind: "thought.appended"; readonly from: EventSource; readonly messageId: string; readonly text: string }
  | { readonly kind: "tool.started"; readonly from: EventSource; readonly toolCallId: string; readonly title: string; readonly hint: string }
  | { readonly kind: "tool.updated"; readonly from: EventSource; readonly toolCallId: string; readonly status: string }
  | { readonly kind: "permission.requested"; readonly from: EventSource; readonly requestId: string; readonly summary: string; readonly options: readonly PermissionOption[] }
  | { readonly kind: "permission.resolved"; readonly from: EventSource; readonly requestId: string; readonly optionId: string }
  | { readonly kind: "prompt.ended"; readonly from: EventSource; readonly stopReason: string }
  /** A `session/prompt` that answered with an error. It ends the turn just as honestly as
   *  `prompt.ended` does — without it the UI stays `[ RUNNING ]` forever (audit F7). */
  | { readonly kind: "prompt.failed"; readonly from: EventSource; readonly reason: string }
  /** The session list could not be obtained. Distinct from an empty list (rule 12: absence,
   *  never a plausible value) — audit F6 mapped failures as `sessions.updated([])`. */
  | { readonly kind: "sessions.unavailable"; readonly from: EventSource; readonly reason: string }
  /** The byte channel itself is gone. Without this, a dead stream still reads LINK OK (F7). */
  | { readonly kind: "link.down"; readonly from: EventSource; readonly reason: string }
  /** A permission request that will never be answered (turn cancelled / engine restart).
   *  ACP requires the client to reply `cancelled` to outstanding requests; folding that into
   *  `permission.resolved` would invent an option the operator never picked (audit F10). */
  | { readonly kind: "permission.cancelled"; readonly from: EventSource; readonly requestId: string }
  | { readonly kind: "engine.stderr"; readonly from: EventSource; readonly text: string }
  | { readonly kind: "engine.exited"; readonly from: EventSource; readonly code: number | null; readonly signal: string | null }
  | { readonly kind: "message.unmapped"; readonly from: EventSource };

export type AgentEventKind = AgentEvent["kind"];

export const isEventOf = <K extends AgentEventKind>(event: AgentEvent, kind: K): event is Extract<AgentEvent, { kind: K }> => event.kind === kind;

/** Every kind this contract knows; the coverage test walks it against the captured traces. */
export const EVENT_KINDS: readonly AgentEventKind[] = [
  "session.opened",
  "sessions.updated",
  "sessions.removed",
  "options.updated",
  "message.appended",
  "thought.appended",
  "tool.started",
  "tool.updated",
  "permission.requested",
  "permission.resolved",
  "prompt.ended",
  "prompt.failed",
  "sessions.unavailable",
  "link.down",
  "permission.cancelled",
  "engine.stderr",
  "engine.exited",
  "message.unmapped",
];
