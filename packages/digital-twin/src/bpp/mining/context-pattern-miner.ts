// BPP mining — context-pattern-miner.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §3.2
// (row "context-mgmt (默会肌肉记忆)") + §3.5 (mining_evidence is LLM-uncheatable counts).
// Plan: docs/superpowers/plans/2026-05-13-bpp.md Task P2.4.
//
// Detects meta-patterns from session summaries + per-day git commit counts:
//   - "atomic commit habit": user's median commits/day ≥ ATOMIC_COMMIT_MIN_MEDIAN
//   - "checkpoint cadence":  ≥ CHECKPOINT_MIN_SESSIONS sessions in which a
//                            "checkpoint" action appears
// Each match becomes one CandidateBp of type=context-mgmt.

import type { CandidateBp, GitActivity, SessionSummary } from './mining-types.js';

export const EXTRACTION_METHOD = 'context-pattern-miner@v1';

/** Median commits/day ≥ this counts as "atomic commit habit". */
export const ATOMIC_COMMIT_MIN_MEDIAN = 5;

/** Number of sessions in which "checkpoint" must appear before we flag a habit. */
export const CHECKPOINT_MIN_SESSIONS = 3;

/** Marker action labels recognised as "context checkpoints" in a session. */
const CHECKPOINT_ACTIONS: ReadonlySet<string> = new Set([
  'checkpoint',
  'context_save',
  'compact',
]);

export interface ContextPatternMinerInput {
  session_summaries: SessionSummary[];
  git_log: GitActivity[];
}

/**
 * Build CandidateBp[] (type=context-mgmt) from session + git activity.
 *
 * mining_evidence semantics:
 *   - atomic-commit:
 *       sessions_observed = #days with any commit
 *       pattern_count     = #days at or above the median threshold
 *   - checkpoint cadence:
 *       sessions_observed = total #sessions for the user
 *       pattern_count     = #sessions containing a checkpoint action
 */
export function mineContextPatternCandidates(
  input: ContextPatternMinerInput,
): CandidateBp[] {
  const { session_summaries, git_log } = input;
  const out: CandidateBp[] = [];

  // ---- atomic commit habit (from git_log) ----
  const sortedGit = [...git_log].sort((a, b) => a.user_id.localeCompare(b.user_id));
  for (const g of sortedGit) {
    if (g.commit_count_per_day.length === 0) continue;
    const nonZeroDays = g.commit_count_per_day.filter((c) => c > 0);
    if (nonZeroDays.length === 0) continue;
    const med = median(nonZeroDays);
    const atOrAbove = nonZeroDays.filter((c) => c >= ATOMIC_COMMIT_MIN_MEDIAN).length;
    if (med < ATOMIC_COMMIT_MIN_MEDIAN) continue;
    out.push({
      id: `bp-ctx-${g.user_id}-atomic-commit`,
      type: 'context-mgmt',
      title: 'Atomic commit habit',
      body: `Median ${med} commits/day across ${nonZeroDays.length} active days.`,
      example: `commit_count_per_day median=${med}`,
      pushed_by: g.user_id,
      pushed_by_display: g.user_display,
      topic: 'git-flow',
      mining_evidence: {
        sessions_observed: nonZeroDays.length,
        pattern_count: atOrAbove,
        reject_count: 0,
        extraction_method: EXTRACTION_METHOD,
      },
      created_at: '1970-01-01T00:00:00Z', // deterministic; replaced by ingest time downstream
    });
  }

  // ---- checkpoint cadence (from session_summaries) ----
  const byUser = new Map<string, SessionSummary[]>();
  for (const s of session_summaries) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id)!.push(s);
  }

  for (const user_id of [...byUser.keys()].sort()) {
    const sessions = byUser.get(user_id)!;
    const hits = sessions.filter((s) =>
      s.actions.some((a) => CHECKPOINT_ACTIONS.has(a)),
    );
    if (hits.length < CHECKPOINT_MIN_SESSIONS) continue;
    const earliestTs = sessions.map((s) => s.started_at).sort()[0]!;
    out.push({
      id: `bp-ctx-${user_id}-checkpoint-cadence`,
      type: 'context-mgmt',
      title: 'Regular context checkpoints',
      body: `Saves working context in ${hits.length} of ${sessions.length} sessions.`,
      example: 'checkpoint',
      pushed_by: user_id,
      pushed_by_display: sessions[0]!.user_display,
      topic: 'ctx-mgmt',
      mining_evidence: {
        sessions_observed: sessions.length,
        pattern_count: hits.length,
        reject_count: 0,
        extraction_method: EXTRACTION_METHOD,
      },
      created_at: earliestTs,
    });
  }

  return out;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return s[Math.floor(n / 2)]!;
  return (s[n / 2 - 1]! + s[n / 2]!) / 2;
}
