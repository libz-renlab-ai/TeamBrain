/**
 * Single-shot uploader for the digital-twin daemon.
 *
 * Issue #146 F3: kind-aware dispatch. The same uploader handles
 * `cc-session` (POST /v1/cc-sessions, gzip+base64 jsonl) and `recording`
 * (POST /v1/recordings, base64 OGG) entries; route + envelope builder are
 * selected from `metadata.kind` so process-manager can stay kind-agnostic.
 *
 * Auth + classification:
 *   200 / 204 → success
 *   401       → auth failed (caller should exit 1; user must re-login)
 *   429 / 5xx → transient, retry with exponential backoff
 *   other 4xx → permanent client error → dead-letter
 */
import { detectSensitiveText, redactSensitiveText } from '@teamagent/core';
import {
  buildCcSessionEnvelope,
  type CcSessionEnvelope,
  type CcSessionMetadata,
} from '../schemas/cc-session.js';
import {
  buildRecordingEnvelope,
  type RecordingEnvelope,
  type RecordingMetadata,
} from '../schemas/recording.js';

export type UploadOutcome =
  | { kind: 'success'; status: number }
  | { kind: 'auth-failed'; status: number; body?: string }
  | { kind: 'transient'; status: number; body?: string }
  | { kind: 'permanent-failure'; status: number; body?: string }
  | { kind: 'network-error'; error: string };

export type UploadEntryMetadata = CcSessionMetadata | RecordingMetadata;
export type UploadEntryEnvelope = CcSessionEnvelope | RecordingEnvelope;

export interface UploadIdentity {
  user_id: string;
  machine_id: string;
  /** Issue #146 F9 — propagated into envelope as audit-trail field. */
  consented_at?: string | null;
}

export interface UploadInput {
  metadata: UploadEntryMetadata;
  payloadBytes: Buffer;
  endpoint: string;
  token: string;
  identity: UploadIdentity;
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
  buildEnvelope?: (input: UploadInput) => UploadEntryEnvelope;
}

const ROUTE_BY_KIND: Record<UploadEntryMetadata['kind'], string> = {
  'cc-session': '/v1/cc-sessions',
  recording: '/v1/recordings',
};

const defaultBuildEnvelope = (input: UploadInput): UploadEntryEnvelope => {
  if (input.metadata.kind === 'recording') {
    return buildRecordingEnvelope({
      metadata: input.metadata,
      payloadBytes: input.payloadBytes,
      identity: input.identity,
    });
  }
  // Issue #283: forward optional quota from metadata into the wire envelope
  // so the collector writes the sibling quota.json. Absent on pre-#283
  // entries — buildCcSessionEnvelope omits the field entirely when undefined.
  return buildCcSessionEnvelope({
    metadata: input.metadata,
    payloadBytes: input.payloadBytes,
    identity: input.identity,
    quota: input.metadata.quota,
  });
};

/**
 * POST one queue entry to the matching upstream endpoint. Pre-F3 this was
 * `uploadCcSession` (cc-session only); F3 widens it to dispatch on
 * `metadata.kind` and handle recordings via /v1/recordings.
 */
export async function uploadEntry(
  input: UploadInput,
  deps: UploadDeps = {},
): Promise<UploadOutcome> {
  const buildFn = deps.buildEnvelope ?? defaultBuildEnvelope;
  const fetchFn = deps.fetchFn ?? ((globalThis as unknown as { fetch?: FetchLike }).fetch as FetchLike | undefined);
  if (!fetchFn) {
    return { kind: 'network-error', error: 'global fetch is not available' };
  }

  // M2 (对话上传通道) — L1 redaction. Scrub sensitive strings (keys, tokens,
  // emails, Chinese IDs, ...) out of cc-session transcripts BEFORE they leave
  // this machine ("命中敏感信息的字段就地模糊化处理，原文不出本机"). This runs
  // in the uploader daemon — a detached process, NOT the Stop-hook path — so
  // the collector's <=5ms latency budget is untouched. Recordings carry binary
  // audio that is not text-redactable, so they pass through unchanged.
  let effectiveInput = input;
  let l1RedactionCount = 0;
  if (input.metadata.kind === 'cc-session') {
    const raw = input.payloadBytes.toString('utf8');
    l1RedactionCount = detectSensitiveText(raw).length;
    if (l1RedactionCount > 0) {
      effectiveInput = {
        ...input,
        payloadBytes: Buffer.from(redactSensitiveText(raw), 'utf8'),
      };
    }
  }

  const envelope = buildFn(effectiveInput);
  // Surface how many fields L1 scrubbed so the member can see "敏感字段被模糊化
  // 次数" — the count travels on the wire envelope; the collector persists it.
  if (effectiveInput.metadata.kind === 'cc-session') {
    (envelope as CcSessionEnvelope).l1_redaction_count = l1RedactionCount;
  }
  const url = stripTrailingSlash(input.endpoint) + ROUTE_BY_KIND[input.metadata.kind];

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

/** @deprecated Pre-F3 alias retained for any external callers; new code should use uploadEntry. */
export const uploadCcSession = uploadEntry;

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
