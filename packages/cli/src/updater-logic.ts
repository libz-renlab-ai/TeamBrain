import {
  type UpdateState,
  type PendingBanner,
  isLocalUserPrCreator,
  makeUpdateInstalledEvent,
} from "@teamagent/core";
import type { UpdateInstalledEvent } from "@teamagent/types";
import type { FetchShaResult } from "./github-api.js";
import type { FetchLatestResult } from "./update/fetch-latest.js";
import type { LocalIdentity } from "./lib/local-identity.js";

// Node prints ERR_UNKNOWN_FILE_EXTENSION as:
//   TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for /path/to/foo.ts
// Anchor on that exact phrasing — earlier W15-001 used /\.ts(\b|['"])/ which
// matched any stderr substring containing `.ts` plus punctuation, masking
// real migration failures whose messages happened to mention `.ts`.
const TS_EXT_DEGRADE_RE = /Unknown file extension "\.ts" for [^\r\n]*\.ts(?:\b|['"`]|$)/m;

export function isDevModeTsExtensionError(stderr: string): boolean {
  if (!stderr) return false;
  return (
    stderr.includes("ERR_UNKNOWN_FILE_EXTENSION") &&
    TS_EXT_DEGRADE_RE.test(stderr)
  );
}

export interface UpdaterDeps {
  /**
   * Issue #313 — primary version-check fetcher. Pages → npm fallback. Never
   * calls api.github.com (the whole point of #313). Tests inject a stub.
   * Required.
   */
  fetchLatestVersion(): Promise<FetchLatestResult>;

  /**
   * @deprecated since issue #313 — runUpdater no longer calls this in the
   * main version-check path. Kept on the interface so existing test stubs
   * still compile (they pass it as a no-op). Future install-path SHA pin /
   * rollback tooling may use it. Will be removed when no callers remain.
   */
  fetchRemoteSha?(): Promise<FetchShaResult>;

  runNpmInstall(): Promise<{ ok: boolean; error?: string }>;
  runMigrateAuto(): Promise<{ ok: boolean; error?: string }>;
  /** Returns absolute path to backup directory (or empty string if backup not feasible). */
  backupCurrentInstall(sha: string): string;
  restoreFromBackup(backupDir: string): void;
  pruneOldBackups(): void;
  readState(): UpdateState;
  writeState(state: UpdateState): void;
  log(msg: string): void;
  now(): number;
  acquireLock(): boolean;
  releaseLock(): void;
  /**
   * Issue #245 — fired once after a successful npm install + migrate, with
   * elapsed time spanning both. Optional so existing tests stay green
   * without injecting an emit stub.
   *
   * Returns void or Promise<void>; runUpdater awaits the result so the
   * detached bin-updater process doesn't exit before the events.db row
   * lands (same lifetime concern as the snooze/never CLI commands).
   */
  emitInstalled?: (event: UpdateInstalledEvent) => void | Promise<void>;

  /**
   * Post-merge PR-creator force-update feature. Returns the local user's
   * identity signals (ghLogin / gitEmail / env) so runUpdater can decide
   * whether to stamp a `pr_creator: true` banner.
   *
   * Optional — when omitted, runUpdater behaves as before (never stamps
   * the PR-creator banner, no change to existing tests). The real bin-updater
   * wires this to `gatherLocalIdentity()` from lib/local-identity.ts.
   */
  gatherIdentity?: () => LocalIdentity;
}

export async function runUpdater(deps: UpdaterDeps): Promise<void> {
  if (!deps.acquireLock()) {
    deps.log("lock held by other updater; skip");
    return;
  }
  try {
    const state = deps.readState();

    // Issue #313: Pages/npm 不限速，主路不再设新的 backoff。但仍 honor 旧
    // state 文件遗留的 next_check_after_ts（来自 pre-#313 的 GitHub API 限速
    // 退避），让老用户自然过渡。
    if (state.next_check_after_ts > 0 && deps.now() < state.next_check_after_ts) {
      deps.log(`legacy backoff active until ${new Date(state.next_check_after_ts).toISOString()}; skip`);
      return;
    }

    state.last_check_ts = deps.now();
    deps.writeState(state);

    // fetchLatestVersion contract: MUST NOT throw. Defensive catch in case a
    // future mock or impl violates it.
    let result: FetchLatestResult;
    try {
      result = await deps.fetchLatestVersion();
    } catch (e) {
      deps.log(`fetch error: ${(e as Error).message}`);
      return;
    }

    if (!result.ok) {
      // Issue #313 Tier 3: persist a structured error string so SessionStart
      // surfaces a human-readable banner instead of silently sleeping. Do NOT
      // bump consecutive_rate_limits (no rate limit any more) and DO NOT add
      // new backoff (Pages/npm aren't subject to one).
      const errorMsg = `version-check failed: pages=${result.pagesReason} (${result.pagesMessage}); npm=${result.npmReason} (${result.npmMessage})`;
      deps.writeState({
        ...state,
        consecutive_rate_limits: 0,
        next_check_after_ts: 0,
        last_install_error: errorMsg,
      });
      deps.log(errorMsg);
      return;
    }

    // Success: persist version + (when Pages provided) SHA. Reset legacy
    // backoff counters so old state files heal. CRITICAL: also clear
    // last_install_error if it carries the Tier-3 "version-check failed:"
    // prefix — otherwise the Tier-3 SessionStart banner would keep firing
    // forever after Pages/npm recovered (success path overwrites everything
    // else but the stale error string would persist if we early-returned
    // on the "up-to-date" branch below). Real npm-install / migrate errors
    // (different prefix) are preserved untouched so the existing reinstall
    // banner still surfaces them.
    const remoteVersion = result.version;
    const remoteSha = result.sha ?? "";
    const clearedError =
      state.last_install_error?.startsWith("version-check failed:")
        ? null
        : state.last_install_error;
    deps.writeState({
      ...state,
      consecutive_rate_limits: 0,
      next_check_after_ts: 0,
      last_branch_etag: "",
      last_branch_sha: remoteSha || state.last_branch_sha,
      last_install_error: clearedError,
    });

    if (remoteVersion === state.last_installed_version) {
      deps.log(`up-to-date (${remoteVersion}; source=${result.source})`);
      return;
    }

    deps.log(`update available: ${state.last_installed_version || "(none)"} -> ${remoteVersion} (source=${result.source})`);
    // Backup against installed_sha (install path concept) — separate from
    // version-check (the field stays meaningful as the install fingerprint).
    const backupDir = deps.backupCurrentInstall(state.last_installed_sha);
    // Issue #245: track elapsed time across install + migrate so the
    // emitted update-installed event carries a real durationMs (CEO
    // 关心装机率, 但同样关心 install 是否在退化变慢)。
    const installStartMs = deps.now();

    const installRes = await deps.runNpmInstall();
    if (!installRes.ok) {
      if (backupDir) deps.restoreFromBackup(backupDir);
      const failed = { ...state };
      failed.consecutive_install_failures = state.consecutive_install_failures + 1;
      failed.last_install_error = `npm install failed: ${installRes.error ?? "unknown"}`;
      deps.writeState(failed);
      deps.log(failed.last_install_error);
      return;
    }

    const migrateRes = await deps.runMigrateAuto();
    if (!migrateRes.ok) {
      if (backupDir) deps.restoreFromBackup(backupDir);
      const failed = { ...state };
      failed.consecutive_install_failures = state.consecutive_install_failures + 1;
      failed.last_install_error = `migrate failed: ${migrateRes.error ?? "unknown"}`;
      deps.writeState(failed);
      deps.log(failed.last_install_error);
      return;
    }

    const fromVersion = state.last_installed_version;
    const installedAtMs = deps.now();
    // Post-merge PR-creator force-update feature. When latest.json carries
    // a pr_creator_login AND the local user matches (any of: gh login, env,
    // noreply email), stamp the banner with pr_creator:true + pr_number so
    // session-start-logic renders the 🎯 distinct template. Non-matching
    // users (or absent latest.json fields) get the legacy banner shape.
    let prCreatorBanner: { pr_creator: true; pr_number?: number } | undefined;
    if (result.ok && result.pr_creator_login && deps.gatherIdentity) {
      const identity = deps.gatherIdentity();
      const matched = isLocalUserPrCreator({
        prCreatorLogin: result.pr_creator_login,
        ghLogin: identity.ghLogin,
        env: identity.env,
        gitEmail: identity.gitEmail,
      });
      if (matched) {
        prCreatorBanner = {
          pr_creator: true,
          ...(typeof result.pr_number === "number" ? { pr_number: result.pr_number } : {}),
        };
        deps.log(
          `PR-creator match (${result.pr_creator_login}) — stamping banner with PR #${result.pr_number ?? "?"}`,
        );
      }
    }
    // PendingBanner.from / .to are now version strings (with SHA fallback for
    // pre-#313 state files that only had SHAs persisted). Display layer in
    // session-start-logic uses these as-is.
    const banner: PendingBanner = {
      from: fromVersion || state.last_installed_sha,
      to: remoteVersion,
      at: installedAtMs,
      shown: false,
      ...(prCreatorBanner ?? {}),
    };
    const success: UpdateState = {
      ...state,
      last_installed_version: remoteVersion,
      // When Pages gives us a SHA, pin it too for rollback bookkeeping.
      last_installed_sha: remoteSha || state.last_installed_sha,
      installed_at: installedAtMs,
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: banner,
    };
    deps.writeState(success);
    // Issue #245 review iter-1 P2 fix: emit BEFORE pruneOldBackups. Backup
    // pruning is a maintenance side effect that can throw on disk-full /
    // permission-denied; if it does, the function exits via finally and
    // the install event is silently dropped — telemetry would miss real
    // installs whenever rollback dir cleanup blows up. Emit must follow
    // the persist (so events.db only carries committed installs) but
    // precede the maintenance call.
    if (deps.emitInstalled) {
      try {
        await deps.emitInstalled(
          makeUpdateInstalledEvent({
            fromVer: fromVersion || state.last_installed_sha.slice(0, 7) || "(none)",
            toVer: remoteVersion,
            durationMs: installedAtMs - installStartMs,
            nowMs: installedAtMs,
          }),
        );
      } catch (err) {
        deps.log(`emitInstalled failed: ${(err as Error).message}`);
      }
    }
    deps.pruneOldBackups();
    deps.log(`updated to ${remoteVersion}`);
  } finally {
    deps.releaseLock();
  }
}
