// Unit tests for `llm-client.ts` — provider=mock is the primary coverage path.
// claudefast and anthropic-sdk tests are skipped without env vars / binaries
// because they require network or a real `claudefast` wrapper on PATH.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import {
  extractCandidates,
  parseModelJson,
  type LlmExtractRequest,
} from '../llm-client.js';

const mockReq: LlmExtractRequest = {
  extract_type: 'rule',
  sessions: [
    { user_id: 'alice@team', transcript_excerpt: 'use rg instead of grep' },
    { user_id: 'alice@team', transcript_excerpt: 'use rg instead of grep please' },
  ],
};

function hasClaudefast(): boolean {
  try {
    execSync('claudefast --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('llm-client / mock provider', () => {
  it('returns a well-shaped LlmExtractResponse with cost_usd=0 and tokens_used=0', async () => {
    const resp = await extractCandidates(mockReq, { provider: 'mock' });
    expect(resp).toMatchObject({ tokens_used: 0, cost_usd: 0 });
    expect(Array.isArray(resp.candidates)).toBe(true);
    expect(resp.candidates.length).toBeGreaterThan(0);
    for (const c of resp.candidates) {
      expect(typeof c.title).toBe('string');
      expect(typeof c.body).toBe('string');
      expect(typeof c.example).toBe('string');
      expect(Number.isInteger(c.pattern_count)).toBe(true);
      expect(Number.isInteger(c.sessions_observed)).toBe(true);
      expect(c.sessions_observed).toBe(mockReq.sessions.length);
    }
  });

  it('is deterministic: identical input → identical output across 100 calls', async () => {
    const baseline = await extractCandidates(mockReq, { provider: 'mock' });
    const baselineJson = JSON.stringify(baseline);
    for (let i = 0; i < 100; i++) {
      const next = await extractCandidates(mockReq, { provider: 'mock' });
      expect(JSON.stringify(next)).toBe(baselineJson);
    }
  });

  it('different inputs produce different outputs (hash-derived divergence)', async () => {
    const a = await extractCandidates(mockReq, { provider: 'mock' });
    const b = await extractCandidates(
      {
        extract_type: 'habit',
        sessions: [{ user_id: 'bob@team', transcript_excerpt: 'completely different transcript content here' }],
      },
      { provider: 'mock' },
    );
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('zero sessions → zero candidates, no throw', async () => {
    const resp = await extractCandidates(
      { extract_type: 'rule', sessions: [] },
      { provider: 'mock' },
    );
    expect(resp.candidates).toEqual([]);
    expect(resp.cost_usd).toBe(0);
  });

  it('rejects unknown provider at runtime', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(extractCandidates(mockReq, { provider: 'gpt-5' as any })).rejects.toThrow();
  });
});

describe('llm-client / parseModelJson', () => {
  it('parses a clean JSON object', () => {
    const raw = JSON.stringify({
      candidates: [
        { title: 't', body: 'b', example: 'e', pattern_count: 3, sessions_observed: 5 },
      ],
    });
    const out = parseModelJson(raw);
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0]!.pattern_count).toBe(3);
  });

  it('tolerates a single outer ```json``` fence', () => {
    const raw = '```json\n{"candidates":[]}\n```';
    expect(parseModelJson(raw).candidates).toEqual([]);
  });

  it('throws on non-JSON garbage', () => {
    expect(() => parseModelJson('not json at all')).toThrow();
  });

  it('throws when top-level shape is wrong', () => {
    expect(() => parseModelJson('{"wrong":[]}')).toThrow();
  });

  it('coerces numeric strings to integers', () => {
    const raw = JSON.stringify({
      candidates: [
        { title: 't', body: 'b', example: 'e', pattern_count: '7', sessions_observed: '12' },
      ],
    });
    const out = parseModelJson(raw);
    expect(out.candidates[0]!.pattern_count).toBe(7);
    expect(out.candidates[0]!.sessions_observed).toBe(12);
  });
});

describe('llm-client / claudefast provider (requires `claudefast` on PATH; skipped otherwise)', () => {
  const reachable = hasClaudefast() && !!process.env.ANTHROPIC_API_KEY;
  it.skipIf(!reachable)('round-trips a tiny extraction through claudefast', async () => {
    const resp = await extractCandidates(mockReq, { provider: 'claudefast', timeoutMs: 60_000 });
    expect(resp).toHaveProperty('candidates');
    expect(Array.isArray(resp.candidates)).toBe(true);
  });
});

describe('llm-client / anthropic-sdk provider (requires ANTHROPIC_API_KEY; skipped otherwise)', () => {
  const reachable = !!process.env.ANTHROPIC_API_KEY;
  it.skipIf(!reachable)('round-trips a tiny extraction through the SDK', async () => {
    const resp = await extractCandidates(mockReq, {
      provider: 'anthropic-sdk',
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeoutMs: 60_000,
    });
    expect(resp).toHaveProperty('candidates');
    expect(Array.isArray(resp.candidates)).toBe(true);
    expect(resp.tokens_used).toBeGreaterThanOrEqual(0);
    expect(resp.cost_usd).toBeGreaterThanOrEqual(0);
  });
});
