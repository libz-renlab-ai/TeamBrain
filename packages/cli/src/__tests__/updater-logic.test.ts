import { describe, it, expect, vi } from "vitest";
import { runUpdater, type UpdaterDeps } from "../updater-logic.js";
import { defaultUpdateState, type UpdateState } from "@teamagent/core";

function makeDeps(over: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    fetchRemoteSha: vi.fn().mockResolvedValue("new-sha"),
    runNpmInstall: vi.fn().mockResolvedValue({ ok: true }),
    runMigrateAuto: vi.fn().mockResolvedValue({ ok: true }),
    backupCurrentInstall: vi.fn().mockReturnValue("/tmp/backup-old"),
    restoreFromBackup: vi.fn(),
    pruneOldBackups: vi.fn(),
    readState: vi.fn().mockReturnValue(defaultUpdateState()),
    writeState: vi.fn(),
    log: vi.fn(),
    now: () => 1000,
    acquireLock: vi.fn().mockReturnValue(true),
    releaseLock: vi.fn(),
    ...over,
  };
}

function lastWrittenState(deps: UpdaterDeps): UpdateState {
  const calls = (deps.writeState as ReturnType<typeof vi.fn>).mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error("writeState was never called");
  return last[0] as UpdateState;
}

describe("runUpdater", () => {
  it("noop when remote sha matches local", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "same" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue("same"),
    });
    await runUpdater(deps);
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
    expect(deps.writeState).toHaveBeenCalled();
    expect(lastWrittenState(deps).last_check_ts).toBe(1000);
  });

  it("noop when fetch fails (returns null)", async () => {
    const deps = makeDeps({ fetchRemoteSha: vi.fn().mockResolvedValue(null) });
    await runUpdater(deps);
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
  });

  it("happy path: install + migrate + write banner", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue("new-sha"),
    });
    await runUpdater(deps);
    expect(deps.backupCurrentInstall).toHaveBeenCalledWith("old");
    expect(deps.runNpmInstall).toHaveBeenCalled();
    expect(deps.runMigrateAuto).toHaveBeenCalled();
    const written = lastWrittenState(deps);
    expect(written.last_installed_sha).toBe("new-sha");
    expect(written.consecutive_install_failures).toBe(0);
    expect(written.pending_banner).toMatchObject({
      from: "old", to: "new-sha", shown: false,
    });
  });

  it("rolls back on npm install failure", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue("new"),
      runNpmInstall: vi.fn().mockResolvedValue({ ok: false, error: "boom" }),
    });
    await runUpdater(deps);
    expect(deps.restoreFromBackup).toHaveBeenCalledWith("/tmp/backup-old");
    expect(deps.runMigrateAuto).not.toHaveBeenCalled();
    const written = lastWrittenState(deps);
    expect(written.consecutive_install_failures).toBe(1);
    expect(written.last_install_error).toContain("boom");
    expect(written.last_installed_sha).toBe("old");
  });

  it("rolls back on migrate failure", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue("new"),
      runMigrateAuto: vi.fn().mockResolvedValue({ ok: false, error: "schema" }),
    });
    await runUpdater(deps);
    expect(deps.restoreFromBackup).toHaveBeenCalledWith("/tmp/backup-old");
    const written = lastWrittenState(deps);
    expect(written.last_installed_sha).toBe("old");
    expect(written.last_install_error).toContain("schema");
  });

  it("skips when lock cannot be acquired", async () => {
    const deps = makeDeps({ acquireLock: vi.fn().mockReturnValue(false) });
    await runUpdater(deps);
    expect(deps.fetchRemoteSha).not.toHaveBeenCalled();
  });

  it("releases lock even on error", async () => {
    const deps = makeDeps({
      fetchRemoteSha: vi.fn().mockRejectedValue(new Error("net")),
    });
    await runUpdater(deps);
    expect(deps.releaseLock).toHaveBeenCalled();
  });
});
