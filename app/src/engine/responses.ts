/**
 * Responses → events. The counterpart of `acp.ts`: that file maps notifications, this one maps
 * the answers to what we sent.
 *
 * It exists as a separate, pure module because of a bug the owner caught: the session's mode
 * chip looked dead after clicking it. The engine had accepted the change and answered with the
 * full, updated option list — and the renderer dropped that answer on the floor because only
 * `initialize` and `session/new` were being read. A mapping table that only lives inside the
 * DOM boot code cannot be tested; this one can, and `test/responses.test.ts` pins that exact case.
 *
 * Rule kept from `acp.ts`: no number is invented. A response that carries no fact we understand
 * produces no event, and never a plausible-looking one.
 */

import { translateLine } from "./acp.ts";
import type { AgentEvent } from "../contract/events.ts";

export interface ResponseMapping {
  readonly events: readonly AgentEvent[];
  /** Present on `session/new` (and `session/load`). */
  readonly sessionId: string | undefined;
  /** Present on `initialize`; the engine's own name and version. */
  readonly agentName: string | undefined;
  /** True when this response type is part of the protocol we act on. */
  readonly recognised: boolean;
}

const OPTION_SOURCE = { method: "config_option_update", variant: undefined } as const;

/** A response carrying `configOptions` is the authoritative post-change option list. */
export const optionsEventOf = (configOptions: readonly unknown[]): AgentEvent => {
  const [event] = translateLine(
    JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "config_option_update", configOptions } } }),
  ).events;
  return event ?? { kind: "message.unmapped", from: OPTION_SOURCE };
};

export const mapResponse = (method: string, result: unknown): ResponseMapping => {
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
    if (typeof payload?.sessionId === "string") {
      sessionId = payload.sessionId;
      events.push({ kind: "session.opened", from: { method: `${method}.response`, variant: undefined }, sessionId: payload.sessionId });
    }
    if (payload?.configOptions !== undefined) events.push(optionsEventOf(payload.configOptions));
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