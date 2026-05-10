/**
 * Schema B: recording payload destined for `POST /v1/recordings`.
 *
 * Wire shape (issue #146 F2 — aligned with mock-server.ts validation):
 *
 *   {
 *     "schema_version": 1,
 *     "envelope": { recording_id, user_id, machine_id, started_at, ... },
 *     "audio": { "compression": "none", "codec": ..., "content": "<base64 OGG>" }
 *   }
 *
 * Server reads `obj.envelope.recording_id` / `obj.envelope.user_id` and
 * `obj.audio.content`. The pre-F2 flat shape (`{schema_version, id, ...,
 * payload}`) parsed but lost the recording_id binding — server fell back
 * to a randomized id and dropped the audio under user_id="unknown".
 *
 * The audio bitstream (OGG/Opus container) is already compressed, so we
 * only base64-encode it for JSON. `audio.compression: 'none'` makes the
 * no-gzip contract explicit.
 *
 * Note (issue #146 F3): recordings now route through the daemon's
 * `pending/` queue alongside cc-sessions; the previous `recording_temp/`
 * holding directory is no longer used. The daemon's `loadEntry` is
 * kind-aware as of F3 and dispatches to `POST /v1/recordings` for
 * `metadata.kind === 'recording'`.
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

/** Inner envelope block — what mock-server.ts reads under `obj.envelope` for /v1/recordings. */
export interface RecordingEnvelopeBlock {
  id: string;
  /** Mirror of id — server validates this field on /v1/recordings. */
  recording_id: string;
  user_id: string;
  machine_id: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  payload_size: number;
  source: string;
  host: { os: string; arch: string; hostname: string };
  teamagent_version: string;
  /** ISO timestamp first persisted into config (issue #146 F9 audit field). */
  consented_at: string | null;
}

export interface RecordingAudioBlock {
  compression: 'none';
  codec: 'opus';
  bitrate: number;
  sample_rate: number;
  channels: number;
  container: 'ogg';
  content: string; // base64(OGG bytes)
}

export interface RecordingEnvelope {
  schema_version: 1;
  envelope: RecordingEnvelopeBlock;
  audio: RecordingAudioBlock;
}

export interface BuildRecordingEnvelopeInput {
  metadata: RecordingMetadata;
  payloadBytes: Buffer;
  identity: {
    user_id: string;
    machine_id: string;
    /** Issue #146 F9 — audit-trail timestamp of first config persist. */
    consented_at?: string | null;
  };
}

export function buildRecordingEnvelope(
  input: BuildRecordingEnvelopeInput,
): RecordingEnvelope {
  const payloadB64 = input.payloadBytes.toString('base64');
  return {
    schema_version: 1,
    envelope: {
      id: input.metadata.id,
      recording_id: input.metadata.id,
      user_id: input.identity.user_id,
      machine_id: input.identity.machine_id,
      started_at: input.metadata.started_at,
      ended_at: input.metadata.ended_at,
      duration_ms: input.metadata.duration_ms,
      payload_size: input.metadata.payload_size,
      source: input.metadata.source,
      host: input.metadata.host,
      teamagent_version: input.metadata.teamagent_version,
      consented_at: input.identity.consented_at ?? null,
    },
    audio: {
      compression: 'none',
      codec: input.metadata.codec,
      bitrate: input.metadata.bitrate,
      sample_rate: input.metadata.sample_rate,
      channels: input.metadata.channels,
      container: input.metadata.container,
      content: payloadB64,
    },
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
