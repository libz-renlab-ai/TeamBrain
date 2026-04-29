import type { UpdateState } from "./update-state.js";

export interface ShouldCheckInput {
  now: number;
  state: UpdateState;
  env: Record<string, string | undefined>;
  disabledMarkerExists: boolean;
}

const FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1000;
const FAILURE_THRESHOLD = 3;

export function shouldCheckUpdate(input: ShouldCheckInput): boolean {
  if (input.env.TEAMAGENT_AUTO_UPDATE === "0") return false;
  if (input.disabledMarkerExists) return false;

  const { state, now } = input;
  if (
    state.consecutive_install_failures >= FAILURE_THRESHOLD &&
    now - state.last_check_ts < FAILURE_BACKOFF_MS
  ) {
    return false;
  }

  const intervalMs = (state.interval_hours || 1) * 60 * 60 * 1000;
  return now - state.last_check_ts >= intervalMs;
}
