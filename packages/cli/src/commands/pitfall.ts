import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  DualLayerStore,
  InMemoryAttributionBus,
  StdoutRenderer,
  makeSkillCompiler,
  openDb,
  syncRuleVectors,
  syncToolVector,
  XenovaRuleEmbedder,
} from "@teamagent/adapters";
import { runCompile } from "@teamagent/core";
import {
  computeEnforcement,
  parseVisibilityMode,
  type KnowledgeEntry,
} from "@teamagent/types";
import { buildFallbackDescriptions } from "./migrate-v6.js";
import { scheduleDocsPropagation } from "./docs-propagate.js";

/** pitfall 的非 IO 参数——便于测试 */
export interface PitfallInput {
  trigger: string;
  wrong: string;
  correct: string;
  reason: string;
  /** C / E / S / K */
  category?: "C" | "E" | "S" | "K";
  /** 自由标签列表 */
  tags?: string[];
  /** personal / team / global，默认 personal (v2: team→personal) */
  level?: "personal" | "team" | "global";
  /** objective / subjective，默认 subjective（入门友好，不强制 block）*/
  nature?: "objective" | "subjective";
  /** 项目名，为 personal/team scope 附加限定 */
  project?: string;
}

export interface PitfallOptions {
  /** 项目知识 DB，默认 {cwd}/.teamagent/knowledge.db */
  projectDbPath?: string;
  /** global 知识 DB，默认 ~/.teamagent/global.db */
  userGlobalDbPath?: string;
  /** @deprecated 新规则路径不再写 CLAUDE.md；保留字段仅为兼容旧测试/调用方。 */
  claudeMdPath?: string;
  skillsDir?: string;
  cwd?: string;
  homeDir?: string;
  now?: () => string;
  env?: Record<string, string | undefined>;
  /** 向量 embedder，可注入 stub（生产时默认 XenovaRuleEmbedder） */
  embedder?: { embed(texts: string[]): Promise<number[][]> };
  /** 测试可注入；生产默认后台调度 docs-propagate。 */
  docsPropagationScheduler?: (ruleIds: string[]) => void | Promise<void>;
}

function resolvePaths(opts: PitfallOptions) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    projectDbPath:
      opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath:
      opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    claudeMdPath: opts.claudeMdPath ?? path.join(cwd, "CLAUDE.md"),
    skillsDir: opts.skillsDir ?? path.join(home, ".claude", "skills", "teamagent"),
  };
}

function generateId(level: string, ts: string): string {
  const prefix = level === "personal" || level === "team"
    ? "pers"
    : "glob";
  const short = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts.replace(/[-:T.Z]/g, "").slice(0, 14)}-${short}`;
}

function buildEntry(input: PitfallInput, now: string): KnowledgeEntry {
  // v2: team → personal
  const rawLevel = input.level ?? "personal";
  const level: "personal" | "global" = rawLevel === "global" ? "global" : "personal";
  const nature = input.nature ?? "subjective";
  const confidence = 0.7;
  const enforcement = computeEnforcement(confidence, nature);
  const category = input.category ?? "E";
  const tags = input.tags && input.tags.length > 0 ? input.tags : [category.toLowerCase()];

  return {
    id: generateId(rawLevel, now),
    scope: {
      level,
      ...(input.project ? { project: input.project } : {}),
    },
    category,
    tags,
    type: input.wrong.trim() === "" ? "practice" : "avoidance",
    nature,
    trigger: input.trigger,
    wrong_pattern: input.wrong,
    correct_pattern: input.correct,
    reasoning: input.reason,
    confidence,
    enforcement,
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: now,
    last_hit_at: "",
    last_validated_at: now,
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  };
}

/**
 * 核心非 IO 函数：给定 input + paths，写盘 + 导出 Skills + 返回归因文本。
 * 供交互模式和非交互模式共用。
 */
export async function executePitfall(
  input: PitfallInput,
  opts: PitfallOptions = {},
): Promise<string> {
  const paths = resolvePaths(opts);
  const now = (opts.now ?? (() => new Date().toISOString()))();
  const env = opts.env ?? process.env;
  const mode = parseVisibilityMode(env.TEAMAGENT_VISIBILITY);

  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });

  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath,
  });

  const before = store.getAll().length;

  const entry = buildEntry(input, now);
  store.add(entry);

  // 重新编译 skills —— 合并所有 scope 的活跃条目。CLAUDE.md 规则块输出已禁用。
  await runCompile({
    store,
    skillCompiler: makeSkillCompiler({ skillsDir: paths.skillsDir }),
  });

  const after = store.getAll().length;
  store.close();

  // 向量同步（best-effort，失败不阻塞主流程）
  try {
    const desc = buildFallbackDescriptions({
      trigger: entry.trigger,
      wrong_pattern: entry.wrong_pattern,
      correct_pattern: entry.correct_pattern,
      reasoning: entry.reasoning,
    });
    const embedder = opts.embedder ?? new XenovaRuleEmbedder();
    const [tv, pv] = await embedder.embed([desc.trigger_description, desc.pattern_description]);
    if (tv && pv) {
      const vdb = openDb(paths.projectDbPath);
      vdb.prepare(
        "UPDATE knowledge SET trigger_description=?, pattern_description=?, embedder_model_id=? WHERE id=?",
      ).run(desc.trigger_description, desc.pattern_description, "Xenova/multilingual-e5-small", entry.id);
      syncRuleVectors(vdb, entry.id, new Float32Array(tv), new Float32Array(pv));
      vdb.close();
    }
  } catch { /* 向量同步失败不阻断 pitfall */ }

  // 异步生成 tool_context_description（不阻塞，后台写入）。
  // 测试注入 embedder 时避免启动隐藏的真实 LLM/native embedder 后台工作。
  if (!opts.embedder && process.env.VITEST !== "true" && env.TEAMAGENT_DISABLE_TOOL_CONTEXT !== "1") {
    generateToolContextAsync(entry, paths.projectDbPath).catch(() => {/* best-effort */});
  }

  try {
    if (opts.docsPropagationScheduler) {
      await opts.docsPropagationScheduler([entry.id]);
    } else {
      scheduleDocsPropagation([entry.id], { cwd: opts.cwd, env });
    }
  } catch {
    // docs propagation is best-effort; DB/vector/Skill writes remain the source of truth.
  }

  const skillMdPath = path.join(paths.skillsDir, entry.id, "SKILL.md");

  const bus = new InMemoryAttributionBus();
  bus.emit({
    source: "pitfall",
    action: `添加知识条目 ${entry.id} (${entry.category}/${entry.tags[0]})`,
    severity: "highlight",
    timestamp: now,
    target: { file: skillMdPath },
    before: { knowledgeCount: before },
    after: {
      knowledgeCount: after,
      categoryTag: `${entry.scope.level}/${entry.category}/${entry.tags[0]}`,
    },
    userFacingValue:
      entry.type === "avoidance"
        ? `AI 遇到 "${entry.wrong_pattern}" 时会改用 "${entry.correct_pattern}"；docs propagation 已调度`
        : `AI 下次在 "${entry.trigger}" 场景会参考: ${entry.correct_pattern}；docs propagation 已调度`,
    counterfactual: "你会看到 AI 第二次再踩同一个坑",
  });

  const renderer = new StdoutRenderer();
  return renderer.render(bus.drain(), mode);
}

/**
 * 交互模式入口——用 readline 从 stdin 收集输入，调用 executePitfall。
 */
export async function runPitfallInteractive(
  opts: PitfallOptions = {},
): Promise<string> {
  const readline = await import("node:readline/promises");
  const { stdin, stdout } = await import("node:process");
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const ask = async (q: string, fallback = ""): Promise<string> => {
    const answer = await rl.question(q);
    return answer.trim() || fallback;
  };

  try {
    stdout.write("\n记录一条踩坑经验——问答完成后会写入知识库 + 导出 Skill + 调度 docs propagation\n\n");
    const trigger = await ask("触发场景（什么情况下会踩到这个坑？）: ");
    const wrong = await ask("错误做法（留空表示 practice 型）: ");
    const correct = await ask("正确做法: ");
    const reason = await ask("原因: ");
    const categoryRaw = await ask(
      "分类 [C=代码 E=工程 S=策略 K=认知，默认 E]: ",
      "E",
    );
    const tagsRaw = await ask("标签（逗号分隔，可空）: ");
    const levelRaw = await ask(
      "作用域 [personal/team/global，默认 personal]: ",
      "personal",
    );
    const natureRaw = await ask(
      "性质 [objective/subjective，默认 subjective]: ",
      "subjective",
    );

    const category = normalizeCategory(categoryRaw);
    const level = normalizeLevel(levelRaw);
    const nature = normalizeNature(natureRaw);
    const tags = tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return await executePitfall(
      { trigger, wrong, correct, reason, category, tags, level, nature },
      opts,
    );
  } finally {
    rl.close();
  }
}

function normalizeCategory(raw: string): "C" | "E" | "S" | "K" {
  const upper = raw.toUpperCase();
  if (upper === "C" || upper === "E" || upper === "S" || upper === "K") return upper;
  return "E";
}

function normalizeLevel(raw: string): "personal" | "team" | "global" {
  if (raw === "team" || raw === "global") return raw;
  return "personal";
}

function normalizeNature(raw: string): "objective" | "subjective" {
  if (raw === "objective") return "objective";
  return "subjective";
}

/** 生成工具操作视角描述的 LLM prompt */
function buildToolContextPrompt(entry: KnowledgeEntry): string {
  return [
    "你是代码质量规则分析助手。给定一条编程规则，描述当 AI 使用工具时，什么样的具体工具操作（Bash命令、文件编辑等）会触发这条规则。",
    "",
    "规则信息：",
    `- 触发场景: ${entry.trigger}`,
    `- 错误做法: ${entry.wrong_pattern || "(无)"}`,
    `- 正确做法: ${entry.correct_pattern}`,
    `- 原因: ${entry.reasoning}`,
    "",
    "用1-2句话描述：AI 会执行什么样的具体工具操作（如 Bash 命令、写入什么文件、编辑什么代码）才会触发这条规则？",
    "只描述工具操作，不要说场景或原因。直接输出描述，不加引号。",
  ].join("\n");
}

/**
 * 异步生成 tool_context_description 并同步向量。fire-and-forget。
 */
async function generateToolContextAsync(
  entry: KnowledgeEntry,
  projectDbPath: string,
): Promise<void> {
  const { ClaudeCodeLLMClient, XenovaRuleEmbedder: EmbedderClass, openDb: openDatabase } = await import("@teamagent/adapters");
  const llm = new ClaudeCodeLLMClient({ model: "haiku" });
  const desc = await llm.complete(buildToolContextPrompt(entry));
  if (!desc || desc.trim().length < 5) return;

  const embedder = new EmbedderClass();
  const [vec] = await embedder.embed([desc.trim()]);
  if (!vec) return;

  const vdb = openDatabase(projectDbPath);
  try {
    vdb.prepare(
      "UPDATE knowledge SET tool_context_description = ? WHERE id = ?",
    ).run(desc.trim(), entry.id);
    syncToolVector(vdb, entry.id, new Float32Array(vec));
  } finally {
    vdb.close();
  }
}

/**
 * B-067: per-field length cap for pitfall non-interactive input. 1000 chars
 * is generous for any natural-language pitfall description; values beyond
 * this strongly suggest abuse or accidental paste of large content. The cap
 * prevents one entry from dominating downstream generated docs/skill output.
 */
const PITFALL_FIELD_MAX = 1000;

/** 必填字段缺失或全空时抛出，由 bin.ts 捕获并以非零退出码报错。 */
export class PitfallValidationError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `pitfall --non-interactive 缺少必填字段: ${missing.join(", ")}\n` +
        `用法: teamagent pitfall --non-interactive --trigger=... --correct=... --reason=... [--wrong=...]`,
    );
    this.name = "PitfallValidationError";
  }
}

/**
 * 解析 CLI 参数，支持 --non-interactive + flag 方式非交互调用。
 * 必填字段缺失会抛 PitfallValidationError——非交互模式下漏字段会直接污染知识库，
 * 必须早失败而不是接受空字符串。
 */
export function parsePitfallArgs(argv: string[]): PitfallInput | null {
  if (!argv.includes("--non-interactive")) return null;

  const getFlag = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const found = argv.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };

  const trigger = (getFlag("trigger") ?? "").trim();
  const wrong = (getFlag("wrong") ?? "").trim();
  const correct = (getFlag("correct") ?? "").trim();
  const reason = (getFlag("reason") ?? "").trim();
  const categoryRaw = getFlag("category");
  let category: "C" | "E" | "S" | "K" | undefined;
  if (categoryRaw !== undefined) {
    const upper = categoryRaw.toUpperCase();
    if (upper !== "C" && upper !== "E" && upper !== "S" && upper !== "K") {
      throw new PitfallValidationError([`--category 必须是 C/E/S/K 之一，收到: "${categoryRaw}"`]);
    }
    category = upper as "C" | "E" | "S" | "K";
  }
  const tagsRaw = getFlag("tags");
  const level = getFlag("level") as "personal" | "team" | "global" | undefined;
  const nature = getFlag("nature") as "objective" | "subjective" | undefined;
  const project = getFlag("project");

  // trigger / correct / reason 必填；wrong 可选（避免-> 空 = practice 类规则）
  const missing: string[] = [];
  if (!trigger) missing.push("--trigger");
  if (!correct) missing.push("--correct");
  if (!reason) missing.push("--reason");
  if (missing.length > 0) throw new PitfallValidationError(missing);

  // B-067: enforce per-field length cap. Without this, 10000-char trigger
  // gets stored, vectorized, and exported into generated docs/skills output.
  const overLong: string[] = [];
  if (trigger.length > PITFALL_FIELD_MAX) overLong.push(`--trigger 长度 ${trigger.length}`);
  if (wrong.length > PITFALL_FIELD_MAX) overLong.push(`--wrong 长度 ${wrong.length}`);
  if (correct.length > PITFALL_FIELD_MAX) overLong.push(`--correct 长度 ${correct.length}`);
  if (reason.length > PITFALL_FIELD_MAX) overLong.push(`--reason 长度 ${reason.length}`);
  if (overLong.length > 0) {
    throw new PitfallValidationError([
      `字段超长（每字段最大 ${PITFALL_FIELD_MAX} 字符）: ${overLong.join(", ")}`,
    ]);
  }

  const tags = tagsRaw
    ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    trigger,
    wrong,
    correct,
    reason,
    ...(category ? { category } : {}),
    ...(tags ? { tags } : {}),
    ...(level ? { level } : {}),
    ...(nature ? { nature } : {}),
    ...(project ? { project } : {}),
  };
}
