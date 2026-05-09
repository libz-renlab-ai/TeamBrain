import { describe, it, expect } from 'vitest';
import {
  buildRecordingEnvelope,
  isRecordingMetadata,
  RECORDING_CODEC_DEFAULTS,
  type RecordingMetadata,
} from '../recording.js';

const sampleMeta: RecordingMetadata = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  kind: 'recording',
  started_at: '2026-05-08T12:00:00.000Z',
  ended_at: '2026-05-08T12:00:05.000Z',
  duration_ms: 5000,
  codec: 'opus',
  bitrate: 24000,
  sample_rate: 16000,
  channels: 1,
  container: 'ogg',
  payload_size: 1234,
  source: 'recorder',
  host: { os: 'linux', arch: 'x64', hostname: 'host-1' },
  teamagent_version: '0.9.5',
  schema_version: 1,
};

describe('RECORDING_CODEC_DEFAULTS', () => {
  it('locks in opus 24k 16kHz mono OGG', () => {
    expect(RECORDING_CODEC_DEFAULTS.codec).toBe('opus');
    expect(RECORDING_CODEC_DEFAULTS.bitrate).toBe(24000);
    expect(RECORDING_CODEC_DEFAULTS.sample_rate).toBe(16000);
    expect(RECORDING_CODEC_DEFAULTS.channels).toBe(1);
    expect(RECORDING_CODEC_DEFAULTS.container).toBe('ogg');
  });
});

describe('buildRecordingEnvelope', () => {
  it('round-trips OGG bytes via base64 (no compression)', () => {
    const original = Buffer.from('OggS\x00\x02fakedata-here', 'binary');
    const env = buildRecordingEnvelope({
      metadata: sampleMeta,
      payloadBytes: original,
      identity: { user_id: 'u@h', machine_id: 'm-1' },
    });
    expect(env.payload_compression).toBe('none');
    expect(env.payload).not.toBe('');
    const decoded = Buffer.from(env.payload, 'base64');
    expect(decoded.equals(original)).toBe(true);
  });

  it('copies identity + metadata fields into envelope', () => {
    const env = buildRecordingEnvelope({
      metadata: sampleMeta,
      payloadBytes: Buffer.from('x'),
      identity: { user_id: 'alice@host', machine_id: 'mach-77' },
    });
    expect(env.schema_version).toBe(1);
    expect(env.id).toBe(sampleMeta.id);
    expect(env.user_id).toBe('alice@host');
    expect(env.machine_id).toBe('mach-77');
    expect(env.started_at).toBe(sampleMeta.started_at);
    expect(env.ended_at).toBe(sampleMeta.ended_at);
    expect(env.duration_ms).toBe(sampleMeta.duration_ms);
    expect(env.codec).toBe('opus');
    expect(env.bitrate).toBe(24000);
    expect(env.sample_rate).toBe(16000);
    expect(env.channels).toBe(1);
    expect(env.container).toBe('ogg');
    expect(env.payload_size).toBe(sampleMeta.payload_size);
    expect(env.source).toBe(sampleMeta.source);
    expect(env.host).toEqual(sampleMeta.host);
    expect(env.teamagent_version).toBe(sampleMeta.teamagent_version);
  });

  it('produces a JSON-serializable envelope', () => {
    const env = buildRecordingEnvelope({
      metadata: sampleMeta,
      payloadBytes: Buffer.from('hello opus'),
      identity: { user_id: 'u', machine_id: 'm' },
    });
    const json = JSON.stringify(env);
    const parsed = JSON.parse(json);
    expect(parsed.payload_compression).toBe('none');
    expect(parsed.codec).toBe('opus');
    expect(parsed.payload_size).toBe(sampleMeta.payload_size);
  });
});

describe('isRecordingMetadata', () => {
  it('accepts valid metadata', () => {
    expect(isRecordingMetadata(sampleMeta)).toBe(true);
  });

  it('rejects null/undefined/non-objects', () => {
    expect(isRecordingMetadata(null)).toBe(false);
    expect(isRecordingMetadata(undefined)).toBe(false);
    expect(isRecordingMetadata(42)).toBe(false);
    expect(isRecordingMetadata('str')).toBe(false);
  });

  it('rejects metadata with wrong kind', () => {
    expect(isRecordingMetadata({ ...sampleMeta, kind: 'cc-session' })).toBe(false);
  });

  it('rejects metadata missing required fields', () => {
    expect(isRecordingMetadata({ ...sampleMeta, id: 42 })).toBe(false);
    expect(isRecordingMetadata({ ...sampleMeta, started_at: undefined })).toBe(false);
    expect(isRecordingMetadata({ ...sampleMeta, codec: 'mp3' })).toBe(false);
    expect(isRecordingMetadata({ ...sampleMeta, container: 'mp4' })).toBe(false);
    const noDuration: Record<string, unknown> = { ...sampleMeta };
    delete noDuration.duration_ms;
    expect(isRecordingMetadata(noDuration)).toBe(false);
  });
});
