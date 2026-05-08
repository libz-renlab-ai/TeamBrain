import type {
  KnowledgeExtractor,
  KnowledgeStore,
} from "@teamagent/ports";
import type { CorrectionDetector } from "../correction-detector/rule-based.js";
import type { KnowledgeEntry, ParsedSession, Scope } from "@teamagent/types";
import { computeEnforcement } from "@teamagent/types";
import { matchRules } from "../matcher/legacy/keyword-matcher.js";
import { runExtractPipeline } from "../pipeline/extract-pipeline.js";
import type {
  Scenario,
  ScenarioResult,
  VerifyResult,
} from "./dsl.js";

/**
 * 执行单个场景三段闭环。所有 IO（store / LLM）通过依赖注入。
 *
 * Phase A → 跑 detector，断言识别正确
 * Phase B → 用 mock LLM 跑 extract pipeline，新规则入 store
 * Phase C → 用 matcher 测试新规则的 hook 行为
 */
export async function runScenario(
  scenario: Scenario,
  deps: {
    detector: CorrectionDetector;
    extractor: KnowledgeExtractor;
    /** 每个场景独立 store 实例（避免相互污染） */
    makeStore: () => KnowledgeStore;
    now: () => Date;
    idGen?: () => string;
  },
): Promise<ScenarioResult> {
  const errors: string[] = [];
  const result: ScenarioResult = {
    scenarioId: scenario.id,
    passed: false,
    phaseA: {
      detectorCalled: false,
      correctionsFound: 0,
      expectedMatches: [],
      passed: false,
    },
    phaseB: {
      extractorCalled: false,
      ruleGenerated: false,
      rulePredicates: [],
      passed: false,
    },
    phaseC: {
      matcherCalled: false,
      actualBehavior: "no-match",
      expectedBehavior: scenario.phaseC.expectedBehavior,
      passed: false,
    },
    prr: 0,
    kp: 0,
    errors,
  };

  // ====== Phase A: detector ======
  let corrections;
  try {
    corrections = deps.detector.detect(scenario.phaseA.session);
    result.phaseA.detectorCalled = true;
    result.phaseA.correctionsFound = corrections.length;
  } catch (err) {
    errors.push(`Phase A detector threw: ${String(err)}`);
    return result;
  }

  result.phaseA.expectedMatches = scenario.phaseA.expectedCorrections.map(
    (exp) => ({
      signal: exp.signal,
      matched: corrections!.some(
        (c) =>
          c.signal === exp.signal &&
          (exp.minWeight === undefined || c.weight >= exp.minWeight) &&
          (exp.turnIndex === undefined || c.turnIndex === exp.turnIndex),
      ),
    }),
  );
  result.phaseA.passed = result.phaseA.expectedMatches.every((m) => m.matched);

  // ====== Phase B: extract ======
  const store = deps.makeStore();
  let counter = 0;
  const idGen =
    deps.idGen ??
    (() => `scenario-${scenario.id}-${++counter}`);

  let pipelineResult;
  try {
    pipelineResult = await runExtractPipeline(scenario.phaseA.session, {
      detector: deps.detector,
      extractor: deps.extractor,
      callLLM: async () => scenario.phaseB.mockLLMResponse,
      store,
      scope: { level: "team" } as Scope,
      now: deps.now,
      idGen,
    });
    result.phaseB.extractorCalled = true;
    result.phaseB.ruleGenerated = pipelineResult.extracted.length > 0;
  } catch (err) {
    errors.push(`Phase B pipeline threw: ${String(err)}`);
    return result;
  }

  // 验证生成的规则满足谓词
  const newRule = pipelineResult.extracted[0];
  if (newRule) {
    const exp = scenario.phaseB.expectedRule;
    const checks: Array<{ predicate: string; passed: boolean }> = [];
    if (exp.categoryEquals !== undefined) {
      checks.push({
        predicate: `category == ${exp.categoryEquals}`,
        passed: newRule.category === exp.categoryEquals,
      });
    }
    if (exp.typeEquals !== undefined) {
      checks.push({
        predicate: `type == ${exp.typeEquals}`,
        passed: newRule.type === exp.typeEquals,
      });
    }
    if (exp.natureEquals !== undefined) {
      checks.push({
        predicate: `nature == ${exp.natureEquals}`,
        passed: newRule.nature === exp.natureEquals,
      });
    }
    if (exp.triggerContains !== undefined) {
      checks.push({
        predicate: `trigger contains "${exp.triggerContains}"`,
        passed: newRule.trigger.includes(exp.triggerContains),
      });
    }
    if (exp.wrongPatternContains !== undefined) {
      checks.push({
        predicate: `wrong_pattern contains "${exp.wrongPatternContains}"`,
        passed: (newRule.wrong_pattern ?? "").includes(exp.wrongPatternContains),
      });
    }
    if (exp.correctPatternContains !== undefined) {
      checks.push({
        predicate: `correct_pattern contains "${exp.correctPatternContains}"`,
        passed: newRule.correct_pattern.includes(exp.correctPatternContains),
      });
    }
    if (exp.reasoningContains !== undefined) {
      checks.push({
        predicate: `reasoning contains "${exp.reasoningContains}"`,
        passed: newRule.reasoning.includes(exp.reasoningContains),
      });
    }
    result.phaseB.rulePredicates = checks;
    result.phaseB.passed = checks.length > 0 && checks.every((c) => c.passed);
  }

  // ====== Phase C: matcher ======
  try {
    const activeRules = store.getActive();
    const matches = matchRules(
      {
        toolName: scenario.phaseC.toolCall.toolName,
        input: scenario.phaseC.toolCall.input,
      },
      activeRules,
    );
    result.phaseC.matcherCalled = true;

    if (matches.length === 0) {
      result.phaseC.actualBehavior = "no-match";
    } else {
      result.phaseC.actualBehavior = matches[0]!.enforcement;
    }
    result.phaseC.passed =
      result.phaseC.actualBehavior === scenario.phaseC.expectedBehavior;
  } catch (err) {
    errors.push(`Phase C matcher threw: ${String(err)}`);
  }

  // ====== Aggregate metrics ======
  result.prr = result.phaseC.passed ? 100 : 0;
  if (result.phaseB.rulePredicates.length > 0) {
    const passedCount = result.phaseB.rulePredicates.filter((c) => c.passed).length;
    result.kp = (passedCount / result.phaseB.rulePredicates.length) * 5;
  }
  result.passed =
    result.phaseA.passed && result.phaseB.passed && result.phaseC.passed;

  return result;
}

export async function runVerify(
  scenarios: Scenario[],
  deps: Parameters<typeof runScenario>[1],
): Promise<VerifyResult> {
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    results.push(await runScenario(s, deps));
  }
  const passed = results.filter((r) => r.passed).length;
  const avgPRR =
    results.length > 0
      ? results.reduce((s, r) => s + r.prr, 0) / results.length
      : 0;
  const avgKP =
    results.length > 0
      ? results.reduce((s, r) => s + r.kp, 0) / results.length
      : 0;
  return {
    total: results.length,
    passed,
    scenarios: results,
    averagePRR: avgPRR,
    averageKP: avgKP,
  };
}

/** 给 dry-run 报告把单个 KnowledgeEntry 装出来用——给定 partial + scenario id 自动补字段 */
export function entryFromPartial(
  partial: Partial<KnowledgeEntry>,
  id: string,
  now: () => Date,
): KnowledgeEntry {
  const confidence = partial.confidence ?? 0.7;
  const nature = (partial.nature ?? "subjective") as
    | "objective"
    | "subjective";
  const nowIso = now().toISOString();
  return {
    id,
    scope: { level: "team" },
    category: partial.category ?? "E",
    tags: partial.tags ?? [],
    type: partial.type ?? "avoidance",
    nature,
    trigger: partial.trigger ?? "",
    wrong_pattern: partial.wrong_pattern ?? "",
    correct_pattern: partial.correct_pattern ?? "",
    reasoning: partial.reasoning ?? "",
    confidence,
    enforcement: computeEnforcement(confidence, nature),
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: nowIso,
    last_hit_at: "",
    last_validated_at: nowIso,
    source: "accumulated",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
  };
}
