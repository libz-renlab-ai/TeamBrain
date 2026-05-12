import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ulid } from 'ulid';
import {
  parseVideoArgs,
  VideoArgError,
  executeVideo,
  containerFromFile,
  type VideoParsedArgs,
} from '../commands/video.js';

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

describe('parseVideoArgs', () => {
  it('rejects empty argv', () => {
    expect(() => parseVideoArgs([])).toThrow(VideoArgError);
  });

  it('rejects unknown subcommand', () => {
    expect(() => parseVideoArgs(['record'])).toThrow(VideoArgError);
  });

  it('rejects missing file path', () => {
    expect(() => parseVideoArgs(['upload'])).toThrow(VideoArgError);
  });

  it('rejects flag where file path expected', () => {
    expect(() => parseVideoArgs(['upload', '--json'])).toThrow(VideoArgError);
  });

  it('rejects unknown argument', () => {
    expect(() => parseVideoArgs(['upload', 'a.mov', '--nope'])).toThrow(
      VideoArgError,
    );
  });

  it('parses minimal upload with default endpoint', () => {
    const parsed = parseVideoArgs(['upload', 'demo.mov']);
    expect(parsed.sub).toBe('upload');
    expect(parsed.filePath).toBe('demo.mov');
    expect(parsed.endpoint).toBe('http://127.0.0.1:8787');
    expect(parsed.jsonOut).toBe(false);
  });

  it('strips trailing slash from --endpoint', () => {
    const parsed = parseVideoArgs([
      'upload',
      'a.mp4',
      '--endpoint',
      'https://collector.example.com/',
    ]);
    expect(parsed.endpoint).toBe('https://collector.example.com');
  });

  it('accepts --endpoint=value form and env fallback', () => {
    const explicit = parseVideoArgs(
      ['upload', 'a.mp4', '--endpoint=https://e1/'],
      'https://from-env',
    );
    expect(explicit.endpoint).toBe('https://e1');
    const fromEnv = parseVideoArgs(['upload', 'a.mp4'], 'https://from-env');
    expect(fromEnv.endpoint).toBe('https://from-env');
  });

  it('captures --label, --user-id, --json', () => {
    const parsed = parseVideoArgs([
      'upload',
      'a.webm',
      '--label',
      'demo',
      '--user-id',
      'alice',
      '--json',
    ]);
    expect(parsed.label).toBe('demo');
    expect(parsed.userId).toBe('alice');
    expect(parsed.jsonOut).toBe(true);
  });
});

describe('containerFromFile', () => {
  it('returns the lowercase extension for accepted containers', () => {
    expect(containerFromFile('a.mov')).toBe('mov');
    expect(containerFromFile('B.MP4')).toBe('mp4');
    expect(containerFromFile('path/to/file.WebM')).toBe('webm');
    expect(containerFromFile('/abs/clip.mkv')).toBe('mkv');
  });

  it('rejects unaccepted extensions', () => {
    expect(containerFromFile('a.avi')).toBeNull();
    expect(containerFromFile('a.mp3')).toBeNull();
    expect(containerFromFile('no-ext')).toBeNull();
  });
});

describe('executeVideo', () => {
  function fixturePath(ext: string, bytes = Buffer.from('hello-fixture')): string {
    const dir = join(tmpdir(), `video-test-${ulid()}`);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, `clip.${ext}`);
    writeFileSync(p, bytes);
    return p;
  }

  it('exits 2 on unsupported extension and does not call fetch', async () => {
    const cap = captureOutput();
    let calls = 0;
    const args: VideoParsedArgs = {
      sub: 'upload',
      filePath: 'demo.avi',
      endpoint: 'http://127.0.0.1:0',
      jsonOut: false,
    };
    const result = await executeVideo(args, {
      ...cap,
      fetchFn: async () => {
        calls++;
        return { status: 500, text: async () => 'should not run' };
      },
    });
    expect(result.exitCode).toBe(2);
    expect(calls).toBe(0);
    expect(cap.err.join('')).toContain('Unsupported video extension');
  });

  it('exits 2 on missing file', async () => {
    const cap = captureOutput();
    const args: VideoParsedArgs = {
      sub: 'upload',
      filePath: '/no/such/file.mp4',
      endpoint: 'http://127.0.0.1:0',
      jsonOut: false,
    };
    const result = await executeVideo(args, { ...cap });
    expect(result.exitCode).toBe(2);
    expect(cap.err.join('')).toContain('Failed to read');
  });

  it('exits 2 on empty file', async () => {
    const cap = captureOutput();
    const p = fixturePath('mp4', Buffer.alloc(0));
    const args: VideoParsedArgs = {
      sub: 'upload',
      filePath: p,
      endpoint: 'http://127.0.0.1:0',
      jsonOut: false,
    };
    const result = await executeVideo(args, { ...cap });
    expect(result.exitCode).toBe(2);
    expect(cap.err.join('')).toContain('empty file');
  });

  it('POSTs envelope+video body to /v1/videos and prints link on 200', async () => {
    const cap = captureOutput();
    const fileBytes = Buffer.from('FAKE-MP4-BYTES');
    const p = fixturePath('mp4', fileBytes);
    const args: VideoParsedArgs = {
      sub: 'upload',
      filePath: p,
      endpoint: 'http://collector.example.com',
      label: 'unit',
      userId: 'tester',
      jsonOut: true,
    };

    let observedUrl = '';
    let observedBody = '';
    const result = await executeVideo(args, {
      ...cap,
      ulid: () => '01TESTULID0000000000000000',
      hostname: () => 'unit-host',
      platform: () => 'darwin',
      now: () => new Date('2026-05-13T00:00:00Z'),
      fetchFn: async (url, init) => {
        observedUrl = url;
        observedBody = init.body;
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              ok: true,
              id: '01TESTULID0000000000000000',
              user_id: 'tester',
              date: '2026-05-13',
              link: '/api/file?user=tester&date=2026-05-13&id=01TESTULID0000000000000000&ext=mp4',
            }),
        };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(observedUrl).toBe('http://collector.example.com/v1/videos');
    const parsedBody = JSON.parse(observedBody) as {
      schema_version: number;
      envelope: Record<string, unknown>;
      video: { container: string; content: string };
    };
    expect(parsedBody.schema_version).toBe(1);
    expect(parsedBody.envelope.video_id).toBe('01TESTULID0000000000000000');
    expect(parsedBody.envelope.user_id).toBe('tester');
    expect(parsedBody.envelope.container).toBe('mp4');
    expect(parsedBody.envelope.payload_size).toBe(fileBytes.length);
    expect(parsedBody.envelope.label).toBe('unit');
    expect(parsedBody.video.container).toBe('mp4');
    expect(parsedBody.video.content).toBe(fileBytes.toString('base64'));

    const printed = cap.out.join('');
    expect(printed).toContain('"ok": true');
    expect(printed).toContain(
      'http://collector.example.com/api/file?user=tester&date=2026-05-13&id=01TESTULID0000000000000000&ext=mp4',
    );
  });

  it('exits 1 on HTTP non-2xx', async () => {
    const cap = captureOutput();
    const p = fixturePath('webm');
    const args: VideoParsedArgs = {
      sub: 'upload',
      filePath: p,
      endpoint: 'http://collector.example.com',
      jsonOut: false,
    };
    const result = await executeVideo(args, {
      ...cap,
      fetchFn: async () => ({
        status: 413,
        text: async () => '{"error":"payload too large"}',
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(cap.err.join('')).toContain('HTTP 413');
  });

  it('exits 1 on fetch network error and prints recovery hint', async () => {
    const cap = captureOutput();
    const p = fixturePath('mov');
    const args: VideoParsedArgs = {
      sub: 'upload',
      filePath: p,
      endpoint: 'http://collector.example.com',
      jsonOut: false,
    };
    const result = await executeVideo(args, {
      ...cap,
      fetchFn: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(result.exitCode).toBe(1);
    const stderr = cap.err.join('');
    expect(stderr).toContain('Upload to http://collector.example.com/v1/videos failed');
    expect(stderr).toContain('digital-twin start');
  });
});
