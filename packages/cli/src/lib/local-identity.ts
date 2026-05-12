/**
 * Imperative shell wrapper for the post-merge PR-creator auto-update feature.
 *
 * Collects local GitHub identity signals from three best-effort sources:
 *   - `gh api user --jq .login` (when `gh` is installed AND authenticated)
 *   - `process.env.GITHUB_USER` / `GH_USER`
 *   - `git config user.email`
 *
 * Every call is wrapped in try/catch so a missing binary, network failure,
 * or unauthenticated gh CLI never throws — the function always returns a
 * shape the pure helper can consume. If no signal is available the helper
 * downstream will return `false` and the updater falls back to the normal
 * (non-forced) path.
 *
 * Pure logic lives in `@teamagent/core::isLocalUserPrCreator`. This file is
 * the IO seam — kept tiny so the surface to mock in tests is the helper, not
 * the shell wrapper. `runUpdater` accepts `gatherIdentity` as an injectable
 * dependency for the same reason.
 */
import { spawnSync } from "node:child_process";

export interface LocalIdentity {
  /** Output of `gh api user --jq .login`, trimmed. Empty string when not available. */
  ghLogin: string;
  /** `git config user.email`, trimmed. Empty when not configured. */
  gitEmail: string;
  /** Process env shallow copy (read-only inside helper). */
  env: Record<string, string | undefined>;
}

const SPAWN_TIMEOUT_MS = 3_000;

function safeSpawn(command: string, args: string[]): string {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf-8",
      timeout: SPAWN_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
      // shell:true is intentionally OFF — args are literal, no shell parsing.
    });
    if (result.error) return "";
    if (typeof result.status !== "number" || result.status !== 0) return "";
    return (result.stdout ?? "").trim();
  } catch {
    return "";
  }
}

export function gatherLocalIdentity(): LocalIdentity {
  return {
    ghLogin: safeSpawn("gh", ["api", "user", "--jq", ".login"]),
    gitEmail: safeSpawn("git", ["config", "--get", "user.email"]),
    env: { ...process.env },
  };
}
