import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleForcePush } from '../force-push.js';
import { handleBpPush } from '../server-handlers.js';
import { writeMember, listInbox } from '../store.js';
import type { BestPractice, TeamMember } from '../types.js';

function makeBp(id: string): BestPractice {
  return {
    schema_version: 1,
    id,
    type: 'rule',
    title: 'review every SQL migration with a DBA',
    body: 'silent column drops cost us a Saturday',
    example: 'incident-2026-04-12',
    pushed_by: 'alice@team.com',
    pushed_by_display: 'Alice',
    topic: 'testing',
    confidence_score: 0.9,
    confidence_tier: 'enforced',
    conflict_with: [],
    mining_evidence: {
      sessions_observed: 8,
      pattern_count: 6,
      reject_count: 0,
      extraction_method: 'v1',
    },
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_at: '2026-05-13T10:00:00Z',
  };
}

function member(user_id: string, role: 'lead' | 'member'): TeamMember {
  return {
    schema_version: 1,
    user_id,
    display_name: user_id.split('@')[0] ?? user_id,
    role,
    joined_at: '2026-05-13T10:00:00Z',
    notification_prefs: {},
  };
}

describe('BPP handleForcePush', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-force-'));
    writeMember(dir, member('alice@team.com', 'lead'));
    writeMember(dir, member('bob@team.com', 'member'));
  });

  it('happy path: lead force-pushes a BP to a receiver → inbox item created, audit logged', () => {
    handleBpPush(dir, { bp: makeBp('bp-sql-review'), receivers: [] });

    const res = handleForcePush(dir, {
      bp_id: 'bp-sql-review',
      receiver_id: 'bob@team.com',
      lead_user_id: 'alice@team.com',
    });

    expect(res.ok).toBe(true);
    expect(res.receiver_id).toBe('bob@team.com');
    expect(res.inbox_id).toMatch(/^inbox-bob_team_com-/);

    const inbox = listInbox(dir, 'bob@team.com');
    expect(inbox).toHaveLength(1);
    const item = inbox[0]!;
    expect(item.bp_id).toBe('bp-sql-review');
    expect(item.status).toBe('pending');
    expect(item.id).toBe(res.inbox_id);

    const today = new Date().toISOString().slice(0, 10);
    const auditFile = join(dir, '_audit', `${today}.jsonl`);
    expect(existsSync(auditFile)).toBe(true);
    const content = readFileSync(auditFile, 'utf8');
    expect(content).toContain('"event_type":"force-pushed"');
    expect(content).toContain('"actor":"alice@team.com"');
    expect(content).toContain('"bp_id":"bp-sql-review"');
  });

  it('forced_by_lead field is populated with the lead user_id (NOT the literal `false`)', () => {
    handleBpPush(dir, { bp: makeBp('bp-x'), receivers: [] });
    handleForcePush(dir, {
      bp_id: 'bp-x',
      receiver_id: 'bob@team.com',
      lead_user_id: 'alice@team.com',
    });

    const inbox = listInbox(dir, 'bob@team.com');
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.forced_by_lead).toBe('alice@team.com');
    // Defensive: must NOT have been left at the default `false` from handleBpPush.
    expect(inbox[0]!.forced_by_lead).not.toBe(false);
  });

  it('refuses force-push from a non-lead member', () => {
    handleBpPush(dir, { bp: makeBp('bp-y'), receivers: [] });
    expect(() =>
      handleForcePush(dir, {
        bp_id: 'bp-y',
        receiver_id: 'bob@team.com',
        lead_user_id: 'bob@team.com',
      }),
    ).toThrow(/not authorized/);

    // No inbox item should have been delivered.
    expect(listInbox(dir, 'bob@team.com')).toHaveLength(0);
  });

  it('refuses force-push from an unknown user', () => {
    handleBpPush(dir, { bp: makeBp('bp-z'), receivers: [] });
    expect(() =>
      handleForcePush(dir, {
        bp_id: 'bp-z',
        receiver_id: 'bob@team.com',
        lead_user_id: 'ghost@team.com',
      }),
    ).toThrow(/not authorized/);
  });

  it('throws when force-pushing a non-existent BP', () => {
    expect(() =>
      handleForcePush(dir, {
        bp_id: 'bp-does-not-exist',
        receiver_id: 'bob@team.com',
        lead_user_id: 'alice@team.com',
      }),
    ).toThrow(/not found/);

    // Inbox should still be empty.
    expect(listInbox(dir, 'bob@team.com')).toHaveLength(0);
  });

  it('rejects malformed body (missing bp_id / receiver_id / lead_user_id)', () => {
    expect(() =>
      handleForcePush(dir, {
        receiver_id: 'bob@team.com',
        lead_user_id: 'alice@team.com',
      } as unknown),
    ).toThrow(/bp_id/);
    expect(() =>
      handleForcePush(dir, {
        bp_id: 'bp-x',
        lead_user_id: 'alice@team.com',
      } as unknown),
    ).toThrow(/receiver_id/);
    expect(() =>
      handleForcePush(dir, {
        bp_id: 'bp-x',
        receiver_id: 'bob@team.com',
      } as unknown),
    ).toThrow(/lead_user_id/);
  });
});
