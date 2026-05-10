/**
 * Pure lifecycle helpers for the install-state notebook.
 *
 * All functions take `now` as an injected parameter (the Functional Core
 * never reads `Date.now()` itself; the imperative shell injects it). When
 * `now` is omitted callers get `Date.now()` for ergonomic call sites — but
 * tests always pass a fixed timestamp so output is reproducible.
 */
import { STEP_KEYS, type InstallState, type StepKey } from "./schema.js";

/**
 * Construct a fresh, empty state for a project.
 *
 * `createdAt`, `updatedAt`, and `lastRunAt` all start at `now`. Returns
 * an immutable-shaped object (callers must not mutate; use
 * {@link markStepDone} to evolve state).
 */
export function makeEmptyState(
  projectId: string,
  now: number = Date.now(),
): InstallState {
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error("makeEmptyState: projectId must be a non-empty string");
  }
  if (!Number.isFinite(now) || now < 0) {
    throw new Error("makeEmptyState: now must be a non-negative finite number");
  }
  return {
    schemaVersion: "v1",
    projectId,
    createdAt: now,
    updatedAt: now,
    completedSteps: [],
    lastRunAt: now,
  };
}

/**
 * Returns true when the given step is recorded as completed in `state`.
 */
export function isStepDone(state: InstallState, step: StepKey): boolean {
  return state.completedSteps.includes(step);
}

/**
 * Returns a new state with `step` marked done. Idempotent: calling twice
 * with the same step yields the same `completedSteps` array (no
 * duplicates) but bumps `updatedAt` / `lastRunAt`.
 */
export function markStepDone(
  state: InstallState,
  step: StepKey,
  now: number = Date.now(),
): InstallState {
  if (!Number.isFinite(now) || now < 0) {
    throw new Error("markStepDone: now must be a non-negative finite number");
  }
  const completedSteps = state.completedSteps.includes(step)
    ? state.completedSteps
    : [...state.completedSteps, step];
  return {
    schemaVersion: state.schemaVersion,
    projectId: state.projectId,
    createdAt: state.createdAt,
    updatedAt: now,
    completedSteps,
    lastRunAt: now,
  };
}

/**
 * Returns the list of steps in `allSteps` (defaults to canonical
 * STEP_KEYS) that have NOT been marked done in `state`. Order matches
 * `allSteps` — the install command runs them in this declared order.
 */
export function pendingSteps(
  state: InstallState,
  allSteps: readonly StepKey[] = STEP_KEYS,
): StepKey[] {
  return allSteps.filter((s) => !state.completedSteps.includes(s));
}

/**
 * Returns the first not-yet-done step from `allSteps`, or `null` when
 * every step is complete.
 */
export function nextPendingStep(
  state: InstallState,
  allSteps: readonly StepKey[] = STEP_KEYS,
): StepKey | null {
  for (const step of allSteps) {
    if (!state.completedSteps.includes(step)) return step;
  }
  return null;
}
