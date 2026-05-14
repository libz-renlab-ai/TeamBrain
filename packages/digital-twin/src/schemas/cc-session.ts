/**
 * Schema A: cc-session payload uploaded to `POST /v1/cc-sessions`.
 *
 * Wire shape (issue #146 F2 — aligned with mock-server.ts validation):
 *
 *   {
 *     "schema_version": 1,
 *     "envelope": { session_id, user_id, machine_id, captured_at, ... },
 *     "transcript": { "compression": "gzip+base64", "content": "<base64 of gzipped jsonl>" }
 *   }
 *
 * Server reads `obj.envelope.session_id` / `obj.envelope.user_id` /
 * `obj.envelope.captured_at` and `obj.transcript.content`. The pre-F2
 * flat shape (`{schema_version, id, user_id, payload, ...}`) was rejected
 * silently; the server returned 200 but only the bytes ever landed (id was
 * randomized + user_id fell back to "unknown"). F2 reshapes the output of
 * buildCcSessionEnvelope so the server's existing readers find what they
 * expect, without changing the server side.
 */
import { gzipSync } from 'node:zlib';

export interface CcSessionMetadata {
  id: string;
  kind: 'cc-session';
  session_id: string;
  cwd: string;
  project_name: string;
  transcript_path: string;
  payload_size: number;
  captured_at: string;
  source: string;
  host: { os: string; arch: string; hostname: string };
  teamagent_version: string;
  schema_version: 1;
  /**
   * Issue #283 — optional Max-tier quota snapshot persisted alongside the
   * queue entry. When present, the uploader forwards it onto the wire
   * envelope so the collector writes a sibling `quota.json` per user/day.
   * Absent on entries enqueued by the existing single-session Stop tap.
   */
  quota?: CcSessionQuotaBlock;
  /**
   * Issue #266 F7 — ISO timestamp of the first transient/network upload
   * failure. Persisted into the queue metadata file so the 24h
   * dead-letter window survives daemon idle-self-exits. Absent on
   * entries that have never failed.
   */
  first_failed_at?: string;
}

/** Inner envelope block — what mock-server.ts reads under `obj.envelope`. */
export interface CcSessionEnvelopeBlock {
  id: string;
  user_id: string;
  machine_id: string;
  session_id: string;
  cwd: string;
  project_name: string;
  transcript_path: string;
  payload_size: number;
  captured_at: string;
  source: string;
  host: { os: string; arch: string; hostname: string };
  teamagent_version: string;
  /** ISO timestamp first persisted into config (issue #146 F9 audit field). */
  consented_at: string | null;
}

export interface CcSessionTranscriptBlock {
  compression: 'gzip+base64';
  content: string; // base64(gzip(transcript bytes))
}

/**
 * Issue #283 — Claude Code Max quota snapshot.
 *
 * Sourced from the `anthropic-ratelimit-unified-*` response headers on a
 * 1-token probe to `POST /v1/messages`. The collector writes this block
 * (when present) to `<user>/<date>/quota.json` so the dashboard can render
 * 5h / 7d progress bars per user.
 *
 * `stale: true` means the probe call failed (auth, 429, network) and the
 * payload reflects the last successful cache instead of a live read. The
 * collector still persists stale snapshots so users with a long-broken
 * probe don't silently disappear from the dashboard.
 */
export interface CcSessionQuotaBlock {
  /** e.g. "max" + "default_claude_max_20x" — joined from .credentials.json. */
  subscription_tier: string;
  /** 5-hour rolling window utilization, 0-1 inclusive. */
  five_hour_utilization: number;
  /** 7-day rolling window utilization, 0-1 inclusive. */
  seven_day_utilization: number;
  /** Unix seconds when the 5h window resets. */
  five_hour_reset_at: number;
  /** Unix seconds when the 7d window resets. */
  seven_day_reset_at: number;
  /** ISO timestamp at which the probe was performed. */
  probed_at: string;
  /** True when payload is from a cache fallback (probe failed). */
  stale: boolean;
}

export interface CcSessionEnvelope {
  schema_version: 1;
  envelope: CcSessionEnvelopeBlock;
  transcript: CcSessionTranscriptBlock;
  /** Issue #283 — optional Max-tier quota snapshot piggy-backed on the envelope. */
  quota?: CcSessionQuotaBlock;
  /**
   * M2 (对话上传通道) — number of sensitive fields the uploader's L1 pass
   * scrubbed from this transcript before upload. Absent on pre-M2 envelopes;
   * the collector persists it so a member can see "敏感字段被模糊化次数".
   */
  l1_redaction_count?: number;
}

export interface BuildEnvelopeInput {
  metadata: CcSessionMetadata;
  payloadBytes: Buffer;
  identity: {
    user_id: string;
    machine_id: string;
    /** Issue #146 F9 — audit-trail timestamp of first config persist. */
    consented_at?: string | null;
  };
  /** Issue #283 — optional quota snapshot to attach to the envelope. */
  quota?: CcSessionQuotaBlock;
}

export function buildCcSessionEnvelope(input: BuildEnvelopeInput): CcSessionEnvelope {
  const compressed = gzipSync(input.payloadBytes);
  const payloadB64 = compressed.toString('base64');
  const env: CcSessionEnvelope = {
    schema_version: 1,
    envelope: {
      id: input.metadata.id,
      user_id: input.identity.user_id,
      machine_id: input.identity.machine_id,
      session_id: input.metadata.session_id,
      cwd: input.metadata.cwd,
      project_name: input.metadata.project_name,
      transcript_path: input.metadata.transcript_path,
      payload_size: input.metadata.payload_size,
      captured_at: input.metadata.captured_at,
      source: input.metadata.source,
      host: input.metadata.host,
      teamagent_version: input.metadata.teamagent_version,
      consented_at: input.identity.consented_at ?? null,
    },
    transcript: {
      compression: 'gzip+base64',
      content: payloadB64,
    },
  };
  if (input.quota) env.quota = input.quota;
  return env;
}

/** Type guard for parsing metadata read from disk. */
export function isCcSessionMetadata(v: unknown): v is CcSessionMetadata {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    o.kind === 'cc-session' &&
    typeof o.session_id === 'string' &&
    typeof o.cwd === 'string' &&
    typeof o.transcript_path === 'string' &&
    typeof o.captured_at === 'string'
  );
}
