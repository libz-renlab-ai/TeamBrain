// Phase 5 P5.1 — `teamagent team init` "I AGREE" interactive gate.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.2.
// The CLI must show the join protocol, demand the user type the exact string
// "I AGREE", and only then persist the user as the team lead.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMembers } from '@teamagent/digital-twin';
import { runTeamInit, type TeamInitDeps } from '../commands/team-init.js';

function makeDeps(overrides: Partial<TeamInitDeps>): TeamInitDeps {
  const written: string[] = [];
  return {
    readline: async () => 'I AGREE',
    write: (s: string) => written.push(s),
    now: () => '2026-05-13T12:00:00Z',
    rootDir: '',
    user_id: 'alice@team.com',
    display_name: 'Alice',
    ...overrides,
  };
}

describe('runTeamInit', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bpp-team-init-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('happy path: typing "I AGREE" returns ok and writes a lead TeamMember', () => {
    const deps = makeDeps({ rootDir: root });
    return runTeamInit(deps).then((result) => {
      expect(result).toEqual({ ok: true, user_id: 'alice@team.com' });
      const members = readMembers(root);
      expect(members).toHaveLength(1);
      expect(members[0]!.user_id).toBe('alice@team.com');
      expect(members[0]!.role).toBe('lead');
      expect(members[0]!.joined_at).toBe('2026-05-13T12:00:00Z');
      expect(members[0]!.display_name).toBe('Alice');
    });
  });

  it('returns exit code 1 with stderr when user types something else', async () => {
    const written: string[] = [];
    const stderr: string[] = [];
    const deps: TeamInitDeps = makeDeps({
      rootDir: root,
      readline: async () => 'no thanks',
      write: (s, channel) => {
        if (channel === 'stderr') stderr.push(s);
        else written.push(s);
      },
    });
    const result = await runTeamInit(deps);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.exitCode).toBe(1);
    }
    expect(stderr.join('')).toContain('Aborted: did not agree.');
    expect(readMembers(root)).toEqual([]);
  });

  it('is case-sensitive: "i agree" is not accepted', async () => {
    const deps = makeDeps({ rootDir: root, readline: async () => 'i agree' });
    const result = await runTeamInit(deps);
    expect(result.ok).toBe(false);
    expect(readMembers(root)).toEqual([]);
  });

  it('trims surrounding whitespace before comparison', async () => {
    const deps = makeDeps({ rootDir: root, readline: async () => '  I AGREE\n' });
    const result = await runTeamInit(deps);
    expect(result.ok).toBe(true);
    expect(readMembers(root)).toHaveLength(1);
  });

  it('prints the join protocol before reading input', async () => {
    const written: string[] = [];
    const deps = makeDeps({
      rootDir: root,
      write: (s) => written.push(s),
    });
    await runTeamInit(deps);
    const joined = written.join('');
    expect(joined).toMatch(/session/i);
    expect(joined).toMatch(/AI/i);
    expect(joined).toMatch(/I AGREE/);
    expect(joined).toMatch(/30/); // 30-day retention mention
  });
});
