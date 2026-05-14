// BPP mining — LLM budget tracker.
//
// Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §3.4
// (LLM call budget ≤ $5/team/day; mining is server-side batch, not hot path).
// Plan: docs/plans/2026-05-13-bpp-poc/ (Gap 1 — real LLM mining client).
//
// Simple in-memory counter. Persisted budget tracking (e.g. per-team Redis key
// with daily TTL) belongs to the orchestration layer that wraps this; this
// module only enforces the local per-batch ceiling.

/**
 * Default per-team/day USD ceiling per spec §3.4. Mining batches must not
 * exceed this aggregate cost. Callers may override via constructor arg.
 */
export const DEFAULT_BUDGET_USD = 5;

export class BudgetExhaustedError extends Error {
  constructor(
    public readonly attempted_usd: number,
    public readonly remaining_usd: number,
  ) {
    super(
      `BPP mining budget exhausted: attempted=$${attempted_usd.toFixed(4)} ` +
        `but only $${remaining_usd.toFixed(4)} remaining`,
    );
    this.name = 'BudgetExhaustedError';
  }
}

/**
 * Tracks cumulative USD spend against a fixed limit.
 *
 * Semantics:
 * - `consume(usd)` throws `BudgetExhaustedError` if the call would exceed the
 *   limit (strict cap per spec §3.4 "≤ $5/team/day"). Otherwise it adds to
 *   `spent_usd` and returns the new spent total.
 * - `remaining()` returns `max(0, limit - spent)`.
 * - `exhausted()` is true once spend reaches limit (within float tolerance).
 */
export class BudgetTracker {
  public spent_usd: number;
  public readonly limit_usd: number;

  constructor(limit_usd: number = DEFAULT_BUDGET_USD) {
    if (!Number.isFinite(limit_usd) || limit_usd < 0) {
      throw new Error(`BudgetTracker: limit_usd must be a non-negative finite number, got ${limit_usd}`);
    }
    this.limit_usd = limit_usd;
    this.spent_usd = 0;
  }

  consume(usd: number): number {
    if (!Number.isFinite(usd) || usd < 0) {
      throw new Error(`BudgetTracker.consume: usd must be a non-negative finite number, got ${usd}`);
    }
    const projected = this.spent_usd + usd;
    if (projected > this.limit_usd + EPSILON) {
      throw new BudgetExhaustedError(usd, this.remaining());
    }
    this.spent_usd = projected;
    return this.spent_usd;
  }

  remaining(): number {
    return Math.max(0, this.limit_usd - this.spent_usd);
  }

  exhausted(): boolean {
    return this.spent_usd + EPSILON >= this.limit_usd;
  }

  reset(): void {
    this.spent_usd = 0;
  }
}

const EPSILON = 1e-9;
