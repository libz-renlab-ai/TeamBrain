import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { BestPractice, MiningEvidence } from '../types.js';

// ---------------------------------------------------------------------------
// Phase 6 PR-2/3 — Gap 5: tier (a) byte-diff harness expanded to 5 fixtures
// (4 new + the original bpp-brainstorm-habit which keeps its own
// fixture-replay.test.ts).
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.3.
// Stub disclaimer: tests/fixtures/scenarios/BPP-STUB.md (read this FIRST).
// Acceptance ruler: docs/plans/2026-05-13-bpp-full-system-acceptance.md §M3, §M4, §9.5.
//
// STUB / SCAFFOLDING NOTICE — what this test validates and what it does NOT
// ---------------------------------------------------------------------------
// What it validates:
//   - The inline placeholder miners + Wilson math + tier-rounding +
//     conflict_with double-link produce byte-identical outputs against the
//     hand-authored expected JSON. Useful for regression replay.
//
// What it does NOT validate:
//   - That the real production mining pipeline (../mining/behavior-miner.ts,
//     context-pattern-miner.ts, correction-adapter.ts, wilson-tier-gate.ts)
//     produces these same outputs. Placeholder ≠ real.
//   - That the real pipeline produces sensible outputs on real recorded
//     transcripts. These fixtures are HAND-AUTHORED, not real recordings.
//   - Anything about acceptance.md §M4 (the 6-12 person 4-week real-user
//     experiment). That milestone is BLOCKED-ON-HUMAN; see
//     docs/plans/2026-05-13-bpp-poc/m4-experiment/ for the humans-pluggable
//     harness.
//
// Per acceptance.md §9.5 (合成数据陷阱再发生): hand-authored fixtures cannot
// be counted as evidence the synthetic-data trap was avoided. Real recorded
// transcripts + scipy.stats ablation on rule-ON / rule-OFF real-team runs
// remain the canonical evidence path for §M4 verdict.
//
// IMPORTANT: Per fixture we ship a small **inline placeholder miner** because
// the real Phase 2 behavior-miner is being built in parallel. When Phase 2
// lands, swap each pattern's miner for a real shared one (and re-record
// expected JSON if details change).
//
// `CandidateBp` is not yet exported from ../types.ts (Phase 1 froze the public
// type surface). Declared here as a local shim until Phase 2 formalizes it.
// ---------------------------------------------------------------------------

/** Local shim for the still-unwritten CandidateBp type. */
interface CandidateBp {
  schema_version: 1;
  id: string;
  type: BestPractice['type'];
  title: string;
  body: string;
  example: string;
  pushed_by: string;
  pushed_by_display: string;
  topic: BestPractice['topic'];
  confidence_score: 0;
  confidence_tier: 'low';
  conflict_with: string[];
  mining_evidence: MiningEvidence;
  revoked_at: null;
  revoked_by: null;
  revoke_reason: null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Shared math (copied from fixture-replay.test.ts so the new test file is
// self-contained; both inline copies must agree until Phase 2 promotes them
// to a shared module).
// ---------------------------------------------------------------------------

function wilsonLowerBound(success: number, failure: number): number {
  const n = success + failure;
  if (n === 0) return 0;
  const z = 1.96;
  const p = success / n;
  const numerator =
    p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const denominator = 1 + (z * z) / n;
  const lb = numerator / denominator;
  return Math.max(0, Math.min(1, lb));
}

function bpTierFromConfidence(c: number): BestPractice['confidence_tier'] {
  if (c < 0.55) return 'low';
  if (c < 0.75) return 'stable';
  if (c < 0.9) return 'canonical';
  if (c < 0.97) return 'enforced';
  return 'gold';
}

function gate(candidate: CandidateBp, accumulated: MiningEvidence): BestPractice {
  const conf = wilsonLowerBound(accumulated.pattern_count, accumulated.reject_count);
  const confRounded = Math.round(conf * 10000) / 10000;
  return {
    schema_version: 1,
    id: candidate.id.replace('bp-candidate-', 'bp-'),
    type: candidate.type,
    title: candidate.title,
    body: candidate.body,
    example: candidate.example,
    pushed_by: candidate.pushed_by,
    pushed_by_display: candidate.pushed_by_display,
    topic: candidate.topic,
    confidence_score: confRounded,
    confidence_tier: bpTierFromConfidence(confRounded),
    conflict_with: candidate.conflict_with,
    mining_evidence: { ...accumulated },
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    created_at: candidate.created_at,
  };
}

// Helper: parse a transcript.jsonl string into events.
function parseTranscript(jsonl: string): Array<Record<string, unknown>> {
  return jsonl
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

// Helper: extract all assistant tool_use blocks in order.
function assistantToolUses(
  events: Array<Record<string, unknown>>,
): Array<{ name: string; input: Record<string, unknown>; ev: Record<string, unknown> }> {
  const out: Array<{ name: string; input: Record<string, unknown>; ev: Record<string, unknown> }> = [];
  for (const ev of events) {
    if (ev.type !== 'assistant') continue;
    const msg = ev.message as { content?: unknown } | undefined;
    const content = msg?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type !== 'tool_use') continue;
      out.push({
        name: String(b.name ?? ''),
        input: (b.input as Record<string, unknown>) ?? {},
        ev,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pattern miners — one per fixture (placeholder; Phase 2 will unify them).
// ---------------------------------------------------------------------------

/**
 * Miner for bpp-skill-dispatch-parallel: counts clusters of
 * Skill(superpowers:dispatching-parallel-agents) followed by ≥2 Task tool_use
 * blocks (within the same assistant message or the next assistant message).
 */
function mineDispatchParallel(transcript: string): CandidateBp[] {
  const events = parseTranscript(transcript);
  const sessions = new Set<string>();
  let patternCount = 0;
  let pendingSkill = false;
  let pendingTaskCount = 0;

  for (const ev of events) {
    if (typeof ev.sessionId === 'string') sessions.add(ev.sessionId);
    if (ev.type !== 'assistant') continue;
    const msg = ev.message as { content?: unknown } | undefined;
    const content = msg?.content;
    if (!Array.isArray(content)) continue;
    // Reset task-counter when entering a new assistant message that doesn't
    // start with the skill: we accumulate tasks only inside a 2-message window.
    let hadSkillInThisMsg = false;
    let tasksInThisMsg = 0;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type !== 'tool_use') continue;
      const name = b.name;
      const input = b.input as Record<string, unknown> | undefined;
      if (name === 'Skill' && input?.skill === 'superpowers:dispatching-parallel-agents') {
        hadSkillInThisMsg = true;
      } else if (name === 'Task') {
        tasksInThisMsg += 1;
      }
    }
    if (hadSkillInThisMsg && tasksInThisMsg >= 2) {
      // single-message: skill + ≥2 tasks
      patternCount += 1;
      pendingSkill = false;
      pendingTaskCount = 0;
    } else if (hadSkillInThisMsg) {
      pendingSkill = true;
      pendingTaskCount = 0;
    } else if (pendingSkill) {
      pendingTaskCount += tasksInThisMsg;
      if (pendingTaskCount >= 2) {
        patternCount += 1;
        pendingSkill = false;
        pendingTaskCount = 0;
      }
    }
  }

  const lastTs = events.at(-1)?.timestamp as string | undefined;
  if (patternCount === 0) return [];
  return [
    {
      schema_version: 1,
      id: 'bp-candidate-2026-05-13-dispatch-parallel-skill',
      type: 'skill',
      title: 'Dispatch parallel agents for 2+ independent tasks',
      body:
        'Whenever 2+ independent tasks can be worked on without shared state or sequential dependencies, invoke the superpowers:dispatching-parallel-agents skill and fan out Task tool calls in a single message.',
      example:
        "User: '跑 lint, tests, changelog 三件事' → Assistant: Skill(superpowers:dispatching-parallel-agents) → three Task tool_use blocks in one message.",
      pushed_by: 'bob@team.com',
      pushed_by_display: 'Bob',
      topic: 'ai-collab',
      confidence_score: 0,
      confidence_tier: 'low',
      conflict_with: [],
      mining_evidence: {
        sessions_observed: sessions.size,
        pattern_count: patternCount,
        reject_count: 0,
        extraction_method: 'behavior-mining-v0-fixture',
      },
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: lastTs ?? '2026-05-13T11:11:00Z',
    },
  ];
}

/**
 * Miner for bpp-habit-tdd: counts (Write(*.test.*) → Bash(vitest run) →
 * Write(matching stem, non-test)) triples in strict order.
 */
function mineTddRedFirst(transcript: string): CandidateBp[] {
  const events = parseTranscript(transcript);
  const sessions = new Set<string>();
  let patternCount = 0;

  const uses = assistantToolUses(events);
  // Track session ids as we go through events to populate sessions_observed.
  for (const ev of events) {
    if (typeof ev.sessionId === 'string') sessions.add(ev.sessionId);
  }

  let stemPending: string | null = null;
  let sawRedRun = false;
  for (const u of uses) {
    if (u.name === 'Write' && typeof u.input.file_path === 'string') {
      const fp = u.input.file_path as string;
      const bn = basename(fp);
      const testMatch = /^(.+)\.test\.[^.]+$/.exec(bn);
      if (testMatch) {
        stemPending = testMatch[1] ?? null;
        sawRedRun = false;
        continue;
      }
      if (stemPending && sawRedRun) {
        const m = /^(.+)\.[^.]+$/.exec(bn);
        const implStem = m ? m[1] : null;
        if (implStem === stemPending) {
          patternCount += 1;
        }
        stemPending = null;
        sawRedRun = false;
      }
    } else if (
      u.name === 'Bash' &&
      typeof u.input.command === 'string' &&
      (u.input.command as string).includes('vitest') &&
      stemPending
    ) {
      sawRedRun = true;
    }
  }

  const lastTs = events.at(-1)?.timestamp as string | undefined;
  if (patternCount === 0) return [];
  return [
    {
      schema_version: 1,
      id: 'bp-candidate-2026-05-13-tdd-red-first',
      type: 'habit',
      title: 'Write failing test before implementation (TDD red-first)',
      body:
        'Before any Write/Edit of a new source file, first Write a vitest test file and run it expecting failure (the red step), then Write the implementation.',
      example:
        "User: '加一个 parseDuration' → Assistant: Write(parseDuration.test.ts) → Bash(vitest run, see red) → Write(parseDuration.ts).",
      pushed_by: 'carol@team.com',
      pushed_by_display: 'Carol',
      topic: 'testing',
      confidence_score: 0,
      confidence_tier: 'low',
      conflict_with: [],
      mining_evidence: {
        sessions_observed: sessions.size,
        pattern_count: patternCount,
        reject_count: 0,
        extraction_method: 'behavior-mining-v0-fixture',
      },
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: lastTs ?? '2026-05-13T12:11:30Z',
    },
  ];
}

/**
 * Miner for bpp-context-atomic-commits: counts pairs of (Write|Edit on file X
 * followed immediately by Bash whose command contains both `git commit` and
 * basename(X)).
 */
function mineAtomicCommits(transcript: string): CandidateBp[] {
  const events = parseTranscript(transcript);
  const sessions = new Set<string>();
  for (const ev of events) {
    if (typeof ev.sessionId === 'string') sessions.add(ev.sessionId);
  }

  const uses = assistantToolUses(events);
  let patternCount = 0;
  let pendingFile: string | null = null;
  for (const u of uses) {
    if ((u.name === 'Write' || u.name === 'Edit') && typeof u.input.file_path === 'string') {
      pendingFile = u.input.file_path as string;
    } else if (u.name === 'Bash' && pendingFile && typeof u.input.command === 'string') {
      const cmd = u.input.command as string;
      if (cmd.includes('git commit') && cmd.includes(basename(pendingFile))) {
        patternCount += 1;
      }
      pendingFile = null;
    } else {
      // any other tool_use breaks the immediate-follow pairing
      pendingFile = null;
    }
  }

  const lastTs = events.at(-1)?.timestamp as string | undefined;
  if (patternCount === 0) return [];
  return [
    {
      schema_version: 1,
      id: 'bp-candidate-2026-05-13-atomic-commit-per-edit',
      type: 'context-mgmt',
      title: 'Atomic git commit after every file edit',
      body:
        "After every Write or Edit tool call that modifies a file, immediately run a Bash 'git add <file> && git commit' covering only that file before moving to the next edit.",
      example:
        'Edit(src/a.ts) → Bash(git add src/a.ts && git commit) → Edit(src/b.ts) → Bash(git add src/b.ts && git commit).',
      pushed_by: 'dave@team.com',
      pushed_by_display: 'Dave',
      topic: 'git-flow',
      confidence_score: 0,
      confidence_tier: 'low',
      conflict_with: [],
      mining_evidence: {
        sessions_observed: sessions.size,
        pattern_count: patternCount,
        reject_count: 0,
        extraction_method: 'behavior-mining-v0-fixture',
      },
      revoked_at: null,
      revoked_by: null,
      revoke_reason: null,
      created_at: lastTs ?? '2026-05-13T13:01:30Z',
    },
  ];
}

/**
 * Miner for bpp-conflict-mock-vs-real-db: splits the transcript by sessionId
 * and mines each session independently to produce two opposing candidate BPs.
 *
 * Hardcoded conflict pair: this fixture exists to test the conflict_with
 * double-link, not the LLM conflict-detector (which is non-deterministic and
 * lives in tier (c)).
 */
function mineMockDbConflict(transcript: string): CandidateBp[] {
  const events = parseTranscript(transcript);
  const bySession = new Map<string, Array<Record<string, unknown>>>();
  for (const ev of events) {
    const sid = ev.sessionId as string | undefined;
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid)!.push(ev);
  }

  const out: CandidateBp[] = [];
  // Stable order: mock-yes session first, then mock-no (matches expected fixture).
  // Sort descending by sessionId so 'bpp-mock-yes-*' comes before 'bpp-mock-no-*'.
  const orderedSessions = [...bySession.entries()].sort(([a], [b]) => b.localeCompare(a));

  for (const [, sessEvents] of orderedSessions) {
    const uses = assistantToolUses(sessEvents);
    let writesWithMock = 0;
    let writesWithRealSqlite = 0;
    for (const u of uses) {
      if (u.name !== 'Write') continue;
      const content = (u.input.content as string) ?? '';
      if (content.includes("vi.mock(")) writesWithMock += 1;
      if (content.includes('better-sqlite3') || content.includes(':memory:')) {
        writesWithRealSqlite += 1;
      }
    }
    const lastTs = sessEvents.at(-1)?.timestamp as string | undefined;
    if (writesWithMock > 0) {
      out.push({
        schema_version: 1,
        id: 'bp-candidate-2026-05-13-tests-must-mock-db',
        type: 'rule',
        title: 'Tests MUST mock the database',
        body:
          'Every *.test.ts that exercises a repo / DAO must call vi.mock on the db module to isolate IO; never let a unit test touch a real database client.',
        example: "src/userRepo.test.ts → import { vi } from 'vitest'; vi.mock('./db').",
        pushed_by: 'eve@team.com',
        pushed_by_display: 'Eve',
        topic: 'testing',
        confidence_score: 0,
        confidence_tier: 'low',
        conflict_with: [],
        mining_evidence: {
          sessions_observed: 1,
          pattern_count: writesWithMock,
          reject_count: 0,
          extraction_method: 'behavior-mining-v0-fixture',
        },
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
        created_at: lastTs ?? '2026-05-13T14:00:05Z',
      });
    }
    if (writesWithRealSqlite > 0) {
      out.push({
        schema_version: 1,
        id: 'bp-candidate-2026-05-13-tests-must-not-mock-db',
        type: 'rule',
        title: 'Tests MUST NOT mock the database',
        body:
          'Every *.test.ts that exercises a repo / DAO must use a real in-memory sqlite (or equivalent) so the test verifies the actual SQL contract; never call vi.mock on the db module.',
        example:
          "src/orderRepo.test.ts → import Database from 'better-sqlite3'; const db = new Database(':memory:').",
        pushed_by: 'frank@team.com',
        pushed_by_display: 'Frank',
        topic: 'testing',
        confidence_score: 0,
        confidence_tier: 'low',
        conflict_with: [],
        mining_evidence: {
          sessions_observed: 1,
          pattern_count: writesWithRealSqlite,
          reject_count: 0,
          extraction_method: 'behavior-mining-v0-fixture',
        },
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
        created_at: lastTs ?? '2026-05-13T14:00:05Z',
      });
    }
  }
  return out;
}

/**
 * Hardcoded conflict linker: given an array of finals and a list of id pairs
 * to link, set each BP's conflict_with to the **post-gate** ids of its
 * counterparts. Production code will compute these via LLM (spec §7.1);
 * the fixture pins them so tier (a) stays byte-deterministic.
 */
function linkConflicts(finals: BestPractice[], pairs: Array<[string, string]>): BestPractice[] {
  const byId = new Map<string, BestPractice>();
  for (const f of finals) byId.set(f.id, { ...f, conflict_with: [...f.conflict_with] });
  for (const [a, b] of pairs) {
    const A = byId.get(a);
    const B = byId.get(b);
    if (!A || !B) continue;
    if (!A.conflict_with.includes(b)) A.conflict_with.push(b);
    if (!B.conflict_with.includes(a)) B.conflict_with.push(a);
  }
  // Preserve input order
  return finals.map((f) => byId.get(f.id) ?? f);
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const FIXTURES_ROOT = join(process.cwd(), 'tests', 'fixtures', 'scenarios');

function readJsonl(slug: string): string {
  return readFileSync(join(FIXTURES_ROOT, slug, 'transcript.jsonl'), 'utf8');
}
function readJson<T>(slug: string, name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_ROOT, slug, name), 'utf8')) as T;
}

describe('Phase 6 PR-2 tier (a) byte-diff — bpp-skill-dispatch-parallel', () => {
  const SLUG = 'bpp-skill-dispatch-parallel';
  it('mineDispatchParallel(transcript) byte-equals expected-candidate-bp.json', () => {
    const transcript = readJsonl(SLUG);
    const expected = readJson<CandidateBp>(SLUG, 'expected-candidate-bp.json');
    const actual = mineDispatchParallel(transcript);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual(expected);
  });

  it('gate(candidate, accumulated) byte-equals expected-final-bp.json', () => {
    const transcript = readJsonl(SLUG);
    const expectedFinal = readJson<BestPractice>(SLUG, 'expected-final-bp.json');
    const candidates = mineDispatchParallel(transcript);
    const final = gate(candidates[0]!, {
      sessions_observed: 5,
      pattern_count: 15,
      reject_count: 0,
      extraction_method: 'behavior-mining-v0-fixture',
    });
    expect(final).toEqual(expectedFinal);
  });
});

describe('Phase 6 PR-2 tier (a) byte-diff — bpp-habit-tdd', () => {
  const SLUG = 'bpp-habit-tdd';
  it('mineTddRedFirst(transcript) byte-equals expected-candidate-bp.json', () => {
    const transcript = readJsonl(SLUG);
    const expected = readJson<CandidateBp>(SLUG, 'expected-candidate-bp.json');
    const actual = mineTddRedFirst(transcript);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual(expected);
  });

  it('gate(candidate, accumulated) byte-equals expected-final-bp.json', () => {
    const transcript = readJsonl(SLUG);
    const expectedFinal = readJson<BestPractice>(SLUG, 'expected-final-bp.json');
    const candidates = mineTddRedFirst(transcript);
    const final = gate(candidates[0]!, {
      sessions_observed: 6,
      pattern_count: 15,
      reject_count: 0,
      extraction_method: 'behavior-mining-v0-fixture',
    });
    expect(final).toEqual(expectedFinal);
  });
});

describe('Phase 6 PR-2 tier (a) byte-diff — bpp-context-atomic-commits', () => {
  const SLUG = 'bpp-context-atomic-commits';
  it('mineAtomicCommits(transcript) byte-equals expected-candidate-bp.json', () => {
    const transcript = readJsonl(SLUG);
    const expected = readJson<CandidateBp>(SLUG, 'expected-candidate-bp.json');
    const actual = mineAtomicCommits(transcript);
    expect(actual).toHaveLength(1);
    expect(actual[0]).toEqual(expected);
  });

  it('gate(candidate, accumulated) byte-equals expected-final-bp.json', () => {
    const transcript = readJsonl(SLUG);
    const expectedFinal = readJson<BestPractice>(SLUG, 'expected-final-bp.json');
    const candidates = mineAtomicCommits(transcript);
    const final = gate(candidates[0]!, {
      sessions_observed: 7,
      pattern_count: 15,
      reject_count: 0,
      extraction_method: 'behavior-mining-v0-fixture',
    });
    expect(final).toEqual(expectedFinal);
  });
});

describe('Phase 6 PR-2 tier (a) byte-diff — bpp-conflict-mock-vs-real-db', () => {
  const SLUG = 'bpp-conflict-mock-vs-real-db';

  it('mineMockDbConflict(transcript) produces 2 candidates byte-equal to expected', () => {
    const transcript = readJsonl(SLUG);
    const expected = readJson<CandidateBp[]>(SLUG, 'expected-candidate-bp.json');
    const actual = mineMockDbConflict(transcript);
    expect(actual).toHaveLength(2);
    expect(actual).toEqual(expected);
  });

  it('gate+linkConflicts produces 2 finals with double-linked conflict_with', () => {
    const transcript = readJsonl(SLUG);
    const expectedFinal = readJson<BestPractice[]>(SLUG, 'expected-final-bp.json');
    const candidates = mineMockDbConflict(transcript);

    // Hand-supplied rollups per BP (production reads these from the rollup store).
    const rollups: MiningEvidence[] = [
      {
        sessions_observed: 8,
        pattern_count: 16,
        reject_count: 0,
        extraction_method: 'behavior-mining-v0-fixture',
      },
      {
        sessions_observed: 6,
        pattern_count: 15,
        reject_count: 0,
        extraction_method: 'behavior-mining-v0-fixture',
      },
    ];

    const finals = candidates.map((c, i) => gate(c, rollups[i]!));
    const linked = linkConflicts(finals, [
      ['bp-2026-05-13-tests-must-mock-db', 'bp-2026-05-13-tests-must-not-mock-db'],
    ]);
    expect(linked).toEqual(expectedFinal);
  });

  it('explicit conflict_with check: each BP references the other id (double-linked)', () => {
    const expectedFinal = readJson<BestPractice[]>(SLUG, 'expected-final-bp.json');
    expect(expectedFinal).toHaveLength(2);
    const [bpYes, bpNo] = expectedFinal;
    expect(bpYes!.conflict_with).toEqual([bpNo!.id]);
    expect(bpNo!.conflict_with).toEqual([bpYes!.id]);
  });
});
