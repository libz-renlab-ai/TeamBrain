import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { uploadEntry, classifyResponse, type FetchLike } from '../uploader.js';
import type {
  CcSessionMetadata,
  CcSessionEnvelope,
} from '../../schemas/cc-session.js';
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

  // Issue #283 — defaultBuildEnvelope forwards metadata.quota into the
  // wire envelope when present, omits it when absent (back-compat).
  it('cc-session: forwards metadata.quota onto envelope.quota when present', async () => {
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    const metaWithQuota = {
      ...meta,
      quota: {
        subscription_tier: 'max/default_claude_max_20x',
        five_hour_utilization: 0.35,
        seven_day_utilization: 0.42,
        five_hour_reset_at: 1778481000,
        seven_day_reset_at: 1778626800,
        probed_at: '2026-05-11T03:00:00.000Z',
        stale: false,
      },
    };
    await uploadEntry(
      {
        metadata: metaWithQuota,
        payloadBytes: Buffer.from('hi'),
        endpoint: 'http://h:8080',
        token: 'tk',
        identity: { user_id: 'u', machine_id: 'm' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    const body = JSON.parse(capture.init!.body);
    expect(body.quota).toEqual(metaWithQuota.quota);
  });

  it('cc-session: omits envelope.quota entirely when metadata.quota is absent', async () => {
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    await uploadEntry(
      {
        metadata: meta,
        payloadBytes: Buffer.from('hi'),
        endpoint: 'http://h:8080',
        token: 'tk',
        identity: { user_id: 'u', machine_id: 'm' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    const body = JSON.parse(capture.init!.body);
    expect(body.quota).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(body, 'quota')).toBe(false);
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

// M2 (对话上传通道) — L1 redaction. The uploader scrubs sensitive strings out
// of cc-session transcripts before they leave the machine, and reports the
// redaction count on the wire envelope.
describe('uploadEntry — L1 redaction', () => {
  /** gunzip the transcript block the uploader actually sent. */
  function uploadedTranscript(body: string): string {
    const env = JSON.parse(body) as CcSessionEnvelope;
    return gunzipSync(Buffer.from(env.transcript.content, 'base64')).toString('utf8');
  }

  it('redacts secrets from a cc-session transcript before upload', async () => {
    const raw =
      '{"role":"user","content":"my key is sk-ant-api03-LEAKED0123456789abc and email alice@personal.com"}\n';
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    await uploadEntry(
      {
        metadata: meta,
        payloadBytes: Buffer.from(raw, 'utf8'),
        endpoint: 'http://h:8080',
        token: 't',
        identity: { user_id: 'u', machine_id: 'm' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    const sent = uploadedTranscript(capture.init!.body);
    expect(sent).not.toContain('sk-ant-api03-LEAKED0123456789abc');
    expect(sent).not.toContain('alice@personal.com');
    expect(sent).toContain('[redacted]');
  });

  it('reports the L1 redaction count on the envelope', async () => {
    const raw =
      '{"role":"user","content":"key sk-ant-api03-LEAKED0123456789abc id 110101199003078515"}\n';
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    await uploadEntry(
      {
        metadata: meta,
        payloadBytes: Buffer.from(raw, 'utf8'),
        endpoint: 'http://h:8080',
        token: 't',
        identity: { user_id: 'u', machine_id: 'm' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    const env = JSON.parse(capture.init!.body) as CcSessionEnvelope;
    // secret + chinese-id = 2 findings.
    expect(env.l1_redaction_count).toBe(2);
  });

  it('sets l1_redaction_count to 0 for a clean transcript', async () => {
    const raw = '{"role":"user","content":"please refactor the parser"}\n';
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    await uploadEntry(
      {
        metadata: meta,
        payloadBytes: Buffer.from(raw, 'utf8'),
        endpoint: 'http://h:8080',
        token: 't',
        identity: { user_id: 'u', machine_id: 'm' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    const env = JSON.parse(capture.init!.body) as CcSessionEnvelope;
    expect(env.l1_redaction_count).toBe(0);
    expect(uploadedTranscript(capture.init!.body)).toBe(raw);
  });

  it('leaves recording (binary audio) uploads untouched — no redaction pass', async () => {
    const audio = Buffer.from('OggS-binary-audio-not-text-redactable');
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    const out = await uploadEntry(
      {
        metadata: recordingMeta,
        payloadBytes: audio,
        endpoint: 'http://h:8080',
        token: 't',
        identity: { user_id: 'u', machine_id: 'm' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    expect(out.kind).toBe('success');
    const env = JSON.parse(capture.init!.body) as Record<string, unknown>;
    // recordings carry no l1_redaction_count field.
    expect(env.l1_redaction_count).toBeUndefined();
  });
});
