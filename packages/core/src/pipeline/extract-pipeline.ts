import { createHash } from "node:crypto";
import type {
  AttributionBus,
  KnowledgeExtractor,
  KnowledgeStore,
  Validator,
  ValidationL0Result,
} from "@teamagent/ports";
import type {
  CorrectionDetector,
  CorrectionMoment,
} from "../correction-detector/rule-based.js";
import type {
  KnowledgeEntry,
  ParsedSession,
  Scope,
} from "@teamagent/types";
import { DEFAULT_FIRE_THRESHOLD, computeEnforcement } from "@teamagent/types";
import { buildSemanticDescriptions } from "./semantic-descriptions.js";

/**
 * Stable signature for a CorrectionMoment — used for cross-run dedup so the
 * same moment does not get re-sent to the LLM on every Stop hook rescan.
 * Truncates text fields to first 200 chars to absorb minor transcript drift.
 */
export function momentSignature(moment: CorrectionMoment): string {
  const parts = [
    String(moment.turnIndex),
    moment.signal,
    (moment.correctionText ?? "").slice(0, 200),
    (moment.previousAssistantText ?? "").slice(0, 200),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * 提取 Pipeline 的依赖。所有 IO（LLM/Store/Bus）通过注入传入，保持 core 纯。
 */
export interface ExtractPipelineDeps {
  detector: CorrectionDetector;
  extractor: KnowledgeExtractor;
  callLLM: (prompt: string) => Promise<string>;
  store: KnowledgeStore;
  /** 可选：所有条目写入完成后触发一次全量编译（通常用于 CLAUDE.md）。 */
  recompile?: (activeEntries: KnowledgeEntry[]) => void | Promise<void>;
  /** 可选：归因事件总线。缺省时不 emit。 */
  bus?: AttributionBus;
  /** 新条目挂的 scope。通常 "personal" 或 "team"。 */
  scope: Scope;
  /** 新条目的 source 字段。默认 "accumulated"。 */
  source?: "accumulated" | "team-shared";
  /** 当前时间 getter——注入以便测试固定时间戳。 */
  now: () => Date;
  /** id 生成器——注入以便测试稳定 id。 */
  idGen: () => string;
  /** 可选：L0 入库门闸。缺省时放行所有（向后兼容）。 */
  validator?: Pick<Validator, "validateLevel0">;
  /** 可选：项目 stack（file_types 一致性检查用）。缺省 []。 */
  projectStack?: string[];
  /** 可选：L0 拒绝时的回调。可用于 rejection log 持久化。 */
  rejectionLog?: (
    entry: KnowledgeEntry,
    result: ValidationL0Result,
  ) => void | Promise<void>;
  /**
   * 可选：判断一个 moment 的签名是否已在之前的 run 里处理过。
   * 返回 true 则跳过 LLM 调用,deduped++。
   */
  isMomentSeen?: (signature: string) => boolean;
  /**
   * 可选：记录 moment 签名。extracted / skipped (null) / rejected (L0) 时调用;
   * failed (LLM 抛异常) 时不调用,留待下次 run 重试。
   */
  markMomentSeen?: (signature: string) => void;
}

/**
 * 一次 Pipeline 运行的结果摘要。
 */
export interface ExtractPipelineResult {
  /** 识别到的纠正时刻总数 */
  correctionsFound: number;
  /** 成功写入 store 的新条目 */
  extracted: KnowledgeEntry[];
  /** LLM 判定信号太弱（返回 null）跳过的条数 */
  skipped: number;
  /** LLM 或 store 调用失败的条数 */
  failed: number;
  /** L0 入库门拒绝的条目及原因（M2.3 新增）。 */
  rejected: { entry: KnowledgeEntry; reasons: string[] }[];
  /** 因签名已见而跳过 LLM 调用的条数（M2.11 新增）。 */
  deduped: number;
}

/**
 * 编排 detector → extractor → store → recompile 一条龙。
 *
 * 每条纠正：
 * 1. extractor.extract 得到 Partial<KnowledgeEntry> | null
 * 2. null → skipped（信号不足）
 * 3. 否则补全必填字段 → store.add → extracted.push → bus.emit
 * 4. 个别失败不影响整体（try/catch），只增 failed 计数
 *
 * 循环结束后：recompile 一次（若提供）。
 */
export async function runExtractPipeline(
  session: ParsedSession,
  deps: ExtractPipelineDeps,
): Promise<ExtractPipelineResult> {
  const corrections = deps.detector.detect(session);
  const result: ExtractPipelineResult = {
    correctionsFound: corrections.length,
    extracted: [],
    skipped: 0,
    failed: 0,
    rejected: [],
    deduped: 0,
  };

  for (const moment of corrections) {
    const signature = momentSignature(moment);
    if (deps.isMomentSeen && deps.isMomentSeen(signature)) {
      result.deduped++;
      emit(deps.bus, {
        source: "extractor",
        action: "deduped",
        target: { count: 1 },
        severity: "info",
        userFacingValue: `已在历史 run 中处理过（turn ${moment.turnIndex}）`,
        timestamp: isoNow(deps.now),
      });
      continue;
    }
    const context = formatCorrectionContext(moment);
    try {
      const partial = await deps.extractor.extract(
        { kind: "correction", context, weight: moment.weight },
        deps.callLLM,
      );
      if (partial === null) {
        result.skipped++;
        deps.markMomentSeen?.(signature);
        emit(deps.bus, {
          source: "extractor",
          action: "skipped",
          target: { count: 1 },
          severity: "info",
          userFacingValue: `纠正信号不足，未提取（turn ${moment.turnIndex}）`,
          timestamp: isoNow(deps.now),
        });
        continue;
      }

      const entry = assembleEntry(partial, moment, deps);

      // L0 入库门闸（M2.3）——拒绝的条目不入 store，只记 rejection log
      if (deps.validator) {
        const l0 = deps.validator.validateLevel0({
          entry,
          sourceText: context,
          existingRules: deps.store.getAll().map((r) => ({
            id: r.id,
            trigger: r.trigger,
            wrong_pattern: r.wrong_pattern,
          })),
          projectStack: deps.projectStack ?? [],
        });
        if (!l0.ok) {
          result.rejected.push({ entry, reasons: l0.failed_checks });
          deps.markMomentSeen?.(signature);
          if (deps.rejectionLog) {
            try {
              await deps.rejectionLog(entry, l0);
            } catch {
              // rejection log 故障不影响主流程
            }
          }
          emit(deps.bus, {
            source: "extractor",
            action: "rejected_l0",
            target: { id: entry.id, count: 1 },
            severity: "info",
            userFacingValue: `L0 拒绝：${l0.failed_checks.join(", ")}`,
            timestamp: isoNow(deps.now),
          });
          continue;
        }
      }

      if (deps.store.addWithEmbedding) {
        await deps.store.addWithEmbedding(entry);
      } else {
        deps.store.add(entry);
      }
      result.extracted.push(entry);
      deps.markMomentSeen?.(signature);
      emit(deps.bus, {
        source: "extractor",
        action: "extracted",
        target: { id: entry.id, count: 1 },
        severity: "highlight",
        userFacingValue: `学到：${entry.trigger} → ${entry.correct_pattern}`,
        timestamp: isoNow(deps.now),
      });
    } catch (err) {
      result.failed++;
      emit(deps.bus, {
        source: "extractor",
        action: "failed",
        target: { count: 1 },
        severity: "warning",
        userFacingValue: `提取失败（turn ${moment.turnIndex}）: ${String(err).slice(0, 120)}`,
        timestamp: isoNow(deps.now),
      });
    }
  }

  if (deps.recompile) {
    try {
      await deps.recompile(deps.store.getActive());
      emit(deps.bus, {
        source: "compiler",
        action: "recompiled",
        target: { count: result.extracted.length },
        severity: "info",
        userFacingValue: `CLAUDE.md 已按新知识重编译（+${result.extracted.length}）`,
        timestamp: isoNow(deps.now),
      });
    } catch (err) {
      emit(deps.bus, {
        source: "compiler",
        action: "failed",
        severity: "warning",
        userFacingValue: `重编译失败: ${String(err).slice(0, 120)}`,
        timestamp: isoNow(deps.now),
      });
    }
  }

  return result;
}

/**
 * 把 CorrectionMoment 拼成交给 LLM 的上下文字符串。
 */
export function formatCorrectionContext(moment: CorrectionMoment): string {
  const tools = moment.previousToolCalls.length
    ? `[AI 之前调用的工具: ${moment.previousToolCalls.join(", ")}]\n`
    : "";
  return [
    `[信号: ${moment.signal}, 权重: ${moment.weight.toFixed(2)}]`,
    moment.previousAssistantText
      ? `AI 之前说: ${truncate(moment.previousAssistantText, 600)}`
      : "",
    tools,
    `用户纠正: ${truncate(moment.correctionText, 600)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * LLM 提取的 accumulated 条目默认 scope.file_types：只覆盖代码文件，
 * 排除文档（.md / .txt / .rst）。避免规则在讨论自己的文档里反噬（自指拦截）。
 *
 * 背景：M4 dogfood 时发现 LLM 抽出的"禁用 axios"类规则会在评测文档里拦住
 * 本文档的写入（文档 content 含 "axios" 触发 matcher）。加默认 file_types
 * 使 matcher 在 scope 检查阶段跳过非代码文件。
 *
 * 调用方若在 deps.scope 上已经设置 file_types 或 paths，则不覆盖。
 */
export const DEFAULT_CODE_FILE_TYPES: readonly string[] = [
  "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs",
  "*.py", "*.go", "*.rs", "*.java", "*.kt",
  "*.c", "*.cpp", "*.h", "*.hpp",
  "*.sh", "*.bash",
  "*.rb", "*.php", "*.cs",
  "*.json", "*.yaml", "*.yml", "*.toml",
  "*.sql",
];

/**
 * 把 LLM 抽取结果补完成 KnowledgeEntry。
 */
function assembleEntry(
  partial: Partial<KnowledgeEntry>,
  moment: CorrectionMoment,
  deps: ExtractPipelineDeps,
): KnowledgeEntry {
  const confidence = moment.weight;
  const nature = (partial.nature ?? "subjective") as "objective" | "subjective";
  const enforcement = computeEnforcement(confidence, nature);
  const nowIso = isoNow(deps.now);
  const descriptions = buildSemanticDescriptions({
    trigger: partial.trigger,
    wrong_pattern: partial.wrong_pattern,
    correct_pattern: partial.correct_pattern,
    reasoning: partial.reasoning,
  });

  // 若调用方没有显式给 scope 加范围，加默认代码文件范围
  const scopeHasExplicitRange =
    (deps.scope.paths && deps.scope.paths.length > 0) ||
    (deps.scope.file_types && deps.scope.file_types.length > 0);
  const scope = scopeHasExplicitRange
    ? deps.scope
    : { ...deps.scope, paths: ["**/*"], file_types: [...DEFAULT_CODE_FILE_TYPES] };

  return {
    id: deps.idGen(),
    scope,
    category: partial.category ?? "E",
    tags: partial.tags ?? [],
    type: partial.type ?? "avoidance",
    nature,
    trigger: partial.trigger ?? "",
    wrong_pattern: partial.wrong_pattern ?? "",
    correct_pattern: partial.correct_pattern ?? "",
    reasoning: partial.reasoning ?? "",
    confidence,
    enforcement,
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: {
      success_sessions: 0,
      success_users: 0,
      correction_sessions: 1,
    },
    created_at: nowIso,
    last_hit_at: "",
    last_validated_at: nowIso,
    source: deps.source ?? "accumulated",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
    trigger_description: partial.trigger_description ?? descriptions.trigger_description,
    pattern_description: partial.pattern_description ?? descriptions.pattern_description,
    fire_threshold: partial.fire_threshold ?? DEFAULT_FIRE_THRESHOLD,
    threshold_alpha: partial.threshold_alpha ?? 1.0,
    threshold_beta: partial.threshold_beta ?? 1.0,
    embedder_model_id: partial.embedder_model_id ?? "",
  };
}

function emit(
  bus: AttributionBus | undefined,
  event: Parameters<AttributionBus["emit"]>[0],
): void {
  if (!bus) return;
  try {
    bus.emit(event);
  } catch {
    // bus 故障不影响主流程
  }
}

function isoNow(now: () => Date): string {
  return now().toISOString();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}
