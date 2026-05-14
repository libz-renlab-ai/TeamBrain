// Tests for BPP Inbox seed data shape (Phase 3 UX scaffold).
//
// Verifies the contract that the Client component relies on:
//   - at least 6 inbox items
//   - all 4 BpType values are represented
//   - at least one valid conflict pair (both BPs present, reciprocal refs)
//
// Run directly with: pnpm vitest run landing/overlay/src/app/inbox/__tests__/inbox-data.test.ts
// (root vitest.config.ts `include` only covers packages/*/src/**, so these tests
//  are not picked up by `pnpm test`. Track in a follow-up PR if/when landing/
//  gains its own test surface.)

import { describe, it, expect } from 'vitest';
import {
  SEED_INBOX,
  countByStatus,
  findConflictPairs,
  type BpType
} from '../inbox-data';

describe('SEED_INBOX', () => {
  it('contains at least 6 inbox items', () => {
    expect(SEED_INBOX.length).toBeGreaterThanOrEqual(6);
  });

  it('every item has a matching bp (id alignment)', () => {
    for (const s of SEED_INBOX) {
      expect(s.item.bp_id).toBe(s.bp.id);
    }
  });

  it('covers all 4 BpType values', () => {
    const types = new Set<BpType>(SEED_INBOX.map((s) => s.bp.type));
    expect(types.has('rule')).toBe(true);
    expect(types.has('skill')).toBe(true);
    expect(types.has('habit')).toBe(true);
    expect(types.has('context-mgmt')).toBe(true);
  });

  it('every bp has non-empty title / body / example / pushed_by_display', () => {
    for (const s of SEED_INBOX) {
      expect(s.bp.title.length).toBeGreaterThan(0);
      expect(s.bp.body.length).toBeGreaterThan(0);
      expect(s.bp.example.length).toBeGreaterThan(0);
      expect(s.bp.pushed_by_display.length).toBeGreaterThan(0);
    }
  });

  it('confidence_score is a sane float in [0, 1]', () => {
    for (const s of SEED_INBOX) {
      expect(s.bp.confidence_score).toBeGreaterThanOrEqual(0);
      expect(s.bp.confidence_score).toBeLessThanOrEqual(1);
    }
  });

  it('every inbox item has status in {pending, accepted, rejected, revoked}', () => {
    const allowed = new Set(['pending', 'accepted', 'rejected', 'revoked']);
    for (const s of SEED_INBOX) {
      expect(allowed.has(s.item.status)).toBe(true);
    }
  });
});

describe('findConflictPairs', () => {
  it('finds at least 1 conflict pair', () => {
    const pairs = findConflictPairs(SEED_INBOX);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
  });

  it('conflict pairs are reciprocal (both BPs reference each other)', () => {
    const pairs = findConflictPairs(SEED_INBOX);
    const byId = new Map(SEED_INBOX.map((s) => [s.bp.id, s.bp] as const));
    for (const [a, b] of pairs) {
      const bpA = byId.get(a);
      const bpB = byId.get(b);
      expect(bpA).toBeDefined();
      expect(bpB).toBeDefined();
      expect(bpA!.conflict_with).toContain(b);
      expect(bpB!.conflict_with).toContain(a);
    }
  });

  it('both BPs of every conflict pair appear as inbox items (not just dangling refs)', () => {
    const pairs = findConflictPairs(SEED_INBOX);
    const inboxBpIds = new Set(SEED_INBOX.map((s) => s.bp.id));
    for (const [a, b] of pairs) {
      expect(inboxBpIds.has(a)).toBe(true);
      expect(inboxBpIds.has(b)).toBe(true);
    }
  });
});

describe('countByStatus', () => {
  it('counts pending items correctly', () => {
    const items = SEED_INBOX.map((s) => s.item);
    const pending = countByStatus(items, 'pending');
    const accepted = countByStatus(items, 'accepted');
    const rejected = countByStatus(items, 'rejected');
    expect(pending).toBeGreaterThanOrEqual(1);
    expect(pending + accepted + rejected).toBeLessThanOrEqual(items.length);
  });
});
