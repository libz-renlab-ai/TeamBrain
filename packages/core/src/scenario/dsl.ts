import type { CorrectionSignal } from "../correction-detector/rule-based.js";
import type { KnowledgeEntry, ParsedSession } from "@teamagent/types";

/**
 * 场景 DSL：表达"踩坑 → 学习 → 避坑"三段闭环测试。
 *
 * 设计目标：每个场景**确定性可重跑**——LLM 响应通过 mock 注入，
 * 不依赖真实 claude CLI。这样 CI 也能跑全套场景。
 *
 * Phase A 输入合成会话 → 跑 detector → 断言 detector 识别正确
 * Phase B 用 mockExtractorOutput → 跑 pipeline → 断言新规则被生成
 * Phase C 模拟一个相似工具调用 → 跑 matcher → 断言 hook 行为
 *
 * 指标：
 * - PRR (Pitfall Reduction Rate)：Phase C 命中率（如果 Hook 应拦但没拦 = 0）
 * - KP (Knowledge Precision)：Phase B 的规则是否符合 expectedRule 谓词
 */
export interface Scenario {
  id: string;
  description: string;
  phaseA: PhaseASpec;
  phaseB: PhaseBSpec;
  phaseC: PhaseCSpec;
  /** 可选：场景元数据（用于报告） */
  meta?: {
    category?: "code" | "engineering" | "strategy" | "cognition";
    expectedPRR?: number;
    expectedKP?: number;
  };
}

export interface PhaseASpec {
  /** 合成的会话日志（detector 的输入） */
  session: ParsedSession;
  /** 预期 detector 至少识别到这些信号 */
  expectedCorrections: Array<{
    signal: CorrectionSignal;
    minWeight?: number;
    /** 期望命中的 turn 序号（可选，松一些不写） */
    turnIndex?: number;
  }>;
}

export interface PhaseBSpec {
  /**
   * Mock LLM 响应：当 extractor 调 LLM 时返回这个字符串（应是合法 JSON
   * 或 ```json fenced block）。让 Phase B 完全确定。
   */
  mockLLMResponse: string;
  /** 预期生成的规则要满足以下谓词 */
  expectedRule: {
    categoryEquals?: KnowledgeEntry["category"];
    typeEquals?: KnowledgeEntry["type"];
    natureEquals?: KnowledgeEntry["nature"];
    triggerContains?: string;
    wrongPatternContains?: string;
    correctPatternContains?: string;
    reasoningContains?: string;
  };
}

export interface PhaseCSpec {
  /** 模拟一个新的工具调用——预期被新生成的规则命中 */
  toolCall: {
    toolName: string;
    input: Record<string, unknown>;
  };
  /** 预期 hook 行为 */
  expectedBehavior: "block" | "warn" | "suggest" | "passive" | "no-match";
}

/** 单个场景的执行结果。 */
export interface ScenarioResult {
  scenarioId: string;
  passed: boolean;
  phaseA: {
    detectorCalled: boolean;
    correctionsFound: number;
    expectedMatches: Array<{ signal: CorrectionSignal; matched: boolean }>;
    passed: boolean;
  };
  phaseB: {
    extractorCalled: boolean;
    ruleGenerated: boolean;
    rulePredicates: Array<{ predicate: string; passed: boolean }>;
    passed: boolean;
  };
  phaseC: {
    matcherCalled: boolean;
    actualBehavior: "block" | "warn" | "suggest" | "passive" | "no-match";
    expectedBehavior: PhaseCSpec["expectedBehavior"];
    passed: boolean;
  };
  /** Pitfall Reduction Rate: Phase C 通过率 (0 or 100) */
  prr: number;
  /** Knowledge Precision: Phase B 满足谓词数 / 总谓词数 × 5 */
  kp: number;
  errors: string[];
}

/** 一组场景的聚合结果。 */
export interface VerifyResult {
  total: number;
  passed: number;
  scenarios: ScenarioResult[];
  averagePRR: number;
  averageKP: number;
}
