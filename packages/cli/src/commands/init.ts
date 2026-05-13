import {
  duckifyText,
  parseChangelog,
  renderWhatsNewTail,
} from "@teamagent/core";
import { loadBundledChangelog } from "../changelog-loader.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  DualLayerStore,
  SqliteKnowledgeStore,
  ClaudeCodeLLMClient,
  openDb,
  ClaudePluginInstaller,
  makeSkillCompiler,
} from "@teamagent/adapters";
import {
  executeInstallPlugins,
  type InstallPluginsResult,
} from "./install-plugins.js";
import {
  detectStack,
  getMetaPrinciples,
  extractRuleBullets,
  extractCursorRules,
  structureRuleTextsBatch,
  runCompile,
  DEFAULT_IMPORT_CONFIDENCE,
  OBSERVED_FILE_LIST,
  renderPackPromptBody,
  planStaticUserSkillInstall,
  type FilePresence,
  type ObservedFile,
  type ObservedFiles,
  type StaticUserSkillTarget,
} from "@teamagent/core";
import {
  executePackAdd,
  readPackRegistry,
  resolvePacksDir,
} from "./pack.js";
import type { LLMClient } from "@teamagent/ports";
import type { KnowledgeEntry } from "@teamagent/types";
import { computeEnforcement } from "@teamagent/types";
import { auditOrphanShellHooks, installHook } from "./install-hook.js";
import {
  CHECK_TEAMAGENT_SH_CONTENT,
  REQUIRED_JSON_CONTENT,
} from "./required-check.js";
import { findTeamagentRoot } from "../lib/walk-up.js";

export interface InitOptions {
  cwd?: string;
  homeDir?: string;
  /** Install target. Claude keeps the historical behavior; Codex writes AGENTS.md. */
  target?: "claude" | "codex" | "both";
  /** 预览模式：只检查、只输出"会做什么"，不写任何文件。 */
  dryRun?: boolean;
  /** 注入 LLM（测试用）；缺省用 ClaudeCodeLLMClient。 */
  llmClient?: LLMClient;
  /** 若为 true，跳过 LLM 导入步骤（例如无网络/无 claude CLI 时快装）。 */
  skipImport?: boolean;
  /** 跳过 hook 安装（测试环境下 dist bundle 可能不存在）。 */
  skipHook?: boolean;
  /**
   * Issue #161 — Layer 1 viral install. When `true` (default), `installHook`
   * also writes the TeamAgent hook entries to `~/.claude/settings.json` so
   * Claude Code launched from any cwd (including sub-directories) registers
   * the project's hooks. CLI escape hatch: `--no-user-level-hook`.
   */
  userLevelHook?: boolean;
  /**
   * Issue #161 follow-up: skip the nested-init guard. Default false. Use only
   * when you really do want to create a child .teamagent/ inside an already-
   * initialized parent (e.g. testing, monorepo subproject with intentional
   * isolation).
   */
  force?: boolean;
  /** 跳过打包 seed 注入（测试环境隔离 dev 产物；正常安装应保持 false）。 */
  skipSeed?: boolean;
  /** 跳过向量模型预热（测试 / 离线环境；正常安装应保持 false）。 */
  skipWarmup?: boolean;
  /** 显式指定 seed 文件路径（测试用）。 */
  seedPath?: string;
  /**
   * Stack packs to install without showing the agent prompt.
   * Value: "all" (every available pack) or comma-separated names (e.g. "frontend-js,ops-safety").
   * When unset, init prints the versioned markdown prompt described by ADR 0002.
   */
  pack?: string;
  /** Override registry directory (tests inject; production resolves via seed path walk + TEAMAGENT_PACKS_DIR). */
  packsDir?: string;
  /**
   * Opt-in：装团队标配 plugins（与项目级 `.claude/settings.json:enabledPlugins` 同步）。
   * 默认 false——插件装在用户全局（~/.claude/settings.json），跨所有项目生效，
   * 与"初始化本项目"不是同一个心智模型，不能默认打开。
   */
  installPlugins?: boolean;
  /** 注入 plugin installer（测试用）。 */
  pluginInstaller?: ClaudePluginInstaller;
  projectDbPath?: string;
  userGlobalDbPath?: string;
  claudeMdPath?: string;
  agentsMdPath?: string;
  skillsDir?: string;
  hookEntry?: string;
  now?: () => Date;
  idGen?: () => string;
}

export interface InitStepResult {
  step: string;
  status: "ok" | "skipped" | "failed";
  detail: string;
}

export interface InitResult {
  ok: boolean;
  dryRun: boolean;
  steps: InitStepResult[];
  summary: {
    stack: string;
    presetAdded: number;
    seedAdded: number;
    importedRules: number;
    totalActiveEntries: number;
  };
  /**
   * Versioned markdown prompt block (per ADR 0002) shown to the user's coding
   * agent when no `--pack` flag was supplied. Empty / undefined when init was
   * invoked with `--pack` (caller already chose) or in dry-run mode where the
   * prompt is unnecessary.
   */
  packPrompt?: string;
}

/**
 * Single source of truth for the claim-to-merge skill identity (issue #218).
 * Renaming the skill should require touching ONLY this constant — derived
 * downstream are MIRROR_CLAIM_STEP, the helper call site, and the banner
 * routing-doc path. Bash side (scripts/verify-gstack-skill-mirrors.sh)
 * mirrors this in NON_GSTACK_MIRRORED_SKILLS — keep them in sync.
 */
const CLAIM_TO_MERGE_SKILL_ID = "claim-to-merge" as const;

/**
 * Step key for the user-level mirror of project-level skills (issue #218).
 * Centralized so a typo can't silently de-register the step from any of:
 * the function body, stepGroups (renderInitResult), or stepLabel mapping.
 */
const MIRROR_CLAIM_STEP = `mirror-${CLAIM_TO_MERGE_SKILL_ID}-skill` as const;

/**
 * Step key for the broader static-user-skills mirror (docs/INIT-PROPAGATION.md).
 * Distinct from MIRROR_CLAIM_STEP because this one targets the top-level
 * ~/.claude/skills/<name>/ and ~/.codex/skills/<name>/ (not the
 * ~/.claude/skills/teamagent/<name>/ namespace).
 */
const STATIC_USER_SKILLS_STEP = "mirror-static-user-skills" as const;

/**
 * Repo-relative paths the FIXEDFLOW banner mentions. Exported so the unit
 * test can iterate and assert each one resolves on disk — protects against
 * silent doc renames making the banner lie.
 */
export const FIXEDFLOW_BANNER_DOC_PATHS = [
  `.claude/skills/${CLAIM_TO_MERGE_SKILL_ID}/SKILL.md`,
  "docs/FIXEDFLOW.md",
  "docs/PR-PLAN.md",
  "docs/POSTPR.md",
] as const;

function resolvePaths(opts: InitOptions) {
  const home = opts.homeDir ?? os.homedir();
  const cwd = opts.cwd ?? process.cwd();
  return {
    home,
    cwd,
    projectDbPath:
      opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath:
      opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    claudeMdPath: opts.claudeMdPath ?? path.join(cwd, "CLAUDE.md"),
    agentsMdPath: opts.agentsMdPath ?? path.join(cwd, "AGENTS.md"),
    skillsDir:
      opts.skillsDir ??
      process.env["TEAMAGENT_SKILLS_DIR"] ??
      path.join(home, ".claude", "skills", "teamagent"),
    installLogPath: path.join(home, ".teamagent", ".install-log"),
  };
}

function targetIncludesClaude(target: InitOptions["target"]): boolean {
  return target === "claude" || target === "both";
}

function targetIncludesCodex(target: InitOptions["target"]): boolean {
  return target === "codex" || target === "both";
}

function cwdFilePresence(cwd: string): FilePresence {
  return {
    exists: (rel) => fs.existsSync(path.join(cwd, rel)),
    read: (rel) => {
      const full = path.join(cwd, rel);
      try {
        return fs.statSync(full).isFile()
          ? fs.readFileSync(full, "utf-8")
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

export async function executeInit(opts: InitOptions = {}): Promise<InitResult> {
  const paths = resolvePaths(opts);
  const dryRun = opts.dryRun ?? false;
  const target = opts.target ?? "claude";
  const now = opts.now ?? (() => new Date());
  const steps: InitStepResult[] = [];

  // Issue #161 follow-up (PR #181 /review finding #5):
  // If an ancestor directory already has a teamagent project (.teamagent/knowledge.db
  // + project marker), refuse to create a duplicate child .teamagent/. The user
  // almost certainly meant to operate on the existing parent project.
  //
  // Escape hatch: --force-nested-init (opts.force === true).
  if (!opts.force) {
    const ancestor = findTeamagentRoot(paths.cwd, { homeDir: paths.home });
    if (ancestor !== null && ancestor !== paths.cwd) {
      const failedStep: InitStepResult = {
        step: "nested-init-guard",
        status: "failed",
        detail:
          `detected ancestor TeamAgent project at ${ancestor}; refusing to ` +
          `create duplicate .teamagent/ in ${paths.cwd} — cd to the project root ` +
          `or use --force-nested-init to override.`,
      };
      return finalize(false, dryRun, [failedStep], emptySummary());
    }
  }

  // ---------- Phase A: Pre-check ----------
  const preCheck = runPreChecks(paths, target);
  steps.push(preCheck);
  if (preCheck.status === "failed") {
    return finalize(false, dryRun, steps, emptySummary());
  }

  // ---------- Phase B: Execute ----------

  const stackStep = doDetectStack(paths.cwd);
  steps.push(stackStep);
  const stackSummary = stackStep.detail;

  steps.push(doCreateDirs(paths, dryRun));

  const presetStep = doLoadPresets(paths.userGlobalDbPath, dryRun, now);
  steps.push(presetStep.step);

  const seedStep = opts.skipSeed
    ? { step: { step: "load-seed", status: "skipped" as const, detail: "skipSeed=true" }, addedCount: 0, wouldAddCount: 0 }
    : doLoadSeed(paths.userGlobalDbPath, dryRun, opts.seedPath);
  steps.push(seedStep.step);

  const importStep = await doImportRules(paths, opts, dryRun, now);
  steps.push(...importStep.steps);

  if (targetIncludesClaude(target) && !opts.skipHook) {
    steps.push(
      doInstallHook(paths.cwd, opts.hookEntry, dryRun, opts.userLevelHook ?? true),
    );
    // B+C scope (2026-05-09): orphan .sh scanner. Surface unreferenced shell
    // hooks as a soft warning so future drift is visible during init. Never
    // blocks — orphans may be intentional user customizations.
    steps.push(doAuditOrphanShellHooks(paths.cwd, dryRun));
  } else if (!targetIncludesClaude(target) && !targetIncludesCodex(target)) {
    steps.push({ step: "install-hook", status: "skipped", detail: "skipHook=true" });
  } else if (!targetIncludesClaude(target)) {
    steps.push({ step: "install-hook", status: "skipped", detail: "target=codex；Claude PreToolUse hook 不注册" });
  } else if (opts.skipHook) {
    steps.push({ step: "install-hook", status: "skipped", detail: "skipHook=true" });
  }

  // Issue #291: Codex hooks installer. Independent of Claude installer above —
  // `target=both` runs BOTH branches; `target=codex` only runs this branch.
  // Honors --skipHook symmetrically. Idempotent via `_teamagentTag` per entry;
  // never clobbers user-edited untagged hooks (structured merge in
  // applyCodexHooksMerge below). Grill §14 partial-success semantics: if this
  // step fails, Claude install above already succeeded → init still finalizes
  // success unless --strict is set.
  if (targetIncludesCodex(target) && !opts.skipHook) {
    steps.push(doInstallCodexHooks(paths, dryRun));
  }

  // Issue #284 slice 1: write `.teamagent/required.json` and
  // `.claude/hooks/check-teamagent.sh` for Claude targets. Independent of
  // --skip-hook because these are repo-committed enforcement artifacts, not
  // the compiled PreToolUse bundle that --skip-hook gates. Idempotent: a
  // re-run produces no file changes when content is byte-identical.
  if (targetIncludesClaude(target)) {
    steps.push(doWriteRequiredArtifacts(paths.cwd, dryRun));
  }

  if (opts.installPlugins) {
    steps.push(await doInstallPlugins(dryRun, opts.pluginInstaller));
  }

  steps.push(await doCompileSkills(paths, dryRun));
  if (targetIncludesClaude(target)) {
    steps.push(doMirrorClaimToMergeSkill(paths, dryRun));
  }
  if (targetIncludesCodex(target)) {
    steps.push(doLinkCodexFiles(paths, dryRun));
  }
  steps.push(doMirrorStaticUserSkills(paths, target, dryRun));

  // 末尾预热向量模型（首装首次触发；测试/离线/已 cached 时跳过）
  const skipWarmup =
    opts.skipWarmup === true ||
    dryRun ||
    process.env["NODE_ENV"] === "test" ||
    process.env["TEAMAGENT_SKIP_WARMUP"] === "1";
  // ADR 0001 §opt-in: default install does NOT pull @xenova/transformers +
  // onnxruntime-node (npm 10 ignores --omit=optional for tarball installs, so
  // they're absent from package.json entirely). Skip warmup entirely when the
  // optionals aren't on disk — otherwise spawnDetachedWarmup would write a
  // placeholder "downloading pid=0" state that bin-pre-tool-use sees as
  // permanently in-flight.
  const haveVectorOptionals = (() => {
    try {
      // Same bounded resolution policy as packages/teamagent/postinstall.mjs:
      // peer to teamagent (npm hoist) or local under teamagent/node_modules.
      // Both @xenova/transformers AND onnxruntime-node must be present; if only
      // @xenova is found (e.g. installed globally elsewhere) warmup would spawn
      // and immediately fail because onnxruntime is the actual runtime dep.
      const here = fileURLToPath(import.meta.url);
      let dir = path.dirname(here);
      for (let i = 0; i < 8; i++) {
        const hasXenova =
          fs.existsSync(path.join(dir, "node_modules", "@xenova", "transformers", "package.json")) ||
          fs.existsSync(path.join(dir, "..", "@xenova", "transformers", "package.json"));
        const hasOnnx =
          fs.existsSync(path.join(dir, "node_modules", "onnxruntime-node", "package.json")) ||
          fs.existsSync(path.join(dir, "..", "onnxruntime-node", "package.json"));
        if (hasXenova && hasOnnx) {
          return true;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
      }
      // Third strategy: pnpm content-addressable store puts deps at
      // ~/.local/share/pnpm/global/<N>/.pnpm/<dep>@<ver>/node_modules/<dep>/.
      // The fs.existsSync walk above misses that layout because pkgDir/../<dep>
      // does not resolve into the CAS tree. Use createRequire so Node's own
      // module-resolution (which follows pnpm's symlinks) does the work.
      // Constrain the resolved path to known global roots to avoid
      // false-positiving on the user's unrelated nvm/system @xenova install.
      try {
        const req = createRequire(here);
        const home = os.homedir();
        // Wave-9 P3 fix: walk up from `here` to the nearest enclosing
        // package.json so the first knownRoot points at the actual install
        // (npm hoisted, pnpm symlinked, custom prefix, etc.) instead of
        // dirname(here)=dist/commands which can never contain @xenova.
        const pkgRoot = (() => {
          let cur = path.dirname(here);
          for (let i = 0; i < 16; i++) {
            if (fs.existsSync(path.join(cur, "package.json"))) return cur;
            const parent = path.dirname(cur);
            if (parent === cur) return path.dirname(here);
            cur = parent;
          }
          return path.dirname(here);
        })();
        const knownRoots = [
          pkgRoot,
          path.join(home, ".local", "share", "pnpm"),
          path.join(home, ".npm-global"),
          path.join(home, ".pnpm-global"),
        ];
        const isUnderKnownRoot = (resolved: string) =>
          knownRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root);
        let rxResolved: string | undefined;
        try { rxResolved = req.resolve("@xenova/transformers/package.json"); } catch { /* not found */ }
        let onnxResolved: string | undefined;
        try { onnxResolved = req.resolve("onnxruntime-node/package.json"); } catch { /* not found */ }
        if (rxResolved && onnxResolved && isUnderKnownRoot(rxResolved) && isUnderKnownRoot(onnxResolved)) {
          return true;
        }
      } catch {
        // createRequire path is best-effort
      }
      return false;
    } catch {
      return false;
    }
  })();
  if (skipWarmup) {
    steps.push({ step: "warmup", status: "skipped", detail: "skipWarmup / dryRun / test env" });
  } else if (!haveVectorOptionals) {
    // Issue #164 + PR #227: vector deps are now in `dependencies`, so a skip
    // here means an incomplete install (failed native build / partial sync).
    steps.push({
      step: "warmup",
      status: "skipped",
      detail: "vector deps 未在 node_modules 中找到 (issue #164 / PR #227 起默认进 dependencies); 重装 teamagent 恢复",
    });
  } else {
    // Issue #91: default to detached (two-stage) warmup so init returns to
    // the shell prompt within ~30s. The legacy foreground path is preserved
    // behind TEAMAGENT_FOREGROUND_WARMUP=1 (escape hatch for users who want
    // PR #113's visible-progress behavior + a synchronous "model ready"
    // guarantee at end of init).
    const useForegroundWarmup = process.env["TEAMAGENT_FOREGROUND_WARMUP"] === "1";
    if (useForegroundWarmup) {
      try {
        const { runWarmup } = await import("./warmup.js");
        const { defaultWarmupStatePath } = await import("../warmup-state.js");
        const stateFile = defaultWarmupStatePath(paths.home);
        const w = await runWarmup({ stateFilePath: stateFile });
        steps.push({
          step: "warmup",
          status: w.ok ? "ok" : "failed",
          detail: w.ok
            ? `模型预热 ${w.durationMs}ms (foreground; TEAMAGENT_FOREGROUND_WARMUP=1)`
            : `预热失败：${w.error ?? "unknown"}`,
        });
      } catch (err) {
        steps.push({
          step: "warmup",
          status: "failed",
          detail: `预热异常：${String(err).slice(0, 120)}`,
        });
      }
    } else {
      // Two-stage path: write a placeholder state, spawn detached, return.
      const detachResult = await spawnDetachedWarmup(paths.home);
      steps.push({
        step: "warmup",
        status: detachResult.ok ? "ok" : "failed",
        detail: detachResult.detail,
      });
    }
  }

  // ---------- Phase C: Pack management (ADR 0002) ----------
  // Run BEFORE appendInstallLog and totalActive computation so that:
  //   1. load-pack / pack-prompt steps land in ~/.teamagent/.install-log
  //      (audit trail covers pack failures too — Codex review #110 P2).
  //   2. summary.totalActiveEntries reflects pack-added rules (otherwise
  //      callers see a stale count — Codex review #110 P2).
  // When --pack <names> is given, install packs as a normal init step.
  // Otherwise, render the versioned markdown prompt for the coding agent.
  let packPrompt = "";
  const packsDir = resolvePacksDir(opts.packsDir);
  const observed = collectObservedFiles(paths.cwd);
  const available = packsDir ? readPackRegistry(packsDir) : [];
  let packAddedRules = 0;

  if (opts.pack && opts.pack.trim().length > 0) {
    const requested = opts.pack
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (dryRun) {
      steps.push(
        okStep(
          "load-pack",
          `(dry-run) 会安装 packs: ${requested.join(", ")}`,
        ),
      );
    } else {
      try {
        const result = executePackAdd(requested, {
          ...(opts.packsDir ? { packsDir: opts.packsDir } : {}),
          userGlobalDbPath: paths.userGlobalDbPath,
        });
        const parts: string[] = [];
        if (result.added.length > 0) {
          packAddedRules = result.added.reduce((s, a) => s + a.rules, 0);
          parts.push(`安装 ${result.added.length} 个 pack（${packAddedRules} 条规则）`);
        }
        if (result.alreadyInstalled.length > 0) {
          parts.push(`已存在: ${result.alreadyInstalled.join(", ")}`);
        }
        if (result.notFound.length > 0) {
          parts.push(`未找到: ${result.notFound.join(", ")}`);
        }
        if (result.failed.length > 0) {
          parts.push(`失败: ${result.failed.length}`);
        }
        const status =
          result.notFound.length > 0 || result.failed.length > 0
            ? "failed"
            : "ok";
        steps.push({
          step: "load-pack",
          status,
          detail: parts.join("，") || "无事可做",
        });
      } catch (err) {
        steps.push(failStep("load-pack", String(err).slice(0, 200)));
      }
    }
  } else if (!dryRun) {
    if (available.length === 0) {
      // No stack packs available — skip the prompt block entirely (issue 174 #5).
      // The self-contradicting "已生成 v1 prompt（无 pack 可用）" + 30-line block
      // confused new users; emit a single notice instead.
      packPrompt = "";
      steps.push(
        okStep(
          "pack-prompt",
          "ℹ️  暂无 stack packs 可用（teamagent pack list 查看）",
        ),
      );
    } else {
      const installedNames = collectInstalledPackNames(
        paths.userGlobalDbPath,
        available,
      );
      packPrompt = renderPackPromptBody({
        observed,
        available,
        installed: installedNames,
      });
      steps.push(
        okStep(
          "pack-prompt",
          `已生成 v1 markdown prompt（${available.length} 个可用 pack）`,
        ),
      );
    }
  } else {
    steps.push(
      okStep(
        "pack-prompt",
        `(dry-run) 会渲染 v1 prompt（${available.length} 个 pack）`,
      ),
    );
  }

  // Install log + totalActive must run AFTER Phase C so they observe pack steps + rules.
  if (!dryRun) {
    try {
      appendInstallLog(paths.installLogPath, steps, now);
    } catch {
      // ignore
    }
  }

  let totalActive = 0;
  if (dryRun) {
    totalActive =
      presetStep.wouldAddCount +
      seedStep.wouldAddCount +
      importStep.wouldImport +
      packAddedRules;
  } else {
    try {
      fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
      fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
      const store = new DualLayerStore({
        projectDbPath: paths.projectDbPath,
        userGlobalDbPath: paths.userGlobalDbPath,
      });
      totalActive = store.findActive().length;
      store.close();
    } catch {
      // ignore
    }
  }

  const summary = {
    stack: stackSummary,
    presetAdded: presetStep.addedCount,
    seedAdded: seedStep.addedCount,
    importedRules: importStep.importedCount,
    totalActiveEntries: totalActive,
  };

  const ok = !steps.some((s) => s.status === "failed");
  return finalize(ok, dryRun, steps, summary, packPrompt);
}

function collectObservedFiles(cwd: string): ObservedFiles {
  const out = {} as ObservedFiles;
  for (const f of OBSERVED_FILE_LIST) {
    out[f as ObservedFile] = fs.existsSync(path.join(cwd, f));
  }
  return out;
}

function collectInstalledPackNames(
  userGlobalDbPath: string,
  available: { name: string }[],
): string[] {
  if (!fs.existsSync(userGlobalDbPath)) return [];
  try {
    const store = new SqliteKnowledgeStore(openDb(userGlobalDbPath));
    try {
      const all = store.getAll();
      const names: string[] = [];
      for (const meta of available) {
        const tag = `pack:${meta.name}`;
        if (all.some((e) => e.tags?.includes(tag))) names.push(meta.name);
      }
      return names.sort();
    } finally {
      store.close();
    }
  } catch {
    return [];
  }
}

// Step implementations

function runPreChecks(
  paths: ReturnType<typeof resolvePaths>,
  target: NonNullable<InitOptions["target"]>,
): InitStepResult {
  if (!fs.existsSync(paths.cwd)) {
    return failStep("pre-check", `项目目录不存在: ${paths.cwd}`);
  }
  try {
    const tDir = path.join(paths.home, ".teamagent");
    fs.mkdirSync(tDir, { recursive: true });
    const probe = path.join(tDir, `.probe-${process.pid}`);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
  } catch {
    return failStep("pre-check", "无法创建 ~/.teamagent 目录，请检查磁盘权限");
  }
  const mdPaths: Array<{ path: string; label: string }> = [];
  if (targetIncludesClaude(target) || targetIncludesCodex(target)) {
    mdPaths.push({ path: paths.claudeMdPath, label: "CLAUDE.md" });
  }
  if (targetIncludesCodex(target)) {
    mdPaths.push({ path: paths.agentsMdPath, label: "AGENTS.md" });
  }
  for (const item of mdPaths) {
    if (!fs.existsSync(item.path)) continue;
    try {
      fs.accessSync(item.path, fs.constants.R_OK);
    } catch {
      return failStep("pre-check", `${item.label} 文件无读取权限，请运行: chmod 644 ${item.label}`);
    }
  }
  return okStep("pre-check", "所有前置检查通过");
}

function doDetectStack(cwd: string): InitStepResult {
  const fp = cwdFilePresence(cwd);
  const stack = detectStack(fp);
  const parts: string[] = [];
  if (stack.languages.length) parts.push(`lang=${stack.languages.join("+")}`);
  if (stack.frameworks.length) parts.push(`fw=${stack.frameworks.join("+")}`);
  if (stack.packageManagers.length) parts.push(`pm=${stack.packageManagers.join("+")}`);
  if (stack.testRunners.length) parts.push(`test=${stack.testRunners.join("+")}`);
  if (stack.otherSignals.length) parts.push(`other=${stack.otherSignals.join("+")}`);
  const detail = parts.length > 0 ? parts.join("  ") : "(识别不到典型信号)";
  return okStep("detect-stack", detail);
}

function doCreateDirs(
  paths: ReturnType<typeof resolvePaths>,
  dryRun: boolean,
): InitStepResult {
  const toCreate = [
    path.dirname(paths.projectDbPath),
    path.dirname(paths.userGlobalDbPath),
  ];
  if (dryRun) {
    return okStep("create-dirs", `(dry-run) 会创建: ${toCreate.join(", ")}`);
  }
  try {
    for (const d of toCreate) fs.mkdirSync(d, { recursive: true });
    // Issue #161 follow-up (PR #181 round-2 finding #9): write a TeamAgent-
    // managed `.teamagent/.project-root` marker so docs-only projects (no
    // .git, no package.json) are still discoverable by `findTeamagentRoot`
    // when Claude Code is launched from a sub-directory. Idempotent —
    // best-effort, a write failure must NOT abort init.
    try {
      const marker = path.join(paths.cwd, ".teamagent", ".project-root");
      if (!fs.existsSync(marker)) {
        fs.writeFileSync(
          marker,
          `# TeamAgent project marker — created by \`teamagent init\` on ${new Date().toISOString()}\n` +
            `# This file makes the project discoverable by findTeamagentRoot from sub-directories.\n`,
          "utf-8",
        );
      }
    } catch {
      // best-effort; the rest of init proceeds even if the marker fails to write
    }
    return okStep("create-dirs", `已确保目录存在: ${toCreate.length} 个`);
  } catch (err) {
    return failStep("create-dirs", String(err).slice(0, 200));
  }
}

function doLoadPresets(
  userGlobalDbPath: string,
  dryRun: boolean,
  now: () => Date,
): { step: InitStepResult; addedCount: number; wouldAddCount: number } {
  const presets = getMetaPrinciples(now);
  if (dryRun) {
    return {
      step: okStep("load-preset", `(dry-run) 会写入 ${presets.length} 条元原则`),
      addedCount: 0,
      wouldAddCount: presets.length,
    };
  }
  try {
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const store = new SqliteKnowledgeStore(openDb(userGlobalDbPath));
    let added = 0;
    for (const p of presets) {
      if (store.getById(p.id)) continue;
      store.add(p);
      added++;
    }
    store.close();
    return {
      step: okStep("load-preset", `注入元原则 ${added} 条（总 ${presets.length} 条，${presets.length - added} 条已存在）`),
      addedCount: added,
      wouldAddCount: presets.length,
    };
  } catch (err) {
    return {
      step: failStep("load-preset", String(err).slice(0, 200)),
      addedCount: 0,
      wouldAddCount: 0,
    };
  }
}

/**
 * 寻找打包时随 tarball 一起进来的 seed/rules.jsonl。
 * - Dev (source, tsx):  .../packages/cli/src/commands/init.ts
 *                       → .../packages/teamagent/seed/rules.jsonl
 * - Bundled (npm):      .../node_modules/teamagent/dist/init.js (or bin.js)
 *                       → .../node_modules/teamagent/dist/seed/rules.jsonl
 */
function resolveSeedPath(): string | undefined {
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    // bundled: <root>/dist/bin.js → <root>/dist/seed/rules.jsonl
    const bundled = path.join(dir, "dist", "seed", "rules.jsonl");
    if (fs.existsSync(bundled)) return bundled;
    // dev: <root>/packages/teamagent/seed/rules.jsonl — walk up and try
    const dev = path.join(dir, "packages", "teamagent", "seed", "rules.jsonl");
    if (fs.existsSync(dev)) return dev;
    // inside packages/cli/... path — climb to repo root
    const siblingSeed = path.join(dir, "..", "teamagent", "seed", "rules.jsonl");
    if (fs.existsSync(siblingSeed)) return siblingSeed;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function parseJsonlEntries(filePath: string): KnowledgeEntry[] {
  const text = fs.readFileSync(filePath, "utf-8");
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as KnowledgeEntry);
}

/**
 * Issue #91: locate the bundled `bin.js` so init.ts can spawn `teamagent
 * warmup` as a detached child. Searches:
 *   - `<this dir>/bin.js`              (bundled tarball install)
 *   - `<this dir>/.../packages/teamagent/dist/bin.js`  (dev tree)
 *   - `<this dir>/../teamagent/dist/bin.js`            (workspace lift)
 * Returns undefined if no built bin.js exists (dev mode that has not run
 * `pnpm build`); the caller falls back to a clear failure message.
 */
function resolveTeamAgentBinPath(): string | undefined {
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    const sibling = path.join(dir, "bin.js");
    if (fs.existsSync(sibling)) return sibling;
    const dev = path.join(dir, "packages", "teamagent", "dist", "bin.js");
    if (fs.existsSync(dev)) return dev;
    const nested = path.join(dir, "..", "teamagent", "dist", "bin.js");
    if (fs.existsSync(nested)) return nested;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Issue #91: spawn `teamagent warmup --write-state <state>` as a detached
 * child. Writes the initial placeholder state synchronously so any reader
 * (PreToolUse, doctor) immediately sees `status="downloading"` rather than
 * the absence of the file.
 */
async function spawnDetachedWarmup(home: string): Promise<{ ok: boolean; detail: string }> {
  const { writeInitialPlaceholder, defaultWarmupStatePath } = await import("../warmup-state.js");
  const stateFile = defaultWarmupStatePath(home);
  const teamagentDir = path.dirname(stateFile);
  fs.mkdirSync(teamagentDir, { recursive: true });
  // 1) Placeholder ensures readers cannot observe the moment-of-no-file.
  try {
    writeInitialPlaceholder(stateFile, "Xenova/multilingual-e5-small");
  } catch (err) {
    return { ok: false, detail: `state-file write failed: ${String(err).slice(0, 80)}` };
  }
  // 2) Resolve bin.js.
  const binPath = resolveTeamAgentBinPath();
  if (!binPath) {
    return {
      ok: false,
      detail: "未找到打包后的 bin.js（dev 模式未跑 pnpm build？）；" +
        "向量模型未启动后台预热，PreToolUse 仍可走 legacy substring matcher",
    };
  }
  // 3) Spawn detached. stdio → log file so the parent can return without
  //    inheriting child fds; unref so node event loop can exit cleanly.
  const logPath = path.join(teamagentDir, "warmup.log");
  const { spawn } = await import("node:child_process");
  let logFd: number;
  try {
    logFd = fs.openSync(logPath, "a");
  } catch (err) {
    return { ok: false, detail: `warmup.log open failed: ${String(err).slice(0, 80)}` };
  }
  try {
    const child = spawn(
      process.execPath,
      [binPath, "warmup", "--write-state", stateFile],
      {
        detached: true,
        stdio: ["ignore", logFd, logFd],
      },
    );
    child.unref();
    return {
      ok: true,
      detail: `detached pid=${child.pid ?? "?"} state=${stateFile} log=${logPath}`,
    };
  } catch (err) {
    return { ok: false, detail: `spawn failed: ${String(err).slice(0, 80)}` };
  } finally {
    try { fs.closeSync(logFd); } catch { /* ok if child already inherited */ }
  }
}

function doLoadSeed(
  userGlobalDbPath: string,
  dryRun: boolean,
  explicitSeedPath?: string,
): { step: InitStepResult; addedCount: number; wouldAddCount: number } {
  const seedPath = explicitSeedPath ?? resolveSeedPath();
  if (!seedPath) {
    return {
      step: okStep("load-seed", "未找到 seed/rules.jsonl（开发安装或 tarball 缺失），跳过"),
      addedCount: 0,
      wouldAddCount: 0,
    };
  }
  let entries: KnowledgeEntry[];
  try {
    entries = parseJsonlEntries(seedPath);
  } catch (err) {
    return {
      step: failStep("load-seed", `读取 seed 失败: ${String(err).slice(0, 150)}`),
      addedCount: 0,
      wouldAddCount: 0,
    };
  }

  // Issue #88: also load every `packs/*.jsonl` sibling next to the main
  // seed file. Packs ship rules with substring-friendly `wrong_pattern`s
  // so the legacy keyword matcher can hit within the 30s window before the
  // vector model has been downloaded (ADR 0001 two-stage install).
  // A malformed pack file is logged and skipped — it must not block init.
  const packsDir = path.join(path.dirname(seedPath), "packs");
  if (fs.existsSync(packsDir)) {
    let packFiles: string[];
    try {
      packFiles = fs
        .readdirSync(packsDir)
        .filter((f) => f.endsWith(".jsonl"))
        .sort();
    } catch {
      packFiles = [];
    }
    for (const file of packFiles) {
      try {
        entries.push(...parseJsonlEntries(path.join(packsDir, file)));
      } catch {
        // Skip malformed pack file; continue with remaining packs.
      }
    }
  }

  if (dryRun) {
    return {
      step: okStep("load-seed", `(dry-run) 会注入 ${entries.length} 条打包规则`),
      addedCount: 0,
      wouldAddCount: entries.length,
    };
  }
  try {
    fs.mkdirSync(path.dirname(userGlobalDbPath), { recursive: true });
    const store = new SqliteKnowledgeStore(openDb(userGlobalDbPath));
    let added = 0;
    for (const e of entries) {
      if (store.getById(e.id)) continue;
      try {
        store.add(e);
        added++;
      } catch {
        // schema 异常单条跳过，不阻断整批
      }
    }
    store.close();
    return {
      step: okStep(
        "load-seed",
        `注入打包规则 ${added} 条（总 ${entries.length} 条，${entries.length - added} 条已存在）`,
      ),
      addedCount: added,
      wouldAddCount: entries.length,
    };
  } catch (err) {
    return {
      step: failStep("load-seed", String(err).slice(0, 200)),
      addedCount: 0,
      wouldAddCount: 0,
    };
  }
}

async function doImportRules(
  paths: ReturnType<typeof resolvePaths>,
  opts: InitOptions,
  dryRun: boolean,
  now: () => Date,
): Promise<{ steps: InitStepResult[]; importedCount: number; wouldImport: number }> {
  const steps: InitStepResult[] = [];
  const claudeMdExists = fs.existsSync(paths.claudeMdPath);
  const agentsMdExists =
    fs.existsSync(paths.agentsMdPath) && !isManagedAgentsMdSymlink(paths);
  const cursorRulesPath = path.join(paths.cwd, ".cursorrules");
  const cursorExists = fs.existsSync(cursorRulesPath);

  const rawTexts: string[] = [];
  const scanDetails: string[] = [];
  if (claudeMdExists) {
    const md = fs.readFileSync(paths.claudeMdPath, "utf-8");
    const bullets = extractRuleBullets(md);
    scanDetails.push(`CLAUDE.md: ${bullets.length} bullets`);
    rawTexts.push(...bullets);
  }
  if (agentsMdExists) {
    const md = fs.readFileSync(paths.agentsMdPath, "utf-8");
    const bullets = extractRuleBullets(md);
    scanDetails.push(`AGENTS.md: ${bullets.length} bullets`);
    rawTexts.push(...bullets);
  }
  if (cursorExists) {
    const text = fs.readFileSync(cursorRulesPath, "utf-8");
    const rules = extractCursorRules(text);
    scanDetails.push(`.cursorrules: ${rules.length} rules`);
    rawTexts.push(...rules);
  }
  steps.push(
    okStep(
      "scan-rules",
      scanDetails.length > 0
        ? scanDetails.join(", ")
        : "CLAUDE.md / AGENTS.md / .cursorrules 均不存在，跳过导入",
    ),
  );

  if (rawTexts.length === 0) {
    return {
      steps: [...steps, okStep("structure-rules", "无规则可导入")],
      importedCount: 0,
      wouldImport: 0,
    };
  }

  if (opts.skipImport) {
    steps.push(
      okStep(
        "structure-rules",
        `skipImport=true，跳过（${rawTexts.length} 条规则未导入）`,
      ),
    );
    return { steps, importedCount: 0, wouldImport: rawTexts.length };
  }

  if (dryRun) {
    steps.push(
      okStep(
        "structure-rules",
        `(dry-run) 会 LLM 结构化 ${rawTexts.length} 条规则写入 personal store`,
      ),
    );
    return { steps, importedCount: 0, wouldImport: rawTexts.length };
  }

  const llm = opts.llmClient ?? new ClaudeCodeLLMClient();
  const idGen = opts.idGen ?? (() => defaultIdGen(now));
  try {
    const result = await structureRuleTextsBatch(
      rawTexts,
      (prompt) => llm.complete(prompt),
      { now },
    );
    // Import into personal scope (project DB)
    fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
    const store = new SqliteKnowledgeStore(openDb(paths.projectDbPath));
    let imported = 0;
    for (const { partial } of result.structured) {
      const entry = assembleImported(partial, idGen(), now);
      try {
        store.add(entry);
        imported++;
      } catch {
        // 重复 id 或 schema 异常，跳过
      }
    }
    store.close();
    steps.push(
      okStep(
        "structure-rules",
        `成功导入 ${imported}/${rawTexts.length}（跳过 ${result.skipped}，失败 ${result.failed}）`,
      ),
    );
    return { steps, importedCount: imported, wouldImport: rawTexts.length };
  } catch (err) {
    steps.push(failStep("structure-rules", String(err).slice(0, 200)));
    return { steps, importedCount: 0, wouldImport: rawTexts.length };
  }
}

async function doInstallPlugins(
  dryRun: boolean,
  injected?: ClaudePluginInstaller,
): Promise<InitStepResult> {
  if (dryRun) {
    return okStep(
      "install-plugins",
      "(dry-run) 会注册团队标配 marketplaces + plugins",
    );
  }
  try {
    const opts: Parameters<typeof executeInstallPlugins>[0] = {};
    if (injected) opts.installer = injected;
    const result: InstallPluginsResult = await executeInstallPlugins(opts);
    const s = result.summary;
    const detail = [
      s.added ? `${s.added} 新装` : "",
      s.alreadyPresent ? `${s.alreadyPresent} 已存在` : "",
      s.failed ? `${s.failed} 失败` : "",
    ]
      .filter(Boolean)
      .join("，") || "无事可做";
    return result.ok
      ? okStep("install-plugins", detail)
      : failStep("install-plugins", detail);
  } catch (err) {
    return failStep("install-plugins", String(err).slice(0, 200));
  }
}

function doAuditOrphanShellHooks(cwd: string, dryRun: boolean): InitStepResult {
  if (dryRun) {
    return okStep(
      "audit-orphan-hooks",
      "(dry-run) 会扫描 .claude/hooks/*.sh 检查是否仍被 settings 引用",
    );
  }
  try {
    const orphans = auditOrphanShellHooks(cwd);
    if (orphans.length === 0) {
      return okStep("audit-orphan-hooks", "无孤儿 .sh");
    }
    // Soft warning — surface in step detail; non-blocking.
    process.stderr.write(
      `[teamagent init] 发现 ${orphans.length} 个未引用的 .claude/hooks/*.sh：\n`,
    );
    for (const o of orphans) {
      process.stderr.write(`  - ${o}\n`);
    }
    process.stderr.write(
      "  这些脚本不在 settings.json 或 settings.local.json 中。可能是历史遗留或用户自定义。\n",
    );
    return {
      step: "audit-orphan-hooks",
      status: "ok",
      detail: `⚠️  发现 ${orphans.length} 个孤儿 .sh: ${orphans.join(", ")}`,
    };
  } catch (err) {
    return failStep("audit-orphan-hooks", String(err).slice(0, 200));
  }
}

/**
 * Issue #284 slice 1: write the two repo-committed enforcement artifacts:
 * - `.teamagent/required.json` (schema/config consumed by `required-check`)
 * - `.claude/hooks/check-teamagent.sh` (bash hook script Claude can invoke
 *   from `.claude/settings.json`; wiring that entry into settings.json is
 *   slice 2 scope).
 * Idempotent: re-runs that find byte-identical content do not rewrite the
 * file (no mtime bump, no temp-file churn).
 */
function doWriteRequiredArtifacts(
  cwd: string,
  dryRun: boolean,
): InitStepResult {
  if (dryRun) {
    return okStep(
      "write-required-artifacts",
      "(dry-run) 会写入 .teamagent/required.json 与 .claude/hooks/check-teamagent.sh",
    );
  }
  try {
    const reqPath = path.join(cwd, ".teamagent", "required.json");
    const shPath = path.join(cwd, ".claude", "hooks", "check-teamagent.sh");
    const reqContent =
      JSON.stringify(REQUIRED_JSON_CONTENT, null, 2) + "\n";
    const shContent = CHECK_TEAMAGENT_SH_CONTENT;
    const reqWritten = writeManagedFile(reqPath, reqContent);
    const shWritten = writeManagedFile(shPath, shContent);
    if (shWritten) {
      try {
        fs.chmodSync(shPath, 0o755);
      } catch {
        // Windows / sandboxed FS — best-effort; the JSON-on-stdout hook
        // contract still works when interpreter is invoked explicitly.
      }
    }
    const parts: string[] = [];
    parts.push(
      reqWritten
        ? `已写入 ${path.relative(cwd, reqPath)}`
        : `${path.relative(cwd, reqPath)} 已是最新`,
    );
    parts.push(
      shWritten
        ? `已写入 ${path.relative(cwd, shPath)}`
        : `${path.relative(cwd, shPath)} 已是最新`,
    );
    return okStep("write-required-artifacts", parts.join(" · "));
  } catch (err) {
    return failStep(
      "write-required-artifacts",
      String(err).slice(0, 200),
    );
  }
}

/**
 * Atomic + idempotent file write. Returns true when the file was written
 * (i.e. content differed from what was on disk), false when the on-disk
 * content already matched byte-for-byte.
 *
 * Robustness:
 * - Read step tolerates the file being deleted between the existsSync
 *   probe and the read (TOCTOU window); ENOENT falls through to the
 *   write path. Other errors propagate.
 * - Tmp-file write step uses try/finally to unlink the tmp partial
 *   artifact if `writeFileSync` or `renameSync` throws (disk full,
 *   permission revoked) — avoids leaving `.tmp.<pid>.<ts>` orphans on
 *   the user's filesystem.
 */
function writeManagedFile(absPath: string, content: string): boolean {
  if (fs.existsSync(absPath)) {
    let existing: string | null = null;
    try {
      existing = fs.readFileSync(absPath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
    }
    if (existing === content) return false;
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp.${process.pid}.${Date.now()}`;
  let renamed = false;
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, absPath);
    renamed = true;
  } finally {
    if (!renamed) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // tmp may not exist (writeFileSync threw before creating it); nothing to clean.
      }
    }
  }
  return true;
}

function doInstallHook(
  cwd: string,
  hookEntry: string | undefined,
  dryRun: boolean,
  userLevel: boolean,
): InitStepResult {
  if (dryRun) {
    const dest = userLevel
      ? `${path.join(cwd, ".claude", "settings.local.json")} + ~/.claude/settings.json`
      : path.join(cwd, ".claude", "settings.local.json");
    return okStep("install-hook", `(dry-run) 会写入 ${dest}`);
  }
  try {
    const r = installHook({
      cwd,
      ...(hookEntry ? { hookEntry } : {}),
      userLevel,
    });
    const parts: string[] = [];
    parts.push(r.alreadyInstalled ? `已安装 (无变化): ${r.settingsPath}` : `已注册: ${r.settingsPath}`);
    if (userLevel) {
      // Issue #161 — viral install path also writes ~/.claude/settings.json so
      // Claude Code launched from sub-directories still picks up project hooks.
      parts.push("已写入用户级 ~/.claude/settings.json (Issue #161 viral install)");
    }
    if (r.statusLineSkipped) {
      parts.push("⚠️  statusLine bundle 缺失，未注册");
    } else if (r.statusLineMergedScope) {
      parts.push(
        `已合并已有 statusLine (scope=${r.statusLineMergedScope}) → 用户原内容 + TeamBrain 状态栏会同时渲染`,
      );
    }
    return okStep("install-hook", parts.join(" · "));
  } catch (err) {
    return failStep("install-hook", String(err).slice(0, 200));
  }
}

async function doCompileSkills(
  paths: ReturnType<typeof resolvePaths>,
  dryRun: boolean,
): Promise<InitStepResult> {
  if (dryRun) {
    return okStep(
      "compile-skills",
      `(dry-run) 会把 stable+ 条目导出到 ${paths.skillsDir}`,
    );
  }
  try {
    fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
    fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });
    const store = new DualLayerStore({
      projectDbPath: paths.projectDbPath,
      userGlobalDbPath: paths.userGlobalDbPath,
    });
    const all = store.getAll();
    await runCompile({
      store,
      skillCompiler: makeSkillCompiler({ skillsDir: paths.skillsDir }),
    });
    store.close();
    return okStep(
      "compile-skills",
      `已导出 ${all.length} 条候选规则到 Skills；CLAUDE.md 规则块输出已禁用`,
    );
  } catch (err) {
    return failStep("compile-skills", String(err).slice(0, 200));
  }
}

/**
 * Allowed shape of a project-level skill directory name. Matches the
 * convention used by `.claude/skills/<id>/SKILL.md` (lowercase, digits,
 * hyphens; max 64 chars). Used to refuse `..`, slashes, or any
 * input-driven skillId from a future caller.
 */
const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Mirror a project-level skill at `.claude/skills/<skillId>/SKILL.md` to the
 * user-level skills dir. Designed so future per-skill mirrors (e.g. another
 * routing skill) can call this directly without copy-pasting fs logic.
 *
 * Failure is intentionally non-fatal — see C2 (issue #218) for why.
 *
 * skillId MUST match SKILL_ID_PATTERN — defends against path traversal if
 * a future caller derives skillId from config/seed/CLI input instead of a
 * hard-coded literal.
 */
export function mirrorProjectSkillToUserLevel(
  skillId: string,
  stepKey: string,
  paths: ReturnType<typeof resolvePaths>,
  dryRun: boolean,
): InitStepResult {
  if (!SKILL_ID_PATTERN.test(skillId)) {
    return failStep(
      stepKey,
      `invalid skillId "${skillId.slice(0, 32)}" — must match ${SKILL_ID_PATTERN}`,
    );
  }
  const sourcePath = path.join(
    paths.cwd,
    ".claude",
    "skills",
    skillId,
    "SKILL.md",
  );
  const targetPath = path.join(paths.skillsDir, skillId, "SKILL.md");

  if (!fs.existsSync(sourcePath)) {
    return {
      step: stepKey,
      status: "skipped",
      detail: `源 .claude/skills/${skillId}/SKILL.md 不存在（仅 TeamBrain 仓库需要）`,
    };
  }

  if (dryRun) {
    return okStep(
      stepKey,
      `(dry-run) 会复制 ${sourcePath} → ${targetPath}`,
    );
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    return okStep(stepKey, `已复制到 ${targetPath}（用户级 FIXEDFLOW 入口）`);
  } catch (err) {
    // Cosmetic mirror failure (e.g. $HOME read-only, disk full) must NOT
    // flip result.ok=false (line 517 aggregates `!steps.some(failed)`).
    // If it did, the success message AND the FIXEDFLOW banner this step
    // is meant to advertise would both get suppressed — exactly the
    // outcome the grill spec guarded against with "失败不 fatal". Use
    // okStep with a warning prefix so the failure is reported but
    // non-fatal.
    return okStep(
      stepKey,
      `⚠️ 镜像失败但 init 继续（cosmetic）: ${String(err).slice(0, 160)}`,
    );
  }
}

function doMirrorClaimToMergeSkill(
  paths: ReturnType<typeof resolvePaths>,
  dryRun: boolean,
): InitStepResult {
  return mirrorProjectSkillToUserLevel(
    CLAIM_TO_MERGE_SKILL_ID,
    MIRROR_CLAIM_STEP,
    paths,
    dryRun,
  );
}

/**
 * Mirror the four static user-level skills (per `docs/INIT-PROPAGATION.md`)
 * to top-level `~/.claude/skills/<name>/SKILL.md` and
 * `~/.codex/skills/<name>/SKILL.md`. Distinct from
 * `doMirrorClaimToMergeSkill` (which targets a teamagent-namespaced dir).
 *
 * Plan computed by pure `planStaticUserSkillInstall` from @teamagent/core.
 * This shell does the actual fs writes, honoring:
 * - skip-existing (don't overwrite user customizations)
 * - target filter (`--target=claude` / `--target=codex`)
 * - dry-run (preview only)
 *
 * Failure is non-fatal — same rationale as `mirrorProjectSkillToUserLevel`.
 */
function doMirrorStaticUserSkills(
  paths: ReturnType<typeof resolvePaths>,
  target: InitOptions["target"],
  dryRun: boolean,
): InitStepResult {
  const targets: StaticUserSkillTarget[] = [];
  if (targetIncludesClaude(target)) targets.push("claude");
  if (targetIncludesCodex(target)) targets.push("codex");

  const plan = planStaticUserSkillInstall({
    homeDir: paths.home,
    fileExists: (p) => fs.existsSync(p),
    joinPath: path.join,
    targets,
  });

  let createdCount = 0;
  let skipExistingCount = 0;
  let skipDisabledCount = 0;
  const writeErrors: string[] = [];

  for (const entry of plan) {
    if (entry.action === "skip-disabled") {
      skipDisabledCount++;
      continue;
    }
    if (entry.action === "skip-exists") {
      skipExistingCount++;
      continue;
    }
    if (dryRun) {
      createdCount++;
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(entry.destPath), { recursive: true });
      fs.writeFileSync(entry.destPath, entry.content, "utf-8");
      createdCount++;
    } catch (err) {
      writeErrors.push(`${entry.skill}/${entry.target}: ${String(err).slice(0, 80)}`);
    }
  }

  const summary = `created=${createdCount} skip-exists=${skipExistingCount} skip-disabled=${skipDisabledCount}`;

  if (writeErrors.length > 0) {
    return okStep(
      STATIC_USER_SKILLS_STEP,
      `⚠️ 部分镜像失败但 init 继续: ${summary}; errors=${writeErrors.join("; ").slice(0, 200)}`,
    );
  }
  if (dryRun) {
    return okStep(
      STATIC_USER_SKILLS_STEP,
      `(dry-run) 会镜像 ${createdCount} 个静态用户级 skill（${summary}）`,
    );
  }
  return okStep(STATIC_USER_SKILLS_STEP, `已镜像静态用户级 skills：${summary}`);
}

/**
 * Append the FIXEDFLOW guidance banner (issue #218) to the given line buffer.
 * Doc paths come from FIXEDFLOW_BANNER_DOC_PATHS so the path-exists unit test
 * stays in sync with the banner content.
 */
function appendFixedflowBanner(lines: string[]): void {
  lines.push("━".repeat(36));
  lines.push("🌊 FIXEDFLOW — 本仓库 issue → merged code 的唯一路径");
  lines.push("━".repeat(36));
  lines.push("");
  lines.push("  产品特性");
  lines.push("    你写 ≤50 字 issue + 贴 grill 评论 + 加 grill-ready label。");
  lines.push("    maintainer 在 Claude Code 里手动跑 /fixed-flow-driver skill:");
  lines.push("    worktree → 实现 → /review fix-loop（循环至 PASS）→ 普通 PR →");
  lines.push("    squash-merge → 清理。无 watcher / 无后台轮询 / 无自动 dispatch。");
  lines.push("    /review 出 issue 时强制走 PR-PLAN（禁开 follow-up issue）；");
  lines.push("    POSTPR 仅 squash-merge（禁 --merge / --rebase）。");
  lines.push("");
  lines.push("  快速验证（复制运行）");
  lines.push(
    '    claudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, who triggers step 3"',
  );
  lines.push("");
  lines.push("  详情");
  lines.push(`    ${FIXEDFLOW_BANNER_DOC_PATHS[0]} (TL;DR routing)`);
  lines.push(
    `    ${FIXEDFLOW_BANNER_DOC_PATHS[1]} / ${FIXEDFLOW_BANNER_DOC_PATHS[2]} / ${FIXEDFLOW_BANNER_DOC_PATHS[3]} (canonical)`,
  );
  lines.push("");
}

function doLinkCodexFiles(
  paths: ReturnType<typeof resolvePaths>,
  dryRun: boolean,
): InitStepResult {
  const links = [
    {
      linkPath: path.join(paths.cwd, ".codex", "skills"),
      targetPath: paths.skillsDir,
      label: ".codex/skills -> TeamAgent skills",
      targetType: "dir" as const,
    },
  ];

  if (dryRun) {
    return okStep(
      "link-codex-files",
      `(dry-run) 会创建软链接: ${links.map((l) => l.label).join(", ")}；会清理旧 TeamAgent AGENTS.md 软链接（如存在）`,
    );
  }

  try {
    const details: string[] = [];
    const cleanupState = cleanupManagedAgentsMdSymlink(paths);
    if (cleanupState !== "not-needed") {
      details.push(`AGENTS.md legacy link (${cleanupState})`);
    }
    for (const link of links) {
      fs.mkdirSync(path.dirname(link.linkPath), { recursive: true });
      fs.mkdirSync(path.dirname(link.targetPath), { recursive: true });
      if (link.targetType === "dir") {
        fs.mkdirSync(link.targetPath, { recursive: true });
      }
      const state = ensureSymlink(link.linkPath, link.targetPath, link.targetType, () => new Date());
      details.push(`${link.label} (${state})`);
    }
    return okStep("link-codex-files", `已确保软链接: ${details.join(", ")}`);
  } catch (err) {
    return failStep("link-codex-files", String(err).slice(0, 200));
  }
}

/**
 * Issue #291: install project-level Codex hooks to the user's `~/.codex/`.
 *
 * Source of truth: `<project>/.codex/hooks.json` + `<project>/.codex/hooks/*.sh`
 * (committed to repo, contains TeamAgent-owned event registrations).
 *
 * What this function does:
 *   1. Read every hook block from the project `.codex/hooks.json`.
 *   2. Stage each referenced `.codex/hooks/<name>.sh` script into
 *      `~/.teamagent/hooks/codex/<name>.sh` (parallel to Claude's
 *      `~/.teamagent/hooks/bin-*.cjs` staging).
 *   3. Rewrite each command in the loaded hook config to point at the
 *      staged absolute path (so the user-level hooks.json works regardless
 *      of `CODEX_PROJECT_DIR`).
 *   4. Tag each event block with `_teamagentTag: "teamagent:codex-<event>:v1"`
 *      so re-runs can dedup our entries without touching user-authored ones.
 *   5. Merge into `~/.codex/hooks.json`:
 *      - File absent → write transformed config verbatim.
 *      - File present → for each event, strip blocks whose
 *        `_teamagentTag` starts with `teamagent:codex-`, then append fresh
 *        blocks; preserves all untagged user entries.
 *
 * Grill §15 verdict: idempotent + no clobber, structured merge.
 * Grill §14: failure here is a non-fatal step in the default mode; --strict
 * upgrades it to a hard fail. The default-mode part is wired here (return
 * failStep, don't throw); the --strict gating lives in `finalize()`.
 *
 * Out of scope (deferred to follow-up issues, see PR notes):
 *   - `.teamagent/init-state.json` with `installer_version` + `hook_config_hash`
 *     (grill §15 enhancement — current per-entry tag + content-based diff is
 *     sufficient for #291 acceptance).
 *   - `--strict` exit-code wiring beyond returning step status (CLI bin entry
 *     wires that based on summary).
 *   - `--json` output formatter (CLI bin entry concern, not executeInit).
 *   - `teamagent doctor --target=codex` probe (sibling diagnostic, separate
 *     installer signal).
 */
function doInstallCodexHooks(
  paths: ReturnType<typeof resolvePaths>,
  dryRun: boolean,
): InitStepResult {
  const projectHooksPath = path.join(paths.cwd, ".codex", "hooks.json");
  if (!fs.existsSync(projectHooksPath)) {
    return okStep(
      "install-codex-hook",
      "项目无 .codex/hooks.json — Codex hook 跳过（用户可手动添加后再 init）",
    );
  }

  const userCodexDir = path.join(paths.home, ".codex");
  const userCodexHooksPath = path.join(userCodexDir, "hooks.json");
  const stagedHooksDir = path.join(paths.home, ".teamagent", "hooks", "codex");

  let projectConfig: CodexHooksConfig;
  try {
    projectConfig = JSON.parse(
      fs.readFileSync(projectHooksPath, "utf-8"),
    ) as CodexHooksConfig;
  } catch (err) {
    return failStep(
      "install-codex-hook",
      `解析 .codex/hooks.json 失败: ${String(err).slice(0, 200)}`,
    );
  }
  if (!projectConfig.hooks || typeof projectConfig.hooks !== "object") {
    return failStep(
      "install-codex-hook",
      ".codex/hooks.json 缺少 .hooks 字段或类型错",
    );
  }

  if (dryRun) {
    const eventCount = Object.keys(projectConfig.hooks).length;
    return okStep(
      "install-codex-hook",
      `(dry-run) 会暂存 .codex/hooks/*.sh 到 ${stagedHooksDir} 并 merge ${eventCount} 个 event 到 ${userCodexHooksPath}`,
    );
  }

  // Stage *.sh from project's .codex/hooks/ into user-level. Walk the project
  // dir rather than the JSON references so a future hook script that's not
  // yet wired into hooks.json still gets staged (defensive).
  const stagedScripts: string[] = [];
  try {
    fs.mkdirSync(stagedHooksDir, { recursive: true });
    const projectScriptsDir = path.join(paths.cwd, ".codex", "hooks");
    if (fs.existsSync(projectScriptsDir)) {
      for (const name of fs.readdirSync(projectScriptsDir)) {
        if (!name.endsWith(".sh")) continue;
        const src = path.join(projectScriptsDir, name);
        const dst = path.join(stagedHooksDir, name);
        fs.copyFileSync(src, dst);
        // Best-effort chmod +x on POSIX. Windows ignores chmod silently —
        // the user-level hooks.json invokes the script via `bash <path>`
        // (matching the project's existing pattern), so executable bit is
        // not load-bearing on Windows.
        try {
          fs.chmodSync(dst, 0o755);
        } catch {
          /* Windows / non-POSIX — bash <path> still works */
        }
        stagedScripts.push(name);
      }
    }
  } catch (err) {
    return failStep(
      "install-codex-hook",
      `暂存 .codex/hooks/*.sh 到 ${stagedHooksDir} 失败: ${String(err).slice(0, 200)}`,
    );
  }

  // Transform: rewrite each command's bash-script path to the staged absolute
  // path, add _teamagentTag per event block. Project script names referenced
  // via `bash "$root/.codex/hooks/<name>.sh"` get rewritten to
  // `bash "<staged>/<name>.sh"`.
  const transformed: CodexHooksConfig["hooks"] = {};
  for (const [event, blocks] of Object.entries(projectConfig.hooks)) {
    if (!Array.isArray(blocks)) continue;
    transformed[event] = blocks.map((b) => ({
      ...(b.matcher !== undefined ? { matcher: b.matcher } : {}),
      hooks: (b.hooks ?? []).map((h) => ({
        ...h,
        command: rewriteCodexHookCommand(h.command ?? "", stagedHooksDir),
      })),
      _teamagentTag: `teamagent:codex-${event}:v1`,
    }));
  }

  // Merge with existing user config. Strip our previously-tagged blocks per
  // event, append fresh transformed ones, preserve everything else.
  let userConfig: CodexHooksConfig = { hooks: {} };
  if (fs.existsSync(userCodexHooksPath)) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(userCodexHooksPath, "utf-8"),
      ) as CodexHooksConfig;
      if (parsed.hooks && typeof parsed.hooks === "object") {
        userConfig = parsed;
      }
    } catch (err) {
      // User file is unparseable — back it up rather than clobber. Grill §15.
      const backup = `${userCodexHooksPath}.bak-teamagent-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      try {
        fs.renameSync(userCodexHooksPath, backup);
      } catch {
        return failStep(
          "install-codex-hook",
          `用户 hooks.json 解析失败且无法 backup: ${String(err).slice(0, 200)}`,
        );
      }
    }
  }
  userConfig.hooks ??= {};

  const allEvents = new Set([
    ...Object.keys(userConfig.hooks ?? {}),
    ...Object.keys(transformed),
  ]);
  const mergedHooks: CodexHooksConfig["hooks"] = {};
  let removedCount = 0;
  let addedCount = 0;
  for (const event of allEvents) {
    const existing = (userConfig.hooks?.[event] ?? []).filter((b) => {
      if (typeof b._teamagentTag === "string" && b._teamagentTag.startsWith("teamagent:codex-")) {
        removedCount += 1;
        return false;
      }
      return true;
    });
    const fresh = transformed[event] ?? [];
    addedCount += fresh.length;
    const combined = [...existing, ...fresh];
    if (combined.length > 0) {
      mergedHooks[event] = combined;
    }
  }
  const merged: CodexHooksConfig = { ...userConfig, hooks: mergedHooks };

  try {
    fs.mkdirSync(userCodexDir, { recursive: true });
    fs.writeFileSync(
      userCodexHooksPath,
      JSON.stringify(merged, null, 2) + "\n",
      "utf-8",
    );
  } catch (err) {
    return failStep(
      "install-codex-hook",
      `写 ${userCodexHooksPath} 失败: ${String(err).slice(0, 200)}`,
    );
  }

  const preservedUntagged =
    Object.values(mergedHooks).reduce((acc, blocks) => acc + blocks.length, 0) -
    addedCount;
  return okStep(
    "install-codex-hook",
    `Codex hook 已写到 ${userCodexHooksPath} (events=${Object.keys(transformed).length}, scripts=${stagedScripts.length}, replaced-old-teamagent=${removedCount}, added=${addedCount}, preserved-user=${preservedUntagged})`,
  );
}

interface CodexHookEntryRaw {
  type?: string;
  command?: string;
  timeout?: number;
}
interface CodexHookBlock {
  matcher?: string;
  hooks?: CodexHookEntryRaw[];
  _teamagentTag?: string;
}
interface CodexHooksConfig {
  hooks?: Record<string, CodexHookBlock[]>;
  [other: string]: unknown;
}

/**
 * Rewrite a project-level Codex hook `command` string so its `bash "$root/.codex/hooks/<name>.sh"`
 * fragment points to the user-level staged copy under `<stagedHooksDir>/<name>.sh`.
 *
 * Project pattern (verbatim from `.codex/hooks.json` committed by #290):
 *   `repo="${CODEX_PROJECT_DIR:-$PWD}"; root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$repo"); bash "$root/.codex/hooks/<name>.sh"`
 *
 * Rewritten user pattern:
 *   `bash "<stagedHooksDir>/<name>.sh"`
 *
 * The user-level form drops the dynamic repo-root resolution because the
 * staged script lives at a fixed home-relative path that every project
 * shares. If the command does not match the project pattern (e.g., user
 * customized it), the original string is returned unchanged.
 */
function rewriteCodexHookCommand(cmd: string, stagedHooksDir: string): string {
  const match = cmd.match(/bash\s+"\$root\/\.codex\/hooks\/([\w.-]+\.sh)"/);
  // match[1] is the capture group — TS sees `string | undefined` for tuple
  // index access; the regex shape guarantees it's defined whenever match is
  // truthy, but the explicit guard satisfies strict-mode tsc.
  const scriptName = match?.[1];
  if (!scriptName) return cmd;
  // Use forward slashes for cross-platform bash compatibility (Git Bash
  // tolerates both, but `\\` triggers bash escape interpretation on Windows).
  const stagedPath = path.join(stagedHooksDir, scriptName).replace(/\\/g, "/");
  return `bash "${stagedPath}"`;
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
  fs.symlinkSync(relativeTarget, linkPath, targetType === "dir" ? "junction" : "file");
  return "created";
}

function symlinkTargetAbs(linkPath: string): string | undefined {
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return undefined;
    const current = fs.readlinkSync(linkPath);
    return path.resolve(path.dirname(linkPath), current);
  } catch {
    return undefined;
  }
}

function pathIsInsideOrEqual(candidate: string, root: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isManagedAgentsMdSymlink(paths: ReturnType<typeof resolvePaths>): boolean {
  const target = symlinkTargetAbs(paths.agentsMdPath);
  if (!target) return false;
  return (
    target === paths.claudeMdPath ||
    pathIsInsideOrEqual(target, path.join(paths.home, ".claude", "teamagent"))
  );
}

function cleanupManagedAgentsMdSymlink(
  paths: ReturnType<typeof resolvePaths>,
): "removed" | "not-needed" {
  if (!isManagedAgentsMdSymlink(paths)) return "not-needed";
  fs.unlinkSync(paths.agentsMdPath);
  return "removed";
}

function appendInstallLog(
  logPath: string,
  steps: InitStepResult[],
  now: () => Date,
): void {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = { ts: now().toISOString(), steps };
  fs.appendFileSync(logPath, JSON.stringify(payload) + "\n", "utf-8");
}

function assembleImported(
  partial: Partial<KnowledgeEntry>,
  id: string,
  now: () => Date,
): KnowledgeEntry {
  const confidence = partial.confidence ?? DEFAULT_IMPORT_CONFIDENCE;
  const nature = (partial.nature ?? "subjective") as "objective" | "subjective";
  const nowIso = now().toISOString();
  return {
    id,
    scope: { level: "personal" },
    category: partial.category ?? "E",
    tags: partial.tags ?? [],
    type: partial.type ?? "practice",
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
    source: "imported",
    conflict_with: [],
    current_tier: "experimental" as const,
    max_tier_ever: "experimental" as const,
    tier_entered_at: "",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
  };
}

function defaultIdGen(now: () => Date): string {
  const ts = now().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8);
  return `pers-${ts}-${rand}`;
}

function okStep(step: string, detail: string): InitStepResult {
  return { step, status: "ok", detail };
}
function failStep(step: string, detail: string): InitStepResult {
  return { step, status: "failed", detail };
}
function emptySummary() {
  return { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 };
}
function finalize(
  ok: boolean,
  dryRun: boolean,
  steps: InitStepResult[],
  summary: InitResult["summary"],
  packPrompt = "",
): InitResult {
  return { ok, dryRun, steps, summary, packPrompt };
}

// CLI glue

export function parseInitArgs(argv: string[]): InitOptions {
  const opts: InitOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--skip-import") opts.skipImport = true;
    else if (a === "--skip-hook") opts.skipHook = true;
    else if (a === "--skip-seed") opts.skipSeed = true;
    else if (a === "--no-user-level-hook") opts.userLevelHook = false;
    else if (a === "--force-nested-init") opts.force = true;
    else if (a === "--skip-warmup") opts.skipWarmup = true;
    else if (a === "--install-plugins") opts.installPlugins = true;
    else if (a === "--codex") opts.target = "codex";
    else if (a === "--claude") opts.target = "claude";
    else if (a === "--both") opts.target = "both";
    else if (a === "--target") {
      const value = argv[++i];
      opts.target = parseTarget(value);
    } else if (a.startsWith("--target=")) {
      opts.target = parseTarget(a.slice("--target=".length));
    } else if (a === "--pack") {
      const value = argv[++i];
      if (!value)
        throw new Error("--pack 需要 <all|name1,name2> 值");
      opts.pack = value;
    } else if (a.startsWith("--pack=")) {
      opts.pack = a.slice("--pack=".length);
    } else if (a === "--cwd") {
      opts.cwd = parsePathArg("--cwd", argv[++i]);
    } else if (a.startsWith("--cwd=")) {
      opts.cwd = parsePathArg("--cwd", a.slice("--cwd=".length));
    } else if (a === "--home") {
      opts.homeDir = parsePathArg("--home", argv[++i]);
    } else if (a.startsWith("--home=")) {
      opts.homeDir = parsePathArg("--home", a.slice("--home=".length));
    } else if (a.startsWith("--")) {
      process.stderr.write(`teamagent init: 忽略未知 flag ${a}\n`);
    }
  }
  return opts;
}

function parsePathArg(flag: "--cwd" | "--home", value: string | undefined): string {
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} 需要 <path> 值`);
  }
  return value;
}

function parseTarget(value: string | undefined): NonNullable<InitOptions["target"]> {
  if (value === "claude" || value === "codex" || value === "both") return value;
  throw new Error(`--target 必须是 claude|codex|both，收到: ${value ?? ""}`);
}

export function renderInitResult(result: InitResult): string {
  const lines: string[] = [];

  if (result.dryRun) {
    lines.push("⚠️  预览模式（--dry-run）：以下操作不会实际执行\n");
  }

  // Group steps for display. `nested-init-guard` lives in its own top group
  // so that a guard short-circuit doesn't silently emit only the bottom
  // "❌ 安装未完成" footer with no visible reason. friendlyError() preserves
  // the full ancestor-path + --force-nested-init hint.
  const stepGroups: Array<{ icon: string; label: string; stepKeys: string[] }> = [
    { icon: "🛡️", label: "前置守卫", stepKeys: ["nested-init-guard"] },
    { icon: "🔍", label: "检测项目环境", stepKeys: ["detect-stack"] },
    { icon: "📦", label: "初始化知识库", stepKeys: ["pre-check", "create-dirs", "load-preset", "load-seed", "scan-rules", "structure-rules"] },
    { icon: "🔗", label: "注册集成", stepKeys: ["install-hook", "audit-orphan-hooks", "write-required-artifacts"] },
    { icon: "🔌", label: "安装团队标配插件", stepKeys: ["install-plugins"] },
    { icon: "📄", label: "导出 Skills", stepKeys: ["compile-skills", MIRROR_CLAIM_STEP, STATIC_USER_SKILLS_STEP] },
    { icon: "🔗", label: "链接 Codex 文件", stepKeys: ["link-codex-files"] },
    { icon: "📦", label: "Stack packs", stepKeys: ["load-pack", "pack-prompt"] },
  ];

  for (const group of stepGroups) {
    const groupSteps = result.steps.filter((s) => group.stepKeys.includes(s.step));
    if (groupSteps.length === 0) continue;
    lines.push(`${group.icon} ${group.label}...`);
    for (const s of groupSteps) {
      if (s.step === "detect-stack" && s.status === "ok") {
        lines.push(`   技术栈: ${s.detail}`);
      } else if (s.status === "ok") {
        lines.push(`   ✅ ${stepLabel(s.step)}: ${s.detail}`);
      } else if (s.status === "skipped") {
        lines.push(`   ⏭  ${stepLabel(s.step)}: ${s.detail}`);
      } else {
        lines.push(`   ❌ ${stepLabel(s.step)}: ${friendlyError(s.detail)}`);
      }
    }
    lines.push("");
  }

  if (result.ok) {
    // Issue #326 RESCOPE item 6 + 7: FIXEDFLOW banner moves BEFORE the
    // success block so the trailing block is the minimal 5-line
    // "TeamAgent 已就绪 + Next: cd / claude" per grill-spec-acceptance.md
    // §Implementation summary item 6. Plugin tip and post-init what's-new
    // tail are gated behind TEAMAGENT_VERBOSE_INIT (kept in source for
    // doctor / future --verbose-init flag).
    appendFixedflowBanner(lines);

    const verbose = process.env["TEAMAGENT_VERBOSE_INIT"] === "1";
    if (verbose) {
      const hasAnyCompileTarget = result.steps.some(
        (s) => s.step === "compile-skills" || s.step === "link-codex-files",
      );
      const hasClaude =
        result.steps.some(
          (s) => s.step === "install-hook" && !s.detail.includes("target=codex"),
        ) || !hasAnyCompileTarget;
      const hasCodex = result.steps.some((s) => s.step === "link-codex-files");
      lines.push("下一步（verbose）:");
      let next = 1;
      if (hasClaude) lines.push(`  ${next++}. 重新打开 Claude Code（让 hook 生效）`);
      if (hasCodex) lines.push(`  ${next++}. 启动新的 Codex 会话（让 .codex/skills 生效）`);
      lines.push(`  ${next++}. 运行 teamagent doctor 验证安装`);
      lines.push(`  ${next++}. 运行 teamagent stats 查看知识库状态`);
      const pluginsInstalled = result.steps.some(
        (s) => s.step === "install-plugins",
      );
      if (hasClaude && !pluginsInstalled) {
        lines.push("");
        lines.push("💡 团队标配插件（与 .claude/settings.json:enabledPlugins 同步）默认不装");
        lines.push("   需要时运行: teamagent install-plugins");
      }
      lines.push("");
    }

    lines.push("━".repeat(36));
    lines.push("✅ TeamAgent 已就绪");
    lines.push("");
    lines.push("下一步：");
    lines.push("  cd your-project");
    lines.push("  claude");
  } else {
    lines.push("━".repeat(36));
    lines.push("❌ 安装未完成，请修复以上问题后重试");
    lines.push("   运行 teamagent doctor 获取诊断建议");
  }

  // Pack prompt — versioned markdown block consumed by the user's coding agent
  // (Claude Code / Codex) per ADR 0002. Empty when init was invoked with --pack
  // or in dry-run mode.
  if (result.packPrompt && result.packPrompt.length > 0) {
    lines.push("");
    lines.push(result.packPrompt);
  }

  // Issue #225 — post-init "what's new" tail. Gated behind TEAMAGENT_VERBOSE_INIT
  // per issue #326 RESCOPE item 6: success output must be minimal. Function +
  // helpers stay in source so a future --verbose-init flag or `teamagent doctor`
  // can re-surface them; default success path is the 5-line minimal block.
  if (
    result.ok &&
    !result.dryRun &&
    process.env["TEAMAGENT_VERBOSE_INIT"] === "1"
  ) {
    const tail = buildPostInitWhatsNewTail();
    if (tail.length > 0) {
      lines.push(tail);
    }
  }

  return duckifyText(lines.join("\n") + "\n");
}

/**
 * Issue #225 — builds the post-init "🆕 本次新增" tail by reading the bundled
 * CHANGELOG.md and surfacing bullets from the second-newest H2 → newest H2.
 *
 * Returns empty string when:
 *   - CHANGELOG.md cannot be loaded (dev install without bundled copy)
 *   - fewer than 2 version sections exist (nothing to compare)
 *   - no bullets in the range
 *
 * Lives next to renderInitResult so the post-init story stays self-contained;
 * the bullet rendering itself is a pure function in @teamagent/core.
 */
function buildPostInitWhatsNewTail(): string {
  let content = "";
  try {
    content = loadBundledChangelog();
  } catch {
    return "";
  }
  if (!content) return "";
  const versionRe = /^##\s+(?:\[)?(\d+\.\d+\.\d+(?:[.-][\w.]+)?)(?:\])?/gm;
  const versions: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = versionRe.exec(content)) !== null) {
    if (m[1]) versions.push(m[1]);
  }
  if (versions.length < 2) return "";
  const installedVersion = versions[0]!;
  const since = versions[1]!;
  const bullets = parseChangelog(content, since, installedVersion, {
    maxBullets: 7,
  });
  return renderWhatsNewTail({ installedVersion, bullets });
}

function stepLabel(step: string): string {
  const map: Record<string, string> = {
    "nested-init-guard": "嵌套项目守卫",
    "pre-check": "前置检查",
    "detect-stack": "技术栈",
    "create-dirs": "目录创建",
    "load-preset": "预置规则",
    "load-seed": "打包规则",
    "scan-rules": "扫描规则",
    "structure-rules": "导入规则",
    "install-hook": "Hook 注册",
    "audit-orphan-hooks": "孤儿 .sh 审计",
    "write-required-artifacts": "Required 模式产物",
    "install-plugins": "Plugin 安装",
    "compile-skills": "Skills",
    [MIRROR_CLAIM_STEP]: "FIXEDFLOW Skill",
    [STATIC_USER_SKILLS_STEP]: "静态用户级 Skills",
    "link-codex-files": "Codex 软链接",
    "load-pack": "Pack 安装",
    "pack-prompt": "Pack 提示",
  };
  return map[step] ?? step;
}

function friendlyError(raw: string): string {
  if (raw.includes("ENOENT") && raw.includes(".teamagent")) {
    return "无法创建 ~/.teamagent 目录，请检查磁盘权限";
  }
  if (raw.includes("sqlite-vec") || raw.includes("extension")) {
    return "sqlite-vec 扩展加载失败。运行 teamagent doctor 诊断";
  }
  if (raw.includes("CLAUDE.md") && (raw.includes("EACCES") || raw.includes("不可读"))) {
    return "CLAUDE.md 文件不可读，请检查权限";
  }
  // nested-init-guard detail is already user-actionable (carries ancestor path
  // + --force-nested-init hint); never truncate it.
  if (raw.includes("ancestor TeamAgent project")) return raw;
  // For pre-check failures that already have friendly messages, pass through
  if (raw.length < 120) return raw;
  return raw.slice(0, 100) + "...";
}
