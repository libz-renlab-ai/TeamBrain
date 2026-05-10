/**
 * Pure encode/decode for the install-state notebook.
 *
 * `serializeState` produces a deterministic JSON string (sorted-key,
 * 2-space-indented) so two callers writing the same value produce
 * byte-identical output (helps `diff -u` flag drift).
 *
 * `parseState` returns a discriminated union (`ParseResult`) instead of
 * throwing — corruption recovery is a fs-side concern (rename + return
 * null) and the pure side just signals the reason.
 */
import { InstallStateSchema, type InstallState } from "./schema.js";

export type ParseFailureReason =
  | "missing"
  | "invalid-json"
  | "schema-mismatch";

export type ParseResult =
  | { ok: true; state: InstallState }
  | { ok: false; reason: ParseFailureReason };

/**
 * Serialize an InstallState to a deterministic JSON string.
 *
 * Object property order is established at construction time (we always
 * pass through `InstallStateSchema.parse` which preserves the object
 * literal order from {@link makeEmptyState}/{@link markStepDone}). Two
 * arrays of completedSteps in the same order produce identical bytes.
 */
export function serializeState(state: InstallState): string {
  // Validate before serializing — refuses to write a corrupt object.
  const validated = InstallStateSchema.parse(state);
  return JSON.stringify(validated, null, 2);
}

/**
 * Parse a raw string into a typed InstallState.
 *
 * Returns:
 *   - `{ ok: true, state }` for a well-formed v1 file.
 *   - `{ ok: false, reason: "missing" }` when raw is empty/whitespace.
 *   - `{ ok: false, reason: "invalid-json" }` when JSON.parse throws.
 *   - `{ ok: false, reason: "schema-mismatch" }` for Zod validation
 *     failure (also covers `schemaVersion` literal mismatch — e.g., a
 *     future "v2" file).
 *
 * Never throws.
 */
export function parseState(raw: string | null | undefined): ParseResult {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "missing" };
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  const result = InstallStateSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "schema-mismatch" };
  }
  return { ok: true, state: result.data };
}
