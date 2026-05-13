// Gap 2 — compileBpToSkill contract tests.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §4.6.
// Scope: render a BestPractice as `~/.claude/skills/teamagent/<bp_id>/SKILL.md`
// markdown (frontmatter `name` + `description`, body with title/body/example).
// Writes go under the injected `userHome` (test = tmpdir); we never touch a real
// $HOME.

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { compileBpToSkill } from '../compile-to-skill.js';
import type { BestPractice } from '../types.js';

function makeBp(overrides: Partial<BestPractice> = {}): BestPractice {
  return {
    schema_version: 1,
    id: 'bp-2026-05-13-mock-db',
    type: 'rule',
    title: 'do not mock db in tests',
    body: 'mocking the db hides migration bugs and lets bad SQL into prod',
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
    ...overrides,
  };
}

describe('compileBpToSkill', () => {
  let userHome: string;
  beforeEach(() => {
    userHome = mkdtempSync(join(tmpdir(), 'bpp-compile-'));
  });

  it('writes SKILL.md to <userHome>/.claude/skills/teamagent/<bp_id>/SKILL.md', () => {
    const bp = makeBp();
    const res = compileBpToSkill(bp, userHome);

    const expected = join(
      userHome,
      '.claude',
      'skills',
      'teamagent',
      'bp-2026-05-13-mock-db',
      'SKILL.md',
    );
    expect(res.path).toBe(expected);
    expect(existsSync(expected)).toBe(true);
  });

  it('returns bytes_written matching the actual file size', () => {
    const bp = makeBp();
    const res = compileBpToSkill(bp, userHome);
    const actualBytes = Buffer.byteLength(readFileSync(res.path, 'utf8'), 'utf8');
    expect(res.bytes_written).toBe(actualBytes);
  });

  it('markdown contains frontmatter name + title + body + example', () => {
    const bp = makeBp();
    compileBpToSkill(bp, userHome);
    const text = readFileSync(
      join(userHome, '.claude', 'skills', 'teamagent', 'bp-2026-05-13-mock-db', 'SKILL.md'),
      'utf8',
    );
    // frontmatter
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toMatch(/name: bp-2026-05-13-mock-db/);
    // title (in description or section)
    expect(text).toContain('do not mock db in tests');
    // body verbatim
    expect(text).toContain('mocking the db hides migration bugs');
    // example verbatim
    expect(text).toContain('PR #200 mocked db tests passed but prod migration failed');
  });

  it('rejects bp_id with path-traversal characters', () => {
    const bp = makeBp({ id: '../etc/passwd' });
    expect(() => compileBpToSkill(bp, userHome)).toThrow(/invalid|id/i);
  });

  it('is idempotent — second call rewrites the same path with the same content', () => {
    const bp = makeBp();
    const a = compileBpToSkill(bp, userHome);
    const aText = readFileSync(a.path, 'utf8');
    const b = compileBpToSkill(bp, userHome);
    const bText = readFileSync(b.path, 'utf8');
    expect(b.path).toBe(a.path);
    expect(bText).toBe(aText);
    expect(b.bytes_written).toBe(a.bytes_written);
  });

  it('different bp_ids produce different output directories', () => {
    const bp1 = makeBp({ id: 'bp-alpha' });
    const bp2 = makeBp({ id: 'bp-beta' });
    const r1 = compileBpToSkill(bp1, userHome);
    const r2 = compileBpToSkill(bp2, userHome);
    expect(r1.path).not.toBe(r2.path);
    expect(existsSync(r1.path)).toBe(true);
    expect(existsSync(r2.path)).toBe(true);
  });
});
