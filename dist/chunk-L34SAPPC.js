import {
  CursorRulesCompiler,
  MarkdownCompiler,
  makeSkillCompiler
} from "./chunk-NPSW37EI.js";
import {
  DualLayerStore
} from "./chunk-MXJDRQEB.js";
import {
  runCompile
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/compile.ts
init_esm_shims();
import os from "os";
import path from "path";
import fs from "fs";
function resolvePaths(opts) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  const teamagentSkillsDir = opts.skillsDir ?? process.env["TEAMAGENT_SKILLS_DIR"] ?? path.join(home, ".claude", "skills", "teamagent");
  const userRulesDir = opts.userRulesDir ?? process.env["TEAMAGENT_RULES_DIR"] ?? path.join(home, ".claude", "teamagent", "rules");
  return {
    projectDbPath: opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    claudeMdPath: opts.claudeMdPath ?? path.join(cwd, "CLAUDE.md"),
    agentsMdPath: opts.agentsMdPath ?? path.join(cwd, "AGENTS.md"),
    skillsDir: opts.skillsDir,
    teamagentSkillsDir,
    userRulesDir,
    codexSkillsDir: path.join(cwd, ".codex", "skills"),
    cursorRulesPath: opts.cursorOut ?? path.join(cwd, ".cursorrules")
  };
}
function resolveLegacyFlag(opts) {
  if (opts.legacyClaudeMd !== void 0) return opts.legacyClaudeMd;
  const env = process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
  if (env === void 0) return false;
  return env === "1" || env.toLowerCase() === "true" || env.toLowerCase() === "yes";
}
function targetIncludesCodex(target) {
  return target === "codex" || target === "both";
}
function makeNoopSkillCompiler() {
  return {
    compile(_entries) {
      return [];
    },
    async write(_artifacts) {
      return { written: [], skipped: [] };
    },
    async cleanup(_ruleIds) {
      return { removed: [] };
    }
  };
}
async function executeCompile(opts = {}) {
  const paths = resolvePaths(opts);
  const target = opts.target ?? "claude";
  const legacy = resolveLegacyFlag(opts);
  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath
  });
  const skillCompiler = opts.markdownOnly ? makeNoopSkillCompiler() : makeSkillCompiler({ skillsDir: paths.teamagentSkillsDir });
  const markdownCompiler = legacy ? new MarkdownCompiler(
    paths.claudeMdPath,
    opts.presetOnly ? { compileOptions: { presetOnly: true } } : void 0
  ) : void 0;
  try {
    const result = await runCompile({
      store,
      markdownCompiler,
      skillCompiler,
      dryRun: opts.dryRun,
      writeMarkdown: legacy && !opts.skillsOnly && !opts.markdownOnly
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
        fs.mkdirSync(paths.teamagentSkillsDir, { recursive: true });
        ensureSymlink(paths.agentsMdPath, paths.claudeMdPath, "file", () => /* @__PURE__ */ new Date());
        ensureSymlink(paths.codexSkillsDir, paths.teamagentSkillsDir, "dir", () => /* @__PURE__ */ new Date());
        result.agentsMarkdown = {
          path: paths.agentsMdPath,
          blockLineCount: result.markdown.blockLineCount
        };
      } else {
        fs.mkdirSync(paths.teamagentSkillsDir, { recursive: true });
        ensureSymlink(paths.codexSkillsDir, paths.teamagentSkillsDir, "dir", () => /* @__PURE__ */ new Date());
      }
    }
    return result;
  } finally {
    store.close();
  }
}
function ensureSymlink(linkPath, targetPath, targetType, now) {
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
    if (err.code !== "ENOENT") throw err;
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(relativeTarget, linkPath, targetType === "dir" ? "junction" : "file");
  return "created";
}
var COMPILE_KNOWN_FLAGS = /* @__PURE__ */ new Set([
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
  "--cursor-out"
]);
var CompileArgError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CompileArgError";
  }
};
function parseCompileArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
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
      const base = a.split("=")[0];
      if (a.startsWith("--") && !COMPILE_KNOWN_FLAGS.has(base)) {
        throw new CompileArgError(
          `compile: unknown flag "${a}". Run 'teamagent --help' for valid flags.`
        );
      }
    }
  }
  return opts;
}
function parseTarget(value) {
  if (value === "claude" || value === "codex" || value === "both" || value === "cursor") return value;
  throw new Error(`--target \u5FC5\u987B\u662F claude|codex|both|cursor\uFF0C\u6536\u5230: ${value ?? ""}`);
}
function renderCompileResult(result, dryRun = false) {
  const lines = [];
  const tag = dryRun ? " (dry-run)" : "";
  lines.push(`\u{1F527} TeamAgent Compile${tag}`);
  lines.push("");
  const isNestedRoot = result.markdown.path.endsWith(`${path.sep}rules${path.sep}INDEX.md`) || result.markdown.path.endsWith("/rules/INDEX.md");
  const label = result.markdown.path === "(skipped)" || result.markdown.path === "(dry-run)" ? "Markdown" : isNestedRoot ? "Rules" : path.basename(result.markdown.path);
  if (result.markdown.path === "(skipped)") {
    lines.push("  CLAUDE.md    (disabled; no generated rule block)");
  } else if (result.markdown.path === "(dry-run)") {
    lines.push(`  ${label.padEnd(12)}(dry-run, \u672A\u5199\u5165)`);
  } else if (isNestedRoot) {
    lines.push(
      `  ${label.padEnd(12)}${result.markdown.path}  (${result.markdown.blockLineCount} files)`
    );
  } else {
    lines.push(
      `  ${label.padEnd(12)}${result.markdown.path}  (${result.markdown.blockLineCount} lines)`
    );
  }
  if (result.agentsMarkdown) {
    if (result.agentsMarkdown.path === "(dry-run)") {
      lines.push("  AGENTS.md   (dry-run, \u672A\u5199\u5165)");
    } else {
      lines.push(
        `  AGENTS.md   ${result.agentsMarkdown.path}  (${result.agentsMarkdown.blockLineCount} lines)`
      );
    }
  }
  lines.push("");
  if (result.skills.written.length > 0 || dryRun) {
    const writeLabel = dryRun ? "would write" : "written";
    lines.push(`  Skills ${writeLabel}:  ${result.skills.written.length} \u6761`);
    for (const id of result.skills.written.slice(0, 10)) {
      lines.push(`    + ${id}`);
    }
    if (result.skills.written.length > 10) {
      lines.push(`    ... (${result.skills.written.length - 10} more)`);
    }
  } else {
    lines.push("  Skills written:  0 \u6761");
  }
  if (result.skills.removed.length > 0) {
    lines.push(`  Skills removed: ${result.skills.removed.length} \u6761`);
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

export {
  executeCompile,
  CompileArgError,
  parseCompileArgs,
  renderCompileResult
};
