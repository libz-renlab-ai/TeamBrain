import {
  NODE_SQLITE_FLAGS
} from "./chunk-DC7TE56Y.js";
import {
  attributionToPersistedRow,
  defaultUpdateState,
  makeUpdateNeverSetEvent,
  makeUpdateSnoozedEvent,
  nextSnooze,
  parseUpdateState,
  serializeUpdateState
} from "./chunk-4Y7LCJVR.js";
import "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/update.ts
init_esm_shims();
import fs3 from "fs";
import path3 from "path";
import os2 from "os";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";

// ../cli/src/lib/update-state-lock.ts
init_esm_shims();
import fs from "fs";
import path from "path";
var LOCK_FILENAME = "update-state.lock";
var STATE_FILENAME = "update-state.json";
var MAX_ACQUIRE_ATTEMPTS = 5;
var ACQUIRE_BASE_DELAY_MS = 25;
function withUpdateStateLock(home2, mutator) {
  fs.mkdirSync(home2, { recursive: true });
  const lockPath = path.join(home2, LOCK_FILENAME);
  const statePath2 = path.join(home2, STATE_FILENAME);
  const acquired = acquireLock(lockPath);
  try {
    const current = readState(statePath2);
    const next = mutator(current);
    atomicWrite(statePath2, serializeUpdateState(next));
    return next;
  } finally {
    if (acquired) releaseLock(lockPath);
  }
}
function acquireLock(lockPath) {
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      lastErr = e;
      if (tryStealStaleLock(lockPath)) return true;
      const delay = ACQUIRE_BASE_DELAY_MS * (1 << attempt);
      const until = Date.now() + delay;
      while (Date.now() < until) {
      }
    }
  }
  void lastErr;
  return false;
}
function tryStealStaleLock(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf-8");
    const pid = parseInt(raw.trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      fs.unlinkSync(lockPath);
      return tryCreateLock(lockPath);
    }
  } catch {
    return false;
  }
}
function tryCreateLock(lockPath) {
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}
function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {
  }
}
function readState(statePath2) {
  try {
    if (!fs.existsSync(statePath2)) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(statePath2, "utf-8"));
  } catch {
    return defaultUpdateState();
  }
}
function atomicWrite(target, body) {
  const tmp = `${target}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
  fs.writeFileSync(tmp, body, "utf-8");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (e) {
      const code = e.code;
      if ((code === "EPERM" || code === "EBUSY") && attempt < 2) {
        const until = Date.now() + 50;
        while (Date.now() < until) {
        }
        continue;
      }
      try {
        fs.unlinkSync(tmp);
      } catch {
      }
      throw e;
    }
  }
}

// ../cli/src/lib/upgrade-event-emitter.ts
init_esm_shims();
import os from "os";
import path2 from "path";
import fs2 from "fs";
function defaultEventsDbPath(homeDir) {
  return path2.join(homeDir, ".teamagent", "events.db");
}
function defaultRandSuffix() {
  return Math.random().toString(36).slice(2, 8);
}
async function openRealEventLog(eventsDbPath) {
  try {
    fs2.mkdirSync(path2.dirname(eventsDbPath), { recursive: true });
    const { SqliteEventLog, openDb } = await import("./src-F33CQC7S.js");
    const db = openDb(eventsDbPath);
    const log = new SqliteEventLog(db);
    const wrapped = {
      append(row) {
        const flattened = {
          id: row.id,
          kind: row.kind,
          timestamp: row.timestamp,
          schema_version: row.schema_version,
          ...row.payload
        };
        log.append(flattened);
      },
      close: () => log.close()
    };
    return { log: wrapped, close: () => log.close() };
  } catch {
    return null;
  }
}
async function emitUpgradeEvent(event, opts = {}) {
  const stderr = opts.stderr ?? ((s) => process.stderr.write(s));
  if (opts.bus) {
    try {
      opts.bus.emit(event);
    } catch (err) {
      stderr(`[teamagent upgrade-emit] bus.emit failed: ${err.message}
`);
    }
  }
  const randSuffix = opts.randSuffix ?? defaultRandSuffix;
  const row = attributionToPersistedRow(event, randSuffix());
  let log = opts.eventLog ?? null;
  let owned = false;
  try {
    if (!log) {
      const homeDir = opts.homeDir ?? os.homedir();
      const eventsDbPath = opts.eventsDbPath ?? defaultEventsDbPath(homeDir);
      const opened = await openRealEventLog(eventsDbPath);
      if (!opened) {
        stderr(`[teamagent upgrade-emit] events.db unavailable; skip persist
`);
        return;
      }
      log = opened.log;
      owned = true;
    }
    log.append(row);
  } catch (err) {
    stderr(`[teamagent upgrade-emit] eventLog.append failed: ${err.message}
`);
  } finally {
    if (owned && log?.close) {
      try {
        log.close();
      } catch {
      }
    }
  }
}

// ../cli/src/commands/update.ts
function resolveGithubToken() {
  return process.env["TEAMAGENT_GITHUB_TOKEN"] || process.env["GITHUB_TOKEN"] || process.env["GH_TOKEN"] || void 0;
}
function home() {
  return process.env["TEAMAGENT_HOME"] ?? path3.join(os2.homedir(), ".teamagent");
}
function statePath() {
  return path3.join(home(), "update-state.json");
}
function disabledPath() {
  return path3.join(home(), "auto-update.disabled");
}
function logFilePath() {
  return path3.join(home(), "update.log");
}
function rollbackDir() {
  return path3.join(home(), "rollback");
}
function readState2() {
  try {
    if (!fs3.existsSync(statePath())) return defaultUpdateState();
    return parseUpdateState(fs3.readFileSync(statePath(), "utf-8"));
  } catch {
    return defaultUpdateState();
  }
}
function writeState(s) {
  withUpdateStateLock(home(), () => s);
}
function findUpdaterBinary(baseUrl = import.meta.url) {
  const here = path3.dirname(fileURLToPath(baseUrl));
  const candidates = [
    path3.resolve(here, "bin-updater.cjs"),
    path3.resolve(here, "..", "bin-updater.cjs"),
    path3.resolve(here, "..", "..", "dist", "bin-updater.cjs")
  ];
  return candidates.find((p) => fs3.existsSync(p)) ?? null;
}
async function runUpdateCommand(sub, args = []) {
  switch (sub) {
    case "status":
      return statusCmd();
    case "disable":
      return disableCmd();
    case "enable":
      return enableCmd();
    case "logs":
      return logsCmd();
    case "check":
      return checkCmd();
    case "now":
      return nowCmd();
    case "rollback":
      return rollbackCmd(args[0]);
    case "snooze":
      return snoozeCmd();
    case "never":
      return neverCmd();
  }
}
async function snoozeCmd(emitOpts = {}) {
  const s = readState2();
  const nowMs = Date.now();
  const result = nextSnooze(s.snooze_level, nowMs);
  writeState({
    ...s,
    snooze_level: result.snooze_level,
    snooze_until_ts: result.snooze_until_ts,
    // Issue #225 iter-1: dismissing for THIS pending_banner.to so the prompt
    // stops re-firing across SessionStarts (until a new version's banner lands).
    prompt_dismissed_for_to: s.pending_banner?.to ?? ""
  });
  await emitUpgradeEvent(
    makeUpdateSnoozedEvent({
      level: result.snooze_level,
      untilTs: result.snooze_until_ts,
      nowMs
    }),
    {
      eventsDbPath: path3.join(home(), "events.db"),
      ...emitOpts
    }
  );
  const hours = Math.round((result.snooze_until_ts - nowMs) / (60 * 60 * 1e3));
  const human = hours >= 24 ? `${Math.round(hours / 24)} \u5929` : `${hours} \u5C0F\u65F6`;
  return {
    ok: true,
    output: `\u5347\u7EA7\u63D0\u793A\u5DF2 snooze \u5230 ${new Date(result.snooze_until_ts).toLocaleString()} (\u9759\u97F3\u7EA6 ${human}, \u5F53\u524D snooze \u7EA7\u522B ${result.snooze_level})
\u64A4\u9500: teamagent update --enable
`
  };
}
async function neverCmd(emitOpts = {}) {
  const s = readState2();
  const nowMs = Date.now();
  writeState({
    ...s,
    never_prompt: true,
    // Issue #225 iter-1: also dismiss the current pending_banner.to so even if
    // the user later un-sets never_prompt via --enable, this version doesn't
    // re-fire (a brand new pending_banner.to will fire fresh).
    prompt_dismissed_for_to: s.pending_banner?.to ?? ""
  });
  await emitUpgradeEvent(
    makeUpdateNeverSetEvent({ nowMs }),
    {
      eventsDbPath: path3.join(home(), "events.db"),
      ...emitOpts
    }
  );
  return {
    ok: true,
    output: `\u5347\u7EA7\u63D0\u793A\u5DF2\u6C38\u4E45\u5173\u95ED (never_prompt=true)\u3002
auto-update \u4ECD\u5F00\u542F \u2014 \u5347\u7EA7\u8BF7\u624B\u52A8\u8DD1 teamagent update --now\u3002
\u64A4\u9500: teamagent update --enable
`
  };
}
function statusCmd() {
  const s = readState2();
  const disabled = fs3.existsSync(disabledPath());
  const updaterBin = findUpdaterBinary();
  const lines = [
    `auto-update: ${disabled ? "DISABLED (~/.teamagent/auto-update.disabled)" : "enabled"}`,
    `updater_binary: ${updaterBin ?? "missing (build with: pnpm --filter @teamagent/cli build:hook)"}`,
    `interval_hours: ${s.interval_hours}`,
    `last_check: ${s.last_check_ts ? new Date(s.last_check_ts).toISOString() : "never"}`,
    `last_installed_sha: ${s.last_installed_sha || "(unknown)"}`,
    `last_installed_version: ${s.last_installed_version || "(unknown)"}`,
    `consecutive_install_failures: ${s.consecutive_install_failures}`,
    `last_install_error: ${s.last_install_error ?? "none"}`,
    `pending_banner: ${s.pending_banner ? `${(s.pending_banner.from || "(none)").slice(0, 7)} -> ${s.pending_banner.to.slice(0, 7)} (shown=${s.pending_banner.shown})` : "none"}`,
    // Issue #225: surface soft-force prompt state so support can diagnose
    // "why is the upgrade banner not showing?" without dumping JSON.
    `never_prompt: ${s.never_prompt ? "true (set by --never; clear with --enable)" : "false"}`,
    `snooze_level: ${s.snooze_level}`,
    `snooze_until: ${s.snooze_until_ts ? new Date(s.snooze_until_ts).toISOString() : "(none)"}`
  ];
  return { ok: true, output: lines.join("\n") + "\n" };
}
function disableCmd() {
  fs3.mkdirSync(home(), { recursive: true });
  fs3.writeFileSync(disabledPath(), `disabled at ${(/* @__PURE__ */ new Date()).toISOString()}
`, "utf-8");
  return { ok: true, output: `auto-update disabled (${disabledPath()})
` };
}
function enableCmd() {
  if (fs3.existsSync(disabledPath())) fs3.unlinkSync(disabledPath());
  const s = readState2();
  if (s.never_prompt || s.snooze_level !== 0 || s.snooze_until_ts !== 0 || s.prompt_dismissed_for_to !== "") {
    writeState({
      ...s,
      never_prompt: false,
      snooze_level: 0,
      snooze_until_ts: 0,
      prompt_dismissed_for_to: ""
    });
    return {
      ok: true,
      output: "auto-update enabled (\u5347\u7EA7\u63D0\u793A\u4E5F\u5DF2\u6062\u590D: never_prompt=false, snooze \u5DF2\u91CD\u7F6E)\n"
    };
  }
  return { ok: true, output: "auto-update enabled\n" };
}
function logsCmd() {
  if (!fs3.existsSync(logFilePath())) return { ok: true, output: "(empty)\n" };
  const text = fs3.readFileSync(logFilePath(), "utf-8");
  const lines = text.split(/\r?\n/);
  const tail = lines.slice(-50).join("\n");
  return { ok: true, output: tail + "\n" };
}
function formatTier3Message(failure) {
  return [
    "\u26A0\uFE0F  TeamAgent: \u6682\u65F6\u67E5\u4E0D\u5230\u65B0\u7248\u672C",
    `    Pages: ${failure.pagesReason} \u2014 ${failure.pagesMessage}`,
    `    npm: ${failure.npmReason} \u2014 ${failure.npmMessage}`,
    "    \u5EFA\u8BAE:",
    "      \u2022 \u624B\u52A8: npm i -g teamagent@latest",
    "      \u2022 \u6216\u7B49\u4E0B\u6B21\u542F\u52A8 (\u6211\u4EEC\u4F1A\u91CD\u8BD5)",
    "      \u2022 \u9AD8\u7EA7\u7528\u6237: \u8BBE TEAMAGENT_GITHUB_TOKEN \u8D70\u8BA4\u8BC1\u901A\u9053"
  ].join("\n");
}
async function checkCmd() {
  const { fetchLatestVersion } = await import("./fetch-latest-FU4EABYH.js");
  const s = readState2();
  if (s.next_check_after_ts > 0 && Date.now() < s.next_check_after_ts) {
    const until = new Date(s.next_check_after_ts).toISOString();
    return { ok: false, output: `auto-updater backoff active until ${until}; skip
` };
  }
  const result = await fetchLatestVersion();
  if (!result.ok) {
    return { ok: false, output: formatTier3Message(result) + "\n" };
  }
  writeState({
    ...s,
    last_branch_etag: "",
    last_branch_sha: result.sha ?? s.last_branch_sha,
    consecutive_rate_limits: 0,
    next_check_after_ts: 0
  });
  const localVersion = s.last_installed_version;
  if (result.version === localVersion) {
    return {
      ok: true,
      output: `up-to-date (${localVersion}; source=${result.source})
`
    };
  }
  return {
    ok: true,
    output: `update available: ${localVersion || "(none)"} -> ${result.version} (source=${result.source})
`
  };
}
async function nowCmd() {
  const s = readState2();
  s.last_check_ts = 0;
  s.consecutive_install_failures = 0;
  s.snooze_level = 0;
  s.snooze_until_ts = 0;
  s.never_prompt = false;
  s.prompt_dismissed_for_to = s.pending_banner?.to ?? "";
  writeState(s);
  return new Promise((resolve) => {
    const updaterBin = findUpdaterBinary();
    if (!updaterBin) {
      resolve({ ok: false, output: "bin-updater.cjs not found; run pnpm --filter @teamagent/cli build:hook first\n" });
      return;
    }
    const child = spawn(process.execPath, [...NODE_SQLITE_FLAGS, updaterBin], { stdio: "inherit" });
    child.on("exit", (code) => resolve({
      ok: code === 0,
      output: code === 0 ? "update run finished. teamagent update --status to inspect.\n" : `updater exit ${code}
`
    }));
  });
}
function rollbackCmd(target) {
  if (!fs3.existsSync(rollbackDir())) return { ok: false, output: "no backups\n" };
  const entries = fs3.readdirSync(rollbackDir()).sort();
  if (entries.length === 0) return { ok: false, output: "no backups\n" };
  if (!target) {
    return {
      ok: true,
      output: "available backups:\n" + entries.map((e) => "  " + e).join("\n") + "\n\u7528 teamagent update --rollback <sha> \u6062\u590D\n"
    };
  }
  if (!entries.includes(target)) return { ok: false, output: `backup not found: ${target}
` };
  const src = path3.join(rollbackDir(), target);
  const dist = findGlobalDist();
  if (!dist) return { ok: false, output: "cannot locate global teamagent dist\n" };
  fs3.rmSync(dist, { recursive: true, force: true });
  copyDir(src, dist);
  const s = readState2();
  s.last_installed_sha = target;
  s.pending_banner = null;
  writeState(s);
  return { ok: true, output: `rolled back to ${target}
` };
}
function findGlobalDist() {
  try {
    const root = String(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] })).trim();
    const dist = path3.join(root, "teamagent", "dist");
    if (fs3.existsSync(path3.join(dist, "bin.js"))) return dist;
  } catch {
  }
  return null;
}
function copyDir(src, dest) {
  fs3.mkdirSync(dest, { recursive: true });
  for (const e of fs3.readdirSync(src, { withFileTypes: true })) {
    const s = path3.join(src, e.name);
    const d = path3.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs3.copyFileSync(s, d);
  }
}
function parseUpdateArgs(argv) {
  for (const a of argv) {
    if (a === "--check") return { sub: "check", rest: [] };
    if (a === "--now") return { sub: "now", rest: [] };
    if (a === "--status") return { sub: "status", rest: [] };
    if (a === "--disable") return { sub: "disable", rest: [] };
    if (a === "--enable") return { sub: "enable", rest: [] };
    if (a === "--logs") return { sub: "logs", rest: [] };
    if (a === "--snooze") return { sub: "snooze", rest: [] };
    if (a === "--never") return { sub: "never", rest: [] };
    if (a === "--rollback") {
      const idx = argv.indexOf("--rollback");
      return { sub: "rollback", rest: argv.slice(idx + 1).filter((x) => !x.startsWith("--")) };
    }
  }
  return { sub: "status", rest: [] };
}
export {
  findUpdaterBinary,
  formatTier3Message,
  parseUpdateArgs,
  readState2 as readState,
  resolveGithubToken,
  runUpdateCommand,
  writeState
};
