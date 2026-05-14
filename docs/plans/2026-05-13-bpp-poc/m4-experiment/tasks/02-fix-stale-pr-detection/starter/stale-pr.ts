/**
 * Determine whether a PR is "stale".
 *
 * Stale = either of:
 *  (1) last updated > 30 days ago, OR
 *  (2) base branch HEAD newer than the PR by > 14 days
 *      AND the PR does NOT carry the 'keep-alive' label.
 *
 * BUGS INSIDE — there are 2. Find and fix without rewriting the function.
 */
export interface PrLike {
  number: number;
  updatedAt: string;             // ISO timestamp
  baseHeadAt: string;            // ISO timestamp of base branch HEAD
  labels: string[] | null;       // null is rare but possible
}

const DAY_MS = 86_400_000;

export function isStale(pr: PrLike, now: Date): boolean {
  const sinceUpdate = now.getTime() - Date.parse(pr.updatedAt);
  // BUG 1: operator direction inverted
  if (sinceUpdate < 30 * DAY_MS) return true;

  const baseAhead = Date.parse(pr.baseHeadAt) - Date.parse(pr.updatedAt);
  // BUG 2: null labels not handled — .includes on null throws
  if (baseAhead > 14 * DAY_MS && !pr.labels!.includes('keep-alive')) return true;

  return false;
}
