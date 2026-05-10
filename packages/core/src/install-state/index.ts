/**
 * Public surface of the install-state pure module (issue #155 / ADR-0011).
 *
 * Exports ONLY pure functions: schema, encode/decode, lifecycle,
 * project-id resolution. Does NOT export the `InstallStateStore` Port
 * (that lives in `@teamagent/ports`) or the `FsInstallStateStore` impl
 * (that lives in `@teamagent/cli`).
 *
 * Imported by consumers as:
 *   import { ... } from "@teamagent/core/install-state";
 */

export {
  STEP_KEYS,
  InstallStateSchema,
  InstallStateV1Schema,
  type InstallState,
  type InstallStateV1,
  type StepKey,
} from "./schema.js";

export {
  serializeState,
  parseState,
  type ParseResult,
  type ParseFailureReason,
} from "./encode.js";

export {
  makeEmptyState,
  isStepDone,
  markStepDone,
  pendingSteps,
  nextPendingStep,
} from "./lifecycle.js";

export { resolveProjectId } from "./project-id.js";

export { checkpoint } from "./checkpoint.js";
