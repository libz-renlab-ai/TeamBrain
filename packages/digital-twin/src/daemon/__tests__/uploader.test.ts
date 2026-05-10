import { describe, it, expect } from 'vitest';
import { uploadEntry, classifyResponse, type FetchLike } from '../uploader.js';
import type { CcSessionMetadata } from '../../schemas/cc-session.js';
import type { RecordingMetadata } from '../../schemas/recording.js';

const meta: CcSessionMetadata = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  kind: 'cc-session',
  session_id: 'sess-1',
  cwd: '/proj',
  project_name: 'proj',
  transcript_path: '/x',
  payload_size: 4,
  captured_at: '2026-05-08T00:00:00Z',
  source: 'stop-hook',
  host: { os: 'linux', arch: 'x64', hostname: 'h' },
  teamagent_version: '0.0.0',
  schema_version: 1,
};

const recordingMeta: RecordingMetadata = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5REC',
  kind: 'recording',
  started_at: '2026-05-08T00:00:00Z',
  ended_at: '2026-05-08T00:00:05Z',
  duration_ms: 5000,
  codec: 'opus',
  bitrate: 24000,
  sample_rate: 16000,
  channels: 1,
  container: 'ogg',
  payload_size: 1234,
  source: 'recorder',
  host: { os: 'linux', arch: 'x64', hostname: 'h' },
  teamagent_version: '0.0.0',
  schema_version: 1,
};

function fetchStub(
  status: number,
  body = '',
  capture?: { url?: string; init?: Parameters<FetchLike>[1] },
): FetchLike {
  return async (url, init) => {
    if (capture) {
      capture.url = url;
      capture.init = init;
    }
    return {
      status,
      text: async () => body,
    };
  };
}

describe('classifyResponse', () => {
  it.each([
    [200, 'success'],
    [204, 'success'],
    [401, 'auth-failed'],
    [429, 'transient'],
    [500, 'transient'],
    [502, 'transient'],
    [599, 'transient'],
    [400, 'permanent-failure'],
    [403, 'permanent-failure'],
    [404, 'permanent-failure'],
    [422, 'permanent-failure'],
  ])('status %i → %s', (status, kind) => {
    expect(classifyResponse(status).kind).toBe(kind);
  });
});

describe('uploadEntry', () => {
  it('200 → success', async () => {
    const out = await uploadEntry(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn: fetchStub(200) },
    );
    expect(out.kind).toBe('success');
  });

  it('401 → auth-failed', async () => {
    const out = await uploadEntry(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 'bad', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn: fetchStub(401, 'unauthorized') },
    );
    expect(out.kind).toBe('auth-failed');
  });

  it('500 → transient', async () => {
    const out = await uploadEntry(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn: fetchStub(500) },
    );
    expect(out.kind).toBe('transient');
  });

  it('400 → permanent-failure', async () => {
    const out = await uploadEntry(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn: fetchStub(400, 'bad request') },
    );
    expect(out.kind).toBe('permanent-failure');
  });

  it('thrown fetch → network-error', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const out = await uploadEntry(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn },
    );
    expect(out.kind).toBe('network-error');
    if (out.kind === 'network-error') {
      expect(out.error).toContain('ECONNREFUSED');
    }
  });

  it('cc-session: POST {endpoint}/v1/cc-sessions, nested envelope+transcript shape (issue #146 F2)', async () => {
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    await uploadEntry(
      {
        metadata: meta,
        payloadBytes: Buffer.from('hi'),
        endpoint: 'http://h:8080/',
        token: 'tk',
        identity: { user_id: 'u@h', machine_id: 'm-1', consented_at: '2026-05-10T00:00:00Z' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    expect(capture.url).toBe('http://h:8080/v1/cc-sessions');
    expect(capture.init?.method).toBe('POST');
    expect(capture.init?.headers['authorization']).toBe('Bearer tk');
    expect(capture.init?.headers['idempotency-key']).toBe(meta.id);
    expect(capture.init?.headers['content-type']).toBe('application/json');
    const body = JSON.parse(capture.init!.body);
    // Server reads obj.envelope.session_id / obj.envelope.user_id /
    // obj.envelope.captured_at and obj.transcript.content; F2 reshape
    // feeds these directly under nested blocks.
    expect(body.schema_version).toBe(1);
    expect(body.envelope.user_id).toBe('u@h');
    expect(body.envelope.machine_id).toBe('m-1');
    expect(body.envelope.id).toBe(meta.id);
    expect(body.envelope.session_id).toBe(meta.session_id);
    expect(body.envelope.captured_at).toBe(meta.captured_at);
    expect(body.envelope.consented_at).toBe('2026-05-10T00:00:00Z');
    expect(body.transcript.compression).toBe('gzip+base64');
    expect(typeof body.transcript.content).toBe('string');
    // Pre-F2 flat fields no longer at top level (regression guard).
    expect(body.payload).toBeUndefined();
    expect(body.session_id).toBeUndefined();
    expect(body.user_id).toBeUndefined();
  });

  // Issue #146 F3 — recording entries dispatch to /v1/recordings.
  it('recording: POST {endpoint}/v1/recordings, audio block (issue #146 F3 dispatch)', async () => {
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    const oggBytes = Buffer.from('OggS\x00\x02fakedata-here', 'binary');
    await uploadEntry(
      {
        metadata: recordingMeta,
        payloadBytes: oggBytes,
        endpoint: 'http://h:8080',
        token: 'tk',
        identity: { user_id: 'u@h', machine_id: 'm-1' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    expect(capture.url).toBe('http://h:8080/v1/recordings');
    expect(capture.init?.headers['idempotency-key']).toBe(recordingMeta.id);
    const body = JSON.parse(capture.init!.body);
    // Server reads envelope.recording_id and audio.content for /v1/recordings.
    expect(body.schema_version).toBe(1);
    expect(body.envelope.recording_id).toBe(recordingMeta.id);
    expect(body.envelope.user_id).toBe('u@h');
    expect(body.audio.compression).toBe('none');
    expect(body.audio.codec).toBe('opus');
    expect(typeof body.audio.content).toBe('string');
  });

  it('uses injected buildEnvelope (cc-session shape)', async () => {
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    let buildCalled = 0;
    await uploadEntry(
      { metadata: meta, payloadBytes: Buffer.from('hi'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      {
        fetchFn: fetchStub(200, '', capture),
        buildEnvelope: (input) => {
          buildCalled++;
          if (input.metadata.kind !== 'cc-session') {
            throw new Error('test stub only handles cc-session');
          }
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
              content: 'STUB',
            },
          };
        },
      },
    );
    expect(buildCalled).toBe(1);
    const body = JSON.parse(capture.init!.body);
    expect(body.transcript.content).toBe('STUB');
  });
});
