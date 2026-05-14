// BPP transcript-purge cron — bin-level tests.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §6.1
// (30-day transcript retention) + §6.2.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { runPurgeCron } from '../../bin-purge-cron.js';

function touch(file: string, content = '{}\n'): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

const BIN_PATH = resolvePath(
  __dirname,
  '..',
  '..',
  'bin-purge-cron.ts',
);

function findTsx(): string | null {
  // Walk up from the test file looking for node_modules/.bin/tsx (or .CMD on Windows).
  const candidates = [
    resolvePath(__dirname, '..', '..', '..', '..', '..', 'node_modules', '.bin'),
    resolvePath(__dirname, '..', '..', '..', '..', 'node_modules', '.bin'),
    resolvePath(__dirname, '..', '..', '..', 'node_modules', '.bin'),
  ];
  for (const dir of candidates) {
    for (const name of ['tsx.CMD', 'tsx.cmd', 'tsx']) {
      const p = join(dir, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

describe('runPurgeCron (exported)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'bpp-purge-cron-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('throws when BPP_OUTPUT_DIR is unset', () => {
    expect(() => runPurgeCron({ env: {} as NodeJS.ProcessEnv })).toThrow(
      /BPP_OUTPUT_DIR is required/,
    );
  });

  it('defaults retain_days to 30 and reports it in result', () => {
    const out: string[] = [];
    const result = runPurgeCron({
      env: { BPP_OUTPUT_DIR: root } as NodeJS.ProcessEnv,
      now: () => new Date('2026-05-13T00:00:00Z'),
      stdout: (l) => out.push(l),
    });
    expect(result.retainDays).toBe(30);
    expect(result.rootDir).toBe(resolvePath(root));
    // No files → empty purge.
    expect(result.purged_files).toBe(0);
    expect(result.purged_users).toEqual([]);
    // stdout is exactly one JSON line.
    expect(out).toHaveLength(1);
    const parsed = JSON.parse(out[0]!);
    expect(parsed).toEqual({ purged_files: 0, purged_users: [] });
  });

  it('rejects malformed BPP_RETAIN_DAYS', () => {
    expect(() =>
      runPurgeCron({
        env: { BPP_OUTPUT_DIR: root, BPP_RETAIN_DAYS: 'forever' } as NodeJS.ProcessEnv,
      }),
    ).toThrow(/invalid BPP_RETAIN_DAYS/);
    expect(() =>
      runPurgeCron({
        env: { BPP_OUTPUT_DIR: root, BPP_RETAIN_DAYS: '-1' } as NodeJS.ProcessEnv,
      }),
    ).toThrow(/invalid BPP_RETAIN_DAYS/);
  });

  it('purges stale transcripts and prints JSON summary to stdout', () => {
    touch(join(root, 'alice@team.com', '2026-03-01', 'sess-1.jsonl'));
    touch(join(root, 'alice@team.com', '2026-03-01', 'sess-1.cc-status.jsonl'));
    touch(join(root, 'bob@team.com', '2026-05-12', 'sess-keep.jsonl'));

    const out: string[] = [];
    const result = runPurgeCron({
      env: {
        BPP_OUTPUT_DIR: root,
        BPP_RETAIN_DAYS: '30',
      } as NodeJS.ProcessEnv,
      now: () => new Date('2026-05-13T00:00:00Z'),
      stdout: (l) => out.push(l),
    });

    expect(result.purged_files).toBe(2);
    expect(result.purged_users).toEqual(['alice@team.com']);
    expect(existsSync(join(root, 'alice@team.com', '2026-03-01', 'sess-1.jsonl'))).toBe(
      false,
    );
    expect(existsSync(join(root, 'bob@team.com', '2026-05-12', 'sess-keep.jsonl'))).toBe(
      true,
    );

    expect(out).toHaveLength(1);
    const parsed = JSON.parse(out[0]!);
    expect(parsed.purged_files).toBe(2);
    expect(parsed.purged_users).toEqual(['alice@team.com']);
  });

  it('writes an audit-log line when _audit/ exists', () => {
    // Pre-create _audit/ (simulating a receiver process having run before).
    mkdirSync(join(root, '_audit'), { recursive: true });
    touch(join(root, 'carol@team.com', '2026-01-01', 'old.jsonl'));

    const result = runPurgeCron({
      env: { BPP_OUTPUT_DIR: root } as NodeJS.ProcessEnv,
      now: () => new Date('2026-05-13T04:30:00Z'),
      stdout: () => {},
    });

    expect(result.auditWritten).toBe(true);
    const auditFile = join(root, '_audit', '2026-05-13.jsonl');
    expect(existsSync(auditFile)).toBe(true);
    const lines = readFileSync(auditFile, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      type: 'purge_cron',
      purged_files: 1,
      purged_users: ['carol@team.com'],
      retain_days: 30,
    });
    expect(entry.timestamp).toBe('2026-05-13T04:30:00.000Z');
  });

  it('skips audit-log when _audit/ does NOT exist (receiver never ran)', () => {
    touch(join(root, 'dan@team.com', '2026-01-01', 'old.jsonl'));
    const result = runPurgeCron({
      env: { BPP_OUTPUT_DIR: root } as NodeJS.ProcessEnv,
      now: () => new Date('2026-05-13T00:00:00Z'),
      stdout: () => {},
    });
    expect(result.purged_files).toBe(1);
    expect(result.auditWritten).toBe(false);
    expect(existsSync(join(root, '_audit'))).toBe(false);
  });
});

describe('bin-purge-cron (subprocess)', () => {
  const tsx = findTsx();

  it.skipIf(!tsx)('runs as a tsx subprocess, exits 0, prints JSON to stdout', () => {
    const root = mkdtempSync(join(tmpdir(), 'bpp-purge-cron-sp-'));
    try {
      mkdirSync(join(root, '_audit'), { recursive: true });
      touch(join(root, 'eve@team.com', '2025-12-01', 'ancient.jsonl'));

      const proc = spawnSync(tsx!, [BIN_PATH], {
        env: {
          ...process.env,
          BPP_OUTPUT_DIR: root,
          BPP_RETAIN_DAYS: '30',
        },
        encoding: 'utf8',
        timeout: 20000,
        // Windows: tsx.CMD requires shell to be invoked correctly. Absolute
        // path + shell:true works on both POSIX and Windows.
        shell: true,
      });

      expect(proc.status).toBe(0);
      const stdout = proc.stdout.trim();
      // Last line is the JSON summary.
      const last = stdout.split('\n').filter(Boolean).pop()!;
      const parsed = JSON.parse(last);
      expect(parsed.purged_files).toBeGreaterThanOrEqual(1);
      expect(parsed.purged_users).toContain('eve@team.com');

      // Audit dir existed → exactly one audit line should be written.
      const today = new Date().toISOString().slice(0, 10);
      const auditFile = join(root, '_audit', `${today}.jsonl`);
      expect(existsSync(auditFile)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(!tsx)('fails with non-zero exit when BPP_OUTPUT_DIR is unset', () => {
    const env = { ...process.env };
    delete env.BPP_OUTPUT_DIR;
    const proc = spawnSync(tsx!, [BIN_PATH], {
      env,
      encoding: 'utf8',
      timeout: 20000,
      shell: true,
    });
    expect(proc.status).not.toBe(0);
    expect(proc.stderr).toMatch(/BPP_OUTPUT_DIR is required/);
  });
});
