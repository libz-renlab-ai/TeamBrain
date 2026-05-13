import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  sanitizeCcStatusSnapshot,
  appendCcStatusSnapshot,
  ccStatusJsonlPath,
  readLatestPerSession,
  readLatestForSession,
  readLatestAllUsers,
  readHistory,
  CC_STATUS_FILE_SUFFIX,
} from '../store.js';
import { CC_STATUS_SCHEMA_VERSION } from '../types.js';

function snap(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: 'sess-1',
    user_id: 'alice',
    ts: '2026-05-12T08:30:00.000Z',
    event: 'Status',
    model: 'claude-opus-4-7',
    context_tokens: 152000,
    ...over,
  };
}

describe('sanitizeCcStatusSnapshot', () => {
  it('accepts a well-formed snapshot and drops unknown keys', () => {
    const s = sanitizeCcStatusSnapshot(snap({ bogus_key: 'x', cost_usd: 1.23 }));
    expect(s).not.toBeNull();
    expect(s).not.toHaveProperty('bogus_key');
    expect(s!.cost_usd).toBe(1.23);
    expect(s!.user_id).toBe('alice');
  });

  it('rejects bad schema_version / missing core fields / bad ts', () => {
    expect(sanitizeCcStatusSnapshot(snap({ schema_version: 2 }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ session_id: 'has space' }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ session_id: '../etc' }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ event: '' }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ ts: 'not-a-date' }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ ts: '2026-01-01T00:00:00.000Z' + 'x'.repeat(200) }))).toBeNull();
    expect(sanitizeCcStatusSnapshot('nope')).toBeNull();
    expect(sanitizeCcStatusSnapshot(null)).toBeNull();
  });

  it('rejects session_id containing ".." or a Windows reserved device name', () => {
    expect(sanitizeCcStatusSnapshot(snap({ session_id: '..' }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ session_id: 'a..b' }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ session_id: 'con' }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ session_id: 'NUL' }))).toBeNull();
    expect(sanitizeCcStatusSnapshot(snap({ session_id: 'com1' }))).toBeNull();
    // a normal session id (UUID-shaped) still passes
    expect(sanitizeCcStatusSnapshot(snap({ session_id: 'abc-123_DEF.45' }))).not.toBeNull();
  });

  it('clamps over-long string fields', () => {
    const s = sanitizeCcStatusSnapshot(snap({ cwd: 'D:/' + 'x'.repeat(50_000), model: 'm'.repeat(5000) }))!;
    expect(s.cwd!.length).toBe(4096);
    expect(s.model!.length).toBe(256);
  });

  it('coerces a missing/garbage user_id to a safe id', () => {
    expect(sanitizeCcStatusSnapshot(snap({ user_id: undefined }))!.user_id).toBe('unknown');
    expect(sanitizeCcStatusSnapshot(snap({ user_id: 'a/b\\c' }))!.user_id).toBe('a_b_c');
  });

  it('drops wrong-typed / non-finite optional fields', () => {
    const s = sanitizeCcStatusSnapshot(
      snap({ context_tokens: 'lots', tokens_5h: Infinity, quota_stale: 'maybe', session_health: 'WEIRD' }),
    );
    expect(s).not.toHaveProperty('context_tokens');
    expect(s).not.toHaveProperty('tokens_5h');
    expect(s).not.toHaveProperty('quota_stale');
    expect(s).not.toHaveProperty('session_health');
  });

  it('preserves raw_prompt up to its 64 KiB cap (issue #308 grill §3)', () => {
    // Adversarial finding #2: prior whitelist dropped raw_prompt silently.
    // Pin the contract that a normal-sized prompt survives sanitization.
    const s = sanitizeCcStatusSnapshot(snap({ raw_prompt: 'hello presence' }))!;
    expect(s.raw_prompt).toBe('hello presence');
  });

  it('clamps an over-long raw_prompt to 64 KiB', () => {
    const huge = 'x'.repeat(70_000);
    const s = sanitizeCcStatusSnapshot(snap({ raw_prompt: huge }))!;
    expect(s.raw_prompt!.length).toBe(65_536);
  });

  it('omits raw_prompt when caller did not include it (no field, no truthy default)', () => {
    const s = sanitizeCcStatusSnapshot(snap())!;
    expect(s).not.toHaveProperty('raw_prompt');
  });
});

describe('cc-status store roundtrip', () => {
  let outputDir: string;
  const NOW = new Date('2026-05-12T09:00:00.000Z');

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'cc-status-'));
  });

  it('appends a snapshot under <user>/<date>/<session>.cc-status.jsonl', () => {
    const r = appendCcStatusSnapshot(outputDir, snap(), NOW);
    expect(r.ok).toBe(true);
    expect(r.user_id).toBe('alice');
    expect(r.date).toBe('2026-05-12');
    expect(r.session_id).toBe('sess-1');
    const file = ccStatusJsonlPath(outputDir, 'alice', '2026-05-12', 'sess-1');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).model).toBe('claude-opus-4-7');
  });

  it('rejects invalid snapshots without writing', () => {
    const r = appendCcStatusSnapshot(outputDir, snap({ schema_version: 9 }), NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid');
  });

  it('readLatestForSession returns the last appended line', () => {
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:00:00.000Z', context_tokens: 10 }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:30:00.000Z', context_tokens: 20 }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:59:00.000Z', context_tokens: 30 }), NOW);
    const r = readLatestForSession(outputDir, 'alice', 'sess-1', NOW);
    expect(r).not.toBeNull();
    expect(r!.context_tokens).toBe(30);
    // 09:00:00 - 08:59:00 = 60s
    expect(r!.stale_seconds).toBe(60);
  });

  it('readLatestPerSession groups by session and sorts freshest-first', () => {
    appendCcStatusSnapshot(outputDir, snap({ session_id: 'sess-a', ts: '2026-05-12T08:00:00.000Z' }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ session_id: 'sess-a', ts: '2026-05-12T08:10:00.000Z' }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ session_id: 'sess-b', ts: '2026-05-12T08:50:00.000Z' }), NOW);
    const rows = readLatestPerSession(outputDir, 'alice', NOW);
    expect(rows.map((r) => r.session_id)).toEqual(['sess-b', 'sess-a']);
    expect(rows.find((r) => r.session_id === 'sess-a')!.ts).toBe('2026-05-12T08:10:00.000Z');
  });

  it('readLatestPerSession follows a session across a UTC midnight', () => {
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-11T23:55:00.000Z', context_tokens: 1 }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T00:05:00.000Z', context_tokens: 2 }), NOW);
    const rows = readLatestPerSession(outputDir, 'alice', NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.context_tokens).toBe(2);
  });

  it('readLatestAllUsers spans every user dir', () => {
    appendCcStatusSnapshot(outputDir, snap({ user_id: 'alice', session_id: 'sess-a', ts: '2026-05-12T08:00:00.000Z' }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ user_id: 'bob', session_id: 'sess-b', ts: '2026-05-12T08:40:00.000Z' }), NOW);
    const rows = readLatestAllUsers(outputDir, NOW);
    expect(rows.map((r) => r.user_id)).toEqual(['bob', 'alice']);
  });

  it('readHistory returns the time series filtered by since', () => {
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:00:00.000Z', context_tokens: 1 }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:20:00.000Z', context_tokens: 2 }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:40:00.000Z', context_tokens: 3 }), NOW);
    const all = readHistory(outputDir, 'alice', 'sess-1', 0, NOW);
    expect(all.map((r) => r.context_tokens)).toEqual([1, 2, 3]);
    const since = readHistory(outputDir, 'alice', 'sess-1', Date.parse('2026-05-12T08:15:00.000Z'), NOW);
    expect(since.map((r) => r.context_tokens)).toEqual([2, 3]);
  });

  it('keeps the per-session file bounded (rotates to the tail when oversize)', () => {
    // Pad each snapshot so the file crosses the 2 MB cap quickly (a 3000-char
    // cwd gets clamped to 3000 by sanitize, so ~3 KB/line → ~700 lines = 2 MB).
    const filler = 'D:/' + 'x'.repeat(3000);
    let lastTokens = 0;
    for (let i = 0; i < 1000; i++) {
      lastTokens = i;
      appendCcStatusSnapshot(
        outputDir,
        snap({ ts: new Date(Date.parse('2026-05-12T08:00:00.000Z') + i * 1000).toISOString(), context_tokens: i, cwd: filler }),
        NOW,
      );
    }
    const file = ccStatusJsonlPath(outputDir, 'alice', '2026-05-12', 'sess-1');
    // never exceeds ~cap + one line after a rotation
    expect(readFileSync(file, 'utf8').length).toBeLessThanOrEqual(2 * 1024 * 1024 + 4096);
    // and it actually rotated (didn't keep all 1000 lines = ~3 MB)
    expect(readFileSync(file, 'utf8').length).toBeLessThan(3000 * 1000);
    // the freshest snapshot is still retrievable
    const r = readLatestForSession(outputDir, 'alice', 'sess-1', NOW);
    expect(r!.context_tokens).toBe(lastTokens);
  });

  it('readLatestPerSession picks the max-by-ts snapshot, not just the last line', () => {
    // Out-of-order: an earlier-ts snapshot appended last (non-monotonic clock).
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:00:00.000Z', context_tokens: 1 }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:50:00.000Z', context_tokens: 50 }), NOW);
    appendCcStatusSnapshot(outputDir, snap({ ts: '2026-05-12T08:10:00.000Z', context_tokens: 10 }), NOW); // older ts, appended last
    const r = readLatestForSession(outputDir, 'alice', 'sess-1', NOW);
    expect(r!.context_tokens).toBe(50);
    expect(r!.ts).toBe('2026-05-12T08:50:00.000Z');
  });

  it('ignores junk lines in a status file', () => {
    const file = ccStatusJsonlPath(outputDir, 'alice', '2026-05-12', 'sess-1');
    mkdirSync(join(outputDir, 'alice', '2026-05-12'), { recursive: true });
    writeFileSync(
      file,
      ['garbage', '{not json', JSON.stringify(sanitizeCcStatusSnapshot(snap({ context_tokens: 42 }))), ''].join('\n'),
      'utf8',
    );
    const r = readLatestForSession(outputDir, 'alice', 'sess-1', NOW);
    expect(r!.context_tokens).toBe(42);
  });

  it('file suffix is .cc-status.jsonl', () => {
    expect(CC_STATUS_FILE_SUFFIX).toBe('.cc-status.jsonl');
  });
});
