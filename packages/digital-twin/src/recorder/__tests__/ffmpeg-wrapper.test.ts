import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ulid } from 'ulid';
import {
  start,
  stop,
  importRecording,
  RECORDING_CODEC_FLAGS,
  type StartDeps,
  type StopDeps,
  type ImportDeps,
} from '../ffmpeg-wrapper.js';
import {
  resolvePlatformInput,
  listAudioDevicesArgs,
  listAudioDevices,
} from '../platform-input.js';

function freshTmp(): string {
  const dir = join(tmpdir(), `dt-rec-${ulid()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeFakeChild(pid: number) {
  return {
    pid,
    unref: () => {},
    on: () => ({}) as never,
  };
}

describe('RECORDING_CODEC_FLAGS', () => {
  it('locks in opus 24k mono 16kHz', () => {
    expect(RECORDING_CODEC_FLAGS).toEqual([
      '-vn',
      '-c:a',
      'libopus',
      '-b:a',
      '24k',
      '-ar',
      '16000',
      '-ac',
      '1',
    ]);
  });

  it('is read-only / frozen', () => {
    expect(Object.isFrozen(RECORDING_CODEC_FLAGS)).toBe(true);
  });
});

describe('resolvePlatformInput', () => {
  it('returns avfoundation :0 on darwin', () => {
    const got = resolvePlatformInput({ platform: 'darwin' });
    expect(got.format).toBe('avfoundation');
    expect(got.device).toBe(':0');
  });

  it('returns dshow audio=Microphone on win32 (#297 — was virtual-audio-capturer)', () => {
    const got = resolvePlatformInput({ platform: 'win32' });
    expect(got.format).toBe('dshow');
    expect(got.device).toBe('audio=Microphone');
  });

  it('NEVER defaults to virtual-audio-capturer on win32 (regression guard for #297)', () => {
    const got = resolvePlatformInput({ platform: 'win32' });
    expect(got.device).not.toBe('audio=virtual-audio-capturer');
  });

  it('returns pulse default on linux', () => {
    const got = resolvePlatformInput({ platform: 'linux' });
    expect(got.format).toBe('pulse');
    expect(got.device).toBe('default');
  });

  it('honors deviceArg override', () => {
    const got = resolvePlatformInput({ platform: 'darwin', deviceArg: ':1' });
    expect(got.device).toBe(':1');
  });

  it('throws on unsupported platform', () => {
    expect(() => resolvePlatformInput({ platform: 'aix' as NodeJS.Platform })).toThrow(
      /unsupported platform/i,
    );
  });
});

describe('listAudioDevicesArgs (issue #297)', () => {
  it('darwin uses avfoundation -list_devices', () => {
    expect(listAudioDevicesArgs('darwin')).toEqual([
      '-f', 'avfoundation', '-list_devices', 'true', '-i', '',
    ]);
  });

  it('win32 uses dshow -list_devices', () => {
    expect(listAudioDevicesArgs('win32')).toEqual([
      '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy',
    ]);
  });

  it('linux uses pulse -sources', () => {
    expect(listAudioDevicesArgs('linux')).toEqual(['-sources', 'pulse']);
  });

  it('throws on unsupported platform', () => {
    expect(() =>
      listAudioDevicesArgs('aix' as NodeJS.Platform),
    ).toThrow(/unsupported platform/i);
  });
});

describe('listAudioDevices (issue #297)', () => {
  it('returns stderr as raw, captures exit code, echoes argv', () => {
    const r = listAudioDevices({
      platform: 'win32',
      spawnSync: () => ({
        status: 1,
        stderr: '[dshow] DirectShow audio devices\n[dshow]  "Microphone"',
        stdout: null,
      }),
    });
    expect(r.raw).toContain('Microphone');
    expect(r.exitCode).toBe(1);
    expect(r.argv).toEqual(['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
  });

  it('falls back to stdout when stderr is empty', () => {
    const r = listAudioDevices({
      platform: 'linux',
      spawnSync: () => ({
        status: 0,
        stderr: null,
        stdout: 'pulse sources: alsa_input.pci-0000_00_1f.3.analog-stereo',
      }),
    });
    expect(r.raw).toContain('alsa_input');
  });

  it('handles Buffer stderr from real spawnSync', () => {
    const r = listAudioDevices({
      platform: 'darwin',
      spawnSync: () => ({
        status: 1,
        stderr: Buffer.from('[AVFoundation devices]\n[0] Built-in Microphone'),
        stdout: Buffer.from(''),
      }),
    });
    expect(r.raw).toContain('Built-in Microphone');
  });
});

describe('start()', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = freshTmp();
  });

  it('throws with install hint when ffmpeg is missing (darwin)', () => {
    const deps: StartDeps = {
      detectFfmpeg: () => ({ available: false }),
      platform: 'darwin',
    };
    expect(() =>
      start({ id: 'rec-1', output: join(tmp, 'rec') }, deps),
    ).toThrow(/brew install ffmpeg/i);
  });

  it('throws with install hint when ffmpeg is missing (win32)', () => {
    const deps: StartDeps = {
      detectFfmpeg: () => ({ available: false }),
      platform: 'win32',
    };
    expect(() =>
      start({ id: 'rec-1', output: join(tmp, 'rec') }, deps),
    ).toThrow(/scoop install ffmpeg|ffmpeg\.org/i);
  });

  it('throws with install hint when ffmpeg is missing (linux)', () => {
    const deps: StartDeps = {
      detectFfmpeg: () => ({ available: false }),
      platform: 'linux',
    };
    expect(() =>
      start({ id: 'rec-1', output: join(tmp, 'rec') }, deps),
    ).toThrow(/apt-get install ffmpeg|dnf install ffmpeg/i);
  });

  it('spawns ffmpeg detached with correct argv and writes pid file', () => {
    let observed: { cmd?: string; args?: readonly string[]; opts?: Record<string, unknown> } = {};
    const child = makeFakeChild(4242);
    const deps: StartDeps = {
      detectFfmpeg: () => ({ available: true, version: '6.1.1' }),
      platform: 'linux',
      spawn: (cmd, args, opts) => {
        observed = { cmd, args, opts: opts as Record<string, unknown> };
        return child;
      },
    };

    const output = join(tmp, 'rec-out');
    const result = start({ id: 'rec-abc', output }, deps);

    expect(result.id).toBe('rec-abc');
    expect(result.pid).toBe(4242);
    expect(result.output).toBe(`${output}.ogg`);

    expect(observed.cmd).toBe('ffmpeg');
    expect(observed.args).toContain('-y');
    expect(observed.args).toContain('-f');
    expect(observed.args).toContain('pulse');
    expect(observed.args).toContain('-i');
    expect(observed.args).toContain('default');
    // codec flags must be present
    for (const flag of RECORDING_CODEC_FLAGS) {
      expect(observed.args).toContain(flag);
    }
    // output ends with .ogg
    expect(observed.args?.[observed.args.length - 1]).toBe(`${output}.ogg`);
    expect(observed.opts?.detached).toBe(true);
    expect(observed.opts?.stdio).toBe('ignore');
    expect(observed.opts?.windowsHide).toBe(true);

    // pid file exists with the pid
    const pidFile = `${output}.pid`;
    expect(existsSync(pidFile)).toBe(true);
    expect(readFileSync(pidFile, 'utf-8').trim()).toBe('4242');

    // started_at metadata sidecar should also exist (so stop() can compute duration)
    const startMetaFile = `${output}.start.json`;
    expect(existsSync(startMetaFile)).toBe(true);
    const startMeta = JSON.parse(readFileSync(startMetaFile, 'utf-8'));
    expect(startMeta.id).toBe('rec-abc');
    expect(typeof startMeta.started_at).toBe('string');
  });

  it('honors deviceArg override on darwin', () => {
    let observed: { args?: readonly string[] } = {};
    const child = makeFakeChild(99);
    const deps: StartDeps = {
      detectFfmpeg: () => ({ available: true, version: '6.0' }),
      platform: 'darwin',
      spawn: (_cmd, args) => {
        observed = { args };
        return child;
      },
    };
    start(
      { id: 'rec-d', output: join(tmp, 'd'), deviceArg: ':2' },
      deps,
    );
    expect(observed.args).toContain('avfoundation');
    expect(observed.args).toContain(':2');
  });

  it('throws when spawn returns no pid', () => {
    const deps: StartDeps = {
      detectFfmpeg: () => ({ available: true, version: '6.0' }),
      platform: 'linux',
      spawn: () => ({ pid: undefined, unref: () => {}, on: () => ({}) as never }),
    };
    expect(() =>
      start({ id: 'rec-x', output: join(tmp, 'x') }, deps),
    ).toThrow(/failed to spawn ffmpeg/i);
  });
});

describe('stop()', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = freshTmp();
  });

  it('reads pid file, sends SIGTERM, polls for exit, moves OGG into pending/ (issue #146 F3)', () => {
    const output = join(tmp, 'rec-stop');
    const oggPath = `${output}.ogg`;
    writeFileSync(`${output}.pid`, '5555', 'utf-8');
    writeFileSync(
      `${output}.start.json`,
      JSON.stringify({ id: 'rec-stop', started_at: '2026-05-08T12:00:00.000Z' }),
      'utf-8',
    );
    // Simulate ffmpeg already wrote a (mock) OGG file.
    writeFileSync(oggPath, Buffer.from('OggS-fakeogg-bytes'));

    let killCalled: { pid?: number; signal?: NodeJS.Signals | number } = {};
    let aliveCalls = 0;
    const home = freshTmp();

    const deps: StopDeps = {
      kill: (pid, signal) => {
        killCalled = { pid, signal };
        return true;
      },
      isAlive: () => {
        aliveCalls += 1;
        return aliveCalls < 2; // alive once, then dead
      },
      sleep: () => Promise.resolve(),
      now: () => new Date('2026-05-08T12:00:05.000Z'),
      homedir: () => home,
      ulid: () => '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      platform: 'linux',
      teamagentVersion: '0.9.5',
      arch: 'x64',
      hostname: 'host-1',
    };

    return stop({ id: 'rec-stop', output }, deps).then((result) => {
      expect(result.status).toBe('stopped');
      expect(killCalled.pid).toBe(5555);
      expect(killCalled.signal).toBe('SIGTERM');
      expect(aliveCalls).toBeGreaterThanOrEqual(2);

      // Issue #146 F3: OGG moves into pending/ (was recording_temp/) so
      // the daemon's listPending picks it up alongside cc-sessions.
      const pendingDir = join(
        home,
        '.teamagent',
        'digital-twin',
        'queue',
        'pending',
      );
      const payloadPath = join(pendingDir, '01ARZ3NDEKTSV4RRFFQ69G5FAV.payload');
      const metadataPath = join(pendingDir, '01ARZ3NDEKTSV4RRFFQ69G5FAV.json');
      expect(existsSync(payloadPath)).toBe(true);
      expect(existsSync(metadataPath)).toBe(true);
      expect(result.payloadPath).toBe(payloadPath);
      expect(result.metadataPath).toBe(metadataPath);

      const meta = JSON.parse(readFileSync(metadataPath, 'utf-8'));
      expect(meta.id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
      expect(meta.kind).toBe('recording');
      expect(meta.codec).toBe('opus');
      expect(meta.bitrate).toBe(24000);
      expect(meta.sample_rate).toBe(16000);
      expect(meta.channels).toBe(1);
      expect(meta.container).toBe('ogg');
      expect(meta.started_at).toBe('2026-05-08T12:00:00.000Z');
      expect(meta.ended_at).toBe('2026-05-08T12:00:05.000Z');
      expect(meta.duration_ms).toBe(5000);
      expect(meta.payload_size).toBeGreaterThan(0);
      expect(meta.source).toBe('recorder');
      expect(meta.schema_version).toBe(1);

      // original temp files cleaned up
      expect(existsSync(`${output}.pid`)).toBe(false);
      expect(existsSync(`${output}.start.json`)).toBe(false);
      expect(existsSync(oggPath)).toBe(false);
    });
  });

  it('returns timeout when ffmpeg never dies within budget', async () => {
    const output = join(tmp, 'rec-timeout');
    writeFileSync(`${output}.pid`, '7777', 'utf-8');
    writeFileSync(
      `${output}.start.json`,
      JSON.stringify({ id: 'rec-timeout', started_at: '2026-05-08T12:00:00.000Z' }),
      'utf-8',
    );
    writeFileSync(`${output}.ogg`, Buffer.from('partial-ogg'));

    const home = freshTmp();
    const deps: StopDeps = {
      kill: () => true,
      isAlive: () => true, // never dies
      sleep: () => Promise.resolve(),
      now: () => new Date('2026-05-08T12:00:00.000Z'),
      homedir: () => home,
      ulid: () => 'rec-ulid-2',
      platform: 'linux',
      maxWaitMs: 100,
      pollIntervalMs: 10,
    };

    const result = await stop({ id: 'rec-timeout', output }, deps);
    expect(result.status).toBe('timeout');
  });

  it('falls back to taskkill spawn on win32 when process.kill fails', async () => {
    const output = join(tmp, 'rec-win');
    writeFileSync(`${output}.pid`, '1234', 'utf-8');
    writeFileSync(
      `${output}.start.json`,
      JSON.stringify({ id: 'rec-win', started_at: '2026-05-08T12:00:00.000Z' }),
      'utf-8',
    );
    writeFileSync(`${output}.ogg`, Buffer.from('OggS-win'));

    let taskkillCalled: { cmd?: string; args?: readonly string[] } = {};
    const home = freshTmp();

    const deps: StopDeps = {
      kill: () => {
        throw new Error('EPERM on windows');
      },
      spawn: (cmd, args) => {
        taskkillCalled = { cmd, args };
        return { pid: 1, unref: () => {}, on: () => ({}) as never };
      },
      isAlive: () => false,
      sleep: () => Promise.resolve(),
      now: () => new Date('2026-05-08T12:00:01.000Z'),
      homedir: () => home,
      ulid: () => 'rec-win-ulid',
      platform: 'win32',
    };

    const result = await stop({ id: 'rec-win', output }, deps);
    expect(result.status).toBe('stopped');
    expect(taskkillCalled.cmd).toBe('taskkill');
    expect(taskkillCalled.args).toContain('/PID');
    expect(taskkillCalled.args).toContain('1234');
  });

  it('returns no-pid when pid file is missing', async () => {
    const output = join(tmp, 'rec-nopid');
    const home = freshTmp();
    const deps: StopDeps = {
      kill: () => true,
      isAlive: () => false,
      sleep: () => Promise.resolve(),
      now: () => new Date(),
      homedir: () => home,
      ulid: () => 'x',
      platform: 'linux',
    };
    const result = await stop({ id: 'rec-nopid', output }, deps);
    expect(result.status).toBe('no-pid');
  });

  // Issue #266 F8 — oversize OGG is not enqueued; left in place for manual handling.
  it('returns too-large and leaves OGG in place when recording exceeds maxPayloadBytes', async () => {
    const output = join(tmp, 'rec-huge');
    const oggPath = `${output}.ogg`;
    writeFileSync(`${output}.pid`, '8888', 'utf-8');
    writeFileSync(
      `${output}.start.json`,
      JSON.stringify({ id: 'rec-huge', started_at: '2026-05-08T12:00:00.000Z' }),
      'utf-8',
    );
    // 2KB recording; we'll cap at 1KB.
    writeFileSync(oggPath, Buffer.alloc(2048));

    const home = freshTmp();
    const deps: StopDeps = {
      kill: () => true,
      isAlive: () => false,
      sleep: () => Promise.resolve(),
      now: () => new Date('2026-05-08T12:00:05.000Z'),
      homedir: () => home,
      ulid: () => 'rec-huge-ulid',
      platform: 'linux',
      maxPayloadBytes: 1024,
    };

    const result = await stop({ id: 'rec-huge', output }, deps);
    expect(result.status).toBe('too-large');
    expect(result.oversizePath).toBe(oggPath);
    expect(result.payload_size).toBe(2048);

    // OGG must stay where ffmpeg wrote it — not moved into pending/.
    expect(existsSync(oggPath)).toBe(true);
    const pendingDir = join(home, '.teamagent', 'digital-twin', 'queue', 'pending');
    if (existsSync(pendingDir)) {
      // dir may exist from mkdir, but it must be empty.
      const { readdirSync } = await import('node:fs');
      expect(readdirSync(pendingDir)).toEqual([]);
    }
    // Sidecars cleaned up so the session doesn't look "live".
    expect(existsSync(`${output}.pid`)).toBe(false);
    expect(existsSync(`${output}.start.json`)).toBe(false);
  });
});

describe('importRecording()', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = freshTmp();
  });

  it('runs ffmpeg synchronously with codec flags and moves the result into pending/ (issue #146 F3)', () => {
    const inputPath = join(tmp, 'input.wav');
    writeFileSync(inputPath, Buffer.from('RIFFfake-wav'));
    const output = join(tmp, 'imported');

    let observed: { cmd?: string; args?: readonly string[] } = {};
    const home = freshTmp();

    // Pretend the synchronous ffmpeg invocation produced an OGG.
    const deps: ImportDeps = {
      detectFfmpeg: () => ({ available: true, version: '6.0' }),
      spawnSync: (cmd, args) => {
        observed = { cmd, args };
        // emulate ffmpeg writing the OGG output (last arg is destination)
        const dest = args[args.length - 1];
        if (typeof dest === 'string') {
          writeFileSync(dest, Buffer.from('OggS-imported-bytes'));
        }
        return { status: 0, stderr: Buffer.from('') };
      },
      now: () => new Date('2026-05-08T12:00:10.000Z'),
      homedir: () => home,
      ulid: () => 'IMPORT-ULID',
      platform: 'linux',
      teamagentVersion: '0.9.5',
      arch: 'x64',
      hostname: 'host-1',
    };

    const result = importRecording({ inputPath, output }, deps);
    expect(result.status).toBe('imported');

    expect(observed.cmd).toBe('ffmpeg');
    expect(observed.args).toContain('-y');
    expect(observed.args).toContain('-i');
    expect(observed.args).toContain(inputPath);
    for (const flag of RECORDING_CODEC_FLAGS) {
      expect(observed.args).toContain(flag);
    }
    expect(observed.args?.[observed.args!.length - 1]).toBe(`${output}.ogg`);

    // Issue #146 F3: imported recordings land in pending/ (was recording_temp/).
    const pendingDir = join(
      home,
      '.teamagent',
      'digital-twin',
      'queue',
      'pending',
    );
    const payloadPath = join(pendingDir, 'IMPORT-ULID.payload');
    const metadataPath = join(pendingDir, 'IMPORT-ULID.json');
    expect(existsSync(payloadPath)).toBe(true);
    expect(existsSync(metadataPath)).toBe(true);

    const meta = JSON.parse(readFileSync(metadataPath, 'utf-8'));
    expect(meta.kind).toBe('recording');
    expect(meta.source).toBe('import');
    expect(meta.codec).toBe('opus');
  });

  it('returns failed when ffmpeg exits non-zero', () => {
    const inputPath = join(tmp, 'bad.dat');
    writeFileSync(inputPath, Buffer.from('garbage'));
    const home = freshTmp();
    const deps: ImportDeps = {
      detectFfmpeg: () => ({ available: true, version: '6.0' }),
      spawnSync: () => ({
        status: 1,
        stderr: Buffer.from('Invalid data found when processing input'),
      }),
      now: () => new Date(),
      homedir: () => home,
      ulid: () => 'fail-ulid',
      platform: 'linux',
    };
    const result = importRecording({ inputPath, output: join(tmp, 'out') }, deps);
    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/Invalid data/);
  });

  it('throws with install hint when ffmpeg missing', () => {
    const inputPath = join(tmp, 'a.wav');
    writeFileSync(inputPath, Buffer.from('x'));
    const deps: ImportDeps = {
      detectFfmpeg: () => ({ available: false }),
      platform: 'darwin',
      spawnSync: () => ({ status: 0, stderr: Buffer.from('') }),
      now: () => new Date(),
      homedir: () => tmp,
      ulid: () => 'x',
    };
    expect(() => importRecording({ inputPath, output: join(tmp, 'o') }, deps)).toThrow(
      /brew install ffmpeg/i,
    );
  });
});
