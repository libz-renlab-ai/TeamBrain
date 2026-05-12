import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ulid } from 'ulid';
import {
  digitalTwinPaths,
  defaultConfig,
  saveConfig,
  loadConfig,
} from '@teamagent/digital-twin';
import {
  parseDigitalTwinArgs,
  DigitalTwinArgError,
  executeDigitalTwinLogin,
  executeDigitalTwinLogout,
  executeDigitalTwinPause,
  executeDigitalTwinResume,
  executeDigitalTwinStatus,
  executeDigitalTwinInjectMock,
} from '../commands/digital-twin.js';

function freshHome(): string {
  const home = join(tmpdir(), `dt-cli-${ulid()}`);
  mkdirSync(home, { recursive: true });
  return home;
}

function captureOutput() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    print: (m: string) => out.push(m),
    printErr: (m: string) => err.push(m),
  };
}

describe('parseDigitalTwinArgs', () => {
  it('rejects empty subcommand', () => {
    expect(() => parseDigitalTwinArgs([])).toThrow(DigitalTwinArgError);
  });

  it('rejects unknown subcommand', () => {
    expect(() => parseDigitalTwinArgs(['ohai'])).toThrow(DigitalTwinArgError);
  });

  it('parses login with token', () => {
    const r = parseDigitalTwinArgs(['login', 'tok-abc']);
    expect(r).toEqual({ sub: 'login', token: 'tok-abc' });
  });

  it('rejects login without token', () => {
    expect(() => parseDigitalTwinArgs(['login'])).toThrow(DigitalTwinArgError);
  });

  it('parses logout/status/pause/resume', () => {
    expect(parseDigitalTwinArgs(['logout'])).toEqual({ sub: 'logout' });
    expect(parseDigitalTwinArgs(['status'])).toEqual({ sub: 'status' });
    expect(parseDigitalTwinArgs(['pause'])).toEqual({ sub: 'pause' });
    expect(parseDigitalTwinArgs(['resume'])).toEqual({ sub: 'resume' });
  });

  it('parses inject-mock without flags', () => {
    expect(parseDigitalTwinArgs(['inject-mock'])).toEqual({ sub: 'inject-mock' });
  });

  it('parses inject-mock with --cwd and --session-id (both forms)', () => {
    expect(
      parseDigitalTwinArgs([
        'inject-mock',
        '--cwd',
        '/tmp/probe',
        '--session-id',
        'sess-1',
      ]),
    ).toEqual({ sub: 'inject-mock', cwd: '/tmp/probe', sessionId: 'sess-1' });
    expect(
      parseDigitalTwinArgs([
        'inject-mock',
        '--cwd=/tmp/probe',
        '--session-id=sess-2',
      ]),
    ).toEqual({ sub: 'inject-mock', cwd: '/tmp/probe', sessionId: 'sess-2' });
  });
});

describe('executeDigitalTwinInjectMock', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('writes a fake jsonl into ~/.claude/projects/<dir>/<sid>.jsonl, calls tapSession, prints payload path on success', () => {
    const c = captureOutput();
    let receivedInput: { cwd: string; sessionId: string } | null = null;
    const r = executeDigitalTwinInjectMock(
      { sub: 'inject-mock', cwd: '/tmp/probe-cwd', sessionId: 'sess-injmock' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        tapSession: (input) => {
          receivedInput = { cwd: input.cwd, sessionId: input.sessionId };
          return { status: 'tapped', payloadPath: '/q/sess.payload' };
        },
      },
    );
    expect(r.exitCode).toBe(0);
    expect(receivedInput).not.toBeNull();
    expect(receivedInput!.cwd).toBe('/tmp/probe-cwd');
    expect(receivedInput!.sessionId).toBe('sess-injmock');
    expect(c.out.join('\n')).toContain('digital-twin: injected mock transcript');
    expect(c.out.join('\n')).toContain('sess-injmock');
    expect(c.out.join('\n')).toContain('/q/sess.payload');
  });

  it('uses ulid()-generated sessionId when --session-id not provided', () => {
    const c = captureOutput();
    let received = '';
    executeDigitalTwinInjectMock(
      { sub: 'inject-mock', cwd: '/tmp/probe' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        ulid: () => 'GENERATED01',
        tapSession: (input) => {
          received = input.sessionId;
          return { status: 'tapped', payloadPath: '/q/p' };
        },
      },
    );
    expect(received).toBe('GENERATED01');
  });

  it('exits 1 when tapSession reports non-tapped status', () => {
    const c = captureOutput();
    const r = executeDigitalTwinInjectMock(
      { sub: 'inject-mock', cwd: '/tmp/probe', sessionId: 'sess-x' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        tapSession: () => ({ status: 'no-log' }),
      },
    );
    expect(r.exitCode).toBe(1);
    expect(c.err.join('\n')).toContain('status=no-log');
  });
});

describe('executeDigitalTwinLogin', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('creates a fresh config when none exists, sets token, prints endpoint', () => {
    const c = captureOutput();
    const result = executeDigitalTwinLogin('tok-1', {
      homedir: () => home,
      print: c.print,
      printErr: c.printErr,
      getUserId: () => 'alice@laptop',
      getMachineId: () => 'machine-xyz',
    });
    expect(result.exitCode).toBe(0);
    const cfg = loadConfig(digitalTwinPaths(home).configFile);
    expect(cfg).not.toBeNull();
    expect(cfg!.uploader.token).toBe('tok-1');
    expect(cfg!.identity.user_id).toBe('alice@laptop');
    expect(cfg!.identity.machine_id).toBe('machine-xyz');
    expect(c.out.join('\n')).toContain('digital-twin: token saved');
    expect(c.out.join('\n')).toContain(cfg!.uploader.endpoint);
  });

  it('updates only the token when config already exists', () => {
    const cfg = defaultConfig({ user_id: 'preserved@host', machine_id: 'pm-1' });
    cfg.uploader.endpoint = 'http://kept-endpoint:9999';
    cfg.uploader.token = 'old-token';
    saveConfig(cfg, digitalTwinPaths(home).configFile);

    const c = captureOutput();
    const result = executeDigitalTwinLogin('new-token', {
      homedir: () => home,
      print: c.print,
      printErr: c.printErr,
    });
    expect(result.exitCode).toBe(0);
    const updated = loadConfig(digitalTwinPaths(home).configFile)!;
    expect(updated.uploader.token).toBe('new-token');
    expect(updated.identity.user_id).toBe('preserved@host');
    expect(updated.identity.machine_id).toBe('pm-1');
    expect(updated.uploader.endpoint).toBe('http://kept-endpoint:9999');
  });
});

describe('executeDigitalTwinLogout', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('prints "not configured" when config missing and exits 0', () => {
    const c = captureOutput();
    const r = executeDigitalTwinLogout({ homedir: () => home, print: c.print });
    expect(r.exitCode).toBe(0);
    expect(c.out.join('\n')).toContain('not configured');
  });

  it('clears the token to null when config exists', () => {
    const cfg = defaultConfig({ user_id: 'u', machine_id: 'm' });
    cfg.uploader.token = 'something';
    saveConfig(cfg, digitalTwinPaths(home).configFile);

    const c = captureOutput();
    const r = executeDigitalTwinLogout({ homedir: () => home, print: c.print });
    expect(r.exitCode).toBe(0);
    const updated = loadConfig(digitalTwinPaths(home).configFile)!;
    expect(updated.uploader.token).toBeNull();
    expect(c.out.join('\n')).toContain('logged out');
  });
});

describe('executeDigitalTwinPause / executeDigitalTwinResume', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('pause errors when no config (exit 1, message to stderr)', () => {
    const c = captureOutput();
    const r = executeDigitalTwinPause({
      homedir: () => home,
      print: c.print,
      printErr: c.printErr,
    });
    expect(r.exitCode).toBe(1);
    expect(c.err.join('\n')).toContain('not configured');
  });

  it('resume errors when no config (exit 1, message to stderr)', () => {
    const c = captureOutput();
    const r = executeDigitalTwinResume({
      homedir: () => home,
      print: c.print,
      printErr: c.printErr,
    });
    expect(r.exitCode).toBe(1);
    expect(c.err.join('\n')).toContain('not configured');
  });

  it('pause sets enabled=false; resume restores enabled=true', () => {
    const cfg = defaultConfig({ user_id: 'u', machine_id: 'm' });
    cfg.uploader.token = 't';
    saveConfig(cfg, digitalTwinPaths(home).configFile);

    const c1 = captureOutput();
    const pauseResult = executeDigitalTwinPause({
      homedir: () => home,
      print: c1.print,
      printErr: c1.printErr,
    });
    expect(pauseResult.exitCode).toBe(0);
    expect(loadConfig(digitalTwinPaths(home).configFile)!.uploader.enabled).toBe(false);
    expect(c1.out.join('\n')).toContain('paused');

    const c2 = captureOutput();
    const resumeResult = executeDigitalTwinResume({
      homedir: () => home,
      print: c2.print,
      printErr: c2.printErr,
    });
    expect(resumeResult.exitCode).toBe(0);
    expect(loadConfig(digitalTwinPaths(home).configFile)!.uploader.enabled).toBe(true);
    expect(c2.out.join('\n')).toContain('resumed');
  });
});

describe('executeDigitalTwinStatus', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('prints "not configured" when no config and exits 0', () => {
    const c = captureOutput();
    const r = executeDigitalTwinStatus({ homedir: () => home, print: c.print });
    expect(r.exitCode).toBe(0);
    const joined = c.out.join('\n');
    expect(joined).toContain('not configured');
    expect(joined).toContain('teamagent digital-twin login');
  });

  it('prints multi-line status with config + queue + daemon info', () => {
    const cfg = defaultConfig({ user_id: 'alice@host', machine_id: 'm-abc' });
    cfg.uploader.token = 'tok';
    saveConfig(cfg, digitalTwinPaths(home).configFile);

    // create a pending entry
    const paths = digitalTwinPaths(home);
    mkdirSync(paths.pendingDir, { recursive: true });
    writeFileSync(join(paths.pendingDir, 'q1.payload'), 'payload-bytes', 'utf-8');
    writeFileSync(
      join(paths.pendingDir, 'q1.json'),
      JSON.stringify({
        kind: 'cc-session',
        rule_set: 'cc-session/v1',
        ulid: 'q1',
        user_id: 'alice@host',
        machine_id: 'm-abc',
        cwd: '/tmp/cwd',
        session_id: 'sess-1',
        captured_at: '2026-05-08T12:00:00Z',
        encoding: 'gzip+base64',
        sha256: 'abc',
        size: 1,
      }),
      'utf-8',
    );

    // create one dead-letter entry
    mkdirSync(paths.deadLetterDir, { recursive: true });
    writeFileSync(join(paths.deadLetterDir, 'd1.payload'), 'p', 'utf-8');
    writeFileSync(join(paths.deadLetterDir, 'd1.json'), '{}', 'utf-8');

    // simulate a pid file (alive=yes via injected liveness fn)
    mkdirSync(paths.digitalTwinDir, { recursive: true });
    writeFileSync(
      paths.daemonPidFile,
      JSON.stringify({ pid: 12345, start_at: '2026-05-08T11:30:00Z' }),
      'utf-8',
    );

    const c = captureOutput();
    const r = executeDigitalTwinStatus({
      homedir: () => home,
      print: c.print,
      isPidAlive: (pid) => pid === 12345,
    });
    expect(r.exitCode).toBe(0);
    const joined = c.out.join('\n');
    expect(joined).toContain('digital-twin status');
    expect(joined).toContain('config:');
    expect(joined).toContain(paths.configFile);
    expect(joined).toContain('enabled:');
    expect(joined).toContain('endpoint:');
    expect(joined).toContain('user_id:');
    expect(joined).toContain('alice@host');
    expect(joined).toContain('machine_id:');
    expect(joined).toContain('m-abc');
    expect(joined).toContain('[redacted]'); // token never printed
    expect(joined).not.toContain('tok\n'); // raw token never appears
    expect(joined).toContain('pending:     1');
    expect(joined).toContain('dead-letter: 1');
    expect(joined).toContain('pid:        12345');
    expect(joined).toContain('started_at: 2026-05-08T11:30:00Z');
    expect(joined).toContain('alive:      yes');
    // Issue #368 — uploader log section, no error in this scenario.
    expect(joined).toContain('uploader log:');
    expect(joined).toContain(paths.uploaderLogFile);
    expect(joined).toContain('last_error: (none)');
  });

  // Issue #368 — a broken upload pipeline must be visible in `status`.
  it('surfaces the last uploader.log error line in status', () => {
    const cfg = defaultConfig({ user_id: 'u', machine_id: 'm' });
    cfg.uploader.token = 't';
    saveConfig(cfg, digitalTwinPaths(home).configFile);
    const paths = digitalTwinPaths(home);
    mkdirSync(paths.digitalTwinDir, { recursive: true });
    writeFileSync(
      paths.uploaderLogFile,
      ['digital-twin: daemon exiting (idle)', "Error: Cannot find module 'ulid' [MODULE_NOT_FOUND]"].join('\n'),
      'utf-8',
    );
    const c = captureOutput();
    const r = executeDigitalTwinStatus({ homedir: () => home, print: c.print });
    expect(r.exitCode).toBe(0);
    const joined = c.out.join('\n');
    expect(joined).toContain('uploader log:');
    expect(joined).toMatch(/last_error: .*MODULE_NOT_FOUND.* \(line 2\)/);
  });

  it('reports daemon as none + alive=no when pid file is absent', () => {
    const cfg = defaultConfig({ user_id: 'u', machine_id: 'm' });
    cfg.uploader.token = 't';
    saveConfig(cfg, digitalTwinPaths(home).configFile);

    const c = captureOutput();
    const r = executeDigitalTwinStatus({ homedir: () => home, print: c.print });
    expect(r.exitCode).toBe(0);
    const joined = c.out.join('\n');
    expect(joined).toContain('pid:        (none)');
    expect(joined).toContain('alive:      no');
  });

  it('reports alive=no when pid file is present but process is dead', () => {
    const cfg = defaultConfig({ user_id: 'u', machine_id: 'm' });
    cfg.uploader.token = 't';
    saveConfig(cfg, digitalTwinPaths(home).configFile);

    const paths = digitalTwinPaths(home);
    mkdirSync(paths.digitalTwinDir, { recursive: true });
    writeFileSync(
      paths.daemonPidFile,
      JSON.stringify({ pid: 99999, start_at: '2026-05-08T11:30:00Z' }),
      'utf-8',
    );

    const c = captureOutput();
    const r = executeDigitalTwinStatus({
      homedir: () => home,
      print: c.print,
      isPidAlive: () => false,
    });
    expect(r.exitCode).toBe(0);
    const joined = c.out.join('\n');
    expect(joined).toContain('pid:        99999');
    expect(joined).toContain('alive:      no');
  });
});

describe('config file is not corrupted by login twice', () => {
  it('a write+rewrite pair leaves a single valid JSON object on disk', () => {
    const home = freshHome();
    const c1 = captureOutput();
    executeDigitalTwinLogin('first-token', {
      homedir: () => home,
      print: c1.print,
      printErr: c1.printErr,
      getUserId: () => 'u@h',
      getMachineId: () => 'm-1',
    });
    const c2 = captureOutput();
    executeDigitalTwinLogin('second-token', {
      homedir: () => home,
      print: c2.print,
      printErr: c2.printErr,
      getUserId: () => 'u@h',
      getMachineId: () => 'm-1',
    });
    const cfgPath = digitalTwinPaths(home).configFile;
    expect(existsSync(cfgPath)).toBe(true);
    const raw = readFileSync(cfgPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.uploader.token).toBe('second-token');
  });
});
