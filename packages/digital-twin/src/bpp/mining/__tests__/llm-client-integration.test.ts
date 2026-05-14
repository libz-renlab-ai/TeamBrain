// End-to-end mock-provider integration test for `extractCandidates`.
// Verifies the LlmExtractResponse shape contract across all three extract_types
// and that the BudgetTracker can be wired around mining batches without throw.
import { describe, it, expect } from 'vitest';
import { extractCandidates, type LlmExtractRequest, type LlmExtractType } from '../llm-client.js';
import { BudgetTracker } from '../budget-tracker.js';

function buildReq(extract_type: LlmExtractType): LlmExtractRequest {
  return {
    extract_type,
    sessions: [
      { user_id: 'alice@team', transcript_excerpt: 'before edit_file, always read_file then commit' },
      { user_id: 'alice@team', transcript_excerpt: 'before edit_file, always read_file (session 2)' },
      { user_id: 'alice@team', transcript_excerpt: 'before edit_file, always read_file (session 3)' },
    ],
  };
}

describe('llm-client integration / mock provider end-to-end', () => {
  it('returns shape-conformant LlmExtractResponse for extract_type=rule', async () => {
    const resp = await extractCandidates(buildReq('rule'), { provider: 'mock' });
    expect(resp).toHaveProperty('candidates');
    expect(resp).toHaveProperty('tokens_used', 0);
    expect(resp).toHaveProperty('cost_usd', 0);
    expect(resp.candidates.length).toBeGreaterThan(0);
    const c = resp.candidates[0]!;
    expect(Object.keys(c).sort()).toEqual(
      ['body', 'example', 'pattern_count', 'sessions_observed', 'title'].sort(),
    );
    // sessions_observed must equal the input session count per the contract
    // in spec §3.5 (LLM-uncheatable: mining_evidence counts are objective)
    expect(c.sessions_observed).toBe(3);
  });

  it('returns shape-conformant response for extract_type=habit', async () => {
    const resp = await extractCandidates(buildReq('habit'), { provider: 'mock' });
    expect(Array.isArray(resp.candidates)).toBe(true);
    for (const c of resp.candidates) {
      expect(typeof c.title).toBe('string');
      expect(c.title).toContain('habit');
    }
  });

  it('returns shape-conformant response for extract_type=context-mgmt', async () => {
    const resp = await extractCandidates(buildReq('context-mgmt'), { provider: 'mock' });
    expect(Array.isArray(resp.candidates)).toBe(true);
    for (const c of resp.candidates) {
      expect(typeof c.title).toBe('string');
      expect(c.title).toContain('context-mgmt');
    }
  });

  it('budget tracker can wrap repeated mock calls without exhausting (cost_usd=0)', async () => {
    const budget = new BudgetTracker(5);
    for (let i = 0; i < 50; i++) {
      const resp = await extractCandidates(buildReq('rule'), { provider: 'mock' });
      budget.consume(resp.cost_usd);
    }
    // mock provider reports zero cost; budget should never tick up
    expect(budget.spent_usd).toBe(0);
    expect(budget.exhausted()).toBe(false);
  });

  it('mock response is byte-identical across two end-to-end calls with the same input', async () => {
    const a = await extractCandidates(buildReq('rule'), { provider: 'mock' });
    const b = await extractCandidates(buildReq('rule'), { provider: 'mock' });
    expect(a).toEqual(b);
    // and JSON-serialized form is byte-identical too
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('pattern_count fields are integers (LLM-uncheatable spec §3.5)', async () => {
    const resp = await extractCandidates(buildReq('habit'), { provider: 'mock' });
    for (const c of resp.candidates) {
      expect(Number.isInteger(c.pattern_count)).toBe(true);
      expect(c.pattern_count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(c.sessions_observed)).toBe(true);
    }
  });
});
