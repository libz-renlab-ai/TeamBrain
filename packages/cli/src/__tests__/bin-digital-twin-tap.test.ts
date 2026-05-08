import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ulid } from 'ulid';
import { main } from '../bin-digital-twin-tap.js';
import {
  defaultConfig,
  saveConfig,
  digitalTwinPaths,
  projectDirForCwd,
} from '@teamagent/digital-twin';

function freshHome(): string {
  const home = join(tmpdir(), `dt-tap-bin-${ulid()}`);
  mkdirSync(home, { recursive: true });
  return home;
}

function makeStdinReader(payload: string): () => Promise<string> {
  return async () => payload;
}

function writeTranscript(home: string, cwd: string, sessionId: string, body: string): void {
  const dir = join(home, '.claude', 'projects', projectDirForCwd(cwd));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sessionId}.jsonl`), body, 'utf-8');
}

function enableConfigInHome(home: string): void {
  const cfg = defaultConfig({ user_id: 'u@h', machine_id: 'm-1' });
  cfg.uploader.token = 't';
  saveConfig(cfg, digitalTwinPaths(home).configFile);
}

describe('bin-digital-twin-tap main', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('returns silently when config is missing (digital-twin disabled by default)', async () => {
    const cwd = '/proj/disabled';
    const sessionId = 'sess-1';
    writeTranscript(home, cwd, sessionId, 'x');

    const stdin = makeStdinReader(
      JSON.stringify({ session_id: sessionId, transcript_path: '', cwd }),
    );
    await main(stdin, () => home);

    // No queue dir should exist because tapSession was never called.
    const paths = digitalTwinPaths(home);
    let entries: string[] = [];
    try {
      entries = readdirSync(paths.pendingDir);
    } catch {
      entries = [];
    }
    expect(entries.length).toBe(0);
  });

  it('returns silently when stdin is empty', async () => {
    const cwd = '/proj/empty';
    const sessionId = 'sess-2';
    writeTranscript(home, cwd, sessionId, 'x');
    enableConfigInHome(home);

    await main(makeStdinReader(''), () => home);

    const paths = digitalTwinPaths(home);
    let entries: string[] = [];
    try {
      entries = readdirSync(paths.pendingDir);
    } catch {
      entries = [];
    }
    expect(entries.length).toBe(0);
  });

  it('returns silently when stdin is invalid JSON', async () => {
    const cwd = '/proj/bad';
    const sessionId = 'sess-3';
    writeTranscript(home, cwd, sessionId, 'x');
    enableConfigInHome(home);

    await main(makeStdinReader('not-json'), () => home);

    const paths = digitalTwinPaths(home);
    let entries: string[] = [];
    try {
      entries = readdirSync(paths.pendingDir);
    } catch {
      entries = [];
    }
    expect(entries.length).toBe(0);
  });

  it('taps the session into the queue when config is enabled and transcript exists', async () => {
    const cwd = '/proj/ok';
    const sessionId = 'sess-4';
    writeTranscript(home, cwd, sessionId, 'session-body');
    enableConfigInHome(home);

    const stdin = makeStdinReader(
      JSON.stringify({ session_id: sessionId, transcript_path: '', cwd }),
    );
    await main(stdin, () => home);

    const paths = digitalTwinPaths(home);
    const entries = readdirSync(paths.pendingDir);
    const payloads = entries.filter((e) => e.endsWith('.payload'));
    const metas = entries.filter((e) => e.endsWith('.json'));
    expect(payloads.length).toBe(1);
    expect(metas.length).toBe(1);
  });

  it('stays silent (no queue write) when transcript file does not exist', async () => {
    const cwd = '/proj/missing-transcript';
    const sessionId = 'sess-5';
    enableConfigInHome(home);

    const stdin = makeStdinReader(
      JSON.stringify({ session_id: sessionId, transcript_path: '', cwd }),
    );
    await main(stdin, () => home);

    const paths = digitalTwinPaths(home);
    let entries: string[] = [];
    try {
      entries = readdirSync(paths.pendingDir);
    } catch {
      entries = [];
    }
    expect(entries.length).toBe(0);
  });

  it('rejects payloads missing required fields', async () => {
    const cwd = '/proj/badfields';
    const sessionId = 'sess-6';
    writeTranscript(home, cwd, sessionId, 'x');
    enableConfigInHome(home);

    // Missing session_id
    const stdin = makeStdinReader(JSON.stringify({ transcript_path: '', cwd }));
    await main(stdin, () => home);

    const paths = digitalTwinPaths(home);
    let entries: string[] = [];
    try {
      entries = readdirSync(paths.pendingDir);
    } catch {
      entries = [];
    }
    expect(entries.length).toBe(0);
  });
});
