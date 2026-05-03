import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import {
  ClaudeCodeLLMClient,
  DualLayerStore,
  makeSkillCompiler,
} from "@teamagent/adapters";
import { parseInsightsReport } from "@teamagent/adapters/ingest/insights";
import {
  parseNpmAudit,
  getNpmAuditOutput,
} from "@teamagent/adapters/ingest/npm-audit";
import {
  parseGhPrReviews,
  getGhPrReviews,
  isGhAvailable,
} from "@teamagent/adapters/ingest/pr-review";
import {
  parseGitHotspots,
  hotspotsToCandidateItems,
  getGitNumstat,
} from "@teamagent/adapters/ingest/git-hotspot";
import {
  parseGhRunList,
  runsToCandidateItems,
  getGhRunList,
  filterBySince,
} from "@teamagent/adapters/ingest/ci-failure";
import {
  formatCandidateMd,
  parseCandidateMd,
  candidatesToExtractionInputs,
  type CandidateSource,
} from "@teamagent/adapters/ingest/candidate-md";
import {
  llmBasedKnowledgeExtractor,
  runIngestPipeline,
  runCompile,
  validateLevel0,
  detectStack,
  type IngestPipelineResult,
} from "@teamagent/core";
import type { LLMClient, ExtractionInput, Validator } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";
import { scheduleDocsPropagation } from "./docs-propagate.js";

export type IngestSource =
  | "insights"
  | "npm-audit"
  | "pr-review"
  | "git-hotspot"
  | "ci-failure"
  | "candidates";

export interface IngestOptions {
  source: IngestSource;
  /** --from-insights <path> / --from-candidates <path> */
  filePath?: string;
  /** --from-pr <number> */
  prNumber?: number;
  /** --since=30d 用于 git/ci */
  sinceDays?: number;
  /** git hotspot 阈值，默认 3 */
  threshold?: number;
  /** 半自动 dry-run：写 candidate md 文件，不真的 ingest */
  dryRun?: boolean;
  /** cwd / home 覆盖（测试用） */
  cwd?: string;
  homeDir?: string;
  projectDbPath?: string;
  userGlobalDbPath?: string;
  skillsDir?: string;
  /** @deprecated 新规则路径不再写 CLAUDE.md；保留字段仅为兼容旧调用方。 */
  claudeMdPath?: string;
  /** 注入 LLM（测试用） */
  llmClient?: LLMClient;
  /** 注入 runner（测试用，拦截 gh / npm / git 调用） */
  cmdRunner?: (cmd: string, opts: { cwd?: string }) => Promise<string>;
  now?: () => Date;
  idGen?: () => string;
  docsPropagationScheduler?: (ruleIds: string[]) => void | Promise<void>;
}

function resolvePaths(opts: IngestOptions) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    cwd,
    home,
    projectDbPath:
      opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath:
      opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    skillsDir: opts.skillsDir ?? path.join(home, ".claude", "skills", "teamagent"),
    candidatesDir: path.join(cwd, ".teamagent", "candidates"),
  };
}

/**
 * 从 cwd 推断项目 stack 的语言列表（给 L0 file_types 一致性检查用）。
 * 退化：读不到 cwd 或 detectStack 抛错返回 []。
 */
export function detectProjectStack(cwd: string): string[] {
  try {
    const presence = {
      exists: (rel: string) => fs.existsSync(path.join(cwd, rel)),
      read: (rel: string) => {
        const full = path.join(cwd, rel);
        return fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : undefined;
      },
    };
    const fp = detectStack(presence);
    // 把 "typescript" / "python" 等 language name 简化成 file-type 简写
    const langToFt: Record<string, string> = {
      typescript: "ts",
      javascript: "js",
      python: "py",
      go: "go",
      rust: "rs",
      java: "java",
    };
    return fp.languages.map((l) => langToFt[l] ?? l);
  } catch {
    return [];
  }
}

/** 默认 runner：同步 execSync。注入友好。 */
async function defaultRunner(
  cmd: string,
  opts: { cwd?: string } = {},
): Promise<string> {
  return execSync(cmd, {
    cwd: opts.cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
}

async function loadInputs(opts: IngestOptions): Promise<ExtractionInput[]> {
  switch (opts.source) {
    case "insights": {
      if (!opts.filePath) {
        throw new Error("--from-insights 需要 <path>");
      }
      const raw = fs.readFileSync(opts.filePath, "utf-8");
      return parseInsightsReport(raw);
    }
    case "npm-audit": {
      const runner = opts.cmdRunner ?? defaultRunner;
      const raw = await getNpmAuditOutput(runner, opts.cwd);
      return parseNpmAudit(raw);
    }
    case "git-hotspot": {
      // 半自动源永远产出 candidate md（即使没传 --dry-run）——这一步不摄入规则。
      // 用户勾选后再 teamagent ingest --from-candidates <path>。
      throw new Error(
        "git-hotspot 源只产出候选文件，不直接 ingest。见 executeIngest 的 handleSemiAuto。",
      );
    }
    case "ci-failure": {
      throw new Error(
        "ci-failure 源只产出候选文件，不直接 ingest。见 executeIngest 的 handleSemiAuto。",
      );
    }
    case "candidates": {
      if (!opts.filePath) {
        throw new Error("--from-candidates 需要 <path>");
      }
      const raw = fs.readFileSync(opts.filePath, "utf-8");
      const parsed = parseCandidateMd(raw);
      return candidatesToExtractionInputs(parsed);
    }
    case "pr-review": {
      if (opts.prNumber === undefined || Number.isNaN(opts.prNumber)) {
        throw new Error("--from-pr 需要 <number>");
      }
      const runner = opts.cmdRunner ?? defaultRunner;
      const simpleRunner = (cmd: string) => runner(cmd, {});
      if (!(await isGhAvailable(simpleRunner))) {
        throw new Error(
          "gh CLI 未安装。参考 https://cli.github.com 安装后重试。",
        );
      }
      const raw = await getGhPrReviews(opts.prNumber, simpleRunner);
      return parseGhPrReviews(raw);
    }
    default:
      throw new Error(`源 '${opts.source}' 尚未实现（M2.3 后续 task）`);
  }
}

export async function executeIngest(opts: IngestOptions): Promise<string> {
  const paths = resolvePaths(opts);
  const dryRun = opts.dryRun ?? false;
  const now = opts.now ?? (() => new Date());
  const idGen =
    opts.idGen ??
    (() => {
      const ts = now().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
      const rand = Math.random().toString(36).slice(2, 8);
      return `ing-${ts}-${rand}`;
    });

  // 半自动源：git-hotspot / ci-failure → 只写候选 md，不走 ingest-pipeline。
  if (opts.source === "git-hotspot" || opts.source === "ci-failure") {
    return handleSemiAuto(opts, paths, now);
  }

  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });

  let inputs: ExtractionInput[];
  try {
    inputs = await loadInputs(opts);
  } catch (err) {
    return `✗ 加载 ingest 源失败: ${String(err).slice(0, 200)}\n`;
  }

  if (inputs.length === 0) {
    return `✓ ingest 源 '${opts.source}' 扫描完成：0 条候选\n`;
  }

  const llm = opts.llmClient ?? new ClaudeCodeLLMClient();
  const dualStore = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath,
  });
  const projectStore = dualStore.getProjectStore();
  const projectStack = detectProjectStack(paths.cwd);

  const validator: Pick<Validator, "validateLevel0"> = { validateLevel0 };

  const result: IngestPipelineResult = await runIngestPipeline({
    inputs,
    extractor: llmBasedKnowledgeExtractor,
    callLLM: (prompt) => llm.complete(prompt),
    validator: validator as Validator,
    store: projectStore as unknown as import("@teamagent/ports").KnowledgeStore,
    scope: { level: "personal" },
    source: "ingested",
    projectStack,
    now,
    idGen,
    dryRun,
  });

  if (!dryRun && result.accepted.length > 0) {
    try {
      await runCompile({
        store: dualStore,
        skillCompiler: makeSkillCompiler({ skillsDir: paths.skillsDir }),
      });
      const ids = result.accepted.map((e) => e.id);
      if (opts.docsPropagationScheduler) {
        await opts.docsPropagationScheduler(ids);
      } else {
        scheduleDocsPropagation(ids, { cwd: paths.cwd });
      }
    } catch {
      // Skill/docs propagation 失败不算 fatal
    }
  }

  dualStore.close();
  return formatReport(opts.source, result, dryRun);
}

export function formatReport(
  source: IngestSource,
  result: IngestPipelineResult,
  dryRun: boolean,
): string {
  const lines: string[] = [];
  lines.push(
    dryRun
      ? `🔍 TeamAgent Ingest (${source}, dry-run)`
      : `📥 TeamAgent Ingest (${source})`,
  );
  lines.push("");
  lines.push(`  扫描: ${result.scanned}`);
  lines.push(`  入库: ${result.accepted.length}`);
  lines.push(`  L0 拒绝: ${result.rejected.length}`);
  lines.push(`  LLM 跳过: ${result.skipped}`);
  lines.push(`  失败: ${result.failed}`);
  if (result.accepted.length > 0) {
    lines.push("");
    lines.push("  新增条目:");
    for (const e of result.accepted.slice(0, 5)) {
      lines.push(
        `    - [${e.category}/${e.tags[0] ?? "untagged"}] ${e.trigger} → ${e.correct_pattern}`,
      );
    }
    if (result.accepted.length > 5) {
      lines.push(`    ... (${result.accepted.length - 5} more)`);
    }
  }
  if (result.rejected.length > 0) {
    lines.push("");
    lines.push("  L0 拒绝摘要:");
    const reasonCounts: Record<string, number> = {};
    for (const r of result.rejected) {
      for (const reason of r.reasons) {
        reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
      }
    }
    for (const [reason, n] of Object.entries(reasonCounts)) {
      lines.push(`    - ${reason}: ${n}`);
    }
  }
  return lines.join("\n") + "\n";
}

export function parseIngestArgs(argv: string[]): IngestOptions {
  const opts: Partial<IngestOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--from-insights" && argv[i + 1]) {
      opts.source = "insights";
      opts.filePath = argv[++i];
    } else if (a === "--from-audit") {
      opts.source = "npm-audit";
    } else if (a === "--from-pr" && argv[i + 1]) {
      opts.source = "pr-review";
      opts.prNumber = parseInt(argv[++i]!, 10);
    } else if (a === "--from-git") {
      opts.source = "git-hotspot";
    } else if (a === "--from-ci") {
      opts.source = "ci-failure";
    } else if (a === "--from-candidates" && argv[i + 1]) {
      opts.source = "candidates";
      opts.filePath = argv[++i];
    } else if (a.startsWith("--since=")) {
      const raw = a.slice("--since=".length);
      const m = raw.match(/^(\d+)d?$/);
      if (m) {
        opts.sinceDays = parseInt(m[1]!, 10);
      } else if (raw) {
        throw new Error(`--since 格式无效: "${raw}"。接受格式: "30d" 或 "45"（天数）`);
      }
    } else if (a.startsWith("--threshold=")) {
      opts.threshold = parseInt(a.slice("--threshold=".length), 10);
    }
  }
  if (!opts.source) {
    throw new Error(
      "ingest 需要源标记：--from-insights / --from-audit / --from-pr / --from-git / --from-ci / --from-candidates",
    );
  }
  return opts as IngestOptions;
}

async function handleSemiAuto(
  opts: IngestOptions,
  paths: ReturnType<typeof resolvePaths>,
  now: () => Date,
): Promise<string> {
  fs.mkdirSync(paths.candidatesDir, { recursive: true });
  const runner = opts.cmdRunner ?? defaultRunner;
  const dateSlug = now().toISOString().slice(0, 10);

  if (opts.source === "git-hotspot") {
    const raw = await getGitNumstat(runner, {
      cwd: paths.cwd,
      sinceDays: opts.sinceDays,
    });
    const hotspots = parseGitHotspots(raw, { threshold: opts.threshold });
    const items = hotspotsToCandidateItems(hotspots);
    const md = formatCandidateMd("git-hotspot", items, {
      generatedAt: now().toISOString(),
    });
    const outPath = path.join(
      paths.candidatesDir,
      `git-hotspot-${dateSlug}.md`,
    );
    fs.writeFileSync(outPath, md, "utf-8");
    return formatSemiAutoReport("git-hotspot", items.length, outPath);
  }

  if (opts.source === "ci-failure") {
    const simpleRunner = (cmd: string) => runner(cmd, {});
    if (!(await isGhAvailable(simpleRunner))) {
      throw new Error(
        "gh CLI 未安装。--from-ci 需要 gh；参考 https://cli.github.com。",
      );
    }
    const raw = await getGhRunList(simpleRunner, { limit: 30 });
    const allRuns = parseGhRunList(raw);
    const runs = filterBySince(allRuns, opts.sinceDays, now());
    const items = runsToCandidateItems(runs);
    const md = formatCandidateMd("ci-failure", items, {
      generatedAt: now().toISOString(),
    });
    const outPath = path.join(paths.candidatesDir, `ci-failure-${dateSlug}.md`);
    fs.writeFileSync(outPath, md, "utf-8");
    return formatSemiAutoReport("ci-failure", items.length, outPath);
  }

  throw new Error(`semi-auto source '${opts.source}' 未实现`);
}

function formatSemiAutoReport(
  source: CandidateSource,
  candidateCount: number,
  outPath: string,
): string {
  return [
    `🔍 TeamAgent Ingest (${source}, 候选生成)`,
    "",
    `  候选数: ${candidateCount}`,
    `  写入: ${outPath}`,
    "",
    `  编辑该文件，把想摄入的条目改为 - [x]，然后运行：`,
    `    teamagent ingest --from-candidates ${outPath}`,
    "",
  ].join("\n");
}

// Re-export for T8-T11 to hook additional sources
export { defaultRunner as _defaultRunner };
