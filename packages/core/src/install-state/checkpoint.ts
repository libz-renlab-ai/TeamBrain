/**
 * Cross-slice glue (Δ2 in docs/plans/issue-155/INDEX.md §3b).
 *
 * Order 3 (install-merge) calls `installState.checkpoint(stepId)`; this
 * file provides that surface as a thin wrapper over `markStepDone +
 * save`, so order 3 doesn't have to thread the store and projectId
 * through every call site.
 *
 * Pure-FCIS note: this lives in core but takes the `InstallStateStore`
 * Port as a parameter — it does not import a concrete fs adapter. The
 * `import type` below is type-only, matched by the existing
 * `core -> ports` runtime dependency direction in
 * `packages/core/package.json`.
 */
import type { InstallStateStore } from "@teamagent/ports";
import { markStepDone } from "./lifecycle.js";
import { makeEmptyState } from "./lifecycle.js";
import type { InstallState, StepKey } from "./schema.js";

/**
 * Mark `step` done for `projectId`, persisting via `store`.
 *
 *   - If no notebook exists yet for `projectId`, creates a fresh one
 *     anchored at `now` before recording the step.
 *   - Idempotent: re-running with a step already in `completedSteps`
 *     bumps timestamps but does not duplicate the step.
 *   - Returns the post-save InstallState so the caller can continue
 *     reasoning about which steps remain pending.
 *
 * `now` is injected for test determinism; production callers omit it.
 */
export async function checkpoint(
  store: InstallStateStore,
  projectId: string,
  step: StepKey,
  now: number = Date.now(),
): Promise<InstallState> {
  const loaded = (await store.load(projectId)) as InstallState | null;
  const base = loaded ?? makeEmptyState(projectId, now);
  const next = markStepDone(base, step, now);
  await store.save(projectId, next);
  return next;
}
