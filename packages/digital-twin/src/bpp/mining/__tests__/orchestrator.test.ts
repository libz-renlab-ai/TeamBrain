// PR-M3B — mining orchestrator end-to-end against the designed sample corpus.
//
// Drives `runMining` over `tests/fixtures/m3-mining-sample/` and asserts the
// acceptance shape the M3 judge harness greps for:
//   A3 — the seeded sample yields >=5 pool candidates
//   B1 — >=3 candidates auto-push to a member inbox
//   B2 — sub-threshold candidates stay in the pool (pool count > push count)
//   C1 — the mining log traces each candidate to its source sessions + miner
//   C2 — the budget ledger records a concrete spend (0 under the mock provider)
//   D1 — two runs over the same sample produce a byte-identical pool

import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMining } from '../orchestrator.js';
import { extractCandidates } from '../llm-client.js';

const FIXED_NOW = new Date('2026-05-14T12:00:00.000Z');

function readJsonl(file: string): unknown[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as unknown);
}

/** Count `bp_id` occurrences across every `_inbox/<receiver>/<date>/items.jsonl`. */
function countInboxBpIds(repoDir: string): number {
  const inboxRoot = join(repoDir, '_inbox');
  if (!existsSync(inboxRoot)) return 0;
  let n = 0;
  for (const receiver of readdirSync(inboxRoot)) {
    const recvDir = join(inboxRoot, receiver);
    for (const date of readdirSync(recvDir)) {
      const file = join(recvDir, date, 'items.jsonl');
      if (!existsSync(file)) continue;
      for (const row of readJsonl(file)) {
        if ((row as { bp_id?: unknown }).bp_id) n += 1;
      }
    }
  }
  return n;
}

function poolFile(stateDir: string): string {
  const poolDir = join(stateDir, 'pool');
  const files = readdirSync(poolDir).filter((f) => f.endsWith('.jsonl'));
  return join(poolDir, files[0]!);
}

describe('mining orchestrator — seeded sample run', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('mines the designed sample into 6 candidates, auto-pushing 3 high-tier', async () => {
    const repoDir = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'conv-repo');
    const stateDir = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'mining-state');
    dirs.push(join(repoDir, '..'), join(stateDir, '..'));

    const result = await runMining({
      repoDir,
      stateDir,
      seedSample: true,
      mock: true,
      now: FIXED_NOW,
    });

    // A3 — 6 candidates in the pool (>= 5)
    expect(result.candidates_total).toBe(6);
    const pool = readJsonl(poolFile(stateDir));
    expect(pool).toHaveLength(6);
    expect(pool.every((c) => typeof (c as { id?: unknown }).id === 'string')).toBe(true);

    // B1 — exactly 3 high-tier candidates auto-pushed into member inboxes
    expect(result.auto_pushed).toBe(3);
    expect(countInboxBpIds(repoDir)).toBe(3);

    // B2 — pool count strictly greater than the auto-push count
    expect(result.candidates_total).toBeGreaterThan(result.auto_pushed);
    expect(result.pool_retained).toBe(3);

    // C2 — the budget ledger records a concrete 0.00 spend under mock mode
    expect(result.spent_usd).toBe(0);
    const ledgerFile = join(stateDir, 'budget-default-2026-05-14.json');
    expect(existsSync(ledgerFile)).toBe(true);
    const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8')) as {
      spent_usd: number;
      date: string;
      team: string;
    };
    expect(ledger.spent_usd).toBe(0);
    expect(ledger.date).toBe('2026-05-14');
    expect(ledger.team).toBe('default');
  });

  it('writes a mining log tracing every candidate to its source sessions + miner', async () => {
    const repoDir = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'conv-repo');
    const stateDir = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'mining-state');
    dirs.push(join(repoDir, '..'), join(stateDir, '..'));

    await runMining({ repoDir, stateDir, seedSample: true, mock: true, now: FIXED_NOW });

    const auditDir = join(stateDir, 'audit');
    const auditFile = join(
      auditDir,
      readdirSync(auditDir).find((f) => f.endsWith('.jsonl'))!,
    );
    const entries = readJsonl(auditFile) as Array<{
      candidate_id: string;
      miner: string;
      source_sessions: string[];
      llm_calls: number;
    }>;
    expect(entries).toHaveLength(6);
    for (const e of entries) {
      expect(e.miner).toContain('@v1');
      expect(e.llm_calls).toBeGreaterThanOrEqual(1);
    }
    // the 3 canonical candidates each trace back to 5 source sessions
    const canonical = entries.filter((e) => e.source_sessions.length === 5);
    expect(canonical).toHaveLength(3);
  });

  it('is deterministic — two runs over the same sample produce an identical pool', async () => {
    const repoDir = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'conv-repo');
    const state1 = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'state-1');
    const state2 = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'state-2');
    dirs.push(join(repoDir, '..'), join(state1, '..'), join(state2, '..'));

    await runMining({ repoDir, stateDir: state1, seedSample: true, mock: true, now: FIXED_NOW });
    await runMining({ repoDir, stateDir: state2, seedSample: true, mock: true, now: FIXED_NOW });

    const pool1 = readFileSync(poolFile(state1), 'utf8');
    const pool2 = readFileSync(poolFile(state2), 'utf8');
    expect(pool1).toBe(pool2);
  });

  it('advances the un-mined cursor — a re-run on the same state mines nothing', async () => {
    const repoDir = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'conv-repo');
    const stateDir = join(mkdtempSync(join(tmpdir(), 'm3b-')), 'mining-state');
    dirs.push(join(repoDir, '..'), join(stateDir, '..'));

    const first = await runMining({ repoDir, stateDir, seedSample: true, mock: true, now: FIXED_NOW });
    expect(first.candidates_total).toBe(6);

    const second = await runMining({ repoDir, stateDir, seedSample: true, mock: true, now: FIXED_NOW });
    expect(second.candidates_total).toBe(0);
    expect(second.auto_pushed).toBe(0);
  });
});

// PR-M3C — provider selection + bad-key fallback + budget cap + persistent
// ledger. Flips the M3 judge harness rows E1 / F1 / F2.
describe('mining orchestrator — PR-M3C provider fallback + budget', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function freshDirs(): { repoDir: string; stateDir: string } {
    const repoDir = join(mkdtempSync(join(tmpdir(), 'm3c-')), 'conv-repo');
    const stateDir = join(mkdtempSync(join(tmpdir(), 'm3c-')), 'mining-state');
    dirs.push(join(repoDir, '..'), join(stateDir, '..'));
    return { repoDir, stateDir };
  }

  // E1 — a real provider that fails (bad key / unreachable) must degrade to the
  // deterministic mock provider, log a clear downgrade note, and finish exit 0.
  it('E1 — degrades to the mock provider when the real provider fails', async () => {
    const { repoDir, stateDir } = freshDirs();
    const logs: string[] = [];
    // Inject a real-provider failure; the mock provider still works.
    const failingExtract: typeof extractCandidates = async (req, config) => {
      if (config.provider !== 'mock') throw new Error('simulated bad ANTHROPIC_API_KEY');
      return extractCandidates(req, config);
    };

    const result = await runMining({
      repoDir,
      stateDir,
      seedSample: true,
      mock: false,
      now: FIXED_NOW,
      extractCandidatesFn: failingExtract,
      log: (m) => logs.push(m),
    });

    expect(result.exit_code).toBe(0);
    expect(result.degraded).toBe(true);
    expect(result.budget_exhausted).toBe(false);
    // the miners still ran — the degraded LLM pass only affects call metrics
    expect(result.candidates_total).toBe(6);
    expect(logs.some((l) => /降级|fallback|degrad/i.test(l))).toBe(true);
  });

  // F1 — a $0.01 cap with a real provider requested must stop the batch before
  // the first call (per-call estimate 0.02 > 0.01), cleanly, exit 0.
  it('F1 — a budget cap stops the batch cleanly before the first LLM call', async () => {
    const { repoDir, stateDir } = freshDirs();
    const logs: string[] = [];
    const failingExtract: typeof extractCandidates = async (req, config) => {
      if (config.provider !== 'mock') throw new Error('real provider must not be reached — budget trips first');
      return extractCandidates(req, config);
    };

    const result = await runMining({
      repoDir,
      stateDir,
      seedSample: true,
      mock: false,
      budgetUsd: 0.01,
      now: FIXED_NOW,
      extractCandidatesFn: failingExtract,
      log: (m) => logs.push(m),
    });

    expect(result.exit_code).toBe(0);
    expect(result.budget_exhausted).toBe(true);
    expect(result.candidates_total).toBe(0);
    expect(logs.some((l) => /预算|exhausted|stopped/i.test(l))).toBe(true);

    const ledger = JSON.parse(
      readFileSync(join(stateDir, 'budget-default-2026-05-14.json'), 'utf8'),
    ) as { budget_exhausted: boolean };
    expect(ledger.budget_exhausted).toBe(true);
  });

  // F1 control — an explicit --mock run never trips the cap (estimate is 0).
  it('F1 — an explicit --mock run never trips the budget cap', async () => {
    const { repoDir, stateDir } = freshDirs();
    const result = await runMining({
      repoDir,
      stateDir,
      seedSample: true,
      mock: true,
      budgetUsd: 0.01,
      now: FIXED_NOW,
    });
    expect(result.exit_code).toBe(0);
    expect(result.budget_exhausted).toBe(false);
    expect(result.candidates_total).toBe(6);
  });

  // F2 — the budget ledger persists: a second same-day run accumulates onto
  // the first instead of overwriting it.
  it('F2 — a same-day re-run accumulates onto the prior budget ledger', async () => {
    const { repoDir, stateDir } = freshDirs();
    mkdirSync(stateDir, { recursive: true });
    // simulate an earlier same-day run's ledger
    writeFileSync(
      join(stateDir, 'budget-default-2026-05-14.json'),
      JSON.stringify({
        team: 'default',
        date: '2026-05-14',
        spent_usd: 1.5,
        estimated_consumed_usd: 0.06,
        llm_calls: 7,
        limit_usd: 5,
        reset_at: '2026-05-15T00:00:00.000Z',
        budget_exhausted: false,
      }) + '\n',
      'utf8',
    );

    const result = await runMining({
      repoDir,
      stateDir,
      seedSample: true,
      mock: true,
      now: FIXED_NOW,
    });

    const ledger = JSON.parse(
      readFileSync(join(stateDir, 'budget-default-2026-05-14.json'), 'utf8'),
    ) as { spent_usd: number; llm_calls: number };
    // mock run adds 0 spend; the seeded sample is all 'rule' candidates → 1 call
    expect(ledger.spent_usd).toBe(1.5);
    expect(ledger.llm_calls).toBe(7 + result.llm_calls);
    expect(result.llm_calls).toBeGreaterThanOrEqual(1);
  });

  // F2 — daily reset: a prior-day ledger is never loaded; today starts fresh.
  it('F2 — a new UTC date starts a fresh ledger (daily reset)', async () => {
    const { repoDir, stateDir } = freshDirs();
    mkdirSync(stateDir, { recursive: true });
    // yesterday's ledger — must NOT bleed into today's run
    writeFileSync(
      join(stateDir, 'budget-default-2026-05-13.json'),
      JSON.stringify({
        team: 'default',
        date: '2026-05-13',
        spent_usd: 99,
        estimated_consumed_usd: 99,
        llm_calls: 999,
        limit_usd: 5,
        reset_at: '2026-05-14T00:00:00.000Z',
        budget_exhausted: true,
      }) + '\n',
      'utf8',
    );

    await runMining({ repoDir, stateDir, seedSample: true, mock: true, now: FIXED_NOW });

    const today = JSON.parse(
      readFileSync(join(stateDir, 'budget-default-2026-05-14.json'), 'utf8'),
    ) as { spent_usd: number };
    expect(today.spent_usd).toBe(0);
    // yesterday's file is left untouched
    const yesterday = JSON.parse(
      readFileSync(join(stateDir, 'budget-default-2026-05-13.json'), 'utf8'),
    ) as { spent_usd: number };
    expect(yesterday.spent_usd).toBe(99);
  });
});
