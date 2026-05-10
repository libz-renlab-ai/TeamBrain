import {
  type UpdateState,
  type PendingBanner,
  makeUpdateInstalledEvent,
} from "@teamagent/core";
import type { UpdateInstalledEvent } from "@teamagent/types";
import type { FetchShaResult } from "./github-api.js";

export interface UpdaterDeps {
  fetchRemoteSha(): Promise<FetchShaResult>;
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
   */
  emitInstalled?: (event: UpdateInstalledEvent) => void;
}

export async function runUpdater(deps: UpdaterDeps): Promise<void> {
  if (!deps.acquireLock()) {
    deps.log("lock held by other updater; skip");
    return;
  }
  try {
    const state = deps.readState();

    // Backoff guard (§ 2.5): if a previous rate-limit set next_check_after_ts,
    // skip this cycle until the backoff window expires.
    if (state.next_check_after_ts > 0 && deps.now() < state.next_check_after_ts) {
      deps.log(`backoff active until ${new Date(state.next_check_after_ts).toISOString()}; skip`);
      return;
    }

    state.last_check_ts = deps.now();
    deps.writeState(state);

    // fetchRemoteSha contract: MUST NOT throw. But keep a defensive catch just
    // in case a future mock or implementation violates the contract.
    let result: FetchShaResult;
    try {
      result = await deps.fetchRemoteSha();
    } catch (e) {
      deps.log(`fetch error: ${(e as Error).message}`);
      return;
    }

    if (!result.ok) {
      if (result.reason === "rate_limit_anonymous" || result.reason === "rate_limit_authed") {
        // Exponential backoff: 1h, 2h, 4h, 8h, 16h, 24h, 24h, …
        const next = state.consecutive_rate_limits + 1;
        const delayHours = Math.min(2 ** (next - 1), 24);
        // IMPORTANT: do NOT bump consecutive_install_failures or set
        // last_install_error here. Those fields are reserved for actual
        // install/migrate failures (runNpmInstall / runMigrateAuto).
        // Mixing rate-limit signals into install-failure counters would
        // compound two backoffs and break shouldCheckUpdate gating.
        deps.writeState({
          ...state,
          consecutive_rate_limits: next,
          next_check_after_ts: deps.now() + delayHours * 3600 * 1000,
        });
        deps.log(`rate-limited (${result.reason}); backoff ${delayHours}h`);
        return;
      }
      deps.log(`fetch failed (${result.reason}): ${result.message}`);
      return;
    }

    // Success path: reset rate-limit counters, persist ETag/sha (§ 2.5)
    const remoteSha = result.sha;
    deps.writeState({
      ...state,
      consecutive_rate_limits: 0,
      next_check_after_ts: 0,
      last_branch_etag: result.etag ?? "",
      last_branch_sha: remoteSha,
    });

    if (remoteSha === state.last_installed_sha) {
      deps.log("up-to-date");
      return;
    }

    deps.log(`update available: ${state.last_installed_sha || "(none)"} -> ${remoteSha}`);
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

    const fromSha = state.last_installed_sha;
    const installedAtMs = deps.now();
    const banner: PendingBanner = { from: fromSha, to: remoteSha, at: installedAtMs, shown: false };
    const success: UpdateState = {
      ...state,
      last_installed_sha: remoteSha,
      installed_at: installedAtMs,
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: banner,
    };
    deps.writeState(success);
    deps.pruneOldBackups();
    deps.log(`updated to ${remoteSha}`);
    // Issue #245: emit AFTER persist so events.db only carries fully-
    // committed installs. fromVer/toVer fall back to short SHA when the
    // tracked version string isn't populated yet (last_installed_version
    // can lag behind sha rotation by one SessionStart).
    if (deps.emitInstalled) {
      try {
        deps.emitInstalled(
          makeUpdateInstalledEvent({
            fromVer: state.last_installed_version || fromSha.slice(0, 7) || "(none)",
            toVer: remoteSha.slice(0, 7),
            durationMs: installedAtMs - installStartMs,
            nowMs: installedAtMs,
          }),
        );
      } catch (err) {
        deps.log(`emitInstalled failed: ${(err as Error).message}`);
      }
    }
  } finally {
    deps.releaseLock();
  }
}
