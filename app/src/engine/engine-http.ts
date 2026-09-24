/**
 * HTTP paths for the engine's REST face. This module knows endpoint shapes (owned by `app/`);
 * the bridge only forwards method + path + body as bytes (rule 4 — shell does not learn
 * event vocabulary, but a path string is not an event kind).
 *
 * Sources: traces/opencode/openapi-1.17.18.json — `DELETE /session/{sessionID}` 【实测文档导出】.
 *
 * `POST /session/{id}/abort` is deliberately **not** here any more. It used to back HALT, which
 * forced the bridge to spawn the ACP child on a known port and split traffic by path shape —
 * because an earlier probe wrongly concluded ACP has no interrupt (it sent `session/cancel` as
 * a request). HALT now goes out as a stdio `session/cancel` notification instead
 * (docs/engine-contract-audit.md F1, measured in
 * traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl).
 * Keeping abort would also keep a known false-success channel: it answers `true` unconditionally
 * and does not check that the session exists (F2, measured in
 * traces/opencode/opencode-acp-2026-09-24T04-37-51-820Z-bridge-route.jsonl).
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
