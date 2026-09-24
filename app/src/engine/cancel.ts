/**
 * The cancel line for the engine's ACP stdio face.
 *
 * Kept as a pure builder so the one property that matters can be tested: a JSON-RPC
 * **notification** has no `id`. With an `id` it becomes a request, `session/cancel` is not
 * registered on the request branch, and the engine answers `-32601` — which is exactly how an
 * earlier probe concluded the engine cannot be interrupted and this app grew a second HTTP
 * route to work around a capability that was there all along
 * (docs/engine-contract-audit.md F1; measured in
 * traces/opencode/opencode-acp-2026-09-24T10-34-39-594Z-cancel-notification.jsonl).
 */

export const cancelNotificationLine = (sessionId: string): string =>
  `${JSON.stringify({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId } })}\n`;
