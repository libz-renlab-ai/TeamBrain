import {
  NODE_SQLITE_FLAGS_STR
} from "./chunk-DC7TE56Y.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/install-hook.ts
init_esm_shims();
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// ../cli/src/lib/user-level-hook-shim.ts
init_esm_shims();
function toForwardSlash(p) {
  return p.replace(/\\/g, "/");
}
function shellQuote(p) {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(p)) return p;
  return `"${p.replace(/"/g, '\\"')}"`;
}
function buildUserLevelHookCommand(stagedPath) {
  const q = shellQuote(toForwardSlash(stagedPath));
  return `bash -c '[ -f "$1" ] || exit 0; exec node ${NODE_SQLITE_FLAGS_STR} "$1"' _ ${q}`;
}

// ../cli/src/commands/install-hook.ts
function sleepSync(ms) {
  try {
    if (process.platform === "win32") {
      execSync(`timeout /t 1 /nobreak`, { stdio: "ignore", windowsHide: true });
    } else {
      execSync(`sleep ${(ms / 1e3).toFixed(2)}`, { stdio: "ignore" });
    }
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
    }
  }
}
var HOOK_TAG = "teamagent-pre-tool-use";
var POST_HOOK_TAG = "teamagent-post-tool-use";
var USER_PROMPT_TAG = "teamagent-user-prompt-submit";
var STOP_HOOK_TAG = "teamagent-stop";
var STATUS_LINE_TAG = "teamagent-statusline";
var SESSION_START_TAG = "teamagent-session-start";
var SESSION_END_TAG = "teamagent-session-end";
var PRE_COMPACT_TAG = "teamagent-pre-compact";
function cliRoot() {
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
  return path.dirname(path.dirname(here));
}
function defaultHookEntry() {
  return path.join(cliRoot(), "dist", "bin-pre-tool-use.cjs");
}
function defaultPostHookEntry() {
  return path.join(cliRoot(), "dist", "bin-post-tool-use.cjs");
}
function defaultSessionStartEntry() {
  return path.join(cliRoot(), "dist", "bin-session-start.cjs");
}
function defaultSessionEndEntry() {
  return path.join(cliRoot(), "dist", "bin-session-end.cjs");
}
function defaultPreCompactEntry() {
  return path.join(cliRoot(), "dist", "bin-pre-compact.cjs");
}
function toForwardSlash2(p) {
  return p.replace(/\\/g, "/");
}
function stageBundleToUserTeamagent(srcDistPath, homeDir) {
  const dest = path.join(homeDir, ".teamagent", "hooks", path.basename(srcDistPath));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const srcStat = fs.statSync(srcDistPath);
    const destStat = fs.statSync(dest);
    if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
      return dest;
    }
  } catch {
  }
  const tmp = `${dest}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    fs.copyFileSync(srcDistPath, tmp);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
    }
    throw err;
  }
  return dest;
}
var CHANNEL_BUNDLE_FILENAMES = {
  PreToolUse: ["bin-pre-tool-use.cjs"],
  PostToolUse: ["bin-post-tool-use.cjs"],
  UserPromptSubmit: ["bin-user-prompt-submit.cjs"],
  Stop: ["bin-stop.cjs"],
  SessionStart: ["bin-session-start.cjs"],
  SessionEnd: ["bin-session-end.cjs"],
  PreCompact: ["bin-pre-compact.cjs"]
};
function isTeamagentEntry(entry, channel) {
  if (entry._teamagentTag) return true;
  const filenames = CHANNEL_BUNDLE_FILENAMES[channel];
  const cmds = entry.hooks?.map((c) => c.command ?? "") ?? [];
  return cmds.some((c) => filenames.some((f) => c.includes(f)));
}
var ALL_CHANNELS = [
  { channel: "PreToolUse", tag: HOOK_TAG, bundleFilename: "bin-pre-tool-use.cjs", matcher: "Bash|Write|Edit|WebFetch", timeout: 30, scopes: ["project", "user"] },
  { channel: "PostToolUse", tag: POST_HOOK_TAG, bundleFilename: "bin-post-tool-use.cjs", matcher: "Bash|Write|Edit|WebFetch", timeout: 30, scopes: ["project", "user"] },
  { channel: "UserPromptSubmit", tag: USER_PROMPT_TAG, bundleFilename: "bin-user-prompt-submit.cjs", timeout: 10, scopes: ["project", "user"] },
  { channel: "Stop", tag: STOP_HOOK_TAG, bundleFilename: "bin-stop.cjs", timeout: 60, scopes: ["project", "user"] },
  { channel: "SessionEnd", tag: SESSION_END_TAG, bundleFilename: "bin-session-end.cjs", timeout: 30, scopes: ["project", "user"] },
  { channel: "PreCompact", tag: PRE_COMPACT_TAG, bundleFilename: "bin-pre-compact.cjs", timeout: 30, scopes: ["project", "user"] },
  // user-level only. SessionStart is whole-machine semantics (the SessionStart
  // hook auto-inits any project's knowledge.db).
  { channel: "SessionStart", tag: SESSION_START_TAG, bundleFilename: "bin-session-start.cjs", timeout: 10, scopes: ["user"] }
];
function enumerateInstallTableBundlePaths() {
  const root = cliRoot();
  return ALL_CHANNELS.map((def) => ({
    channel: def.channel,
    tag: def.tag,
    bundleFilename: def.bundleFilename,
    absPath: path.join(root, "dist", def.bundleFilename),
    scopes: def.scopes
  }));
}
var ALL_HOOK_CHANNELS = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Stop",
  "SessionStart",
  "SessionEnd",
  "PreCompact"
];
function applyChannelOps(opts) {
  const { scope, settings, resolveBundle, homeDir, channelFilter } = opts;
  if (!settings.hooks) settings.hooks = {};
  for (const def of ALL_CHANNELS) {
    if (!def.scopes.includes(scope)) continue;
    if (channelFilter && !channelFilter.has(def.channel)) continue;
    if (settings.hooks[def.channel]) {
      const list = settings.hooks[def.channel];
      settings.hooks[def.channel] = list.filter((h) => {
        if (h._teamagentTag === def.tag) return false;
        if (!h._teamagentTag && isTeamagentEntry(h, def.channel)) return false;
        return true;
      });
    }
    const bundlePath = resolveBundle(def.bundleFilename);
    if (!bundlePath || !fs.existsSync(bundlePath)) {
      process.stderr.write(
        `teamagent: skipping channel ${def.channel} \u2014 bundle ${def.bundleFilename} not found
`
      );
      continue;
    }
    let command;
    if (scope === "user") {
      let pathForCommand;
      try {
        pathForCommand = stageBundleToUserTeamagent(bundlePath, homeDir);
      } catch (err) {
        process.stderr.write(
          `teamagent install-hook: failed to stage ${path.basename(bundlePath)} (${err?.code ?? err?.message ?? err}) \u2014 falling back to in-place dist path
`
        );
        pathForCommand = bundlePath;
      }
      command = buildUserLevelHookCommand(pathForCommand);
    } else {
      command = `node ${NODE_SQLITE_FLAGS_STR} ${shellQuote2(toForwardSlash2(bundlePath))}`;
    }
    if (!settings.hooks[def.channel]) settings.hooks[def.channel] = [];
    const newEntry = {
      _teamagentTag: def.tag,
      hooks: [{ type: "command", command, timeout: def.timeout }]
    };
    if (def.matcher) newEntry.matcher = def.matcher;
    settings.hooks[def.channel].push(newEntry);
  }
  for (const ch of ALL_HOOK_CHANNELS) {
    const list = settings.hooks[ch];
    if (Array.isArray(list) && list.length === 0) delete settings.hooks[ch];
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
}
function hasTeamagentChannelEntry(settings, channel, tag) {
  const list = settings.hooks?.[channel];
  if (!Array.isArray(list)) return false;
  return list.some((h) => {
    if (h._teamagentTag === tag) return true;
    if (!h._teamagentTag && isTeamagentEntry(h, channel)) return true;
    return false;
  });
}
function applyUserLevelChannelOps(homeDir, entries, opts = {}) {
  const userSettingsPath = path.join(homeDir, ".claude", "settings.json");
  const filenameToPath = {
    "bin-pre-tool-use.cjs": entries.hookEntry,
    "bin-post-tool-use.cjs": entries.postHookEntry,
    "bin-user-prompt-submit.cjs": entries.userPromptEntry,
    "bin-stop.cjs": entries.stopEntry,
    "bin-session-start.cjs": entries.sessionStartEntry,
    "bin-session-end.cjs": entries.sessionEndEntry,
    "bin-pre-compact.cjs": entries.preCompactEntry
  };
  const channelFilter = opts.channelFilter ? new Set(opts.channelFilter) : void 0;
  const { fd, lockPath } = acquireSettingsLock(homeDir);
  try {
    const settings = readSettings(userSettingsPath);
    applyChannelOps({
      scope: "user",
      settings,
      resolveBundle: (filename) => filenameToPath[filename] ?? "",
      homeDir,
      channelFilter
    });
    writeSettings(userSettingsPath, settings);
  } finally {
    releaseSettingsLock(fd, lockPath);
  }
}
function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf-8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const bak = `${file}.bak-${ts}`;
    try {
      fs.copyFileSync(file, bak);
    } catch {
    }
    process.stderr.write(
      `teamagent install-hook: ${file} malformed; backed up to ${bak}; starting fresh
`
    );
    return {};
  }
}
var RETENTION_BACKUPS = 5;
function safeMtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}
function listSettingsBackups(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((e) => e.startsWith(`${base}.bak-`)).map((e) => ({ name: e, mtimeMs: safeMtime(path.join(dir, e)) })).sort((a, b) => b.mtimeMs - a.mtimeMs);
}
function findMostRecentSettingsBackup(file) {
  const baks = listSettingsBackups(file);
  const newest = baks[0];
  return newest ? path.join(path.dirname(file), newest.name) : null;
}
function pruneOldBackups(file) {
  const baks = listSettingsBackups(file);
  const dir = path.dirname(file);
  for (const old of baks.slice(RETENTION_BACKUPS - 1)) {
    try {
      fs.unlinkSync(path.join(dir, old.name));
    } catch {
    }
  }
}
function writeSettings(file, settings) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) {
    pruneOldBackups(file);
    const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const bak = `${file}.bak-${ts}`;
    try {
      fs.copyFileSync(file, bak);
    } catch {
    }
  }
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, file);
}
function acquireSettingsLock(homeDir) {
  const lockPath = path.join(homeDir, ".claude", ".settings.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const STALE_MS = 3e4;
  const MAX_RETRIES = 5;
  const SLEEP_MS = 200;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      return { fd, lockPath };
    } catch (err) {
      if (err?.code !== "EEXIST") {
        process.stderr.write(
          `teamagent install-hook: settings lock open failed (${err?.code ?? err}); proceeding without lock
`
        );
        return { fd: null, lockPath };
      }
      try {
        const st = fs.statSync(lockPath);
        const age = Date.now() - st.mtimeMs;
        if (age > STALE_MS) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
          }
          continue;
        }
      } catch {
        continue;
      }
      if (attempt === MAX_RETRIES) {
        process.stderr.write(
          `teamagent install-hook: settings lock contention at ${lockPath} after ${MAX_RETRIES} retries; proceeding without lock
`
        );
        return { fd: null, lockPath };
      }
      sleepSync(SLEEP_MS);
    }
  }
  return { fd: null, lockPath };
}
function releaseSettingsLock(fd, lockPath) {
  if (fd === null) return;
  try {
    fs.closeSync(fd);
  } catch {
  }
  try {
    fs.unlinkSync(lockPath);
  } catch {
  }
}
function installHook(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const settingsPath = path.join(cwd, ".claude", "settings.local.json");
  const homeDir = opts.homeDir ?? os.homedir();
  const hookEntry = opts.hookEntry ?? defaultHookEntry();
  const postHookEntry = opts.postHookEntry ?? defaultPostHookEntry();
  const userPromptEntry = opts.userPromptEntry ?? path.join(cliRoot(), "dist", "bin-user-prompt-submit.cjs");
  const stopEntry = opts.stopEntry ?? path.join(cliRoot(), "dist", "bin-stop.cjs");
  const sessionStartEntry = opts.sessionStartEntry ?? defaultSessionStartEntry();
  const sessionEndEntry = opts.sessionEndEntry ?? defaultSessionEndEntry();
  const preCompactEntry = opts.preCompactEntry ?? defaultPreCompactEntry();
  const statusLineEntry = opts.statusLineEntry ?? path.join(cliRoot(), "dist", "teamagent-statusline.cjs");
  if (!fs.existsSync(hookEntry)) {
    throw new Error(
      `Hook bundle not found: ${hookEntry}
\u8BF7\u5148\u8FD0\u884C: pnpm --filter @teamagent/cli build:hook`
    );
  }
  const settings = readSettings(settingsPath);
  const alreadyInstalled = hasTeamagentChannelEntry(settings, "PreToolUse", HOOK_TAG);
  const postAlreadyInstalled = hasTeamagentChannelEntry(settings, "PostToolUse", POST_HOOK_TAG);
  const projectBundleMap = {
    "bin-pre-tool-use.cjs": hookEntry,
    "bin-post-tool-use.cjs": postHookEntry,
    "bin-user-prompt-submit.cjs": userPromptEntry,
    "bin-stop.cjs": stopEntry,
    "bin-session-end.cjs": sessionEndEntry,
    "bin-pre-compact.cjs": preCompactEntry
    // SessionStart is not project-level; map entry is harmless because
    // ChannelDef.scopes filters it out anyway.
  };
  applyChannelOps({
    scope: "project",
    settings,
    resolveBundle: (filename) => projectBundleMap[filename] ?? "",
    homeDir
  });
  const hasStatusLineBundle = fs.existsSync(statusLineEntry);
  let statusLineSkipped = false;
  let statusLineMergedScope = null;
  if (hasStatusLineBundle) {
    const teamCmd = `node ${NODE_SQLITE_FLAGS_STR} ${shellQuote2(toForwardSlash2(statusLineEntry))}`;
    const existing = settings.statusLine;
    const existingIsTagged = existing?._teamagentTag === STATUS_LINE_TAG;
    const existingIsEmpty = !existing || Object.keys(existing).length === 0;
    let userCmd = null;
    let userType = "command";
    let userScope = null;
    if (existingIsTagged) {
      const orig = existing?._teamagentOriginalCommand;
      const origType = existing?._teamagentOriginalType;
      const origScope = existing?._teamagentOriginalScope;
      if (typeof orig === "string" && orig.length > 0) {
        userCmd = orig;
        userType = typeof origType === "string" ? origType : "command";
        userScope = origScope === "project" || origScope === "user" ? origScope : null;
      }
    } else if (!existingIsEmpty) {
      const cmd = existing?.command;
      const t = existing?.type;
      if (typeof cmd === "string" && cmd.length > 0) {
        userCmd = cmd;
        userType = typeof t === "string" ? t : "command";
        userScope = "project";
      }
    }
    if (!userCmd) {
      const userLevel2 = readUserLevelStatusLine(homeDir);
      if (userLevel2) {
        userCmd = userLevel2.command;
        userType = userLevel2.type;
        userScope = "user";
      }
    }
    const newStatusLine = {
      type: "command",
      command: buildStatusLineCommand(userCmd, teamCmd),
      _teamagentTag: STATUS_LINE_TAG
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
  const userLevel = opts.userLevel ?? true;
  if (userLevel) {
    applyUserLevelChannelOps(homeDir, {
      hookEntry,
      postHookEntry,
      userPromptEntry,
      stopEntry,
      sessionStartEntry,
      sessionEndEntry,
      preCompactEntry
    });
  }
  return {
    settingsPath,
    hookEntry,
    postHookEntry,
    alreadyInstalled,
    postAlreadyInstalled,
    statusLineSkipped,
    statusLineMergedScope
  };
}
function readUserLevelStatusLine(homeDir) {
  const userSettingsPath = path.join(homeDir, ".claude", "settings.json");
  if (!fs.existsSync(userSettingsPath)) return null;
  try {
    const raw = fs.readFileSync(userSettingsPath, "utf-8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const sl = parsed.statusLine;
    if (!sl || typeof sl.command !== "string" || sl.command.length === 0) return null;
    if (sl._teamagentTag) return null;
    return { command: sl.command, type: typeof sl.type === "string" ? sl.type : "command" };
  } catch {
    return null;
  }
}
function escapeForBashSingleQuote(s) {
  return s.replace(/'/g, "'\\''");
}
function buildStatusLineCommand(userCmd, teamCmd) {
  if (!userCmd) return teamCmd;
  const u = escapeForBashSingleQuote(userCmd);
  const t = escapeForBashSingleQuote(teamCmd);
  return `bash -c '_TS_IN=$(cat); printf "%s" "$_TS_IN" | { ${u}; }; echo; printf "%s" "$_TS_IN" | { ${t}; }'`;
}
function uninstallHook(opts = {}) {
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
      (h) => h._teamagentTag !== HOOK_TAG
    );
    if (settings.hooks.PreToolUse.length !== before) removedAny = true;
    if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
  }
  if (settings.hooks.PostToolUse) {
    const before = settings.hooks.PostToolUse.length;
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
      (h) => h._teamagentTag !== POST_HOOK_TAG
    );
    if (settings.hooks.PostToolUse.length !== before) removedAny = true;
    if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
  }
  if (settings.hooks.UserPromptSubmit) {
    const before = settings.hooks.UserPromptSubmit.length;
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
      (h) => h._teamagentTag !== USER_PROMPT_TAG
    );
    if (settings.hooks.UserPromptSubmit.length !== before) removedAny = true;
    if (settings.hooks.UserPromptSubmit.length === 0) delete settings.hooks.UserPromptSubmit;
  }
  if (settings.hooks.Stop) {
    const before = settings.hooks.Stop.length;
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (h) => h._teamagentTag !== STOP_HOOK_TAG
    );
    if (settings.hooks.Stop.length !== before) removedAny = true;
    if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  }
  for (const [channel, tag] of [
    ["SessionStart", SESSION_START_TAG],
    ["SessionEnd", SESSION_END_TAG],
    ["PreCompact", PRE_COMPACT_TAG]
  ]) {
    const list = settings.hooks[channel];
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
  if (settings.statusLine?._teamagentTag === STATUS_LINE_TAG) {
    const orig = settings.statusLine._teamagentOriginalCommand;
    const origType = settings.statusLine._teamagentOriginalType;
    const origScope = settings.statusLine._teamagentOriginalScope;
    if (typeof orig === "string" && orig.length > 0 && origScope === "project") {
      settings.statusLine = {
        type: typeof origType === "string" ? origType : "command",
        command: orig
      };
    } else {
      delete settings.statusLine;
    }
    removedAny = true;
  }
  writeSettings(settingsPath, settings);
  return { settingsPath, removed: removedAny };
}
function shellQuote2(p) {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(p)) return p;
  return `"${p.replace(/"/g, '\\"')}"`;
}
function auditOrphanShellHooks(cwd) {
  const hooksDir = path.join(cwd, ".claude", "hooks");
  if (!fs.existsSync(hooksDir)) return [];
  let candidates;
  try {
    candidates = fs.readdirSync(hooksDir).filter((f) => f.endsWith(".sh"));
  } catch {
    return [];
  }
  if (candidates.length === 0) return [];
  const commandStrings = [];
  for (const settingsFile of [
    path.join(cwd, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.local.json")
  ]) {
    if (!fs.existsSync(settingsFile)) continue;
    try {
      const raw = fs.readFileSync(settingsFile, "utf-8").trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed.hooks) continue;
      for (const ch of Object.keys(parsed.hooks)) {
        const list = parsed.hooks[ch];
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
    }
  }
  const orphans = candidates.filter(
    (basename) => !commandStrings.some((c) => c.includes(basename))
  );
  return orphans.sort();
}

export {
  cliRoot,
  ALL_CHANNELS,
  enumerateInstallTableBundlePaths,
  hasTeamagentChannelEntry,
  applyUserLevelChannelOps,
  findMostRecentSettingsBackup,
  installHook,
  uninstallHook,
  auditOrphanShellHooks
};
