/**
 * Engine resolution.
 *
 * Constraints from the owner's ruling (2026-09-23): the order is PATH → known install
 * locations → explicit override, paths are joined portably (no hand-written backslashes),
 * and **no host path is baked in** — everything comes from the environment handed to us.
 *
 * The engine is a deliberate choice, not something a stray PATH entry can flip: opencode is
 * preferred only when asked, and one explicit override short-circuits the search entirely.
 */

import { join } from "node:path";

export interface EngineResolution {
  /** Ordered candidates; the first one that answers `--version` wins. */
  readonly candidates: readonly string[];
  readonly reason: "explicit-bin" | "env-preference" | "default-order";
}

export interface EngineEnv {
  readonly T3RRA_ENGINE_BIN?: string | undefined;
  readonly T3RRA_OMP_BIN?: string | undefined;
  readonly T3RRA_ENGINE?: string | undefined;
  readonly APPDATA?: string | undefined;
  readonly HOME?: string | undefined;
}

const opencodeCandidates = (env: EngineEnv): readonly string[] => [
  "opencode",
  ...(env.APPDATA === undefined ? [] : [join(env.APPDATA, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe")]),
  ...(env.HOME === undefined ? [] : [join(env.HOME, ".local", "bin", "opencode")]),
];

const ompCandidates = (env: EngineEnv): readonly string[] => [
  "omp",
  ...(env.HOME === undefined ? [] : [join(env.HOME, ".bun", "bin", "omp.exe"), join(env.HOME, ".bun", "bin", "omp")]),
];

export const resolveEngineCandidates = (env: EngineEnv): EngineResolution => {
  const explicit = env.T3RRA_ENGINE_BIN ?? env.T3RRA_OMP_BIN;
  if (explicit !== undefined && explicit !== "") return { candidates: [explicit], reason: "explicit-bin" };

  const opencode = opencodeCandidates(env);
  const omp = ompCandidates(env);
  return env.T3RRA_ENGINE === "opencode"
    ? { candidates: [...opencode, ...omp], reason: "env-preference" }
    : { candidates: [...omp, ...opencode], reason: "default-order" };
};