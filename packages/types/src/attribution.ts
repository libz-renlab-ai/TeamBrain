/**
 * 归因事件——"TeamAgent 帮你做了什么"的结构化表达。
 *
 * 自 PR `teamwork/hookshell-attribution-fused` commit 4 起，AttributionEvent
 * 是按 `kind` 区分的 discriminated union（之前是 `{ source, action: string, ... }`
 * 的 free-string 形态）。改动动机见 ADR-0008：让 StdoutRenderer 可以做
 * exhaustive switch by kind 在编译期捕获遗漏的 emit point。
 *
 * 命名约定：`kind` 用 `domain.action` 或 `verb-noun` 风格，与
 * `PersistedEvent.kind`（`hook-pre.matched` / `ai.narrative.injected`）一致。
 *
 * 共同字段：所有 kind 都带 `severity`（决定 visibility filter）+
 * `timestamp`（ISO 8601）+ `source`（聚合 channel 标签，便于在 Renderer 里
 * 按 source 分组）。每个 kind 自己的 payload 字段是 typed，不再用泛 `target`。
 *
 * 可选字段：`userFacingValue`（人话："下次遇到 X 会改用 Y"）、
 * `counterfactual`（反事实："没有 TeamAgent 你会 Z"，仅 verbose 显示）和
 * `delivery`（audience+blocking 标签，per ADR-0009，metadata only 不映射
 * 退码）都保持 optional——不是每条 kind 都有人话/不是每条都需要明示
 * audience 意图。
 *
 * 添加新 kind 是 type-additive change（不破坏既有 callsite），但必须
 * 同步在 StdoutRenderer 的 switch 里加分支，否则 `_exhaustive: never` 会
 * 在编译期报错。
 */

/** 所有 kind 共享的基础字段。 */
interface AttributionEventBase {
  severity: "info" | "highlight" | "warning";
  /** ISO 8601 */
  timestamp: string;
  /** 对用户有感知价值的一句话："下次遇到 X 会改用 Y" */
  userFacingValue?: string;
  /** 反事实："没有 TeamAgent 你会 Z"，仅 verbose 模式显示 */
  counterfactual?: string;
  /**
   * audience+blocking 复合标签 (metadata only, per ADR-0009)：
   * - "log"     仅用户看 (默认)
   * - "context" 意图让 Claude 当上下文 (当前不映射退码)
   * - "block"   意图阻断 (当前不映射退码)
   *
   * 当前 HookShell 始终 exit 0 (per ADR-0008), delivery 不影响退码。
   * 未来若放宽 always-exit-0 约束, 该字段可作 hook 退码聚合依据。
   */
  delivery?: "log" | "context" | "block";
}

// ──────────────────────────────────────────────────────────────────────────
// pitfall channel
// ──────────────────────────────────────────────────────────────────────────

/** `teamagent pitfall` 录入一条踩坑经验后的归因。 */
export interface PitfallAddedEvent extends AttributionEventBase {
  kind: "pitfall.added";
  source: "pitfall";
  knowledgeId: string;
  category: string;
  tag: string;
  level: "personal" | "team" | "global";
  knowledgeCountBefore: number;
  knowledgeCountAfter: number;
  skillMdPath: string;
}

// ──────────────────────────────────────────────────────────────────────────
// skeleton channel —— `teamagent skeleton-demo` 用
// ──────────────────────────────────────────────────────────────────────────

export interface SkeletonKnowledgeAddedEvent extends AttributionEventBase {
  kind: "skeleton.knowledge-added";
  source: "skeleton";
  knowledgeId: string;
  knowledgeCountBefore: number;
  knowledgeCountAfter: number;
  blockLines: number;
}

export interface SkeletonL0ValidationEvent extends AttributionEventBase {
  kind: "skeleton.l0-validation";
  source: "skeleton";
  knowledgeId: string;
  ok: boolean;
  failedChecks: string[];
}

export interface SkeletonSkillsCompiledEvent extends AttributionEventBase {
  kind: "skeleton.skills-compiled";
  source: "skeleton";
  written: string[];
  legacyDisabled: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// extractor channel —— packages/core/src/pipeline/extract-pipeline.ts
// ──────────────────────────────────────────────────────────────────────────

export interface ExtractorDedupedEvent extends AttributionEventBase {
  kind: "extractor.deduped";
  source: "extractor";
  count: number;
}

export interface ExtractorSkippedEvent extends AttributionEventBase {
  kind: "extractor.skipped";
  source: "extractor";
  count: number;
}

export interface ExtractorExtractedEvent extends AttributionEventBase {
  kind: "extractor.extracted";
  source: "extractor";
  knowledgeId: string;
  count: number;
}

export interface ExtractorRejectedL0Event extends AttributionEventBase {
  kind: "extractor.rejected-l0";
  source: "extractor";
  knowledgeId: string;
  count: number;
}

export interface ExtractorFailedEvent extends AttributionEventBase {
  kind: "extractor.failed";
  source: "extractor";
  count: number;
}

// ──────────────────────────────────────────────────────────────────────────
// compiler channel —— extract-pipeline 末尾的 recompile 钩子
// ──────────────────────────────────────────────────────────────────────────

export interface CompilerRecompiledEvent extends AttributionEventBase {
  kind: "compiler.recompiled";
  source: "compiler";
  count: number;
}

export interface CompilerFailedEvent extends AttributionEventBase {
  kind: "compiler.failed";
  source: "compiler";
}

// ──────────────────────────────────────────────────────────────────────────
// ingest channel —— packages/core/src/pipeline/ingest-pipeline.ts
// ──────────────────────────────────────────────────────────────────────────

export interface IngestFailedEvent extends AttributionEventBase {
  kind: "ingest.failed";
  source: "ingest";
  count: number;
}

export interface IngestSkippedEvent extends AttributionEventBase {
  kind: "ingest.skipped";
  source: "ingest";
  count: number;
}

export interface IngestRejectedL0Event extends AttributionEventBase {
  kind: "ingest.rejected-l0";
  source: "ingest";
  knowledgeId: string;
}

export interface IngestAcceptedEvent extends AttributionEventBase {
  kind: "ingest.accepted";
  source: "ingest";
  knowledgeId: string;
}

// ──────────────────────────────────────────────────────────────────────────
// importer channel —— packages/core/src/importer/rule-structurer.ts
// ──────────────────────────────────────────────────────────────────────────

export interface ImporterSkippedEvent extends AttributionEventBase {
  kind: "importer.skipped";
  source: "importer";
}

export interface ImporterStructuredEvent extends AttributionEventBase {
  kind: "importer.structured";
  source: "importer";
}

export interface ImporterFailedEvent extends AttributionEventBase {
  kind: "importer.failed";
  source: "importer";
}

// ──────────────────────────────────────────────────────────────────────────
// validator channel —— L1/L2 阻断晋升
// ──────────────────────────────────────────────────────────────────────────

export interface ValidatorBlockedPromotionEvent extends AttributionEventBase {
  kind: "validator.blocked-promotion";
  source: "validator";
  knowledgeId: string;
  level: "l1" | "l2";
  fromTier: string;
  toTier: string;
  reason: string;
}

// ──────────────────────────────────────────────────────────────────────────
// calibrator channel
// ──────────────────────────────────────────────────────────────────────────

export interface CalibratorAdjustedEvent extends AttributionEventBase {
  kind: "calibrator.adjusted";
  source: "calibrator";
  knowledgeId: string;
  confidenceBefore: number;
  confidenceAfter: number;
  statusBefore: string;
  statusAfter: string;
}

export interface CalibratorV2AdjustedEvent extends AttributionEventBase {
  kind: "calibrator.v2-adjusted";
  source: "calibrator";
  knowledgeId: string;
  confidenceBefore: number;
  confidenceAfter: number;
  tierBefore: string;
  tierAfter: string;
  demeritBefore: number;
  demeritAfter: number;
}

// ──────────────────────────────────────────────────────────────────────────
// compile channel —— skill 增删提示 + 编译完成
// ──────────────────────────────────────────────────────────────────────────

export interface CompileSkillShouldWriteEvent extends AttributionEventBase {
  kind: "compile.skill-should-write";
  source: "compile";
  knowledgeId: string;
  tierBefore: string;
  tierAfter: string;
}

export interface CompileSkillShouldRemoveEvent extends AttributionEventBase {
  kind: "compile.skill-should-remove";
  source: "compile";
  knowledgeId: string;
  tierBefore: string;
  tierAfter: string;
}

export interface CompileSkillsCompiledEvent extends AttributionEventBase {
  kind: "compile.skills-compiled";
  source: "compile";
  written: number;
  removed: number;
}

// ──────────────────────────────────────────────────────────────────────────
// hook-stop channel —— bin-stop pipeline progress（commits 5-12 会启用）
// ──────────────────────────────────────────────────────────────────────────

export interface HookStopRulesVectorizedEvent extends AttributionEventBase {
  kind: "hook-stop.rules-vectorized";
  source: "hook-stop";
  count: number;
}

export interface HookStopAnalyzeStartedEvent extends AttributionEventBase {
  kind: "hook-stop.analyze-started";
  source: "hook-stop";
  modeTag: string;
}

export interface HookStopAnalyzeFinishedEvent extends AttributionEventBase {
  kind: "hook-stop.analyze-finished";
  source: "hook-stop";
  firstLine?: string;
}

export interface HookStopAnalyzeSkippedEvent extends AttributionEventBase {
  kind: "hook-stop.analyze-skipped";
  source: "hook-stop";
  reason: string;
}

export interface HookStopCalibrationStartedEvent extends AttributionEventBase {
  kind: "hook-stop.calibration-started";
  source: "hook-stop";
}

export interface HookStopCalibrationFinishedEvent extends AttributionEventBase {
  kind: "hook-stop.calibration-finished";
  source: "hook-stop";
}

export interface HookStopSkillsUpdatingEvent extends AttributionEventBase {
  kind: "hook-stop.skills-updating";
  source: "hook-stop";
}

export interface HookStopSkillsExportedEvent extends AttributionEventBase {
  kind: "hook-stop.skills-exported";
  source: "hook-stop";
  count: number;
}

export interface HookStopScanErrorsStartedEvent extends AttributionEventBase {
  kind: "hook-stop.scan-errors-started";
  source: "hook-stop";
}

export interface HookStopScanErrorsProgressEvent extends AttributionEventBase {
  kind: "hook-stop.scan-errors-progress";
  source: "hook-stop";
  lastLine: string;
}

export interface HookStopScanErrorsTimeoutEvent extends AttributionEventBase {
  kind: "hook-stop.scan-errors-timeout";
  source: "hook-stop";
  timeoutMs: number;
}

export interface HookStopSemanticScanHitEvent extends AttributionEventBase {
  kind: "hook-stop.semantic-scan-hit";
  source: "hook-stop";
  count: number;
}

export interface HookStopSemanticScanTimeoutEvent extends AttributionEventBase {
  kind: "hook-stop.semantic-scan-timeout";
  source: "hook-stop";
  timeoutMs: number;
}

export interface HookStopSkipConcurrentEvent extends AttributionEventBase {
  kind: "hook-stop.skip-concurrent";
  source: "hook-stop";
  otherPid: number;
}

// ──────────────────────────────────────────────────────────────────────────
// hook-pre channel —— bin-pre-tool-use（commit 11 会启用）
// ──────────────────────────────────────────────────────────────────────────

export interface HookPreMatchedEvent extends AttributionEventBase {
  kind: "hook-pre.matched";
  source: "hook-pre";
  ruleId: string;
  permissionDecision: "allow" | "deny" | "ask";
}

export interface HookPrePassedEvent extends AttributionEventBase {
  kind: "hook-pre.passed";
  source: "hook-pre";
  ruleCount: number;
}

// ──────────────────────────────────────────────────────────────────────────
// hook-user-prompt channel —— bin-user-prompt-submit（commit 10 会启用）
// ──────────────────────────────────────────────────────────────────────────

export interface UserPromptInjectedEvent extends AttributionEventBase {
  kind: "user-prompt.injected";
  source: "hook-user-prompt";
  injectedIds: string[];
}

export interface UserPromptFlaggedEvent extends AttributionEventBase {
  kind: "user-prompt.flagged";
  source: "hook-user-prompt";
  ruleId: string;
}

// ──────────────────────────────────────────────────────────────────────────
// update channel —— issue #245: 装机率/snooze 转化率遥测
//
// 升级流程的 4 个生命周期事件，对应 grill plan 的 4 个 emit 点：
//   - update-prompt-shown : SessionStart hook 弹 soft-force banner 时
//   - update-snoozed      : `teamagent update --snooze`
//   - update-never-set    : `teamagent update --never`
//   - update-installed    : runUpdater 写入新 last_installed_sha 时
//
// payload 字段保持小、扁平，便于 `teamagent stats` 与第三方 telemetry 聚合。
// 详见 docs/plans/2026-05-10-issue-245/research.md。
// ──────────────────────────────────────────────────────────────────────────

export interface UpdatePromptShownEvent extends AttributionEventBase {
  kind: "update-prompt-shown";
  source: "update";
  /** 当前安装的版本（可能为空字符串——首次装机用户没有 last_installed_version） */
  fromVer: string;
  /** 远端要升级到的版本（CHANGELOG 推断，回退到 SHA 7 位） */
  toVer: string;
  /** banner 弹出时的 snooze level（0 = 从未 snooze） */
  snoozeLevel: number;
}

export interface UpdateSnoozedEvent extends AttributionEventBase {
  kind: "update-snoozed";
  source: "update";
  /** snooze 级别（snooze 后的新 level，>=1） */
  level: number;
  /** 静音到的 epoch ms */
  untilTs: number;
}

export interface UpdateNeverSetEvent extends AttributionEventBase {
  kind: "update-never-set";
  source: "update";
}

export interface UpdateInstalledEvent extends AttributionEventBase {
  kind: "update-installed";
  source: "update";
  /** 升级前 sha（首次装机为空字符串） */
  fromVer: string;
  /** 新装好的 sha */
  toVer: string;
  /** 从 fetchRemoteSha 成功到 install+migrate 完成的耗时 ms */
  durationMs: number;
}

// ──────────────────────────────────────────────────────────────────────────
// 顶层 union
// ──────────────────────────────────────────────────────────────────────────

export type AttributionEvent =
  | PitfallAddedEvent
  | SkeletonKnowledgeAddedEvent
  | SkeletonL0ValidationEvent
  | SkeletonSkillsCompiledEvent
  | ExtractorDedupedEvent
  | ExtractorSkippedEvent
  | ExtractorExtractedEvent
  | ExtractorRejectedL0Event
  | ExtractorFailedEvent
  | CompilerRecompiledEvent
  | CompilerFailedEvent
  | IngestFailedEvent
  | IngestSkippedEvent
  | IngestRejectedL0Event
  | IngestAcceptedEvent
  | ImporterSkippedEvent
  | ImporterStructuredEvent
  | ImporterFailedEvent
  | ValidatorBlockedPromotionEvent
  | CalibratorAdjustedEvent
  | CalibratorV2AdjustedEvent
  | CompileSkillShouldWriteEvent
  | CompileSkillShouldRemoveEvent
  | CompileSkillsCompiledEvent
  | HookStopRulesVectorizedEvent
  | HookStopAnalyzeStartedEvent
  | HookStopAnalyzeFinishedEvent
  | HookStopAnalyzeSkippedEvent
  | HookStopCalibrationStartedEvent
  | HookStopCalibrationFinishedEvent
  | HookStopSkillsUpdatingEvent
  | HookStopSkillsExportedEvent
  | HookStopScanErrorsStartedEvent
  | HookStopScanErrorsProgressEvent
  | HookStopScanErrorsTimeoutEvent
  | HookStopSemanticScanHitEvent
  | HookStopSemanticScanTimeoutEvent
  | HookStopSkipConcurrentEvent
  | HookPreMatchedEvent
  | HookPrePassedEvent
  | UserPromptInjectedEvent
  | UserPromptFlaggedEvent
  | UpdatePromptShownEvent
  | UpdateSnoozedEvent
  | UpdateNeverSetEvent
  | UpdateInstalledEvent;

/** 所有合法的 kind 字面量集合，便于 runtime 校验/枚举。 */
export type AttributionEventKind = AttributionEvent["kind"];

/**
 * 渲染模式。对齐 spec v5.2 可见性配置。
 *
 * - silent: 全不显示
 * - smart: 显示 highlight + warning，不显示 info 和 counterfactual
 * - verbose: 全显示；末尾附加原始 event JSON
 */
export type VisibilityMode = "silent" | "smart" | "verbose";

// Default changed from "smart" → "verbose" (2026-04-21): users want all
// attribution events visible by default so they can see what TeamAgent did.
// Opt out: TEAMAGENT_VISIBILITY=smart 或 =silent
export const DEFAULT_VISIBILITY: VisibilityMode = "verbose";

/** 从环境变量解析 visibility mode。无效值回退到默认。 */
export function parseVisibilityMode(raw: string | undefined): VisibilityMode {
  if (raw === "silent" || raw === "smart" || raw === "verbose") return raw;
  return DEFAULT_VISIBILITY;
}

/**
 * Sanitize a string before rendering it on stderr / stdout.
 *
 * Originally lived as `sanitizeRuleText` in `pre-tool-use-handler.ts` for the
 * Pre-tool-use systemMessage path; lifted here per security-specialist
 * /review on PR #152 so `StdoutRenderer` (which renders every
 * `AttributionEvent.userFacingValue` and `.counterfactual` to stderr) can
 * apply the same hardening. Without this, attacker-influenced rule content
 * (B-126: corrupt UTF-8 surrogate halves; B-130: ANSI cursor moves /
 * terminal-title rewrites embedded in user transcripts) would be echoed to
 * the user's terminal verbatim every time the rule fires.
 *
 * Strips:
 *   - 7-bit CSI (`\x1b[...`) ANSI escape sequences
 *   - 8-bit CSI (`\x9b[...`) ANSI escape sequences (C1 controls)
 *   - 7-bit OSC ending in BEL (`\x1b]...\x07`) — applied after ST variant
 *   - 7-bit OSC ending in ST (`\x1b]...\x1b\`) — applied before BEL variant
 *     to prevent BEL regex consuming across the ST terminator
 *   - 8-bit OSC ending in ST (`\x9d...\x9c`) or BEL (`\x9d...\x07`)
 *   - ASCII control bytes `\x00-\x08`, `\x0b-\x1f`, `\x7f` (newline + tab
 *     preserved so multiline AttributionEvent fields still render correctly)
 *   - lone UTF-16 surrogate halves (mojibake from broken UTF-8 round-trips)
 *
 * Returns "" for non-string input so callers don't have to guard.
 */
export function sanitizeUserFacingText(s: unknown): string {
  if (typeof s !== "string") return "";
  // strip 7-bit CSI escape sequences
  let out = s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  // strip 8-bit CSI escape sequences (C1 \x9b)
  out = out.replace(/\x9b[0-9;?]*[ -/]*[@-~]/g, "");
  // strip 7-bit OSC with ST terminator (\x1b\) BEFORE BEL variant to avoid
  // BEL regex consuming across the ST terminator
  out = out.replace(/\x1b\][^\x1b]*\x1b\\/g, "");
  // strip 7-bit OSC with BEL terminator
  out = out.replace(/\x1b\][^\x07]*\x07/g, "");
  // strip 8-bit OSC (C1 \x9d) ending in ST (\x9c) or BEL (\x07)
  out = out.replace(/\x9d[^\x9c\x07]*[\x9c\x07]/g, "");
  // strip ALL remaining C1 control bytes (\x80-\x9f). Unterminated 8-bit OSC
  // (`\x9d` without `\x9c`/`\x07`) and bare `\x9b` / other C1 controls escape
  // the per-sequence regexes above; this blanket pass catches them. C1 has
  // no legitimate use in user-facing rule text — Latin-1-supplement printable
  // chars start at \xa0.
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\x80-\x9f]/g, "");
  // strip control bytes except newline/tab
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  // strip lone surrogate halves (mojibake from corrupt UTF-8 round-trips)
  out = out.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "");
  out = out.replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  return out;
}
