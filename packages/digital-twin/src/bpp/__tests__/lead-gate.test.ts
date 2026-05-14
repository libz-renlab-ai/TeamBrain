import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { isLead, assertIsLead } from '../lead-gate.js';
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

describe('BPP lead-gate', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bpp-lead-'));
  });

  it('isLead returns true for a registered lead', () => {
    writeMember(dir, member('alice@team.com', 'lead'));
    expect(isLead(dir, 'alice@team.com')).toBe(true);
  });

  it('isLead returns false for a registered non-lead member', () => {
    writeMember(dir, member('bob@team.com', 'member'));
    expect(isLead(dir, 'bob@team.com')).toBe(false);
  });

  it('isLead returns false for an unknown user (no members file at all)', () => {
    expect(isLead(dir, 'ghost@team.com')).toBe(false);
  });

  it('isLead returns false for an unknown user when other members exist', () => {
    writeMember(dir, member('alice@team.com', 'lead'));
    writeMember(dir, member('bob@team.com', 'member'));
    expect(isLead(dir, 'eve@team.com')).toBe(false);
  });

  it('isLead returns false for empty or non-string user_id', () => {
    writeMember(dir, member('alice@team.com', 'lead'));
    expect(isLead(dir, '')).toBe(false);
    expect(isLead(dir, undefined as unknown as string)).toBe(false);
  });

  it('assertIsLead throws "not authorized" for non-lead', () => {
    writeMember(dir, member('bob@team.com', 'member'));
    expect(() => assertIsLead(dir, 'bob@team.com')).toThrow(/not authorized/);
  });

  it('assertIsLead does not throw for a lead', () => {
    writeMember(dir, member('alice@team.com', 'lead'));
    expect(() => assertIsLead(dir, 'alice@team.com')).not.toThrow();
  });
});
