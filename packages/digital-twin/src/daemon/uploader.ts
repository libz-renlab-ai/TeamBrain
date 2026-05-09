/**
 * Single-shot uploader for the digital-twin daemon.
 *
 * Per plan §1.4:
 *   POST ${endpoint}/v1/cc-sessions
 *   Authorization: Bearer ${token}
 *   Idempotency-Key: <id>
 *
 *   200 / 204 → success
 *   401       → auth failed (caller should exit 1; user must re-login)
 *   429 / 5xx → transient, retry with exponential backoff
 *   other 4xx → permanent client error → dead-letter
 */
import {
  buildCcSessionEnvelope,
  type CcSessionEnvelope,
  type CcSessionMetadata,
} from '../schemas/cc-session.js';

export type UploadOutcome =
  | { kind: 'success'; status: number }
  | { kind: 'auth-failed'; status: number; body?: string }
  | { kind: 'transient'; status: number; body?: string }
  | { kind: 'permanent-failure'; status: number; body?: string }
  | { kind: 'network-error'; error: string };

export interface UploadInput {
  metadata: CcSessionMetadata;
  payloadBytes: Buffer;
  endpoint: string;
  token: string;
  identity: { user_id: string; machine_id: string };
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{ status: number; text: () => Promise<string> }>;

export interface UploadDeps {
  fetchFn?: FetchLike;
  buildEnvelope?: (input: UploadInput) => CcSessionEnvelope;
}

const defaultBuildEnvelope = (input: UploadInput): CcSessionEnvelope =>
  buildCcSessionEnvelope({
    metadata: input.metadata,
    payloadBytes: input.payloadBytes,
    identity: input.identity,
  });

export async function uploadCcSession(
  input: UploadInput,
  deps: UploadDeps = {},
): Promise<UploadOutcome> {
  const buildFn = deps.buildEnvelope ?? defaultBuildEnvelope;
  const fetchFn = deps.fetchFn ?? ((globalThis as unknown as { fetch?: FetchLike }).fetch as FetchLike | undefined);
  if (!fetchFn) {
    return { kind: 'network-error', error: 'global fetch is not available' };
  }

  const envelope = buildFn(input);
  const url = stripTrailingSlash(input.endpoint) + '/v1/cc-sessions';

  let res: { status: number; text: () => Promise<string> };
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.token}`,
        'idempotency-key': input.metadata.id,
      },
      body: JSON.stringify(envelope),
    });
  } catch (err) {
    return {
      kind: 'network-error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return classifyResponse(res.status, await safeReadBody(res));
}

async function safeReadBody(res: { text: () => Promise<string> }): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

export function classifyResponse(status: number, body?: string): UploadOutcome {
  if (status === 200 || status === 204) return { kind: 'success', status };
  if (status === 401) return { kind: 'auth-failed', status, body };
  if (status === 429 || (status >= 500 && status < 600)) {
    return { kind: 'transient', status, body };
  }
  return { kind: 'permanent-failure', status, body };
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
