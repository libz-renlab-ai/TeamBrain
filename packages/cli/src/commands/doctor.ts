// packages/cli/src/commands/doctor.ts
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { openDb } from "@teamagent/adapters";
import { stripLegacyTeamagentBlock } from "@teamagent/core";

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

export type CodexProbe = (env?: NodeJS.ProcessEnv) => ClaudeProbeResult;
export type McpProbe = (url: string) => Promise<{ reachable: boolean; detail: string }>;

export interface DoctorOptions {
  fix?: boolean;
  json?: boolean;
  postinstall?: boolean;
  cwd?: string;
  homeDir?: string;
  claudeProbe?: ClaudeProbe;
  codexProbe?: CodexProbe;
  mcpProbe?: McpProbe;
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
    json: argv.includes("--json"),
    postinstall: argv.includes("--postinstall"),
    cwd,
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
    } else if (check.name === "claude-md") {
      // B-109: strip the legacy TEAMAGENT:START..END managed block left over
      // from before #63 disabled in-file rule dumps. The new compile path
      // never re-writes it, so dropping the block makes doctor green again.
      const claudeMdPath = path.join(cwd, "CLAUDE.md");
      if (fs.existsSync(claudeMdPath)) {
        const before = fs.readFileSync(claudeMdPath, "utf-8");
        const after = stripLegacyTeamagentBlock(before);
        if (after !== before) {
          if (after === "") {
            // The whole file was the block (or block+whitespace). Removing
            // CLAUDE.md is friendlier than leaving a 0-byte stub that other
            // tooling may misread.
            fs.unlinkSync(claudeMdPath);
          } else {
            fs.writeFileSync(claudeMdPath, after, "utf-8");
          }
        }
      }
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
  const userSettingsPath = path.join(home, ".claude", "settings.json");
  const hookCheck = checkHookRegistered(settingsPath, userSettingsPath);
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

  // Check 8: settings.json scope (project vs user, PreToolUse vs SessionStart)
  checks.push(checkSettingsJsonScope(settingsPath, path.join(home, ".claude", "settings.json")));

  // Check 9: plugin sync (teamagent plugin files present in .claude/plugins)
  checks.push(checkPluginSync(cwd, home));

  // Check 10: codex binary presence
  checks.push(checkCodexBin(opts.codexProbe));

  // Check 11: MCP server reachability
  checks.push(await checkMcpReachability(cwd, opts.mcpProbe));

  // Check 12: CLAUDE.md is optional human-maintained guidance; generated blocks are deprecated.
  const claudeMdPath = path.join(cwd, "CLAUDE.md");
  const claudeMdCheck = checkClaudeMd(claudeMdPath);
  if (opts.fix && claudeMdCheck.status === "fail") {
    await autoFix(claudeMdCheck, opts);
    checks.push(checkClaudeMd(claudeMdPath));
  } else {
    checks.push(claudeMdCheck);
  }

  // Check 13 (issue #91): vector model warmup state.
  checks.push(await checkVectorModelState(home));

  return finalize(checks, false);
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
  return {
    name: "vector_model",
    status: "fail",
    detail: `state file malformed`,
  };
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
      fix: "teamagent doctor --fix  （自动剥离旧块）",
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
    detail: "PARTIAL: local scope=team write/read and approval privacy gate are supported, but team sharing is not complete; git transport, sync/export redaction, and conflict review gates are still required",
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
