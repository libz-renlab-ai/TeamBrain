// M2 (对话上传通道) 质量验收 — "敏感信息扫描的召回率不低于 95%（用一份预先
// 准备的含密钥的对话样本测）". This is a regression gate: a fixed corpus of
// known sensitive strings, embedded in a realistic transcript, run through the
// same uploader L1 path that scrubs real uploads. If a future change weakens a
// redaction pattern, recall drops below 0.95 and this test fails.
//
// Verified by judge.md §V1.A step 5, which greps this test's stdout for the
// `recall=<float>` line.
import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { uploadEntry, type FetchLike } from '../uploader.js';
import type { CcSessionMetadata, CcSessionEnvelope } from '../../schemas/cc-session.js';

/**
 * The prepared "含密钥的对话样本" — every entry is a string that MUST NOT
 * survive L1 redaction. Covers each detector kind so a regression in any one
 * pattern is caught. `label` is for diagnostics only.
 */
const SENSITIVE_SAMPLES: Array<{ label: string; value: string }> = [
  { label: 'email', value: 'alice.wong@personal-gmail.com' },
  { label: 'email-2', value: 'bob_dev@contractor.io' },
  { label: 'env-api-key', value: 'OPENAI_API_KEY=sk-proj-9f8a7b6c5d4e3f2a1b0c' },
  { label: 'env-secret', value: 'DB_PASSWORD=h0rr1bl3-s3cr3t-value' },
  { label: 'bearer', value: 'Authorization: Bearer abcdef0123456789abcdef0123' },
  { label: 'anthropic-key', value: 'sk-ant-api03-aBcDeF0123456789-_xYz' },
  { label: 'openai-sk', value: 'sk-1234567890abcdefghijABCDEF' },
  { label: 'github-pat', value: 'ghp_AbCdEf0123456789AbCdEf0123456789' },
  { label: 'aws-key', value: 'AKIAIOSFODNN7EXAMPLE' },
  {
    label: 'jwt',
    value:
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHDpStEfxBA',
  },
  { label: 'uuid', value: '550e8400-e29b-41d4-a716-446655440000' },
  { label: 'private-ip', value: '192.168.1.100' },
  { label: 'private-ip-10', value: '10.0.42.7' },
  { label: 'internal-host', value: 'postgres-primary.db.internal' },
  { label: 'private-path-unix', value: '/Users/alice/.ssh/id_rsa' },
  { label: 'private-path-win', value: 'C:\\Users\\bob\\AppData\\creds.json' },
  { label: 'phone', value: '+1-555-123-4567' },
  { label: 'credit-card', value: '4532015112830366' },
  { label: 'chinese-id', value: '110101199003078515' },
  { label: 'chinese-id-x', value: '11010119900307851X' },
];

/**
 * Build a multi-turn transcript with each secret embedded in prose.
 *
 * The lines are plain text (not JSON.stringify'd): the redactor is a pure
 * text-regex function, so embedding each secret literally tests pattern
 * coverage honestly. JSON-escaping would double the backslashes in the
 * Windows-path sample and let it count as "scrubbed" for the wrong reason.
 */
function buildSeededTranscript(): string {
  const lines = SENSITIVE_SAMPLES.map(
    (s, i) =>
      `[turn ${i}] ${i % 2 === 0 ? 'user' : 'assistant'}: here is the ${s.label} — ${s.value} — please use it`,
  );
  // A couple of clean turns so the corpus is not 100% secrets.
  lines.push('[turn clean-1] user: thanks, that all looks good');
  lines.push('[turn clean-2] assistant: glad to help!');
  return lines.join('\n') + '\n';
}

const meta: CcSessionMetadata = {
  id: '01ARZ3NDEKTSV4RRFFQ69RECALL',
  kind: 'cc-session',
  session_id: 'recall-sess',
  cwd: '/proj',
  project_name: 'proj',
  transcript_path: '/x',
  payload_size: 0,
  captured_at: '2026-05-14T00:00:00Z',
  source: 'stop-hook',
  host: { os: 'linux', arch: 'x64', hostname: 'h' },
  teamagent_version: '0.0.0',
  schema_version: 1,
};

/** Capture the uploaded envelope without hitting the network. */
function capturingFetch(capture: { body?: string }): FetchLike {
  return async (_url, init) => {
    capture.body = init.body;
    return { status: 200, text: async () => '' };
  };
}

describe('L1 redaction recall', () => {
  it('scrubs >= 95% of known sensitive strings from the uploaded transcript', async () => {
    const transcript = buildSeededTranscript();
    const capture: { body?: string } = {};

    await uploadEntry(
      {
        metadata: meta,
        payloadBytes: Buffer.from(transcript, 'utf8'),
        endpoint: 'http://collector.test',
        token: 'tok',
        identity: { user_id: 'alice@libz.ai', machine_id: 'm1' },
      },
      { fetchFn: capturingFetch(capture) },
    );

    // Decode what actually went on the wire — the uploader gzip+base64s the
    // (already-redacted) transcript, so gunzip it back to inspect.
    expect(capture.body).toBeDefined();
    const env = JSON.parse(capture.body!) as CcSessionEnvelope;
    const plain = gunzipSync(
      Buffer.from(env.transcript.content, 'base64'),
    ).toString('utf8');

    let scrubbed = 0;
    const survivors: string[] = [];
    for (const s of SENSITIVE_SAMPLES) {
      if (!plain.includes(s.value)) scrubbed++;
      else survivors.push(s.label);
    }
    const recall = scrubbed / SENSITIVE_SAMPLES.length;

    // The grep anchor judge.md §V1.A step 5 keys on.
    console.log(`recall=${recall.toFixed(4)}`);
    console.log(`scrubbed=${scrubbed}/${SENSITIVE_SAMPLES.length}`);
    if (survivors.length > 0) console.log(`survivors=${survivors.join(',')}`);

    // The uploaded envelope must also report the redaction count so the member
    // can see "敏感字段被模糊化次数".
    expect(env.l1_redaction_count).toBeGreaterThanOrEqual(scrubbed);

    expect(recall).toBeGreaterThanOrEqual(0.95);
  });
});
