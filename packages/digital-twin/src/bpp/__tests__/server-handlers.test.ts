import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleBpPush, handleInbox, handleMemberJoin } from '../server-handlers.js';
import { listInbox, readBp, readMembers } from '../store.js';
import type { BestPractice } from '../types.js';

function makeBp(id: string): BestPractice {
  return {
    schema_version: 1,
    id,
    type: 'rule',
    title: 'do not mock db in tests',
    body: 'mocking the db hides migration bugs',
    example: 'PR #200 mocked db tests passed but prod migration failed',
    pushed_by: 'alice@team.com',
    pushed_by_display: 'Alice',
    topic: 'testing',
    confidence_score: 0.85,
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

describe('BPP server handlers', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-srv-'));
  });

  it('handleBpPush writes the bp + fans out inbox to all receivers', () => {
    const bp = makeBp('bp-2026-05-13-mock-db');
    const res = handleBpPush(dir, { bp, receivers: ['bob@team.com', 'charlie@team.com'] });
    expect(res.ok).toBe(true);
    expect(res.bp_id).toBe('bp-2026-05-13-mock-db');
    expect(res.delivered_to).toEqual(['bob@team.com', 'charlie@team.com']);
    expect(readBp(dir, 'bp-2026-05-13-mock-db')).not.toBeNull();
    expect(listInbox(dir, 'bob@team.com')).toHaveLength(1);
    expect(listInbox(dir, 'charlie@team.com')).toHaveLength(1);
  });

  it('handleInbox returns pending items for the receiver', () => {
    handleBpPush(dir, { bp: makeBp('bp-x'), receivers: ['bob@team.com'] });
    const got = handleInbox(dir, 'bob@team.com');
    expect(got.items).toHaveLength(1);
    const first = got.items[0]!;
    expect(first.bp_id).toBe('bp-x');
    expect(first.status).toBe('pending');
    expect(first.forced_by_lead).toBe(false);
  });

  it('handleInbox returns [] for unknown receiver', () => {
    expect(handleInbox(dir, 'nobody@team.com').items).toEqual([]);
  });

  it('handleBpPush writes audit log entry for pushed event', () => {
    handleBpPush(dir, { bp: makeBp('bp-audit'), receivers: ['bob@team.com'] });
    const today = new Date().toISOString().slice(0, 10);
    const auditFile = join(dir, '_audit', `${today}.jsonl`);
    expect(existsSync(auditFile)).toBe(true);
    const content = readFileSync(auditFile, 'utf8');
    expect(content).toContain('"event_type":"pushed"');
    expect(content).toContain('"bp_id":"bp-audit"');
  });

  it('handleBpPush rejects body without bp', () => {
    expect(() => handleBpPush(dir, { receivers: [] } as unknown)).toThrow(/bp\.id/);
  });

  it('handleBpPush rejects body without title', () => {
    expect(() => handleBpPush(dir, { bp: { id: 'x' }, receivers: [] } as unknown)).toThrow(
      /title/,
    );
  });

  it('handleBpPush rejects non-array receivers', () => {
    expect(() =>
      handleBpPush(dir, { bp: makeBp('bp-y'), receivers: 'not-an-array' } as unknown),
    ).toThrow(/array/);
  });

  it('handleMemberJoin self-registers a user as role: member', () => {
    const res = handleMemberJoin(dir, {
      user_id: 'xiaoli@team.com',
      display_name: 'Xiao Li',
    });
    expect(res).toEqual({ ok: true, user_id: 'xiaoli@team.com' });
    const members = readMembers(dir);
    expect(members).toHaveLength(1);
    expect(members[0]!.user_id).toBe('xiaoli@team.com');
    expect(members[0]!.display_name).toBe('Xiao Li');
    expect(members[0]!.role).toBe('member');
  });

  it('handleMemberJoin does not clobber an existing lead role', () => {
    handleMemberJoin(dir, { user_id: 'laozhang', display_name: 'Lao Zhang' });
    handleMemberJoin(dir, { user_id: 'laozhang', display_name: 'Lao Zhang' });
    // Idempotent upsert by user_id — still one row, still a member.
    expect(readMembers(dir)).toHaveLength(1);
  });

  it('handleMemberJoin rejects a body without user_id', () => {
    expect(() =>
      handleMemberJoin(dir, { display_name: 'No Id' } as unknown),
    ).toThrow(/user_id/);
  });

  it('handleMemberJoin rejects a body without display_name', () => {
    expect(() =>
      handleMemberJoin(dir, { user_id: 'x' } as unknown),
    ).toThrow(/display_name/);
  });
});
