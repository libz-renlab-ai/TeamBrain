// Gap 3 — `teamagent team transfer-lead --to=<user_id>` CLI tests.
//
// Mirrors the dep-injection style used by `team-init.test.ts`: we drive the
// command via `runTeamTransferLead({ write, rootDir, from_user_id, argv })` and
// inspect both the result object and the side-effects on members.json /
// role-metadata.json.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readMembers,
  writeMember,
  getRoleTier,
  readRoleMetadata,
  writeRoleMetadata,
} from '@teamagent/digital-twin';

import {
  runTeamTransferLead,
  parseTransferLeadArgs,
  type TeamTransferLeadDeps,
} from '../commands/team-transfer-lead.js';

function member(user_id: string, role: 'lead' | 'member') {
  return {
    schema_version: 1 as const,
    user_id,
    display_name: user_id.split('@')[0] ?? user_id,
    role,
    joined_at: '2026-05-13T10:00:00Z',
    notification_prefs: {},
  };
}

interface CapturedDeps {
  stdout: string[];
  stderr: string[];
  deps: TeamTransferLeadDeps;
}

function makeDeps(
  overrides: Partial<TeamTransferLeadDeps>,
): CapturedDeps {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const deps: TeamTransferLeadDeps = {
    write: (s, channel) => {
      if (channel === 'stderr') stderr.push(s);
      else stdout.push(s);
    },
    rootDir: '',
    from_user_id: 'alice@team.com',
    argv: ['--to=bob@team.com'],
    ...overrides,
  };
  return { stdout, stderr, deps };
}

describe('parseTransferLeadArgs', () => {
  it('parses --to=value', () => {
    expect(parseTransferLeadArgs(['--to=bob@team.com'])).toEqual({
      to: 'bob@team.com',
      error: null,
    });
  });

  it('parses --to value (space-separated)', () => {
    expect(parseTransferLeadArgs(['--to', 'bob@team.com'])).toEqual({
      to: 'bob@team.com',
      error: null,
    });
  });

  it('errors when --to is missing', () => {
    const r = parseTransferLeadArgs([]);
    expect(r.to).toBeNull();
    expect(r.error).toMatch(/missing required flag: --to/);
  });

  it('errors on unknown argument', () => {
    const r = parseTransferLeadArgs(['--bogus']);
    expect(r.error).toMatch(/unknown argument/);
  });
});

describe('runTeamTransferLead', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bpp-cli-transfer-'));
    writeMember(root, member('alice@team.com', 'lead'));
    writeMember(root, member('bob@team.com', 'member'));
    writeRoleMetadata(root, {
      schema_version: 1,
      leads: { 'alice@team.com': 'main_lead' },
    });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('happy path: alice → bob, exit 0 with success stdout line', () => {
    const cap = makeDeps({ rootDir: root });
    const result = runTeamTransferLead(cap.deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.from_user_id).toBe('alice@team.com');
      expect(result.to_user_id).toBe('bob@team.com');
    }
    expect(cap.stdout.join('')).toContain(
      'Lead role transferred: alice@team.com -> bob@team.com',
    );
    expect(getRoleTier(root, 'alice@team.com')).toBe('member');
    expect(getRoleTier(root, 'bob@team.com')).toBe('main_lead');
  });

  it('exits 1 with stderr when --to is missing', () => {
    const cap = makeDeps({ rootDir: root, argv: [] });
    const result = runTeamTransferLead(cap.deps);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.exitCode).toBe(1);
    expect(cap.stderr.join('')).toMatch(/missing required flag/);
    expect(cap.stderr.join('')).toMatch(/Usage:/);
  });

  it('exits 1 with stderr when actor is not main_lead', () => {
    // bob is a plain member trying to transfer.
    const cap = makeDeps({
      rootDir: root,
      from_user_id: 'bob@team.com',
      argv: ['--to=alice@team.com'],
    });
    const result = runTeamTransferLead(cap.deps);
    expect(result.ok).toBe(false);
    expect(cap.stderr.join('')).toMatch(/not authorized/);
    // State unchanged.
    expect(getRoleTier(root, 'alice@team.com')).toBe('main_lead');
    expect(getRoleTier(root, 'bob@team.com')).toBe('member');
  });

  it('exits 1 when target user does not exist', () => {
    const cap = makeDeps({ rootDir: root, argv: ['--to=ghost@team.com'] });
    const result = runTeamTransferLead(cap.deps);
    expect(result.ok).toBe(false);
    expect(cap.stderr.join('')).toMatch(/user not found/);
  });

  it('exits 1 when from == to', () => {
    const cap = makeDeps({ rootDir: root, argv: ['--to=alice@team.com'] });
    const result = runTeamTransferLead(cap.deps);
    expect(result.ok).toBe(false);
    expect(cap.stderr.join('')).toMatch(/from and to must differ/);
  });

  it('updates members.json and role-metadata.json atomically on success', () => {
    const cap = makeDeps({ rootDir: root });
    runTeamTransferLead(cap.deps);
    const members = readMembers(root);
    expect(members.find((m) => m.user_id === 'alice@team.com')!.role).toBe(
      'member',
    );
    expect(members.find((m) => m.user_id === 'bob@team.com')!.role).toBe(
      'lead',
    );
    const meta = readRoleMetadata(root);
    expect(meta.leads['alice@team.com']).toBeUndefined();
    expect(meta.leads['bob@team.com']).toBe('main_lead');
  });

  it('exits 1 on unknown argument', () => {
    const cap = makeDeps({ rootDir: root, argv: ['--bogus'] });
    const result = runTeamTransferLead(cap.deps);
    expect(result.ok).toBe(false);
    expect(cap.stderr.join('')).toMatch(/unknown argument/);
  });
});
