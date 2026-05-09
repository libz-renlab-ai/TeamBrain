import { describe, it, expect } from 'vitest';
import {
  backoffMs,
  shouldDeadLetter,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_FAILURES_BEFORE_DEAD_LETTER,
} from '../backoff.js';

describe('backoffMs', () => {
  it('returns 0 for failures < 1', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(-1)).toBe(0);
  });

  it('first failure returns base (30s)', () => {
    expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
    expect(backoffMs(1)).toBe(30_000);
  });

  it('doubles each failure: 30s, 60s, 120s, 240s', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(4)).toBe(240_000);
  });

  it('caps at MAX_BACKOFF_MS (24h)', () => {
    expect(backoffMs(20)).toBe(MAX_BACKOFF_MS);
    expect(backoffMs(100)).toBe(MAX_BACKOFF_MS);
  });

  it('does not overflow', () => {
    const result = backoffMs(1000);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(MAX_BACKOFF_MS);
  });
});

describe('shouldDeadLetter', () => {
  it('false below 10 failures', () => {
    for (let i = 0; i < MAX_FAILURES_BEFORE_DEAD_LETTER; i++) {
      expect(shouldDeadLetter(i)).toBe(false);
    }
  });

  it('true at 10 failures and above', () => {
    expect(shouldDeadLetter(MAX_FAILURES_BEFORE_DEAD_LETTER)).toBe(true);
    expect(shouldDeadLetter(11)).toBe(true);
    expect(shouldDeadLetter(100)).toBe(true);
  });
});
