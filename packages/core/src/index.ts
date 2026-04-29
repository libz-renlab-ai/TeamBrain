export { scoreEntry } from "./scorer.js";
export {
  compileMarkdownBlock,
  injectBlockIntoDoc,
  BLOCK_START,
  BLOCK_END,
  type CompileMarkdownOptions,
} from "./compiler/markdown.js";
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
export { ruleBasedCorrectionDetector } from "./correction-detector/rule-based.js";
export { ruleBasedSuccessDetector } from "./success-detector/rule-based.js";
export { parseSessionFile } from "./session-parser/index.js";
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
export { clusterByTag } from "./error-collector/cross-session-cluster.js";
export { filterSignals } from "./error-collector/signal-filter.js";
export type { FilterOptions } from "./error-collector/signal-filter.js";
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
  scanNarrative,
  formatPendingRecord,
  mergePending,
  selectTopForInjection,
  formatInjectionText,
  type NarrativeHit,
  type PendingWarning,
  type PendingContext,
} from "./narrative-scanner/index.js";
