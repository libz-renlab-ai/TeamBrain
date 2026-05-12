// packages/cli/src/commands/doctor.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn as nodeSpawn } from "node:child_process";
import { createRequire } from "node:module";
import { openDb } from "@teamagent/adapters";
import {
  planStaticUserSkillInstall,
  STATIC_USER_SKILLS,
  stripLegacyTeamagentBlock,
} from "@teamagent/core";
import { digitalTwinPaths, readLastUploaderError } from "@teamagent/digital-twin";
import { unifiedDiff } from "./doctor-diff.js";
import {
  enumerateInstallTableBundlePaths,
  type InstallTableBundleEntry,
} from "./install-hook.js";

const _require = createRequire(import.meta.url);

export interface DoctorCheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  fix?: string;
}

/**
 * Issue #172: outcome of a single auto-fix attempt. Distinct from
 * `DoctorCheckResult` because the same check can have a "would change file X"
 * preview (dry-run), an "applied + backup at Y" record, or a "fix failed" error.
 */
export interface FixOutcome {
  name: string;
  status: "preview" | "applied" | "skipped" | "error";
  detail: string;
  filePath?: string;
  diff?: string;
  backupPath?: string;
  error?: string;
}

export interface DoctorResult {
  checks: DoctorCheckResult[];
  passed: number;
  failed: number;
  skipped: number;
  allPassed: boolean;
  /** Issue #172: present when opts.fix is true; entries describe each attempted fix. */
  fixOutcomes?: FixOutcome[];
  /** Issue #172: convenience flag — true when opts.fix && opts.dryRun. */
  dryRun?: boolean;
}

export type CodexProbe = (env?: NodeJS.ProcessEnv) => ClaudeProbeResult;
export type McpProbe = (url: string) => Promise<{ reachable: boolean; detail: string }>;

/**
 * Issue #299: re-export the install-table entry shape so tests can construct
 * synthetic enumerations without depending on install-hook.ts internals.
 */
export type InstallTableEntry = InstallTableBundleEntry;
export type InstallTableEnumerator = () => InstallTableEntry[];

/**
 * Issue #280: result of probing whether the SessionStart hook script
 * actually spawns and exits cleanly. `checkHookScript` only verifies
 * the .cjs file is present — a script can exist and still crash on
 * `require()` of a missing transitive dep, leaving SessionStart
 * silently dead while doctor reports ✅.
 */
export interface HookProbeResult {
  exitCode: number | null;
  stderr: string;
  timedOut: boolean;
  spawnError?: string;
}

export type HookProbe = (
  scriptPath: string,
  opts?: { timeoutMs?: number },
) => Promise<HookProbeResult>;

/**
 * Issue #368: probe whether the staged uploader daemon (`~/.teamagent/
 * digital-twin/bin-uploader.cjs`) actually loads. Reuses {@link HookProbeResult}
 * — a non-zero exit / spawn error / timeout (or a `MODULE_NOT_FOUND` on stderr)
 * means the daemon can't run and transcripts will never upload. The probe runs
 * the daemon with `TEAMAGENT_UPLOADER_DRYRUN=1` so it loads every top-level
 * import (the issue #368 bug crashed here) and exits 0 without touching config,
 * the PID lock, or the upload loop.
 */
export type UploaderProbe = (
  binPath: string,
  opts?: { timeoutMs?: number },
) => Promise<HookProbeResult>;

export interface DoctorOptions {
  fix?: boolean;
  /** Issue #172: when true with `fix`, compute fix preview (unified diff) without writing anything. */
  dryRun?: boolean;
  json?: boolean;
  postinstall?: boolean;
  cwd?: string;
  homeDir?: string;
  /** Issue #172: backup destination root; defaults to `<homeDir>/.teamagent/backups`. Test injection point. */
  backupDir?: string;
  claudeProbe?: ClaudeProbe;
  codexProbe?: CodexProbe;
  mcpProbe?: McpProbe;
  /** Issue #280: injectable hook spawn probe for `checkHookSpawn`. Default uses real child_process. */
  hookProbe?: HookProbe;
  /** Issue #368: injectable uploader-daemon spawn probe for `checkDigitalTwinUploader`. Default uses real child_process. */
  uploaderProbe?: UploaderProbe;
  /**
   * Issue #299: injection points for `checkInstallTableBundles`. Tests pass
   * synthetic enumerators + existsFn to avoid touching the real dist tree.
   * Real-world use: defaults walk the live `ALL_CHANNELS` install table and
   * `fs.existsSync`.
   */
  installTableEnumerator?: InstallTableEnumerator;
  bundleExistsFn?: (p: string) => boolean;
}

export function parseDoctorArgs(argv: string[]): DoctorOptions {
  let cwd: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--cwd=")) { cwd = arg.slice("--cwd=".length); break; }
  }
  const cwdIdx = argv.indexOf("--cwd");
  if (cwdIdx !== -1 && argv[cwdIdx + 1] && !argv[cwdIdx + 1]!.startsWith("--")) {
    cwd = argv[cwdIdx + 1];
  }
  return {
    fix: argv.includes("--fix"),
    dryRun: argv.includes("--dry-run"),
    json: argv.includes("--json"),
    postinstall: argv.includes("--postinstall"),
    cwd,
  };
}

/**
 * Issue #172: copy a file to `<backupDir>/<basename>.<ISO-with-safe-chars>.bak`
 * before any destructive write. Returns the absolute backup path.
 *
 * The ISO timestamp has `:` and `.` replaced with `-` so the resulting filename
 * is valid on Windows (which forbids `:` in path components).
 */
export function backupFile(filePath: string, opts: DoctorOptions): string {
  const home = opts.homeDir ?? os.homedir();
  const backupDir = opts.backupDir ?? path.join(home, ".teamagent", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${path.basename(filePath)}.${ts}.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

async function autoFix(check: DoctorCheckResult, opts: DoctorOptions): Promise<FixOutcome> {
  if (check.status !== "fail") {
    return { name: check.name, status: "skipped", detail: "check did not fail" };
  }
  const cwd = opts.cwd ?? process.cwd();
  try {
    if (check.name === "knowledge-db") {
      if (opts.dryRun) {
        return {
          name: check.name,
          status: "preview",
          detail: "将运行 `teamagent init` 创建 knowledge.db（无 prior state，因此跳过 backup）",
        };
      }
      const { executeInit } = await import("./init.js");
      await executeInit({ cwd, skipImport: true });
      return {
        name: check.name,
        status: "applied",
        detail: "已通过 `teamagent init` 创建 knowledge.db",
      };
    } else if (check.name === "hook-registered" || check.name === "hook-script") {
      if (opts.dryRun) {
        return {
          name: check.name,
          status: "preview",
          detail: "将向 .claude/settings.local.json 注册 PreToolUse hook",
        };
      }
      const { installHook } = await import("./install-hook.js");
      installHook({ cwd });
      return {
        name: check.name,
        status: "applied",
        detail: "已向 .claude/settings.local.json 注册 PreToolUse hook",
      };
    } else if (check.name === "claude-md") {
      // B-109: strip the legacy TEAMAGENT:START..END managed block left over
      // from before #63 disabled in-file rule dumps. The new compile path
      // never re-writes it, so dropping the block makes doctor green again.
      // Issue #172: now also backups before write and supports dry-run preview.
      const claudeMdPath = path.join(cwd, "CLAUDE.md");
      if (!fs.existsSync(claudeMdPath)) {
        return {
          name: check.name,
          status: "skipped",
          detail: `CLAUDE.md 不存在: ${claudeMdPath}`,
          filePath: claudeMdPath,
        };
      }
      const before = fs.readFileSync(claudeMdPath, "utf-8");
      const after = stripLegacyTeamagentBlock(before);
      if (after === before) {
        return {
          name: check.name,
          status: "skipped",
          detail: "未检测到 legacy TEAMAGENT 块",
          filePath: claudeMdPath,
        };
      }
      const willDelete = after === "";
      const targetAfter = willDelete ? null : after;

      if (opts.dryRun) {
        return {
          name: check.name,
          status: "preview",
          filePath: claudeMdPath,
          diff: unifiedDiff(claudeMdPath, before, targetAfter),
          detail: willDelete
            ? "将删除 CLAUDE.md（整文件即 legacy 块）"
            : "将剥离 legacy TEAMAGENT 块",
        };
      }

      const backupPath = backupFile(claudeMdPath, opts);
      if (willDelete) {
        fs.unlinkSync(claudeMdPath);
      } else {
        fs.writeFileSync(claudeMdPath, after, "utf-8");
      }
      return {
        name: check.name,
        status: "applied",
        filePath: claudeMdPath,
        backupPath,
        detail: willDelete
          ? "已删除 CLAUDE.md（整文件即 legacy 块）"
          : "已剥离 legacy TEAMAGENT 块",
      };
    }
    return { name: check.name, status: "skipped", detail: "无自动修复" };
  } catch (e) {
    return {
      name: check.name,
      status: "error",
      detail: "自动修复失败",
      error: String(e).slice(0, 200),
    };
  }
}

export async function executeDoctor(opts: DoctorOptions = {}): Promise<DoctorResult> {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.homeDir ?? os.homedir();
  const checks: DoctorCheckResult[] = [];
  const fixOutcomes: FixOutcome[] = [];
  // Issue #172: dry-run is opt-in via `--fix --dry-run`. We never re-run
  // checks after a dry-run autoFix because nothing actually changed.
  const dryRun = !!opts.fix && !!opts.dryRun;

  const tryFix = async (check: DoctorCheckResult): Promise<void> => {
    if (!opts.fix || check.status !== "fail") return;
    const outcome = await autoFix(check, opts);
    fixOutcomes.push(outcome);
  };

  // Check 1: Node.js version
  const nodeCheck = checkNodeVersion();
  checks.push(nodeCheck);
  if (nodeCheck.status === "fail") {
    return finalize(checks, true, opts, fixOutcomes);
  }

  // Check 1b (issue #299): integrity of teamagent's own dist. Walks every
  // install-table entry and verifies the referenced bundle exists at its
  // expected absolute path. Placed early — it has no dependency on Claude
  // Code being installed or knowledge.db existing, and a missing bundle
  // can itself BE the root cause of downstream "hook never runs" reports.
  // Strict (fail-loud, exit non-zero on missing): the silent-skip branch
  // in applyChannelOps is no longer the only line of defense.
  checks.push(
    checkInstallTableBundles(opts.installTableEnumerator, opts.bundleExistsFn),
  );

  // Check 2: Claude Code installed
  const claudeCheck = checkClaudeCode(opts.claudeProbe);
  checks.push(claudeCheck);
  if (claudeCheck.status === "fail") {
    return finalize(checks, true, opts, fixOutcomes);
  }

  // Check 3: sqlite-vec loadable
  checks.push(checkSqliteVec());

  // Check 4: ~/.teamagent/ writable
  const homeCheck = checkHomeDir(home);
  checks.push(homeCheck);
  if (homeCheck.status === "fail") {
    return finalize(checks, true, opts, fixOutcomes);
  }

  // Check 5: knowledge.db exists
  const dbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const dbCheck = checkKnowledgeDb(dbPath);
  checks.push(dbCheck);
  await tryFix(dbCheck);
  // Issue #172: parity with the original `--fix` flow — when fix is enabled
  // (real or dry-run), continue through subsequent checks even if the DB is
  // still failing. Dry-run preview lists every would-be fix; real --fix falls
  // through because executeInit/installHook already mutated state.
  if (dbCheck.status === "fail" && !opts.fix) {
    checks.push(skip("hook-registered", "knowledge.db 先修"));
    checks.push(skip("hook-script", "knowledge.db 先修"));
    return finalize(checks, false, opts, fixOutcomes);
  }

  // Check 6: Hook registered
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");
  const userSettingsPath = path.join(home, ".claude", "settings.json");
  const hookCheck = checkHookRegistered(settingsPath, userSettingsPath);
  checks.push(hookCheck);
  await tryFix(hookCheck);
  if (hookCheck.status === "fail" && !opts.fix) {
    checks.push(skip("hook-script", "Hook 注册先修"));
    return finalize(checks, false, opts, fixOutcomes);
  }

  // Check 7: Hook script exists
  const hookScriptCheck = checkHookScript(settingsPath);
  checks.push(hookScriptCheck);
  await tryFix(hookScriptCheck);

  // Check 7b (issue #280): real hook spawn — strict.
  // checkHookScript only verifies the .cjs file exists; a script can still
  // crash at module-load on `require()` of a missing transitive dep (#158
  // removed web-tree-sitter et al. from teamagent's dependencies, but the
  // postinstall hook copy was still pulling them in indirectly via
  // bin-session-start's import chain). When that happens, every real
  // SessionStart silently dies — auto-update never runs, analyze
  // learning halts — while doctor reports ✅ green. The hook-spawn probe
  // catches that gap by actually starting the process once with empty
  // stdin (so bin-session-start's parseInput returns null and the hook
  // fast-exits 0 without running auto-init / cleanup / decideAction).
  //
  // Now strict (commit 4 — was warn-only in commit 1): probe failures
  // return `status: "fail"`, flipping allPassed and forcing the user to
  // act. The underlying spawn fix (commit 2: Windows shell:true) and
  // import-graph contract (commit 3: chaos test + extended scan) keep
  // the false-positive rate at zero on healthy installs, so promoting
  // to a strict gate no longer paints green installs red.
  if (hookScriptCheck.status === "pass") {
    checks.push(await checkHookSpawn(hookScriptCheck.detail, opts.hookProbe));
  }

  // Check 8: settings.json scope (project vs user, PreToolUse vs SessionStart)
  checks.push(checkSettingsJsonScope(settingsPath, path.join(home, ".claude", "settings.json")));

  // Check 9: plugin sync (teamagent plugin files present in .claude/plugins)
  checks.push(checkPluginSync(cwd, home));

  // Check 9b: static user-level skills propagated (docs/INIT-PROPAGATION.md).
  // Reports whether the four bundled static skills were mirrored to both
  // ~/.claude/skills/<name>/SKILL.md and ~/.codex/skills/<name>/SKILL.md.
  checks.push(checkStaticUserSkillsPropagated(home));

  // Check 10: codex binary presence
  checks.push(checkCodexBin(opts.codexProbe));

  // Check 11: MCP server reachability
  checks.push(await checkMcpReachability(cwd, opts.mcpProbe));

  // Check 11b (issue #368): staged digital-twin uploader daemon loads.
  // The uploader is spawned by the Stop-hook tap with stdio captured to
  // ~/.teamagent/digital-twin/uploader.log; if the staged bin-uploader.cjs
  // can't load (e.g. an un-bundled require("ulid") → MODULE_NOT_FOUND from a
  // dir with no node_modules) it crashes on every spawn and zero transcripts
  // ever reach the collector — silently, until now. `skip` when digital-twin
  // isn't initialised on this machine.
  checks.push(await checkDigitalTwinUploader(home, opts.uploaderProbe));

  // Check 12: CLAUDE.md is optional human-maintained guidance; generated blocks are deprecated.
  const claudeMdPath = path.join(cwd, "CLAUDE.md");
  const claudeMdCheck = checkClaudeMd(claudeMdPath);
  if (opts.fix && claudeMdCheck.status === "fail") {
    await tryFix(claudeMdCheck);
    if (dryRun) {
      // Dry-run: file unchanged, keep original check result so the user sees
      // the same fail row (the diff is in fixOutcomes).
      checks.push(claudeMdCheck);
    } else {
      checks.push(checkClaudeMd(claudeMdPath));
    }
  } else {
    checks.push(claudeMdCheck);
  }

  // Check 13 (issue #91): vector model warmup state.
  checks.push(await checkVectorModelState(home));

  return finalize(checks, false, opts, fixOutcomes);
}

/**
 * Issue #91: report on the two-stage warmup state. Maps the readiness
 * description into doctor's pass/fail/skip vocabulary so users see a
 * clear "vector_model: ready" / "downloading (X%)" / "failed" row.
 */
async function checkVectorModelState(home: string): Promise<DoctorCheckResult> {
  const { describeWarmupReadiness, defaultWarmupStatePath } = await import(
    "../warmup-state.js"
  );
  const r = describeWarmupReadiness(defaultWarmupStatePath(home));
  if (r.reason === "ready" && r.state) {
    const took = r.state.completed_at && r.state.started_at
      ? new Date(r.state.completed_at).getTime() - new Date(r.state.started_at).getTime()
      : undefined;
    return {
      name: "vector_model",
      status: "pass",
      detail: `ready (${r.state.model})${took ? ` · 预热 ${Math.round(took / 1000)}s` : ""}`,
    };
  }
  if (r.reason === "missing") {
    return {
      name: "vector_model",
      status: "skip",
      detail: "无 warmup 状态文件 (尚未跑过 init/warmup)",
    };
  }
  if (r.reason === "downloading" && r.state) {
    const p = r.state.progress;
    const pct = p && p.total_bytes > 0
      ? Math.min(100, Math.floor((p.loaded_bytes / p.total_bytes) * 100))
      : null;
    const detail = pct !== null
      ? `downloading (${pct}%, ${p!.files_done}/${p!.files_total} files, pid=${r.state.pid})`
      : `downloading (pid=${r.state.pid})`;
    return { name: "vector_model", status: "skip", detail };
  }
  if (r.reason === "stale_downloading" && r.state) {
    return {
      name: "vector_model",
      status: "fail",
      detail: `stale downloading (pid=${r.state.pid} not alive); 跑 \`teamagent warmup\` 重试`,
    };
  }
  if (r.reason === "failed" && r.state) {
    return {
      name: "vector_model",
      status: "fail",
      detail: `failed: ${r.state.error ?? "unknown"}`,
    };
  }
  if (r.reason === "skipped" && r.state) {
    // Issue #160 + #164: warmup short-circuited because vector deps weren't
    // found in node_modules. Post-#164/PR-#227 this should not happen on a
    // clean install (the deps are now in `dependencies`); a skip here means
    // an incomplete install. Substring matcher still works, but semantic
    // matching is unavailable. Reinstalling teamagent restores both.
    return {
      name: "vector_model",
      status: "skip",
      detail: `skipped (vector deps 未在 node_modules 中找到; 重装 teamagent 恢复)`,
    };
  }
  return {
    name: "vector_model",
    status: "fail",
    detail: `state file malformed`,
  };
}

function finalize(
  checks: DoctorCheckResult[],
  earlyExit: boolean,
  opts: DoctorOptions = {},
  fixOutcomes: FixOutcome[] = [],
): DoctorResult {
  // Always report the team-sharing product boundary, including early-return
  // paths such as missing knowledge.db or unregistered hooks. It is independent
  // of local environment health and must stay visible in --json output.
  if (!checks.some((check) => check.name === "team-sharing")) {
    checks.push(checkTeamSharingStatus());
  }
  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const skipped = checks.filter((c) => c.status === "skip").length;
  const result: DoctorResult = {
    checks,
    passed,
    failed,
    skipped,
    allPassed: failed === 0 && !earlyExit,
  };
  if (opts.fix) {
    result.fixOutcomes = fixOutcomes;
    result.dryRun = !!opts.dryRun;
  }
  return result;
}

function skip(name: string, detail: string): DoctorCheckResult {
  return { name, status: "skip", detail };
}

function checkNodeVersion(): DoctorCheckResult {
  const raw = process.version; // e.g. "v22.4.0"
  const major = parseInt(raw.slice(1).split(".")[0] ?? "0", 10);
  if (major >= 22) {
    return { name: "node-version", status: "pass", detail: `${raw}  (需要 ≥ 22)` };
  }
  return {
    name: "node-version",
    status: "fail",
    detail: `${raw} (需要 ≥ 22)`,
    fix: "nvm install 22 && nvm use 22",
  };
}

export interface ClaudeProbeResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export type ClaudeProbe = (env?: NodeJS.ProcessEnv) => ClaudeProbeResult;

const NODE_MODULES_BIN_FRAGMENTS = ["node_modules/.bin", "node_modules\\.bin"] as const;

export function pathContainsNodeModulesBin(p: string): boolean {
  return NODE_MODULES_BIN_FRAGMENTS.some((frag) => p.includes(frag));
}

function firstLine(s: string): string {
  const trimmed = s.trim();
  return trimmed.split("\n")[0] ?? trimmed;
}

const defaultClaudeProbe: ClaudeProbe = (env) => {
  try {
    const stdout = execSync("claude --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: env ?? process.env,
    });
    return { ok: true, stdout, stderr: "" };
  } catch (e) {
    const err = e as { stderr?: string | Buffer; stdout?: string | Buffer; message?: string };
    const stderr = String(err.stderr ?? err.message ?? "");
    const stdout = String(err.stdout ?? "");
    return { ok: false, stdout, stderr };
  }
};

// "broken-stub" = the local pnpm copy of @anthropic-ai/claude-code whose
// postinstall failed to download the platform-native binary. The stub still
// prints a recognizable hint to stderr; that hint is the only reliable signal.
function isBrokenLocalStub(stderr: string): boolean {
  return (
    stderr.includes("claude native binary not installed") ||
    stderr.includes("postinstall did not run") ||
    stderr.includes("@anthropic-ai/claude-code/install.cjs")
  );
}

function envWithoutNodeModulesBin(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv | null {
  const PATH = env.PATH ?? env.Path ?? "";
  if (!PATH) return null;
  const sep = path.delimiter;
  const parts = PATH.split(sep);
  const filtered = parts.filter((p) => !pathContainsNodeModulesBin(p));
  if (filtered.length === parts.length) return null;
  const joined = filtered.join(sep);
  return { ...env, PATH: joined, Path: joined };
}

export function checkClaudeCode(probe: ClaudeProbe = defaultClaudeProbe): DoctorCheckResult {
  const first = probe();
  if (first.ok) {
    return { name: "claude-code", status: "pass", detail: firstLine(first.stdout) };
  }

  if (isBrokenLocalStub(first.stderr)) {
    const cleanEnv = envWithoutNodeModulesBin(process.env);
    if (cleanEnv) {
      const retry = probe(cleanEnv);
      if (retry.ok) {
        return {
          name: "claude-code",
          status: "pass",
          detail: `${firstLine(retry.stdout)} (本地 pnpm 副本损坏，已回退到全局 claude)`,
        };
      }
    }
    return {
      name: "claude-code",
      status: "fail",
      detail: "本地 pnpm 副本未安装原生二进制，且全局 claude 不可用",
      fix: "运行 `node node_modules/@anthropic-ai/claude-code/install.cjs` 修复本地副本，或确保全局 claude 在 PATH 中",
    };
  }

  return {
    name: "claude-code",
    status: "fail",
    detail: "未找到 claude 命令",
    fix: "npm install -g @anthropic-ai/claude-code",
  };
}

function checkSqliteVec(): DoctorCheckResult {
  // sqlite-vec is declared as a dependency of `@teamagent/adapters` and an
  // (optional) peer of the `teamagent` package. The doctor binary lives in
  // `@teamagent/cli`, which does NOT declare it directly — so under pnpm,
  // a naive `require("sqlite-vec")` from doctor.ts may fail simply because
  // pnpm did not symlink the package into cli's node_modules. Try multiple
  // resolution anchors before giving up.
  try {
    _require("sqlite-vec");
    return { name: "sqlite-vec", status: "pass", detail: "加载成功" };
  } catch {
    // Fallback: resolve from sibling packages where sqlite-vec is actually declared.
    const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/, "$1:"));
    const candidates = [
      // packages/cli/.../doctor.ts → walk up to monorepo root
      path.resolve(here, "../../../adapters"),
      path.resolve(here, "../../../teamagent"),
      path.resolve(here, "../../../../adapters"),
      path.resolve(here, "../../../../teamagent"),
    ];
    for (const root of candidates) {
      try {
        _require.resolve("sqlite-vec", { paths: [root] });
        return { name: "sqlite-vec", status: "pass", detail: `加载成功 (resolved via ${path.basename(root)})` };
      } catch {
        // try next
      }
    }
    return {
      name: "sqlite-vec",
      status: "fail",
      detail: "sqlite-vec 扩展加载失败",
      fix: "npm install -g sqlite-vec  （或检查平台是否支持）",
    };
  }
}

function checkHomeDir(home: string): DoctorCheckResult {
  const tDir = path.join(home, ".teamagent");
  try {
    fs.mkdirSync(tDir, { recursive: true });
    const probe = path.join(tDir, `.doctor-probe-${process.pid}`);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
    return { name: "home-dir", status: "pass", detail: `${tDir} 可读写` };
  } catch (e) {
    return {
      name: "home-dir",
      status: "fail",
      detail: `~/.teamagent 不可写: ${String(e).slice(0, 80)}`,
      fix: `chmod 755 ${tDir}`,
    };
  }
}

function checkKnowledgeDb(dbPath: string): DoctorCheckResult {
  if (!fs.existsSync(dbPath)) {
    return {
      name: "knowledge-db",
      status: "fail",
      detail: "知识库未初始化",
      fix: "teamagent init",
    };
  }
  try {
    const db = openDb(dbPath);
    db.close();
    return { name: "knowledge-db", status: "pass", detail: dbPath };
  } catch (e) {
    return {
      name: "knowledge-db",
      status: "fail",
      detail: `knowledge.db 无法打开：${String(e).slice(0, 120)}`,
      fix: "teamagent init  （将重建数据库）",
    };
  }
}

function hasTeamAgentHookInSettings(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const hooks = settings["hooks"] as Record<string, unknown[]> | undefined;
    if (!hooks) return false;
    return Object.values(hooks).some(
      (entries) =>
        Array.isArray(entries) &&
        entries.some(
          (h: unknown) =>
            typeof h === "object" &&
            h !== null &&
            typeof (h as Record<string, unknown>)["_teamagentTag"] === "string" &&
            ((h as Record<string, unknown>)["_teamagentTag"] as string).startsWith("teamagent-"),
        ),
    );
  } catch {
    return false;
  }
}

function checkHookRegistered(settingsPath: string, userSettingsPath?: string): DoctorCheckResult {
  // Project-level settings.local.json takes priority
  if (hasTeamAgentHookInSettings(settingsPath)) {
    return { name: "hook-registered", status: "pass", detail: "PreToolUse Hook 已注册" };
  }
  // Fall back to user-level ~/.claude/settings.json (SessionStart auto-init hook)
  if (userSettingsPath && hasTeamAgentHookInSettings(userSettingsPath)) {
    return { name: "hook-registered", status: "pass", detail: "用户级 Hook 已注册 (teamagent install-user-hook)" };
  }
  if (!fs.existsSync(settingsPath)) {
    return {
      name: "hook-registered",
      status: "fail",
      detail: ".claude/settings.local.json 不存在",
      fix: "teamagent install-hook",
    };
  }
  try {
    JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return {
      name: "hook-registered",
      status: "fail",
      detail: "settings.local.json 中未找到 TeamAgent hook",
      fix: "teamagent install-hook",
    };
  } catch {
    return {
      name: "hook-registered",
      status: "fail",
      detail: "无法解析 settings.local.json",
      fix: "teamagent install-hook",
    };
  }
}

function checkHookScript(settingsPath: string): DoctorCheckResult {
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const hooks = settings["hooks"] as Record<string, unknown> | undefined;
    const pre = hooks?.["PreToolUse"] as unknown[] | undefined;
    const entry = Array.isArray(pre)
      ? (pre.find((h: unknown) => (h as Record<string, unknown>)["_teamagentTag"] === "teamagent-pre-tool-use") as Record<string, unknown> | undefined)
      : undefined;
    const cmds = entry?.["hooks"] as Array<{ command: string }> | undefined;
    const cmd = cmds?.[0]?.command ?? "";
    // Extract file path from: node "path/to/script.cjs"
    const match = cmd.match(/node\s+"?([^"]+)"?/);
    const scriptPath = match?.[1];
    if (!scriptPath || !fs.existsSync(scriptPath)) {
      return {
        name: "hook-script",
        status: "fail",
        detail: `Hook 脚本不存在: ${scriptPath ?? "(未找到路径)"}`,
        fix: "npm install -g teamagent  （重装）",
      };
    }
    return { name: "hook-script", status: "pass", detail: scriptPath };
  } catch {
    return {
      name: "hook-script",
      status: "fail",
      detail: "无法读取 hook 脚本路径",
      fix: "teamagent install-hook",
    };
  }
}

/**
 * Issue #280: default probe that actually spawns the SessionStart hook
 * with empty stdin and no Claude Code signal env vars, expecting the
 * hook's `parseInput` to return null and fast-exit 0. Any non-zero exit,
 * timeout, or spawn error means the hook can't load — usually a missing
 * transitive dep crashing `require()` at module top, which is invisible
 * to `checkHookScript` (the file exists, but the process dies before it
 * can do anything).
 *
 * The probe strips signal env vars (CLAUDE_PROJECT_DIR /
 * TEAMAGENT_ALLOW_BARE_SESSIONSTART) so `parseInput` short-circuits and
 * the hook does not touch auto-init / cleanup / decideAction. We are
 * verifying that all top-level imports load, not that any business logic
 * runs.
 */
const defaultHookProbe: HookProbe = (scriptPath, opts = {}) => {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  return new Promise<HookProbeResult>((resolve) => {
    const env = { ...process.env };
    delete env["CLAUDE_PROJECT_DIR"];
    delete env["TEAMAGENT_ALLOW_BARE_SESSIONSTART"];

    let child;
    try {
      child = nodeSpawn(process.execPath, [scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env,
        windowsHide: true,
      });
    } catch (err) {
      resolve({ exitCode: null, stderr: "", timedOut: false, spawnError: String(err) });
      return;
    }

    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
      resolve({ exitCode: null, stderr, timedOut: true });
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stderr, timedOut: false, spawnError: String(err) });
    });
    child.stderr?.on("data", (d) => { stderr += d.toString("utf-8"); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stderr, timedOut: false });
    });

    // Empty stdin → parseInput returns null → hook fast-exits 0.
    child.stdin?.end();
  });
};

/**
 * Issue #280: strict health check that actually spawns the SessionStart
 * hook script. Returns `pass` when the process starts and exits 0;
 * any failure (spawn error / timeout / non-zero exit) returns
 * `status: "fail"`, which flips `allPassed` and surfaces the regression
 * to the user.
 *
 * Strict since commit 4 of the issue #280 chain. Commit 1 introduced
 * this check as warn-only (`status: "skip"`) so it could ship and be
 * observed before the underlying spawn (commit 2) and import-graph
 * (commit 3) work landed. With those fixes in place, healthy installs
 * have zero false-positive surface, so we promote the gate to strict.
 */
export async function checkHookSpawn(
  scriptPath: string,
  probe: HookProbe = defaultHookProbe,
): Promise<DoctorCheckResult> {
  const result = await probe(scriptPath);
  if (result.spawnError) {
    return {
      name: "hook-spawn",
      status: "fail",
      detail: `hook spawn 启动失败: ${result.spawnError.slice(0, 200)}`,
      fix: "重装 teamagent (npm install -g teamagent) 或检查 node 是否可用",
    };
  }
  if (result.timedOut) {
    return {
      name: "hook-spawn",
      status: "fail",
      detail: `hook spawn 超过 5s 未退出 — 可能卡在 require/import 链`,
      fix: "检查 ~/.teamagent/postinstall.log 中的 stage=install-user-hook 与依赖完整性",
    };
  }
  if (result.exitCode === 0) {
    return {
      name: "hook-spawn",
      status: "pass",
      detail: "hook 进程能成功启动并退出 (probe: empty-stdin → fast-exit 0)",
    };
  }
  const stderrTail = result.stderr.trim().split("\n").slice(-5).join(" | ").slice(-400);
  return {
    name: "hook-spawn",
    status: "fail",
    detail: `hook spawn exit=${result.exitCode} — ${stderrTail || "(no stderr)"}`,
    fix: "重装 teamagent 或检查 ~/.teamagent/postinstall.log",
  };
}

/**
 * Issue #368: default probe that spawns the staged uploader daemon with
 * `TEAMAGENT_UPLOADER_DRYRUN=1` and empty stdin. The dry-run branch runs
 * after every top-level import resolves and exits 0 without touching config
 * or the PID lock — so a non-zero exit / spawn error / timeout means the
 * staged `bin-uploader.cjs` can't load (the issue #368 bug: an un-bundled
 * `require("ulid")` → `MODULE_NOT_FOUND` from a dir with no `node_modules`).
 */
const defaultUploaderProbe: UploaderProbe = (binPath, opts = {}) => {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  return new Promise<HookProbeResult>((resolve) => {
    const env = { ...process.env, TEAMAGENT_UPLOADER_DRYRUN: "1" };
    let child;
    try {
      child = nodeSpawn(process.execPath, [binPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env,
        windowsHide: true,
      });
    } catch (err) {
      resolve({ exitCode: null, stderr: "", timedOut: false, spawnError: String(err) });
      return;
    }
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
      resolve({ exitCode: null, stderr, timedOut: true });
    }, timeoutMs);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stderr, timedOut: false, spawnError: String(err) });
    });
    child.stderr?.on("data", (d) => { stderr += d.toString("utf-8"); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stderr, timedOut: false });
    });
    // The child may exit before we finish writing — swallow the EPIPE so the
    // probe (and `teamagent doctor`) don't crash on a fast-exiting daemon.
    child.stdin?.on("error", () => { /* EPIPE / already closed */ });
    child.stdin?.end();
  });
};

/** Marker the issue #368 build emits into `bin-uploader.cjs` — its presence means the dry-run probe branch exists in the staged binary. */
const UPLOADER_DRYRUN_MARKER = "TEAMAGENT_UPLOADER_DRYRUN";

/**
 * Issue #368: health check for the staged digital-twin uploader daemon.
 * Surfaces a `digital-twin-uploader: OK | BROKEN` line so a silently-crashing
 * uploader (transcripts never reach the collector) is visible.
 *
 * - `skip` — `~/.teamagent/digital-twin/bin-uploader.cjs` not staged yet
 *   (digital-twin not initialised on this machine), OR the staged binary
 *   predates the dry-run probe (issue #368). In the latter case running the
 *   probe would spawn the real `loadConfig → acquirePidLock → mainLoop` upload
 *   path, race the live Stop-hook daemon for the PID lock, then get SIGKILLed
 *   mid-flight — so we don't spawn it; we tell the user to re-stage.
 * - `pass` — the daemon loads and dry-run-exits 0. If `uploader.log` has a
 *   recent error line it's appended as a note (the crash happened before;
 *   the fix may already be in place).
 * - `fail` — spawn error / timeout / non-zero exit / `MODULE_NOT_FOUND` on
 *   stderr. `fix` rebuilds + re-stages the daemon binary.
 *
 * `probe` is injectable for unit tests; production uses {@link defaultUploaderProbe}.
 */
export async function checkDigitalTwinUploader(
  home: string,
  probe: UploaderProbe = defaultUploaderProbe,
): Promise<DoctorCheckResult> {
  const name = "digital-twin-uploader";
  const binPath = path.join(digitalTwinPaths(home).digitalTwinDir, "bin-uploader.cjs");
  if (!fs.existsSync(binPath)) {
    return {
      name,
      status: "skip",
      detail: "digital-twin-uploader: 未安装 (本机未跑过 teamagent init / install-hook)",
    };
  }
  // Pre-#368 staged binaries have no dry-run branch — spawning them runs the
  // real upload loop. Detect via the marker and skip (don't probe) instead.
  let staged = "";
  try {
    staged = fs.readFileSync(binPath, "utf-8");
  } catch (err) {
    return {
      name,
      status: "fail",
      detail: `digital-twin-uploader: BROKEN — 无法读取 ${binPath}: ${String(err).slice(0, 160)}`,
      fix: "pnpm --filter @teamagent/digital-twin build && pnpm teamagent install-hook",
    };
  }
  if (!staged.includes(UPLOADER_DRYRUN_MARKER)) {
    return {
      name,
      status: "skip",
      detail:
        "digital-twin-uploader: 跳过 — 已装的 bin-uploader.cjs 早于本探针 (issue #368)，" +
        "跑 `teamagent install-hook` 重新 stage 后再 doctor 验证",
    };
  }
  const result = await probe(binPath);
  const lastErr = readLastUploaderError(home);
  const moduleNotFound = /MODULE_NOT_FOUND|Cannot find module/i.test(result.stderr);

  if (result.spawnError) {
    return {
      name,
      status: "fail",
      detail: `digital-twin-uploader: BROKEN — spawn 失败: ${result.spawnError.slice(0, 200)}`,
      fix: "node 不可用？检查后重装 teamagent",
    };
  }
  if (result.timedOut) {
    return {
      name,
      status: "fail",
      detail: "digital-twin-uploader: BROKEN — dry-run 超过 5s 未退出 (可能卡在 require/import 链)",
      fix: "pnpm --filter @teamagent/digital-twin build && pnpm teamagent install-hook",
    };
  }
  if (result.exitCode === 0 && !moduleNotFound) {
    return {
      name,
      status: "pass",
      detail:
        "digital-twin-uploader: OK (dry-run 加载了所有 import)" +
        (lastErr ? ` · 注意 uploader.log 有历史错误: ${lastErr.line} (line ${lastErr.lineno})` : ""),
    };
  }
  const stderrTail = result.stderr.trim().split("\n").slice(-5).join(" | ").slice(-400);
  const why = moduleNotFound
    ? `MODULE_NOT_FOUND — ${stderrTail || "(staged bin-uploader.cjs 缺打包依赖)"}`
    : `exit=${result.exitCode} — ${stderrTail || lastErr?.line || "(no stderr)"}`;
  return {
    name,
    status: "fail",
    detail: `digital-twin-uploader: BROKEN — ${why}`,
    fix: "pnpm --filter @teamagent/digital-twin build && pnpm teamagent install-hook",
  };
}

/**
 * Probe whether settings.json hook is at project scope (preferred) or user scope.
 * Reports scope so operators know where the hook fires.
 */
export function checkSettingsJsonScope(
  projectSettingsPath: string,
  userSettingsPath: string,
): DoctorCheckResult {
  const projectHasHook = hasTeamAgentHookInSettings(projectSettingsPath);
  const userHasHook = hasTeamAgentHookInSettings(userSettingsPath);

  if (projectHasHook) {
    return {
      name: "settings-json-scope",
      status: "pass",
      detail: `Hook 已注册在项目级 (.claude/settings.local.json)`,
    };
  }
  if (userHasHook) {
    return {
      name: "settings-json-scope",
      status: "pass",
      detail: `Hook 已注册在用户级 (~/.claude/settings.json)`,
    };
  }
  return {
    name: "settings-json-scope",
    status: "fail",
    detail: "未找到项目级或用户级 settings.json hook",
    fix: "teamagent install-hook",
  };
}

/**
 * Check that teamagent plugin files are present in .claude/plugins (project level)
 * or ~/.claude/plugins (user level). A plugin directory exists if install-plugins ran.
 */
/**
 * Issue (#288, follow-up to #218 + #287): report whether the four static
 * user-level skills documented in `docs/INIT-PROPAGATION.md` were mirrored
 * to both `~/.claude/skills/<name>/SKILL.md` and `~/.codex/skills/<name>/SKILL.md`.
 *
 * Status semantics:
 * - `pass` — every (skill, target) destination file exists.
 * - `fail` — at least one destination is missing.
 *
 * Fix recipe: `teamagent init` re-runs the mirror step.
 */
/**
 * Issue #299: walk the install-table (ALL_CHANNELS in install-hook.ts) and
 * assert every referenced `bundleFilename` actually exists at its expected
 * absolute dist path. This closes the gap that lets the 0.11.0 release
 * tarball ship without `bin-digital-twin-tap.cjs` while `applyChannelOps`
 * silently continues past the missing bundle.
 *
 * Status semantics:
 * - `pass` — every install-table bundle exists on disk.
 * - `fail` — at least one is missing; detail lists every missing filename
 *   so the maintainer can identify which build entry / tsup config block
 *   omitted it. `fix` recipe rebuilds the package.
 *
 * Both deps are injectable for unit-test isolation; production defaults
 * walk the real install table via `enumerateInstallTableBundlePaths()` and
 * `fs.existsSync`.
 */
export function checkInstallTableBundles(
  enumerate: InstallTableEnumerator = enumerateInstallTableBundlePaths,
  existsFn: (p: string) => boolean = (p) => fs.existsSync(p),
): DoctorCheckResult {
  const entries = enumerate();
  const missing = entries.filter((e) => !existsFn(e.absPath));
  if (missing.length === 0) {
    return {
      name: "install-table-bundles",
      status: "pass",
      detail: `${entries.length} 个 install-table bundles 都在 dist/ 下`,
    };
  }
  const filenames = Array.from(new Set(missing.map((m) => m.bundleFilename))).join(", ");
  return {
    name: "install-table-bundles",
    status: "fail",
    detail: `dist 缺失 install-table 引用的 bundle: ${filenames}`,
    fix: "pnpm --filter teamagent build  （或重装 teamagent）",
  };
}

export function checkStaticUserSkillsPropagated(home: string): DoctorCheckResult {
  const plan = planStaticUserSkillInstall({
    homeDir: home,
    fileExists: (p) => fs.existsSync(p),
    joinPath: path.join,
  });
  const expected = plan.length;
  const present = plan.filter((e) => e.action === "skip-exists").length;
  const missingEntries = plan.filter((e) => e.action === "create");

  if (present === expected) {
    return {
      name: "skills-propagated",
      status: "pass",
      detail: `static user skills propagated ✓ ${present}/${expected}（${STATIC_USER_SKILLS.length} skills × 2 targets）`,
    };
  }

  const missingShort = missingEntries
    .slice(0, 4)
    .map((e) => `${e.skill}/${e.target}`)
    .join(", ");
  const more = missingEntries.length > 4 ? ` +${missingEntries.length - 4}` : "";

  return {
    name: "skills-propagated",
    status: "fail",
    detail: `static user skills propagation incomplete: ${present}/${expected}; missing ${missingShort}${more}`,
    fix: "teamagent init",
  };
}

export function checkPluginSync(cwd: string, home: string): DoctorCheckResult {
  const projectPluginsDir = path.join(cwd, ".claude", "plugins");
  const userPluginsDir = path.join(home, ".claude", "plugins");

  const projectExists = fs.existsSync(projectPluginsDir) && fs.statSync(projectPluginsDir).isDirectory();
  const userExists = fs.existsSync(userPluginsDir) && fs.statSync(userPluginsDir).isDirectory();

  if (!projectExists && !userExists) {
    return {
      name: "plugin-sync",
      status: "fail",
      detail: ".claude/plugins 目录不存在（项目级和用户级均未找到）",
      fix: "teamagent install-plugins",
    };
  }

  // Count plugin dirs under whichever root was found
  const pluginsRoot = projectExists ? projectPluginsDir : userPluginsDir;
  const scope = projectExists ? "项目级" : "用户级";
  try {
    const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
    const pluginDirs = entries.filter((e) => e.isDirectory()).length;
    if (pluginDirs === 0) {
      return {
        name: "plugin-sync",
        status: "fail",
        detail: `${scope} .claude/plugins 存在但为空`,
        fix: "teamagent install-plugins",
      };
    }
    return {
      name: "plugin-sync",
      status: "pass",
      detail: `${pluginDirs} 个插件已同步 (${scope}: ${pluginsRoot})`,
    };
  } catch {
    return {
      name: "plugin-sync",
      status: "fail",
      detail: `无法读取 plugins 目录: ${pluginsRoot}`,
      fix: "teamagent install-plugins",
    };
  }
}

const defaultCodexProbe: CodexProbe = (env) => {
  try {
    const stdout = execSync("codex --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: env ?? process.env,
    });
    return { ok: true, stdout, stderr: "" };
  } catch (e) {
    const err = e as { stderr?: string | Buffer; stdout?: string | Buffer; message?: string };
    return { ok: false, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? err.message ?? "") };
  }
};

/**
 * Check that the `codex` CLI binary is present and executable.
 */
export function checkCodexBin(probe: CodexProbe = defaultCodexProbe): DoctorCheckResult {
  const result = probe();
  if (result.ok) {
    return {
      name: "codex-bin",
      status: "pass",
      detail: result.stdout.trim().split("\n")[0] ?? "codex present",
    };
  }
  return {
    name: "codex-bin",
    status: "fail",
    detail: "未找到 codex 命令",
    fix: "npm install -g @openai/codex  （或确保 codex 在 PATH 中）",
  };
}

const defaultMcpProbe: McpProbe = async (url: string) => {
  try {
    const { request } = await import("node:https");
    const { request: httpRequest } = await import("node:http");
    const reqFn = url.startsWith("https") ? request : httpRequest;
    return await new Promise<{ reachable: boolean; detail: string }>((resolve) => {
      const timeout = setTimeout(() => resolve({ reachable: false, detail: `timeout connecting to ${url}` }), 3000);
      const req = reqFn(url, { method: "HEAD" }, (res) => {
        clearTimeout(timeout);
        resolve({ reachable: true, detail: `HTTP ${res.statusCode}` });
      });
      req.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ reachable: false, detail: err.message });
      });
      req.end();
    });
  } catch (e) {
    return { reachable: false, detail: String(e) };
  }
};

/**
 * Read MCP server URLs from .claude/settings.local.json (or user settings),
 * then HEAD-probe each. Reports pass if all reachable, or lists which failed.
 * Reports skip when no MCP servers are configured.
 */
export async function checkMcpReachability(
  cwd: string,
  probe: McpProbe = defaultMcpProbe,
): Promise<DoctorCheckResult> {
  const urls = collectMcpUrls(cwd);
  if (urls.length === 0) {
    return {
      name: "mcp-reachability",
      status: "skip",
      detail: "未配置 MCP 服务器（跳过）",
    };
  }

  const results = await Promise.all(urls.map(async (url) => ({ url, ...(await probe(url)) })));
  const failed = results.filter((r) => !r.reachable);

  if (failed.length === 0) {
    return {
      name: "mcp-reachability",
      status: "pass",
      detail: `${urls.length} 个 MCP 服务器均可达`,
    };
  }
  return {
    name: "mcp-reachability",
    status: "fail",
    detail: `${failed.length}/${urls.length} 个 MCP 服务器不可达: ${failed.map((r) => r.url).join(", ")}`,
    fix: "检查 MCP 服务器是否启动，或移除 .claude/settings.local.json 中失效的 mcpServers 条目",
  };
}

function collectMcpUrls(cwd: string): string[] {
  const urls: string[] = [];
  for (const settingsPath of [
    path.join(cwd, ".claude", "settings.local.json"),
    path.join(cwd, ".claude", "settings.json"),
  ]) {
    if (!fs.existsSync(settingsPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
      const mcpServers = raw["mcpServers"] as Record<string, unknown> | undefined;
      if (!mcpServers) continue;
      for (const server of Object.values(mcpServers)) {
        const s = server as Record<string, unknown>;
        if (typeof s["url"] === "string") urls.push(s["url"]);
      }
    } catch {
      // malformed — skip
    }
  }
  return urls;
}

export function checkClaudeMd(claudeMdPath: string): DoctorCheckResult {
  if (!fs.existsSync(claudeMdPath)) {
    return {
      name: "claude-md",
      status: "skip",
      detail: "CLAUDE.md 不存在（可选；TeamAgent 不再生成规则块）",
    };
  }
  const content = fs.readFileSync(claudeMdPath, "utf-8");
  if (content.includes("TEAMAGENT:START")) {
    return {
      name: "claude-md",
      status: "fail",
      detail: "仍包含旧 TEAMAGENT:START 生成块（#63 之后已弃用）",
      fix: "teamagent doctor --fix  （会先备份到 ~/.teamagent/backups/；配 --dry-run 预览）",
    };
  }
  return {
    name: "claude-md",
    status: "pass",
    detail: "无生成规则块（OK）",
  };
}

export function checkTeamSharingStatus(): DoctorCheckResult {
  return {
    name: "team-sharing",
    status: "pass",
    detail: "M5 viral-sync ready: gate-1 secret scan, gate-2 scope classifier, LWW+tombstone merge, m5-publish auto-commit, post-merge auto-pull",
  };
}

/**
 * Issue #172: subcommand help for `teamagent doctor --help` / `-h`.
 * Previously the dispatcher fell through to executeDoctor on `--help`, which
 * meant new users could not preview what `--fix` would do without running it.
 */
export function renderDoctorHelp(): string {
  return [
    "teamagent doctor — 检查工具安装是否健康",
    "",
    "用法:",
    "  teamagent doctor                跑全部检查并打印结果",
    "  teamagent doctor --fix          自动修复能修的项；写入前会先备份到 ~/.teamagent/backups/",
    "  teamagent doctor --fix --dry-run",
    "                                   预览要修什么（unified diff），不写入",
    "  teamagent doctor --json         输出机器可读 JSON（含 fixOutcomes 字段，含 dryRun bool）",
    "  teamagent doctor --cwd=<path>   指定项目目录（默认为当前目录）",
    "  teamagent doctor --help         显示本帮助",
    "",
    "可自动修复的检查项：",
    "  knowledge-db        通过 `teamagent init --skip-import` 创建 knowledge.db（无 prior state，跳过 backup）",
    "  hook-registered     向 .claude/settings.local.json 注册 PreToolUse hook",
    "  hook-script         同上",
    "  claude-md           剥离 legacy <!-- TEAMAGENT:START..END --> 块；写入前 backup CLAUDE.md",
    "",
    "备份位置:",
    "  ~/.teamagent/backups/<filename>.<ISO-timestamp>.bak",
    "  还原: cp <backup-path> <original-path>",
    "",
    "示例:",
    "  teamagent doctor --fix --dry-run    # 看一下会改什么",
    "  teamagent doctor --fix              # 真改（先备份）",
    "  teamagent doctor --fix --json       # 应用并输出 JSON 报告",
    "",
  ].join("\n") + "\n";
}

export function renderDoctorResult(result: DoctorResult): string {
  const lines: string[] = [];
  lines.push("环境诊断 / Environment Check");
  lines.push("─".repeat(40));

  for (const check of result.checks) {
    if (check.status === "pass") {
      lines.push(`✅ ${check.name.padEnd(16)}  ${check.detail}`);
    } else if (check.status === "fail") {
      lines.push(`❌ ${check.name.padEnd(16)}  ${check.detail}`);
      if (check.fix) {
        lines.push(`   → 运行: ${check.fix}`);
      }
    } else {
      lines.push(`⏭  ${check.name.padEnd(16)}  (${check.detail})`);
    }
  }

  lines.push("");
  if (result.allPassed && result.skipped === 0) {
    lines.push("✅ 全部检查通过！TeamAgent 运行正常。");
  } else if (result.allPassed) {
    lines.push("✅ 可运行检查通过；跳过项见上方（可能代表未完成产品范围）。");
  } else {
    const parts: string[] = [];
    if (result.failed > 0) parts.push(`${result.failed} 项失败`);
    if (result.skipped > 0) parts.push(`${result.skipped} 项跳过`);
    lines.push(`${parts.join("，")}。修复后重跑 teamagent doctor`);
  }

  // Issue #172: append fix outcomes section when --fix was passed.
  if (result.fixOutcomes && result.fixOutcomes.length > 0) {
    lines.push("");
    lines.push("─".repeat(40));
    lines.push(result.dryRun ? "🔧 doctor --fix --dry-run（预览，未写入）" : "🔧 doctor --fix（已应用）");
    lines.push("─".repeat(40));
    let appliedCount = 0;
    for (const outcome of result.fixOutcomes) {
      if (outcome.status === "preview") {
        lines.push(`👁  ${outcome.name.padEnd(16)}  ${outcome.detail}`);
        if (outcome.diff) {
          for (const dl of outcome.diff.split("\n")) {
            if (dl !== "") lines.push("   " + dl);
          }
        }
      } else if (outcome.status === "applied") {
        appliedCount++;
        lines.push(`✅ ${outcome.name.padEnd(16)}  ${outcome.detail}`);
        if (outcome.backupPath && outcome.filePath) {
          lines.push(`   备份: ${outcome.backupPath}`);
          // Quote both paths so the printed command stays valid when the user's
          // home or project path contains spaces (common on macOS, e.g.
          // "/Users/alice/Library/Application Support/...").
          lines.push(`   还原: cp "${outcome.backupPath}" "${outcome.filePath}"`);
        }
      } else if (outcome.status === "skipped") {
        lines.push(`⏭  ${outcome.name.padEnd(16)}  ${outcome.detail}`);
      } else {
        lines.push(`❌ ${outcome.name.padEnd(16)}  ${outcome.detail}${outcome.error ? `: ${outcome.error}` : ""}`);
      }
    }
    if (result.dryRun) {
      lines.push("");
      lines.push("不会写入。去掉 --dry-run 真实执行（写入前会先备份到 ~/.teamagent/backups/）。");
    } else if (appliedCount > 0) {
      lines.push("");
      lines.push(`已修复 ${appliedCount} 项。备份位置：~/.teamagent/backups/`);
    }
  }

  return lines.join("\n") + "\n";
}
