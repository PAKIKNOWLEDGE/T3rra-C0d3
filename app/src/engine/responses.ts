/**
 * Responses → events. The counterpart of `acp.ts`: that file maps notifications, this one maps
 * the answers to what we sent.
 *
 * It exists as a separate, pure module because of a bug the owner caught: the session's mode
 * chip looked dead after clicking it. The engine had accepted the change and answered with
 * the full, updated option list — and the renderer dropped that answer on the floor because only
 * `initialize` and `session/new` were being read. A mapping table that only lives inside the
 * DOM boot code cannot be tested; this one can, and `test/responses.test.ts` pins that exact case.
 *
 * Rule kept from `acp.ts`: no number is invented. A response that carries no fact we understand
 * produces no event, and never a plausible-looking one.
 */

import { translateLine } from "./acp.ts";
import type { AgentEvent, SessionSummary } from "../contract/events.ts";

export interface ResponseMapping {
  readonly events: readonly AgentEvent[];
  /** Present on `session/new` (and `session/load`). */
  readonly sessionId: string | undefined;
  /** Present on `initialize`; the engine's own name and version. */
  readonly agentName: string | undefined;
  /** True when this response type is part of the protocol we act on. */
  readonly recognised: boolean;
}

/** A late session/load response must not retarget a newer session selection. */
export const shouldApplySessionLoad = (
  method: string,
  requestedSessionId: string | undefined,
  currentSessionId: string | undefined,
): boolean => method !== "session/load" || requestedSessionId === undefined || requestedSessionId === currentSessionId;

/** Returns whether a successful session/list response still contains the target session. */
export const sessionPresentInList = (events: readonly AgentEvent[], sessionId: string): boolean | undefined => {
  const update = events.find((event): event is Extract<AgentEvent, { kind: "sessions.updated" }> => event.kind === "sessions.updated");
  return update?.sessions.some((session) => session.sessionId === sessionId);
};

const OPTION_SOURCE = { method: "config_option_update", variant: undefined } as const;

/** A response carrying `configOptions` is the authoritative post-change option list. */
export const optionsEventOf = (configOptions: readonly unknown[]): AgentEvent => {
  const [event] = translateLine(
    JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "config_option_update", configOptions } } }),
  ).events;
  return event ?? { kind: "message.unmapped", from: OPTION_SOURCE };
};

/** session/list entries — only the four fields the engine reports (adapters §三). */
export const mapSessionList = (result: unknown): readonly SessionSummary[] => {
  const payload = result as { sessions?: unknown } | unknown[] | null;
  const raw = Array.isArray(payload) ? payload : ((payload as { sessions?: unknown } | null)?.sessions ?? []);
  if (!Array.isArray(raw)) return [];
  const out: SessionSummary[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const row = item as { sessionId?: unknown; id?: unknown; title?: unknown; updatedAt?: unknown; cwd?: unknown };
    const sessionId = typeof row.sessionId === "string" ? row.sessionId : typeof row.id === "string" ? row.id : "";
    if (sessionId === "") continue;
    out.push({
      sessionId,
      title: typeof row.title === "string" ? row.title : "",
      updatedAt: row.updatedAt === undefined || row.updatedAt === null ? "" : String(row.updatedAt),
      cwd: typeof row.cwd === "string" ? row.cwd : "",
    });
  }
  return out;
};

export const mapResponse = (method: string, result: unknown, requestedSessionId?: string): ResponseMapping => {
  const events: AgentEvent[] = [];
  let sessionId: string | undefined;
  let agentName: string | undefined;

  if (method === "initialize") {
    const info = (result as { agentInfo?: { name?: string; version?: string } } | null)?.agentInfo;
    const name = [info?.name, info?.version].filter((part) => part !== undefined && part !== "").join(" ");
    agentName = name === "" ? undefined : name;
    return { events, sessionId, agentName, recognised: true };
  }

  if (method === "session/new" || method === "session/load") {
    const payload = result as { sessionId?: string; configOptions?: readonly unknown[] } | null;
    const returnedSessionId = typeof payload?.sessionId === "string" ? payload.sessionId : undefined;
    // `session/load` responses in the real ACP trace carry configOptions but omit sessionId.
    // The request is the authoritative correlation for that response, so use the requested id
    // only for load; session/new must still prove its id in the response.
    sessionId = returnedSessionId ?? (method === "session/load" ? requestedSessionId : undefined);
    if (sessionId !== undefined) {
      events.push({ kind: "session.opened", from: { method: `${method}.response`, variant: undefined }, sessionId });
    }
    if (payload?.configOptions !== undefined) events.push(optionsEventOf(payload.configOptions));
    return { events, sessionId, agentName, recognised: true };
  }

  if (method === "session/close") {
    return { events, sessionId, agentName, recognised: true };
  }

  if (method === "session/list") {
    events.push({
      kind: "sessions.updated",
      from: { method: "session/list.response", variant: undefined },
      sessions: mapSessionList(result),
    });
    return { events, sessionId, agentName, recognised: true };
  }

  if (method === "session/set_config_option") {
    const payload = result as { configOptions?: readonly unknown[] } | null;
    if (payload?.configOptions !== undefined) events.push(optionsEventOf(payload.configOptions));
    return { events, sessionId, agentName, recognised: true };
  }

  if (method === "session/prompt") {
    // The stop reason is the fact that ends a turn; `usage` is deliberately not mapped
    // (context fill and a per-turn total are different quantities — see acp.ts).
    const payload = result as { stopReason?: string } | null;
    if (typeof payload?.stopReason === "string") {
      events.push({ kind: "prompt.ended", from: { method: "session/prompt.response", variant: undefined }, stopReason: payload.stopReason });
    }
    return { events, sessionId, agentName, recognised: true };
  }

  return { events, sessionId, agentName, recognised: false };
};

/**
 * One failed request → one honest event. Never an empty result, never a fabricated open.
 *
 * Lives beside the success mapping on purpose: the two are one decision ("what did this reply
 * mean"), and splitting them across modules is how the failure branch got forgotten. A failure
 * rendered as an empty list claims knowledge the engine never gave us (rule 12 / audit F6).
 */
export const failureEvents = (method: string, error: unknown): readonly AgentEvent[] => {
  const reason = errorReasonOf(error);
  const from = { method: `${method}.error`, variant: undefined } as const;
  switch (method) {
    case "session/prompt":
      // The turn is over even when it ends badly; without this `busy` never clears (F7).
      return [{ kind: "prompt.failed", from, reason }];
    case "session/list":
      return [{ kind: "sessions.unavailable", from, reason }];
    default:
      return [{ kind: "message.unmapped", from }];
  }
};

/**
 * One-line reason extracted from a JSON-RPC error payload.
 *
 * Used instead of silently producing an empty result: a failure rendered as "no sessions" is
 * a fabricated fact (rule 12 / audit F6), so the caller needs a string it can display.
 */
export const errorReasonOf = (error: unknown): string => {
  if (typeof error === "string") return error.slice(0, 160);
  if (error !== null && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    const message = typeof record.message === "string" ? record.message : "";
    const code = typeof record.code === "number" ? `code ${record.code}` : "";
    const joined = [code, message].filter((part) => part !== "").join(" · ");
    if (joined !== "") return joined.slice(0, 160);
  }
  return "engine returned an error with no message";
};
