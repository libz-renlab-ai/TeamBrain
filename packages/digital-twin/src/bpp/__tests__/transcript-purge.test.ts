// Phase 5 P5.2 — 30-day transcript purge cron.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.2
// ("退出团队后，server 端 sessions 在 30 天后自动清除") + §6.3 "30 天自动清理
// transcripts（保留 BestPractice 金本即可）".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { purgeStaleTranscripts } from '../transcript-purge.js';

function fakeNow(iso: string): Date {
  return new Date(iso);
}

function touch(file: string, content = '{}\n'): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

describe('purgeStaleTranscripts', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bpp-purge-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('deletes transcript files in date dirs older than retain_days', () => {
    // now = 2026-05-13; retain 30 days → keep ≥ 2026-04-13, purge < 2026-04-13.
    touch(join(root, 'alice@team.com', '2026-03-01', 'sess-1.jsonl'));
    touch(join(root, 'alice@team.com', '2026-03-01', 'sess-1.cc-status.jsonl'));
    touch(join(root, 'alice@team.com', '2026-04-01', 'sess-2.jsonl'));

    const result = purgeStaleTranscripts(root, fakeNow('2026-05-13T00:00:00Z'), 30);

    expect(existsSync(join(root, 'alice@team.com', '2026-03-01', 'sess-1.jsonl'))).toBe(false);
    expect(existsSync(join(root, 'alice@team.com', '2026-03-01', 'sess-1.cc-status.jsonl'))).toBe(false);
    expect(existsSync(join(root, 'alice@team.com', '2026-04-01', 'sess-2.jsonl'))).toBe(false);
    expect(result.purged_files).toBe(3);
    expect(result.purged_users).toEqual(['alice@team.com']);
  });

  it('keeps recent date dirs (≤ retain_days) untouched', () => {
    touch(join(root, 'bob@team.com', '2026-05-10', 'sess-a.jsonl'));
    touch(join(root, 'bob@team.com', '2026-05-12', 'sess-b.cc-status.jsonl'));

    const result = purgeStaleTranscripts(root, fakeNow('2026-05-13T00:00:00Z'), 30);

    expect(existsSync(join(root, 'bob@team.com', '2026-05-10', 'sess-a.jsonl'))).toBe(true);
    expect(existsSync(join(root, 'bob@team.com', '2026-05-12', 'sess-b.cc-status.jsonl'))).toBe(true);
    expect(result.purged_files).toBe(0);
    expect(result.purged_users).toEqual([]);
  });

  it('leaves _bp / _inbox / _team / _audit and other non-date entries alone even when stale', () => {
    // BP / inbox / team / audit top-level dirs (start with _) must never be
    // traversed by the purge, even though they may live alongside user dirs.
    touch(join(root, '_bp', 'bp-001.json'));
    touch(join(root, '_inbox', 'bob@team.com', '2026-03-01', 'items.jsonl'));
    touch(join(root, '_team', 'members.json'));
    touch(join(root, '_audit', '2026-03-01.jsonl'));
    // A real user dir with stale transcript — should be purged.
    touch(join(root, 'carol@team.com', '2026-03-01', 'sess.jsonl'));

    const result = purgeStaleTranscripts(root, fakeNow('2026-05-13T00:00:00Z'), 30);

    expect(existsSync(join(root, '_bp', 'bp-001.json'))).toBe(true);
    expect(existsSync(join(root, '_inbox', 'bob@team.com', '2026-03-01', 'items.jsonl'))).toBe(true);
    expect(existsSync(join(root, '_team', 'members.json'))).toBe(true);
    expect(existsSync(join(root, '_audit', '2026-03-01.jsonl'))).toBe(true);
    expect(existsSync(join(root, 'carol@team.com', '2026-03-01', 'sess.jsonl'))).toBe(false);
    expect(result.purged_files).toBe(1);
    expect(result.purged_users).toEqual(['carol@team.com']);
  });

  it('handles empty root dir gracefully', () => {
    const result = purgeStaleTranscripts(root, fakeNow('2026-05-13T00:00:00Z'), 30);
    expect(result).toEqual({ purged_files: 0, purged_users: [] });
  });
});
