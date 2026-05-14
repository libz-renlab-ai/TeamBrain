import { describe, it, expect } from 'vitest';
import { mineCorrectionCandidates, EXTRACTION_METHOD } from '../correction-adapter.js';
import type { CorrectionMoment } from '../mining-types.js';

function moment(overrides: Partial<CorrectionMoment>): CorrectionMoment {
  return {
    session_id: 's1',
    user_id: 'alice@team',
    user_display: 'Alice',
    signal: 'mock_db_in_test',
    text: 'Do not mock DB in integration tests.',
    topic: 'testing',
    timestamp: '2026-05-13T10:00:00Z',
    ...overrides,
  };
}

describe('correction-adapter', () => {
  it('happy path: groups by (user, signal) and counts distinct sessions per pattern', () => {
    const out = mineCorrectionCandidates({
      correction_moments: [
        moment({ session_id: 's1', signal: 'mock_db_in_test' }),
        moment({ session_id: 's2', signal: 'mock_db_in_test' }),
        moment({ session_id: 's3', signal: 'mock_db_in_test' }),
        moment({ session_id: 's2', signal: 'skip_review' }), // different signal, same user
      ],
    });
    expect(out).toHaveLength(2);
    const mock = out.find((c) => c.id.includes('mock-db-in-test'))!;
    expect(mock.type).toBe('rule');
    expect(mock.pushed_by).toBe('alice@team');
    expect(mock.mining_evidence.pattern_count).toBe(3);
    // alice has 3 distinct sessions overall (s1, s2, s3)
    expect(mock.mining_evidence.sessions_observed).toBe(3);
    expect(mock.mining_evidence.reject_count).toBe(0);
    expect(mock.mining_evidence.extraction_method).toBe(EXTRACTION_METHOD);
  });

  it('empty input returns empty array', () => {
    expect(mineCorrectionCandidates({ correction_moments: [] })).toEqual([]);
  });

  it('different users with same signal emit separate candidates', () => {
    const out = mineCorrectionCandidates({
      correction_moments: [
        moment({ user_id: 'alice@team', session_id: 's1' }),
        moment({ user_id: 'bob@team', user_display: 'Bob', session_id: 's2' }),
      ],
    });
    expect(out).toHaveLength(2);
    const users = new Set(out.map((c) => c.pushed_by));
    expect(users.has('alice@team')).toBe(true);
    expect(users.has('bob@team')).toBe(true);
    // each user has only 1 session of their own
    for (const c of out) {
      expect(c.mining_evidence.sessions_observed).toBe(1);
      expect(c.mining_evidence.pattern_count).toBe(1);
    }
  });

  it('repeated signal in the SAME session counts as one pattern hit', () => {
    const out = mineCorrectionCandidates({
      correction_moments: [
        moment({ session_id: 's1', signal: 'mock_db_in_test', timestamp: '2026-05-13T10:00:00Z' }),
        moment({ session_id: 's1', signal: 'mock_db_in_test', timestamp: '2026-05-13T10:05:00Z' }),
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.mining_evidence.pattern_count).toBe(1);
    // created_at is earliest timestamp
    expect(out[0]!.created_at).toBe('2026-05-13T10:00:00Z');
  });
});
