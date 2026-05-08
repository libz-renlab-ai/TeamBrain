/**
 * Schema A: cc-session payload uploaded to `POST /v1/cc-sessions`.
 *
 * The transcript JSONL is gzipped + base64-encoded so the entire envelope is
 * a single JSON document. The receiving server can decompress + decode to
 * recover the original transcript bytes.
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

export interface CcSessionEnvelope {
  schema_version: 1;
  id: string;
  user_id: string;
  machine_id: string;
  session_id: string;
  cwd: string;
  project_name: string;
  transcript_path: string;
  payload_size: number;
  payload_compression: 'gzip+base64';
  payload: string; // base64(gzip(transcript bytes))
  captured_at: string;
  source: string;
  host: { os: string; arch: string; hostname: string };
  teamagent_version: string;
}

export interface BuildEnvelopeInput {
  metadata: CcSessionMetadata;
  payloadBytes: Buffer;
  identity: { user_id: string; machine_id: string };
}

export function buildCcSessionEnvelope(input: BuildEnvelopeInput): CcSessionEnvelope {
  const compressed = gzipSync(input.payloadBytes);
  const payloadB64 = compressed.toString('base64');
  return {
    schema_version: 1,
    id: input.metadata.id,
    user_id: input.identity.user_id,
    machine_id: input.identity.machine_id,
    session_id: input.metadata.session_id,
    cwd: input.metadata.cwd,
    project_name: input.metadata.project_name,
    transcript_path: input.metadata.transcript_path,
    payload_size: input.metadata.payload_size,
    payload_compression: 'gzip+base64',
    payload: payloadB64,
    captured_at: input.metadata.captured_at,
    source: input.metadata.source,
    host: input.metadata.host,
    teamagent_version: input.metadata.teamagent_version,
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
