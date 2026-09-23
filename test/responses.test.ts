import { describe, expect, it } from "vitest";
import { mapResponse, optionsEventOf } from "../app/src/engine/responses.ts";
import { reduceAll } from "../app/src/view/derive.ts";

/** The real payload shape, taken from a live session (traces/opencode). */
const liveOptions = [
  {
    id: "mode",
    name: "Session Mode",
    category: "mode",
    currentValue: "build",
    options: [
      { value: "build", name: "build" },
      { value: "plan", name: "plan" },
    ],
  },
];

describe("response mapping", () => {
  it("applies the option list a set_config_option answer carries (the mode-chip bug)", () => {
    const mapping = mapResponse("session/set_config_option", { configOptions: [{ ...liveOptions[0], currentValue: "plan" }] });
    const view = reduceAll(mapping.events);
    expect(view.options.find((option) => option.id === "mode")?.currentValue).toBe("plan");
  });

  it("reads the session id and the option menu off session/new", () => {
    const mapping = mapResponse("session/new", { sessionId: "ses_abc", configOptions: liveOptions });
    expect(mapping.sessionId).toBe("ses_abc");
    const view = reduceAll(mapping.events);
    expect(view.sessionId).toBe("ses_abc");
    expect(view.options).toHaveLength(1);
  });

  it("takes the engine's own name off initialize and nothing else", () => {
    const mapping = mapResponse("initialize", { agentInfo: { name: "OpenCode", version: "1.18.32" }, authMethods: [] });
    expect(mapping.agentName).toBe("OpenCode 1.18.32");
    expect(mapping.events).toEqual([]);
  });

  it("ends a turn on the prompt response, and never maps usage into a number", () => {
    const mapping = mapResponse("session/prompt", { stopReason: "end_turn", usage: { totalTokens: 10344 } });
    expect(mapping.events).toEqual([
      { kind: "prompt.ended", from: { method: "session/prompt.response", variant: undefined }, stopReason: "end_turn" },
    ]);
  });

  it("produces nothing for an unknown response instead of guessing at one", () => {
    const mapping = mapResponse("session/somethingNew", { whatever: 1 });
    expect(mapping.recognised).toBe(false);
    expect(mapping.events).toEqual([]);
  });

  it("still reports an option update it cannot parse as unmapped, not as a change", () => {
    const event = optionsEventOf([{ id: "effort" }]);
    expect(event.kind).toBe("options.updated");
    const view = reduceAll([event]);
    expect(view.options[0]?.currentValue).toBe("");
  });
});