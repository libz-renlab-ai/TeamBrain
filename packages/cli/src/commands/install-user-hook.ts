import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  applyUserLevelChannelOps,
  findMostRecentSettingsBackup,
  hasTeamagentChannelEntry,
} from "./install-hook.js";

/**
 * v0.11.0 — soft-retire shim for `teamagent install-user-hook`.
 *
 * History:
 * - Before PR #230 (B+C scope) this file owned ~120 lines of bespoke
 *   SessionStart-write logic that duplicated parts of `installHook()`'s
 *   user-level branch.
 * - PR #230 folded SessionStart registration into `installHook()`'s
 *   user-level write path and added a deprecation warning here. The
 *   bespoke implementation stayed for backward compatibility.
 * - This PR (v0.11.0) finishes the job: the body is now a thin shim that
 *   delegates to `applyUserLevelChannelOps` with a `channelFilter` of
 *   `["SessionStart"]`. The standalone command remains functional through
 *   the next major version cycle (deletion is for v1.0).
 *
 * Why "soft-retire" not "delete":
 *   `packages/teamagent/postinstall.mjs:365` calls this command directly
 *   on every `npm install -g teamagent`. Hard-deleting would break the
 *   install path itself; the shim keeps the surface intact while we
 *   complete the deprecation grace period.
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
  // 与 install-hook 的 cliRoot 查找逻辑对齐
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

/**
 * v0.11.0 shim — registers a user-level SessionStart hook by delegating to
 * `applyUserLevelChannelOps`. Preserves the pre-shim return shape exactly so
 * `postinstall.mjs:365` and the existing test suite don't break.
 */
export function installUserHook(
  opts: InstallUserHookOptions = {},
): InstallUserHookResult {
  // v0.11.0 — soft-retire deprecation warning. Kept on stderr so CI logs
  // surface it even when callers capture stdout into JSON. Wording avoids
  // internal helper names so users grepping the message land in this file
  // (the public command surface), not in implementation churn.
  process.stderr.write(
    "[deprecation] `teamagent install-user-hook` is deprecated. " +
      "`teamagent init` now installs the user-level SessionStart hook automatically. " +
      "This standalone command will be removed in the next major version (v1.0).\n",
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

  // Test contract: `alreadyInstalled` reflects whether a TeamAgent SessionStart
  // entry was present BEFORE this call (idempotent re-install detection). Must
  // be checked before applyUserLevelChannelOps strips and re-pushes.
  const alreadyInstalled = detectAlreadyInstalledSessionStart(settingsPath);

  applyUserLevelChannelOps(
    home,
    { sessionStartEntry: hookEntry },
    { channelFilter: ["SessionStart"] },
  );

  // B-091 stable path: applyUserLevelChannelOps stages the bundle to
  // `~/.teamagent/hooks/bin-session-start.cjs`. Mirror the staging convention
  // here so the returned `hookEntry` is the staged path (not the source).
  const stagedPath = path.join(
    home,
    ".teamagent",
    "hooks",
    "bin-session-start.cjs",
  );

  // Test contract: `backupPath` is null on first install (no prior settings.json
  // existed → writeSettings did not create a .bak-<ts> sibling); non-null on
  // re-install pointing at the most recent `.bak-<ts>` left by writeSettings.
  const backupPath = findMostRecentSettingsBackup(settingsPath);

  return { settingsPath, backupPath, hookEntry: stagedPath, alreadyInstalled };
}

/**
 * Inspect `~/.claude/settings.json` for an existing TeamAgent SessionStart
 * entry, including untagged-legacy entries whose command points at
 * `bin-session-start.cjs`. Returns false on missing / malformed file.
 *
 * Implementation delegates to install-hook.ts's shared `hasTeamagentChannelEntry`
 * predicate so the SessionStart "already installed?" test uses the exact same
 * dual-signal logic (tagged OR untagged-legacy bundle filename match) as the
 * channelOps loop's strip+repush idempotency check.
 */
function detectAlreadyInstalledSessionStart(settingsPath: string): boolean {
  if (!fs.existsSync(settingsPath)) return false;
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8").trim();
    if (!raw) return false;
    const parsed = JSON.parse(raw) as ClaudeSettings;
    return hasTeamagentChannelEntry(
      parsed as Parameters<typeof hasTeamagentChannelEntry>[0],
      "SessionStart",
      SESSION_START_TAG,
    );
  } catch {
    return false;
  }
}

/**
 * Uninstall: sweep `~/.claude/settings.json` for any TeamAgent-owned
 * SessionStart entry (tagged + untagged-legacy that point at
 * `bin-session-start.cjs`). Untouched: this function is small enough that
 * delegating into install-hook.ts would be more code than keeping it here.
 */
export function uninstallUserHook(
  opts: { homeDir?: string } = {},
): { settingsPath: string; removed: boolean } {
  const home = opts.homeDir ?? os.homedir();
  const settingsPath = path.join(home, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return { settingsPath, removed: false };

  const raw = fs.readFileSync(settingsPath, "utf-8").trim();
  if (!raw) return { settingsPath, removed: false };

  let settings: ClaudeSettings;
  try {
    settings = JSON.parse(raw) as ClaudeSettings;
  } catch {
    return { settingsPath, removed: false };
  }
  const hooks = settings.hooks;
  if (!hooks?.SessionStart) return { settingsPath, removed: false };

  const before = hooks.SessionStart.length;
  hooks.SessionStart = hooks.SessionStart.filter(
    (h) => !isTeamagentSessionStartEntry(h),
  );
  const changed = hooks.SessionStart.length !== before;
  if (hooks.SessionStart.length === 0) {
    delete hooks.SessionStart;
  }
  if (Object.keys(hooks).length === 0) {
    delete settings.hooks;
  }

  fs.writeFileSync(
    settingsPath,
    JSON.stringify(settings, null, 2) + "\n",
    "utf-8",
  );
  return { settingsPath, removed: changed };
}

function isTeamagentSessionStartEntry(entry: HookEntry): boolean {
  if (entry._teamagentTag === SESSION_START_TAG) return true;
  if (entry._teamagentTag) return false;
  const cmds = entry.hooks?.map((c) => c.command ?? "") ?? [];
  return cmds.some((c) => c.includes("bin-session-start.cjs"));
}
