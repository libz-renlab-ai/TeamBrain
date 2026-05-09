import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  startMockServer,
  safeUserId,
  dateStamp,
  type MockServerHandle,
} from '../mock-server.js';

const FROZEN = new Date('2026-05-09T03:14:15.000Z');
const FROZEN_DATE = '2026-05-09';

describe('mock-server', () => {
  let server: MockServerHandle;
  let outputDir: string;

  beforeEach(async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'dt-mock-'));
    server = await startMockServer({ port: 0, outputDir, now: () => FROZEN });
  });

  afterEach(async () => {
    await server.close();
  });

  it('binds to a port and returns a handle', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(server.port).toBeGreaterThan(0);
    expect(server.outputDir).toBe(outputDir);
  });

  it('POST /v1/cc-sessions writes .jsonl under <user_id>/<date>/', async () => {
    const transcript = '{"role":"user","content":"hello"}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const payload = {
      schema_version: '1.0',
      envelope: {
        session_id: 'test-session-1',
        user_id: 'thomas@libz.ai',
        captured_at: '2026-05-09T03:00:00.000Z',
      },
      transcript: { content: compressed.toString('base64') },
    };
    const res = await fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      id: string;
      user_id: string;
      date: string;
    };
    expect(body.ok).toBe(true);
    expect(body.id).toBe('test-session-1');
    expect(body.user_id).toBe('thomas@libz.ai');
    expect(body.date).toBe('2026-05-09');

    const file = join(outputDir, 'thomas@libz.ai', '2026-05-09', 'test-session-1.jsonl');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(transcript);
  });

  it('POST /v1/recordings writes .ogg under <user_id>/<date>/', async () => {
    const ogg = Buffer.from('OggS fakeogg', 'binary');
    const payload = {
      schema_version: '1.0',
      envelope: {
        recording_id: 'test-rec-1',
        user_id: 'alice@libz.ai',
        captured_at: '2026-05-09T03:00:00.000Z',
      },
      audio: { content: ogg.toString('base64') },
    };
    const res = await fetch(`${server.url}/v1/recordings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    const file = join(outputDir, 'alice@libz.ai', '2026-05-09', 'test-rec-1.ogg');
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file)).toEqual(ogg);
  });

  it('falls back to "unknown" user_id and frozen-now date when envelope omits both', async () => {
    const transcript = '{"x":1}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const payload = {
      schema_version: '1.0',
      envelope: { session_id: 'no-user' },
      transcript: { content: compressed.toString('base64') },
    };
    const res = await fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user_id: string; date: string };
    expect(body.user_id).toBe('unknown');
    expect(body.date).toBe(FROZEN_DATE);
    expect(existsSync(join(outputDir, 'unknown', FROZEN_DATE, 'no-user.jsonl'))).toBe(true);
  });

  it('sanitizes path-unsafe characters in user_id', async () => {
    const transcript = '{"x":1}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const payload = {
      schema_version: '1.0',
      envelope: {
        session_id: 'sx',
        user_id: '../../etc/passwd\\evil',
        captured_at: '2026-05-09T03:00:00.000Z',
      },
      transcript: { content: compressed.toString('base64') },
    };
    const res = await fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user_id: string };
    expect(body.user_id).not.toContain('/');
    expect(body.user_id).not.toContain('\\');
    expect(body.user_id).not.toContain('..');
    expect(existsSync(join(outputDir, body.user_id, '2026-05-09', 'sx.jsonl'))).toBe(true);
  });

  it('rejects non-POST/GET with 405', async () => {
    const res = await fetch(`${server.url}/v1/cc-sessions`, { method: 'PUT' });
    expect(res.status).toBe(405);
  });

  it('GET on POST-only route falls through to 404', async () => {
    const res = await fetch(`${server.url}/v1/cc-sessions`);
    expect(res.status).toBe(404);
  });

  it('rejects unknown route with 404', async () => {
    const res = await fetch(`${server.url}/v1/unknown`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when transcript content missing', async () => {
    const payload = {
      schema_version: '1.0',
      envelope: { session_id: 'no-content' },
      transcript: {},
    };
    const res = await fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
  });

  it('falls back to "unknown-<ts>" when session_id missing', async () => {
    const transcript = '{"x":1}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const payload = {
      schema_version: '1.0',
      envelope: {},
      transcript: { content: compressed.toString('base64') },
    };
    const res = await fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.id).toMatch(/^unknown-\d+$/);
  });
});

describe('safeUserId', () => {
  it('returns "unknown" for empty / non-string', () => {
    expect(safeUserId(undefined)).toBe('unknown');
    expect(safeUserId(null)).toBe('unknown');
    expect(safeUserId('')).toBe('unknown');
    expect(safeUserId(42)).toBe('unknown');
  });

  it('preserves email-like strings unchanged', () => {
    expect(safeUserId('alice@libz.ai')).toBe('alice@libz.ai');
    expect(safeUserId('user.name+tag@host-1.example')).toBe('user.name+tag@host-1.example');
  });

  it('replaces path separators and unsafe chars with _', () => {
    expect(safeUserId('a/b\\c')).toBe('a_b_c');
  });

  it('collapses ".." sequences and strips leading/trailing punctuation', () => {
    expect(safeUserId('../../etc/passwd')).toBe('etc_passwd');
    expect(safeUserId('..foo')).toBe('foo');
    expect(safeUserId('foo..')).toBe('foo');
    expect(safeUserId('..')).toBe('unknown');
  });

  it('caps at 80 chars', () => {
    const out = safeUserId('a'.repeat(200));
    expect(out.length).toBe(80);
  });
});

describe('dateStamp', () => {
  const NOW = new Date('2026-05-09T03:14:15.000Z');

  it('uses captured_at when valid', () => {
    expect(dateStamp('2026-05-08T20:00:00.000Z', NOW)).toBe('2026-05-08');
  });

  it('falls back to now when captured_at missing or invalid', () => {
    expect(dateStamp(undefined, NOW)).toBe('2026-05-09');
    expect(dateStamp('not-a-date', NOW)).toBe('2026-05-09');
    expect(dateStamp('', NOW)).toBe('2026-05-09');
  });
});

describe('mock-server dashboard', () => {
  let server: MockServerHandle;
  let outputDir: string;

  beforeEach(async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'dt-dash-'));
    // seed: userA/2026-05-09/x.jsonl, userA/2026-05-08/y.jsonl, userB/2026-05-08/z.ogg
    const transcript = '{"role":"user","content":"hello"}\n{"role":"assistant","content":"hi"}\n';
    const ogg = Buffer.from('OggS fakeoggbody', 'binary');
    const a09 = join(outputDir, 'userA', '2026-05-09');
    const a08 = join(outputDir, 'userA', '2026-05-08');
    const b08 = join(outputDir, 'userB', '2026-05-08');
    mkdirSync(a09, { recursive: true });
    mkdirSync(a08, { recursive: true });
    mkdirSync(b08, { recursive: true });
    writeFileSync(join(a09, 'x.jsonl'), transcript);
    writeFileSync(join(a08, 'y.jsonl'), transcript);
    writeFileSync(join(b08, 'z.ogg'), ogg);
    server = await startMockServer({ port: 0, outputDir });
  });

  afterEach(async () => {
    await server.close();
  });

  it('GET / returns the HTML dashboard', async () => {
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
    const body = await res.text();
    expect(body).toContain('TeamAgent Collector');
  });

  it('GET /index.html also returns the dashboard', async () => {
    const res = await fetch(`${server.url}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
  });

  it('GET unknown path returns 404', async () => {
    const res = await fetch(`${server.url}/no-such-path`);
    expect(res.status).toBe(404);
  });

  it('GET /api/users returns sorted user list', async () => {
    const res = await fetch(`${server.url}/api/users`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: string[] };
    expect(body.users).toEqual(['userA', 'userB']);
  });

  it('GET /api/dates?user=userA returns dates desc', async () => {
    const res = await fetch(`${server.url}/api/dates?user=userA`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dates: string[] };
    expect(body.dates).toEqual(['2026-05-09', '2026-05-08']);
  });

  it('GET /api/dates without user returns 400', async () => {
    const res = await fetch(`${server.url}/api/dates`);
    expect(res.status).toBe(400);
  });

  it('GET /api/sessions?user=userA&date=2026-05-09 returns one entry', async () => {
    const res = await fetch(
      `${server.url}/api/sessions?user=userA&date=2026-05-09`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sessions: Array<{ id: string; ext: string; size: number; mtime: string }>;
    };
    expect(body.sessions.length).toBe(1);
    const first = body.sessions[0]!;
    expect(first.id).toBe('x');
    expect(first.ext).toBe('jsonl');
    expect(first.size).toBeGreaterThan(0);
    expect(first.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('GET /api/sessions for nonexistent user returns empty list', async () => {
    const res = await fetch(
      `${server.url}/api/sessions?user=ghost&date=2026-05-09`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: unknown[] };
    expect(body.sessions).toEqual([]);
  });

  it('GET /api/file jsonl returns text/plain raw content', async () => {
    const res = await fetch(
      `${server.url}/api/file?user=userA&date=2026-05-09&id=x&ext=jsonl`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('"role":"user"');
    expect(body).toContain('"role":"assistant"');
  });

  it('GET /api/file ogg returns audio/ogg raw bytes', async () => {
    const res = await fetch(
      `${server.url}/api/file?user=userB&date=2026-05-08&id=z&ext=ogg`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toBe('audio/ogg');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString('binary')).toBe('OggS fakeoggbody');
  });

  it('GET /api/file for missing file returns 404', async () => {
    const res = await fetch(
      `${server.url}/api/file?user=userA&date=2026-05-09&id=does-not-exist&ext=jsonl`,
    );
    expect(res.status).toBe(404);
  });

  it('rejects path traversal: user=..', async () => {
    const res = await fetch(`${server.url}/api/dates?user=..`);
    expect(res.status).toBe(400);
  });

  it('rejects path traversal: user contains slash', async () => {
    const res = await fetch(
      `${server.url}/api/dates?user=${encodeURIComponent('userA/extra')}`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects path traversal: user contains backslash', async () => {
    const res = await fetch(
      `${server.url}/api/dates?user=${encodeURIComponent('userA\\extra')}`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects malformed date: 2026-13-99', async () => {
    const res = await fetch(
      `${server.url}/api/file?user=userA&date=2026-13-99&id=x&ext=jsonl`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects path traversal: id=../etc', async () => {
    const res = await fetch(
      `${server.url}/api/file?user=userA&date=2026-05-09&id=${encodeURIComponent('../etc')}&ext=jsonl`,
    );
    expect(res.status).toBe(400);
  });

  it('rejects unknown ext', async () => {
    const res = await fetch(
      `${server.url}/api/file?user=userA&date=2026-05-09&id=x&ext=evil`,
    );
    expect(res.status).toBe(400);
  });
});

