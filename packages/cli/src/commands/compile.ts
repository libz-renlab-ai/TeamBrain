import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  DualLayerStore,
  MarkdownCompiler,
  CursorRulesCompiler,
  makeSkillCompiler,
} from "@teamagent/adapters";
import {
  runCompile,
  compileCursorRules,
  type CompilePipelineResult,
  type MarkdownCompilerLike,
} from "@teamagent/core";
import type { SkillCompiler, SkillArtifact } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";

export interface CompileOptions {
  dryRun?: boolean;
  /** Install target for exposing Skills. Defaults to Claude Skills only. */
  target?: "claude" | "codex" | "both" | "cursor";
  /** Legacy flag: CLAUDE.md block output is disabled by default, so this writes nothing. */
  markdownOnly?: boolean;
  /** Skills-only compile. This is also the default behavior. */
  skillsOnly?: boolean;
  /** 强制重写（当前实现：默认就是幂等重写，此 flag 预留） */
  force?: boolean;
  /** Legacy markdown option; Skills output ignores it. */
  presetOnly?: boolean;
  /**
   * Legacy opt-in: compile rules into the generated CLAUDE.md managed block.
   * Default commands do not write CLAUDE.md; propagation happens through Skills/docs.
   */
  legacyClaudeMd?: boolean;
  /** Output path for --target cursor. Defaults to `<cwd>/.cursorrules` */
  cursorOut?: string;
  // 路径注入，供测试使用
  cwd?: string;
  homeDir?: string;
  claudeMdPath?: string;
  agentsMdPath?: string;
  skillsDir?: string;
  /** 用户级 nested rule store 根目录。默认 `~/.claude/teamagent/rules` */
  userRulesDir?: string;
  projectDbPath?: string;
  userGlobalDbPath?: string;
}

export type CompileCommandResult = CompilePipelineResult & {
  agentsMarkdown?: { path: string; blockLineCount: number };
};

function resolvePaths(opts: CompileOptions) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const teamagentSkillsDir =
    opts.skillsDir ??
    process.env["TEAMAGENT_SKILLS_DIR"] ??
    path.join(home, ".claude", "skills", "teamagent");
  const userRulesDir =
    opts.userRulesDir ??
    process.env["TEAMAGENT_RULES_DIR"] ??
    path.join(home, ".claude", "teamagent", "rules");
  return {
    projectDbPath:
      opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath:
      opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    claudeMdPath: opts.claudeMdPath ?? path.join(cwd, "CLAUDE.md"),
    agentsMdPath: opts.agentsMdPath ?? path.join(cwd, "AGENTS.md"),
    skillsDir: opts.skillsDir,
    teamagentSkillsDir,
    userRulesDir,
    codexSkillsDir: path.join(cwd, ".codex", "skills"),
    cursorRulesPath: opts.cursorOut ?? path.join(cwd, ".cursorrules"),
  };
}

function resolveLegacyFlag(opts: CompileOptions): boolean {
  if (opts.legacyClaudeMd !== undefined) return opts.legacyClaudeMd;
  const env = process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
  if (env === undefined) return false;
  return env === "1" || env.toLowerCase() === "true" || env.toLowerCase() === "yes";
}

function targetIncludesCodex(target: NonNullable<CompileOptions["target"]>): boolean {
  return target === "codex" || target === "both";
}

/** 不做任何写操作的 SkillCompiler stub（用于 --markdown-only 模式）。 */
function makeNoopSkillCompiler(): SkillCompiler {
  return {
    compile(_entries: KnowledgeEntry[]): SkillArtifact[] {
      return [];
    },
    async write(_artifacts: SkillArtifact[]) {
      return { written: [], skipped: [] };
    },
    async cleanup(_ruleIds: string[]) {
      return { removed: [] };
    },
  };
}

export async function executeCompile(opts: CompileOptions = {}): Promise<CompileCommandResult> {
  const paths = resolvePaths(opts);
  const target = opts.target ?? "claude";
  const legacy = resolveLegacyFlag(opts);

  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });

  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath,
  });

  const skillCompiler = opts.markdownOnly
    ? makeNoopSkillCompiler()
    : makeSkillCompiler({ skillsDir: paths.teamagentSkillsDir });
  const markdownCompiler: MarkdownCompilerLike | undefined = legacy
    ? new MarkdownCompiler(
        paths.claudeMdPath,
        opts.presetOnly ? { compileOptions: { presetOnly: true } } : undefined,
      )
    : undefined;

  try {
    const result: CompileCommandResult = await runCompile({
      store,
      markdownCompiler,
      skillCompiler,
      dryRun: opts.dryRun,
      writeMarkdown: legacy && !opts.skillsOnly && !opts.markdownOnly,
    });
    if (target === "cursor" && !opts.dryRun) {
      const entries = store.getAll();
      const compiler = new CursorRulesCompiler(paths.cursorRulesPath);
      compiler.writeToFile(entries);
    }
    if (targetIncludesCodex(target) && !opts.skillsOnly && !opts.markdownOnly) {
      if (opts.dryRun) {
        result.agentsMarkdown = { path: "(dry-run)", blockLineCount: 0 };
      } else if (legacy) {
        // Legacy CLAUDE.md mode：保持 AGENTS.md → CLAUDE.md 软链接行为。
        fs.mkdirSync(paths.teamagentSkillsDir, { recursive: true });
        ensureSymlink(paths.agentsMdPath, paths.claudeMdPath, "file", () => new Date());
        ensureSymlink(paths.codexSkillsDir, paths.teamagentSkillsDir, "dir", () => new Date());
        result.agentsMarkdown = {
          path: paths.agentsMdPath,
          blockLineCount: result.markdown.blockLineCount,
        };
      } else {
        // Skills/docs propagation mode：只让 Codex 看到 skills 目录，不再创建 AGENTS.md → CLAUDE.md 链接。
        fs.mkdirSync(paths.teamagentSkillsDir, { recursive: true });
        ensureSymlink(paths.codexSkillsDir, paths.teamagentSkillsDir, "dir", () => new Date());
      }
    }
    return result;
  } finally {
    store.close();
  }
}

function ensureSymlink(
  linkPath: string,
  targetPath: string,
  targetType: "file" | "dir",
  now: () => Date,
): "created" | "already" | "backed-up" {
  const relativeTarget = path.relative(path.dirname(linkPath), targetPath) || path.basename(targetPath);
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const current = fs.readlinkSync(linkPath);
      const currentAbs = path.resolve(path.dirname(linkPath), current);
      if (currentAbs === targetPath) return "already";
      fs.unlinkSync(linkPath);
    } else {
      const backupPath = `${linkPath}.bak-teamagent-${now().toISOString().replace(/[:.]/g, "-")}`;
      fs.renameSync(linkPath, backupPath);
      fs.symlinkSync(relativeTarget, linkPath, targetType === "dir" ? "junction" : "file");
      return "backed-up";
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(relativeTarget, linkPath, targetType === "dir" ? "junction" : "file");
  return "created";
}

/**
 * Known flag list for `compile` (B-127, B-128). Anything outside this set
 * is rejected with a clear error rather than silently ignored, so a typo
 * like `--dyr-run` no longer triggers a real production compile.
 *
 * `--target` and `--cursor-out` accept a value either as `--flag value`
 * (next arg consumed) or `--flag=value`.
 */
const COMPILE_KNOWN_FLAGS = new Set<string>([
  "--dry-run",
  "--skills-only",
  "--markdown-only",
  "--force",
  "--preset-only",
  "--legacy-claude-md",
  "--no-legacy-claude-md",
  "--codex",
  "--claude",
  "--both",
  "--cursor",
  "--target",
  "--cursor-out",
]);

export class CompileArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileArgError";
  }
}

export function parseCompileArgs(argv: string[]): CompileOptions {
  const opts: CompileOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--skills-only") opts.skillsOnly = true;
    else if (a === "--markdown-only") opts.markdownOnly = true;
    else if (a === "--force") opts.force = true;
    else if (a === "--preset-only") opts.presetOnly = true;
    else if (a === "--legacy-claude-md") opts.legacyClaudeMd = true;
    else if (a === "--no-legacy-claude-md") opts.legacyClaudeMd = false;
    else if (a === "--codex") opts.target = "codex";
    else if (a === "--claude") opts.target = "claude";
    else if (a === "--both") opts.target = "both";
    else if (a === "--cursor") opts.target = "cursor";
    else if (a === "--target") {
      opts.target = parseTarget(argv[++i]);
    } else if (a.startsWith("--target=")) {
      opts.target = parseTarget(a.slice("--target=".length));
    } else if (a === "--cursor-out") {
      opts.cursorOut = argv[++i];
    } else if (a.startsWith("--cursor-out=")) {
      opts.cursorOut = a.slice("--cursor-out=".length);
    } else {
      const base = a.split("=")[0]!;
      if (a.startsWith("--") && !COMPILE_KNOWN_FLAGS.has(base)) {
        throw new CompileArgError(
          `compile: unknown flag "${a}". Run 'teamagent --help' for valid flags.`,
        );
      }
      // Non-flag positional args fall through silently for forward-compat;
      // compile takes none today, but rejecting them here would break callers
      // that prepend the literal subcommand name in some shell wrappers.
    }
  }
  return opts;
}

function parseTarget(value: string | undefined): NonNullable<CompileOptions["target"]> {
  if (value === "claude" || value === "codex" || value === "both" || value === "cursor") return value;
  throw new Error(`--target 必须是 claude|codex|both|cursor，收到: ${value ?? ""}`);
}

export function renderCompileResult(
  result: CompileCommandResult,
  dryRun = false,
): string {
  const lines: string[] = [];
  const tag = dryRun ? " (dry-run)" : "";
  lines.push(`🔧 TeamAgent Compile${tag}`);
  lines.push("");

  const isNestedRoot = result.markdown.path.endsWith(`${path.sep}rules${path.sep}INDEX.md`)
    || result.markdown.path.endsWith("/rules/INDEX.md");
  const label =
    result.markdown.path === "(skipped)" || result.markdown.path === "(dry-run)"
      ? "Markdown"
      : isNestedRoot
        ? "Rules"
        : path.basename(result.markdown.path);
  if (result.markdown.path === "(skipped)") {
    lines.push("  CLAUDE.md    (disabled; no generated rule block)");
  } else if (result.markdown.path === "(dry-run)") {
    lines.push(`  ${label.padEnd(12)}(dry-run, 未写入)`);
  } else if (isNestedRoot) {
    lines.push(
      `  ${label.padEnd(12)}${result.markdown.path}  (${result.markdown.blockLineCount} files)`,
    );
  } else {
    lines.push(
      `  ${label.padEnd(12)}${result.markdown.path}  (${result.markdown.blockLineCount} lines)`,
    );
  }
  if (result.agentsMarkdown) {
    if (result.agentsMarkdown.path === "(dry-run)") {
      lines.push("  AGENTS.md   (dry-run, 未写入)");
    } else {
      lines.push(
        `  AGENTS.md   ${result.agentsMarkdown.path}  (${result.agentsMarkdown.blockLineCount} lines)`,
      );
    }
  }

  lines.push("");

  if (result.skills.written.length > 0 || dryRun) {
    const writeLabel = dryRun ? "would write" : "written";
    lines.push(`  Skills ${writeLabel}:  ${result.skills.written.length} 条`);
    for (const id of result.skills.written.slice(0, 10)) {
      lines.push(`    + ${id}`);
    }
    if (result.skills.written.length > 10) {
      lines.push(`    ... (${result.skills.written.length - 10} more)`);
    }
  } else {
    lines.push("  Skills written:  0 条");
  }

  if (result.skills.removed.length > 0) {
    lines.push(`  Skills removed: ${result.skills.removed.length} 条`);
    for (const id of result.skills.removed.slice(0, 10)) {
      lines.push(`    - ${id}`);
    }
    if (result.skills.removed.length > 10) {
      lines.push(`    ... (${result.skills.removed.length - 10} more)`);
    }
  }

  lines.push("");
  lines.push("  Docs propagation is handled by `teamagent docs-propagate` when new rules are added.");
  lines.push("");
  return lines.join("\n");
}
