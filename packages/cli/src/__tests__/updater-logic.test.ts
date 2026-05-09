import { describe, it, expect, vi } from "vitest";
import { runUpdater, type UpdaterDeps } from "../updater-logic.js";
import { defaultUpdateState, type UpdateState } from "@teamagent/core";
import type { FetchShaResult } from "../github-api.js";

// Helper factories for the new FetchShaResult shape
function okResult(sha = "new-sha", etag: string | null = "W/\"abc\"", source: "200" | "304" = "200"): FetchShaResult {
  return { ok: true, sha, etag, source };
}

function failResult(
  reason: "rate_limit_anonymous" | "rate_limit_authed" | "auth" | "not_found" | "server" | "network" | "parse",
  message = "error",
  status = 0,
): FetchShaResult {
  return { ok: false, reason, status, message };
}

function makeDeps(over: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    fetchRemoteSha: vi.fn().mockResolvedValue(okResult()),
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
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("same")),
    });
    await runUpdater(deps);
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
    expect(deps.writeState).toHaveBeenCalled();
    expect(lastWrittenState(deps).last_check_ts).toBe(1000);
  });

  it("noop when fetch fails (returns ok:false/network)", async () => {
    const deps = makeDeps({
      fetchRemoteSha: vi.fn().mockResolvedValue(failResult("network", "ECONNREFUSED")),
    });
    await runUpdater(deps);
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
  });

  it("happy path: install + migrate + write banner", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("new-sha", "W/\"etag1\"")),
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
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("new")),
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
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("new")),
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

  // ────────────────────────────────────────────────────────────────
  // New tests for § 2.5 backoff and rate-limit state management
  // ────────────────────────────────────────────────────────────────

  it("backoff guard: skips fetch when now() < next_check_after_ts", async () => {
    const state = {
      ...defaultUpdateState(),
      next_check_after_ts: 5000,   // backoff window ends at t=5000
      consecutive_rate_limits: 1,
    };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      now: () => 3000,              // current time is before backoff window
    });
    await runUpdater(deps);
    expect(deps.fetchRemoteSha).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("backoff active until"));
  });

  it("backoff guard: proceeds when now() >= next_check_after_ts", async () => {
    const state = {
      ...defaultUpdateState(),
      last_installed_sha: "same",
      next_check_after_ts: 500,    // window already expired
    };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      now: () => 1000,             // past the window
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("same")),
    });
    await runUpdater(deps);
    expect(deps.fetchRemoteSha).toHaveBeenCalled();
  });

  it("backoff guard: proceeds when next_check_after_ts is 0", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "same", next_check_after_ts: 0 };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("same")),
    });
    await runUpdater(deps);
    expect(deps.fetchRemoteSha).toHaveBeenCalled();
  });

  it("rate_limit_anonymous: increments consecutive_rate_limits and sets next_check_after_ts", async () => {
    const state = { ...defaultUpdateState(), consecutive_rate_limits: 0 };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      now: () => 0,
      fetchRemoteSha: vi.fn().mockResolvedValue(
        failResult("rate_limit_anonymous", "GitHub anonymous rate limit exhausted; set TEAMAGENT_GITHUB_TOKEN to authenticate (5000 req/h)", 403),
      ),
    });
    await runUpdater(deps);
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
    const written = lastWrittenState(deps);
    expect(written.consecutive_rate_limits).toBe(1);
    // First backoff: 2^(1-1) = 1h = 3600000ms
    expect(written.next_check_after_ts).toBe(3600 * 1000);
    // Must NOT touch install failure fields
    expect(written.consecutive_install_failures).toBe(0);
    expect(written.last_install_error).toBeNull();
  });

  it("rate_limit_authed: increments counter and sets backoff without touching install_failures", async () => {
    const state = {
      ...defaultUpdateState(),
      consecutive_rate_limits: 2,
      consecutive_install_failures: 0,
    };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      now: () => 0,
      fetchRemoteSha: vi.fn().mockResolvedValue(
        failResult("rate_limit_authed", "GitHub authenticated rate limit exhausted; retry later", 403),
      ),
    });
    await runUpdater(deps);
    const written = lastWrittenState(deps);
    expect(written.consecutive_rate_limits).toBe(3);
    // 2^(3-1) = 4h = 4 * 3600000ms
    expect(written.next_check_after_ts).toBe(4 * 3600 * 1000);
    // consecutive_install_failures must NOT be bumped
    expect(written.consecutive_install_failures).toBe(0);
  });

  it("rate-limit exponential backoff caps at 24h", async () => {
    const state = {
      ...defaultUpdateState(),
      consecutive_rate_limits: 10, // already had many failures
    };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      now: () => 0,
      fetchRemoteSha: vi.fn().mockResolvedValue(
        failResult("rate_limit_anonymous", "rate limited", 403),
      ),
    });
    await runUpdater(deps);
    const written = lastWrittenState(deps);
    // 2^10 = 1024h capped at 24h
    expect(written.next_check_after_ts).toBe(24 * 3600 * 1000);
  });

  it("success path: resets consecutive_rate_limits and next_check_after_ts to 0", async () => {
    const state = {
      ...defaultUpdateState(),
      last_installed_sha: "same",
      consecutive_rate_limits: 3,
      next_check_after_ts: 500,   // backoff window already expired (now=1000 > 500)
    };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      now: () => 1000,             // past the backoff window
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("same", "W/\"etag\"")),
    });
    await runUpdater(deps);
    const written = lastWrittenState(deps);
    expect(written.consecutive_rate_limits).toBe(0);
    expect(written.next_check_after_ts).toBe(0);
  });

  it("success path: persists last_branch_etag and last_branch_sha", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "same" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("same", "W/\"abc123\"")),
    });
    await runUpdater(deps);
    const written = lastWrittenState(deps);
    expect(written.last_branch_etag).toBe("W/\"abc123\"");
    expect(written.last_branch_sha).toBe("same");
  });

  it("success path: persists empty string for etag when server omits it", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "same" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("same", null)),
    });
    await runUpdater(deps);
    const written = lastWrittenState(deps);
    expect(written.last_branch_etag).toBe("");
  });

  it("non-rate-limit failure: logs reason+message but does NOT write state (no side effects)", async () => {
    const state = { ...defaultUpdateState() };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(failResult("server", "GitHub server error 503", 503)),
    });
    await runUpdater(deps);
    // Only the upfront last_check_ts write should have occurred, not a state
    // update for rate-limit backoff
    const calls = (deps.writeState as ReturnType<typeof vi.fn>).mock.calls;
    // The upfront write sets last_check_ts; subsequent writes must NOT set
    // consecutive_rate_limits > 0
    for (const call of calls) {
      expect((call[0] as UpdateState).consecutive_rate_limits).toBe(0);
    }
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("fetch failed"));
  });
});
