// Gap 3 — role-transitions.ts unit tests (transferLead / elevateToCoLead /
// demoteCoLead). Covers happy paths, authorization failures, the 3-co-lead
// cap, member-state assertions, and audit-event emission.

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  transferLead,
  elevateToCoLead,
  demoteCoLead,
  MAX_CO_LEADS,
} from '../role-transitions.js';
import {
  getRoleTier,
  readRoleMetadata,
  writeRoleMetadata,
} from '../role-hierarchy.js';
import { readMembers, writeMember } from '../store.js';
import type { TeamMember } from '../types.js';

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

function readAuditLines(dir: string): unknown[] {
  const auditDir = join(dir, '_audit');
  if (!existsSync(auditDir)) return [];
  const out: unknown[] = [];
  for (const f of readdirSync(auditDir)) {
    if (!f.endsWith('.jsonl')) continue;
    const lines = readFileSync(join(auditDir, f), 'utf8')
      .split('\n')
      .filter(Boolean);
    for (const ln of lines) out.push(JSON.parse(ln));
  }
  return out;
}

function seedTeam(dir: string) {
  writeMember(dir, member('alice@team.com', 'lead'));
  writeMember(dir, member('bob@team.com', 'member'));
  writeMember(dir, member('carol@team.com', 'member'));
  writeRoleMetadata(dir, {
    schema_version: 1,
    leads: { 'alice@team.com': 'main_lead' },
  });
}

describe('BPP role-transitions: transferLead', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-rt-transfer-'));
    seedTeam(dir);
  });

  it('happy path: main_lead → new main_lead, old lead becomes member', () => {
    const result = transferLead(dir, 'alice@team.com', 'bob@team.com');
    expect(result.ok).toBe(true);
    expect(result.to_user_id).toBe('bob@team.com');

    expect(getRoleTier(dir, 'alice@team.com')).toBe('member');
    expect(getRoleTier(dir, 'bob@team.com')).toBe('main_lead');

    const members = readMembers(dir);
    expect(members.find((m) => m.user_id === 'alice@team.com')!.role).toBe('member');
    expect(members.find((m) => m.user_id === 'bob@team.com')!.role).toBe('lead');

    const meta = readRoleMetadata(dir);
    expect(meta.leads['alice@team.com']).toBeUndefined();
    expect(meta.leads['bob@team.com']).toBe('main_lead');
  });

  it('rejects when actor is a co_lead (not main_lead)', () => {
    // Elevate carol to co-lead, then have her try to transfer.
    elevateToCoLead(dir, 'alice@team.com', 'carol@team.com');
    expect(() => transferLead(dir, 'carol@team.com', 'bob@team.com')).toThrow(
      /not authorized/,
    );
  });

  it('rejects when actor is a plain member', () => {
    expect(() => transferLead(dir, 'bob@team.com', 'carol@team.com')).toThrow(
      /not authorized/,
    );
  });

  it('rejects when target user does not exist', () => {
    expect(() => transferLead(dir, 'alice@team.com', 'ghost@team.com')).toThrow(
      /user not found/,
    );
  });

  it('rejects when from and to are the same user', () => {
    expect(() => transferLead(dir, 'alice@team.com', 'alice@team.com')).toThrow(
      /from and to must differ/,
    );
  });

  it('appends a "lead-transferred" audit event', () => {
    transferLead(dir, 'alice@team.com', 'bob@team.com');
    const audit = readAuditLines(dir) as Array<{
      event_type: string;
      actor: string;
      metadata: { from_user_id: string; to_user_id: string };
    }>;
    const ev = audit.find((e) => e.event_type === 'lead-transferred');
    expect(ev).toBeDefined();
    expect(ev!.actor).toBe('alice@team.com');
    expect(ev!.metadata.from_user_id).toBe('alice@team.com');
    expect(ev!.metadata.to_user_id).toBe('bob@team.com');
  });
});

describe('BPP role-transitions: elevateToCoLead', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-rt-elevate-'));
    seedTeam(dir);
  });

  it('happy path: main_lead elevates a member to co_lead', () => {
    const result = elevateToCoLead(dir, 'alice@team.com', 'bob@team.com');
    expect(result.ok).toBe(true);
    expect(result.co_lead_count).toBe(1);
    expect(getRoleTier(dir, 'bob@team.com')).toBe('co_lead');
    // bob's role on disk flips to 'lead'.
    expect(
      readMembers(dir).find((m) => m.user_id === 'bob@team.com')!.role,
    ).toBe('lead');
  });

  it('rejects when actor is co_lead, not main_lead', () => {
    elevateToCoLead(dir, 'alice@team.com', 'bob@team.com');
    // Add another fresh member to try to elevate.
    writeMember(dir, member('dave@team.com', 'member'));
    expect(() => elevateToCoLead(dir, 'bob@team.com', 'dave@team.com')).toThrow(
      /not authorized/,
    );
  });

  it('rejects when target is already a lead (any tier)', () => {
    elevateToCoLead(dir, 'alice@team.com', 'bob@team.com');
    expect(() => elevateToCoLead(dir, 'alice@team.com', 'bob@team.com')).toThrow(
      /not a plain member/,
    );
  });

  it(`enforces co-lead cap (MAX_CO_LEADS=${MAX_CO_LEADS})`, () => {
    // Seed enough members.
    for (let i = 0; i < MAX_CO_LEADS + 1; i++) {
      writeMember(dir, member(`m${i}@team.com`, 'member'));
    }
    for (let i = 0; i < MAX_CO_LEADS; i++) {
      elevateToCoLead(dir, 'alice@team.com', `m${i}@team.com`);
    }
    expect(() =>
      elevateToCoLead(dir, 'alice@team.com', `m${MAX_CO_LEADS}@team.com`),
    ).toThrow(/co-lead cap reached/);
  });

  it('rejects when target user does not exist', () => {
    expect(() => elevateToCoLead(dir, 'alice@team.com', 'ghost@team.com')).toThrow(
      /user not found/,
    );
  });

  it('rejects when actor == target', () => {
    expect(() =>
      elevateToCoLead(dir, 'alice@team.com', 'alice@team.com'),
    ).toThrow(/actor and target must differ/);
  });

  it('appends a "lead-elevated" audit event', () => {
    elevateToCoLead(dir, 'alice@team.com', 'bob@team.com');
    const audit = readAuditLines(dir) as Array<{
      event_type: string;
      actor: string;
      metadata: { target_user_id: string };
    }>;
    const ev = audit.find((e) => e.event_type === 'lead-elevated');
    expect(ev).toBeDefined();
    expect(ev!.actor).toBe('alice@team.com');
    expect(ev!.metadata.target_user_id).toBe('bob@team.com');
  });
});

describe('BPP role-transitions: demoteCoLead', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-rt-demote-'));
    seedTeam(dir);
    elevateToCoLead(dir, 'alice@team.com', 'bob@team.com');
  });

  it('happy path: main_lead demotes a co_lead back to member', () => {
    const result = demoteCoLead(dir, 'alice@team.com', 'bob@team.com');
    expect(result.ok).toBe(true);
    expect(result.co_lead_count).toBe(0);
    expect(getRoleTier(dir, 'bob@team.com')).toBe('member');
    expect(
      readMembers(dir).find((m) => m.user_id === 'bob@team.com')!.role,
    ).toBe('member');
    const meta = readRoleMetadata(dir);
    expect(meta.leads['bob@team.com']).toBeUndefined();
  });

  it('rejects when actor is co_lead, not main_lead', () => {
    // Promote carol to co-lead so we can test peer demotion.
    elevateToCoLead(dir, 'alice@team.com', 'carol@team.com');
    expect(() => demoteCoLead(dir, 'carol@team.com', 'bob@team.com')).toThrow(
      /not authorized/,
    );
  });

  it('rejects when target is the main_lead (cannot demote main_lead)', () => {
    // alice is main_lead; try to demote her via demoteCoLead.
    // Need a second main_lead actor to bypass the auth check — but only alice is
    // main_lead. So actually it'll fail on auth first if we use anyone else.
    // Instead, test by trying alice → alice (same-user rejection)... actually
    // demoteCoLead has actor!=target. To exercise the tier-check path, we set
    // up another main_lead.
    writeMember(dir, member('dave@team.com', 'lead'));
    const meta = readRoleMetadata(dir);
    meta.leads['dave@team.com'] = 'main_lead';
    writeRoleMetadata(dir, meta);
    expect(() => demoteCoLead(dir, 'dave@team.com', 'alice@team.com')).toThrow(
      /not a co-lead/,
    );
  });

  it('rejects when target is a plain member', () => {
    expect(() => demoteCoLead(dir, 'alice@team.com', 'carol@team.com')).toThrow(
      /not a co-lead/,
    );
  });

  it('appends a "lead-demoted" audit event', () => {
    demoteCoLead(dir, 'alice@team.com', 'bob@team.com');
    const audit = readAuditLines(dir) as Array<{
      event_type: string;
      actor: string;
      metadata: { target_user_id: string };
    }>;
    const ev = audit.find((e) => e.event_type === 'lead-demoted');
    expect(ev).toBeDefined();
    expect(ev!.actor).toBe('alice@team.com');
    expect(ev!.metadata.target_user_id).toBe('bob@team.com');
  });

  it('rejects when actor == target', () => {
    expect(() =>
      demoteCoLead(dir, 'alice@team.com', 'alice@team.com'),
    ).toThrow(/actor and target must differ/);
  });
});
