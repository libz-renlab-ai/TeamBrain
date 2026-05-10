/**
 * InstallStateStore Port (issue #155 / ADR-0011).
 *
 * The cross-session install-state notebook seam. Two methods:
 *   - `load(projectId)`: returns the stored InstallState, or `null` when
 *     no notebook exists (or when the impl recovered from a corrupt file
 *     by renaming it aside).
 *   - `save(projectId, state)`: writes the notebook. Caller is responsible
 *     for invariants (timestamp monotonicity, schemaVersion correctness)
 *     — see `markStepDone` in `@teamagent/core/install-state`.
 *
 * Implementations:
 *   - `FsInstallStateStore` (`packages/cli/src/install-state-fs-store.ts`)
 *     — production fs-backed adapter, reads/writes
 *     `~/.teamagent/install-state/<projectId>.json`.
 *   - In-memory fakes for tests live next to the contract suite at
 *     `packages/ports/src/__tests__/install-state-store-contract.ts`.
 *
 * ## Why InstallState is declared structurally here
 *
 * The canonical InstallStateV1 type lives in
 * `@teamagent/core/install-state`. This file declares an identically-
 * shaped structural type so that `packages/ports/` does NOT take a
 * runtime dependency on `@teamagent/core` (which would invert the
 * existing `core -> ports` direction and create a workspace cycle).
 *
 * Structural typing makes the two definitions interchangeable: any
 * `InstallStateV1` from `@teamagent/core/install-state` is assignable to
 * the `InstallState` type below and vice versa, because TypeScript
 * compares object shapes, not nominal identities.
 */

/**
 * Schema-version literal for the v1 notebook shape.
 *
 * Future-version files (v2+) read by v1 code surface as a parse failure,
 * not as a successful load — handled by `parseState` in
 * `@teamagent/core/install-state`.
 */
export type InstallStateSchemaVersion = "v1";

/**
 * Step keys recognized by the install-state notebook v1.
 *
 * Mirrors `STEP_KEYS` in `@teamagent/core/install-state`. Adding a new
 * step here MUST be matched in core so the Zod schema accepts it.
 */
export type InstallStepKey =
  | "npm-global-install"
  | "hook-write"
  | "plugin-copy"
  | "config-write"
  | "migration-apply"
  | "post-install-verify";

/**
 * Structural shape of the install-state notebook v1.
 *
 * Identical to `InstallStateV1` exported by `@teamagent/core/install-state`.
 * See module-level comment for why this is declared structurally rather
 * than imported.
 */
export interface InstallState {
  schemaVersion: InstallStateSchemaVersion;
  projectId: string;
  /** epoch ms */
  createdAt: number;
  /** epoch ms */
  updatedAt: number;
  completedSteps: InstallStepKey[];
  /** epoch ms */
  lastRunAt: number;
}

/**
 * Cross-session install-state notebook seam.
 *
 * Implementations MUST:
 *   1. `load` returns `null` when no notebook exists for `projectId`
 *      (vs. throwing). When the impl recovers from corruption (e.g., the
 *      fs adapter renames a bad file to `<file>.corrupt.<epoch>.bak`),
 *      it MUST also return `null` rather than surface the error.
 *   2. `save` MUST be effectively atomic — partial writes are not
 *      acceptable (the fs impl uses tmp-file + rename).
 *   3. Neither method blocks on user input or emits user-visible logs;
 *      the install command owns user attribution.
 */
export interface InstallStateStore {
  load(projectId: string): Promise<InstallState | null>;
  save(projectId: string, state: InstallState): Promise<void>;
}
