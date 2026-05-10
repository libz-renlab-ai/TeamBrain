/**
 * Install-state notebook schema (issue #155 / ADR-0011).
 *
 * Pure module: no fs, no IO, no time injection except as a parameter.
 * The Zod schema validates the on-disk JSON shape; the schema-version
 * migration is intentionally a transform on the typed value (not on raw
 * bytes), so the Port layer can stay narrow (load/save).
 */
import { z } from "zod";

/**
 * Step keys: per-payload granularity (one step per discrete user-visible
 * prompt the strict-permission gate surfaced).
 *
 * Adding a new StepKey is a non-breaking change as long as the on-disk
 * schemaVersion stays "v1". Bumping to v2 requires a migration entry in
 * `parseState`.
 */
export const STEP_KEYS = [
  "npm-global-install",
  "hook-write",
  "plugin-copy",
  "config-write",
  "migration-apply",
  "post-install-verify",
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

const StepKeySchema = z.enum(STEP_KEYS);

/**
 * On-disk schema for install-state notebook (v1).
 *
 * `schemaVersion` is a string literal so we can read a future v2 file
 * cleanly (Zod produces a typed parse failure rather than a coerced
 * partial).
 */
export const InstallStateV1Schema = z.object({
  schemaVersion: z.literal("v1"),
  projectId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  completedSteps: z.array(StepKeySchema),
  lastRunAt: z.number().int().nonnegative(),
});

export type InstallStateV1 = z.infer<typeof InstallStateV1Schema>;

/**
 * Public alias — when v2 lands, `InstallState` widens to a discriminated
 * union and consumers keep working as long as they only read/write through
 * the lifecycle helpers.
 */
export type InstallState = InstallStateV1;

/**
 * Public alias for the schema — re-exported as `InstallStateSchema` so
 * downstream callers don't have to know about the version suffix.
 */
export const InstallStateSchema = InstallStateV1Schema;
