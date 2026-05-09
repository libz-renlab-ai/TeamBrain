import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { buildUserLevelHookCommand } from "../lib/user-level-hook-shim.js";

/**
 * 注册一个**用户级** SessionStart hook 到 `~/.claude/settings.json`。
 *
 * 目的：让 Claude Code 打开**任何**项目时都先跑 auto-init 检测。若项目
 * 缺 `.teamagent/knowledge.db` 且像个正经项目 (有 .git/package.json 等),
 * 后台自动跑 `teamagent init`。
 *
 * 与 `install-hook` 的区别：
 * - `install-hook`    → `<项目>/.claude/settings.local.json` (PreToolUse/Stop 等)
 * - `install-user-hook` → `~/.claude/settings.json`          (SessionStart only)
 *
 * 写前先 backup, 只合并新键, 绝不覆写他人 SessionStart hook。
 */

const SESSION_START_TAG = "teamagent-session-start";

interface ClaudeSettings {
  hooks?: {
    SessionStart?: HookEntry[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
  _teamagentTag?: string;
}
interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

export interface InstallUserHookOptions {
  /** 显式指定 home 目录 (测试用) */
  homeDir?: string;
  /** 显式指定 SessionStart bundle 路径 */
  sessionStartEntry?: string;
}

export interface InstallUserHookResult {
  settingsPath: string;
  backupPath: string | null;
  hookEntry: string;
  alreadyInstalled: boolean;
}

function defaultSessionStartEntry(): string {
  // 同 install-hook 的 cliRoot 查找逻辑
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "dist", "bin-session-start.cjs"))) {
      return path.join(dir, "dist", "bin-session-start.cjs");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(path.dirname(path.dirname(here)), "bin-session-start.cjs");
}

export function installUserHook(
  opts: InstallUserHookOptions = {},
): InstallUserHookResult {
  // B+C scope (2026-05-09): SessionStart registration is now folded into
  // `installHook()`'s user-level write path (`mergeUserLevelHooks`). This
  // standalone command remains functional for backward compatibility but is
  // deprecated — `teamagent init` already performs the same registration.
  // Emitting on stderr so the message reaches CI logs even when callers
  // capture stdout into JSON.
  process.stderr.write(
    "[deprecation] `teamagent install-user-hook` is deprecated. " +
      "`teamagent init` now installs SessionStart at user level via mergeUserLevelHooks. " +
      "This standalone command will be removed in the next major version.\n",
  );

  const home = opts.homeDir ?? os.homedir();
  const settingsPath = path.join(home, ".claude", "settings.json");
  const hookEntry = opts.sessionStartEntry ?? defaultSessionStartEntry();

  if (!fs.existsSync(hookEntry)) {
    throw new Error(
      `SessionStart bundle not found: ${hookEntry}\n` +
        `请确认 teamagent 已正确安装 (dist/bin-session-start.cjs 存在)`,
    );
  }

  // B-091: stage the bundle to a stable user-owned location and reference
  // *that* in settings.json — not the bundle inside whichever node_modules /
  // tmp clone produced this install. Otherwise nvm version switches, npm
  // reinstalls, or `/private/tmp/<repo>` cleanups silently break every
  // future Claude Code SessionStart hook.
  const stagedPath = path.join(home, ".teamagent", "hooks", "bin-session-start.cjs");
  fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
  fs.copyFileSync(hookEntry, stagedPath);

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

  // Backup 已有 settings.json (带时间戳, 不覆盖历史备份)
  let backupPath: string | null = null;
  if (fs.existsSync(settingsPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = `${settingsPath}.bak-${ts}`;
    fs.copyFileSync(settingsPath, backupPath);
  }

  const raw = fs.existsSync(settingsPath)
    ? fs.readFileSync(settingsPath, "utf-8").trim()
    : "";
  const settings: ClaudeSettings = raw ? JSON.parse(raw) : {};
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

  // B-086: legacy entries written before _teamagentTag was added (npm
  // tarball install pre-tag, or different install path) appear as untagged
  // hook entries pointing at some `bin-session-start.cjs`. Plain tag-only
  // dedup misses them and they accumulate across reinstalls. Also strip
  // them here so a re-install consolidates back to a single tagged entry.
  const before = settings.hooks.SessionStart.length;
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
    (h) => !isTeamagentSessionStartEntry(h),
  );
  const removedLegacy = before - settings.hooks.SessionStart.length;

  // After cleanup we always append a fresh tagged entry pointing at the
  // staged bundle path (~/.teamagent/hooks/bin-session-start.cjs).
  // `alreadyInstalled` reflects whether the same tagged entry was already
  // present BEFORE cleanup, so callers can distinguish first-install from
  // re-install for messaging.
  const alreadyInstalled = removedLegacy > 0;
  settings.hooks.SessionStart.push({
    _teamagentTag: SESSION_START_TAG,
    hooks: [
      {
        type: "command",
        // Issue #209: wrap in graceful shim so a missing
        // ~/.teamagent/hooks/bin-session-start.cjs exits 0 silently rather
        // than printing MODULE_NOT_FOUND on every Claude Code launch. See
        // lib/user-level-hook-shim.ts for the full rationale.
        command: buildUserLevelHookCommand(stagedPath),
        timeout: 10,
      },
    ],
  });

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return { settingsPath, backupPath, hookEntry: stagedPath, alreadyInstalled };
}

/**
 * 判定一条 SessionStart hook 是否属于 teamagent。
 *
 * 双重信号：
 * - 显式 `_teamagentTag === SESSION_START_TAG`（强信号）
 * - command 字符串包含 `bin-session-start.cjs`（启发式，覆盖加 tag 之前的旧
 *   安装；该 binary 名字是 teamagent 独占的，与外部 hook 几乎不会冲突）
 */
function isTeamagentSessionStartEntry(entry: HookEntry): boolean {
  if (entry._teamagentTag === SESSION_START_TAG) return true;
  const cmds = entry.hooks?.map((c) => c.command ?? "") ?? [];
  return cmds.some((c) => c.includes("bin-session-start.cjs"));
}

export function uninstallUserHook(
  opts: { homeDir?: string } = {},
): { settingsPath: string; removed: boolean } {
  const home = opts.homeDir ?? os.homedir();
  const settingsPath = path.join(home, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return { settingsPath, removed: false };

  const raw = fs.readFileSync(settingsPath, "utf-8").trim();
  if (!raw) return { settingsPath, removed: false };
  const settings = JSON.parse(raw) as ClaudeSettings;
  if (!settings.hooks?.SessionStart) return { settingsPath, removed: false };

  const before = settings.hooks.SessionStart.length;
  // B-086: also remove untagged legacy entries pointing at any
  // bin-session-start.cjs — they're orphans from pre-tag installs.
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
    (h) => !isTeamagentSessionStartEntry(h),
  );
  const changed = settings.hooks.SessionStart.length !== before;
  if (settings.hooks.SessionStart.length === 0) delete settings.hooks.SessionStart;
  if (settings.hooks && Object.keys(settings.hooks).length === 0)
    delete settings.hooks;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return { settingsPath, removed: changed };
}
