/**
 * Exponential backoff schedule for the uploader retry loop.
 *
 * Per plan §1.4: 30s → 60s → 120s → ... → 24h cap. After 10 cumulative
 * failures the entry is moved to dead-letter.
 */

export const BASE_BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24h
export const MAX_FAILURES_BEFORE_DEAD_LETTER = 10;

/**
 * Compute the next retry delay (ms) given the failure count.
 * `failures` is 1-based: the FIRST failure returns 30s, the second 60s, etc.
 */
export function backoffMs(failures: number): number {
  if (failures < 1) return 0;
  const exp = Math.min(failures - 1, 30); // guard against >2^30 overflow
  const ms = BASE_BACKOFF_MS * Math.pow(2, exp);
  return Math.min(ms, MAX_BACKOFF_MS);
}

/** True iff the entry should be moved to dead-letter. */
export function shouldDeadLetter(failures: number): boolean {
  return failures >= MAX_FAILURES_BEFORE_DEAD_LETTER;
}
