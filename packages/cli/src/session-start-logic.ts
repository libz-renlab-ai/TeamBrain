/**
 * SessionStart logic. No top-level side effects — safe to import from tests.
 */
import { spawn } from "node:child_process";
import fs, { appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import os from "node:os";
import {
  parseUpdateState,
  defaultUpdateState,
  shouldCheckUpdate,
  shouldPromptUpgrade,
  parseChangelog,
  renderUpgradePrompt,
  makeUpdatePromptShownEvent,
  type UpdateState,
} from "@teamagent/core";
import { loadBundledChangelog } from "./changelog-loader.js";
import { rotateIfTooLarge } from "./log-rotate.js";
import { findTeamagentRoot } from "./lib/walk-up.js";
import { hasProjectMarker } from "./lib/project-markers.js";
import { withUpdateStateLock } from "./lib/update-state-lock.js";
import {
  emitUpgradeEventSync,
  type EmitUpgradeOptions,
} from "./lib/upgrade-event-emitter.js";

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
  // Issue #244: serialize the read-modify-write under a file lock so concurrent
  // SessionStart hooks + foreground CLI commands don't lose updates. This
  // helper used to do a non-atomic plain `writeFileSync`; the lock indirectly
  // upgrades the write to atomic tmp+rename too. Caller passes a fully formed
  // state, so the mutator is a no-op replacement returning `s`.
  try {
    withUpdateStateLock(teamagentHome(), () => s);
  } catch { /* silent — same fail-soft semantic as before */ }
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
 *
 * Post-merge PR-creator force-update feature: when `pending_banner.pr_creator`
 * is true (set by runUpdater after matching latest.json::pr_creator_login
 * against the local user's identity signals), render a distinct 🎯 template
 * naming the PR number. Otherwise render the legacy ✨ template unchanged
 * so non-creator updates look exactly as before.
 */
export function maybeShowPendingBanner(
  stderr: (s: string) => void = (s) => process.stderr.write(s),
): void {
  const state = readUpdateState();
  if (!state.pending_banner || state.pending_banner.shown) return;
  const { from, to, pr_creator, pr_number } = state.pending_banner;
  const fromShort = from ? from.slice(0, 7) : "(初装)";
  const toShort = to.slice(0, 7);
  if (pr_creator) {
    const prTag =
      typeof pr_number === "number" ? `PR #${pr_number}` : "你刚 merge 的 PR";
    stderr(
      `🎯 TeamAgent: 你的 ${prTag} 已 merge — 自动更新到 ${toShort} (强制刷新)\n`,
    );
    stderr(`   本次会话生效。详情: teamagent update --status\n`);
  } else {
    stderr(`✨ TeamAgent: 已自动更新 ${fromShort} → ${toShort}\n`);
    stderr(`   本次会话生效。详情: teamagent update --status\n`);
  }
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

/**
 * Issue #313 — Tier 3 SessionStart banner.
 *
 * When the auto-update version-check has failed (Pages + npm both unreachable),
 * `runUpdater` writes `last_install_error` with the prefix `"version-check failed:"`
 * and does NOT bump `consecutive_install_failures` (that counter is reserved
 * for real install/migrate failures, see maybeShowReinstallBanner above).
 *
 * This banner replaces the previous silent 24h backoff behaviour: instead of
 * a quiet hour-long sleep, the user sees a concrete failure cause and three
 * recovery paths (manual install / retry / set token).
 *
 * **No throttle**: fires every SessionStart while the error string persists,
 * because the failure is dynamic — next successful version-check writes
 * `last_install_error: null` (in runUpdater) which stops the trigger. If
 * Pages stays down for hours, the user really should know each session.
 * (Contrast with maybeShowReinstallBanner which throttles 24h because the
 * underlying failure mode is persistent and the user already saw the path.)
 *
 * Trigger: `last_install_error` starts with `"version-check failed:"`.
 *
 * Self-clearing: next successful Pages OR npm fetch clears the error string.
 */
export function maybeShowVersionCheckBanner(
  stderr: (s: string) => void = (s) => process.stderr.write(s),
): void {
  const state = readUpdateState();
  const err = state.last_install_error ?? "";
  if (!err.startsWith("version-check failed:")) return;

  stderr("⚠️  TeamAgent: 暂时查不到新版本\n");
  stderr(`   ${err}\n`);
  stderr("   建议:\n");
  stderr("     • 手动: npm i -g teamagent@latest\n");
  stderr("     • 或等下次启动 (我们会重试)\n");
  stderr("     • 高级用户: 设 TEAMAGENT_GITHUB_TOKEN 走认证通道\n");
}

// ─── issue #225: soft-force upgrade prompt ───────────────────────────────

/**
 * Issue #225 — soft-force upgrade prompt (gstack-style).
 *
 * Renders the multi-line stderr banner with version line, what's-new bullets,
 * and three CLI choices (--now / --snooze / --never) when:
 *   - state.never_prompt is false
 *   - TEAMAGENT_NEVER_PROMPT env var is not "1"
 *   - state.snooze_until_ts has elapsed
 *   - state has a pending_banner (set by background updater on successful
 *     install) OR the caller passes an explicit pendingToVersion
 *
 * Does NOT mark `pending_banner.shown = true` — the legacy
 * `maybeShowPendingBanner` mark-shown semantics are intentionally preserved
 * for the "已自动更新" post-install one-shot, but the upgrade-available
 * banner re-fires every SessionStart until the user picks A/B/C. That's
 * the whole point of soft-force.
 */
export function maybeShowUpgradePrompt(
  stderr: (s: string) => void = (s) => process.stderr.write(s),
  now: () => number = () => Date.now(),
  loadChangelog: () => string = loadBundledChangelog,
  emitOpts: EmitUpgradeOptions = {},
): void {
  const state = readUpdateState();
  const decision = shouldPromptUpgrade({
    state,
    now: now(),
    env: process.env,
  });
  if (!decision) return;

  const banner = state.pending_banner;
  if (!banner) return; // shouldPromptUpgrade also requires this; defense

  const fromVersion = state.last_installed_version || "";
  // Read CHANGELOG once and reuse it for BOTH version inference and bullet
  // parsing — calling the loader twice (once here, once in guessVersion)
  // double-reads dist/CHANGELOG.md and breaks tests that inject a fixture
  // since guessVersion would silently fall back to the real on-disk copy.
  const changelogContent = (() => {
    try {
      return loadChangelog();
    } catch {
      return "";
    }
  })();
  // banner.to is a SHA in older flows; the soft-force surface needs a
  // semver-like string. Fall back to the SHA's first 7 chars when CHANGELOG
  // is missing — the prompt still shows the user "something is available"
  // even with an empty bullet list.
  const toVersion = guessVersion(changelogContent, banner.to);
  const bullets = parseChangelog(changelogContent, fromVersion, toVersion, {
    maxBullets: 7,
  });

  stderr(
    renderUpgradePrompt({
      fromVersion,
      toVersion,
      bullets,
      snoozeLevel: state.snooze_level,
    }),
  );
  // Issue #245: emit AttributionBus event + persist to events.db so the
  //装机率/snooze 转化率 telemetry has a row per banner impression. Done
  // AFTER the stderr write so a faulty event log cannot mask the banner.
  // Best-effort: emitUpgradeEventSync swallows IO failures.
  try {
    emitUpgradeEventSync(
      makeUpdatePromptShownEvent({
        fromVer: fromVersion,
        toVer: toVersion,
        snoozeLevel: state.snooze_level,
        nowMs: now(),
      }),
      emitOpts,
    );
  } catch { /* never block banner on telemetry */ }
  // No state mutation: the prompt re-fires every SessionStart until the user
  // picks --now (clears snooze, runs updater) / --snooze (advances level) /
  // --never (sets never_prompt=true). That's the soft-force.
}

/**
 * If the supplied CHANGELOG content has an H2 heading newer than what's
 * installed, prefer that as the toVersion so the bullet list is non-empty.
 * Otherwise return the SHA's first 7 chars (banner.to) as a last-resort
 * label — the prompt still surfaces "an upgrade is available."
 *
 * Pure helper — takes the changelog content as input rather than re-loading
 * so callers (and tests) control exactly which CHANGELOG drives both the
 * version label and the bullet list.
 */
function guessVersion(changelogContent: string, fallback: string): string {
  if (changelogContent && changelogContent.length > 0) {
    const newest = changelogContent.match(
      /^##\s+(?:\[)?(\d+\.\d+\.\d+(?:[.-][\w.]+)?)(?:\])?/m,
    );
    if (newest && newest[1]) return newest[1];
  }
  return fallback ? fallback.slice(0, 7) : "(unknown)";
}
