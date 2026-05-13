// Compile-time shape tests for mining-types.ts. The runtime body is a single
// `expect(true).toBe(true)` per test — what we're really asserting is that the
// types accept / require the documented fields. If a future edit drops a field
// (or renames one), TypeScript compilation of this file will fail.

import { describe, it, expect } from 'vitest';
import type {
  CandidateBp,
  CorrectionMoment,
  SessionSummary,
  GitActivity,
  MiningInput,
} from '../mining-types.js';

describe('mining-types', () => {
  it('CandidateBp requires all mining_evidence fields as numbers (objective counts)', () => {
    const c: CandidateBp = {
      id: 'bp-1',
      type: 'rule',
      title: 't',
      body: 'b',
      example: 'e',
      pushed_by: 'u@x',
      pushed_by_display: 'U',
      topic: 'testing',
      mining_evidence: {
        sessions_observed: 3,
        pattern_count: 2,
        reject_count: 0,
        extraction_method: 'correction-adapter@v1',
      },
      created_at: '2026-05-13T10:00:00Z',
    };
    // numeric counts — Phase 6 harness greps these
    expect(typeof c.mining_evidence.sessions_observed).toBe('number');
    expect(typeof c.mining_evidence.pattern_count).toBe('number');
    expect(typeof c.mining_evidence.reject_count).toBe('number');
    expect(typeof c.mining_evidence.extraction_method).toBe('string');
  });

  it('MiningInput is the fan-in bundle expected by §3.3 trigger flow', () => {
    const moment: CorrectionMoment = {
      session_id: 's1',
      user_id: 'u@x',
      user_display: 'U',
      signal: 'mock_db_in_test',
      text: '...',
      topic: 'testing',
      timestamp: '2026-05-13T10:00:00Z',
    };
    const sess: SessionSummary = {
      session_id: 's1',
      user_id: 'u@x',
      user_display: 'U',
      actions: ['edit_file', 'run_test'],
      started_at: '2026-05-13T10:00:00Z',
      ended_at: '2026-05-13T11:00:00Z',
    };
    const git: GitActivity = {
      user_id: 'u@x',
      user_display: 'U',
      commit_count_per_day: [3, 4, 6],
    };
    const input: MiningInput = {
      correction_moments: [moment],
      session_summaries: [sess],
      git_log: [git],
    };
    expect(input.correction_moments.length).toBe(1);
    expect(input.session_summaries.length).toBe(1);
    expect(input.git_log.length).toBe(1);
  });

  it('CandidateBp.type is constrained to BpType', () => {
    const types: CandidateBp['type'][] = ['rule', 'habit', 'context-mgmt', 'skill'];
    expect(types.length).toBe(4);
  });
});
