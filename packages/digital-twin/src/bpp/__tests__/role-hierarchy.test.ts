// Gap 3 — role-hierarchy.ts unit tests.
//
// Covers getRoleTier resolution + the five tier-aware asserts. Each assert is
// tested for both the allowed and the forbidden case (except deleteAudit which
// is always-throws).

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getRoleTier,
  readRoleMetadata,
  writeRoleMetadata,
  assertCanTransferLead,
  assertCanElevate,
  assertCanRevoke,
  assertCanForcePush,
  assertCanDeleteAudit,
} from '../role-hierarchy.js';
import { writeMember } from '../store.js';
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

describe('BPP role-hierarchy: getRoleTier', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-rh-'));
  });

  it('returns "member" for unknown users', () => {
    expect(getRoleTier(dir, 'ghost@team.com')).toBe('member');
  });

  it('returns "member" for empty / non-string user_id', () => {
    expect(getRoleTier(dir, '')).toBe('member');
    expect(getRoleTier(dir, undefined as unknown as string)).toBe('member');
  });

  it('returns "member" for a registered plain member', () => {
    writeMember(dir, member('bob@team.com', 'member'));
    expect(getRoleTier(dir, 'bob@team.com')).toBe('member');
  });

  it('returns "main_lead" for a lead with no metadata entry (back-compat default)', () => {
    writeMember(dir, member('alice@team.com', 'lead'));
    expect(getRoleTier(dir, 'alice@team.com')).toBe('main_lead');
  });

  it('returns "co_lead" for a lead whose metadata says so', () => {
    writeMember(dir, member('carol@team.com', 'lead'));
    writeRoleMetadata(dir, {
      schema_version: 1,
      leads: { 'carol@team.com': 'co_lead' },
    });
    expect(getRoleTier(dir, 'carol@team.com')).toBe('co_lead');
  });

  it('returns "main_lead" for a lead whose metadata explicitly tags main_lead', () => {
    writeMember(dir, member('alice@team.com', 'lead'));
    writeRoleMetadata(dir, {
      schema_version: 1,
      leads: { 'alice@team.com': 'main_lead' },
    });
    expect(getRoleTier(dir, 'alice@team.com')).toBe('main_lead');
  });
});

describe('BPP role-hierarchy: assertCan* tier gates', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-rh-asserts-'));
    writeMember(dir, member('alice@team.com', 'lead'));
    writeMember(dir, member('carol@team.com', 'lead'));
    writeMember(dir, member('bob@team.com', 'member'));
    writeRoleMetadata(dir, {
      schema_version: 1,
      leads: {
        'alice@team.com': 'main_lead',
        'carol@team.com': 'co_lead',
      },
    });
  });

  it('assertCanTransferLead allows main_lead, rejects co_lead and member', () => {
    expect(() => assertCanTransferLead(dir, 'alice@team.com')).not.toThrow();
    expect(() => assertCanTransferLead(dir, 'carol@team.com')).toThrow(
      /not authorized/,
    );
    expect(() => assertCanTransferLead(dir, 'bob@team.com')).toThrow(
      /not authorized/,
    );
  });

  it('assertCanElevate allows main_lead, rejects co_lead and member', () => {
    expect(() => assertCanElevate(dir, 'alice@team.com')).not.toThrow();
    expect(() => assertCanElevate(dir, 'carol@team.com')).toThrow(
      /not authorized/,
    );
    expect(() => assertCanElevate(dir, 'bob@team.com')).toThrow(
      /not authorized/,
    );
  });

  it('assertCanRevoke allows main_lead and co_lead, rejects member', () => {
    expect(() => assertCanRevoke(dir, 'alice@team.com')).not.toThrow();
    expect(() => assertCanRevoke(dir, 'carol@team.com')).not.toThrow();
    expect(() => assertCanRevoke(dir, 'bob@team.com')).toThrow(
      /not authorized/,
    );
  });

  it('assertCanForcePush allows main_lead and co_lead, rejects member', () => {
    expect(() => assertCanForcePush(dir, 'alice@team.com')).not.toThrow();
    expect(() => assertCanForcePush(dir, 'carol@team.com')).not.toThrow();
    expect(() => assertCanForcePush(dir, 'bob@team.com')).toThrow(
      /not authorized/,
    );
  });

  it('assertCanDeleteAudit always throws — audit logs are immutable', () => {
    expect(() => assertCanDeleteAudit(dir, 'alice@team.com')).toThrow(
      /immutable/,
    );
    expect(() => assertCanDeleteAudit(dir, 'carol@team.com')).toThrow(
      /immutable/,
    );
    expect(() => assertCanDeleteAudit(dir, 'bob@team.com')).toThrow(
      /immutable/,
    );
  });

  it('rejects unknown actor for every tier-gated assert', () => {
    expect(() => assertCanTransferLead(dir, 'ghost@team.com')).toThrow(
      /not authorized/,
    );
    expect(() => assertCanElevate(dir, 'ghost@team.com')).toThrow(
      /not authorized/,
    );
    expect(() => assertCanRevoke(dir, 'ghost@team.com')).toThrow(
      /not authorized/,
    );
    expect(() => assertCanForcePush(dir, 'ghost@team.com')).toThrow(
      /not authorized/,
    );
  });
});

describe('BPP role-hierarchy: metadata file IO', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-rh-io-'));
  });

  it('readRoleMetadata returns empty shape when file missing', () => {
    expect(readRoleMetadata(dir)).toEqual({ schema_version: 1, leads: {} });
  });

  it('writeRoleMetadata + readRoleMetadata round-trip preserves leads map', () => {
    writeRoleMetadata(dir, {
      schema_version: 1,
      leads: { 'a@x.com': 'main_lead', 'b@x.com': 'co_lead' },
    });
    expect(existsSync(join(dir, '_team', 'role-metadata.json'))).toBe(true);
    const back = readRoleMetadata(dir);
    expect(back.leads).toEqual({
      'a@x.com': 'main_lead',
      'b@x.com': 'co_lead',
    });
  });

  it('writes pretty-printed JSON on disk', () => {
    writeRoleMetadata(dir, {
      schema_version: 1,
      leads: { 'a@x.com': 'main_lead' },
    });
    const raw = readFileSync(join(dir, '_team', 'role-metadata.json'), 'utf8');
    expect(raw).toContain('\n');
    expect(raw).toContain('"main_lead"');
  });
});
