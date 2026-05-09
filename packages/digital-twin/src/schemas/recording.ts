/**
 * Schema B: recording payload destined for `POST /v1/recordings`.
 *
 * The audio payload (an OGG container with Opus inside) is already a
 * compressed bitstream, so we only base64-encode it for the JSON envelope.
 * `payload_compression: 'none'` makes the no-gzip contract explicit.
 *
 * NOTE: As of PR-4, recordings live in `~/.teamagent/digital-twin/queue/recording_temp/`
 * (NOT pending/). PR-3's daemon `loadEntry` only validates `cc-session` metadata,
 * so dropping recording entries into pending/ would dead-letter them. Routing
 * recordings into the daemon + uploading via `/v1/recordings` is a follow-up
 * after PR-5.
 */

export const RECORDING_CODEC_DEFAULTS = Object.freeze({
  codec: 'opus' as const,
  bitrate: 24000,
  sample_rate: 16000,
  channels: 1 as const,
  container: 'ogg' as const,
});

export interface RecordingMetadata {
  id: string;
  kind: 'recording';
  started_at: string;
  ended_at: string;
  duration_ms: number;
  codec: 'opus';
  bitrate: number;
  sample_rate: number;
  channels: number;
  container: 'ogg';
  payload_size: number;
  source: string;
  host: { os: string; arch: string; hostname: string };
  teamagent_version: string;
  schema_version: 1;
}

export interface RecordingEnvelope {
  schema_version: 1;
  id: string;
  kind: 'recording';
  user_id: string;
  machine_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  codec: 'opus';
  bitrate: number;
  sample_rate: number;
  channels: number;
  container: 'ogg';
  payload_compression: 'none';
  payload_size: number;
  payload: string; // base64(OGG bytes)
  source: string;
  host: { os: string; arch: string; hostname: string };
  teamagent_version: string;
}

export interface BuildRecordingEnvelopeInput {
  metadata: RecordingMetadata;
  payloadBytes: Buffer;
  identity: { user_id: string; machine_id: string };
}

export function buildRecordingEnvelope(
  input: BuildRecordingEnvelopeInput,
): RecordingEnvelope {
  const payloadB64 = input.payloadBytes.toString('base64');
  return {
    schema_version: 1,
    id: input.metadata.id,
    kind: 'recording',
    user_id: input.identity.user_id,
    machine_id: input.identity.machine_id,
    started_at: input.metadata.started_at,
    ended_at: input.metadata.ended_at,
    duration_ms: input.metadata.duration_ms,
    codec: input.metadata.codec,
    bitrate: input.metadata.bitrate,
    sample_rate: input.metadata.sample_rate,
    channels: input.metadata.channels,
    container: input.metadata.container,
    payload_compression: 'none',
    payload_size: input.metadata.payload_size,
    payload: payloadB64,
    source: input.metadata.source,
    host: input.metadata.host,
    teamagent_version: input.metadata.teamagent_version,
  };
}

/** Type guard for parsing recording metadata read from disk. */
export function isRecordingMetadata(v: unknown): v is RecordingMetadata {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    o.kind === 'recording' &&
    typeof o.started_at === 'string' &&
    typeof o.ended_at === 'string' &&
    typeof o.duration_ms === 'number' &&
    o.codec === 'opus' &&
    typeof o.bitrate === 'number' &&
    typeof o.sample_rate === 'number' &&
    typeof o.channels === 'number' &&
    o.container === 'ogg' &&
    typeof o.payload_size === 'number' &&
    typeof o.source === 'string' &&
    typeof o.teamagent_version === 'string' &&
    o.schema_version === 1
  );
}
