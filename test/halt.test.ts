import { describe, expect, it } from "vitest";
import { abortSession, abortSessionPath } from "../app/src/engine/engine-http.ts";
import type { HttpChannel } from "../app/src/engine/engine-http.ts";

describe("abort path (HALT)", () => {
  it("builds POST /session/{id}/abort without inventing query junk", () => {
    expect(abortSessionPath("ses_aaa111")).toBe("/session/ses_aaa111/abort");
    expect(abortSessionPath("ses/weird")).toBe("/session/ses%2Fweird/abort");
  });

  it("sends POST with no body through the given channel", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const channel: HttpChannel = async (method, path, body) => {
      calls.push({ method, path, body });
      return { status: 200, text: "true" };
    };
    const result = await abortSession(channel, "ses_aaa111");
    expect(calls).toEqual([{ method: "POST", path: "/session/ses_aaa111/abort", body: undefined }]);
    expect(result.status).toBe(200);
    expect(result.text).toBe("true");
  });
});
