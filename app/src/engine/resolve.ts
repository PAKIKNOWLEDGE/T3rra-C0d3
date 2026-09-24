/**
 * Engine resolution.
 *
 * Order: explicit override short-circuits; otherwise **opencode first** (owner ruling
 * 2026-09-23 — the product engine is opencode; omp stays only as a fallback candidate).
 * Paths are joined portably; no host path is baked in.
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
  if (env.T3RRA_ENGINE === "omp") return { candidates: [...omp, ...opencode], reason: "env-preference" };
  if (env.T3RRA_ENGINE === "opencode") return { candidates: [...opencode, ...omp], reason: "env-preference" };
  return { candidates: [...opencode, ...omp], reason: "default-order" };
};
