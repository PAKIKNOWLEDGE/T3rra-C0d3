/**
 * Engine resolution — the only decision the rewrite has already made: the runtime is
 * `opencode`, spoken over ACP (`opencode acp`), and it is a *deliberate* choice rather
 * than something a stray PATH entry can flip.
 *
 * Evidence for the engine choice lives in docs/adapters/opencode-acp.md (local实测) and
 * the captured traces in traces/opencode/. This module is pure: no fs, no process, so the
 * ordering rules can be tested without touching the machine.
 */

export interface EngineResolution {
  /** Ordered candidates; the first one that answers `--version` is the engine. */
  readonly candidates: readonly string[];
  /** Where the order came from, for the record (`status.md` is not a debug log). */
  readonly reason: "explicit-bin" | "env-preference" | "default-order";
}

export interface EngineEnv {
  /** Absolute path override; wins over everything. */
  readonly T3RRA_ENGINE_BIN?: string | undefined;
  /** Legacy override kept working so old runs do not silently change engine. */
  readonly T3RRA_OMP_BIN?: string | undefined;
  /** `opencode` prefers the opencode candidates; anything else keeps the default order. */
  readonly T3RRA_ENGINE?: string | undefined;
  /** Windows resolves npm's shim to a real `.exe` — pass the base dir in, keep this pure. */
  readonly APPDATA?: string | undefined;
  /** Non-Windows fallback for the npm global bin directory. */
  readonly HOME?: string | undefined;
}

const opencodeCandidates = (env: EngineEnv): readonly string[] => {
  const roaming = env.APPDATA;
  const home = env.HOME;
  return [
    "opencode",
    ...(roaming !== undefined ? [`${roaming}\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe`] : []),
    ...(home !== undefined ? [`${home}/.local/bin/opencode`] : []),
  ];
};

const ompCandidates = (env: EngineEnv): readonly string[] => {
  const home = env.HOME;
  return [
    "omp",
    ...(home !== undefined ? [`${home}/.bun/bin/omp.exe`, `${home}/.bun/bin/omp`] : []),
  ];
};

export const resolveEngineCandidates = (env: EngineEnv): EngineResolution => {
  const explicit = env.T3RRA_ENGINE_BIN ?? env.T3RRA_OMP_BIN;
  if (explicit !== undefined && explicit !== "") {
    return { candidates: [explicit], reason: "explicit-bin" };
  }
  const opencode = opencodeCandidates(env);
  const omp = ompCandidates(env);
  return env.T3RRA_ENGINE === "opencode"
    ? { candidates: [...opencode, ...omp], reason: "env-preference" }
    : { candidates: [...omp, ...opencode], reason: "default-order" };
};