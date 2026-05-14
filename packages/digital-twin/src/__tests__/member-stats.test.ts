// M2 (对话上传通道) — computeMemberStats unit tests. Drives the on-demand
// stats reader directly against a hand-built <outputDir>/<user>/<date>/ tree.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeMemberStats } from '../member-stats.js';

describe('computeMemberStats', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'dt-memberstats-'));
  });

  /** Write `<outputDir>/<user>/<date>/<id>.jsonl` (+ optional meta sidecar). */
  function seed(
    user: string,
    date: string,
    id: string,
    opts: { l1?: number; l2?: number } = {},
  ): void {
    const dir = join(outputDir, user, date);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.jsonl`), '{"role":"user","content":"hi"}\n');
    if (opts.l1 !== undefined || opts.l2 !== undefined) {
      writeFileSync(
        join(dir, `${id}.meta.json`),
        JSON.stringify({
          l1_redaction_count: opts.l1 ?? 0,
          l2_redaction_count: opts.l2 ?? 0,
        }),
      );
    }
  }

  it('returns zeroed stats for a never-uploaded user (not an error)', () => {
    const stats = computeMemberStats(outputDir, 'nobody@libz.ai');
    expect(stats).toEqual({
      user_id: 'nobody@libz.ai',
      uploaded_total: 0,
      last_upload_at: null,
      redaction_count: 0,
    });
  });

  it('counts every .jsonl transcript across all date folders', () => {
    seed('zhang@libz.ai', '2026-05-12', 's1');
    seed('zhang@libz.ai', '2026-05-13', 's2');
    seed('zhang@libz.ai', '2026-05-13', 's3');
    const stats = computeMemberStats(outputDir, 'zhang@libz.ai');
    expect(stats.uploaded_total).toBe(3);
  });

  it('sums L1 + L2 redaction counts from the per-session sidecars', () => {
    seed('zhang@libz.ai', '2026-05-13', 's1', { l1: 3, l2: 0 });
    seed('zhang@libz.ai', '2026-05-13', 's2', { l1: 1, l2: 2 });
    seed('zhang@libz.ai', '2026-05-13', 's3'); // no sidecar — clean transcript
    const stats = computeMemberStats(outputDir, 'zhang@libz.ai');
    expect(stats.uploaded_total).toBe(3);
    expect(stats.redaction_count).toBe(6); // 3 + (1+2) + 0
  });

  it('reports the most recent transcript mtime as last_upload_at', () => {
    seed('zhang@libz.ai', '2026-05-13', 's1');
    const stats = computeMemberStats(outputDir, 'zhang@libz.ai');
    expect(stats.last_upload_at).not.toBeNull();
    // ISO-8601 with a Z suffix.
    expect(stats.last_upload_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('ignores non-date folders and a malformed sidecar', () => {
    seed('zhang@libz.ai', '2026-05-13', 's1', { l1: 5 });
    // a stray non-date dir must not be walked
    mkdirSync(join(outputDir, 'zhang@libz.ai', '_audit'), { recursive: true });
    writeFileSync(
      join(outputDir, 'zhang@libz.ai', '_audit', 'x.jsonl'),
      'not counted\n',
    );
    // a malformed sidecar must not break the read
    const dir = join(outputDir, 'zhang@libz.ai', '2026-05-13');
    writeFileSync(join(dir, 's2.jsonl'), '{}\n');
    writeFileSync(join(dir, 's2.meta.json'), '{ this is not json');
    const stats = computeMemberStats(outputDir, 'zhang@libz.ai');
    expect(stats.uploaded_total).toBe(2); // s1 + s2, NOT _audit/x.jsonl
    expect(stats.redaction_count).toBe(5); // s1 only; s2's sidecar is malformed
  });

  it('isolates one member from another', () => {
    seed('zhang@libz.ai', '2026-05-13', 's1', { l1: 2 });
    seed('li@libz.ai', '2026-05-13', 's1', { l1: 9 });
    expect(computeMemberStats(outputDir, 'zhang@libz.ai').redaction_count).toBe(2);
    expect(computeMemberStats(outputDir, 'li@libz.ai').redaction_count).toBe(9);
  });
});
