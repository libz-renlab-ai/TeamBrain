import { describe, it, expect } from 'vitest';
import {
  mineContextPatternCandidates,
  EXTRACTION_METHOD,
  ATOMIC_COMMIT_MIN_MEDIAN,
  CHECKPOINT_MIN_SESSIONS,
} from '../context-pattern-miner.js';
import type { SessionSummary, GitActivity } from '../mining-types.js';

function sess(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    session_id: 's1',
    user_id: 'alice@team',
    user_display: 'Alice',
    actions: ['edit_file'],
    started_at: '2026-05-13T10:00:00Z',
    ended_at: '2026-05-13T11:00:00Z',
    ...overrides,
  };
}

describe('context-pattern-miner', () => {
  it('happy path: high-commit-cadence user gets an atomic-commit BP', () => {
    const out = mineContextPatternCandidates({
      session_summaries: [],
      git_log: [
        {
          user_id: 'alice@team',
          user_display: 'Alice',
          commit_count_per_day: [6, 7, 5, 8],
        },
      ],
    });
    expect(out).toHaveLength(1);
    const bp = out[0]!;
    expect(bp.type).toBe('context-mgmt');
    expect(bp.title).toBe('Atomic commit habit');
    expect(bp.pushed_by).toBe('alice@team');
    expect(bp.mining_evidence.sessions_observed).toBe(4); // 4 active days
    expect(bp.mining_evidence.pattern_count).toBe(4); // all 4 days >= threshold
    expect(bp.mining_evidence.extraction_method).toBe(EXTRACTION_METHOD);
    expect(ATOMIC_COMMIT_MIN_MEDIAN).toBe(5); // contract check
  });

  it('empty input returns empty array', () => {
    expect(
      mineContextPatternCandidates({ session_summaries: [], git_log: [] }),
    ).toEqual([]);
  });

  it('low-commit user is dropped; checkpoint-cadence user is kept', () => {
    expect(CHECKPOINT_MIN_SESSIONS).toBe(3); // contract check
    const out = mineContextPatternCandidates({
      session_summaries: [
        sess({ session_id: 's1', actions: ['edit_file', 'checkpoint'] }),
        sess({ session_id: 's2', actions: ['edit_file', 'context_save'] }),
        sess({ session_id: 's3', actions: ['compact', 'edit_file'] }),
      ],
      git_log: [
        {
          user_id: 'alice@team',
          user_display: 'Alice',
          commit_count_per_day: [1, 2, 1], // median below threshold
        },
      ],
    });
    // git_log filtered out; checkpoint cadence emits one
    expect(out).toHaveLength(1);
    const bp = out[0]!;
    expect(bp.title).toBe('Regular context checkpoints');
    expect(bp.mining_evidence.pattern_count).toBe(3);
    expect(bp.mining_evidence.sessions_observed).toBe(3);
  });

  it('checkpoint pattern below MIN_SESSIONS is dropped', () => {
    const out = mineContextPatternCandidates({
      session_summaries: [
        sess({ session_id: 's1', actions: ['edit_file', 'checkpoint'] }),
        sess({ session_id: 's2', actions: ['edit_file'] }),
        sess({ session_id: 's3', actions: ['edit_file'] }),
      ],
      git_log: [],
    });
    expect(out).toEqual([]);
  });

  it('both atomic-commit AND checkpoint patterns fire when both are present for one user', () => {
    const out = mineContextPatternCandidates({
      session_summaries: [
        sess({ session_id: 's1', actions: ['checkpoint'] }),
        sess({ session_id: 's2', actions: ['context_save'] }),
        sess({ session_id: 's3', actions: ['compact'] }),
      ],
      git_log: [
        {
          user_id: 'alice@team',
          user_display: 'Alice',
          commit_count_per_day: [5, 6, 7],
        },
      ],
    });
    expect(out).toHaveLength(2);
    const titles = out.map((c) => c.title).sort();
    expect(titles).toEqual(['Atomic commit habit', 'Regular context checkpoints']);
  });
});
