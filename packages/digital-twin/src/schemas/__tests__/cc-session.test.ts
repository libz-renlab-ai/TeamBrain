import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import {
  buildCcSessionEnvelope,
  isCcSessionMetadata,
  type CcSessionMetadata,
} from '../cc-session.js';

const sampleMeta: CcSessionMetadata = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  kind: 'cc-session',
  session_id: 'sess-xyz',
  cwd: '/home/foo/proj',
  project_name: 'proj',
  transcript_path: '/home/foo/.claude/projects/-home-foo-proj/sess-xyz.jsonl',
  payload_size: 42,
  captured_at: '2026-05-08T12:34:56.789Z',
  source: 'stop-hook',
  host: { os: 'linux', arch: 'x64', hostname: 'host-1' },
  teamagent_version: '0.9.5',
  schema_version: 1,
};

describe('buildCcSessionEnvelope', () => {
  it('round-trips payload bytes via gzip+base64 (transcript block)', () => {
    const original = Buffer.from('{"type":"user"}\n{"type":"assistant"}\n', 'utf-8');
    const env = buildCcSessionEnvelope({
      metadata: sampleMeta,
      payloadBytes: original,
      identity: { user_id: 'u@h', machine_id: 'm-1' },
    });
    expect(env.transcript.compression).toBe('gzip+base64');
    expect(env.transcript.content).not.toBe('');
    const decompressed = gunzipSync(Buffer.from(env.transcript.content, 'base64'));
    expect(decompressed.toString('utf-8')).toBe(original.toString('utf-8'));
  });

  it('copies identity + metadata fields into envelope block (issue #146 F2 nested shape)', () => {
    const env = buildCcSessionEnvelope({
      metadata: sampleMeta,
      payloadBytes: Buffer.from('x'),
      identity: { user_id: 'alice@host', machine_id: 'mach-77' },
    });
    expect(env.schema_version).toBe(1);
    expect(env.envelope.id).toBe(sampleMeta.id);
    expect(env.envelope.user_id).toBe('alice@host');
    expect(env.envelope.machine_id).toBe('mach-77');
    expect(env.envelope.session_id).toBe(sampleMeta.session_id);
    expect(env.envelope.cwd).toBe(sampleMeta.cwd);
    expect(env.envelope.project_name).toBe(sampleMeta.project_name);
    expect(env.envelope.transcript_path).toBe(sampleMeta.transcript_path);
    expect(env.envelope.payload_size).toBe(sampleMeta.payload_size);
    expect(env.envelope.captured_at).toBe(sampleMeta.captured_at);
    expect(env.envelope.source).toBe(sampleMeta.source);
    expect(env.envelope.host).toEqual(sampleMeta.host);
    expect(env.envelope.teamagent_version).toBe(sampleMeta.teamagent_version);
  });

  it('produces a JSON-serializable envelope (mock-server can read it)', () => {
    const env = buildCcSessionEnvelope({
      metadata: sampleMeta,
      payloadBytes: Buffer.from('hello world'),
      identity: { user_id: 'u', machine_id: 'm' },
    });
    const json = JSON.stringify(env);
    const parsed = JSON.parse(json);
    expect(parsed.envelope.session_id).toBe(sampleMeta.session_id);
    expect(parsed.envelope.user_id).toBe('u');
    expect(parsed.envelope.captured_at).toBe(sampleMeta.captured_at);
    expect(parsed.transcript.compression).toBe('gzip+base64');
    expect(typeof parsed.transcript.content).toBe('string');
    expect(parsed.transcript.content.length).toBeGreaterThan(0);
  });

  // Issue #146 F9: consented_at flows from identity into envelope block.
  it('forwards consented_at from identity into envelope block', () => {
    const env = buildCcSessionEnvelope({
      metadata: sampleMeta,
      payloadBytes: Buffer.from('x'),
      identity: {
        user_id: 'u',
        machine_id: 'm',
        consented_at: '2026-05-10T00:00:00.000Z',
      },
    });
    expect(env.envelope.consented_at).toBe('2026-05-10T00:00:00.000Z');
  });

  it('defaults consented_at to null when identity does not provide it', () => {
    const env = buildCcSessionEnvelope({
      metadata: sampleMeta,
      payloadBytes: Buffer.from('x'),
      identity: { user_id: 'u', machine_id: 'm' },
    });
    expect(env.envelope.consented_at).toBeNull();
  });
});

describe('isCcSessionMetadata', () => {
  it('accepts valid metadata', () => {
    expect(isCcSessionMetadata(sampleMeta)).toBe(true);
  });

  it('rejects null/undefined/non-objects', () => {
    expect(isCcSessionMetadata(null)).toBe(false);
    expect(isCcSessionMetadata(undefined)).toBe(false);
    expect(isCcSessionMetadata(42)).toBe(false);
    expect(isCcSessionMetadata('str')).toBe(false);
  });

  it('rejects metadata missing required fields', () => {
    expect(isCcSessionMetadata({ ...sampleMeta, id: 42 })).toBe(false);
    expect(isCcSessionMetadata({ ...sampleMeta, kind: 'recording' })).toBe(false);
    expect(isCcSessionMetadata({ ...sampleMeta, session_id: undefined })).toBe(false);
    const noTranscript: Record<string, unknown> = { ...sampleMeta };
    delete noTranscript.transcript_path;
    expect(isCcSessionMetadata(noTranscript)).toBe(false);
  });
});
