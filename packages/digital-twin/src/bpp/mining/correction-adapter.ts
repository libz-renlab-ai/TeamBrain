// BPP mining — correction-adapter.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §3.2
// (row "rule (显性纠正)") + §3.5 (mining_evidence is LLM-uncheatable counts).
// Plan: docs/superpowers/plans/2026-05-13-bpp.md Task P2.1.
//
// Consumes `correction_moments[]` produced by the existing correction-detector +
// LLM-extractor (auto-capture) pipeline, and emits one CandidateBp of type=rule
// per distinct (user_id, signal) pair. mining_evidence.pattern_count counts how
// many of THIS user's sessions the same correction signal showed up in.

import type { CandidateBp, CorrectionMoment } from './mining-types.js';

export const EXTRACTION_METHOD = 'correction-adapter@v1';

export interface CorrectionAdapterInput {
  correction_moments: CorrectionMoment[];
}

/**
 * Build CandidateBp[] (type=rule) from correction moments.
 *
 * Algorithm:
 *   1. Group moments by (user_id, signal) — same user repeating the same signal
 *      across sessions is the "pattern".
 *   2. Per group, count distinct session_ids → pattern_count.
 *   3. Per user, count distinct session_ids across ALL their moments → sessions_observed.
 *   4. reject_count starts at 0 (filled in later when PushEvent rejected events
 *      flow back through the audit log).
 *
 * The LLM (in production) is responsible for collapsing `text` snippets into a
 * single title + body + example; in this pipeline-skeleton phase we synthesize
 * a deterministic title/body from the signal so output is byte-stable for
 * tier-(a) fixture diffs.
 */
export function mineCorrectionCandidates(input: CorrectionAdapterInput): CandidateBp[] {
  const { correction_moments } = input;
  if (correction_moments.length === 0) return [];

  // sessions per user (denominator for sessions_observed)
  const sessionsPerUser = new Map<string, Set<string>>();
  for (const m of correction_moments) {
    if (!sessionsPerUser.has(m.user_id)) sessionsPerUser.set(m.user_id, new Set());
    sessionsPerUser.get(m.user_id)!.add(m.session_id);
  }

  // group (user_id, signal) -> moments
  const groups = new Map<string, CorrectionMoment[]>();
  for (const m of correction_moments) {
    const key = `${m.user_id}::${m.signal}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const out: CandidateBp[] = [];
  // deterministic order: sort group keys lexicographically
  for (const key of [...groups.keys()].sort()) {
    const moments = groups.get(key)!;
    const first = moments[0]!;

    const sessions = new Set<string>();
    let earliestTs = first.timestamp;
    for (const m of moments) {
      sessions.add(m.session_id);
      if (m.timestamp < earliestTs) earliestTs = m.timestamp;
    }

    const id = correctionCandidateId(first.user_id, first.signal);
    out.push({
      id,
      type: 'rule',
      title: `Avoid: ${first.signal}`,
      body: first.text,
      example: first.text,
      pushed_by: first.user_id,
      pushed_by_display: first.user_display,
      topic: first.topic,
      mining_evidence: {
        sessions_observed: sessionsPerUser.get(first.user_id)!.size,
        pattern_count: sessions.size,
        reject_count: 0,
        extraction_method: EXTRACTION_METHOD,
      },
      created_at: earliestTs,
    });
  }

  return out;
}

/**
 * Build a filesystem-safe, collision-free candidate id from (user_id, signal).
 * Exported so the mining orchestrator can recompute the same id when it
 * resolves a candidate back to its source sessions for the audit log.
 *
 *  - user_id is sanitized to the `assertSafeId` charset (`[A-Za-z0-9._-]`) so
 *    email-style ids (`alice@team`) don't produce ids `writeBp` later rejects.
 *  - the signal slug falls back to a stable FNV-1a hash when the ASCII slug is
 *    empty — CJK-only corrections (the common case in this project) would
 *    otherwise collapse to `""` and collide across distinct signals.
 */
export function correctionCandidateId(user_id: string, signal: string): string {
  return `bp-rule-${safeIdPart(user_id)}-${slugOrHash(signal)}`;
}

function safeIdPart(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_');
}

function slugOrHash(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug.length > 0 ? slug : fnv1aHex(s);
}

/** 32-bit FNV-1a → 8 hex chars. Stable across runs and machines, no deps. */
function fnv1aHex(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
