import { describe, it, expect } from 'vitest';
import { parseDuration } from './starter/parseDuration';

describe('parseDuration · positive cases', () => {
  it.each([
    ['500ms', 500],
    ['30s', 30000],
    ['5m', 300000],
    ['2h', 7200000],
    ['1d', 86400000],
    ['1h30m', 5400000],
    ['2d3h45m12s', 186312000],
    ['100ms500s', 500100],
    ['0s', 0],
    ['  1h30m  ', 5400000],
  ])('parses %s correctly', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });
});

describe('parseDuration · error cases', () => {
  it.each([
    [''],
    ['abc'],
    ['5x'],
    ['5'],
    ['5h3'],
  ])('throws on bad input "%s"', (input) => {
    expect(() => parseDuration(input)).toThrow();
  });

  it('throws on null', () => {
    expect(() => parseDuration(null as unknown as string)).toThrow();
  });

  it('throws on undefined', () => {
    expect(() => parseDuration(undefined as unknown as string)).toThrow();
  });

  it('throws on non-string', () => {
    expect(() => parseDuration(123 as unknown as string)).toThrow();
  });
});
