/**
 * Soft-force upgrade snooze state machine (issue #225).
 *
 * Pure functions: caller injects `now` and `env`. No IO, no Date.now() —
 * tests pump time directly.
 *
 * Backoff schedule (mirrors gstack):
 *   level 0 → 1: silence next 24h
 *   level 1 → 2: silence next 48h
 *   level 2 → 3+: silence next 7d (cap)
 *
 * `never_prompt: true` is permanent — only cleared by `teamagent update --enable`
 * or by the user editing `~/.teamagent/update-state.json` by hand.
 *
 * `TEAMAGENT_NEVER_PROMPT=1` env var is a runtime-only override (no state
 * change). Useful for CI / dogfood probes that don't want banners but also
 * don't want to mutate persistent state.
 */

import type { UpdateState } from "./update-state.js";

export const SNOOZE_DURATIONS_MS: ReadonlyArray<number> = [
  24 * 60 * 60 * 1000, // level 0 → 1: 24h
  48 * 60 * 60 * 1000, // level 1 → 2: 48h
  7 * 24 * 60 * 60 * 1000, // level 2 → 3+: 7d (cap)
] as const;

export interface SnoozeResult {
  /** New snooze level after the user said "later". */
  snooze_level: number;
  /** Epoch ms — banner stays silent until this point. */
  snooze_until_ts: number;
}

/**
 * Advance the snooze state machine by one tick.
 *
 * @param currentLevel `state.snooze_level` BEFORE the user said "later".
 *                     Negative values clamp to 0; values > 2 cap at 7d.
 * @param now Epoch ms; injected so tests can pump time deterministically.
 */
export function nextSnooze(currentLevel: number, now: number): SnoozeResult {
  const safeLevel = Math.max(0, Math.floor(currentLevel));
  const idx = Math.min(safeLevel, SNOOZE_DURATIONS_MS.length - 1);
  const duration = SNOOZE_DURATIONS_MS[idx]!;
  return {
    snooze_level: safeLevel + 1,
    snooze_until_ts: now + duration,
  };
}

export interface ShouldPromptInput {
  state: UpdateState;
  now: number;
  env: Record<string, string | undefined>;
  /** Optional: latest known remote version. Empty string = no upgrade pending. */
  pendingToVersion?: string;
}

/**
 * Decide whether to surface the upgrade prompt this SessionStart.
 *
 * Returns true when:
 *   - state has a `pending_banner` not yet shown OR pendingToVersion provided
 *   - never_prompt is false
 *   - TEAMAGENT_NEVER_PROMPT env var is not "1"
 *   - now >= snooze_until_ts (snooze window has elapsed)
 *
 * Independent of `shouldCheckUpdate` — that gates whether we POLL the remote;
 * this gates whether we SHOW the result to the user.
 */
export function shouldPromptUpgrade(input: ShouldPromptInput): boolean {
  const { state, now, env, pendingToVersion } = input;
  if (env["TEAMAGENT_NEVER_PROMPT"] === "1") return false;
  if (state.never_prompt) return false;

  // No upgrade to show: skip.
  const haveBanner =
    state.pending_banner !== null && state.pending_banner.shown === false;
  const haveExplicitPending =
    typeof pendingToVersion === "string" && pendingToVersion.length > 0;
  if (!haveBanner && !haveExplicitPending) return false;

  // Snooze window still active.
  if (state.snooze_until_ts > 0 && now < state.snooze_until_ts) return false;

  return true;
}
