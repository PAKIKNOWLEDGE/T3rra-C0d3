import { describe, expect, it } from "vitest";
import { mapResponse, mapSessionList } from "../app/src/engine/responses.ts";
import { reduceAll } from "../app/src/view/derive.ts";
import { deleteSessionPath } from "../app/src/engine/engine-http.ts";

const sampleList = {
  sessions: [
    { sessionId: "ses_aaa111", title: "first", updatedAt: "2026-09-23T10:00:00.000Z", cwd: "C:\\w" },
    { sessionId: "ses_bbb222", title: "", updatedAt: "2026-09-22T09:00:00.000Z", cwd: "" },
    { id: "ses_ccc333", title: "via-id", updatedAt: 1727070000000 },
    { sessionId: "", title: "no id — drop" },
  ],
};

describe("session list mapping", () => {
  it("keeps only rows that carry a session id and the four reported fields", () => {
    const rows = mapSessionList(sampleList);
    expect(rows.map((row) => row.sessionId)).toEqual(["ses_aaa111", "ses_bbb222", "ses_ccc333"]);
    expect(rows[0]).toEqual({
      sessionId: "ses_aaa111",
      title: "first",
      updatedAt: "2026-09-23T10:00:00.000Z",
      cwd: "C:\\w",
    });
    // updatedAt number is stringified, not turned into a fake date format
    expect(rows[2]?.updatedAt).toBe("1727070000000");
    // no message-count field is invented
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["cwd", "sessionId", "title", "updatedAt"]);
  });

  it("maps session/list response into sessions.updated on the view", () => {
    const mapping = mapResponse("session/list", sampleList);
    expect(mapping.recognised).toBe(true);
    const view = reduceAll(mapping.events);
    expect(view.sessions).toHaveLength(3);
    expect(view.from.session).toEqual(expect.arrayContaining(["sessions.updated", "sessions.removed"]));
  });

  it("emits sessions.removed only for the id that was deleted", () => {
    const view = reduceAll([
      ...mapResponse("session/list", sampleList).events,
      { kind: "sessions.removed", from: { method: "http.delete.response", variant: undefined }, sessionId: "ses_aaa111" },
    ]);
    expect(view.sessions.map((row) => row.sessionId)).toEqual(["ses_bbb222", "ses_ccc333"]);
  });
});

describe("delete path", () => {
  it("builds DELETE /session/{id} without inventing query junk", () => {
    expect(deleteSessionPath("ses_aaa111")).toBe("/session/ses_aaa111");
  });
});
