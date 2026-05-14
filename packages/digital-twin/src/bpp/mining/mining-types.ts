// BPP mining pipeline — shared types (Phase 2).
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §3.
// Plan: docs/superpowers/plans/2026-05-13-bpp.md Phase 2 (P2.1 - P2.6).
//
// These types live alongside (NOT replacing) `../types.ts`. They describe the
// pre-Wilson candidate stage. After `wilson-tier-gate.ts` runs, candidates are
// converted to the canonical `BestPractice` shape from `../types.ts`.

import type { BpType, BpTopic, MiningEvidence } from '../types.js';

/**
 * Candidate BestPractice produced by a miner (correction-adapter / behavior-miner /
 * context-pattern-miner). Same shape as `BestPractice` minus the calibrator-derived
 * fields (`confidence_score`, `confidence_tier`) and the lifecycle fields
 * (`revoked_at`, `revoked_by`, `revoke_reason`, `conflict_with`, `schema_version`).
 *
 * `mining_evidence` is mandatory and MUST contain objective integer counts (not
 * LLM summaries) per spec §3.5 — Phase 6 verify harness greps these numbers.
 */
export interface CandidateBp {
  id: string;
  type: BpType;
  title: string;
  body: string;
  example: string;
  pushed_by: string;
  pushed_by_display: string;
  topic: BpTopic;
  mining_evidence: MiningEvidence;
  created_at: string;
}

/**
 * Single correction-moment record fed to `correction-adapter.ts`.
 * Reuses the existing correction-detector pipeline shape (auto-capture) at the
 * adapter boundary — actual integration with that pipeline is wired in Phase 6.
 */
export interface CorrectionMoment {
  session_id: string;
  user_id: string;
  user_display: string;
  signal: string;
  text: string;
  topic: BpTopic;
  timestamp: string;
}

/**
 * Single session summary fed to `behavior-miner.ts` and `context-pattern-miner.ts`.
 * `actions` is the ordered list of high-level action labels observed in that
 * session — e.g. ["read_file", "edit_file", "run_test", "commit", ...].
 */
export interface SessionSummary {
  session_id: string;
  user_id: string;
  user_display: string;
  actions: string[];
  started_at: string;
  ended_at: string;
}

/**
 * Per-user git activity rollup fed to `context-pattern-miner.ts`.
 * `commit_count_per_day` is a list of day-level commit counts (one entry per
 * day in the observation window); used to detect "atomic commit habit" patterns.
 */
export interface GitActivity {
  user_id: string;
  user_display: string;
  commit_count_per_day: number[];
}

/**
 * Input bundle for the full mining pipeline (mirrors the trigger fan-in described
 * in spec §3.3). Each miner consumes a subset of these fields.
 */
export interface MiningInput {
  correction_moments: CorrectionMoment[];
  session_summaries: SessionSummary[];
  git_log: GitActivity[];
}
