import { describe, it, expect } from 'vitest';
import {
  mineBehaviorCandidates,
  EXTRACTION_METHOD,
  MIN_SESSIONS_PER_USER,
} from '../behavior-miner.js';
import type { SessionSummary } from '../mining-types.js';

function sess(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    session_id: 's1',
    user_id: 'alice@team',
    user_display: 'Alice',
    actions: ['read_file', 'edit_file'],
    started_at: '2026-05-13T10:00:00Z',
    ended_at: '2026-05-13T11:00:00Z',
    ...overrides,
  };
}

describe('behavior-miner', () => {
  it('happy path: "read_file → edit_file" consistent across 3 sessions emits one habit', () => {
    const out = mineBehaviorCandidates({
      session_summaries: [
        sess({ session_id: 's1', actions: ['read_file', 'edit_file'] }),
        sess({ session_id: 's2', actions: ['read_file', 'edit_file', 'commit'] }),
        sess({ session_id: 's3', actions: ['read_file', 'edit_file'] }),
      ],
    });
    // 'read_file → edit_file' fires 3 times; 'edit_file → commit' fires only
    // once (below MIN_SESSIONS_PER_USER=3), so only the first is emitted.
    expect(out).toHaveLength(1);
    const habit = out[0]!;
    expect(habit.type).toBe('habit');
    expect(habit.title).toBe('Before edit_file, always read_file');
    expect(habit.mining_evidence.pattern_count).toBe(3);
    expect(habit.mining_evidence.sessions_observed).toBe(3);
    expect(habit.mining_evidence.extraction_method).toBe(EXTRACTION_METHOD);
  });

  it('empty input returns empty array', () => {
    expect(mineBehaviorCandidates({ session_summaries: [] })).toEqual([]);
  });

  it('users with fewer than MIN_SESSIONS_PER_USER sessions are skipped entirely', () => {
    expect(MIN_SESSIONS_PER_USER).toBe(3); // contract check
    const out = mineBehaviorCandidates({
      session_summaries: [
        sess({ user_id: 'bob@team', session_id: 's1', actions: ['read_file', 'edit_file'] }),
        sess({ user_id: 'bob@team', session_id: 's2', actions: ['read_file', 'edit_file'] }),
      ],
    });
    expect(out).toEqual([]);
  });

  it('inconsistent preceding actions: pattern hit only in 2 of 3 sessions is dropped', () => {
    const out = mineBehaviorCandidates({
      session_summaries: [
        sess({ session_id: 's1', actions: ['read_file', 'edit_file'] }),
        sess({ session_id: 's2', actions: ['read_file', 'edit_file'] }),
        // session 3: NOT 'read_file → edit_file'; starts directly with edit
        sess({ session_id: 's3', actions: ['run_test'] }),
      ],
    });
    // pair count = 2; below MIN_SESSIONS_PER_USER, so dropped
    expect(out).toEqual([]);
  });

  it('non-starter actions never become a starter; pure read sessions emit nothing', () => {
    const out = mineBehaviorCandidates({
      session_summaries: [
        sess({ session_id: 's1', actions: ['read_file', 'read_file', 'read_file'] }),
        sess({ session_id: 's2', actions: ['read_file', 'read_file'] }),
        sess({ session_id: 's3', actions: ['read_file'] }),
      ],
    });
    expect(out).toEqual([]);
  });
});
