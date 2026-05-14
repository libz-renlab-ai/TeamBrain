import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BestPractice, MiningEvidence } from '../types.js';

// ---------------------------------------------------------------------------
// Phase 6 fixture-replay test (tier (a) byte-diff harness).
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.
// Judge: tests/fixtures/scenarios/bpp-brainstorm-habit/judge.md.
// Stub disclaimer: tests/fixtures/scenarios/BPP-STUB.md (read this FIRST).
// Acceptance ruler: docs/plans/2026-05-13-bpp-full-system-acceptance.md §M3, §M4, §9.5.
//
// STUB / SCAFFOLDING NOTICE
// ---------------------------------------------------------------------------
// This test asserts that the inline PLACEHOLDER miner produces byte-identical
// output against a HAND-AUTHORED expected JSON. It does NOT validate the real
// production mining pipeline, and it does NOT count as §M4 evidence under
// acceptance.md §9.5 (合成数据陷阱). Real-team experiment harness lives at
// docs/plans/2026-05-13-bpp-poc/m4-experiment/ (BLOCKED-ON-HUMAN to run).
//
// IMPORTANT: This test uses an INLINE PLACEHOLDER `mineForTest` because the
// real Phase 2 behavior-miner is being built in parallel by another agent.
// When Phase 2 lands, replace the placeholder body with a real import (e.g.
// `import { mineHabit } from '../miner.js'`) and re-record the expected JSON
// files if mining details legitimately change.
//
// Also: `CandidateBp` is NOT yet exported from ../types.ts (Phase 1 froze the
// public type surface). Declared here as a local shim until Phase 2
// formalizes it.
// ---------------------------------------------------------------------------

/** Local shim for the still-unwritten CandidateBp type. */
interface CandidateBp {
  schema_version: 1;
  id: string;
  type: BestPractice['type'];
  title: string;
  body: string;
  example: string;
  pushed_by: string;
  pushed_by_display: string;
  topic: BestPractice['topic'];
  confidence_score: 0;
  confidence_tier: 'low';
  conflict_with: string[];
  mining_evidence: MiningEvidence;
  revoked_at: null;
  revoked_by: null;
  revoke_reason: null;
  created_at: string;
}

/**
 * Placeholder miner. Reads a JSONL transcript string, counts how many times
 * the assistant invokes `superpowers:brainstorming` immediately before a
 * `Write` tool_use, and emits a single CandidateBp summarising that habit.
 *
 * Faithful to the transcript: counts what is observed, no inflation.
 */
export function mineForTest(transcriptJsonl: string): CandidateBp[] {
  const lines = transcriptJsonl
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  const sessionIds = new Set<string>();
  let patternCount = 0;
  let lastBrainstormSeenInBucket = false;

  for (const ev of events) {
    if (typeof ev.sessionId === 'string') sessionIds.add(ev.sessionId);
    if (ev.type !== 'assistant') continue;
    const msg = ev.message as { content?: unknown } | undefined;
    const content = msg?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const name = b.name;
        const input = b.input as Record<string, unknown> | undefined;
        if (name === 'Skill' && input?.skill === 'superpowers:brainstorming') {
          lastBrainstormSeenInBucket = true;
        } else if (name === 'Write' && lastBrainstormSeenInBucket) {
          patternCount += 1;
          lastBrainstormSeenInBucket = false;
        }
      }
    }
  }

  // Use the latest event timestamp as `created_at` (deterministic; fixed clock).
  const lastTs = events.at(-1)?.timestamp as string | undefined;
  const createdAt = lastTs ?? '2026-05-13T10:11:00Z';

  if (patternCount === 0) return [];

  return [
    {
      schema_version: 1,
      id: 'bp-candidate-2026-05-13-brainstorm-before-code',
      type: 'habit',
      title: 'Brainstorm before writing code',
      body:
        'Before any Write/Edit tool call that creates new code, invoke the superpowers:brainstorming skill first to clarify intent, requirements and edges.',
      example:
        "User: '实现一个 throttle' → Assistant: Skill(superpowers:brainstorming) → then Write(src/throttle.ts).",
      pushed_by: 'alice@team.com',
      pushed_by_display: 'Alice',
      topic: 'ai-collab',
      confidence_score: 0,
      confidence_tier: 'low',
      conflict_with: [],
      mining_evidence: {
        sessions_observed: sessionIds.size,
        pattern_count: patternCount,
        reject_count: 0,
        extraction_method: 'behavior-mining-v0-fixture',
      },
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: createdAt,
    },
  ];
}

/**
 * Wilson score lower bound, p_hat = success / n, z = 1.96 (95% CI).
 * Simplified inline copy — the production calibrator at
 * packages/core/src/calibrator/v2/wilson.ts uses a different `Tier` taxonomy
 * (experimental/probation/... vs BpTier low/stable/canonical/enforced/gold)
 * and time-decay weighting; for the fixture we need only the raw LB.
 */
export function wilsonLowerBound(success: number, failure: number): number {
  const n = success + failure;
  if (n === 0) return 0;
  const z = 1.96;
  const p = success / n;
  const numerator =
    p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const denominator = 1 + (z * z) / n;
  const lb = numerator / denominator;
  return Math.max(0, Math.min(1, lb));
}

/** BpTier thresholds (BPP-specific; spec §8.2 implies canonical ≥ 0.75). */
export function bpTierFromConfidence(c: number): BestPractice['confidence_tier'] {
  if (c < 0.55) return 'low';
  if (c < 0.75) return 'stable';
  if (c < 0.9) return 'canonical';
  if (c < 0.97) return 'enforced';
  return 'gold';
}

/**
 * Wilson + tier gate. Promotes a candidate to a full BestPractice using
 * **accumulated evidence** (multi-session rollup) rather than only the
 * transcript's per-session counts. See judge.md "candidate → final seam".
 */
export function gate(
  candidate: CandidateBp,
  accumulated: MiningEvidence,
): BestPractice {
  const conf = wilsonLowerBound(
    accumulated.pattern_count,
    accumulated.reject_count,
  );
  const confRounded = Math.round(conf * 10000) / 10000;
  return {
    schema_version: 1,
    id: candidate.id.replace('bp-candidate-', 'bp-'),
    type: candidate.type,
    title: candidate.title,
    body: candidate.body,
    example: candidate.example,
    pushed_by: candidate.pushed_by,
    pushed_by_display: candidate.pushed_by_display,
    topic: candidate.topic,
    confidence_score: confRounded,
    confidence_tier: bpTierFromConfidence(confRounded),
    conflict_with: candidate.conflict_with,
    mining_evidence: { ...accumulated },
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_at: candidate.created_at,
  };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const FIXTURE_DIR = join(
  process.cwd(),
  'tests',
  'fixtures',
  'scenarios',
  'bpp-brainstorm-habit',
);

describe('Phase 6 tier (a) byte-diff: bpp-brainstorm-habit', () => {
  it('mineForTest(transcript) byte-equals expected-candidate-bp.json', () => {
    const transcript = readFileSync(join(FIXTURE_DIR, 'transcript.jsonl'), 'utf8');
    const expected = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'expected-candidate-bp.json'), 'utf8'),
    );
    const actual = mineForTest(transcript);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual(expected);
  });

  it('gate(candidate, accumulatedEvidence) byte-equals expected-final-bp.json', () => {
    const transcript = readFileSync(join(FIXTURE_DIR, 'transcript.jsonl'), 'utf8');
    const expectedFinal = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'expected-final-bp.json'), 'utf8'),
    );

    const candidates = mineForTest(transcript);
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0]!;

    // Hand-supplied multi-session rollup. In production this comes from the
    // _audit/ or _bp/ store. Documented in judge.md "candidate → final seam".
    const accumulated: MiningEvidence = {
      sessions_observed: 4,
      pattern_count: 15,
      reject_count: 0,
      extraction_method: 'behavior-mining-v0-fixture',
    };

    const final = gate(candidate, accumulated);
    expect(final).toEqual(expectedFinal);
  });

  it('objective grep criterion §8.2 holds on the final BP', () => {
    const expectedFinal = JSON.parse(
      readFileSync(join(FIXTURE_DIR, 'expected-final-bp.json'), 'utf8'),
    ) as BestPractice;
    const ev = expectedFinal.mining_evidence;
    const rate = ev.pattern_count / ev.sessions_observed;
    expect(rate).toBeGreaterThanOrEqual(0.7);
    expect(ev.reject_count).toBe(0);
    expect(['canonical', 'enforced', 'gold']).toContain(
      expectedFinal.confidence_tier,
    );
  });
});
