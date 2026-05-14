import { describe, it, expect } from 'vitest';
import {
  wilsonLowerBound,
  bppTierFromConfidence,
  wilsonTierGate,
  PUSHABLE_TIERS,
} from '../wilson-tier-gate.js';
import type { CandidateBp } from '../mining-types.js';

function candidate(overrides: Partial<CandidateBp>): CandidateBp {
  return {
    id: 'bp-rule-alice-x',
    type: 'rule',
    title: 't',
    body: 'b',
    example: 'e',
    pushed_by: 'alice@team',
    pushed_by_display: 'Alice',
    topic: 'testing',
    mining_evidence: {
      sessions_observed: 5,
      pattern_count: 5,
      reject_count: 0,
      extraction_method: 'correction-adapter@v1',
    },
    created_at: '2026-05-13T10:00:00Z',
    ...overrides,
  };
}

describe('wilson-tier-gate', () => {
  describe('wilsonLowerBound', () => {
    it('n=0 returns 0', () => {
      expect(wilsonLowerBound(0, 0)).toBe(0);
    });
    it('5 successes / 0 failures ≈ 0.565 (canonical tier)', () => {
      expect(wilsonLowerBound(5, 0)).toBeCloseTo(0.5655, 3);
    });
    it('20 successes / 0 failures ≈ 0.839 (enforced tier)', () => {
      expect(wilsonLowerBound(20, 0)).toBeCloseTo(0.8389, 3);
    });
    it('50 successes / 0 failures ≈ 0.929 (gold tier)', () => {
      expect(wilsonLowerBound(50, 0)).toBeCloseTo(0.9286, 3);
    });
    it('10 successes / 5 failures ≈ 0.417 (stable tier — failures pull down)', () => {
      expect(wilsonLowerBound(10, 5)).toBeCloseTo(0.4172, 3);
    });
  });

  describe('bppTierFromConfidence', () => {
    it('maps confidence to the BPP-specific 5-tier set', () => {
      expect(bppTierFromConfidence(0)).toBe('low');
      expect(bppTierFromConfidence(0.29)).toBe('low');
      expect(bppTierFromConfidence(0.3)).toBe('stable');
      expect(bppTierFromConfidence(0.54)).toBe('stable');
      expect(bppTierFromConfidence(0.55)).toBe('canonical');
      expect(bppTierFromConfidence(0.74)).toBe('canonical');
      expect(bppTierFromConfidence(0.75)).toBe('enforced');
      expect(bppTierFromConfidence(0.89)).toBe('enforced');
      expect(bppTierFromConfidence(0.9)).toBe('gold');
      expect(bppTierFromConfidence(1)).toBe('gold');
    });
    it('PUSHABLE_TIERS contains exactly canonical/enforced/gold per spec §3.3', () => {
      expect([...PUSHABLE_TIERS].sort()).toEqual(['canonical', 'enforced', 'gold']);
    });
  });

  describe('wilsonTierGate', () => {
    it('happy path: 5/5 rule candidate → canonical → emitted as full BestPractice', () => {
      const out = wilsonTierGate([candidate({})]);
      expect(out).toHaveLength(1);
      const bp = out[0]!;
      expect(bp.schema_version).toBe(1);
      expect(bp.confidence_tier).toBe('canonical');
      expect(bp.confidence_score).toBeCloseTo(0.5655, 3);
      expect(bp.revoked_at).toBeNull();
      expect(bp.revoked_by).toBeNull();
      expect(bp.revoke_reason).toBeNull();
      expect(bp.conflict_with).toEqual([]);
      expect(bp.mining_evidence.pattern_count).toBe(5);
    });

    it('empty input returns empty array', () => {
      expect(wilsonTierGate([])).toEqual([]);
    });

    it('rule with reject_count > 0 demoted below canonical → dropped from output', () => {
      const out = wilsonTierGate([
        candidate({
          mining_evidence: {
            sessions_observed: 10,
            pattern_count: 10,
            reject_count: 5, // 10/15 ≈ 0.417 → stable → DROPPED
            extraction_method: 'correction-adapter@v1',
          },
        }),
      ]);
      expect(out).toEqual([]);
    });

    it('low-confidence rule (2/0 → ~0.342 stable) is dropped', () => {
      const out = wilsonTierGate([
        candidate({
          mining_evidence: {
            sessions_observed: 2,
            pattern_count: 2,
            reject_count: 0,
            extraction_method: 'correction-adapter@v1',
          },
        }),
      ]);
      expect(out).toEqual([]);
    });

    it('habit candidate: missed sessions DO count as failures (3/10 → low → dropped)', () => {
      const out = wilsonTierGate([
        candidate({
          type: 'habit',
          mining_evidence: {
            sessions_observed: 10,
            pattern_count: 3, // 7 missed → failures=7 → wilson ≈ 0.108 → low
            reject_count: 0,
            extraction_method: 'behavior-miner@v1',
          },
        }),
      ]);
      expect(out).toEqual([]);
    });

    it('habit candidate with full coverage (5/5) reaches canonical and is emitted', () => {
      const out = wilsonTierGate([
        candidate({
          type: 'habit',
          mining_evidence: {
            sessions_observed: 5,
            pattern_count: 5,
            reject_count: 0,
            extraction_method: 'behavior-miner@v1',
          },
        }),
      ]);
      expect(out).toHaveLength(1);
      expect(out[0]!.confidence_tier).toBe('canonical');
    });

    it('high-volume rule (50/0) reaches gold tier', () => {
      const out = wilsonTierGate([
        candidate({
          mining_evidence: {
            sessions_observed: 50,
            pattern_count: 50,
            reject_count: 0,
            extraction_method: 'correction-adapter@v1',
          },
        }),
      ]);
      expect(out).toHaveLength(1);
      expect(out[0]!.confidence_tier).toBe('gold');
      expect(out[0]!.confidence_score).toBeCloseTo(0.9286, 3);
    });
  });
});
