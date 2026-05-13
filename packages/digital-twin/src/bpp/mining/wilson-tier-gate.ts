// BPP mining — Wilson lower bound + tier gate.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §3.3
// (steps 5-7) + §3.5 (LLM-uncheatable). Plan: 2026-05-13-bpp.md Task P2.5 + P2.6.
//
// Phase 2.6: only CandidateBp's whose tier ∈ {canonical, enforced, gold} pass
// the gate and become full BestPractice records. tier ∈ {low, stable} get
// demoted to "personal scope" and never enter the push queue.
//
// Wilson math is INLINED here (not imported from @teamagent/core/calibrator/v2)
// for two reasons:
//   (1) digital-twin has no dep on @teamagent/core — adding one would force a
//       package.json edit, which the Phase-2 contract forbids.
//   (2) the BPP usage is the simple 2-arg Wilson LB over aggregate counts;
//       calibrator-v2/wilson.ts provides a time-decay-weighted variant over
//       timestamped Observation[] which is overkill for aggregate mining counts.
// The formula below is byte-identical math to wilson.ts at the n→count limit
// (Z=1.96, no time-decay).

import type { BestPractice, BpTier } from '../types.js';
import type { CandidateBp } from './mining-types.js';

const Z = 1.96; // 95% confidence interval

/**
 * Wilson Score Lower Bound. Mirrors the formula in
 * `packages/core/src/calibrator/v2/wilson.ts` with no time-decay weighting.
 *
 * @param successes positive observations (pattern_count)
 * @param failures  negative observations (reject_count + missed sessions)
 * @returns lower bound ∈ [0, 1]; 0 if n == 0
 */
export function wilsonLowerBound(successes: number, failures: number): number {
  const n = successes + failures;
  if (n === 0) return 0;
  const p = successes / n;
  const wilson =
    (p + (Z * Z) / (2 * n) -
      Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) /
    (1 + (Z * Z) / n);
  return Math.max(0, Math.min(1, wilson));
}

/**
 * Map a Wilson confidence value to a BPP tier. The BPP tier names
 * (`low | stable | canonical | enforced | gold`) deliberately differ from
 * calibrator-v2's `tier.ts` set (`experimental | probation | stable | canonical |
 * enforced`) per spec §2 table row "confidence_tier".
 *
 * Thresholds chosen to match the calibrator-v2 cut-points (0.30 / 0.55 / 0.75 /
 * 0.90) with the top bucket renamed `gold` (no `experimental` / `probation`
 * for BPP — those collapse into `low`).
 */
export function bppTierFromConfidence(conf: number): BpTier {
  if (conf < 0.3) return 'low';
  if (conf < 0.55) return 'stable';
  if (conf < 0.75) return 'canonical';
  if (conf < 0.9) return 'enforced';
  return 'gold';
}

/** Tiers that pass the push-queue gate per spec §3.3 step 7. */
export const PUSHABLE_TIERS: ReadonlySet<BpTier> = new Set<BpTier>([
  'canonical',
  'enforced',
  'gold',
]);

export interface WilsonTierGateOptions {
  /**
   * Whether to count "sessions in which the pattern was NOT observed" as
   * failures. For correction-adapter the absence of a moment in a session is
   * not meaningful (the correction signal is sparse by nature), so this is
   * `false` for type='rule'. For habit / context-mgmt patterns the absence IS
   * meaningful — a habit that holds in 3 of 100 sessions is weak — so we count
   * `sessions_observed - pattern_count` as failures.
   */
  countMissedSessionsAsFailures?: boolean;
}

/**
 * Decide the (successes, failures) split for a candidate. Documented at
 * advisor-resolution time; tested directly by `wilson-tier-gate.test.ts`.
 */
function splitSF(c: CandidateBp): { successes: number; failures: number } {
  const successes = c.mining_evidence.pattern_count;
  const baseFail = c.mining_evidence.reject_count;
  if (c.type === 'rule') {
    return { successes, failures: baseFail };
  }
  // habit / context-mgmt / skill: missed sessions count against
  const missed = Math.max(0, c.mining_evidence.sessions_observed - successes);
  return { successes, failures: baseFail + missed };
}

/**
 * Apply Wilson LB + tier mapping to each candidate; keep only those whose tier
 * is in PUSHABLE_TIERS and convert them to full BestPractice records ready for
 * `writeBp(...)` in `../store.ts`.
 */
export function wilsonTierGate(candidates: CandidateBp[]): BestPractice[] {
  const out: BestPractice[] = [];
  for (const c of candidates) {
    const { successes, failures } = splitSF(c);
    const confidence = wilsonLowerBound(successes, failures);
    const tier = bppTierFromConfidence(confidence);
    if (!PUSHABLE_TIERS.has(tier)) continue;
    out.push({
      schema_version: 1,
      id: c.id,
      type: c.type,
      title: c.title,
      body: c.body,
      example: c.example,
      pushed_by: c.pushed_by,
      pushed_by_display: c.pushed_by_display,
      topic: c.topic,
      confidence_score: confidence,
      confidence_tier: tier,
      conflict_with: [],
      mining_evidence: c.mining_evidence,
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: c.created_at,
    });
  }
  return out;
}
