import {
  applyUserLevelChannelOps,
  findMostRecentSettingsBackup,
  hasTeamagentChannelEntry
} from "./chunk-NBY7IFQJ.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/install-user-hook.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
var SESSION_START_TAG = "teamagent-session-start";
function findDistEntry(filename) {
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "dist", filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(path.dirname(path.dirname(here)), filename);
}
function defaultSessionStartEntry() {
  return findDistEntry("bin-session-start.cjs");
}
function installUserHook(opts = {}) {
  process.stderr.write(
    "[deprecation] `teamagent install-user-hook` is deprecated. `teamagent init` now installs the user-level SessionStart hook automatically. This standalone command will be removed in the next major version (v1.0).\n"
  );
  const home = opts.homeDir ?? os.homedir();
  const settingsPath = path.join(home, ".claude", "settings.json");
  const hookEntry = opts.sessionStartEntry ?? defaultSessionStartEntry();
  if (!fs.existsSync(hookEntry)) {
    throw new Error(
      `SessionStart bundle not found: ${hookEntry}
\u8BF7\u786E\u8BA4 teamagent \u5DF2\u6B63\u786E\u5B89\u88C5 (dist/bin-session-start.cjs \u5B58\u5728)`
    );
  }
  const alreadyInstalled = detectAlreadyInstalledSessionStart(settingsPath);
  applyUserLevelChannelOps(
    home,
    { sessionStartEntry: hookEntry },
    { channelFilter: ["SessionStart"] }
  );
  const stagedPath = path.join(
    home,
    ".teamagent",
    "hooks",
    "bin-session-start.cjs"
  );
  const backupPath = findMostRecentSettingsBackup(settingsPath);
  return {
    settingsPath,
    backupPath,
    hookEntry: stagedPath,
    alreadyInstalled
  };
}
function detectAlreadyInstalledSessionStart(settingsPath) {
  if (!fs.existsSync(settingsPath)) return false;
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8").trim();
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return hasTeamagentChannelEntry(
      parsed,
      "SessionStart",
      SESSION_START_TAG
    );
  } catch {
    return false;
  }
}
function uninstallUserHook(opts = {}) {
  const home = opts.homeDir ?? os.homedir();
  const settingsPath = path.join(home, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return { settingsPath, removed: false };
  const raw = fs.readFileSync(settingsPath, "utf-8").trim();
  if (!raw) return { settingsPath, removed: false };
  let settings;
  try {
    settings = JSON.parse(raw);
  } catch {
    return { settingsPath, removed: false };
  }
  const hooks = settings.hooks;
  if (!hooks?.SessionStart) return { settingsPath, removed: false };
  const before = hooks.SessionStart.length;
  hooks.SessionStart = hooks.SessionStart.filter(
    (h) => !isTeamagentSessionStartEntry(h)
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
    "utf-8"
  );
  return { settingsPath, removed: changed };
}
function isTeamagentSessionStartEntry(entry) {
  if (entry._teamagentTag === SESSION_START_TAG) return true;
  if (entry._teamagentTag) return false;
  const cmds = entry.hooks?.map((c) => c.command ?? "") ?? [];
  return cmds.some((c) => c.includes("bin-session-start.cjs"));
}

export {
  installUserHook,
  uninstallUserHook
};
