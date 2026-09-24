/**
 * HTTP paths for the engine's REST face. This module knows endpoint shapes (owned by `app/`);
 * the bridge only forwards method + path + body as bytes (rule 4 — shell does not learn
 * event vocabulary, but a path string is not an event kind).
 *
 * Sources: traces/opencode/openapi-1.17.18.json — `DELETE /session/{sessionID}` 【实测文档导出】;
 * `POST /session/{sessionID}/abort` 【实测】via spike/probe-halt-in-process.mjs —
 * the ACP child serves this API on its own `--port`, and only there does an abort stop the
 * turn (cross-process abort on a separate `opencode serve` returns `true` but is a no-op;
 * traces/opencode/*-abort-probe.jsonl and *-halt-in-process.jsonl).
 */

export interface HttpResult {
  readonly status: number;
  readonly text: string;
}

export type HttpChannel = (method: string, path: string, body?: unknown) => Promise<HttpResult>;

/** Delete one session on the HTTP face. sessionId must match `^ses` (OpenAPI pattern). */
export const deleteSessionPath = (sessionId: string): string => `/session/${encodeURIComponent(sessionId)}`;

export const deleteSession = async (channel: HttpChannel, sessionId: string): Promise<HttpResult> =>
  channel("DELETE", deleteSessionPath(sessionId));

/** Abort the running turn. sessionId must match `^ses` (OpenAPI pattern). */
export const abortSessionPath = (sessionId: string): string => `/session/${encodeURIComponent(sessionId)}/abort`;

export const abortSession = async (channel: HttpChannel, sessionId: string): Promise<HttpResult> =>
  channel("POST", abortSessionPath(sessionId));
