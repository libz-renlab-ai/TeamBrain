import {
  InMemoryKnowledgeStore,
  InMemoryAttributionBus,
  StdoutRenderer,
} from "@teamagent/adapters";
import { compileMarkdownBlock, defaultValidator, runCompile, formatAsAgentSkill } from "@teamagent/core";
import { parseVisibilityMode, type KnowledgeEntry } from "@teamagent/types";
import type { SkillCompiler, SkillArtifact } from "@teamagent/ports";

/**
 * M0 Walking Skeleton 演示命令。
 *
 * 跑一次"录入 → 编译 → 渲染归因"的完整内存回路，证明所有 Port
 * 的 Fake 实现能组合工作。所有输出都经过 AttributionBus + Renderer，
 * 无任何直接 console.log——这是原则 6 的强制落地。
 *
 * Visibility mode 由环境变量 TEAMAGENT_VISIBILITY 控制。
 */
export async function runSkeletonDemo(
  opts: {
    env?: Record<string, string | undefined>;
    now?: string;
  } = {},
): Promise<string> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date().toISOString();
  const mode = parseVisibilityMode(env.TEAMAGENT_VISIBILITY);

  const store = new InMemoryKnowledgeStore();
  const bus = new InMemoryAttributionBus();

  // 模拟一条预置元原则
  const entry: KnowledgeEntry = {
    id: "skeleton-demo-001",
    scope: { level: "personal" },
    category: "K",
    tags: ["metacognition", "skeleton"],
    type: "practice",
    nature: "subjective",
    trigger: "遇到预期外的状态",
    wrong_pattern: "",
    correct_pattern: "先停下查清楚根因，再动手",
    reasoning: "绕过式修复经常掩盖真问题",
    confidence: 0.8,
    enforcement: "suggest",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: now,
    last_hit_at: "",
    last_validated_at: now,
    source: "preset",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  };
  store.add(entry);

  const block = compileMarkdownBlock(store.getAll(), now);
  const lineCount = block.split("\n").length;

  bus.emit({
    source: "skeleton",
    action: "[skeleton] 添加模拟知识 + legacy markdown 预览",
    severity: "highlight",
    timestamp: now,
    target: { id: entry.id, count: store.count() },
    before: { knowledgeCount: 0 },
    after: { knowledgeCount: store.count(), blockLines: lineCount },
    userFacingValue: `模拟知识条目可生成 ${lineCount} 行 legacy/internal markdown 预览；普通命令不再写入 CLAUDE.md 规则块`,
    counterfactual: "没有 Walking Skeleton 的骨架贯通，后续 Milestone 没有落脚点",
  });

  // M2.3: 演示 L0 validator 拒掉一个明显不合格的候选条目
  const badEntry: Partial<KnowledgeEntry> = {
    id: "skeleton-demo-bad",
    scope: { level: "team", paths: [] }, // 空 paths 会触发 scope_paths_empty
    type: "avoidance",
    trigger: "bad-rule",
    wrong_pattern: "nonexistent-pattern",
    correct_pattern: "c",
  };
  const l0 = defaultValidator.validateLevel0({
    entry: badEntry,
    sourceText: "nothing matches here",
    existingRules: [],
    projectStack: ["ts"],
  });
  bus.emit({
    source: "validator",
    action: "[skeleton] L0 拒绝演示",
    severity: l0.ok ? "info" : "warning",
    timestamp: now,
    target: { id: "skeleton-demo-bad" },
    userFacingValue: l0.ok
      ? "（出乎意料：L0 门口没拦住这条坏条目）"
      : `L0 如预期拦下：${l0.failed_checks.join(", ")}`,
    counterfactual: "没有 L0 门闸，坏条目会污染知识库",
  });

  // M2.4: 演示 Skills 编译（dry-run，无实际 IO）；MarkdownCompiler 仅作为 legacy/internal 路径保留。
  // 添加 canonical+ 和 stable 条目模拟已晋升规则
  const canonicalEntry: KnowledgeEntry = {
    ...entry,
    id: "skeleton-demo-canonical",
    trigger: "use-fetch-not-axios",
    correct_pattern: "fetch",
    wrong_pattern: "axios",
    reasoning: "项目统一原生 fetch，减少依赖",
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
  };
  const stableEntry: KnowledgeEntry = {
    ...entry,
    id: "skeleton-demo-stable",
    trigger: "batch-insert-over-loop",
    correct_pattern: "batch insert",
    wrong_pattern: "for.*insert",
    reasoning: "批量插入避免逐条往返开销",
    current_tier: "stable" as const,
    max_tier_ever: "stable" as const,
  };
  store.add(canonicalEntry);
  store.add(stableEntry);

  // 内存版 SkillCompiler（dry-run 不写文件）
  const STABLE_PLUS = new Set(["stable", "canonical", "enforced"]);
  const skillCompilerStub: SkillCompiler = {
    compile(entries: KnowledgeEntry[]): SkillArtifact[] {
      return entries
        .filter((e) => e.status === "active" && STABLE_PLUS.has(e.current_tier))
        .map((e) => ({ ruleId: e.id, dirname: e.id, skillMd: formatAsAgentSkill(e) }));
    },
    async write(artifacts: SkillArtifact[]) {
      return { written: artifacts.map((a) => a.ruleId), skipped: [] };
    },
    async cleanup(ids: string[]) {
      return { removed: ids };
    },
  };

  const compileResult = await runCompile({
    store,
    skillCompiler: skillCompilerStub,
    bus,
    dryRun: true,
  });

  bus.emit({
    source: "compile",
    action: "[skeleton] Skills 编译演示",
    severity: "highlight",
    timestamp: now,
    userFacingValue: [
      "CLAUDE.md 出口：legacy/internal 已禁用（普通命令不写 root rule dump）",
      `Skills 出口：stable+ 规则 ${compileResult.skills.written.length} 条 → ~/.claude/skills/teamagent/ 目录（dry-run，未实际写入）`,
      `  导出 skill: [${compileResult.skills.written.join(", ")}]`,
    ].join("\n  "),
    counterfactual: "没有 Skills 编译，规则无法作为 Claude Code skill 被所有项目复用",
  });

  const renderer = new StdoutRenderer();
  return renderer.render(bus.drain(), mode);
}
