import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
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

  it('falls back to "unknown-<ts>-<rand>" when session_id missing', async () => {
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
    // Tail random suffix is 8 hex chars from a UUID — avoids collisions across
    // two concurrent uploads racing inside the same millisecond.
    expect(body.id).toMatch(/^unknown-\d+-[0-9a-f]{8}$/);
  });

  it('rejects POST with session_id containing path traversal (P1: attacker write outside outputDir)', async () => {
    const transcript = '{"x":1}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const payload = {
      schema_version: '1.0',
      envelope: {
        session_id: '../../../etc/cron.d/evil',
        user_id: 'attacker',
      },
      transcript: { content: compressed.toString('base64') },
    };
    const res = await fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid id');
  });

  it('rejects POST with session_id containing slash', async () => {
    const transcript = '{"x":1}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const res = await fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        envelope: { session_id: 'foo/bar', user_id: 'a' },
        transcript: { content: compressed.toString('base64') },
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects POST body larger than MAX_BODY_BYTES with 413', async () => {
    // 33 MB of "A" characters — exceeds the 32 MB cap.
    const huge = Buffer.alloc(33 * 1024 * 1024, 0x41);
    const res = await fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: huge,
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('payload too large');
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

describe('issue-283 quota', () => {
  let server: MockServerHandle;
  let outputDir: string;

  // Reused valid quota block — shape mirrors CcSessionQuotaBlock.
  const validQuota = {
    subscription_tier: 'max:default_claude_max_20x',
    five_hour_utilization: 0.42,
    seven_day_utilization: 0.18,
    five_hour_reset_at: 1746766800,
    seven_day_reset_at: 1747198800,
    probed_at: '2026-05-09T03:00:00.000Z',
    stale: false,
  };

  beforeEach(async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'dt-quota-'));
    server = await startMockServer({ port: 0, outputDir, now: () => FROZEN });
  });

  afterEach(async () => {
    await server.close();
  });

  async function postSession(
    sessionId: string,
    userId: string,
    quota: unknown | undefined,
  ): Promise<Response> {
    const transcript = '{"role":"user","content":"hi"}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const envelope: Record<string, unknown> = {
      session_id: sessionId,
      user_id: userId,
      captured_at: '2026-05-09T03:00:00.000Z',
    };
    if (quota !== undefined) envelope.quota = quota;
    return fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema_version: 1,
        envelope,
        transcript: { content: compressed.toString('base64') },
      }),
    });
  }

  it('POST with valid envelope.quota writes quota.json sidecar', async () => {
    const res = await postSession('s1', 'thomas@libz.ai', validQuota);
    expect(res.status).toBe(200);
    const quotaFile = join(outputDir, 'thomas@libz.ai', FROZEN_DATE, 'quota.json');
    expect(existsSync(quotaFile)).toBe(true);
    const parsed = JSON.parse(readFileSync(quotaFile, 'utf8'));
    expect(parsed).toEqual(validQuota);
  });

  it('POST without envelope.quota does not create quota.json', async () => {
    const res = await postSession('s2', 'alice@libz.ai', undefined);
    expect(res.status).toBe(200);
    const quotaFile = join(outputDir, 'alice@libz.ai', FROZEN_DATE, 'quota.json');
    expect(existsSync(quotaFile)).toBe(false);
  });

  it('POST with malformed envelope.quota still lands transcript, no sidecar', async () => {
    // Missing five_hour_reset_at + seven_day_reset_at + wrong type for stale.
    const badQuota = {
      subscription_tier: 'max',
      five_hour_utilization: 0.1,
      seven_day_utilization: 0.2,
      probed_at: '2026-05-09T03:00:00.000Z',
      stale: 'no', // wrong type — string instead of boolean
    };
    const res = await postSession('s3', 'bob@libz.ai', badQuota);
    expect(res.status).toBe(200);
    const transcriptFile = join(
      outputDir,
      'bob@libz.ai',
      FROZEN_DATE,
      's3.jsonl',
    );
    const quotaFile = join(outputDir, 'bob@libz.ai', FROZEN_DATE, 'quota.json');
    expect(existsSync(transcriptFile)).toBe(true);
    expect(existsSync(quotaFile)).toBe(false);
  });

  it('GET /api/quota after POST returns parsed quota JSON', async () => {
    const postRes = await postSession('s4', 'carol@libz.ai', validQuota);
    expect(postRes.status).toBe(200);
    const res = await fetch(
      `${server.url}/api/quota?user=${encodeURIComponent('carol@libz.ai')}&date=${FROZEN_DATE}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof validQuota;
    expect(body).toEqual(validQuota);
  });

  it('GET /api/quota with no prior POST returns 404 {error: "not found"}', async () => {
    const res = await fetch(
      `${server.url}/api/quota?user=ghost&date=${FROZEN_DATE}`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not found');
  });

  it('GET /api/quota with traversal user returns 400', async () => {
    const res = await fetch(
      `${server.url}/api/quota?user=${encodeURIComponent('..')}&date=${FROZEN_DATE}`,
    );
    expect(res.status).toBe(400);
  });

  it('GET /api/quota with unsafe-char user returns 400', async () => {
    // safeUserId would mutate this (`%` -> `_`), so validateUserParam rejects it.
    const res = await fetch(
      `${server.url}/api/quota?user=${encodeURIComponent('bad%user')}&date=${FROZEN_DATE}`,
    );
    expect(res.status).toBe(400);
  });

  it('POST quota twice overwrites the prior sidecar', async () => {
    const first = await postSession('s5a', 'dave@libz.ai', validQuota);
    expect(first.status).toBe(200);
    const updated = {
      ...validQuota,
      five_hour_utilization: 0.99,
      stale: true,
      probed_at: '2026-05-09T04:00:00.000Z',
    };
    const second = await postSession('s5b', 'dave@libz.ai', updated);
    expect(second.status).toBe(200);
    const quotaFile = join(outputDir, 'dave@libz.ai', FROZEN_DATE, 'quota.json');
    const parsed = JSON.parse(readFileSync(quotaFile, 'utf8'));
    expect(parsed).toEqual(updated);
    // And the GET endpoint reflects the latest.
    const getRes = await fetch(
      `${server.url}/api/quota?user=${encodeURIComponent('dave@libz.ai')}&date=${FROZEN_DATE}`,
    );
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual(updated);
  });
});

// M2 (对话上传通道) — transport security on the conversation-upload path:
// token auth (BPP_AUTH_TOKEN) + TLS (opts.tls). See judge.md §V1.B.
describe('mock-server — M2 transport security', () => {
  const FIXTURE_DIR = join(__dirname, '..', 'bpp', '__tests__', 'fixtures');
  const KEY_PATH = join(FIXTURE_DIR, 'test-https-key.pem');
  const CERT_PATH = join(FIXTURE_DIR, 'test-https-cert.pem');

  function ccSessionBody(sessionId: string, userId: string): string {
    const compressed = gzipSync(Buffer.from('{"role":"user","content":"hi"}\n'));
    return JSON.stringify({
      schema_version: 1,
      envelope: {
        session_id: sessionId,
        user_id: userId,
        captured_at: '2026-05-14T09:00:00.000Z',
      },
      transcript: { compression: 'gzip+base64', content: compressed.toString('base64') },
    });
  }

  describe('token auth', () => {
    let server: MockServerHandle;
    let outputDir: string;

    afterEach(async () => {
      await server.close();
    });

    it('rejects POST /v1/cc-sessions with no Authorization when authToken is set', async () => {
      outputDir = mkdtempSync(join(tmpdir(), 'dt-m2auth-'));
      server = await startMockServer({ port: 0, outputDir, authToken: 'sekret' });
      const res = await fetch(`${server.url}/v1/cc-sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: ccSessionBody('noauth-1', 'zhang@libz.ai'),
      });
      expect(res.status).toBe(401);
    });

    it('rejects POST /v1/cc-sessions with the wrong Bearer token', async () => {
      outputDir = mkdtempSync(join(tmpdir(), 'dt-m2auth-'));
      server = await startMockServer({ port: 0, outputDir, authToken: 'sekret' });
      const res = await fetch(`${server.url}/v1/cc-sessions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer wrong-token',
        },
        body: ccSessionBody('wrongtok-1', 'zhang@libz.ai'),
      });
      expect(res.status).toBe(401);
    });

    it('accepts POST /v1/cc-sessions with the correct Bearer token', async () => {
      outputDir = mkdtempSync(join(tmpdir(), 'dt-m2auth-'));
      server = await startMockServer({ port: 0, outputDir, authToken: 'sekret' });
      const res = await fetch(`${server.url}/v1/cc-sessions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer sekret',
        },
        body: ccSessionBody('goodtok-1', 'zhang@libz.ai'),
      });
      expect(res.status).toBe(200);
    });

    it('leaves POST /v1/cc-sessions open when authToken is empty (dev/test default)', async () => {
      outputDir = mkdtempSync(join(tmpdir(), 'dt-m2auth-'));
      server = await startMockServer({ port: 0, outputDir });
      const res = await fetch(`${server.url}/v1/cc-sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: ccSessionBody('noauth-open-1', 'zhang@libz.ai'),
      });
      expect(res.status).toBe(200);
    });

    it('does not gate the M1 bpp routes — POST /v1/bp-push stays open with authToken set', async () => {
      outputDir = mkdtempSync(join(tmpdir(), 'dt-m2auth-'));
      server = await startMockServer({ port: 0, outputDir, authToken: 'sekret' });
      // Malformed body → handler returns 400, NOT 401: proves the auth gate
      // did not fire on a non-cc-sessions route.
      const res = await fetch(`${server.url}/v1/bp-push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).not.toBe(401);
    });
  });

  describe('TLS', () => {
    let server: MockServerHandle;

    afterEach(async () => {
      await server.close();
    });

    it('serves over https when tls opts are passed', async () => {
      const outputDir = mkdtempSync(join(tmpdir(), 'dt-m2tls-'));
      server = await startMockServer({
        port: 0,
        outputDir,
        tls: { keyPath: KEY_PATH, certPath: CERT_PATH },
      });
      expect(server.url).toMatch(/^https:\/\/127\.0\.0\.1:\d+$/);
    });

    it('accepts a real cc-session upload over TLS', async () => {
      const outputDir = mkdtempSync(join(tmpdir(), 'dt-m2tls-'));
      server = await startMockServer({
        port: 0,
        outputDir,
        tls: { keyPath: KEY_PATH, certPath: CERT_PATH },
      });
      // Self-signed test cert — disable verification for this test only.
      const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      try {
        const res = await fetch(`${server.url}/v1/cc-sessions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: ccSessionBody('tls-upload-1', 'zhang@libz.ai'),
        });
        expect(res.status).toBe(200);
        const file = join(outputDir, 'zhang@libz.ai', '2026-05-14', 'tls-upload-1.jsonl');
        expect(existsSync(file)).toBe(true);
      } finally {
        if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
      }
    });
  });
});

// M2 (对话上传通道) — server-side L2 scan ("第二层敏感信息扫描（兜底）"). When a
// transcript reaches the server with sensitive fields L1 missed (a disabled
// rule, a bypassed collector, a hand-crafted POST), the server must redact it
// before it lands AND record an l2_scan_alert. See judge.md §V1.D.
describe('mock-server — M2 server-side L2 scan', () => {
  let server: MockServerHandle;
  let outputDir: string;

  beforeEach(async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'dt-m2l2-'));
    server = await startMockServer({ port: 0, outputDir, now: () => FROZEN });
  });

  afterEach(async () => {
    await server.close();
  });

  /** POST a cc-session whose transcript content is the given raw string. */
  async function postRawTranscript(
    sessionId: string,
    userId: string,
    rawTranscript: string,
  ): Promise<Response> {
    const compressed = gzipSync(Buffer.from(rawTranscript));
    return fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema_version: 1,
        envelope: {
          session_id: sessionId,
          user_id: userId,
          captured_at: '2026-05-09T03:00:00.000Z',
        },
        transcript: { compression: 'gzip+base64', content: compressed.toString('base64') },
      }),
    });
  }

  /** Concatenate every line of every `_audit/<date>.jsonl` file. */
  function readAllAudit(): string {
    const dir = join(outputDir, '_audit');
    if (!existsSync(dir)) return '';
    return readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('');
  }

  it('redacts an L1-missed secret before the transcript lands on disk', async () => {
    // Simulates a bypassed collector: the raw AWS key reaches the server
    // un-redacted. The server-side L2 pass must scrub it before write.
    const leak = 'AKIAIOSFODNN7EXAMPLE';
    const res = await postRawTranscript(
      'l2-leak-1',
      'li@libz.ai',
      `{"role":"user","content":"my key is ${leak}"}\n`,
    );
    expect(res.status).toBe(200);
    const landed = join(outputDir, 'li@libz.ai', FROZEN_DATE, 'l2-leak-1.jsonl');
    const onDisk = readFileSync(landed, 'utf8');
    expect(onDisk).not.toContain(leak);
    expect(onDisk).toContain('[redacted]');
  });

  it('records an l2_scan_alert carrying only the matched rule kinds', async () => {
    const leak = 'AKIAIOSFODNN7EXAMPLE';
    await postRawTranscript(
      'l2-leak-2',
      'li@libz.ai',
      `{"role":"user","content":"key ${leak} email leak@personal.com"}\n`,
    );
    const audit = readAllAudit();
    expect(audit).toContain('l2_scan_alert');
    // The alert lists the rule kinds...
    const line = audit.split('\n').filter(Boolean).find((l) => l.includes('l2_scan_alert'));
    expect(line).toBeDefined();
    const ev = JSON.parse(line!) as {
      event_type: string;
      actor: string;
      metadata: { matched_rule_kinds: string[]; session_id: string };
    };
    expect(ev.event_type).toBe('l2_scan_alert');
    expect(ev.actor).toBe('li@libz.ai');
    expect(ev.metadata.session_id).toBe('l2-leak-2');
    expect(ev.metadata.matched_rule_kinds).toEqual(
      expect.arrayContaining(['aws-key', 'email']),
    );
  });

  it('never echoes the matched secret text into the audit log', async () => {
    // The privacy-critical guarantee (judge.md §V1.D step 3): an alert that
    // recorded the leaked value would itself be a leak.
    const leak = 'AKIAIOSFODNN7EXAMPLE';
    await postRawTranscript(
      'l2-leak-3',
      'li@libz.ai',
      `{"role":"user","content":"secret ${leak} here"}\n`,
    );
    expect(readAllAudit()).not.toContain(leak);
  });

  it('writes no alert for an already-clean transcript', async () => {
    await postRawTranscript(
      'l2-clean-1',
      'li@libz.ai',
      '{"role":"user","content":"please refactor the parser"}\n',
    );
    expect(readAllAudit()).not.toContain('l2_scan_alert');
  });
});

// M2 (对话上传通道) — member self-view stats. GET /v1/member-stats?user=
// returns 已上传对话总量 / 最近一次上传时间 / 敏感字段被模糊化次数, computed on
// demand from the output-dir tree. See judge.md §V1.G.
describe('mock-server — M2 member-stats', () => {
  let server: MockServerHandle;
  let outputDir: string;

  beforeEach(async () => {
    outputDir = mkdtempSync(join(tmpdir(), 'dt-m2stats-'));
    server = await startMockServer({ port: 0, outputDir, now: () => FROZEN });
  });

  afterEach(async () => {
    await server.close();
  });

  /** POST a cc-session, optionally declaring an L1 redaction count + a raw
   *  (un-redacted) transcript to exercise the server-side L2 pass. */
  async function postSession(
    sessionId: string,
    userId: string,
    opts: { l1?: number; rawTranscript?: string } = {},
  ): Promise<Response> {
    const transcript =
      opts.rawTranscript ?? '{"role":"user","content":"hello"}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const payload: Record<string, unknown> = {
      schema_version: 1,
      envelope: {
        session_id: sessionId,
        user_id: userId,
        captured_at: '2026-05-09T03:00:00.000Z',
      },
      transcript: { compression: 'gzip+base64', content: compressed.toString('base64') },
    };
    if (opts.l1 !== undefined) payload.l1_redaction_count = opts.l1;
    return fetch(`${server.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  interface MemberStatsBody {
    ok?: boolean;
    user_id?: string;
    uploaded_total?: number;
    last_upload_at?: string | null;
    redaction_count?: number;
  }

  async function getStats(
    user: string,
  ): Promise<{ status: number; body: MemberStatsBody }> {
    const res = await fetch(
      `${server.url}/v1/member-stats?user=${encodeURIComponent(user)}`,
    );
    return { status: res.status, body: (await res.json()) as MemberStatsBody };
  }

  it('400s when the user query param is missing', async () => {
    const res = await fetch(`${server.url}/v1/member-stats`);
    expect(res.status).toBe(400);
  });

  it('reports zeroed stats for a never-uploaded member', async () => {
    const { status, body } = await getStats('nobody@libz.ai');
    expect(status).toBe(200);
    expect(body.uploaded_total).toBe(0);
    expect(body.last_upload_at).toBeNull();
    expect(body.redaction_count).toBe(0);
  });

  it('counts uploaded transcripts and reports a last_upload_at', async () => {
    await postSession('stats-s1', 'zhang@libz.ai');
    await postSession('stats-s2', 'zhang@libz.ai');
    const { body } = await getStats('zhang@libz.ai');
    expect(body.uploaded_total).toBe(2);
    expect(body.last_upload_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('sums the L1 redaction count declared on the upload envelope', async () => {
    await postSession('stats-l1a', 'zhang@libz.ai', { l1: 4 });
    await postSession('stats-l1b', 'zhang@libz.ai', { l1: 1 });
    const { body } = await getStats('zhang@libz.ai');
    expect(body.redaction_count).toBe(5);
  });

  it('also counts server-side L2 redactions toward the member total', async () => {
    // A raw AWS key reaches the server un-redacted — the L2 pass scrubs it and
    // the per-session sidecar records the L2 count.
    await postSession('stats-l2', 'li@libz.ai', {
      rawTranscript: '{"role":"user","content":"key AKIAIOSFODNN7EXAMPLE"}\n',
    });
    const { body } = await getStats('li@libz.ai');
    expect(body.uploaded_total).toBe(1);
    expect(body.redaction_count).toBeGreaterThanOrEqual(1);
  });
});

