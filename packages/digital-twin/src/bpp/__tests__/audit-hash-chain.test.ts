// Phase 5 P5.4 — audit log hash chain tamper-evident integrity.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6 +
// §5.3 (audit log is append-only; Phase 5 makes it tamper-evident).

import { describe, it, expect } from 'vitest';
import { linkAuditEvent, verifyAuditChain } from '../audit-hash-chain.js';
import type { PushEvent } from '../types.js';

function makeEv(id: string, eventType: PushEvent['event_type'] = 'pushed'): PushEvent {
  return {
    schema_version: 1,
    id,
    event_type: eventType,
    bp_id: 'bp-x',
    actor: 'alice@team.com',
    timestamp: '2026-05-13T10:00:00Z',
    metadata: {},
  };
}

describe('linkAuditEvent', () => {
  it('genesis link: prev=null fills prev_hash from __GENESIS__ sentinel', () => {
    const ev = makeEv('ev-001');
    const linked = linkAuditEvent(null, ev);
    expect(linked.metadata.prev_hash).toBe('__GENESIS__');
    expect(typeof linked.metadata.this_hash).toBe('string');
    expect((linked.metadata.this_hash as string).length).toBe(64); // sha256 hex
    // Original fields unchanged
    expect(linked.id).toBe('ev-001');
    expect(linked.event_type).toBe('pushed');
  });

  it('next link: prev_hash equals prior event this_hash', () => {
    const ev1 = makeEv('ev-001');
    const ev2 = makeEv('ev-002');
    const linked1 = linkAuditEvent(null, ev1);
    const linked2 = linkAuditEvent(linked1, ev2);
    expect(linked2.metadata.prev_hash).toBe(linked1.metadata.this_hash);
    expect(linked2.metadata.this_hash).not.toBe(linked1.metadata.this_hash);
  });
});

describe('verifyAuditChain', () => {
  it('returns ok=true on intact chain', () => {
    const ev1 = makeEv('ev-001');
    const ev2 = makeEv('ev-002', 'accepted');
    const ev3 = makeEv('ev-003', 'rejected');
    const l1 = linkAuditEvent(null, ev1);
    const l2 = linkAuditEvent(l1, ev2);
    const l3 = linkAuditEvent(l2, ev3);
    expect(verifyAuditChain([l1, l2, l3])).toEqual({ ok: true });
  });

  it('returns broken_at when a middle event has been tampered with', () => {
    const ev1 = makeEv('ev-001');
    const ev2 = makeEv('ev-002', 'accepted');
    const ev3 = makeEv('ev-003', 'rejected');
    const l1 = linkAuditEvent(null, ev1);
    const l2 = linkAuditEvent(l1, ev2);
    const l3 = linkAuditEvent(l2, ev3);
    // Tamper l2's actor — chain must detect.
    const tampered: PushEvent = { ...l2, actor: 'evil@attacker.com' };
    expect(verifyAuditChain([l1, tampered, l3])).toEqual({ ok: false, broken_at: 1 });
  });
});
