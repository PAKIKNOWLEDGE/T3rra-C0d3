/**
 * ACP → event translation. Pure: a line in, events out. No I/O, no clock, no globals.
 *
 * The mapping follows docs/adapters/opencode-acp.md, which was written from captured traces
 * (`traces/opencode/*.jsonl`) rather than from documentation. Three decisions worth naming:
 *
 *  - **A message we do not recognise is counted, not guessed.** It becomes `message.unmapped`;
 *    it never becomes a notice, and it never crashes the reducer.
 *  - **No number is invented.** `usage_update` carries context-window fill; a per-turn total is
 *    a different quantity. Only the reported context reading is mapped.
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
  readonly content?: unknown;
  readonly toolCallId?: string;
  readonly title?: string;
  readonly kind?: string;
  readonly status?: string;
  readonly locations?: unknown;
  readonly rawInput?: unknown;
  readonly rawOutput?: unknown;
  readonly configOptions?: readonly RawOptionLike[] | null;
  readonly used?: unknown;
  readonly size?: unknown;
  readonly cost?: { readonly amount?: unknown; readonly currency?: unknown } | null;
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

const textFromContent = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value.map(textFromContent).filter((item): item is string => item !== undefined).join("");
    return text === "" ? undefined : text;
  }
  if (value !== null && typeof value === "object") {
    const record = value as { readonly text?: unknown; readonly content?: unknown };
    if (typeof record.text === "string") return record.text;
    return textFromContent(record.content);
  }
  return undefined;
};

const jsonText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) return undefined;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
};

const locationsFrom = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item !== null && typeof item === "object" ? (item as { readonly path?: unknown }).path : undefined))
    .filter((path): path is string => typeof path === "string" && path !== "");
};

const toolDetailsOf = (update: UpdateLike): { readonly locations: readonly string[]; readonly input: string | undefined; readonly output: string | undefined; readonly error: string | undefined } => {
  const rawOutput = update.rawOutput !== null && typeof update.rawOutput === "object" ? (update.rawOutput as { readonly output?: unknown; readonly error?: unknown }) : undefined;
  const contentText = textFromContent(update.content);
  const status = update.status ?? "";
  const failed = /fail|error|reject|cancel/i.test(status);
  return {
    locations: locationsFrom(update.locations),
    input: jsonText(update.rawInput),
    output: failed ? undefined : jsonText(rawOutput?.output) ?? contentText,
    error: failed ? jsonText(rawOutput?.error) ?? contentText : undefined,
  };
};

/** The `sessionUpdate` variants this adapter maps to real events. */
export const MAPPED_VARIANTS: readonly string[] = [
  "agent_message_chunk",
  "user_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "config_option_update",
  "usage_update",
];

/**
 * Variants that are *known and deliberately not mapped*, with the reason. They are counted so
 * the coverage test can tell "we decided this" apart from "a new kind appeared" — a new kind
 * must fail the test and force a decision (rules §五.23).
 */
export const COUNTED_VARIANTS: readonly { readonly variant: string; readonly why: string }[] = [
  { variant: "available_commands_update", why: "the runtime's own slash commands/skills; not a T3rra concept (rule 5)" },
];

const usageEventOf = (update: UpdateLike): AgentEvent | undefined => {
  if (typeof update.used !== "number" || !Number.isFinite(update.used) || update.used < 0) return undefined;
  if (typeof update.size !== "number" || !Number.isFinite(update.size) || update.size <= 0) return undefined;
  const costAmount = typeof update.cost?.amount === "number" && Number.isFinite(update.cost.amount) ? update.cost.amount : undefined;
  const costCurrency = typeof update.cost?.currency === "string" && update.cost.currency !== "" ? update.cost.currency : undefined;
  return {
    kind: "usage.updated",
    from: source("usage_update"),
    usage: { used: update.used, size: update.size, ...(costAmount === undefined ? {} : { costAmount }), ...(costCurrency === undefined ? {} : { costCurrency }) },
  };
};

const translateUpdate = (update: UpdateLike): AgentEvent => {
  const variant = update.sessionUpdate ?? "(none)";
  switch (variant) {
    case "agent_message_chunk":
    case "user_message_chunk":
      return { kind: "message.appended", from: source(variant), role: variant === "user_message_chunk" ? "user" : "agent", messageId: update.messageId ?? "", text: textFromContent(update.content) ?? "" };
    case "agent_thought_chunk":
      return { kind: "thought.appended", from: source(variant), messageId: update.messageId ?? "", text: textFromContent(update.content) ?? "" };
    case "tool_call":
      return { kind: "tool.started", from: source(variant), toolCallId: update.toolCallId ?? "", title: update.title ?? "", hint: update.kind ?? "", status: update.status ?? "", details: toolDetailsOf(update) };
    case "tool_call_update":
      return {
        kind: "tool.updated",
        from: source(variant),
        toolCallId: update.toolCallId ?? "",
        status: update.status ?? "",
        ...(update.title === undefined ? {} : { title: update.title }),
        ...(update.kind === undefined ? {} : { hint: update.kind }),
        details: toolDetailsOf(update),
      };
    case "config_option_update":
      return { kind: "options.updated", from: source(variant), options: mapOptions(update.configOptions) };
    case "usage_update":
      return usageEventOf(update) ?? { kind: "message.unmapped", from: source(variant) };
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
