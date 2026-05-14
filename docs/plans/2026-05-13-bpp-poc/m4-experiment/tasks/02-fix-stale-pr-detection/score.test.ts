import { describe, it, expect } from 'vitest';
import { isStale } from './starter/stale-pr';

const NOW = new Date('2026-05-13T00:00:00Z');

describe('isStale', () => {
  it('returns true when updated > 30 days ago', () => {
    expect(
      isStale(
        {
          number: 1,
          updatedAt: '2026-04-01T00:00:00Z',
          baseHeadAt: '2026-04-01T00:00:00Z',
          labels: [],
        },
        NOW,
      ),
    ).toBe(true);
  });

  it('returns false when updated within 30 days and base equal', () => {
    expect(
      isStale(
        {
          number: 2,
          updatedAt: '2026-05-10T00:00:00Z',
          baseHeadAt: '2026-05-10T00:00:00Z',
          labels: [],
        },
        NOW,
      ),
    ).toBe(false);
  });

  it('returns true when base is > 14 days ahead and no keep-alive', () => {
    expect(
      isStale(
        {
          number: 3,
          updatedAt: '2026-04-20T00:00:00Z',
          baseHeadAt: '2026-05-08T00:00:00Z',
          labels: ['feature', 'wip'],
        },
        NOW,
      ),
    ).toBe(true);
  });

  it('returns false when keep-alive label present even if base is ahead', () => {
    expect(
      isStale(
        {
          number: 4,
          updatedAt: '2026-04-20T00:00:00Z',
          baseHeadAt: '2026-05-08T00:00:00Z',
          labels: ['keep-alive'],
        },
        NOW,
      ),
    ).toBe(false);
  });

  it('handles null labels without throwing', () => {
    expect(() =>
      isStale(
        {
          number: 5,
          updatedAt: '2026-05-10T00:00:00Z',
          baseHeadAt: '2026-05-10T00:00:00Z',
          labels: null,
        },
        NOW,
      ),
    ).not.toThrow();
  });

  it('returns false for fresh PR with null labels', () => {
    expect(
      isStale(
        {
          number: 6,
          updatedAt: '2026-05-12T00:00:00Z',
          baseHeadAt: '2026-05-12T00:00:00Z',
          labels: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it('returns true for a 14-day-base-ahead PR with null labels', () => {
    expect(
      isStale(
        {
          number: 7,
          updatedAt: '2026-04-20T00:00:00Z',
          baseHeadAt: '2026-05-08T00:00:00Z',
          labels: null,
        },
        NOW,
      ),
    ).toBe(true);
  });
});
