// Budget tracker tests — spec §3.4 ≤$5/team/day strict cap.
import { describe, it, expect } from 'vitest';
import {
  BudgetTracker,
  BudgetExhaustedError,
  DEFAULT_BUDGET_USD,
} from '../budget-tracker.js';

describe('BudgetTracker', () => {
  it('starts at zero spend with the default $5 ceiling per spec §3.4', () => {
    const t = new BudgetTracker();
    expect(t.spent_usd).toBe(0);
    expect(t.limit_usd).toBe(DEFAULT_BUDGET_USD);
    expect(DEFAULT_BUDGET_USD).toBe(5);
    expect(t.remaining()).toBe(5);
    expect(t.exhausted()).toBe(false);
  });

  it('consume accumulates and updates remaining()', () => {
    const t = new BudgetTracker(1.0);
    t.consume(0.3);
    t.consume(0.2);
    expect(t.spent_usd).toBeCloseTo(0.5, 9);
    expect(t.remaining()).toBeCloseTo(0.5, 9);
    expect(t.exhausted()).toBe(false);
  });

  it('consume throws BudgetExhaustedError when call would exceed the cap', () => {
    const t = new BudgetTracker(1.0);
    t.consume(0.9);
    expect(() => t.consume(0.2)).toThrowError(BudgetExhaustedError);
    // failed call must NOT mutate spent_usd
    expect(t.spent_usd).toBeCloseTo(0.9, 9);
  });

  it('exhausted() flips true when spend exactly hits the limit', () => {
    const t = new BudgetTracker(2.0);
    t.consume(2.0);
    expect(t.exhausted()).toBe(true);
    expect(t.remaining()).toBe(0);
    // further consume of any positive amount throws
    expect(() => t.consume(0.0001)).toThrow();
  });

  it('rejects negative or non-finite limits and consume args', () => {
    expect(() => new BudgetTracker(-1)).toThrow();
    expect(() => new BudgetTracker(Number.NaN)).toThrow();
    const t = new BudgetTracker(5);
    expect(() => t.consume(-0.5)).toThrow();
    expect(() => t.consume(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('reset() returns spent_usd to zero', () => {
    const t = new BudgetTracker(3.0);
    t.consume(2.5);
    t.reset();
    expect(t.spent_usd).toBe(0);
    expect(t.exhausted()).toBe(false);
    expect(t.remaining()).toBe(3.0);
  });
});
