import path from "node:path";
import fs from "node:fs";
import {
  ruleBasedCorrectionDetector,
  llmBasedKnowledgeExtractor,
  runVerify,
  type Scenario,
  type ScenarioResult,
  type VerifyResult,
} from "@teamagent/core";
import { InMemoryKnowledgeStore } from "@teamagent/adapters";
import { allScenarios } from "../../../../fixtures/scenarios/index.js";

export interface VerifyOptions {
  /** 选择跑哪些场景；默认全部 5 个 */
  scenarios?: Scenario[];
  /** 把 Markdown 报告写到哪里；不设则只 stdout */
  reportPath?: string;
  cwd?: string;
  now?: () => Date;
}

export async function executeVerify(
  opts: VerifyOptions = {},
): Promise<{ result: VerifyResult; reportPath?: string }> {
  const scenarios = opts.scenarios ?? allScenarios;
  const now = opts.now ?? (() => new Date());

  const result = await runVerify(scenarios, {
    detector: ruleBasedCorrectionDetector,
    extractor: llmBasedKnowledgeExtractor,
    makeStore: () => new InMemoryKnowledgeStore(),
    now,
  });

  let reportPath: string | undefined;
  if (opts.reportPath) {
    const md = renderVerifyMarkdown(result, now());
    fs.mkdirSync(path.dirname(opts.reportPath), { recursive: true });
    fs.writeFileSync(opts.reportPath, md, "utf-8");
    reportPath = opts.reportPath;
  }

  return { result, reportPath };
}

/** 终端友好的简短渲染（每个场景 1-3 行）。 */
export function renderVerifyTerminal(r: VerifyResult): string {
  const lines: string[] = [];
  lines.push("🔬 TeamAgent Verify");
  lines.push("");
  for (const s of r.scenarios) {
    const sym = s.passed ? "✓" : "✗";
    lines.push(
      `  ${sym} ${s.scenarioId.padEnd(20)} PRR=${s.prr.toString().padStart(3)}  KP=${s.kp.toFixed(1)}`,
    );
    if (!s.passed) {
      const failed: string[] = [];
      if (!s.phaseA.passed) failed.push("A");
      if (!s.phaseB.passed) failed.push("B");
      if (!s.phaseC.passed) failed.push("C");
      lines.push(
        `      Phase 失败: ${failed.join(", ")}  expectedBehavior=${s.phaseC.expectedBehavior} actual=${s.phaseC.actualBehavior}`,
      );
      for (const e of s.errors.slice(0, 3)) lines.push(`      ⚠ ${e.slice(0, 100)}`);
    }
  }
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`  通过: ${r.passed}/${r.total}`);
  lines.push(`  平均 PRR: ${r.averagePRR.toFixed(1)}`);
  lines.push(`  平均 KP:  ${r.averageKP.toFixed(2)}/5`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  return lines.join("\n") + "\n";
}

/** 完整 Markdown 报告（写文件用）。 */
export function renderVerifyMarkdown(r: VerifyResult, now: Date): string {
  const lines: string[] = [];
  lines.push("# TeamAgent Verify 报告");
  lines.push("");
  lines.push(`> 生成时间: ${now.toISOString()}`);
  lines.push(`> 场景数: ${r.total}`);
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push("| 指标 | 值 |");
  lines.push("|------|----|");
  lines.push(`| 通过率 | ${r.passed}/${r.total} (${((r.passed / r.total) * 100).toFixed(0)}%) |`);
  lines.push(`| 平均 PRR (Pitfall Reduction Rate) | ${r.averagePRR.toFixed(1)} |`);
  lines.push(`| 平均 KP (Knowledge Precision, 1-5) | ${r.averageKP.toFixed(2)} |`);
  lines.push("");

  lines.push("## 每个场景明细");
  lines.push("");
  for (const s of r.scenarios) {
    lines.push(`### ${s.scenarioId} ${s.passed ? "✓" : "✗"}`);
    lines.push("");
    lines.push(`- PRR: ${s.prr}`);
    lines.push(`- KP: ${s.kp.toFixed(2)}`);
    lines.push("");
    lines.push("**Phase A (踩坑)**:");
    lines.push("");
    lines.push(`- detector 调用: ${s.phaseA.detectorCalled ? "✓" : "✗"}`);
    lines.push(`- 识别到纠正: ${s.phaseA.correctionsFound} 条`);
    for (const m of s.phaseA.expectedMatches) {
      lines.push(`  - ${m.signal}: ${m.matched ? "✓" : "✗"}`);
    }
    lines.push("");
    lines.push("**Phase B (学习)**:");
    lines.push("");
    lines.push(`- 规则生成: ${s.phaseB.ruleGenerated ? "✓" : "✗"}`);
    if (s.phaseB.rulePredicates.length > 0) {
      for (const p of s.phaseB.rulePredicates) {
        lines.push(`  - ${p.predicate}: ${p.passed ? "✓" : "✗"}`);
      }
    }
    lines.push("");
    lines.push("**Phase C (避坑)**:");
    lines.push("");
    lines.push(`- 期望行为: ${s.phaseC.expectedBehavior}`);
    lines.push(`- 实际行为: ${s.phaseC.actualBehavior}`);
    lines.push(`- 通过: ${s.phaseC.passed ? "✓" : "✗"}`);
    lines.push("");
    if (s.errors.length > 0) {
      lines.push("**错误**:");
      lines.push("");
      for (const e of s.errors) lines.push(`- ${e}`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push("## 关于这份报告");
  lines.push("");
  lines.push(
    "5 个场景测试系统能否完成完整闭环（**踩坑识别 → 知识提取 → 后续拦截**）。",
  );
  lines.push(
    "Phase B 用 mock LLM 注入确定响应——实际部署时是真 `claude -p`，输出会有抖动但 shape 一致。",
  );
  lines.push("");
  lines.push(
    "PRR=100% 表示规则成功在 Phase C 拦住了相似错误；KP=5/5 表示提取的规则字段全部符合预期。",
  );
  return lines.join("\n") + "\n";
}

/** B-127/B-149: known flags for `verify`. */
const VERIFY_KNOWN_FLAGS = new Set<string>(["--report"]);

export class VerifyArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerifyArgError";
  }
}

export function parseVerifyArgs(argv: string[]): VerifyOptions {
  const opts: VerifyOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--report" && argv[i + 1]) {
      opts.reportPath = argv[i + 1];
      i++;
    } else if (a.startsWith("--report=")) {
      opts.reportPath = a.slice("--report=".length);
    } else if (a.startsWith("--")) {
      const base = a.split("=")[0]!;
      if (!VERIFY_KNOWN_FLAGS.has(base)) {
        throw new VerifyArgError(
          `verify: unknown flag "${a}". Run 'teamagent --help' for valid flags.`,
        );
      }
    }
  }
  return opts;
}
