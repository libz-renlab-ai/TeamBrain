/**
 * Feature #2 v2 spike — SSE handler that wraps `readLatestAllUsers` and pushes
 * one event per poll cycle when the leader-roster changes. Mounted at
 * `GET /v1/cc-status/stream` by the demo / prod server.
 *
 * Wire protocol per spec at https://html.spec.whatwg.org/multipage/server-sent-events.html
 *   - Each event: `data: <json>\n\n`
 *   - Keep-alive: `: keepalive\n\n` every {@link KEEPALIVE_MS}
 *   - Diff-only: skip pushes when the serialized roster equals the last push;
 *     this caps SSE bandwidth on idle teams (typical: 1 keep-alive / 15s).
 *
 * The handler is intentionally simple: it polls the on-disk store every
 * {@link DEFAULT_POLL_MS}, computes a JSON-stable roster, and writes a frame
 * when something changed. M-F2-C judge harness §V1 measures end-to-end
 * latency under load — the poll cadence + the store p99 read time bound it.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readLatestAllUsers } from './cc-status/store.js';
import type { CcStatusQueryRow } from './cc-status/types.js';

export const DEFAULT_POLL_MS = 1000;
export const KEEPALIVE_MS = 15000;

export interface SseHandlerOptions {
  /** Directory the cc-status store reads under (per-user/per-date layout). */
  outputDir: string;
  /** Override clock for tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Override poll cadence for tests. Defaults to {@link DEFAULT_POLL_MS}. */
  pollMs?: number;
  /** Override keep-alive cadence for tests. Defaults to {@link KEEPALIVE_MS}. */
  keepaliveMs?: number;
  /**
   * Test seam — receives each frame *written to the wire* (data event or
   * keep-alive comment). Production callers do not pass this.
   */
  onFrame?: (kind: 'data' | 'keepalive', payload: string) => void;
}

/** Serialize the roster in a stable order so diff-comparison is correct. */
function serializeRoster(rows: CcStatusQueryRow[]): string {
  const sorted = [...rows].sort((a, b) => {
    if (a.user_id !== b.user_id) return a.user_id < b.user_id ? -1 : 1;
    return a.session_id < b.session_id ? -1 : 1;
  });
  return JSON.stringify({ sessions: sorted });
}

/**
 * Create an SSE handler `(req, res) => void` bound to one outputDir. The
 * handler:
 *   1. Writes the SSE headers + an initial roster snapshot frame.
 *   2. On each poll tick, re-reads the roster; if serialization changed,
 *      writes a `data:` frame.
 *   3. Every {@link KEEPALIVE_MS} (default), writes a `: keepalive` comment so
 *      proxies don't drop idle connections.
 *   4. On `req.close`, clears both timers and ends the response.
 *
 * The returned function is the same shape `node:http`'s request handler
 * expects, so it composes with `createServer((req, res) => handler(req, res))`
 * or with a route table.
 */
export function createSseHandler(opts: SseHandlerOptions) {
  const now = opts.now ?? (() => new Date());
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const keepaliveMs = opts.keepaliveMs ?? KEEPALIVE_MS;

  return function handleSse(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    let lastSerialized = '';
    const pushIfChanged = (): void => {
      const rows = readLatestAllUsers(opts.outputDir, now());
      const serialized = serializeRoster(rows);
      if (serialized === lastSerialized) return;
      lastSerialized = serialized;
      const frame = `data: ${serialized}\n\n`;
      res.write(frame);
      opts.onFrame?.('data', serialized);
    };

    // Initial frame so the client renders something immediately.
    pushIfChanged();

    const pollTimer = setInterval(pushIfChanged, pollMs);
    const keepaliveTimer = setInterval(() => {
      res.write(': keepalive\n\n');
      opts.onFrame?.('keepalive', '');
    }, keepaliveMs);

    const cleanup = (): void => {
      clearInterval(pollTimer);
      clearInterval(keepaliveTimer);
      try {
        res.end();
      } catch {
        /* response may already be torn down */
      }
    };

    _req.on('close', cleanup);
    _req.on('error', cleanup);
  };
}
