import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ulid } from 'ulid';
import { digitalTwinPaths } from '@teamagent/digital-twin';
import {
  parseRecordArgs,
  RecordArgError,
  executeRecord,
  executeRecordStart,
  executeRecordStop,
  executeRecordImport,
} from '../commands/record.js';

function freshHome(): string {
  const home = join(tmpdir(), `dt-record-${ulid()}`);
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

describe('parseRecordArgs', () => {
  it('rejects empty subcommand', () => {
    expect(() => parseRecordArgs([])).toThrow(RecordArgError);
  });

  it('rejects unknown subcommand', () => {
    expect(() => parseRecordArgs(['ohai'])).toThrow(RecordArgError);
  });

  it('parses start/stop without flags', () => {
    expect(parseRecordArgs(['start'])).toEqual({ sub: 'start' });
    expect(parseRecordArgs(['stop'])).toEqual({ sub: 'stop' });
  });

  it('parses start with --id <value> and --id=value', () => {
    expect(parseRecordArgs(['start', '--id', 'rec-1'])).toEqual({
      sub: 'start',
      id: 'rec-1',
    });
    expect(parseRecordArgs(['start', '--id=rec-2'])).toEqual({
      sub: 'start',
      id: 'rec-2',
    });
  });

  it('parses start with --label', () => {
    expect(parseRecordArgs(['start', '--label', 'demo'])).toEqual({
      sub: 'start',
      label: 'demo',
    });
    expect(parseRecordArgs(['start', '--label=demo2'])).toEqual({
      sub: 'start',
      label: 'demo2',
    });
  });

  it('parses stop with --id', () => {
    expect(parseRecordArgs(['stop', '--id', 'rec-3'])).toEqual({
      sub: 'stop',
      id: 'rec-3',
    });
  });

  it('parses import <file>', () => {
    expect(parseRecordArgs(['import', '/tmp/foo.ogg'])).toEqual({
      sub: 'import',
      filePath: '/tmp/foo.ogg',
    });
  });

  it('parses import with --label', () => {
    expect(parseRecordArgs(['import', '/tmp/foo.ogg', '--label', 'demo'])).toEqual({
      sub: 'import',
      filePath: '/tmp/foo.ogg',
      label: 'demo',
    });
  });

  it('rejects import with no file', () => {
    expect(() => parseRecordArgs(['import'])).toThrow(RecordArgError);
  });
});

describe('executeRecordStart (wired to ffmpeg-wrapper)', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('creates recording_temp dir, calls ffmpegStart, prints id+pid+output', () => {
    const c = captureOutput();
    let received: { id: string; output: string } | null = null;
    const r = executeRecordStart(
      { sub: 'start' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        ulid: () => 'TESTULID01',
        ffmpegStart: (input) => {
          received = { id: input.id, output: input.output };
          return { id: input.id, pid: 4242, output: `${input.output}.ogg` };
        },
      },
    );
    expect(r.exitCode).toBe(0);
    expect(received).not.toBeNull();
    expect(received!.id).toBe('TESTULID01');
    expect(received!.output).toBe(
      join(digitalTwinPaths(home).recordingTempDir, 'TESTULID01'),
    );
    expect(existsSync(digitalTwinPaths(home).recordingTempDir)).toBe(true);
    const joined = c.out.join('\n');
    expect(joined).toContain('record: started');
    expect(joined).toContain('id=TESTULID01');
    expect(joined).toContain('pid=4242');
  });

  it('honors caller-supplied --id over ulid()', () => {
    const c = captureOutput();
    let receivedId = '';
    executeRecordStart(
      { sub: 'start', id: 'caller-id' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        ulid: () => 'AUTO-ULID',
        ffmpegStart: (input) => {
          receivedId = input.id;
          return { id: input.id, pid: 1, output: `${input.output}.ogg` };
        },
      },
    );
    expect(receivedId).toBe('caller-id');
  });

  it('returns exit 1 + stderr when ffmpegStart throws', () => {
    const c = captureOutput();
    const r = executeRecordStart(
      { sub: 'start' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        ulid: () => 'X',
        ffmpegStart: () => {
          throw new Error('ffmpeg not found on PATH. install hint here');
        },
      },
    );
    expect(r.exitCode).toBe(1);
    expect(c.err.join('\n')).toContain('record start failed');
    expect(c.err.join('\n')).toContain('ffmpeg not found');
  });
});

describe('executeRecordStop (wired to ffmpeg-wrapper)', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('with explicit --id: calls ffmpegStop, prints stopped + payload path', async () => {
    const c = captureOutput();
    let receivedId = '';
    const r = await executeRecordStop(
      { sub: 'stop', id: 'rec-A' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        ffmpegStop: async (input) => {
          receivedId = input.id;
          return { status: 'stopped', payloadPath: '/tmp/rec-A.payload' };
        },
      },
    );
    expect(r.exitCode).toBe(0);
    expect(receivedId).toBe('rec-A');
    expect(c.out.join('\n')).toContain('record: stopped id=rec-A');
    expect(c.out.join('\n')).toContain('payload=/tmp/rec-A.payload');
  });

  it('without --id: picks latest ulid-prefixed .pid file from recording_temp', async () => {
    const c = captureOutput();
    let received = '';
    const r = await executeRecordStop(
      { sub: 'stop' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        listRecordingTemp: () => ['01ABC.pid', '01XYZ.pid', '01ABC.start.json'],
        ffmpegStop: async (input) => {
          received = input.id;
          return { status: 'stopped', payloadPath: '/tmp/p' };
        },
      },
    );
    expect(r.exitCode).toBe(0);
    // ulid sorts lexicographically; '01XYZ' > '01ABC' so latest is 01XYZ
    expect(received).toBe('01XYZ');
  });

  it('exits 1 when no --id and no recordings found', async () => {
    const c = captureOutput();
    const r = await executeRecordStop(
      { sub: 'stop' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        listRecordingTemp: () => [],
      },
    );
    expect(r.exitCode).toBe(1);
    expect(c.err.join('\n')).toContain('no --id provided');
    expect(c.err.join('\n')).toContain('no active recording');
  });

  it('exits 1 when ffmpegStop reports non-stopped status', async () => {
    const c = captureOutput();
    const r = await executeRecordStop(
      { sub: 'stop', id: 'rec-T' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        ffmpegStop: async () => ({ status: 'timeout' }),
      },
    );
    expect(r.exitCode).toBe(1);
    expect(c.err.join('\n')).toContain('status=timeout');
  });
});

describe('executeRecordImport (wired to ffmpeg-wrapper)', () => {
  let home: string;
  beforeEach(() => {
    home = freshHome();
  });

  it('creates pending dir, calls ffmpegImport, prints imported path', async () => {
    const c = captureOutput();
    let receivedInput = '';
    const r = await executeRecordImport(
      { sub: 'import', filePath: '/tmp/in.mp4' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        ulid: () => 'IMPULID',
        ffmpegImport: (input) => {
          receivedInput = input.inputPath;
          return { status: 'imported', payloadPath: `${input.output}.ogg` };
        },
      },
    );
    expect(r.exitCode).toBe(0);
    expect(receivedInput).toBe('/tmp/in.mp4');
    expect(existsSync(digitalTwinPaths(home).pendingDir)).toBe(true);
    expect(c.out.join('\n')).toContain('record: imported');
    expect(c.out.join('\n')).toContain('/tmp/in.mp4');
  });

  it('exits 1 when ffmpegImport reports failed', async () => {
    const c = captureOutput();
    const r = await executeRecordImport(
      { sub: 'import', filePath: '/tmp/x.mp4' },
      {
        homedir: () => home,
        print: c.print,
        printErr: c.printErr,
        ulid: () => 'X',
        ffmpegImport: () => ({
          status: 'failed',
          error: 'ffmpeg returned 1',
        }),
      },
    );
    expect(r.exitCode).toBe(1);
    expect(c.err.join('\n')).toContain('status=failed');
    expect(c.err.join('\n')).toContain('ffmpeg returned 1');
  });

  it('exits 1 when filePath missing', async () => {
    const c = captureOutput();
    const r = await executeRecordImport(
      { sub: 'import' },
      { homedir: () => home, print: c.print, printErr: c.printErr },
    );
    expect(r.exitCode).toBe(1);
    expect(c.err.join('\n')).toContain('missing <file>');
  });
});

describe('executeRecord top-level dispatcher', () => {
  it('dispatches start', async () => {
    const c = captureOutput();
    const r = await executeRecord(
      { sub: 'start' },
      {
        homedir: () => freshHome(),
        print: c.print,
        printErr: c.printErr,
        ulid: () => 'D1',
        ffmpegStart: () => ({ id: 'D1', pid: 1, output: 'x.ogg' }),
      },
    );
    expect(r.exitCode).toBe(0);
    expect(c.out.join('\n')).toContain('record: started');
  });

  it('dispatches stop', async () => {
    const c = captureOutput();
    const r = await executeRecord(
      { sub: 'stop', id: 'D2' },
      {
        homedir: () => freshHome(),
        print: c.print,
        printErr: c.printErr,
        ffmpegStop: async () => ({ status: 'stopped', payloadPath: '/p' }),
      },
    );
    expect(r.exitCode).toBe(0);
    expect(c.out.join('\n')).toContain('record: stopped');
  });

  it('dispatches import', async () => {
    const c = captureOutput();
    const r = await executeRecord(
      { sub: 'import', filePath: '/in.mp4' },
      {
        homedir: () => freshHome(),
        print: c.print,
        printErr: c.printErr,
        ulid: () => 'D3',
        ffmpegImport: () => ({ status: 'imported', payloadPath: '/p.ogg' }),
      },
    );
    expect(r.exitCode).toBe(0);
    expect(c.out.join('\n')).toContain('record: imported');
  });
});
