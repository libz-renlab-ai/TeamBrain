import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleRevoke } from '../revoke.js';
import { handleBpPush } from '../server-handlers.js';
import { handleInboxAct } from '../accept-handler.js';
import { writeMember, readBp, listInbox } from '../store.js';
import type { BestPractice, PushEvent, TeamMember } from '../types.js';

function makeBp(id: string): BestPractice {
  return {
    schema_version: 1,
    id,
    type: 'rule',
    title: 'do not mock db in tests',
    body: 'mocking db hides migration bugs',
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

describe('BPP handleRevoke', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-revoke-'));
    writeMember(dir, member('alice@team.com', 'lead'));
    writeMember(dir, member('bob@team.com', 'member'));
    writeMember(dir, member('charlie@team.com', 'member'));
  });

  it('happy path: lead revokes a BP → BP fields filled, inbox cascade, audit event', () => {
    handleBpPush(dir, {
      bp: makeBp('bp-mock-db'),
      receivers: ['bob@team.com', 'charlie@team.com'],
    });

    const res = handleRevoke(dir, {
      bp_id: 'bp-mock-db',
      lead_user_id: 'alice@team.com',
      reason: 'replaced by ADR-0042',
    });

    expect(res).toEqual({
      ok: true,
      bp_id: 'bp-mock-db',
      revoked_inbox_count: 2,
      // pushed but never accepted → no compiled SKILL.md to cascade-delete
      deleted_skill_files: [],
    });

    const bp = readBp(dir, 'bp-mock-db');
    expect(bp).not.toBeNull();
    expect(bp!.revoked_by).toBe('alice@team.com');
    expect(bp!.revoke_reason).toBe('replaced by ADR-0042');
    expect(bp!.revoked_at).toMatch(/^20\d\d-/); // ISO

    const bobInbox = listInbox(dir, 'bob@team.com');
    const charlieInbox = listInbox(dir, 'charlie@team.com');
    expect(bobInbox).toHaveLength(1);
    expect(charlieInbox).toHaveLength(1);
    expect(bobInbox[0]!.status).toBe('revoked');
    expect(charlieInbox[0]!.status).toBe('revoked');

    const today = new Date().toISOString().slice(0, 10);
    const auditFile = join(dir, '_audit', `${today}.jsonl`);
    expect(existsSync(auditFile)).toBe(true);
    const content = readFileSync(auditFile, 'utf8');
    expect(content).toContain('"event_type":"revoked"');
    expect(content).toContain('"bp_id":"bp-mock-db"');
    expect(content).toContain('"actor":"alice@team.com"');
  });

  it('refuses revoke from a non-lead member', () => {
    handleBpPush(dir, { bp: makeBp('bp-x'), receivers: ['charlie@team.com'] });
    expect(() =>
      handleRevoke(dir, {
        bp_id: 'bp-x',
        lead_user_id: 'bob@team.com',
        reason: 'I disagree',
      }),
    ).toThrow(/not authorized/);

    // BP must be untouched, inbox must still be pending
    expect(readBp(dir, 'bp-x')!.revoked_at).toBeNull();
    expect(listInbox(dir, 'charlie@team.com')[0]!.status).toBe('pending');
  });

  it('refuses revoke from a completely unknown user', () => {
    handleBpPush(dir, { bp: makeBp('bp-y'), receivers: ['bob@team.com'] });
    expect(() =>
      handleRevoke(dir, {
        bp_id: 'bp-y',
        lead_user_id: 'ghost@team.com',
        reason: 'spooky',
      }),
    ).toThrow(/not authorized/);
  });

  it('throws when revoking a non-existent BP', () => {
    expect(() =>
      handleRevoke(dir, {
        bp_id: 'bp-does-not-exist',
        lead_user_id: 'alice@team.com',
        reason: 'nothing',
      }),
    ).toThrow(/not found/);
  });

  it('inbox cascade only flips items for the targeted bp_id, not unrelated BPs', () => {
    handleBpPush(dir, { bp: makeBp('bp-a'), receivers: ['bob@team.com'] });
    handleBpPush(dir, { bp: makeBp('bp-b'), receivers: ['bob@team.com'] });

    handleRevoke(dir, {
      bp_id: 'bp-a',
      lead_user_id: 'alice@team.com',
      reason: 'noise',
    });

    const inbox = listInbox(dir, 'bob@team.com');
    const a = inbox.find((i) => i.bp_id === 'bp-a')!;
    const b = inbox.find((i) => i.bp_id === 'bp-b')!;
    expect(a.status).toBe('revoked');
    expect(b.status).toBe('pending');
  });

  it('rejects malformed body (missing bp_id / reason)', () => {
    expect(() =>
      handleRevoke(dir, { lead_user_id: 'alice@team.com', reason: 'x' } as unknown),
    ).toThrow(/bp_id/);
    expect(() =>
      handleRevoke(dir, { bp_id: 'bp-z', lead_user_id: 'alice@team.com' } as unknown),
    ).toThrow(/reason/);
  });

  it('revoking with zero existing inbox items returns count=0 but still flips BP', () => {
    // BP exists but was never pushed to anyone — write directly via push then
    // wipe out the receivers? Simpler: push to empty receivers (the push
    // handler allows empty arrays — pure storage write, no fan-out).
    handleBpPush(dir, { bp: makeBp('bp-orphan'), receivers: [] });
    const res = handleRevoke(dir, {
      bp_id: 'bp-orphan',
      lead_user_id: 'alice@team.com',
      reason: 'nobody had it anyway',
    });
    expect(res.revoked_inbox_count).toBe(0);
    expect(readBp(dir, 'bp-orphan')!.revoked_by).toBe('alice@team.com');
  });
});

// ── PR-C — revoke cascades to compiled-skill-file deletion ────────────────
//
// Acceptance contract §2 里程碑一: "撤回触发级联：未采纳的收件箱条目消失、
// 已采纳的本机技能文件被删除" + 验证方法 step 8 ("验证 5 秒内：小李技能库的
// 文件消失"). Before PR-C, handleRevoke only flipped InboxItem.status — the
// compiled SKILL.md was orphaned on disk forever.

describe('BPP handleRevoke — skill-file cascade', () => {
  let dir: string;
  let userHome: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-revoke-cascade-'));
    userHome = mkdtempSync(join(tmpdir(), 'bpp-revoke-home-'));
    writeMember(dir, member('alice@team.com', 'lead'));
    writeMember(dir, member('bob@team.com', 'member'));
  });

  it('accept persists compiled_path into the InboxItem; revoke unlinks it', () => {
    handleBpPush(dir, {
      bp: makeBp('bp-cascade'),
      receivers: ['bob@team.com'],
    });
    const inboxId = listInbox(dir, 'bob@team.com')[0]!.id;

    // bob accepts → SKILL.md compiled, compiled_path persisted on the row
    const acceptRes = handleInboxAct(dir, userHome, {
      inbox_id: inboxId,
      receiver_id: 'bob@team.com',
      action: 'accept',
    });
    const skillPath = acceptRes.compiled_path;
    expect(skillPath).toBeDefined();
    expect(existsSync(skillPath!)).toBe(true);
    expect(listInbox(dir, 'bob@team.com')[0]!.compiled_path).toBe(skillPath);

    // lead revokes → the compiled SKILL.md is physically deleted
    const res = handleRevoke(dir, {
      bp_id: 'bp-cascade',
      lead_user_id: 'alice@team.com',
      reason: 'mis-pushed',
    });
    expect(res.revoked_inbox_count).toBe(1);
    expect(res.deleted_skill_files).toEqual([skillPath]);
    expect(existsSync(skillPath!)).toBe(false);

    // the audit event records which skill files the cascade deleted
    const today = new Date().toISOString().slice(0, 10);
    const auditLines = readFileSync(join(dir, '_audit', `${today}.jsonl`), 'utf8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as PushEvent);
    const revokeEv = auditLines.find((e) => e.event_type === 'revoked');
    expect(revokeEv).toBeDefined();
    expect(revokeEv!.metadata.deleted_skill_files).toEqual([skillPath]);
  });

  it('revoking a BP that was only pending (never accepted) deletes no files', () => {
    handleBpPush(dir, {
      bp: makeBp('bp-pending'),
      receivers: ['bob@team.com'],
    });
    const res = handleRevoke(dir, {
      bp_id: 'bp-pending',
      lead_user_id: 'alice@team.com',
      reason: 'changed my mind',
    });
    expect(res.revoked_inbox_count).toBe(1);
    expect(res.deleted_skill_files).toEqual([]);
  });

  it('cascade is best-effort: revoke does not throw if the skill file is already gone', () => {
    handleBpPush(dir, { bp: makeBp('bp-gone'), receivers: ['bob@team.com'] });
    const inboxId = listInbox(dir, 'bob@team.com')[0]!.id;
    const acceptRes = handleInboxAct(dir, userHome, {
      inbox_id: inboxId,
      receiver_id: 'bob@team.com',
      action: 'accept',
    });
    // user manually deleted the skill file before the lead revoked
    unlinkSync(acceptRes.compiled_path!);

    const res = handleRevoke(dir, {
      bp_id: 'bp-gone',
      lead_user_id: 'alice@team.com',
      reason: 'too late',
    });
    expect(res.revoked_inbox_count).toBe(1);
    // file was already gone — it is not reported as freshly deleted
    expect(res.deleted_skill_files).toEqual([]);
  });

  it('rejected items are not treated as having a compiled skill file', () => {
    handleBpPush(dir, { bp: makeBp('bp-rej'), receivers: ['bob@team.com'] });
    const inboxId = listInbox(dir, 'bob@team.com')[0]!.id;
    handleInboxAct(dir, userHome, {
      inbox_id: inboxId,
      receiver_id: 'bob@team.com',
      action: 'reject',
    });
    const res = handleRevoke(dir, {
      bp_id: 'bp-rej',
      lead_user_id: 'alice@team.com',
      reason: 'cleanup',
    });
    expect(res.revoked_inbox_count).toBe(1);
    expect(res.deleted_skill_files).toEqual([]);
  });
});
