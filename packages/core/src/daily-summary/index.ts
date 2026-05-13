/**
 * Public barrel for the daily-summary feature (issue #371).
 *
 * Imperative shell (CLI / hook) imports everything it needs from here so the
 * internal file layout stays a single-package implementation detail.
 */

export {
  encodeCwdToProjectDir,
  decodeProjectDirToCwd,
} from "./cwd-decode.js";

export { toProjectKey, type ProjectKey } from "./project-key.js";

export {
  scanTodayActivity,
  type ScanOptions,
  type ScanResult,
  type ProjectGroup,
  type SessionRecord,
} from "./scanner.js";

export { digestProjectGroup, type ProjectDigest } from "./aggregator.js";

export {
  matchPrompt,
  matchPromptWithIntentCheck,
  parseExtraTriggersEnv,
  type MatcherResult,
  type MatcherOptions,
  type MatcherReason,
} from "./prompt-matcher.js";

export {
  composeAdditionalContext,
  composeArchiveMarkdown,
  type RewriterInput,
} from "./rewriter.js";
