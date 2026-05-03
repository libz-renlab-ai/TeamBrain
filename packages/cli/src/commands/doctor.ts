// packages/cli/src/commands/doctor.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { openDb } from "@teamagent/adapters";

const _require = createRequire(import.meta.url);

export interface DoctorCheckResult {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  fix?: string;
}

export interface DoctorResult {
  checks: DoctorCheckResult[];
  passed: number;
  failed: number;
  skipped: number;
  allPassed: boolean;
}

export interface DoctorOptions {
  fix?: boolean;
  json?: boolean;
  postinstall?: boolean;
  cwd?: string;
  homeDir?: string;
  claudeProbe?: ClaudeProbe;
}

export function parseDoctorArgs(argv: string[]): DoctorOptions {
  return {
    fix: argv.includes("--fix"),
    json: argv.includes("--json"),
    postinstall: argv.includes("--postinstall"),
  };
}

async function autoFix(check: DoctorCheckResult, opts: DoctorOptions): Promise<void> {
  if (check.status !== "fail") return;
  const cwd = opts.cwd ?? process.cwd();
  try {
    if (check.name === "knowledge-db") {
      const { executeInit } = await import("./init.js");
      await executeInit({ cwd, skipImport: true });
    } else if (check.name === "hook-registered" || check.name === "hook-script") {
      const { installHook } = await import("./install-hook.js");
      installHook({ cwd });
    }
  } catch {
    // best-effort
  }
}

export async function executeDoctor(opts: DoctorOptions = {}): Promise<DoctorResult> {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.homeDir ?? os.homedir();
  const checks: DoctorCheckResult[] = [];

  // Check 1: Node.js version
  const nodeCheck = checkNodeVersion();
  checks.push(nodeCheck);
  if (nodeCheck.status === "fail") {
    return finalize(checks, true);
  }

  // Check 2: Claude Code installed
  const claudeCheck = checkClaudeCode(opts.claudeProbe);
  checks.push(claudeCheck);
  if (claudeCheck.status === "fail") {
    return finalize(checks, true);
  }

  // Check 3: sqlite-vec loadable
  checks.push(checkSqliteVec());

  // Check 4: ~/.teamagent/ writable
  const homeCheck = checkHomeDir(home);
  checks.push(homeCheck);
  if (homeCheck.status === "fail") {
    return finalize(checks, true);
  }

  // Check 5: knowledge.db exists
  const dbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const dbCheck = checkKnowledgeDb(dbPath);
  checks.push(dbCheck);
  if (opts.fix && dbCheck.status === "fail") await autoFix(dbCheck, opts);
  if (dbCheck.status === "fail" && !opts.fix) {
    // Skip remaining checks if DB missing
    checks.push(skip("hook-registered", "knowledge.db 先修"));
    checks.push(skip("hook-script", "knowledge.db 先修"));
    return finalize(checks, false);
  }

  // Check 6: Hook registered
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");
  const hookCheck = checkHookRegistered(settingsPath);
  checks.push(hookCheck);
  if (opts.fix && hookCheck.status === "fail") await autoFix(hookCheck, opts);
  if (hookCheck.status === "fail" && !opts.fix) {
    checks.push(skip("hook-script", "Hook 注册先修"));
    return finalize(checks, false);
  }

  // Check 7: Hook script exists
  const hookScriptCheck = checkHookScript(settingsPath);
  checks.push(hookScriptCheck);
  if (opts.fix && hookScriptCheck.status === "fail") await autoFix(hookScriptCheck, opts);

  // Check 8: CLAUDE.md is optional human-maintained guidance; generated blocks are deprecated.
  const claudeMdPath = path.join(cwd, "CLAUDE.md");
  const claudeMdCheck = checkClaudeMd(claudeMdPath);
  checks.push(claudeMdCheck);

  return finalize(checks, false);
}

function finalize(checks: DoctorCheckResult[], earlyExit: boolean): DoctorResult {
  // Always report the team-sharing product boundary, including early-return
  // paths such as missing knowledge.db or unregistered hooks. It is independent
  // of local environment health and must stay visible in --json output.
  if (!checks.some((check) => check.name === "team-sharing")) {
    checks.push(checkTeamSharingStatus());
  }
  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const skipped = checks.filter((c) => c.status === "skip").length;
  return { checks, passed, failed, skipped, allPassed: failed === 0 && !earlyExit };
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

function checkHookRegistered(settingsPath: string): DoctorCheckResult {
  if (!fs.existsSync(settingsPath)) {
    return {
      name: "hook-registered",
      status: "fail",
      detail: ".claude/settings.local.json 不存在",
      fix: "teamagent install-hook",
    };
  }
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const hooks = settings["hooks"] as Record<string, unknown> | undefined;
    const pre = hooks?.["PreToolUse"] as unknown[] | undefined;
    const hasTeamAgent = Array.isArray(pre) &&
      pre.some((h: unknown) => (h as Record<string, unknown>)["_teamagentTag"] === "teamagent-pre-tool-use");
    if (hasTeamAgent) {
      return { name: "hook-registered", status: "pass", detail: "PreToolUse Hook 已注册" };
    }
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
      detail: "仍包含旧 TEAMAGENT:START 生成块；请手动移除并改用 docs/ 索引",
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
    status: "skip",
    detail: "PARTIAL: Phase 4 team sharing is not complete; git transport, privacy redaction, and review gates are required before scope=team is supported",
    fix: "Track docs/系统展示/13-delivered-vs-planned.md and docs/superpowers/plans/2026-05-01-phase4-team-memory-plan.md",
  };
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

  return lines.join("\n") + "\n";
}
