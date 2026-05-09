import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ulid } from 'ulid';
import {
  acquirePidLock,
  releasePidLock,
  readPidFile,
  isPidAlive,
  runUploadCycle,
  mainLoop,
  type DaemonConfig,
  type CycleSummary,
} from '../process-manager.js';
import { digitalTwinPaths } from '../../paths.js';
import { MAX_FAILURES_BEFORE_DEAD_LETTER } from '../backoff.js';

function freshHome(): string {
  const home = join(tmpdir(), `dt-pm-${ulid()}`);
  mkdirSync(home, { recursive: true });
  return home;
}

const cfg: DaemonConfig = {
  endpoint: 'http://h:8080',
  token: 't',
  user_id: 'u',
  machine_id: 'm',
};

function writeQueueEntry(home: string, id: string): void {
  const paths = digitalTwinPaths(home);
  mkdirSync(paths.pendingDir, { recursive: true });
  writeFileSync(join(paths.pendingDir, `${id}.payload`), 'data', 'utf-8');
  writeFileSync(
    join(paths.pendingDir, `${id}.json`),
    JSON.stringify({
      id,
      kind: 'cc-session',
      session_id: `s-${id}`,
      cwd: '/p',
      project_name: 'p',
      transcript_path: '/x',
      payload_size: 4,
      captured_at: '2026-05-08T00:00:00Z',
      source: 'stop-hook',
      host: { os: 'linux', arch: 'x64', hostname: 'h' },
      teamagent_version: '0.0.0',
      schema_version: 1,
    }),
    'utf-8',
  );
}

describe('isPidAlive', () => {
  it('returns true for the current process', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });
  it('returns false for pid 0 / negative', () => {
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(-1)).toBe(false);
  });
  it('returns false for an absent pid (pid 999999)', () => {
    expect(isPidAlive(999_999_999)).toBe(false);
  });
});

describe('acquirePidLock + releasePidLock', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('writes pid file on first acquire', () => {
    expect(acquirePidLock(home, { pid: 1234, isPidAlive: () => false })).toBe(true);
    const pf = readPidFile(home);
    expect(pf?.pid).toBe(1234);
    expect(typeof pf?.start_at).toBe('string');
  });

  it('rejects acquire when another live daemon owns the lock', () => {
    acquirePidLock(home, { pid: 1234, isPidAlive: () => false });
    const got = acquirePidLock(home, {
      pid: 5678,
      isPidAlive: (p) => p === 1234,
    });
    expect(got).toBe(false);
    const pf = readPidFile(home);
    expect(pf?.pid).toBe(1234);
  });

  it('takes over a stale lock (previous pid is dead)', () => {
    acquirePidLock(home, { pid: 1234, isPidAlive: () => false });
    const got = acquirePidLock(home, { pid: 5678, isPidAlive: () => false });
    expect(got).toBe(true);
    expect(readPidFile(home)?.pid).toBe(5678);
  });

  it('releasePidLock unlinks the pid file', () => {
    acquirePidLock(home, { pid: 1234, isPidAlive: () => false });
    const paths = digitalTwinPaths(home);
    expect(existsSync(paths.daemonPidFile)).toBe(true);
    releasePidLock(home);
    expect(existsSync(paths.daemonPidFile)).toBe(false);
  });
});

describe('runUploadCycle', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('returns scanned=0 when pending is empty', async () => {
    const summary = await runUploadCycle(cfg, home);
    expect(summary.scanned).toBe(0);
    expect(summary.outcomes).toEqual([]);
  });

  it('uploads then removes entry on success', async () => {
    writeQueueEntry(home, 'ok-1');
    const summary = await runUploadCycle(cfg, home, {
      uploader: async () => ({ kind: 'success', status: 200 }),
    });
    expect(summary.outcomes).toEqual([{ id: 'ok-1', outcome: 'uploaded' }]);
    const paths = digitalTwinPaths(home);
    expect(existsSync(join(paths.pendingDir, 'ok-1.payload'))).toBe(false);
  });

  it('keeps entry on transient failure and bumps failure count', async () => {
    writeQueueEntry(home, 'tx-1');
    const failures = new Map<string, number>();
    await runUploadCycle(cfg, home, {
      uploader: async () => ({ kind: 'transient', status: 500 }),
      failures,
    });
    expect(failures.get('tx-1')).toBe(1);
    const paths = digitalTwinPaths(home);
    expect(existsSync(join(paths.pendingDir, 'tx-1.payload'))).toBe(true);
  });

  it('moves to dead-letter after MAX_FAILURES_BEFORE_DEAD_LETTER transient failures', async () => {
    writeQueueEntry(home, 'fail-1');
    const failures = new Map<string, number>([['fail-1', MAX_FAILURES_BEFORE_DEAD_LETTER - 1]]);
    const summary = await runUploadCycle(cfg, home, {
      uploader: async () => ({ kind: 'transient', status: 503 }),
      failures,
    });
    expect(summary.outcomes[0]).toMatchObject({
      id: 'fail-1',
      outcome: 'dead-letter',
      reason: 'too-many-failures',
    });
    const paths = digitalTwinPaths(home);
    expect(existsSync(join(paths.pendingDir, 'fail-1.payload'))).toBe(false);
    expect(existsSync(join(paths.deadLetterDir, 'fail-1.payload'))).toBe(true);
    expect(failures.has('fail-1')).toBe(false);
  });

  it('moves to dead-letter immediately on permanent-failure', async () => {
    writeQueueEntry(home, 'perm-1');
    const summary = await runUploadCycle(cfg, home, {
      uploader: async () => ({ kind: 'permanent-failure', status: 400 }),
    });
    expect(summary.outcomes[0]).toMatchObject({
      id: 'perm-1',
      outcome: 'dead-letter',
      reason: 'permanent-failure',
    });
    const paths = digitalTwinPaths(home);
    expect(existsSync(join(paths.deadLetterDir, 'perm-1.payload'))).toBe(true);
  });

  it('marks summary.authFailed on 401 and stops further uploads in cycle', async () => {
    writeQueueEntry(home, 'a-1');
    writeQueueEntry(home, 'a-2');
    let calls = 0;
    const summary = await runUploadCycle(cfg, home, {
      uploader: async () => {
        calls++;
        return { kind: 'auth-failed', status: 401 };
      },
    });
    expect(summary.authFailed).toBe(true);
    expect(calls).toBe(1);
    expect(summary.outcomes[0]!.outcome).toBe('auth-failed');
  });

  it('moves entry with invalid metadata to dead-letter', async () => {
    const home2 = freshHome();
    const paths = digitalTwinPaths(home2);
    mkdirSync(paths.pendingDir, { recursive: true });
    writeFileSync(join(paths.pendingDir, 'bad.payload'), 'x', 'utf-8');
    writeFileSync(join(paths.pendingDir, 'bad.json'), 'not-json', 'utf-8');
    const summary = await runUploadCycle(cfg, home2);
    expect(summary.outcomes[0]).toEqual({ id: 'bad', outcome: 'invalid-metadata' });
    expect(existsSync(join(paths.deadLetterDir, 'bad.payload'))).toBe(true);
  });
});

describe('mainLoop', () => {
  it('exits with idle reason when pending/ stays empty for idleExitMs', async () => {
    const home = freshHome();
    const summaries: CycleSummary[] = [];
    const result = await mainLoop(cfg, home, {
      sleep: async () => undefined,
      runCycle: async () => ({ scanned: 0, outcomes: [], authFailed: false }),
      onCycle: (s) => summaries.push(s),
      pollIntervalMs: 100,
      idleExitMs: 300, // 3 cycles to idle
    });
    expect(result.reason).toBe('idle');
    expect(summaries.length).toBeGreaterThanOrEqual(3);
  });

  it('exits with auth-failed on 401 from cycle', async () => {
    const home = freshHome();
    const result = await mainLoop(cfg, home, {
      sleep: async () => undefined,
      runCycle: async () => ({
        scanned: 1,
        outcomes: [{ id: 'x', outcome: 'auth-failed' }],
        authFailed: true,
      }),
      pollIntervalMs: 100,
      idleExitMs: 1000,
    });
    expect(result.reason).toBe('auth-failed');
  });

  it('respects shouldStop test hook', async () => {
    const home = freshHome();
    let stop = false;
    let cycles = 0;
    const result = await mainLoop(cfg, home, {
      sleep: async () => undefined,
      runCycle: async () => {
        cycles++;
        if (cycles >= 2) stop = true;
        return { scanned: 1, outcomes: [], authFailed: false };
      },
      shouldStop: () => stop,
      pollIntervalMs: 100,
      idleExitMs: 1000,
    });
    expect(result.reason).toBe('stopped');
    expect(cycles).toBe(2);
  });

  it('resets idle accumulator when work is found', async () => {
    const home = freshHome();
    const sequence = [0, 0, 1, 0, 0, 0, 0]; // scanned counts
    let i = 0;
    const result = await mainLoop(cfg, home, {
      sleep: async () => undefined,
      runCycle: async () => {
        const scanned = sequence[i++] ?? 0;
        return { scanned, outcomes: [], authFailed: false };
      },
      pollIntervalMs: 100,
      idleExitMs: 300, // need 3 consecutive idle cycles
    });
    // After 1 work cycle the accumulator resets, so it takes 3 more idle ticks to exit.
    expect(result.reason).toBe('idle');
  });
});
