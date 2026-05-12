/**
 * Feature #2 v2 spike — fire-and-forget cc-status push for SessionStart /
 * UserPromptSubmit hooks. Lands ahead of FIXEDFLOW grill so M-F2-A has a
 * concrete starting artifact, but is NOT wired into any hook bundle here —
 * that wiring lives in M-F2-B per
 * `docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md` v2.
 *
 * Contract (plan v2 §1 / §3 / §5):
 * - Never throws — `await postCcStatusSnapshot(...)` is safe on any hook path.
 * - Never blocks — `timeoutMs` defaults to 50; AbortController fires the
 *   request and the request races a setTimeout that aborts it.
 * - Never retries — drops on timeout / offline / 5xx. M5 git-sync remains the
 *   final-consistency fallback.
 * - No queue, no batching — every call is one POST or one drop.
 *
 * Caller wiring (M-F2-B, not in this file):
 *   import { postCcStatusSnapshot } from '@teamagent/digital-twin/realtime-client';
 *   void postCcStatusSnapshot(snapshot, { baseUrl, timeoutMs: 50 });
 *
 * Test coverage: `__tests__/realtime-client.test.ts` exercises 200 / timeout /
 * network-refused / 5xx; load + latency probes live in the judge.md harness.
 */
import type { CcStatusSnapshot } from './cc-status/types.js';

export interface PostCcStatusOptions {
  /** Receiver base URL (no trailing slash); `${baseUrl}/v1/cc-status` is the target. */
  baseUrl: string;
  /** Abort after this many ms. Plan v2 §1 caps at 50. */
  timeoutMs?: number;
  /** Optional bearer token (cc-status endpoint is already auth-gated upstream of plan v2). */
  bearerToken?: string;
  /** Test seam — defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Test seam — receives outcome ('ok' | 'timeout' | 'http_5xx' | 'http_4xx' | 'network' | 'aborted')
   * for assertion. Production callers do not pass this; the contract is fire-and-forget.
   */
  onOutcome?: (outcome: PostCcStatusOutcome) => void;
}

export type PostCcStatusOutcome =
  | 'ok'
  | 'timeout'
  | 'http_5xx'
  | 'http_4xx'
  | 'network'
  | 'aborted';

const DEFAULT_TIMEOUT_MS = 50;

/**
 * Fire-and-forget POST one cc-status snapshot. Returns a Promise that always
 * resolves (never rejects). Production callers should `void`-discard it; the
 * `onOutcome` hook exists so tests can assert which branch fired without
 * relying on returned values.
 */
export async function postCcStatusSnapshot(
  snapshot: CcStatusSnapshot,
  opts: PostCcStatusOptions,
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/$/, '')}/v1/cc-status`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.bearerToken) headers.authorization = `Bearer ${opts.bearerToken}`;

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  // unref so a long-lived Node process can exit cleanly even if a hook fires
  // right before exit and the timer hasn't elapsed yet.
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }

  try {
    const resp = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(snapshot),
      signal: ctrl.signal,
    });
    // Cancel the response body immediately — we never read it, and undici
    // otherwise buffers up to its high-water mark until GC. A malicious
    // receiver returning a huge chunked body would otherwise OOM the hook
    // process over a long-lived session. Best-effort; ignore cancel errors.
    try {
      const body = (resp as unknown as { body?: { cancel?: () => Promise<void> } }).body;
      if (body && typeof body.cancel === 'function') {
        void body.cancel().catch(() => { /* best-effort */ });
      }
    } catch { /* best-effort */ }
    if (resp.status >= 500) opts.onOutcome?.('http_5xx');
    else if (resp.status >= 400) opts.onOutcome?.('http_4xx');
    else opts.onOutcome?.('ok');
  } catch (err) {
    if (timedOut) opts.onOutcome?.('timeout');
    else if (err instanceof Error && err.name === 'AbortError') opts.onOutcome?.('aborted');
    else opts.onOutcome?.('network');
  } finally {
    // Always clear the timer — earlier code only cleared on resolve/reject,
    // so a sync throw inside fetchImpl would leak the timer for `timeoutMs`.
    clearTimeout(timer);
  }
}
