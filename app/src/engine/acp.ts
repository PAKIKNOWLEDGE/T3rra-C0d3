/**
 * ACP → event translation. Pure: a line in, events out. No I/O, no clock, no globals.
 *
 * The mapping follows docs/adapters/opencode-acp.md, which was written from captured traces
 * (`traces/opencode/*.jsonl`) rather than from documentation. Three decisions worth naming:
 *
 *  - **A message we do not recognise is counted, not guessed.** It becomes `message.unmapped`;
 *    it never becomes a notice, and it never crashes the reducer.
 *  - **No number is invented.** `usage_update` carries context-window fill; a per-turn total is
 *    a different quantity. Neither is mapped, so nothing on screen can imply the other.
 *  - **Tool identity uses `title`, not `kind`.** The captured traces show `kind` labelling a
 *    directory listing as `read`, so `kind` is not trustworthy as a display hint.
 */

import type { AgentEvent, ConfigOption, EventSource, PermissionOption } from "../contract/events.ts";

export interface TranslationResult {
  readonly events: readonly AgentEvent[];
  /** True when the line was a response to something we sent rather than a notification. */
  readonly isResponse: boolean;
  /**
   * The session this line belongs to, read from `params.sessionId`.
   *
   * Every `session/update` carries it 【实测】, and dropping it was audit F4: chunks from another
   * session (or from a turn already abandoned) were appended to whatever the UI currently shows.
   * The router needs it; the events themselves stay session-blind so the view cannot sprout an
   * engine shape the contract does not declare.
   */
  readonly sessionId: string | undefined;
}

interface JsonRpcLike {
  readonly id?: number | string;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface UpdateLike {
  readonly sessionUpdate?: string;
  readonly messageId?: string;
  readonly content?: { readonly type?: string; readonly text?: string } | null;
  readonly toolCallId?: string;
  readonly title?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly configOptions?: readonly RawOptionLike[] | null;
}

interface RawOptionLike {
  readonly id?: string;
  readonly name?: string;
  readonly category?: string;
  readonly currentValue?: unknown;
  readonly options?: readonly { readonly value?: string; readonly name?: string }[] | null;
}

const source = (variant?: string): EventSource => ({ method: "session/update", variant });

const mapOptions = (raw: readonly RawOptionLike[] | null | undefined): readonly ConfigOption[] =>
  (raw ?? []).map((option) => ({
    id: option.id ?? "(unnamed)",
    name: option.name ?? option.id ?? "(unnamed)",
    category: option.category ?? "other",
    currentValue: String(option.currentValue ?? ""),
    choices: (option.options ?? []).map((choice) => ({ value: choice.value ?? "", name: choice.name ?? choice.value ?? "" })),
  }));

/** The `sessionUpdate` variants this adapter maps to real events. */
export const MAPPED_VARIANTS: readonly string[] = [
  "agent_message_chunk",
  "user_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "config_option_update",
];

/**
 * Variants that are *known and deliberately not mapped*, with the reason. They are counted so
 * the coverage test can tell "we decided this" apart from "a new kind appeared" — a new kind
 * must fail the test and force a decision (rules §五.23).
 */
export const COUNTED_VARIANTS: readonly { readonly variant: string; readonly why: string }[] = [
  { variant: "available_commands_update", why: "the runtime's own slash commands/skills; not a T3rra concept (rule 5)" },
  { variant: "usage_update", why: "reports context-window fill; a per-turn total is a different quantity, so neither is shown (no invented numbers)" },
];

const translateUpdate = (update: UpdateLike): AgentEvent => {
  const variant = update.sessionUpdate ?? "(none)";
  switch (variant) {
    case "agent_message_chunk":
    case "user_message_chunk":
      return { kind: "message.appended", from: source(variant), role: variant === "user_message_chunk" ? "user" : "agent", messageId: update.messageId ?? "", text: update.content?.text ?? "" };
    case "agent_thought_chunk":
      return { kind: "thought.appended", from: source(variant), messageId: update.messageId ?? "", text: update.content?.text ?? "" };
    case "tool_call":
      return { kind: "tool.started", from: source(variant), toolCallId: update.toolCallId ?? "", title: update.title ?? "", hint: update.kind ?? "" };
    case "tool_call_update":
      return { kind: "tool.updated", from: source(variant), toolCallId: update.toolCallId ?? "", status: update.status ?? "" };
    case "config_option_update":
      return { kind: "options.updated", from: source(variant), options: mapOptions(update.configOptions) };
    default:
      // Either a variant we decided not to map (COUNTED_VARIANTS, each with its reason) or one
      // nobody has seen before — the coverage test is what keeps those two apart.
      return { kind: "message.unmapped", from: source(variant) };
  }
};

/** `params.sessionId`, present on every `session/update` and on `session/request_permission`. */
const sessionIdOf = (message: JsonRpcLike): string | undefined => {
  const value = (message.params as { sessionId?: unknown } | undefined)?.sessionId;
  return typeof value === "string" && value !== "" ? value : undefined;
};

export const translateLine = (line: string): TranslationResult => {
  let message: JsonRpcLike;
  try {
    message = JSON.parse(line) as JsonRpcLike;
  } catch {
    return { events: [{ kind: "message.unmapped", from: { method: "unparsed", variant: undefined } }], isResponse: false, sessionId: undefined };
  }

  if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
    const stopReason = (message.result as { stopReason?: string } | null)?.stopReason;
    const events: AgentEvent[] = stopReason === undefined ? [] : [{ kind: "prompt.ended", from: { method: "session/prompt.response", variant: undefined }, stopReason }];
    return { events, isResponse: true, sessionId: undefined };
  }

  if (message.method === "session/update") {
    const update = (message.params as { update?: UpdateLike } | undefined)?.update;
    if (update === undefined) return { events: [{ kind: "message.unmapped", from: source("(no update payload)") }], isResponse: false, sessionId: sessionIdOf(message) };
    return { events: [translateUpdate(update)], isResponse: false, sessionId: sessionIdOf(message) };
  }

  if (message.method === "session/request_permission") {
    const params = message.params as {
      toolCall?: { title?: string; kind?: string };
      options?: readonly { optionId?: unknown; kind?: unknown; name?: unknown }[];
    } | undefined;
    const summary = [params?.toolCall?.kind, params?.toolCall?.title].filter((part) => typeof part === "string" && part !== "").join(" · ");
    const options: PermissionOption[] = (params?.options ?? []).map((raw) => ({
      optionId: String(raw.optionId ?? ""),
      kind: String(raw.kind ?? ""),
      name: String(raw.name ?? raw.optionId ?? ""),
    })).filter((option) => option.optionId !== "");
    return {
      events: [
        {
          kind: "permission.requested",
          from: { method: "session/request_permission", variant: undefined },
          requestId: String(message.id ?? ""),
          summary,
          options,
        },
      ],
      isResponse: false,
      sessionId: sessionIdOf(message),
    };
  }

  return { events: [{ kind: "message.unmapped", from: { method: message.method ?? "(unknown)", variant: undefined } }], isResponse: false, sessionId: sessionIdOf(message) };
};