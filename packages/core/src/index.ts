export { scoreEntry } from "./scorer.js";
export {
  STATIC_USER_SKILLS,
  STATIC_USER_SKILL_TARGETS,
  STATIC_USER_SKILL_CONTENT,
  planStaticUserSkillInstall,
  computeDestPath as computeStaticUserSkillDestPath,
  type StaticUserSkillName,
  type StaticUserSkillTarget,
  type StaticUserSkillAction,
  type StaticUserSkillPlanEntry,
  type FileExistsProbe as StaticUserSkillFileExistsProbe,
  type StaticUserSkillPlanOptions,
} from "./static-user-skills/index.js";
export {
  TRANSLATIONS,
  isDuckModeEnabled,
  duckify,
  duckifyText,
  writeDuckified,
  type DuckTranslation,
  type DuckifyOpts,
  type IsEnabledOpts,
} from "./duck-mode/index.js";
export {
  compileMarkdownBlock,
  injectBlockIntoDoc,
  stripLegacyTeamagentBlock,
  BLOCK_START,
  BLOCK_END,
  type CompileMarkdownOptions,
} from "./compiler/markdown.js";
export {
  compileNestedRuleArtifacts,
  formatRuleAsMarkdown,
  formatTierIndex,
  formatRootIndex,
  NESTED_TIERS,
  type NestedRuleArtifact,
  type CompileNestedRuleOptions,
} from "./compiler/nested-rules.js";
export { compileCursorRules } from "./compiler/cursor.js";
export {
  matchRules,
  type ToolCallContext,
} from "./matcher/legacy/keyword-matcher.js";
export {
  matchRules as matchRulesAsync,
  type MatchContext,
  type MatchResult,
} from "./matcher/match.js";
export {
  scoreSoftAnd,
  DEFAULT_SOFTAND,
  type SoftAndWeights,
} from "./matcher/soft-and-scorer.js";
export {
  semanticMatch,
  type SemanticMatch,
} from "./matcher/semantic-matcher.js";
export {
  rerankByConfidence,
  confidenceWeight,
} from "./ranking/confidence-rank.js";
export {
  accumulateHardNegative,
  MAX_HARD_NEG,
} from "./matcher/hard-negative-accumulator.js";
export {
  ruleBasedCorrectionDetector,
  type CorrectionDetector,
  type CorrectionMoment,
  type CorrectionSignal,
} from "./correction-detector/rule-based.js";
export {
  ruleBasedSuccessDetector,
  type SuccessDetector,
  type SuccessSignal,
  type SuccessSignalType,
} from "./success-detector/rule-based.js";
export { parseSessionFile } from "./session-parser/index.js";
export {
  encodeCwdToProjectDir,
  decodeProjectDirToCwd,
  toProjectKey,
  type ProjectKey,
  scanTodayActivity,
  type ScanOptions,
  type ScanResult,
  type ProjectGroup,
  type SessionRecord,
  digestProjectGroup,
  type ProjectDigest,
  matchPrompt,
  matchPromptWithIntentCheck,
  parseExtraTriggersEnv,
  type MatcherResult,
  type MatcherOptions,
  type MatcherReason,
  composeAdditionalContext,
  composeArchiveMarkdown,
  type RewriterInput,
} from "./daily-summary/index.js";
export {
  buildExtractionPrompt,
  buildRetrofitPrompt,
  type RetrofitInput,
} from "./extractor/prompt.js";
export { extractRuleBullets } from "./importer/claude-md-parser.js";
export { extractCursorRules } from "./importer/cursor-rules-parser.js";
export {
  structureRuleText,
  structureRuleTextsBatch,
  DEFAULT_IMPORT_CONFIDENCE,
  type RuleStructureResult,
} from "./importer/rule-structurer.js";
export {
  detectStack,
  type FilePresence,
  type StackFingerprint,
} from "./detect-stack/index.js";
export { getMetaPrinciples } from "./init/meta-principles.js";
export {
  DEFAULT_MARKETPLACES,
  DEFAULT_PLUGINS,
  parsePluginSpec,
  formatPluginSpec,
  type MarketplaceSpec,
  type PluginSpec,
} from "./init/default-plugins.js";
export { defaultCalibrator } from "./calibrator/default.js";
export {
  runCalibrationPipeline,
  type CalibrationPipelineDeps,
  type CalibrationPipelineResult,
  type AdjustmentRecord,
} from "./pipeline/calibration-pipeline.js";
export {
  type Scenario,
  type ScenarioResult,
  type VerifyResult,
  type PhaseASpec,
  type PhaseBSpec,
  type PhaseCSpec,
} from "./scenario/dsl.js";
export {
  runScenario,
  runVerify,
  entryFromPartial,
} from "./scenario/runner.js";
export {
  llmBasedKnowledgeExtractor,
  parseExtractionResponse,
} from "./extractor/llm-based.js";
export {
  runExtractPipeline,
  formatCorrectionContext,
  momentSignature,
  DEFAULT_CODE_FILE_TYPES,
  type ExtractPipelineDeps,
  type ExtractPipelineResult,
} from "./pipeline/extract-pipeline.js";
export {
  buildSemanticDescriptions,
  type SemanticDescriptions,
  type SemanticDescriptionSource,
} from "./pipeline/semantic-descriptions.js";
export { v2Calibrator } from "./calibrator/v2/index.js";
export {
  runCalibrationPipelineV2,
  type CalibrationV2Deps,
  type CalibrationV2Result,
  type CalibrationV2Record,
} from "./pipeline/calibration-pipeline-v2.js";
export {
  runIngestPipeline,
  type IngestPipelineDeps,
  type IngestPipelineResult,
} from "./pipeline/ingest-pipeline.js";
export {
  defaultValidator,
  validateLevel0,
  validateLevel1,
  validateLevel2,
} from "./validator/index.js";
export { formatAsAgentSkill } from "./compiler/agent-skill.js";
export { runCompile } from "./pipeline/compile-pipeline.js";
export type { CompilePipelineDeps, CompilePipelineResult, SkillEvent, MarkdownCompilerLike } from "./pipeline/compile-pipeline.js";
export {
  detectIgnoredSignals,
  detectCompliedSignals,
  detectBlockedCircumventedSignals,
  type OverrideSignalEvent,
} from "./pipeline/override-signal.js";
export {
  clusterByTag,
  type RawErrorSignal,
} from "./error-collector/cross-session-cluster.js";
export { filterSignals } from "./error-collector/signal-filter.js";
export type { FilterOptions } from "./error-collector/signal-filter.js";
export {
  detectSensitiveText,
  redactSensitiveText,
  type SensitiveFinding,
  type SensitiveFindingKind,
} from "./pii/redactor.js";
export { buildErrorBatches } from "./error-collector/error-batch-builder.js";
export type { ErrorBatch } from "./error-collector/error-batch-builder.js";
export {
  defaultUpdateState,
  parseUpdateState,
  serializeUpdateState,
  type UpdateState,
  type PendingBanner,
} from "./update/update-state.js";
export { shouldCheckUpdate, type ShouldCheckInput } from "./update/should-check.js";
export {
  isLocalUserPrCreator,
  type PrCreatorMatchInput,
} from "./update/pr-creator-match.js";
export {
  nextSnooze,
  shouldPromptUpgrade,
  SNOOZE_DURATIONS_MS,
  type SnoozeResult,
  type ShouldPromptInput,
} from "./update/snooze.js";
export {
  parseChangelog,
  compareVersion,
  type ChangelogBullet,
  type ParseChangelogOptions,
} from "./update/changelog-parser.js";
export {
  renderUpgradePrompt,
  renderWhatsNewTail,
  type RenderUpgradePromptInput,
} from "./update/prompt-text.js";
export {
  makeUpdatePromptShownEvent,
  makeUpdateSnoozedEvent,
  makeUpdateNeverSetEvent,
  makeUpdateInstalledEvent,
  isUpgradeAttributionEvent,
  attributionToPersistedRow,
  type UpgradePersistedRow,
} from "./update/upgrade-events.js";
export {
  scanNarrative,
  formatPendingRecord,
  mergePending,
  selectTopForInjection,
  formatInjectionText,
  type NarrativeHit,
  type PendingWarning,
  type PendingContext,
} from "./narrative-scanner/index.js";

export {
  createPreToolUseHandler,
  type PreToolUseDeps,
  type PreToolUseInput,
  type PreToolUseResult,
  type SemanticHit,
  type HookFormatStyle,
} from "./hook/pre-tool-use-handler.js";

export {
  createPostToolUseHandler,
  inferToolSuccess,
  type PostToolUseDeps,
  type PostToolUseInput,
} from "./hook/post-tool-use-handler.js";

export {
  parseManifest,
  validateManifest,
  serializeManifest,
} from "./m5/manifest.js";
export {
  planInfection,
  type ProjectSnapshot,
  type InfectInput,
} from "./m5/infect-planner.js";
export { computeBootstrapDiff } from "./m5/bootstrap-diff.js";
export {
  scanForSecrets,
  createSecretScanner,
} from "./m5/secret-scanner.js";
export {
  classifyScope,
  createScopeClassifier,
} from "./m5/scope-classifier.js";
export {
  decideShareAction,
  type ShareAction,
  type DecideShareInput,
} from "./m5/auto-share-pipeline.js";
export {
  serializeTeamRule,
  parseTeamRule,
  validateTeamRule,
  isSafeRuleId,
  isSafeAuthor,
  estimateTeamRulePathLength,
  isTeamRulePathLengthSafe,
  WINDOWS_MAX_PATH_BUDGET,
  type TeamRuleFile,
  type TeamRuleState,
  type TeamRuleAlive,
  type TeamRuleTombstone,
} from "./m5/team-rule.js";
export {
  mergeLww,
  mergeLwwBatch,
  type ClaimWithSource,
  type MergeResult,
} from "./m5/lww-merge.js";
export { teamRuleToKnowledgeEntry } from "./m5/team-rule-projection.js";
export {
  PROMPT_VERSION,
  PROMPT_OPEN_MARKER,
  PROMPT_CLOSE_MARKER,
  OBSERVED_FILE_LIST,
  PackMetaSchema,
  parsePackMeta,
  packTag,
  entryHasPackTag,
  diffPackRequest,
  renderPackPromptBody,
  type ObservedFile,
  type ObservedFiles,
  type PackMeta,
  type DiffPackRequestInput,
  type DiffPackRequestResult,
  type RenderPackPromptInput,
} from "./packs/index.js";
export {
  computePresenceState,
  presenceColor,
  DEFAULT_PRESENCE_CONFIG,
  PRESENCE_UNKNOWN,
  type PresenceState,
  type PresenceEventKind,
  type PresenceSnapshot,
  type PresenceConfig,
} from "./presence/index.js";
