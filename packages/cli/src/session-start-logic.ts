/**
 * SessionStart logic. No top-level side effects — safe to import from tests.
 */
import { spawn } from "node:child_process";
import fs, { appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";
import {
  parseUpdateState,
  serializeUpdateState,
  defaultUpdateState,
  shouldCheckUpdate,
  type UpdateState,
} from "@teamagent/core";
import { rotateIfTooLarge } from "./log-rotate.js";
import { findTeamagentRoot } from "./lib/walk-up.js";
import { hasProjectMarker } from "./lib/project-markers.js";

export const DEFAULT_DEBOUNCE_HOURS = 24;

export type Action =
  | "auto-init"
  | "skip-not-a-project"
  | "skip-auto-init-disabled"
  | "skip-already-initialized";

/**
 * Project markers — cwd must have at least one of these to trigger auto-init.
 * Single source of truth lives in `./lib/project-markers.ts`; this thin wrapper
 * preserves the `isProjectDir` name used elsewhere in this module.
 */
function isProjectDir(cwd: string): boolean {
  return hasProjectMarker(cwd);
}

function autoInitDisabled(cwd: string): boolean {
  // User can opt out per-project, ancestor-project, OR globally.
  // Issue #161 follow-up (PR #181 finding #8): walk up to honor an ancestor
  // project's `auto-init.disabled` marker so a SessionStart from a child cwd
  // of an opted-out parent doesn't auto-init regardless. This walk-up is
  // INDEPENDENT of `findTeamagentRoot` (which requires `knowledge.db`)
  // because a user can opt out BEFORE ever initializing — the ancestor may
  // have `.teamagent/auto-init.disabled` but no `knowledge.db` yet.
  //
  // Mirrors `findTeamagentRoot`'s security guards: home-directory cap +
  // project-marker requirement, both as defense-in-depth against attacker-
  // planted markers in /tmp or similar.
  if (existsSync(join(cwd, ".teamagent", "auto-init.disabled"))) return true;
  if (existsSync(join(os.homedir(), ".teamagent", "auto-init.disabled"))) return true;
  if (ancestorHasAutoInitDisabled(cwd)) return true;
  return false;
}

function ancestorHasAutoInitDisabled(start: string): boolean {
  // Walks from `start`'s parent up to (but not including) `os.homedir()`
  // and the filesystem root. Returns true if ANY ancestor that has a
  // project-marker carries a `.teamagent/auto-init.disabled` file.
  //
  // Defense-in-depth, mirroring `findTeamagentRoot`:
  //   - project-marker requirement rejects bare markers planted in
  //     non-project directories (e.g. /tmp/.teamagent/auto-init.disabled);
  //   - the home-directory boundary stops the walk at `~` (we don't honor
  //     a marker on `~` itself — the global opt-out path is already
  //     checked separately as `~/.teamagent/auto-init.disabled`).
  const homeDir = os.homedir();
  if (start === homeDir) return false;
  let cur = dirname(start);
  while (true) {
    if (cur === homeDir) return false; // do not match `~` itself
    if (isProjectDir(cur)) {
      if (existsSync(join(cur, ".teamagent", "auto-init.disabled"))) return true;
    }
    const parent = dirname(cur);
    if (parent === cur) return false; // fs root
    cur = parent;
  }
}

export function decideAction(cwd: string, _now?: Date, _debounceHours?: number): Action {
  // Issue #161: walk up to honor an ancestor's .teamagent/knowledge.db.
  // SessionStart from a sub-directory of an already-initialized project
  // must NOT auto-init a duplicate child .teamagent/.
  const ancestorRoot = findTeamagentRoot(cwd);
  if (ancestorRoot !== null) return "skip-already-initialized";

  // No ancestor has a DB. Apply the existing per-cwd logic for new projects.
  if (autoInitDisabled(cwd)) return "skip-auto-init-disabled";
  if (!isProjectDir(cwd)) return "skip-not-a-project";
  return "auto-init";
}

export function findMainBin(): string {
  // bin-session-start.cjs sits next to bin.js in dist/
  return join(__dirname, "bin.js");
}

/**
 * Spawn `teamagent init --skip-import --skip-hook=false` asynchronously.
 * Detached so SessionStart hook itself returns fast.
 * Result shown via stderr on next interactive turn; subprocess writes its own
 * progress to a log file under ~/.teamagent/auto-init.log.
 */
export function spawnAutoInit(cwd: string): void {
  const logPath = join(os.homedir(), ".teamagent", "auto-init.log");
  try {
    appendFileSync(
      logPath,
      `[${new Date().toISOString()}] auto-init spawn cwd=${cwd}\n`,
      "utf-8",
    );
  } catch { /* silent */ }
  const child = spawn(
    process.execPath,
    [findMainBin(), "init", "--skip-import"],
    {
      detached: true,
      stdio: "ignore",
      cwd,
      env: { ...process.env, TEAMAGENT_AUTO_INIT: "1" },
      windowsHide: true,
    },
  );
  child.unref();
}

export function logError(kind: string, err: unknown): void {
  try {
    const logPath = join(os.homedir(), ".teamagent", "session-start-errors.log");
    // B-093: bound the log so it does not grow unbounded across sessions.
    rotateIfTooLarge(logPath);
    appendFileSync(logPath, `[${new Date().toISOString()}] session-start:${kind} ${String(err)}\n`, "utf-8");
  } catch { /* silent */ }
}

// ─── auto-update integration ─────────────────────────────────────────────

function teamagentHome(): string {
  return process.env["TEAMAGENT_HOME"] ?? join(os.homedir(), ".teamagent");
}
function updateStatePath(): string { return join(teamagentHome(), "update-state.json"); }
function updateDisabledPath(): string { return join(teamagentHome(), "auto-update.disabled"); }

export function readUpdateState(): UpdateState {
  try {
    if (!existsSync(updateStatePath())) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(updateStatePath(), "utf-8"));
  } catch {
    return defaultUpdateState();
  }
}

export function writeUpdateState(s: UpdateState): void {
  try {
    fs.mkdirSync(teamagentHome(), { recursive: true });
    fs.writeFileSync(updateStatePath(), serializeUpdateState(s), "utf-8");
  } catch { /* silent */ }
}

/** Check whether to spawn updater this SessionStart. */
export function shouldSpawnUpdater(now: Date = new Date()): boolean {
  return shouldCheckUpdate({
    now: now.getTime(),
    state: readUpdateState(),
    env: process.env,
    disabledMarkerExists: existsSync(updateDisabledPath()),
  });
}

/** Detached fire-and-forget spawn of bin-updater.cjs. */
export function spawnUpdater(): void {
  const updaterBin = join(__dirname, "bin-updater.cjs");
  if (!existsSync(updaterBin)) {
    logError("updater-bin-missing", new Error(updaterBin));
    return;
  }
  const child = spawn(process.execPath, [updaterBin], {
    detached: true,
    stdio: "ignore",
    env: process.env,
    windowsHide: true,
  });
  child.unref();
}

/**
 * If a pending banner exists and not yet shown, write to stderr (visible on
 * first turn) and mark shown.
 */
export function maybeShowPendingBanner(
  stderr: (s: string) => void = (s) => process.stderr.write(s),
): void {
  const state = readUpdateState();
  if (!state.pending_banner || state.pending_banner.shown) return;
  const { from, to } = state.pending_banner;
  const fromShort = from ? from.slice(0, 7) : "(初装)";
  stderr(`✨ TeamAgent: 已自动更新 ${fromShort} → ${to.slice(0, 7)}\n`);
  stderr(`   本次会话生效。详情: teamagent update --status\n`);
  state.pending_banner.shown = true;
  writeUpdateState(state);
}

/**
 * B-104: alert the user when auto-update has been failing.
 *
 * Background: pre-5b15ff8 (2026-05-06) installs hard-coded an SSH-only
 * `npm install -g github:...` PACKAGE_SPEC. On Windows / SSH-keyless
 * machines every auto-update attempt fails with `Connection closed by ...
 * port 22`, but the failure was silent — `pending_banner` was only ever
 * set by *successful* updates, so users had no idea their auto-update was
 * broken until they noticed they were stuck on an old version.
 *
 * Trigger: `consecutive_install_failures >= 1` AND `last_install_error`
 * non-empty.
 *
 * Throttle: at most once per `REINSTALL_BANNER_THROTTLE_MS` (24h) so we
 * do not spam stderr every SessionStart while the user works through the
 * manual reinstall. `state.reinstall_banner_shown_at` is updated each
 * time the banner renders.
 *
 * Self-clearing: a successful manual reinstall runs postinstall.mjs which
 * resets `consecutive_install_failures` to 0 → trigger stops matching.
 */
export const REINSTALL_BANNER_THROTTLE_MS = 24 * 60 * 60 * 1000;
const RELEASE_TARBALL_URL =
  "https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz";

export function maybeShowReinstallBanner(
  stderr: (s: string) => void = (s) => process.stderr.write(s),
  now: () => number = () => Date.now(),
): void {
  const state = readUpdateState();
  if (state.consecutive_install_failures < 1) return;
  if (!state.last_install_error) return;
  const sinceLast = now() - state.reinstall_banner_shown_at;
  if (sinceLast < REINSTALL_BANNER_THROTTLE_MS) return;

  stderr(
    `⚠️  TeamAgent: 自动更新已连续失败 ${state.consecutive_install_failures} 次（旧 SSH 安装地址不可用）。\n`,
  );
  stderr(`   手动重装一次即可恢复:\n`);
  stderr(`   npm install -g ${RELEASE_TARBALL_URL}\n`);
  stderr(`   重装后会自动恢复后台更新；详情: teamagent update --status\n`);

  state.reinstall_banner_shown_at = now();
  writeUpdateState(state);
}
