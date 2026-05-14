// Gap 2 — handleInboxAct contract tests (accept / reject flow).
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.5 + §4.6.
// Scope: flip InboxItem.status to accepted|rejected, append a PushEvent audit
// row, and on `accept` compile a SKILL.md under <userHome>/.claude/skills/teamagent/.

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBpPush } from '../server-handlers.js';
import { handleInboxAct } from '../accept-handler.js';
import { listInbox } from '../store.js';
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

describe('handleInboxAct', () => {
  let rootDir: string;
  let userHome: string;
  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'bpp-act-'));
    userHome = mkdtempSync(join(tmpdir(), 'bpp-home-'));
  });

  function setupOneInboxItem(): { inboxId: string; bpId: string; receiver: string } {
    const bpId = 'bp-act-1';
    const receiver = 'bob@team.com';
    handleBpPush(rootDir, { bp: makeBp(bpId), receivers: [receiver] });
    const items = listInbox(rootDir, receiver);
    expect(items).toHaveLength(1);
    return { inboxId: items[0]!.id, bpId, receiver };
  }

  it('accept: flips status to accepted, returns compiled_path, writes SKILL.md', () => {
    const { inboxId, bpId, receiver } = setupOneInboxItem();

    const res = handleInboxAct(rootDir, userHome, {
      inbox_id: inboxId,
      receiver_id: receiver,
      action: 'accept',
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('accepted');
    expect(res.compiled_path).toBe(
      join(userHome, '.claude', 'skills', 'teamagent', bpId, 'SKILL.md'),
    );
    expect(existsSync(res.compiled_path!)).toBe(true);

    // Verify status flipped on disk.
    const after = listInbox(rootDir, receiver);
    expect(after[0]!.status).toBe('accepted');
    expect(after[0]!.acted_at).not.toBeNull();

    // Verify audit row.
    const today = new Date().toISOString().slice(0, 10);
    const audit = readFileSync(join(rootDir, '_audit', `${today}.jsonl`), 'utf8');
    expect(audit).toContain('"event_type":"accepted"');
    expect(audit).toContain(`"bp_id":"${bpId}"`);
  });

  it('reject: flips status to rejected, no SKILL.md compiled, audit row written', () => {
    const { inboxId, bpId, receiver } = setupOneInboxItem();

    const res = handleInboxAct(rootDir, userHome, {
      inbox_id: inboxId,
      receiver_id: receiver,
      action: 'reject',
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe('rejected');
    expect(res.compiled_path).toBeUndefined();

    // SKILL.md must NOT exist for a rejected item.
    const skillPath = join(userHome, '.claude', 'skills', 'teamagent', bpId, 'SKILL.md');
    expect(existsSync(skillPath)).toBe(false);

    // Status + audit.
    const after = listInbox(rootDir, receiver);
    expect(after[0]!.status).toBe('rejected');
    expect(after[0]!.acted_at).not.toBeNull();

    const today = new Date().toISOString().slice(0, 10);
    const audit = readFileSync(join(rootDir, '_audit', `${today}.jsonl`), 'utf8');
    expect(audit).toContain('"event_type":"rejected"');
    expect(audit).toContain(`"bp_id":"${bpId}"`);
  });

  it('throws when inbox_id is unknown', () => {
    expect(() =>
      handleInboxAct(rootDir, userHome, {
        inbox_id: 'inbox-does-not-exist',
        receiver_id: 'bob@team.com',
        action: 'accept',
      }),
    ).toThrow(/inbox.*not.*found|not found/i);
  });

  it('rejects malformed body (missing action)', () => {
    expect(() =>
      handleInboxAct(rootDir, userHome, {
        inbox_id: 'x',
        receiver_id: 'bob@team.com',
      } as unknown as { inbox_id: string; receiver_id: string; action: 'accept' | 'reject' }),
    ).toThrow(/action/);
  });

  it('rejects an unknown action value', () => {
    const { inboxId, receiver } = setupOneInboxItem();
    expect(() =>
      handleInboxAct(rootDir, userHome, {
        inbox_id: inboxId,
        receiver_id: receiver,
        action: 'maybe' as 'accept' | 'reject',
      }),
    ).toThrow(/action/);
  });

  it('throws when re-accepting an already-accepted item (idempotency guard)', () => {
    const { inboxId, receiver } = setupOneInboxItem();
    handleInboxAct(rootDir, userHome, {
      inbox_id: inboxId,
      receiver_id: receiver,
      action: 'accept',
    });
    expect(() =>
      handleInboxAct(rootDir, userHome, {
        inbox_id: inboxId,
        receiver_id: receiver,
        action: 'accept',
      }),
    ).toThrow(/already.*accepted|not pending/i);
  });

  it('throws on accept when the underlying BP has been hard-removed', () => {
    // Edge: inbox item exists but bp file got deleted out from under us.
    const { inboxId, receiver } = setupOneInboxItem();
    const { rmSync } = require('node:fs') as typeof import('node:fs');
    rmSync(join(rootDir, '_bp'), { recursive: true, force: true });
    expect(() =>
      handleInboxAct(rootDir, userHome, {
        inbox_id: inboxId,
        receiver_id: receiver,
        action: 'accept',
      }),
    ).toThrow(/bp.*not.*found|not found/i);
  });
});
