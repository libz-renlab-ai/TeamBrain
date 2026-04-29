import {
  type UpdateState,
  type PendingBanner,
} from "@teamagent/core";

export interface UpdaterDeps {
  fetchRemoteSha(): Promise<string | null>;
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
}

export async function runUpdater(deps: UpdaterDeps): Promise<void> {
  if (!deps.acquireLock()) {
    deps.log("lock held by other updater; skip");
    return;
  }
  try {
    const state = deps.readState();
    state.last_check_ts = deps.now();
    deps.writeState(state);

    let remoteSha: string | null;
    try {
      remoteSha = await deps.fetchRemoteSha();
    } catch (e) {
      deps.log(`fetch error: ${(e as Error).message}`);
      return;
    }
    if (!remoteSha) { deps.log("fetch failed or empty"); return; }
    if (remoteSha === state.last_installed_sha) {
      deps.log("up-to-date");
      return;
    }

    deps.log(`update available: ${state.last_installed_sha || "(none)"} -> ${remoteSha}`);
    const backupDir = deps.backupCurrentInstall(state.last_installed_sha);

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
    const banner: PendingBanner = { from: fromSha, to: remoteSha, at: deps.now(), shown: false };
    const success: UpdateState = {
      ...state,
      last_installed_sha: remoteSha,
      installed_at: deps.now(),
      consecutive_install_failures: 0,
      last_install_error: null,
      pending_banner: banner,
    };
    deps.writeState(success);
    deps.pruneOldBackups();
    deps.log(`updated to ${remoteSha}`);
  } finally {
    deps.releaseLock();
  }
}
