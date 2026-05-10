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

export interface CcSessionEnvelope {
  schema_version: 1;
  envelope: CcSessionEnvelopeBlock;
  transcript: CcSessionTranscriptBlock;
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
}

export function buildCcSessionEnvelope(input: BuildEnvelopeInput): CcSessionEnvelope {
  const compressed = gzipSync(input.payloadBytes);
  const payloadB64 = compressed.toString('base64');
  return {
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
