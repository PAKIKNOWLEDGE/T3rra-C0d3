/**
 * Pure decisions used by the assembly root (`main.ts`).
 *
 * Keeping these small seams outside the boot side effects lets tests prove the three wiring
 * decisions that used to exist only as branches in the browser assembly:
 * list failures preserve the last known rows, cross-session updates are dropped, and a dead
 * byte channel produces one consistent visible fact patch.
 */

export interface SessionRouteDecision {
  readonly accept: boolean;
  readonly lastError?: string;
  readonly phaseNote?: string;
}

export const routeSessionUpdate = (incomingSessionId: string | undefined, currentSessionId: string | undefined): SessionRouteDecision => {
  if (incomingSessionId === undefined || currentSessionId === undefined || incomingSessionId === currentSessionId) return { accept: true };
  return {
    accept: false,
    lastError: `dropped update for session ${incomingSessionId.slice(0, 12)}… (showing ${currentSessionId.slice(0, 12)}…)`,
    phaseNote: "丢弃了一条别的会话的更新",
  };
};

export const sessionListFailureFacts = (reason: string): { readonly phaseNote: string } => ({
  phaseNote: `会话列表取不到 · ${reason.slice(0, 60)}`,
});

/**
 * A project-config read is asynchronous and may outlive a policy switch or cwd change.
 * Only the newest read for the same active directory may update the selector.
 */
export const shouldApplyPermissionSync = (
  requestRevision: number,
  currentRevision: number,
  requestedCwd: string,
  currentCwd: string | undefined,
): boolean => requestRevision === currentRevision && requestedCwd === currentCwd;

/** A refresh can restore the running boundary only with all three persisted facts. */
export const canRecoverRunningTurn = (
  busy: boolean,
  sessionId: string | undefined,
  promptId: number | undefined,
): boolean => busy && sessionId !== undefined && sessionId !== "" && promptId !== undefined && Number.isInteger(promptId);

export const linkDownFacts = (reason: string): { readonly busy: false; readonly phase: "链路断开"; readonly phaseNote: string; readonly lastError: string } => ({
  busy: false,
  phase: "链路断开",
  phaseNote: `通道 ${reason} · 按右下「重启」`,
  lastError: `byte channel down: ${reason}`,
});
