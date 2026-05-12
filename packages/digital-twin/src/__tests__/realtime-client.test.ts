/**
 * Feature #2 v2 spike test — fire-and-forget contract for postCcStatusSnapshot.
 *
 * Plan v2 §3 thresholds asserted here:
 *   - timeout, offline (network refused) and 5xx all swallowed (no throw)
 *   - no retry on any failure branch (single fetch call per invocation)
 *   - onOutcome reports the exact branch (ok / timeout / network / http_5xx / http_4xx)
 *
 * Latency-budget probes (≤5ms p99 hook overhead) live in the judge.md harness;
 * this test only proves the no-throw / no-retry / no-block invariants the
 * client guarantees on its own.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CC_STATUS_SCHEMA_VERSION,
  type CcStatusSnapshot,
} from '../cc-status/types.js';
import { postCcStatusSnapshot, type PostCcStatusOutcome } from '../realtime-client.js';

const SNAPSHOT: CcStatusSnapshot = {
  schema_version: CC_STATUS_SCHEMA_VERSION,
  session_id: 'sess_test_001',
  user_id: 'user_test_001',
  ts: '2026-05-13T00:00:00.000Z',
  event: 'session_start',
};

function captureOutcome(): { outcomes: PostCcStatusOutcome[]; record: (o: PostCcStatusOutcome) => void } {
  const outcomes: PostCcStatusOutcome[] = [];
  return { outcomes, record: (o) => outcomes.push(o) };
}

describe('postCcStatusSnapshot — fire-and-forget contract', () => {
  it('returns ok on 2xx and calls fetch exactly once', async () => {
    const { outcomes, record } = captureOutcome();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await postCcStatusSnapshot(SNAPSHOT, {
      baseUrl: 'http://receiver.local',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onOutcome: record,
    });
    expect(outcomes).toEqual(['ok']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('swallows 5xx without throwing and does not retry', async () => {
    const { outcomes, record } = captureOutcome();
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 503 }));
    await expect(
      postCcStatusSnapshot(SNAPSHOT, {
        baseUrl: 'http://receiver.local',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onOutcome: record,
      }),
    ).resolves.toBeUndefined();
    expect(outcomes).toEqual(['http_5xx']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('swallows network errors (offline / refused) without throwing', async () => {
    const { outcomes, record } = captureOutcome();
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
    });
    await expect(
      postCcStatusSnapshot(SNAPSHOT, {
        baseUrl: 'http://receiver.local',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        onOutcome: record,
      }),
    ).resolves.toBeUndefined();
    expect(outcomes).toEqual(['network']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('aborts on timeout, reports outcome=timeout, never throws', async () => {
    const { outcomes, record } = captureOutcome();
    const fetchImpl = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        }),
    );
    const start = Date.now();
    await postCcStatusSnapshot(SNAPSHOT, {
      baseUrl: 'http://receiver.local',
      timeoutMs: 25,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onOutcome: record,
    });
    const elapsed = Date.now() - start;
    expect(outcomes).toEqual(['timeout']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Loose upper bound — only proves we didn't hang past timeout by 100×.
    expect(elapsed).toBeLessThan(500);
  });

  it('attaches Bearer token when bearerToken is set', async () => {
    let observedAuth: string | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      observedAuth = headers?.authorization;
      return new Response(null, { status: 204 });
    });
    await postCcStatusSnapshot(SNAPSHOT, {
      baseUrl: 'http://receiver.local',
      bearerToken: 'tk_abc',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(observedAuth).toBe('Bearer tk_abc');
  });

  it('handles baseUrl with or without trailing slash identically', async () => {
    const seenUrls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL) => {
      seenUrls.push(typeof url === 'string' ? url : url.toString());
      return new Response(null, { status: 204 });
    });
    await postCcStatusSnapshot(SNAPSHOT, {
      baseUrl: 'http://receiver.local',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await postCcStatusSnapshot(SNAPSHOT, {
      baseUrl: 'http://receiver.local/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(seenUrls).toEqual([
      'http://receiver.local/v1/cc-status',
      'http://receiver.local/v1/cc-status',
    ]);
  });
});
