import { describe, it, expect } from 'vitest';
import { uploadCcSession, classifyResponse, type FetchLike } from '../uploader.js';
import type { CcSessionMetadata } from '../../schemas/cc-session.js';

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

describe('uploadCcSession', () => {
  it('200 → success', async () => {
    const out = await uploadCcSession(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn: fetchStub(200) },
    );
    expect(out.kind).toBe('success');
  });

  it('401 → auth-failed', async () => {
    const out = await uploadCcSession(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 'bad', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn: fetchStub(401, 'unauthorized') },
    );
    expect(out.kind).toBe('auth-failed');
  });

  it('500 → transient', async () => {
    const out = await uploadCcSession(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn: fetchStub(500) },
    );
    expect(out.kind).toBe('transient');
  });

  it('400 → permanent-failure', async () => {
    const out = await uploadCcSession(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn: fetchStub(400, 'bad request') },
    );
    expect(out.kind).toBe('permanent-failure');
  });

  it('thrown fetch → network-error', async () => {
    const fetchFn: FetchLike = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    const out = await uploadCcSession(
      { metadata: meta, payloadBytes: Buffer.from('x'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      { fetchFn },
    );
    expect(out.kind).toBe('network-error');
    if (out.kind === 'network-error') {
      expect(out.error).toContain('ECONNREFUSED');
    }
  });

  it('sends POST to {endpoint}/v1/cc-sessions with Bearer + Idempotency-Key', async () => {
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    await uploadCcSession(
      {
        metadata: meta,
        payloadBytes: Buffer.from('hi'),
        endpoint: 'http://h:8080/',
        token: 'tk',
        identity: { user_id: 'u@h', machine_id: 'm-1' },
      },
      { fetchFn: fetchStub(200, '', capture) },
    );
    expect(capture.url).toBe('http://h:8080/v1/cc-sessions');
    expect(capture.init?.method).toBe('POST');
    expect(capture.init?.headers['authorization']).toBe('Bearer tk');
    expect(capture.init?.headers['idempotency-key']).toBe(meta.id);
    expect(capture.init?.headers['content-type']).toBe('application/json');
    const body = JSON.parse(capture.init!.body);
    expect(body.schema_version).toBe(1);
    expect(body.user_id).toBe('u@h');
    expect(body.machine_id).toBe('m-1');
    expect(body.id).toBe(meta.id);
    expect(typeof body.payload).toBe('string');
    expect(body.payload_compression).toBe('gzip+base64');
  });

  it('uses injected buildEnvelope', async () => {
    const capture: { url?: string; init?: Parameters<FetchLike>[1] } = {};
    let buildCalled = 0;
    await uploadCcSession(
      { metadata: meta, payloadBytes: Buffer.from('hi'), endpoint: 'http://h:8080', token: 't', identity: { user_id: 'u', machine_id: 'm' } },
      {
        fetchFn: fetchStub(200, '', capture),
        buildEnvelope: (input) => {
          buildCalled++;
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
            payload: 'STUB',
            captured_at: input.metadata.captured_at,
            source: input.metadata.source,
            host: input.metadata.host,
            teamagent_version: input.metadata.teamagent_version,
          };
        },
      },
    );
    expect(buildCalled).toBe(1);
    const body = JSON.parse(capture.init!.body);
    expect(body.payload).toBe('STUB');
  });
});
