import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildUserLevelHookCommand } from "../lib/user-level-hook-shim.js";

/**
 * Round-2 F2: CPU-friendly sync sleep. The previous busy-wait
 * `while (Date.now() < until)` loop pegged a core at 100% during contention.
 * We delegate to the OS `sleep` / `timeout` command via `execSync` so the
 * caller-thread is parked instead. Falls back to busy-wait only if the OS
 * binary is missing.
 */
function sleepSync(ms: number): void {
  try {
    if (process.platform === "win32") {
      // Windows `timeout` only supports whole-second granularity. We always
      // wait at least 1 second when called for SLEEP_MS=200; that's still
      // bounded and CPU-free.
      execSync(`timeout /t 1 /nobreak`, { stdio: "ignore", windowsHide: true });
    } else {
      execSync(`sleep ${(ms / 1000).toFixed(2)}`, { stdio: "ignore" });
    }
  } catch {
    // Last-resort busy wait if /usr/bin/sleep / timeout is unavailable.
    const until = Date.now() + ms;
    while (Date.now() < until) {
      // spin
    }
  }
}

const HOOK_TAG = "teamagent-pre-tool-use";
const POST_HOOK_TAG = "teamagent-post-tool-use";
const USER_PROMPT_TAG = "teamagent-user-prompt-submit";
const STOP_HOOK_TAG   = "teamagent-stop";
const STATUS_LINE_TAG = "teamagent-statusline";
// B+C scope (2026-05-09): four new channels folded into installHook.
// SessionStart and DigitalTwinTap are user-level only (see channelOps and
// `installHook` body for rationale); SessionEnd / PreCompact write to both
// project and user-level settings like the existing four.
const SESSION_START_TAG = "teamagent-session-start";
const SESSION_END_TAG   = "teamagent-session-end";
const PRE_COMPACT_TAG   = "teamagent-pre-compact";
const DIGITAL_TWIN_TAG  = "teamagent-digital-twin-tap";

export interface InstallHookOptions {
  cwd?: string;
  /** 显式指定 PreToolUse hook 入口绝对路径 */
  hookEntry?: string;
  /** 显式指定 PostToolUse hook 入口绝对路径 */
  postHookEntry?: string;
  /** 显式指定 UserPromptSubmit hook 入口绝对路径 */
  userPromptEntry?: string;
  /** 显式指定 Stop hook 入口绝对路径 */
  stopEntry?: string;
  /** 显式指定 statusLine 脚本入口绝对路径 */
  statusLineEntry?: string;
  /** 显式指定 SessionStart hook 入口绝对路径（user-level only） */
  sessionStartEntry?: string;
  /** 显式指定 SessionEnd hook 入口绝对路径 */
  sessionEndEntry?: string;
  /** 显式指定 PreCompact hook 入口绝对路径 */
  preCompactEntry?: string;
  /** 显式指定 digital-twin-tap Stop hook 入口绝对路径（user-level only） */
  digitalTwinEntry?: string;
  /** 显式指定 user-level home（默认 os.homedir()）。测试用。 */
  homeDir?: string;
  /**
   * Issue #161 — Layer 1 viral install. When `true` (default), additionally
   * write the same TeamAgent hook entries (PreToolUse / PostToolUse /
   * UserPromptSubmit / Stop) into `<homeDir>/.claude/settings.json` so
   * Claude Code launched from any cwd (including sub-directories of an
   * already-initialized project) registers the project's hooks. The
   * project-level write to `<cwd>/.claude/settings.local.json` is unchanged
   * either way. When `false`, behaviour is unchanged from before #161.
   */
  userLevel?: boolean;
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookEntry[];
    PostToolUse?: HookEntry[];
    UserPromptSubmit?: HookEntry[];
    Stop?: HookEntry[];
    [k: string]: unknown;
  };
  statusLine?: {
    type?: string;
    command?: string;
    _teamagentTag?: string;
    /** 用户原 statusLine.command 字面值（issue #104：chain wrap 备份用） */
    _teamagentOriginalCommand?: string;
    /** 用户原 statusLine.type（默认 "command"） */
    _teamagentOriginalType?: string;
    /** 备份来源：user = ~/.claude/settings.json；project = 当前 settings.local.json */
    _teamagentOriginalScope?: "user" | "project";
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
  /** TeamAgent 标签，用于卸载识别（自定义字段，settings.json 不要求）*/
  _teamagentTag?: string;
}

interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

function cliRoot(): string {
  // 从当前文件位置向上走，找到包含 dist/bin-pre-tool-use.cjs 的目录。
  // - Dev (source, tsx):  .../packages/cli/src/commands/install-hook.ts
  //                       → .../packages/cli/
  // - Bundled (npm):      .../node_modules/teamagent/dist/bin.js
  //                       → .../node_modules/teamagent/
  // 旧实现硬编码"退 3 层"，在 bundle 模式退到 node_modules/，
  // 再拼 "dist/bin-stop.cjs" 得到 node_modules/dist/bin-stop.cjs（不存在）。
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "dist", "bin-pre-tool-use.cjs"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 兜底：bundle 时总是 dist/bin.js → 上一级就是包根
  return path.dirname(path.dirname(here));
}

function defaultHookEntry(): string {
  return path.join(cliRoot(), "dist", "bin-pre-tool-use.cjs");
}

function defaultPostHookEntry(): string {
  return path.join(cliRoot(), "dist", "bin-post-tool-use.cjs");
}

// B+C scope: default entry paths for the four newly-wired channels. Each one
// is best-effort — if the .cjs is missing on disk, the channel is silently
// skipped at install time (existing pattern; see `hasPostBundle` etc.). This
// preserves backward compatibility for builds that haven't run `pnpm build`
// for the new bundles yet.
function defaultSessionStartEntry(): string {
  return path.join(cliRoot(), "dist", "bin-session-start.cjs");
}

function defaultSessionEndEntry(): string {
  return path.join(cliRoot(), "dist", "bin-session-end.cjs");
}

function defaultPreCompactEntry(): string {
  return path.join(cliRoot(), "dist", "bin-pre-compact.cjs");
}

function defaultDigitalTwinEntry(): string {
  return path.join(cliRoot(), "dist", "bin-digital-twin-tap.cjs");
}

/**
 * 把 Windows 反斜杠路径转为正斜杠格式。
 * Git Bash 会吞掉路径里的反斜杠（视为转义），所以 hook command 必须用 /。
 * `C:\path\to\repo` → `C:/path/to/repo`
 */
function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * B-091: stage a bundle from `<srcDistPath>` (e.g. node_modules/teamagent/dist/bin-*.cjs)
 * to a stable user-owned location at `<homeDir>/.teamagent/hooks/<basename>`.
 *
 * Why: the user-level `~/.claude/settings.json` is shared across every project
 * on the machine. If we wrote the literal `node_modules/.../dist/bin-*.cjs`
 * absolute path into it, then nvm version switches, npm reinstalls, worktree
 * cleanups (e.g. `/private/tmp/<repo>` deleted), or "last init from a
 * different project replaces my command" all silently brick TeamAgent hooks
 * for every project on the machine.
 *
 * Pattern mirrors `installUserHook` (sibling B-091 implementation):
 * 1. compute dest = <homeDir>/.teamagent/hooks/<basename(srcDistPath)>
 * 2. mkdir -p the parent dir
 * 3. copyFileSync the bundle (overwrite existing — fresh bundle on each install)
 * 4. return dest
 */
function stageBundleToUserTeamagent(srcDistPath: string, homeDir: string): string {
  const dest = path.join(homeDir, ".teamagent", "hooks", path.basename(srcDistPath));
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  // Round-2 F3: skip the copy if the destination already contains the same
  // bytes — same size + dest mtime is at-least-as-new as src. Avoids
  // pointless I/O on every init AND avoids racing with concurrent hook
  // processes that already loaded the staged bundle. (rsync-style heuristic.)
  try {
    const srcStat = fs.statSync(srcDistPath);
    const destStat = fs.statSync(dest);
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      return dest;
    }
  } catch {
    // dest missing or unreadable — fall through to the copy below.
  }

  // Round-2 F3: atomic copy via tmp + rename. On Windows an unconditional
  // copyFileSync over an in-use bundle throws EBUSY and crashes init; on
  // Unix an in-flight hook process can otherwise see a half-written file.
  // rename(2) is atomic on POSIX and very-near-atomic on NTFS.
  const tmp = `${dest}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    fs.copyFileSync(srcDistPath, tmp);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
  return dest;
}

/**
 * B-086: judge whether a hook entry belongs to TeamAgent for a given channel.
 *
 * Dual signal — mirrors `install-user-hook.ts:isTeamagentSessionStartEntry`:
 * - Strong: `_teamagentTag` is present (any TeamAgent-tagged entry, covers
 *   both old and new tagging schemes).
 * - Heuristic: `entry.hooks[*].command` contains the channel's bundle
 *   filename (e.g. `bin-pre-tool-use.cjs`). These filenames are TeamAgent-
 *   specific and unlikely to collide with foreign hooks.
 *
 * Used in `mergeUserLevelHooks` so re-installing on top of an upgraded user
 * who already has untagged-legacy TeamAgent entries doesn't double-fire.
 */
type HookChannel =
  | "PreToolUse"
  | "PostToolUse"
  | "UserPromptSubmit"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "PreCompact";

// Bundle filenames for each channel. Stop has TWO bundles (bin-stop +
// bin-digital-twin-tap); the heuristic detects either as TeamAgent-owned so
// re-install dedup catches both flavours. New bundles added 2026-05-09 (B+C).
const CHANNEL_BUNDLE_FILENAMES: Record<HookChannel, readonly string[]> = {
  PreToolUse: ["bin-pre-tool-use.cjs"],
  PostToolUse: ["bin-post-tool-use.cjs"],
  UserPromptSubmit: ["bin-user-prompt-submit.cjs"],
  Stop: ["bin-stop.cjs", "bin-digital-twin-tap.cjs"],
  SessionStart: ["bin-session-start.cjs"],
  SessionEnd: ["bin-session-end.cjs"],
  PreCompact: ["bin-pre-compact.cjs"],
};

function isTeamagentEntry(entry: HookEntry, channel: HookChannel): boolean {
  if (entry._teamagentTag) return true;
  const filenames = CHANNEL_BUNDLE_FILENAMES[channel];
  const cmds = entry.hooks?.map((c) => c.command ?? "") ?? [];
  return cmds.some((c) => filenames.some((f) => c.includes(f)));
}

function readSettings(file: string): ClaudeSettings {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf-8").trim();
  if (!raw) return {};
  // B-fix #2: malformed settings.json from any external tool should not abort
  // init. Back up the corrupt file (preserve the user's accident-recoverable
  // copy) and start fresh from `{}`. Logged once to stderr so the user knows.
  try {
    return JSON.parse(raw) as ClaudeSettings;
  } catch (err) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const bak = `${file}.bak-${ts}`;
    try {
      fs.copyFileSync(file, bak);
    } catch {
      // best-effort backup; if even copy fails we still proceed with {}
    }
    process.stderr.write(
      `teamagent install-hook: ${file} malformed; backed up to ${bak}; starting fresh\n`,
    );
    return {};
  }
}

/**
 * Round-2 F5: cap the number of `<file>.bak-<ts>` siblings on disk so 100
 * `teamagent init` runs don't leave 200 stale backups (each potentially
 * containing user secrets / paths) lying around forever. We keep the newest
 * `RETENTION_BACKUPS` per file and prune everything older.
 */
const RETENTION_BACKUPS = 5;

function safeMtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function pruneOldBackups(file: string): void {
  const dir = path.dirname(file);
  const base = path.basename(file);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const baks = entries
    .filter((e) => e.startsWith(`${base}.bak-`))
    .map((e) => ({ name: e, mtimeMs: safeMtime(path.join(dir, e)) }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  // We're about to create one more backup. Keep the newest
  // (RETENTION_BACKUPS - 1) and let that new one round us up to
  // RETENTION_BACKUPS total.
  for (const old of baks.slice(RETENTION_BACKUPS - 1)) {
    try {
      fs.unlinkSync(path.join(dir, old.name));
    } catch {
      // best-effort
    }
  }
}

function writeSettings(file: string, settings: ClaudeSettings): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // B-fix #2/#7: always take a `.bak-<ts>` backup of an existing file before
  // overwriting (timestamp avoids clobbering prior backups), then write atomically
  // via tmp + POSIX rename. This makes SIGINT, disk-full, and concurrent-init
  // races non-corrupting: either the old file or the new file is on disk, never
  // a half-written file.
  if (fs.existsSync(file)) {
    // Round-2 F5: prune old `.bak-*` siblings BEFORE creating a new one so
    // the on-disk count stays bounded at RETENTION_BACKUPS.
    pruneOldBackups(file);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const bak = `${file}.bak-${ts}`;
    try {
      fs.copyFileSync(file, bak);
    } catch {
      // best-effort backup
    }
  }

  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, file);
}

/**
 * Concurrent-init advisory lock for user-level `~/.claude/settings.json`.
 *
 * Two `teamagent init` runs from different projects can race on the
 * read-modify-write window and lose one's write. Default `userLevel:true`
 * raises the collision rate.
 *
 * Strategy:
 * - exclusive create (`fs.openSync(lockPath, 'wx')`)
 * - on EEXIST: stale-detect (mtime > 30s → unlink + retry once); otherwise
 *   busy-wait 200ms × up to 5 retries
 * - degrade gracefully: if all retries exhausted, log a warning and proceed
 *   anyway — never block init forever
 *
 * Caller must always call `releaseSettingsLock(fd, lockPath)` in finally.
 */
function acquireSettingsLock(homeDir: string): { fd: number | null; lockPath: string } {
  const lockPath = path.join(homeDir, ".claude", ".settings.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const STALE_MS = 30_000;
  const MAX_RETRIES = 5;
  const SLEEP_MS = 200;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      return { fd, lockPath };
    } catch (err: any) {
      if (err?.code !== "EEXIST") {
        // Unexpected — degrade and proceed
        process.stderr.write(
          `teamagent install-hook: settings lock open failed (${err?.code ?? err}); proceeding without lock\n`,
        );
        return { fd: null, lockPath };
      }
      // Stale-detect
      try {
        const st = fs.statSync(lockPath);
        const age = Date.now() - st.mtimeMs;
        if (age > STALE_MS) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            // someone else may have unlinked; loop will retry
          }
          continue;
        }
      } catch {
        // statSync failed — lockfile vanished between EEXIST and stat; retry
        continue;
      }
      if (attempt === MAX_RETRIES) {
        process.stderr.write(
          `teamagent install-hook: settings lock contention at ${lockPath} after ${MAX_RETRIES} retries; proceeding without lock\n`,
        );
        return { fd: null, lockPath };
      }
      // Round-2 F2: CPU-friendly sync sleep — defers to OS `sleep` / `timeout`
      // via execSync so we don't burn a core while waiting. installHook is
      // sync and can't be ported to async without ripping the public API.
      sleepSync(SLEEP_MS);
    }
  }
  return { fd: null, lockPath };
}

function releaseSettingsLock(fd: number | null, lockPath: string): void {
  // Round-2 F1: only unlink the lockfile if we actually own it (fd !== null).
  // The degraded path in `acquireSettingsLock` returns fd=null when MAX_RETRIES
  // is exhausted — at that point the lockfile is still held by another process.
  // Unconditionally unlinking it would defeat mutual exclusion entirely.
  if (fd === null) return;
  try {
    fs.closeSync(fd);
  } catch {
    // best-effort
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // best-effort — another process may have already unlinked
  }
}

/**
 * 把 TeamAgent PreToolUse hook 注册到 .claude/settings.local.json。
 * 用 settings.local.json 而非 settings.json 是因为：
 * - settings.local.json 是用户机器本地配置（Claude Code 约定不入 git）
 * - 入 git 的话每次提交都会带上 hook 引用，跨开发者不一致
 *
 * 重复安装是幂等的。
 */
export function installHook(opts: InstallHookOptions = {}): {
  settingsPath: string;
  hookEntry: string;
  postHookEntry: string;
  alreadyInstalled: boolean;
  postAlreadyInstalled: boolean;
  /** issue #104 起含义变更：true = statusLine bundle 缺失（极少发生）。
   *  用户已有 statusLine 时不再 skip，而是 chain wrap，见 statusLineMergedScope。 */
  statusLineSkipped: boolean;
  /** issue #104：本次 install 把哪一层用户 statusLine wrap 进了 chain；
   *  null = 用户原本就没有 statusLine，TeamBrain 独占 */
  statusLineMergedScope: "user" | "project" | null;
} {
  const cwd = opts.cwd ?? process.cwd();
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");
  const hookEntry = opts.hookEntry ?? defaultHookEntry();
  const postHookEntry = opts.postHookEntry ?? defaultPostHookEntry();

  // 确认 PreToolUse bundled .cjs 存在
  if (!fs.existsSync(hookEntry)) {
    throw new Error(
      `Hook bundle not found: ${hookEntry}\n` +
        `请先运行: pnpm --filter @teamagent/cli build:hook`,
    );
  }
  // PostToolUse bundle 是软依赖——不存在时给警告但不阻断（兼容老安装）
  const hasPostBundle = fs.existsSync(postHookEntry);

  const settings = readSettings(settingsPath);
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  // PreToolUse 注册
  const preExisting = settings.hooks.PreToolUse.find(
    (h) => h._teamagentTag === HOOK_TAG,
  );
  let alreadyInstalled = false;
  if (preExisting) {
    alreadyInstalled = true;
  } else {
    const forwardPath = toForwardSlash(hookEntry);
    settings.hooks.PreToolUse.push({
      matcher: "Bash|Write|Edit|WebFetch",
      _teamagentTag: HOOK_TAG,
      hooks: [
        { type: "command", command: `node ${shellQuote(forwardPath)}`, timeout: 30 },
      ],
    });
  }

  // PostToolUse 注册（仅 bundle 存在时）
  let postAlreadyInstalled = false;
  if (hasPostBundle) {
    const postExisting = settings.hooks.PostToolUse.find(
      (h) => h._teamagentTag === POST_HOOK_TAG,
    );
    if (postExisting) {
      postAlreadyInstalled = true;
    } else {
      const forwardPath = toForwardSlash(postHookEntry);
      settings.hooks.PostToolUse.push({
        matcher: "Bash|Write|Edit|WebFetch",
        _teamagentTag: POST_HOOK_TAG,
        hooks: [
          { type: "command", command: `node ${shellQuote(forwardPath)}`, timeout: 30 },
        ],
      });
    }
  }

  // 清理空数组
  if (settings.hooks.PostToolUse?.length === 0) delete settings.hooks.PostToolUse;
  if (settings.hooks.PreToolUse?.length === 0) delete settings.hooks.PreToolUse;

  // UserPromptSubmit 注册
  const userPromptEntry = opts.userPromptEntry
    ?? path.join(cliRoot(), "dist", "bin-user-prompt-submit.cjs");
  const hasUserPromptBundle = fs.existsSync(userPromptEntry);
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
  if (hasUserPromptBundle) {
    const upExisting = settings.hooks.UserPromptSubmit.find(
      (h) => h._teamagentTag === USER_PROMPT_TAG,
    );
    if (!upExisting) {
      settings.hooks.UserPromptSubmit.push({
        _teamagentTag: USER_PROMPT_TAG,
        hooks: [{ type: "command", command: `node ${shellQuote(toForwardSlash(userPromptEntry))}`, timeout: 10 }],
      });
    }
  }
  if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;

  // Stop 注册
  const stopEntry = opts.stopEntry
    ?? path.join(cliRoot(), "dist", "bin-stop.cjs");
  const hasStopBundle = fs.existsSync(stopEntry);
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  if (hasStopBundle) {
    const stopExisting = settings.hooks.Stop.find(
      (h) => h._teamagentTag === STOP_HOOK_TAG,
    );
    if (!stopExisting) {
      settings.hooks.Stop.push({
        _teamagentTag: STOP_HOOK_TAG,
        hooks: [{ type: "command", command: `node ${shellQuote(toForwardSlash(stopEntry))}`, timeout: 60 }],
      });
    }
  }
  if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;

  // B+C scope 2026-05-09: SessionEnd 注册（project-level）
  // 触发于 /clear、logout、Ctrl+C at prompt、关闭窗口。bin-session-end.cjs
  // 自身保证 detached + non-blocking；timeout 30s 是安全网。
  const sessionEndEntry = opts.sessionEndEntry ?? defaultSessionEndEntry();
  const hasSessionEndBundle = fs.existsSync(sessionEndEntry);
  if (!settings.hooks.SessionEnd) settings.hooks.SessionEnd = [] as HookEntry[];
  if (hasSessionEndBundle) {
    const list = settings.hooks.SessionEnd as HookEntry[];
    const existing = list.find((h) => h._teamagentTag === SESSION_END_TAG);
    if (!existing) {
      list.push({
        _teamagentTag: SESSION_END_TAG,
        hooks: [{ type: "command", command: `node ${shellQuote(toForwardSlash(sessionEndEntry))}`, timeout: 30 }],
      });
    }
  }
  if ((settings.hooks.SessionEnd as HookEntry[] | undefined)?.length === 0) delete settings.hooks.SessionEnd;

  // B+C scope 2026-05-09: PreCompact 注册（project-level）
  // 触发于 Claude Code 即将压缩 transcript 之前；做一次全量 rescan，
  // 让被摘要吃掉的 turn 里的 learnings 已落库。
  const preCompactEntry = opts.preCompactEntry ?? defaultPreCompactEntry();
  const hasPreCompactBundle = fs.existsSync(preCompactEntry);
  if (!settings.hooks.PreCompact) settings.hooks.PreCompact = [] as HookEntry[];
  if (hasPreCompactBundle) {
    const list = settings.hooks.PreCompact as HookEntry[];
    const existing = list.find((h) => h._teamagentTag === PRE_COMPACT_TAG);
    if (!existing) {
      list.push({
        _teamagentTag: PRE_COMPACT_TAG,
        hooks: [{ type: "command", command: `node ${shellQuote(toForwardSlash(preCompactEntry))}`, timeout: 30 }],
      });
    }
  }
  if ((settings.hooks.PreCompact as HookEntry[] | undefined)?.length === 0) delete settings.hooks.PreCompact;

  // statusLine 注册。CC 只有一个 statusLine 槽位 — 若用户已有 statusLine（user
  // level `~/.claude/settings.json` 或 project level `.claude/settings.local.json`），
  // 把用户 cmd 与 TeamBrain cmd chain 起来：
  //   bash -c '<user_cmd>; echo; <teamagent_cmd>'
  // 中间 echo 让两段输出换行（issue #104）。用户原 cmd 字面值备份到
  // _teamagentOriginalCommand / Type / Scope，便于 uninstall 还原。
  const statusLineEntry = opts.statusLineEntry
    ?? path.join(cliRoot(), "dist", "teamagent-statusline.cjs");
  const hasStatusLineBundle = fs.existsSync(statusLineEntry);
  // statusLineSkipped 保留字段为兼容；新语义：仅在 bundle 缺失时为 true
  let statusLineSkipped = false;
  let statusLineMergedScope: "user" | "project" | null = null;
  if (hasStatusLineBundle) {
    const homeDir = opts.homeDir ?? os.homedir();
    const teamCmd = `node ${shellQuote(toForwardSlash(statusLineEntry))}`;
    const existing = settings.statusLine;
    const existingIsTagged = existing?._teamagentTag === STATUS_LINE_TAG;
    const existingIsEmpty = !existing || Object.keys(existing).length === 0;

    let userCmd: string | null = null;
    let userType = "command";
    let userScope: "user" | "project" | null = null;

    if (existingIsTagged) {
      // 之前装过 teamagent — 复用上次备份（保留用户原 cmd），idempotent
      const orig = existing?._teamagentOriginalCommand;
      const origType = existing?._teamagentOriginalType;
      const origScope = existing?._teamagentOriginalScope;
      if (typeof orig === "string" && orig.length > 0) {
        userCmd = orig;
        userType = typeof origType === "string" ? origType : "command";
        userScope = origScope === "project" || origScope === "user" ? origScope : null;
      }
    } else if (!existingIsEmpty) {
      // 用户在 project level 自己写过 statusLine — 收编为 project scope 备份
      const cmd = existing?.command;
      const t = existing?.type;
      if (typeof cmd === "string" && cmd.length > 0) {
        userCmd = cmd;
        userType = typeof t === "string" ? t : "command";
        userScope = "project";
      }
    }

    if (!userCmd) {
      // project level 无信号 — 看 user level (~/.claude/settings.json)
      const userLevel = readUserLevelStatusLine(homeDir);
      if (userLevel) {
        userCmd = userLevel.command;
        userType = userLevel.type;
        userScope = "user";
      }
    }

    const newStatusLine: NonNullable<ClaudeSettings["statusLine"]> = {
      type: "command",
      command: buildStatusLineCommand(userCmd, teamCmd),
      _teamagentTag: STATUS_LINE_TAG,
    };
    if (userCmd) {
      newStatusLine._teamagentOriginalCommand = userCmd;
      newStatusLine._teamagentOriginalType = userType;
      newStatusLine._teamagentOriginalScope = userScope ?? "user";
      statusLineMergedScope = userScope;
    }
    settings.statusLine = newStatusLine;
  } else {
    statusLineSkipped = true;
  }

  writeSettings(settingsPath, settings);

  // Issue #161 — Layer 1 viral install. Default `userLevel: true` so Claude
  // Code launched from a sub-directory of an initialized project still has
  // the TeamAgent hooks registered. The user-level write is additive and
  // idempotent — existing TeamAgent-tagged entries are replaced in place,
  // foreign entries are preserved untouched.
  const userLevel = opts.userLevel ?? true;
  if (userLevel) {
    const homeDir = opts.homeDir ?? os.homedir();
    mergeUserLevelHooks(homeDir, {
      hookEntry,
      postHookEntry,
      userPromptEntry,
      stopEntry,
      sessionStartEntry: opts.sessionStartEntry ?? defaultSessionStartEntry(),
      sessionEndEntry,
      preCompactEntry,
      digitalTwinEntry: opts.digitalTwinEntry ?? defaultDigitalTwinEntry(),
    });
  }

  return {
    settingsPath,
    hookEntry,
    postHookEntry,
    alreadyInstalled,
    postAlreadyInstalled,
    statusLineSkipped,
    statusLineMergedScope,
  };
}

/**
 * Issue #161 — write TeamAgent hook entries to `<homeDir>/.claude/settings.json`.
 *
 * Idempotent + additive:
 * - For each hook channel (PreToolUse / PostToolUse / UserPromptSubmit / Stop),
 *   we look up the existing TeamAgent-tagged entry and *replace it in place*.
 *   Foreign (non-TeamAgent-tagged) entries are preserved untouched.
 * - If the bundle for a given channel does not exist on disk we skip writing
 *   that channel (matches project-level behaviour).
 * - If `<homeDir>/.claude/settings.json` does not exist, the file is created
 *   with the minimal `{ "hooks": { ... } }` shape.
 *
 * NB: we deliberately do NOT touch `statusLine` here — that's the project's
 * project-level concern (#104) and the user-level statusLine is consulted as
 * a *read* by `readUserLevelStatusLine` above; rewriting it user-level would
 * conflict with that read path.
 */
function mergeUserLevelHooks(
  homeDir: string,
  entries: {
    hookEntry: string;
    postHookEntry: string;
    userPromptEntry: string;
    stopEntry: string;
    // B+C scope (2026-05-09): four new bundles. Each one is best-effort —
    // missing-on-disk → channel skipped (existing existsSync pattern).
    sessionStartEntry: string;
    sessionEndEntry: string;
    preCompactEntry: string;
    digitalTwinEntry: string;
  },
): void {
  const userSettingsPath = path.join(homeDir, ".claude", "settings.json");

  // B-fix #7: serialize the user-level read-modify-write window so concurrent
  // `teamagent init` runs (different projects, different cc sessions) don't
  // race and lose each other's writes. Project-level
  // `<cwd>/.claude/settings.local.json` is cwd-scoped and doesn't need this.
  const { fd, lockPath } = acquireSettingsLock(homeDir);
  try {
    const settings = readSettings(userSettingsPath);
    if (!settings.hooks) settings.hooks = {};

    const channelOps: Array<{
      channel: HookChannel;
      tag: string;
      bundlePath: string;
      matcher?: string;
      timeout: number;
    }> = [
      {
        channel: "PreToolUse",
        tag: HOOK_TAG,
        bundlePath: entries.hookEntry,
        matcher: "Bash|Write|Edit|WebFetch",
        timeout: 30,
      },
      {
        channel: "PostToolUse",
        tag: POST_HOOK_TAG,
        bundlePath: entries.postHookEntry,
        matcher: "Bash|Write|Edit|WebFetch",
        timeout: 30,
      },
      {
        channel: "UserPromptSubmit",
        tag: USER_PROMPT_TAG,
        bundlePath: entries.userPromptEntry,
        timeout: 10,
      },
      {
        channel: "Stop",
        tag: STOP_HOOK_TAG,
        bundlePath: entries.stopEntry,
        timeout: 60,
      },
      // B+C scope (2026-05-09): SessionStart was previously installed by the
      // separate `teamagent install-user-hook` command. Folded in here so
      // `teamagent init` is a single entry point for all hook installation.
      // The standalone `install-user-hook` command remains for backward
      // compatibility but emits a deprecation warning. User-level only —
      // SessionStart is whole-machine semantics; project-level mirroring
      // would just produce a redundant per-project copy.
      {
        channel: "SessionStart",
        tag: SESSION_START_TAG,
        bundlePath: entries.sessionStartEntry,
        timeout: 10,
      },
      // B+C scope (2026-05-09): SessionEnd written to user-level too so it
      // fires on /clear, logout, Ctrl+C, window close from any cwd.
      {
        channel: "SessionEnd",
        tag: SESSION_END_TAG,
        bundlePath: entries.sessionEndEntry,
        timeout: 30,
      },
      // B+C scope (2026-05-09): PreCompact also user-level so context
      // compaction in any project flushes learnings before the summary.
      {
        channel: "PreCompact",
        tag: PRE_COMPACT_TAG,
        bundlePath: entries.preCompactEntry,
        timeout: 30,
      },
      // B+C scope (2026-05-09): bin-digital-twin-tap.cjs as a SECOND Stop
      // entry — runs alongside the existing bin-stop learning pipeline. We
      // wire it user-level only because committed `.claude/settings.json` in
      // the TeamBrain repo already routes a digital-twin-tap.sh wrapper
      // (with SIGTERM forwarding); also writing the .cjs to project-level
      // `settings.local.json` would double-tap when working IN TeamBrain
      // itself. User-level only means: other projects get one tap (via the
      // .cjs); TeamBrain gets one tap (via the .sh wrapper). Net 1 tap per
      // session. `tapSession` is documented to dedup by (cwd, session_id)
      // anyway, so the worst case is wasteful, not unsafe.
      {
        channel: "Stop",
        tag: DIGITAL_TWIN_TAG,
        bundlePath: entries.digitalTwinEntry,
        timeout: 5,
      },
    ];

    for (const op of channelOps) {
      // Round-2 F4 + B+C-scope refinement (2026-05-09):
      // - Strip the entry that owns OUR tag (idempotent re-install)
      // - Strip untagged-legacy entries that point at any teamagent bundle
      //   filename for this channel (B-086 dedup; covers pre-tag installs)
      // - PRESERVE entries with a DIFFERENT teamagent tag for the same
      //   channel: this matters for Stop, which now hosts both `bin-stop.cjs`
      //   and `bin-digital-twin-tap.cjs`. The previous "strip all
      //   isTeamagentEntry" logic wiped the first op's write when the second
      //   op ran on the same channel.
      if (settings.hooks[op.channel]) {
        const list = settings.hooks[op.channel] as HookEntry[];
        settings.hooks[op.channel] = list.filter((h) => {
          if (h._teamagentTag === op.tag) return false;
          if (!h._teamagentTag && isTeamagentEntry(h, op.channel)) return false;
          return true;
        });
      }

      if (!fs.existsSync(op.bundlePath)) continue;

      // B-091: stage the bundle to a stable user-owned location and reference
      // *that* in settings.json — not the dist path inside whichever
      // node_modules / worktree / tmp clone produced this install. Otherwise
      // nvm version switches, npm reinstalls, or `/private/tmp/<repo>`
      // cleanups silently break TeamAgent hooks across every project on the
      // machine. Mirrors install-user-hook.ts pattern.
      // Round-2 F3: if staging fails (e.g. EBUSY on Windows when another cc
      // session has the bundle loaded), we keep the install working by
      // falling back to the original dist path. The user just loses the
      // staged-path stability guarantee for that channel — better than no
      // hook at all.
      let pathForCommand: string;
      try {
        pathForCommand = stageBundleToUserTeamagent(op.bundlePath, homeDir);
      } catch (err: any) {
        process.stderr.write(
          `teamagent install-hook: failed to stage ${path.basename(op.bundlePath)} ` +
            `(${err?.code ?? err?.message ?? err}) — falling back to in-place dist path\n`,
        );
        pathForCommand = op.bundlePath;
      }

      if (!settings.hooks[op.channel]) settings.hooks[op.channel] = [];

      // Issue #209: wrap user-level hook commands in a graceful shim so a
      // missing or moved staged bundle exits 0 silently instead of spamming a
      // Node MODULE_NOT_FOUND trace into every Claude Code session. Mirrors
      // the project-level B-103 pattern; see lib/user-level-hook-shim.ts.
      const command = buildUserLevelHookCommand(pathForCommand);
      const newEntry: HookEntry = {
        _teamagentTag: op.tag,
        hooks: [{ type: "command", command, timeout: op.timeout }],
      };
      if (op.matcher) newEntry.matcher = op.matcher;

      // B-086: filter ALL TeamAgent entries for this channel, not just
      // tag-matching ones. Untagged-legacy entries from older TeamAgent
      // installs (pre-_teamagentTag, or different install path) point at
      // the channel's bundle filename and would otherwise accumulate
      // alongside the new tagged entry → double-fire per tool use. Mirror
      // install-user-hook.ts B-086 dedup pattern.
      // Round-2 F4: dedup already happened above the existsSync check, so
      // here we just push the freshly-built entry.
      (settings.hooks[op.channel] as HookEntry[]).push(newEntry);
    }

    // Drop any channels that ended up empty (preserves prior structure when we
    // never had to touch them). B+C scope (2026-05-09): list now includes the
    // four newly-wired channels.
    for (const ch of [
      "PreToolUse",
      "PostToolUse",
      "UserPromptSubmit",
      "Stop",
      "SessionStart",
      "SessionEnd",
      "PreCompact",
    ] as const) {
      const list = settings.hooks[ch] as HookEntry[] | undefined;
      if (Array.isArray(list) && list.length === 0) delete settings.hooks[ch];
    }
    if (settings.hooks && Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    writeSettings(userSettingsPath, settings);
  } finally {
    releaseSettingsLock(fd, lockPath);
  }
}

/**
 * 读 user-level `~/.claude/settings.json` 的 statusLine。返回非 teamagent 自己的
 * 那条；teamagent 自己 tag 过的或文件不存在均返回 null（避免重入嵌套）。
 */
function readUserLevelStatusLine(
  homeDir: string,
): { command: string; type: string } | null {
  const userSettingsPath = path.join(homeDir, ".claude", "settings.json");
  if (!fs.existsSync(userSettingsPath)) return null;
  try {
    const raw = fs.readFileSync(userSettingsPath, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      statusLine?: { command?: string; type?: string; _teamagentTag?: string };
    };
    const sl = parsed.statusLine;
    if (!sl || typeof sl.command !== "string" || sl.command.length === 0) return null;
    if (sl._teamagentTag) return null;
    return { command: sl.command, type: typeof sl.type === "string" ? sl.type : "command" };
  } catch {
    return null;
  }
}

function escapeForBashSingleQuote(s: string): string {
  // POSIX 单引号转义：'foo' bar → 'foo'\''bar'
  return s.replace(/'/g, "'\\''");
}

function buildStatusLineCommand(
  userCmd: string | null,
  teamCmd: string,
): string {
  if (!userCmd) return teamCmd;
  const u = escapeForBashSingleQuote(userCmd);
  const t = escapeForBashSingleQuote(teamCmd);
  return `bash -c '${u}; echo; ${t}'`;
}

/** 移除 TeamAgent hook 注册（PreToolUse + PostToolUse 一并）。 */
export function uninstallHook(opts: { cwd?: string } = {}): {
  settingsPath: string;
  removed: boolean;
} {
  const cwd = opts.cwd ?? process.cwd();
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");

  if (!fs.existsSync(settingsPath)) {
    return { settingsPath, removed: false };
  }

  const settings = readSettings(settingsPath);
  if (!settings.hooks) {
    return { settingsPath, removed: false };
  }

  let removedAny = false;

  if (settings.hooks.PreToolUse) {
    const before = settings.hooks.PreToolUse.length;
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
      (h) => h._teamagentTag !== HOOK_TAG,
    );
    if (settings.hooks.PreToolUse.length !== before) removedAny = true;
    if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
  }

  if (settings.hooks.PostToolUse) {
    const before = settings.hooks.PostToolUse.length;
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
      (h) => h._teamagentTag !== POST_HOOK_TAG,
    );
    if (settings.hooks.PostToolUse.length !== before) removedAny = true;
    if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
  }

  if (settings.hooks.UserPromptSubmit) {
    const before = settings.hooks.UserPromptSubmit.length;
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
      (h) => h._teamagentTag !== USER_PROMPT_TAG,
    );
    if (settings.hooks.UserPromptSubmit.length !== before) removedAny = true;
    if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
  }

  if (settings.hooks.Stop) {
    const before = settings.hooks.Stop.length;
    // B+C scope (2026-05-09): Stop now hosts both bin-stop and the
    // digital-twin-tap entry — drop both teamagent tags.
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h) => h._teamagentTag !== STOP_HOOK_TAG && h._teamagentTag !== DIGITAL_TWIN_TAG,
    );
    if (settings.hooks.Stop.length !== before) removedAny = true;
    if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  }

  // B+C scope (2026-05-09): clean SessionStart/SessionEnd/PreCompact entries
  // too. Project-level rarely has SessionStart (it's user-level only) but we
  // sweep for safety in case a future test or migration writes one.
  for (const [channel, tag] of [
    ["SessionStart", SESSION_START_TAG],
    ["SessionEnd", SESSION_END_TAG],
    ["PreCompact", PRE_COMPACT_TAG],
  ] as const) {
    const list = settings.hooks[channel] as HookEntry[] | undefined;
    if (!Array.isArray(list)) continue;
    const before = list.length;
    const next = list.filter((h) => h._teamagentTag !== tag);
    if (next.length !== before) removedAny = true;
    if (next.length === 0) {
      delete settings.hooks[channel];
    } else {
      settings.hooks[channel] = next;
    }
  }

  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  // statusLine：只有在明确打了 teamagent tag 时才动。issue #104 起 install
  // 会把用户原 cmd 备份到 _teamagentOriginalCommand。卸载策略：
  //   scope=project → 把项目级 statusLine 写回原 {type, command}
  //   scope=user / 缺失 → 直接删项目级条目（用户的 ~/.claude/settings.json
  //     从未被 install 触碰，CC 重新解析时会回到用户级）
  if (settings.statusLine?._teamagentTag === STATUS_LINE_TAG) {
    const orig = settings.statusLine._teamagentOriginalCommand;
    const origType = settings.statusLine._teamagentOriginalType;
    const origScope = settings.statusLine._teamagentOriginalScope;
    if (
      typeof orig === "string" &&
      orig.length > 0 &&
      origScope === "project"
    ) {
      settings.statusLine = {
        type: typeof origType === "string" ? origType : "command",
        command: orig,
      };
    } else {
      delete settings.statusLine;
    }
    removedAny = true;
  }

  writeSettings(settingsPath, settings);
  return { settingsPath, removed: removedAny };
}

function shellQuote(p: string): string {
  // 双引号包装 + 反斜杠转义内部引号；适用于 Windows + bash + Claude Code
  if (/^[A-Za-z0-9_./:\\-]+$/.test(p)) return p;
  return `"${p.replace(/"/g, '\\"')}"`;
}

/**
 * B+C scope (2026-05-09): orphan shell-hook scanner.
 *
 * Scans `<cwd>/.claude/hooks/*.sh` and cross-references each filename against
 * the `command` strings in:
 *   - `<cwd>/.claude/settings.json`        (committed, repo-shipped)
 *   - `<cwd>/.claude/settings.local.json`  (gitignored, per-host)
 *
 * A `.sh` is "orphan" when no command string in either file references its
 * basename. Returns the list of orphan basenames sorted alphabetically.
 *
 * Non-throwing: missing dirs / unreadable files / malformed JSON degrade to
 * "no orphans found"; the caller treats this as a soft warning, not an error.
 *
 * Detection is a substring check on the basename (e.g. `laziness-self-report.sh`)
 * — same heuristic used by `isTeamagentEntry`. False-positive rate is low
 * because shell scripts are generally referenced by full filename, but we
 * deliberately do NOT register orphans automatically. The caller decides
 * whether to warn, fail, or interactively prompt.
 */
export function auditOrphanShellHooks(cwd: string): string[] {
  const hooksDir = path.join(cwd, ".claude", "hooks");
  if (!fs.existsSync(hooksDir)) return [];

  let candidates: string[];
  try {
    candidates = fs
      .readdirSync(hooksDir)
      .filter((f) => f.endsWith(".sh"));
  } catch {
    return [];
  }
  if (candidates.length === 0) return [];

  // Aggregate every `command` string from both settings files.
  const commandStrings: string[] = [];
  for (const settingsFile of [
    path.join(cwd, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.local.json"),
  ]) {
    if (!fs.existsSync(settingsFile)) continue;
    try {
      const raw = fs.readFileSync(settingsFile, "utf-8").trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw) as ClaudeSettings;
      if (!parsed.hooks) continue;
      for (const ch of Object.keys(parsed.hooks)) {
        const list = parsed.hooks[ch] as HookEntry[] | undefined;
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
          for (const hookCmd of entry.hooks ?? []) {
            if (typeof hookCmd.command === "string") {
              commandStrings.push(hookCmd.command);
            }
          }
        }
      }
    } catch {
      // malformed json; skip this file
    }
  }

  const orphans = candidates.filter(
    (basename) => !commandStrings.some((c) => c.includes(basename)),
  );
  return orphans.sort();
}
