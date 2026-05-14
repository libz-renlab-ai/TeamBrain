// BPP mining — behavior-miner.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §3.2
// (row "habit (行为模式)") + §3.5 (mining_evidence is LLM-uncheatable counts).
// Plan: docs/superpowers/plans/2026-05-13-bpp.md Task P2.3.
//
// Detects "before X always Y" patterns per user across N≥3 sessions: for each
// (preceding action Y, task-starter action X), if Y precedes X consistently in
// the same user's sessions, emit a CandidateBp of type=habit.
//
// In production, the title/body would be LLM-generated from the matched session
// slices; this skeleton synthesizes a deterministic string so tier-(a) fixture
// diffs are byte-stable.

import type { CandidateBp, SessionSummary } from './mining-types.js';

export const EXTRACTION_METHOD = 'behavior-miner@v1';

/** Minimum sessions per user before a habit pattern is even considered. */
export const MIN_SESSIONS_PER_USER = 3;

/**
 * Default starter actions — observable "task begins" markers. Kept tiny and
 * explicit so a Phase 6 fixture diff stays stable across model versions.
 */
const DEFAULT_STARTERS: ReadonlySet<string> = new Set([
  'edit_file',
  'write_file',
  'run_test',
  'commit',
  'open_pr',
]);

export interface BehaviorMinerInput {
  session_summaries: SessionSummary[];
  /** Override the default starter-action set (mainly for tests). */
  starters?: ReadonlySet<string>;
}

interface PairCount {
  user_id: string;
  user_display: string;
  preceding: string;
  starter: string;
  sessions: Set<string>;
}

/**
 * Build CandidateBp[] (type=habit) from session summaries.
 *
 * Algorithm:
 *   1. Per user, only keep users with ≥ MIN_SESSIONS_PER_USER sessions.
 *   2. Per session, scan actions left-to-right; whenever actions[i] is a
 *      starter and actions[i-1] exists, record the pair (preceding=actions[i-1],
 *      starter=actions[i]).
 *   3. Per (user, preceding, starter), count distinct sessions hitting the pair.
 *      If ≥ MIN_SESSIONS_PER_USER, emit a CandidateBp.
 *   4. mining_evidence.pattern_count = #sessions where pair was seen.
 *      mining_evidence.sessions_observed = total #sessions for the user.
 */
export function mineBehaviorCandidates(input: BehaviorMinerInput): CandidateBp[] {
  const { session_summaries } = input;
  const starters = input.starters ?? DEFAULT_STARTERS;
  if (session_summaries.length === 0) return [];

  // group sessions per user
  const byUser = new Map<string, SessionSummary[]>();
  for (const s of session_summaries) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id)!.push(s);
  }

  const pairs = new Map<string, PairCount>();

  for (const [user_id, sessions] of byUser) {
    if (sessions.length < MIN_SESSIONS_PER_USER) continue;
    const user_display = sessions[0]!.user_display;

    for (const sess of sessions) {
      // record once per (pair, session) — set semantics
      const seenInThisSession = new Set<string>();
      for (let i = 1; i < sess.actions.length; i++) {
        const cur = sess.actions[i]!;
        if (!starters.has(cur)) continue;
        const prev = sess.actions[i - 1]!;
        if (prev === cur) continue; // ignore trivial repeats
        const pairKey = `${user_id}::${prev}::${cur}`;
        if (seenInThisSession.has(pairKey)) continue;
        seenInThisSession.add(pairKey);
        if (!pairs.has(pairKey)) {
          pairs.set(pairKey, {
            user_id,
            user_display,
            preceding: prev,
            starter: cur,
            sessions: new Set(),
          });
        }
        pairs.get(pairKey)!.sessions.add(sess.session_id);
      }
    }
  }

  const out: CandidateBp[] = [];
  // deterministic emit order: pair key sorted
  for (const key of [...pairs.keys()].sort()) {
    const pc = pairs.get(key)!;
    if (pc.sessions.size < MIN_SESSIONS_PER_USER) continue;

    const userSessions = byUser.get(pc.user_id)!;
    const earliestTs = userSessions
      .map((s) => s.started_at)
      .sort()[0]!;

    out.push({
      id: `bp-habit-${pc.user_id}-${slugify(pc.preceding)}-then-${slugify(pc.starter)}`,
      type: 'habit',
      title: `Before ${pc.starter}, always ${pc.preceding}`,
      body: `Pattern: ${pc.preceding} consistently precedes ${pc.starter}.`,
      example: `${pc.preceding} → ${pc.starter}`,
      pushed_by: pc.user_id,
      pushed_by_display: pc.user_display,
      topic: 'ai-collab',
      mining_evidence: {
        sessions_observed: userSessions.length,
        pattern_count: pc.sessions.size,
        reject_count: 0,
        extraction_method: EXTRACTION_METHOD,
      },
      created_at: earliestTs,
    });
  }

  return out;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
