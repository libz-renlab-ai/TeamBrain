/**
 * Feature #2 v2 spike test — SSE handler contract.
 *
 * Asserts:
 *   - first frame is emitted immediately on connect
 *   - subsequent frames only fire when the roster JSON actually changes
 *   - keep-alive comments fire on the configured cadence
 *   - cleanup on req.close clears both timers
 *
 * Wall-clock-sensitive — uses tight poll/keepalive intervals so the test stays
 * fast. Real-world latency budgets live in the judge.md harness, not here.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CC_STATUS_SCHEMA_VERSION,
  type CcStatusSnapshot,
} from '../cc-status/types.js';
import { appendCcStatusSnapshot } from '../cc-status/store.js';
import { createSseHandler } from '../realtime-stream.js';

function makeSnapshot(user: string, session: string, event: string, isoTs: string): CcStatusSnapshot {
  return {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: session,
    user_id: user,
    ts: isoTs,
    event,
  };
}

function fakeReqRes(): {
  req: IncomingMessage;
  res: ServerResponse & { written: string[]; headers?: Record<string, string | number | readonly string[]> };
} {
  const req = new EventEmitter() as IncomingMessage;
  // Fake just enough of ServerResponse for SSE.
  const written: string[] = [];
  let headers: Record<string, string | number | readonly string[]> | undefined;
  const res = {
    writeHead(_status: number, h?: Record<string, string | number | readonly string[]>) {
      headers = h;
    },
    write(chunk: string) {
      written.push(chunk);
      return true;
    },
    end() {
      /* noop */
    },
    get headers() {
      return headers;
    },
    written,
  } as unknown as ServerResponse & {
    written: string[];
    headers?: Record<string, string | number | readonly string[]>;
  };
  return { req, res };
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('createSseHandler', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'realtime-sse-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('emits an initial empty roster frame, then a data frame after a new write', async () => {
    const frames: Array<{ kind: string; payload: string }> = [];
    const handler = createSseHandler({
      outputDir: dir,
      pollMs: 30,
      keepaliveMs: 10_000,
      onFrame: (kind, payload) => frames.push({ kind, payload }),
    });

    const { req, res } = fakeReqRes();
    handler(req, res);

    // Initial frame is empty roster.
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0]!.kind).toBe('data');
    expect(JSON.parse(frames[0]!.payload).sessions).toEqual([]);

    // Append a snapshot — the poll should pick it up within pollMs * 2.
    appendCcStatusSnapshot(
      dir,
      makeSnapshot('alice', 'sess-1', 'session_start', '2026-05-13T01:00:00.000Z'),
    );

    await wait(120); // > 2× pollMs

    const dataFrames = frames.filter((f) => f.kind === 'data');
    expect(dataFrames.length).toBeGreaterThanOrEqual(2);
    const latest = JSON.parse(dataFrames[dataFrames.length - 1]!.payload);
    expect(latest.sessions).toHaveLength(1);
    expect(latest.sessions[0].user_id).toBe('alice');
    expect(latest.sessions[0].session_id).toBe('sess-1');

    req.emit('close');
  });

  it('does NOT emit duplicate frames when nothing changes', async () => {
    const frames: Array<{ kind: string; payload: string }> = [];
    const handler = createSseHandler({
      outputDir: dir,
      pollMs: 20,
      keepaliveMs: 10_000,
      onFrame: (kind, payload) => frames.push({ kind, payload }),
    });

    const { req, res } = fakeReqRes();
    handler(req, res);

    await wait(150); // 7+ poll cycles with no writes

    const dataFrames = frames.filter((f) => f.kind === 'data');
    expect(dataFrames.length).toBe(1); // only initial empty-roster frame

    req.emit('close');
  });

  it('fires keep-alive comments on cadence', async () => {
    const frames: Array<{ kind: string; payload: string }> = [];
    const handler = createSseHandler({
      outputDir: dir,
      pollMs: 1_000,
      keepaliveMs: 40,
      onFrame: (kind, payload) => frames.push({ kind, payload }),
    });

    const { req, res } = fakeReqRes();
    handler(req, res);

    await wait(150); // ≥3 keep-alive ticks

    const keepalives = frames.filter((f) => f.kind === 'keepalive');
    expect(keepalives.length).toBeGreaterThanOrEqual(2);

    req.emit('close');
  });

  it('cleans up timers when req.close fires (no leak)', async () => {
    const frames: Array<{ kind: string; payload: string }> = [];
    const handler = createSseHandler({
      outputDir: dir,
      pollMs: 15,
      keepaliveMs: 15,
      onFrame: (kind, payload) => frames.push({ kind, payload }),
    });

    const { req, res } = fakeReqRes();
    handler(req, res);

    await wait(50);
    const beforeClose = frames.length;
    req.emit('close');
    await wait(100); // Plenty of time for any leaked timer to fire.
    const afterClose = frames.length;

    expect(afterClose).toBe(beforeClose);
  });
});
