// Coordinator-only fixed reference. Two fixes from starter:
//   1. operator direction on sinceUpdate comparison
//   2. null-safe label check
export interface PrLike {
  number: number;
  updatedAt: string;
  baseHeadAt: string;
  labels: string[] | null;
}
const DAY_MS = 86_400_000;
export function isStale(pr: PrLike, now: Date): boolean {
  const sinceUpdate = now.getTime() - Date.parse(pr.updatedAt);
  if (sinceUpdate > 30 * DAY_MS) return true;        // fix 1
  const baseAhead = Date.parse(pr.baseHeadAt) - Date.parse(pr.updatedAt);
  const labels = pr.labels ?? [];                     // fix 2
  if (baseAhead > 14 * DAY_MS && !labels.includes('keep-alive')) return true;
  return false;
}
