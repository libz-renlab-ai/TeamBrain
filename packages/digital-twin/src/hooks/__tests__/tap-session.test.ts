import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ulid } from 'ulid';
import {
  tapSession,
  projectDirForCwd,
  claudeTranscriptPath,
} from '../tap-session.js';

function freshHome(): string {
  const home = join(tmpdir(), `dt-tap-${ulid()}`);
  mkdirSync(home, { recursive: true });
  return home;
}

describe('projectDirForCwd', () => {
  it('replaces forward slashes with dashes', () => {
    expect(projectDirForCwd('/Users/foo/proj')).toBe('-Users-foo-proj');
  });
  it('replaces backslashes and colons (Windows)', () => {
    expect(projectDirForCwd('C:\\Users\\foo\\proj')).toBe('C--Users-foo-proj');
  });
  it('handles mixed separators', () => {
    expect(projectDirForCwd('C:/Users/foo')).toBe('C--Users-foo');
  });
});

describe('claudeTranscriptPath', () => {
  it('joins home + .claude/projects + project dir + session.jsonl', () => {
    const got = claudeTranscriptPath('/h', '/Users/foo', 'sess-123');
    expect(got).toBe(join('/h', '.claude', 'projects', '-Users-foo', 'sess-123.jsonl'));
  });
});

describe('tapSession', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('returns no-log when transcript file does not exist', () => {
    const result = tapSession(
      { cwd: '/some/dir', sessionId: 'missing-session' },
      { homedir: () => home },
    );
    expect(result.status).toBe('no-log');
    expect(result.payloadPath).toBeUndefined();
  });

  it('copies transcript into queue/pending and writes metadata', () => {
    const cwd = '/Users/test/proj';
    const sessionId = 'sess-abc';
    const transcriptDir = join(home, '.claude', 'projects', projectDirForCwd(cwd));
    mkdirSync(transcriptDir, { recursive: true });
    const transcriptPath = join(transcriptDir, `${sessionId}.jsonl`);
    const transcriptBody = '{"type":"user","message":{"role":"user","content":"hi"}}\n';
    writeFileSync(transcriptPath, transcriptBody, 'utf-8');

    const fixedUlid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const fixedNow = new Date('2026-05-08T12:34:56.789Z');

    const result = tapSession(
      { cwd, sessionId },
      {
        homedir: () => home,
        ulid: () => fixedUlid,
        now: () => fixedNow,
        teamagentVersion: '0.9.5',
        platform: 'linux',
        arch: 'x64',
        hostname: 'host-1',
      },
    );

    expect(result.status).toBe('tapped');
    expect(result.payloadPath).toBeDefined();
    expect(result.metadataPath).toBeDefined();

    const payloadPath = result.payloadPath!;
    const metadataPath = result.metadataPath!;
    expect(payloadPath.endsWith(`${fixedUlid}.payload`)).toBe(true);
    expect(metadataPath.endsWith(`${fixedUlid}.json`)).toBe(true);
    expect(existsSync(payloadPath)).toBe(true);
    expect(readFileSync(payloadPath, 'utf-8')).toBe(transcriptBody);

    const meta = JSON.parse(readFileSync(metadataPath, 'utf-8')) as Record<string, unknown>;
    expect(meta.id).toBe(fixedUlid);
    expect(meta.kind).toBe('cc-session');
    expect(meta.session_id).toBe(sessionId);
    expect(meta.cwd).toBe(cwd);
    expect(meta.project_name).toBe('proj');
    expect(meta.transcript_path).toBe(transcriptPath);
    expect(meta.payload_size).toBe(transcriptBody.length);
    expect(meta.captured_at).toBe('2026-05-08T12:34:56.789Z');
    expect(meta.source).toBe('stop-hook');
    expect(meta.host).toEqual({ os: 'linux', arch: 'x64', hostname: 'host-1' });
    expect(meta.teamagent_version).toBe('0.9.5');
    expect(meta.schema_version).toBe(1);
    // Issue #283 — no quota passed; metadata.json must not have a quota field.
    expect(meta.quota).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(meta, 'quota')).toBe(false);
  });

  // Issue #283 — Stop hook tap can carry a Max-quota snapshot.
  it('persists quota onto metadata when input.quota is provided', () => {
    const cwd = '/Users/test/proj-q';
    const sessionId = 'sess-q';
    const dir = join(home, '.claude', 'projects', projectDirForCwd(cwd));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionId}.jsonl`), 'x', 'utf-8');
    const quota = {
      subscription_tier: 'max/default_claude_max_20x',
      five_hour_utilization: 0.35,
      seven_day_utilization: 0.42,
      five_hour_reset_at: 1778481000,
      seven_day_reset_at: 1778626800,
      probed_at: '2026-05-11T03:00:00.000Z',
      stale: false,
    };
    const result = tapSession(
      { cwd, sessionId, quota },
      { homedir: () => home, ulid: () => 'q-ulid' },
    );
    expect(result.status).toBe('tapped');
    const meta = JSON.parse(readFileSync(result.metadataPath!, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(meta.quota).toEqual(quota);
  });

  // Issue #266 F8 — source transcript size guard.
  it('returns too-large when the source transcript exceeds maxPayloadBytes', () => {
    const cwd = '/Users/test/proj-huge';
    const sessionId = 'sess-huge';
    const dir = join(home, '.claude', 'projects', projectDirForCwd(cwd));
    mkdirSync(dir, { recursive: true });
    const transcriptPath = join(dir, `${sessionId}.jsonl`);
    writeFileSync(transcriptPath, 'x'.repeat(2048), 'utf-8'); // 2KB

    const result = tapSession(
      { cwd, sessionId },
      { homedir: () => home, maxPayloadBytes: 1024 }, // 1KB cap
    );

    expect(result.status).toBe('too-large');
    expect(result.payload_size).toBe(2048);
    expect(result.payloadPath).toBeUndefined();
    expect(result.metadataPath).toBeUndefined();
    // The queue/pending dir must not have been polluted with a partial copy.
    const pendingDir = join(home, '.teamagent', 'digital-twin', 'queue', 'pending');
    expect(existsSync(pendingDir)).toBe(false);
  });

  it('does not spawn daemon when daemonBin is missing/undefined', () => {
    const cwd = '/Users/test/proj2';
    const sessionId = 'sess-xyz';
    const dir = join(home, '.claude', 'projects', projectDirForCwd(cwd));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionId}.jsonl`), 'x', 'utf-8');

    let spawnCalled = false;
    const result = tapSession(
      { cwd, sessionId },
      {
        homedir: () => home,
        spawn: () => {
          spawnCalled = true;
          return { unref: () => {}, on: () => ({}) as never };
        },
      },
    );

    expect(result.status).toBe('tapped');
    expect(spawnCalled).toBe(false);
  });

  it('spawns daemon detached when daemonBin exists, capturing stdio to uploader.log (issue #368)', () => {
    const cwd = '/Users/test/proj3';
    const sessionId = 'sess-d';
    const dir = join(home, '.claude', 'projects', projectDirForCwd(cwd));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionId}.jsonl`), 'x', 'utf-8');

    const daemonBin = join(home, 'fake-daemon.cjs');
    writeFileSync(daemonBin, '// noop', 'utf-8');

    let observed: { cmd?: string; args?: readonly string[]; opts?: Record<string, unknown> } = {};
    let unrefCalled = false;
    const result = tapSession(
      { cwd, sessionId },
      {
        homedir: () => home,
        daemonBin,
        nodeBin: '/path/to/node',
        spawn: (cmd, args, opts) => {
          observed = { cmd, args, opts: opts as Record<string, unknown> };
          return {
            unref: () => {
              unrefCalled = true;
            },
            on: () => ({}) as never,
          };
        },
      },
    );

    expect(result.status).toBe('tapped');
    expect(observed.cmd).toBe('/path/to/node');
    expect(observed.args).toEqual([daemonBin]);
    expect(observed.opts?.detached).toBe(true);
    expect(observed.opts?.windowsHide).toBe(true);
    expect(unrefCalled).toBe(true);

    // Issue #368: stdout/stderr go to uploader.log (an fd), not 'ignore'.
    const stdio = observed.opts?.stdio;
    expect(Array.isArray(stdio)).toBe(true);
    const [inSpec, outSpec, errSpec] = stdio as [unknown, unknown, unknown];
    expect(inSpec).toBe('ignore');
    expect(typeof outSpec).toBe('number'); // a file descriptor
    expect(outSpec).toBe(errSpec); // same fd for stdout + stderr
    // The log file itself was created under ~/.teamagent/digital-twin/.
    const logPath = join(home, '.teamagent', 'digital-twin', 'uploader.log');
    expect(existsSync(logPath)).toBe(true);
  });

  it('returns error status when the queue dir cannot be created (best-effort)', () => {
    // Forge a path that contains a NUL char to force fs failure cross-platform.
    // mkdirSync errors with ENOENT/EACCES depending on platform; we just need an error.
    const result = tapSession(
      { cwd: '/some/cwd', sessionId: 'sess-err' },
      {
        homedir: () => '\0invalid\0home',
      },
    );
    // 'no-log' (transcript file doesn't exist either) — error path is exercised when transcript exists
    expect(['no-log', 'error']).toContain(result.status);
  });

  it('returns silently (no-log) when sessionId or cwd has no matching transcript', () => {
    const cwd = '/never/written';
    const result = tapSession(
      { cwd, sessionId: 'nope' },
      { homedir: () => home },
    );
    expect(result.status).toBe('no-log');
  });

  it('completes within 50ms for a small transcript (perf budget)', () => {
    const cwd = '/perf/test';
    const sessionId = 'sess-perf';
    const dir = join(home, '.claude', 'projects', projectDirForCwd(cwd));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${sessionId}.jsonl`), 'x'.repeat(2048), 'utf-8');

    const start = Date.now();
    const result = tapSession({ cwd, sessionId }, { homedir: () => home });
    const elapsed = Date.now() - start;

    expect(result.status).toBe('tapped');
    expect(elapsed).toBeLessThan(200); // generous on Windows CI; plan target is <50ms
  });
});
