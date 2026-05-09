import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { runProdServer } from '../bin-prod-server.js';

describe('runProdServer', () => {
  it('binds host/port from env, writes to $TEAMAGENT_COLLECTOR_DIR, logs ready', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'dt-prod-'));
    const logs: string[] = [];
    let info: { url: string; outputDir: string } | undefined;

    const close = await runProdServer({
      env: {
        PORT: '0',
        HOST: '127.0.0.1',
        TEAMAGENT_COLLECTOR_DIR: outputDir,
      } as NodeJS.ProcessEnv,
      homedir: () => '/tmp/notused',
      log: (msg: string) => logs.push(msg),
      onReady: (i) => {
        info = i;
      },
    });

    expect(info).toBeDefined();
    expect(info!.outputDir).toBe(outputDir);
    expect(info!.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(logs.some((l) => l.includes('listening on'))).toBe(true);
    expect(logs.some((l) => l.includes(outputDir))).toBe(true);

    const transcript = '{"x":1}\n';
    const compressed = gzipSync(Buffer.from(transcript));
    const res = await fetch(`${info!.url}/v1/cc-sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        envelope: {
          session_id: 'prod-smoke-1',
          user_id: 'tester@libz.ai',
          captured_at: '2026-05-09T03:00:00.000Z',
        },
        transcript: { content: compressed.toString('base64') },
      }),
    });
    expect(res.status).toBe(200);
    expect(
      existsSync(join(outputDir, 'tester@libz.ai', '2026-05-09', 'prod-smoke-1.jsonl')),
    ).toBe(true);

    await close();
  });

  it('falls back to $HOME/teamagent-collector when env var unset', async () => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'dt-home-'));
    let info: { outputDir: string } | undefined;
    const close = await runProdServer({
      env: { PORT: '0', HOST: '127.0.0.1' } as NodeJS.ProcessEnv,
      homedir: () => fakeHome,
      log: () => {},
      onReady: (i) => {
        info = i;
      },
    });
    expect(info!.outputDir).toBe(join(fakeHome, 'teamagent-collector'));
    await close();
  });

  it('throws on non-integer PORT (e.g. PORT=foo) instead of silently binding random port', async () => {
    await expect(
      runProdServer({
        env: { PORT: 'foo', HOST: '127.0.0.1' } as NodeJS.ProcessEnv,
        homedir: () => tmpdir(),
        log: () => {},
      }),
    ).rejects.toThrow(/invalid PORT/);
  });

  it('throws on out-of-range PORT', async () => {
    await expect(
      runProdServer({
        env: { PORT: '99999', HOST: '127.0.0.1' } as NodeJS.ProcessEnv,
        homedir: () => tmpdir(),
        log: () => {},
      }),
    ).rejects.toThrow(/invalid PORT/);
  });
});
