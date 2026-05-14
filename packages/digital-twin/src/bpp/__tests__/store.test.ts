import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeBp,
  readBp,
  listBpIds,
  appendInbox,
  listInbox,
  appendAudit,
  listAuditEvents,
  writeMember,
  readMembers,
} from '../store.js';
import type {
  BestPractice,
  InboxItem,
  PushEvent,
  TeamMember,
} from '../types.js';

function makeBp(id: string): BestPractice {
  return {
    schema_version: 1,
    id,
    type: 'rule',
    title: 'do not mock db',
    body: 'detail',
    example: 'example',
    pushed_by: 'alice@team.com',
    pushed_by_display: 'Alice',
    topic: 'testing',
    confidence_score: 0.8,
    confidence_tier: 'canonical',
    conflict_with: [],
    mining_evidence: {
      sessions_observed: 5,
      pattern_count: 4,
      reject_count: 0,
      extraction_method: 'v1',
    },
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_at: '2026-05-13T10:00:00Z',
  };
}

describe('BPP store', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'bpp-store-'));
  });

  it('writeBp + readBp round-trip preserves all fields', () => {
    const bp = makeBp('bp-test-001');
    writeBp(tmpDir, bp);
    const got = readBp(tmpDir, 'bp-test-001');
    expect(got).toEqual(bp);
  });

  it('readBp returns null when bp not found', () => {
    expect(readBp(tmpDir, 'bp-does-not-exist')).toBeNull();
  });

  it('listBpIds returns all written bp ids', () => {
    writeBp(tmpDir, makeBp('bp-a'));
    writeBp(tmpDir, makeBp('bp-b'));
    expect(listBpIds(tmpDir).sort()).toEqual(['bp-a', 'bp-b']);
  });

  it('appendInbox + listInbox returns items in delivered_at order', () => {
    const item1: InboxItem = {
      schema_version: 1,
      id: 'inbox-bob-001',
      receiver_id: 'bob@team.com',
      bp_id: 'bp-1',
      status: 'pending',
      delivered_at: '2026-05-13T10:00:00Z',
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['statusline'],
    };
    const item2: InboxItem = {
      ...item1,
      id: 'inbox-bob-002',
      delivered_at: '2026-05-13T11:00:00Z',
    };
    appendInbox(tmpDir, item2);
    appendInbox(tmpDir, item1);
    const items = listInbox(tmpDir, 'bob@team.com');
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toEqual(['inbox-bob-001', 'inbox-bob-002']);
  });

  it('listInbox returns [] when receiver has no items', () => {
    expect(listInbox(tmpDir, 'nobody@team.com')).toEqual([]);
  });

  it('appendAudit writes append-only JSONL', () => {
    appendAudit(tmpDir, {
      schema_version: 1,
      id: 'ev-001',
      event_type: 'mined',
      bp_id: 'bp-1',
      actor: 'system',
      timestamp: '2026-05-13T10:00:00Z',
      metadata: {},
    });
    const auditFile = join(tmpDir, '_audit', '2026-05-13.jsonl');
    expect(existsSync(auditFile)).toBe(true);
    const content = readFileSync(auditFile, 'utf8');
    expect(content).toContain('"event_type":"mined"');
  });

  it('listAuditEvents reads _audit/*.jsonl across dates in timestamp order', () => {
    const evA: PushEvent = {
      schema_version: 1,
      id: 'ev-a',
      event_type: 'pushed',
      bp_id: 'bp-1',
      actor: 'alice@team.com',
      timestamp: '2026-05-13T10:00:00Z',
      metadata: {},
    };
    const evB: PushEvent = {
      ...evA,
      id: 'ev-b',
      event_type: 'accepted',
      timestamp: '2026-05-14T09:00:00Z',
    };
    // Append out of order — listAuditEvents must still return date-sorted.
    appendAudit(tmpDir, evB);
    appendAudit(tmpDir, evA);
    const events = listAuditEvents(tmpDir);
    expect(events.map((e) => e.id)).toEqual(['ev-a', 'ev-b']);
  });

  it('listAuditEvents returns [] when no audit log exists', () => {
    expect(listAuditEvents(tmpDir)).toEqual([]);
  });

  it('listAuditEvents --since filters events at or after the ISO cutoff', () => {
    const base: PushEvent = {
      schema_version: 1,
      id: 'ev-old',
      event_type: 'pushed',
      bp_id: 'bp-1',
      actor: 'alice@team.com',
      timestamp: '2026-05-13T10:00:00Z',
      metadata: {},
    };
    appendAudit(tmpDir, base);
    appendAudit(tmpDir, { ...base, id: 'ev-new', timestamp: '2026-05-15T10:00:00Z' });
    const events = listAuditEvents(tmpDir, '2026-05-14T00:00:00Z');
    expect(events.map((e) => e.id)).toEqual(['ev-new']);
  });

  it('writeBp rejects path-traversal in id', () => {
    const bp = makeBp('../etc/passwd');
    expect(() => writeBp(tmpDir, bp)).toThrow(/invalid id/i);
  });

  it('writeMember + readMembers upserts by user_id', () => {
    const alice: TeamMember = {
      schema_version: 1,
      user_id: 'alice@team.com',
      display_name: 'Alice',
      role: 'lead',
      joined_at: '2026-05-13T09:00:00Z',
      notification_prefs: {},
    };
    const bob: TeamMember = {
      ...alice,
      user_id: 'bob@team.com',
      display_name: 'Bob',
      role: 'member',
    };
    writeMember(tmpDir, alice);
    writeMember(tmpDir, bob);
    writeMember(tmpDir, { ...alice, display_name: 'Alice updated' });
    const members = readMembers(tmpDir);
    expect(members).toHaveLength(2);
    const aliceRow = members.find((m) => m.user_id === 'alice@team.com');
    expect(aliceRow?.display_name).toBe('Alice updated');
  });
});
