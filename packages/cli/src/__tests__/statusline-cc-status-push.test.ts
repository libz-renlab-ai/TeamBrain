/**
 * Issue #350 — the statusline pushes a CC runtime status snapshot to the
 * digital-twin server (throttled, detached). Black-box: spawn the real
 * `scripts/teamagent-statusline.cjs` with a CC stdin payload, point its
 * uploader at a real {@link startMockServer}, then poll the query API.
 *
 * Covers: J2 (server got a valid snapshot) + the client slice of J5 (a CC
 * render makes the structured status retrievable over HTTP), J3 (rapid renders
 * → exactly one push thanks to the .last-push throttle), J4 (a hung server
 * doesn't slow the statusline — detached child), plus the opt-out / disabled
 * paths.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startMockServer, type MockServerHandle } from '@teamagent/digital-twin';

const requireCjs = createRequire(import.meta.url);
const { DatabaseSync } = requireCjs('node:sqlite') as typeof import('node:sqlite');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');
const STATUSLINE = path.join(REPO_ROOT, 'scripts', 'teamagent-statusline.cjs');

function mkTmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-iss350-'));
}

function seedDbs(home: string): void {
  fs.mkdirSync(path.join(home, '.teamagent'), { recursive: true });
  const g = new DatabaseSync(path.join(home, '.teamagent', 'global.db'));
  g.exec('CREATE TABLE knowledge (status TEXT, type TEXT, created_at TEXT)');
  g.close();
  const e = new DatabaseSync(path.join(home, '.teamagent', 'events.db'));
  e.exec('CREATE TABLE events (kind TEXT, timestamp TEXT)');
  e.close();
}

function writeDigitalTwinConfig(
  home: string,
  over: Record<string, unknown> = {},
): void {
  const cfg = {
    schema_version: '1',
    identity: { user_id: 'alice', machine_id: 'm-1' },
    uploader: { enabled: true, endpoint: '', token: 'team-shared' },
    ...over,
  };
  fs.mkdirSync(path.join(home, '.teamagent'), { recursive: true });
  fs.writeFileSync(path.join(home, '.teamagent', 'digital-twin.json'), JSON.stringify(cfg), 'utf-8');
}

function writeQuotaCache(home: string): void {
  const dir = path.join(home, '.teamagent', 'digital-twin');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'quota-cache.json'),
    JSON.stringify({
      subscription_tier: 'max',
      five_hour_utilization: 0.87,
      seven_day_utilization: 0.41,
      five_hour_reset_at: 1747040000,
      seven_day_reset_at: 1747500000,
      probed_at: '2026-05-12T07:00:00.000Z',
      stale: false,
    }),
    'utf-8',
  );
}

function writeTranscript(home: string, opts?: { huge?: boolean }): string {
  const dir = path.join(home, '.claude', 'projects', 'fake');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'sess350.jsonl');
  const now = Date.now();
  const lines: string[] = [];
  lines.push(
    JSON.stringify({ type: 'user', timestamp: new Date(now - 600_000).toISOString(), message: { role: 'user', content: 'hi' } }),
  );
  lines.push(
    JSON.stringify({
      type: 'assistant',
      timestamp: new Date(now - 120_000).toISOString(),
      message: {
        role: 'assistant',
        model: 'claude-opus-4-7',
        usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 30, output_tokens: 20 },
        content: [
          { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
          { type: 'tool_use', name: 'Write', input: { file_path: '/proj/a.ts' } },
        ],
      },
    }),
  );
  lines.push(
    JSON.stringify({
      type: 'user',
      timestamp: new Date(now - 110_000).toISOString(),
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'boom', is_error: true }] },
    }),
  );
  lines.push(
    JSON.stringify({
      type: 'assistant',
      timestamp: new Date(now - 60_000).toISOString(),
      message: {
        role: 'assistant',
        model: 'claude-opus-4-7',
        usage: { input_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 8000, output_tokens: 80 },
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/proj/b.ts' } }],
      },
    }),
  );
  if (opts?.huge) {
    // pad past the 4 MB full-scan cap so only session_started_at survives
    const filler = JSON.stringify({ type: 'system', subtype: 'noise', blob: 'x'.repeat(4096) });
    for (let i = 0; i < 1100; i++) lines.push(filler);
  }
  fs.writeFileSync(file, lines.join('\n'), 'utf-8');
  return file;
}

function runStatusline(
  home: string,
  payload: string,
  cwd?: string,
): { stdout: string; stderr: string; status: number } {
  const out = spawnSync('node', [STATUSLINE], {
    cwd: cwd ?? home,
    env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config') },
    encoding: 'utf-8',
    input: payload,
  });
  return { stdout: out.stdout, stderr: out.stderr, status: out.status ?? -1 };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollLatest(
  base: string,
  user: string,
  session: string,
  timeoutMs = 8000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/cc-status?user=${user}&session=${session}`);
      if (res.status === 200) return (await res.json()) as Record<string, unknown>;
    } catch {
      /* server not ready / not yet posted */
    }
    await sleep(120);
  }
  return null;
}

function ccPayload(transcript: string, over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    hook_event_name: 'Status',
    session_id: 'sess350',
    transcript_path: transcript,
    cwd: '/fake/proj',
    model: { id: 'opus-4-7', display_name: 'Opus 4.7 (1M)' },
    cost: { total_cost_usd: 0.42 },
    exceeds_200k_tokens: false,
    ...over,
  });
}

describe('statusline issue #350 — push CC status snapshot', () => {
  it('pushes a snapshot retrievable over HTTP after a CC render (J2 + J5 client slice)', async () => {
    const home = mkTmpHome();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iss350-srv-'));
    let server: MockServerHandle | undefined;
    try {
      seedDbs(home);
      writeQuotaCache(home);
      server = await startMockServer({ port: 0, outputDir });
      writeDigitalTwinConfig(home, { uploader: { enabled: true, endpoint: server.url, token: 'team-shared' } });
      const transcript = writeTranscript(home);

      const r = runStatusline(home, ccPayload(transcript));
      expect(r.status).toBe(0);
      // statusline still renders the legacy line — the push is fire-and-forget
      expect(r.stdout).toContain('TeamAgent | 规则:');

      const row = await pollLatest(server.url, 'alice', 'sess350');
      expect(row, 'snapshot should be retrievable from the server').not.toBeNull();
      expect(row!.session_id).toBe('sess350');
      expect(row!.user_id).toBe('alice');
      expect(row!.event).toBe('Status');
      expect(row!.machine_id).toBe('m-1');
      expect(row!.cwd).toBe('/fake/proj');
      expect(row!.model).toBe('Opus 4.7 (1M)');
      expect(row!.cost_usd).toBe(0.42);
      expect(row!.session_health).toBe('OK');
      // latest assistant turn: input 200 + cache_read 8000 = 8200
      expect(row!.context_tokens).toBe(8200);
      expect(row!.subscription_tier).toBe('max');
      expect(row!.five_hour_utilization).toBe(0.87);
      expect(row!.quota_stale).toBe(false);
      expect(row!.turn_count).toBe(2);
      expect(row!.tool_calls_total).toBe(3);
      expect(row!.tool_calls_failed).toBe(1);
      expect(row!.files_touched).toBe(2);
      expect(typeof row!.session_started_at).toBe('string');
      expect(typeof row!.tokens_5h).toBe('number');
      expect(typeof row!.tokens_7d).toBe('number');
      expect(typeof row!.stale_seconds).toBe('number');
      expect(row!.schema_version).toBe(1);
      // a real CC session → /api/cc-status/all contains this user (J5 roster slice)
      const all = (await (await fetch(`${server.url}/api/cc-status/all`)).json()) as {
        sessions: Array<Record<string, unknown>>;
      };
      expect(all.sessions.some((s) => s.user_id === 'alice' && s.session_id === 'sess350')).toBe(true);
      // the detached push carries the body over stdin — no temp file leaked
      expect(fs.readdirSync(os.tmpdir()).some((n) => n.startsWith('teamagent-ccstatus-'))).toBe(false);
    } finally {
      if (server) await server.close();
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('throttles rapid renders to one push via ~/.teamagent/cc-status/.last-push (J3)', async () => {
    const home = mkTmpHome();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iss350-srv-'));
    let server: MockServerHandle | undefined;
    try {
      seedDbs(home);
      server = await startMockServer({ port: 0, outputDir });
      writeDigitalTwinConfig(home, { uploader: { enabled: true, endpoint: server.url, token: 'team-shared' } });
      const transcript = writeTranscript(home);

      runStatusline(home, ccPayload(transcript));
      runStatusline(home, ccPayload(transcript)); // < 30s later → must be throttled
      runStatusline(home, ccPayload(transcript));

      // first push lands, then give any (erroneous) extra pushes time to land too
      const first = await pollLatest(server.url, 'alice', 'sess350');
      expect(first).not.toBeNull();
      await sleep(800);
      const hist = (await (
        await fetch(`${server.url}/api/cc-status/history?user=alice&session=sess350&since=0`)
      ).json()) as { history: Array<Record<string, unknown>> };
      expect(hist.history.length).toBe(1);
      // the throttle stamp exists
      expect(fs.existsSync(path.join(home, '.teamagent', 'cc-status', '.last-push'))).toBe(true);
    } finally {
      if (server) await server.close();
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('does not block the statusline when the server hangs / is unreachable (J4)', () => {
    const home = mkTmpHome();
    try {
      seedDbs(home);
      // 127.0.0.1:1 — nothing listening; a synchronous POST here would hang.
      writeDigitalTwinConfig(home, { uploader: { enabled: true, endpoint: 'http://127.0.0.1:1', token: 't' } });
      const transcript = writeTranscript(home);
      const started = Date.now();
      const r = runStatusline(home, ccPayload(transcript));
      const elapsed = Date.now() - started;
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('TeamAgent | 规则:');
      // detached push → the statusline must return well under any plausible
      // network timeout (the child's own fetch timeout is 10s).
      expect(elapsed).toBeLessThan(4000);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('does not push when the uploader is disabled / token missing', async () => {
    const home = mkTmpHome();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iss350-srv-'));
    let server: MockServerHandle | undefined;
    try {
      seedDbs(home);
      server = await startMockServer({ port: 0, outputDir });
      // enabled:false
      writeDigitalTwinConfig(home, { uploader: { enabled: false, endpoint: server.url, token: 'team-shared' } });
      const transcript = writeTranscript(home);
      runStatusline(home, ccPayload(transcript));
      await sleep(700);
      let res = await fetch(`${server.url}/api/cc-status?user=alice`);
      let j = (await res.json()) as { sessions: unknown[] };
      expect(j.sessions).toHaveLength(0);

      // enabled:true but token missing
      writeDigitalTwinConfig(home, { uploader: { enabled: true, endpoint: server.url, token: null } });
      runStatusline(home, ccPayload(transcript));
      await sleep(700);
      res = await fetch(`${server.url}/api/cc-status?user=alice`);
      j = (await res.json()) as { sessions: unknown[] };
      expect(j.sessions).toHaveLength(0);
      // and no throttle stamp written
      expect(fs.existsSync(path.join(home, '.teamagent', 'cc-status', '.last-push'))).toBe(false);
    } finally {
      if (server) await server.close();
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('omits the count aggregates for a huge transcript but still pushes (perf guard)', async () => {
    const home = mkTmpHome();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iss350-srv-'));
    let server: MockServerHandle | undefined;
    try {
      seedDbs(home);
      server = await startMockServer({ port: 0, outputDir });
      writeDigitalTwinConfig(home, { uploader: { enabled: true, endpoint: server.url, token: 'team-shared' } });
      const transcript = writeTranscript(home, { huge: true });
      runStatusline(home, ccPayload(transcript));
      const row = await pollLatest(server.url, 'alice', 'sess350');
      expect(row).not.toBeNull();
      // session_started_at still derived from the head of the file...
      expect(typeof row!.session_started_at).toBe('string');
      // ...but turn_count / tool_calls_* / files_touched are NOT reported (would
      // be undercounts from the head-only read).
      expect(row).not.toHaveProperty('turn_count');
      expect(row).not.toHaveProperty('tool_calls_total');
      expect(row).not.toHaveProperty('files_touched');
    } finally {
      if (server) await server.close();
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
