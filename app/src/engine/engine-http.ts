/**
 * HTTP paths for the engine's REST face. This module knows endpoint shapes (owned by `app/`);
 * the bridge only forwards method + path + body as bytes (rule 4 — shell does not learn
 * event vocabulary, but a path string is not an event kind).
 *
 * Sources: traces/opencode/openapi-1.17.18.json — `DELETE /session/{sessionID}` 【实测文档导出】.
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
