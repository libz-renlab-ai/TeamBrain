/**
 * Issue #350 — HTTP-level coverage for the cc-status ingress + query API.
 * This is J2 (upload → server got valid JSON) and the HTTP slice of J5
 * (curl /api/cc-status?user=… returns the latest snapshot for that session).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startMockServer, type MockServerHandle } from '../mock-server.js';
import { CC_STATUS_SCHEMA_VERSION } from '../cc-status/types.js';

const FROZEN = new Date('2026-05-12T09:00:00.000Z');

function snap(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: 'sess-abc123',
    user_id: 'alice',
    ts: '2026-05-12T08:30:00.000Z',
    event: 'Status',
    cwd: 'D:/proj',
    git_branch: 'feat/x',
    model: 'claude-opus-4-7',
    context_tokens: 152000,
    context_pct: 0.76,
    session_health: 'OK',
    cost_usd: 1.23,
    tokens_5h: 12400000,
    tokens_7d: 88000000,
    subscription_tier: 'max',
    five_hour_utilization: 0.87,
    seven_day_utilization: 0.41,
    five_hour_reset_at: 1747040000,
    seven_day_reset_at: 1747500000,
    quota_stale: false,
    turn_count: 14,
    tool_calls_total: 53,
    tool_calls_failed: 2,
    files_touched: 7,
    session_started_at: '2026-05-12T07:50:00.000Z',
    display_name: 'Alice',
    machine_id: 'm-1',
    ...over,
  };
}

describe('mock-server /v1/cc-status + /api/cc-status', () => {
  let server: MockServerHandle;
  let base: string;

  beforeEach(async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'dt-ccstatus-'));
    server = await startMockServer({ port: 0, outputDir, now: () => FROZEN });
    base = server.url;
  });
  afterEach(async () => {
    await server.close();
  });

  async function post(body: unknown): Promise<Response> {
    return fetch(`${base}/v1/cc-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer team-shared' },
      body: JSON.stringify(body),
    });
  }

  it('accepts a well-formed snapshot (J2: server got valid JSON)', async () => {
    const res = await post(snap());
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j.ok).toBe(true);
    expect(j.user_id).toBe('alice');
    expect(j.date).toBe('2026-05-12');
    expect(j.session_id).toBe('sess-abc123');
  });

  it('rejects a malformed snapshot with 400', async () => {
    expect((await post({ hello: 'world' })).status).toBe(400);
    expect((await post(snap({ schema_version: 99 }))).status).toBe(400);
    expect((await post(snap({ session_id: 'has space' }))).status).toBe(400);
    const res = await fetch(`${base}/v1/cc-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('round-trips: POST then GET /api/cc-status?user=&session= (J5 HTTP slice)', async () => {
    await post(snap());
    const res = await fetch(`${base}/api/cc-status?user=alice&session=sess-abc123`);
    expect(res.status).toBe(200);
    const row = (await res.json()) as Record<string, unknown>;
    expect(row.session_id).toBe('sess-abc123');
    expect(row.user_id).toBe('alice');
    expect(row.model).toBe('claude-opus-4-7');
    expect(row.context_tokens).toBe(152000);
    expect(row.cost_usd).toBe(1.23);
    expect(row.subscription_tier).toBe('max');
    expect(row.git_branch).toBe('feat/x');
    // FROZEN 09:00:00 - snapshot ts 08:30:00 = 1800s
    expect(row.stale_seconds).toBe(1800);
    expect(typeof row.stale_seconds).toBe('number');
  });

  it('GET /api/cc-status?user= lists latest per session', async () => {
    await post(snap({ session_id: 'sess-a', ts: '2026-05-12T08:00:00.000Z' }));
    await post(snap({ session_id: 'sess-a', ts: '2026-05-12T08:20:00.000Z', context_tokens: 99 }));
    await post(snap({ session_id: 'sess-b', ts: '2026-05-12T08:50:00.000Z' }));
    const res = await fetch(`${base}/api/cc-status?user=alice`);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { sessions: Array<Record<string, unknown>> };
    expect(j.sessions.map((s) => s.session_id)).toEqual(['sess-b', 'sess-a']);
    expect(j.sessions.find((s) => s.session_id === 'sess-a')!.context_tokens).toBe(99);
  });

  it('GET /api/cc-status/all spans every user', async () => {
    await post(snap({ user_id: 'alice', session_id: 'sess-a', ts: '2026-05-12T08:00:00.000Z' }));
    await post(snap({ user_id: 'bob', session_id: 'sess-b', ts: '2026-05-12T08:40:00.000Z' }));
    const res = await fetch(`${base}/api/cc-status/all`);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { sessions: Array<Record<string, unknown>> };
    expect(j.sessions.map((s) => s.user_id)).toEqual(['bob', 'alice']);
  });

  it('GET /api/cc-status/history returns the time series filtered by since', async () => {
    await post(snap({ session_id: 'sess-h', ts: '2026-05-12T08:00:00.000Z', context_tokens: 1 }));
    await post(snap({ session_id: 'sess-h', ts: '2026-05-12T08:20:00.000Z', context_tokens: 2 }));
    await post(snap({ session_id: 'sess-h', ts: '2026-05-12T08:40:00.000Z', context_tokens: 3 }));
    const all = await (await fetch(`${base}/api/cc-status/history?user=alice&session=sess-h`)).json();
    expect((all as { history: Array<Record<string, unknown>> }).history.map((r) => r.context_tokens)).toEqual([1, 2, 3]);
    const since = await (
      await fetch(`${base}/api/cc-status/history?user=alice&session=sess-h&since=${Date.parse('2026-05-12T08:15:00.000Z')}`)
    ).json();
    expect((since as { history: Array<Record<string, unknown>> }).history.map((r) => r.context_tokens)).toEqual([2, 3]);
  });

  it('GET endpoints validate user/session params', async () => {
    expect((await fetch(`${base}/api/cc-status`)).status).toBe(400);
    expect((await fetch(`${base}/api/cc-status?user=..`)).status).toBe(400);
    expect((await fetch(`${base}/api/cc-status?user=alice&session=../etc`)).status).toBe(400);
    expect((await fetch(`${base}/api/cc-status?user=nobody&session=sess-x`)).status).toBe(404);
    expect((await fetch(`${base}/api/cc-status/history?user=alice`)).status).toBe(400);
  });

  it('does not crash on an out-of-range ?since (regression: parseSinceMs clamp)', async () => {
    await post(snap({ session_id: 'sess-h', ts: '2026-05-12T08:00:00.000Z' }));
    // 99999999999999999 ms would overflow `new Date(...)` → RangeError → uncaught
    // → process crash without the clamp. Must return 200.
    const res = await fetch(`${base}/api/cc-status/history?user=alice&session=sess-h&since=99999999999999999`);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { since: string; history: unknown[] };
    expect(typeof j.since).toBe('string'); // a valid ISO string, not a thrown RangeError
    // server is still alive afterwards
    expect((await fetch(`${base}/api/users`)).status).toBe(200);
  });

  it('clamps an over-long cwd in the stored snapshot (length-cap)', async () => {
    await post(snap({ session_id: 'sess-big', cwd: 'D:/' + 'x'.repeat(50_000) }));
    const row = (await (await fetch(`${base}/api/cc-status?user=alice&session=sess-big`)).json()) as Record<string, unknown>;
    expect((row.cwd as string).length).toBe(4096);
  });

  it('still routes the unrelated /api/users + 404s unknown paths', async () => {
    expect((await fetch(`${base}/api/users`)).status).toBe(200);
    expect((await fetch(`${base}/api/cc-status/bogus`)).status).toBe(404);
    expect((await fetch(`${base}/v1/nope`, { method: 'POST', body: '{}' })).status).toBe(404);
  });
});
