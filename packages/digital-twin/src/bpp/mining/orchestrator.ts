// BPP mining — orchestrator.
//
// Spec: docs/plans/2026-05-13-bpp-full-system-acceptance.md §里程碑三.
// Plan: docs/plans/2026-05-14-bpp-m3-acceptance-verify/judge.md.
//
// The layer that was missing from the M3 gap audit: nothing tied the built
// pieces together. `runMining` is that tie:
//
//   1. (optional) seed a designed sample corpus into the conversation repo
//   2. pull un-mined sessions from the M2 conversation repo via the cursor
//   3. extract a MiningInput bundle from those transcripts
//   4. fan it out to the three miners → CandidateBp[]
//   5. LLM normalize pass — one call per extract-type (mock provider in this
//      PR; PR-M3C wires real-provider selection + bad-key fallback at this
//      same seam). The miners' counts stay authoritative (LLM-uncheatable);
//      this pass only records the LLM call metrics the audit log needs.
//   6. write the full candidate set to the mining pool
//   7. Wilson tier gate → auto-push the canonical/enforced/gold tier into
//      member inboxes; sub-threshold candidates stay in the pool
//   8. write an auditable mining log (每条候选都能追溯到原始对话场次)
//   9. write the budget ledger (0 spend in mock mode)
//  10. advance the un-mined cursor
//
// The conversation repo doubles as the push root — auto-push writes inbox
// items directly via `appendInbox` (§V1.B.1 of the judge: "the conversation
// repo doubles as the push root"). No HTTP server is started for a mining run.
//
// Determinism: every emit is explicitly sorted; the pool jsonl is built from
// pure CandidateBp records whose fields all derive from the (fixed) input, so
// two runs over the same sample produce a byte-identical pool (D1).

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import {
  listConversationSessions,
  readMinedCursor,
  writeMinedCursor,
  filterUnmined,
  extractMiningInput,
} from './transcript-extractor.js';
import {
  mineCorrectionCandidates,
  correctionCandidateId,
} from './correction-adapter.js';
import { mineBehaviorCandidates } from './behavior-miner.js';
import { mineContextPatternCandidates } from './context-pattern-miner.js';
import { wilsonTierGate } from './wilson-tier-gate.js';
import {
  extractCandidates,
  type LlmExtractType,
  type LlmProvider,
  type LlmExtractResponse,
} from './llm-client.js';
import { BudgetTracker, BudgetExhaustedError } from './budget-tracker.js';
import type { CandidateBp, MiningInput } from './mining-types.js';
import type { BestPractice, InboxItem, PushEvent } from '../types.js';
import { writeBp, appendInbox, appendAudit } from '../store.js';
import { dateStamp } from '../../cc-status/path-safety.js';

/** Repo-relative path to the designed sample corpus shipped with this PR. */
export const SEED_SAMPLE_DIR = 'tests/fixtures/m3-mining-sample';

const DEFAULT_TEAM = 'default';
const DEFAULT_BUDGET_USD = 5;

/**
 * Per-LLM-call USD estimate charged against the budget cap when a real provider
 * is requested (i.e. NOT --mock). The ledger's `spent_usd` records the *actual*
 * cost; this estimate feeds the cap-accounting number `estimated_consumed_usd`
 * only. F1 derivation: a `--budget-usd 0.01` cap trips on the very first call
 * because 0.02 > 0.01. An explicit --mock run charges 0 and never trips.
 */
const ESTIMATE_FLOOR_USD = 0.02;

export interface MiningRunOptions {
  /** The M2 conversation repo — read for un-mined sessions, written as the push root. */
  repoDir: string;
  /** Mining state dir — holds `pool/`, `audit/`, `budget-*.json`, `mined-cursor.json`. */
  stateDir: string;
  /** Copy the designed sample corpus into `repoDir` before mining. */
  seedSample?: boolean;
  /** Force the deterministic mock LLM provider (always effectively mock in this PR). */
  mock?: boolean;
  /** Per-team/day USD budget cap recorded in the ledger (enforcement lands in PR-M3C). */
  budgetUsd?: number;
  /** Team key for the budget ledger filename. */
  team?: string;
  /** Injectable clock — keeps run ids / timestamps deterministic in tests. */
  now?: Date;
  /** Diagnostic sink — defaults to a no-op. */
  log?: (msg: string) => void;
  /**
   * Test seam — override the LLM extract function. Defaults to the real
   * `extractCandidates` client. The CLI never passes this; only tests inject a
   * failing/stub provider to exercise the E1 fallback / F1 budget paths
   * deterministically without a network round-trip.
   */
  extractCandidatesFn?: typeof extractCandidates;
}

export interface MiningRunResult {
  exit_code: number;
  run_id: string;
  candidates_total: number;
  auto_pushed: number;
  pool_retained: number;
  llm_calls: number;
  spent_usd: number;
  /** True when a real provider failed and the run fell back to the mock provider. */
  degraded: boolean;
  /** True when the per-team/day budget cap stopped the batch before completion. */
  budget_exhausted: boolean;
}

/**
 * Run one mining batch. See the module header for the 10-step pipeline.
 * Resolves with a `MiningRunResult` whose `exit_code` is 0 on a clean run.
 */
export async function runMining(opts: MiningRunOptions): Promise<MiningRunResult> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? ((): void => {});
  const team = opts.team ?? DEFAULT_TEAM;
  const date = dateStamp(now, now);
  const runId = `${date}-mining`;
  const { repoDir, stateDir } = opts;

  mkdirSync(repoDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  // 1. seed the designed sample corpus
  if (opts.seedSample) {
    const seeded = copySeedSample(repoDir);
    log(`[bpp mine] seeded ${seeded} sample conversation(s) into the repo`);
  }

  // 2-3. pull un-mined sessions through the cursor
  const allSessions = listConversationSessions(repoDir);
  const cursor = readMinedCursor(stateDir);
  const unmined = filterUnmined(allSessions, cursor);
  log(
    `[bpp mine] ${allSessions.length} session(s) in repo, ${unmined.length} un-mined`,
  );

  // 4. extract the MiningInput bundle
  const input = extractMiningInput(unmined);

  // 5. fan out to the three miners (sorted for deterministic pool order)
  const candidates: CandidateBp[] = [
    ...mineCorrectionCandidates({ correction_moments: input.correction_moments }),
    ...mineBehaviorCandidates({ session_summaries: input.session_summaries }),
    ...mineContextPatternCandidates({
      session_summaries: input.session_summaries,
      git_log: input.git_log,
    }),
  ].sort((a, b) => a.id.localeCompare(b.id));
  log(`[bpp mine] miners produced ${candidates.length} candidate(s)`);

  // 6. LLM normalize pass — provider selection + budget cap + bad-key fallback
  const limitUsd = opts.budgetUsd ?? DEFAULT_BUDGET_USD;
  const budgetTracker = new BudgetTracker(limitUsd);
  const norm = await runLlmNormalizePass(candidates, input, {
    mock: opts.mock ?? false,
    budgetTracker,
    extractFn: opts.extractCandidatesFn ?? extractCandidates,
    log,
  });

  // 6b. budget cap hit — stop the batch cleanly (a budget stop is exit 0, not
  //     an error). Persist the ledger so the spend is auditable, but do NOT
  //     write the pool or advance the cursor — the un-mined sessions stay
  //     un-mined for the next run.
  if (norm.budgetExhausted) {
    log(
      `[bpp mine] 预算耗尽 (budget exhausted) — 估算花费 ` +
        `$${norm.estimatedUsd.toFixed(4)} 超过上限 $${limitUsd.toFixed(2)}，` +
        `本批挖矿提前停止 (stopped)`,
    );
    persistBudgetLedger(stateDir, {
      team,
      date,
      spentUsd: norm.spentUsd,
      estimatedUsd: norm.estimatedUsd,
      llmCalls: norm.llmCalls,
      limitUsd,
      now,
      budgetExhausted: true,
    });
    return {
      exit_code: 0,
      run_id: runId,
      candidates_total: 0,
      auto_pushed: 0,
      pool_retained: 0,
      llm_calls: norm.llmCalls,
      spent_usd: norm.spentUsd,
      degraded: norm.degraded,
      budget_exhausted: true,
    };
  }

  // 7. write the full candidate set to the mining pool
  const poolDir = join(stateDir, 'pool');
  mkdirSync(poolDir, { recursive: true });
  writeFileSync(join(poolDir, `${runId}.jsonl`), toJsonl(candidates), 'utf8');

  // 8. Wilson tier gate → auto-push the high-tier candidates
  const pushable = wilsonTierGate(candidates).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const memberIds = [...new Set(allSessions.map((s) => s.user_id))].sort();
  const autoPushed = autoPushHighTier(repoDir, pushable, memberIds, runId, now);

  // 9. the auditable mining log — one entry per candidate
  const sourceSessions = resolveSourceSessions(input);
  const pushedIds = new Set(pushable.map((b) => b.id));
  const auditDir = join(stateDir, 'audit');
  mkdirSync(auditDir, { recursive: true });
  const auditEntries = candidates.map((c) => ({
    run_id: runId,
    candidate_id: c.id,
    miner: c.mining_evidence.extraction_method,
    source_sessions: sourceSessions.get(c.id) ?? [],
    pattern_count: c.mining_evidence.pattern_count,
    sessions_observed: c.mining_evidence.sessions_observed,
    llm_calls: norm.llmCalls,
    cost_usd: norm.spentUsd,
    tier: pushedIds.has(c.id) ? 'pushed' : 'pool',
  }));
  writeFileSync(join(auditDir, `${runId}.jsonl`), toJsonl(auditEntries), 'utf8');

  // 10. budget ledger — persistent: load the same-day file (if any) and
  //     accumulate this run's spend onto it. Daily reset is implicit — a new
  //     UTC date is a new filename, so a prior day's ledger is never read.
  persistBudgetLedger(stateDir, {
    team,
    date,
    spentUsd: norm.spentUsd,
    estimatedUsd: norm.estimatedUsd,
    llmCalls: norm.llmCalls,
    limitUsd,
    now,
    budgetExhausted: false,
  });

  // 11. advance the un-mined cursor
  writeMinedCursor(stateDir, {
    mined_session_ids: [
      ...cursor.mined_session_ids,
      ...unmined.map((s) => s.session_id),
    ],
  });

  const poolRetained = candidates.length - autoPushed;
  log(
    `[bpp mine] run ${runId}: ${candidates.length} candidate(s), ` +
      `${autoPushed} auto-pushed, ${poolRetained} retained in pool, ` +
      `${norm.llmCalls} LLM call(s), $${norm.spentUsd.toFixed(4)} spent` +
      (norm.degraded ? ' (degraded to mock provider)' : ''),
  );

  return {
    exit_code: 0,
    run_id: runId,
    candidates_total: candidates.length,
    auto_pushed: autoPushed,
    pool_retained: poolRetained,
    llm_calls: norm.llmCalls,
    spent_usd: norm.spentUsd,
    degraded: norm.degraded,
    budget_exhausted: false,
  };
}

// ── internals ─────────────────────────────────────────────────────────────

/** Map a CandidateBp.type to the matching LLM extract type. */
function llmExtractTypeOf(type: CandidateBp['type']): LlmExtractType | null {
  if (type === 'rule') return 'rule';
  if (type === 'habit') return 'habit';
  if (type === 'context-mgmt') return 'context-mgmt';
  return null; // 'skill' has no miner / no LLM extract type
}

interface NormalizePassResult {
  /** Number of LLM extract calls actually made. */
  llmCalls: number;
  /** Actual USD cost (0 under the mock provider / a fallback-to-mock run). */
  spentUsd: number;
  /** Cap-accounting total — the estimate the BudgetTracker enforced. */
  estimatedUsd: number;
  /** True once a real-provider failure forced a fallback to the mock provider. */
  degraded: boolean;
  /** True when the budget cap stopped the pass before all types were processed. */
  budgetExhausted: boolean;
}

/**
 * One LLM normalize call per extract-type present in the candidate set. This is
 * the seam where PR-M3C wires three behaviours on top of PR-M3B's mock-only pass:
 *
 *   - provider selection — `--mock` forces the deterministic mock provider;
 *     otherwise the real `anthropic-sdk` provider is requested.
 *   - bad-key fallback — a real-provider failure (bad key, missing SDK,
 *     unreachable) degrades to the mock provider for this and every remaining
 *     call, logging one clear downgrade note (judge row E1).
 *   - budget cap — each call charges `ESTIMATE_FLOOR_USD` (0 under --mock)
 *     against the BudgetTracker BEFORE the call; a `BudgetExhaustedError` stops
 *     the pass cleanly with `budgetExhausted: true` (judge row F1).
 *
 * The miners' counts stay authoritative — this pass only records the LLM call
 * metrics the audit log and the budget ledger need.
 */
async function runLlmNormalizePass(
  candidates: CandidateBp[],
  input: MiningInput,
  ctx: {
    mock: boolean;
    budgetTracker: BudgetTracker;
    extractFn: typeof extractCandidates;
    log: (msg: string) => void;
  },
): Promise<NormalizePassResult> {
  const types = [...new Set(candidates.map((c) => llmExtractTypeOf(c.type)))]
    .filter((t): t is LlmExtractType => t !== null)
    .sort();
  // The estimate reflects the *requested* mode, not the provider actually used:
  // a fallback-to-mock call still charges the estimate (the user asked for a
  // real provider); only an explicit --mock run charges 0.
  const estimatePerCall = ctx.mock ? 0 : ESTIMATE_FLOOR_USD;
  let llmCalls = 0;
  let spentUsd = 0;
  let degraded = false;

  for (const extractType of types) {
    try {
      ctx.budgetTracker.consume(estimatePerCall);
    } catch (err) {
      if (err instanceof BudgetExhaustedError) {
        return {
          llmCalls,
          spentUsd,
          estimatedUsd: ctx.budgetTracker.spent_usd,
          degraded,
          budgetExhausted: true,
        };
      }
      throw err;
    }

    const sessions =
      extractType === 'rule'
        ? input.correction_moments.map((m) => ({
            user_id: m.user_id,
            transcript_excerpt: m.text,
          }))
        : input.session_summaries.map((s) => ({
            user_id: s.user_id,
            transcript_excerpt: s.actions.join(' '),
          }));

    const provider: LlmProvider = ctx.mock || degraded ? 'mock' : 'anthropic-sdk';
    let resp: LlmExtractResponse;
    try {
      resp = await ctx.extractFn({ sessions, extract_type: extractType }, { provider });
    } catch (err) {
      // a real-provider failure degrades to the deterministic mock provider for
      // this and every remaining call (judge row E1).
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log(
        `[bpp mine] LLM provider '${provider}' 调用失败，降级到 mock provider ` +
          `继续 (fallback / degraded): ${msg}`,
      );
      degraded = true;
      resp = await ctx.extractFn(
        { sessions, extract_type: extractType },
        { provider: 'mock' },
      );
    }
    llmCalls += 1;
    spentUsd += resp.cost_usd;
  }

  return {
    llmCalls,
    spentUsd,
    estimatedUsd: ctx.budgetTracker.spent_usd,
    degraded,
    budgetExhausted: false,
  };
}

/** The on-disk budget ledger — `budget-<team>-<date>.json` under the state dir. */
interface BudgetLedger {
  team: string;
  date: string;
  /** Cumulative actual USD cost (0 under mock / fallback-to-mock). */
  spent_usd: number;
  /** Cumulative cap-accounting estimate the BudgetTracker enforced. */
  estimated_consumed_usd: number;
  llm_calls: number;
  limit_usd: number;
  reset_at: string;
  budget_exhausted: boolean;
}

/**
 * Load the same-day ledger if present. Daily reset is implicit: a new UTC date
 * means a new filename, so a prior day's ledger is simply never read.
 */
function readBudgetLedger(
  stateDir: string,
  team: string,
  date: string,
): BudgetLedger | null {
  const file = join(stateDir, `budget-${team}-${date}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as BudgetLedger;
  } catch {
    return null;
  }
}

/**
 * Persist the budget ledger — load the same-day file (if any) and accumulate
 * this run's spend / estimate / call-count onto it. `spent_usd` is the actual
 * cost; `estimated_consumed_usd` is the cap-accounting number the BudgetTracker
 * enforced against `limit_usd`.
 */
function persistBudgetLedger(
  stateDir: string,
  args: {
    team: string;
    date: string;
    spentUsd: number;
    estimatedUsd: number;
    llmCalls: number;
    limitUsd: number;
    now: Date;
    budgetExhausted: boolean;
  },
): void {
  const prior = readBudgetLedger(stateDir, args.team, args.date);
  const ledger: BudgetLedger = {
    team: args.team,
    date: args.date,
    spent_usd: (prior?.spent_usd ?? 0) + args.spentUsd,
    estimated_consumed_usd:
      (prior?.estimated_consumed_usd ?? 0) + args.estimatedUsd,
    llm_calls: (prior?.llm_calls ?? 0) + args.llmCalls,
    limit_usd: args.limitUsd,
    reset_at: nextUtcMidnight(args.now),
    budget_exhausted: args.budgetExhausted || (prior?.budget_exhausted ?? false),
  };
  writeFileSync(
    join(stateDir, `budget-${args.team}-${args.date}.json`),
    JSON.stringify(ledger, null, 2) + '\n',
    'utf8',
  );
}

/**
 * Auto-push each pushable BestPractice into a member inbox. Each high-tier BP
 * goes to exactly one deterministic receiver (the first member that is not the
 * author) so the inbox entry count equals the pushable count — sub-threshold
 * candidates stay only in the pool. Returns the number of inbox items written.
 */
function autoPushHighTier(
  repoDir: string,
  pushable: BestPractice[],
  memberIds: string[],
  runId: string,
  now: Date,
): number {
  let pushed = 0;
  const deliveredAt = now.toISOString();
  for (const bp of pushable) {
    const receiver = pickReceiver(memberIds, bp.pushed_by);
    writeBp(repoDir, bp);
    const item: InboxItem = {
      schema_version: 1,
      id: `inbox-${bp.id}-${receiver}`,
      receiver_id: receiver,
      bp_id: bp.id,
      status: 'pending',
      delivered_at: deliveredAt,
      acted_at: null,
      forced_by_lead: false,
      delivery_channels: ['dashboard'],
    };
    appendInbox(repoDir, item);
    const ev: PushEvent = {
      schema_version: 1,
      id: `push-${bp.id}-${receiver}`,
      event_type: 'pushed',
      bp_id: bp.id,
      actor: 'bpp-mine',
      timestamp: deliveredAt,
      metadata: { receiver_id: receiver, tier: bp.confidence_tier, run_id: runId },
    };
    appendAudit(repoDir, ev);
    pushed += 1;
  }
  return pushed;
}

/** First member that is not the author; falls back to a synthetic `team` inbox. */
function pickReceiver(memberIds: string[], author: string): string {
  for (const id of memberIds) {
    if (id !== author) return id;
  }
  return 'team';
}

/**
 * Resolve each candidate id back to the session ids that produced it — the
 * "每条候选都能追溯到原始对话场次" guarantee. Correction candidates are resolved
 * precisely by replaying the (user_id, signal) grouping; behavior / context
 * candidates (not produced by the designed sample) resolve to `[]`.
 */
function resolveSourceSessions(input: MiningInput): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const groups = new Map<string, Set<string>>();
  for (const m of input.correction_moments) {
    const id = correctionCandidateId(m.user_id, m.signal);
    if (!groups.has(id)) groups.set(id, new Set());
    groups.get(id)!.add(m.session_id);
  }
  for (const [id, sessions] of groups) {
    out.set(id, [...sessions].sort());
  }
  return out;
}

/** Copy the designed sample corpus into the conversation repo; returns file count. */
function copySeedSample(repoDir: string): number {
  const src = findSeedSampleDir();
  let count = 0;
  for (const userName of readdirSync(src).sort()) {
    const userSrc = join(src, userName);
    if (!isDir(userSrc)) continue;
    for (const dateName of readdirSync(userSrc).sort()) {
      const dateSrc = join(userSrc, dateName);
      if (!isDir(dateSrc)) continue;
      const dateDst = join(repoDir, userName, dateName);
      mkdirSync(dateDst, { recursive: true });
      for (const fileName of readdirSync(dateSrc).sort()) {
        if (!fileName.endsWith('.jsonl')) continue;
        copyFileSync(join(dateSrc, fileName), join(dateDst, fileName));
        count += 1;
      }
    }
  }
  return count;
}

/** Walk up from the current working dir to find the committed sample corpus. */
function findSeedSampleDir(): string {
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, SEED_SAMPLE_DIR);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `bpp mine: seed sample fixture not found — looked for ${SEED_SAMPLE_DIR} ` +
      `walking up from ${process.cwd()}`,
  );
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** JSON Lines: one compact object per line, trailing newline when non-empty. */
function toJsonl(rows: unknown[]): string {
  if (rows.length === 0) return '';
  return rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

/** ISO timestamp of the next UTC midnight — when the daily budget resets. */
function nextUtcMidnight(now: Date): string {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return next.toISOString();
}
