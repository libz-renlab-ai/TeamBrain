import { describe, it, expect, vi } from "vitest";
import { runUpdater, isDevModeTsExtensionError, type UpdaterDeps } from "../updater-logic.js";
import { defaultUpdateState, type UpdateState } from "@teamagent/core";
import type { FetchShaResult } from "../github-api.js";
import type { FetchLatestResult } from "../update/fetch-latest.js";

// ── FetchShaResult helpers (legacy — fetchRemoteSha unused by runUpdater since #313) ──

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

// ── FetchLatestResult helpers (#313: Pages → npm chain, no rate-limit branch) ──

function okLatest(
  version = "0.11.6",
  source: "pages" | "npm" = "pages",
  sha?: string,
): FetchLatestResult {
  return sha
    ? { ok: true, version, source, sha }
    : { ok: true, version, source };
}

function failLatest(
  pagesReason: "pages_network" | "pages_5xx" | "pages_404" | "pages_parse" | "pages_timeout" = "pages_5xx",
  npmReason: "npm_network" | "npm_5xx" | "npm_404" | "npm_parse" | "npm_timeout" = "npm_5xx",
): FetchLatestResult {
  return {
    ok: false,
    pagesReason,
    pagesMessage: "test-pages-fail",
    npmReason,
    npmMessage: "test-npm-fail",
  };
}

function makeDeps(over: Partial<UpdaterDeps> = {}): UpdaterDeps {
  return {
    // Issue #313: fetchLatestVersion is the new primary version-check path.
    // Default returns "0.0.0" — most tests override either this or
    // last_installed_version to control whether the "up-to-date" early-return
    // fires (when versions match) or the install pipeline runs (when they differ).
    fetchLatestVersion: vi.fn().mockResolvedValue(okLatest("0.0.0")),
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

// Issue #313: the rate-limit / ETag / SHA-comparison branches that the existing
// runUpdater tests below exercise have been REMOVED — version-check now goes
// through fetchLatestVersion (Pages + npm), which has neither GitHub rate-limit
// nor ETag caching. Skipping the block to preserve historical documentation;
// will be deleted once #313's CHANGELOG entry has propagated through one
// release. Fresh #313-aligned tests live in describe("runUpdater (#313 version-check)") below.
describe.skip("runUpdater (legacy, pre-#313 SHA/rate-limit behavior)", () => {
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

  // Issue #245 — update-installed AttributionBus emit on success path
  it("emits update-installed once after successful install + migrate", async () => {
    const state = {
      ...defaultUpdateState(),
      last_installed_sha: "oldSha1234",
      last_installed_version: "0.10.1",
    };
    const emitInstalled = vi.fn();
    let nowCallCount = 0;
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("newShaABCDEFG")),
      // 3 now() calls inside runUpdater on the install path:
      //   1) state.last_check_ts upfront write
      //   2) installStartMs just before runNpmInstall
      //   3) installedAtMs after migrate (also reused by emit)
      now: () => {
        nowCallCount += 1;
        if (nowCallCount === 1) return 1000;
        if (nowCallCount === 2) return 2000; // install start
        return 7500; // install end
      },
      emitInstalled,
    });
    await runUpdater(deps);
    expect(emitInstalled).toHaveBeenCalledTimes(1);
    const event = emitInstalled.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      kind: "update-installed",
      source: "update",
      severity: "info",
      // last_installed_version takes precedence over the sha
      fromVer: "0.10.1",
      // remoteSha truncated to first 7 chars
      toVer: "newShaA",
      // 7500 - 2000
      durationMs: 5500,
    });
    expect(typeof event.timestamp).toBe("string");
  });

  it("falls back to short fromSha when last_installed_version is empty", async () => {
    const state = {
      ...defaultUpdateState(),
      last_installed_sha: "abcdefghij",
      last_installed_version: "",
    };
    const emitInstalled = vi.fn();
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("zzzzzzz1234")),
      emitInstalled,
    });
    await runUpdater(deps);
    expect(emitInstalled).toHaveBeenCalledTimes(1);
    expect(emitInstalled.mock.calls[0]?.[0]).toMatchObject({
      fromVer: "abcdefg",
      toVer: "zzzzzzz",
    });
  });

  it("does NOT emit update-installed when install fails", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const emitInstalled = vi.fn();
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("new")),
      runNpmInstall: vi.fn().mockResolvedValue({ ok: false, error: "boom" }),
      emitInstalled,
    });
    await runUpdater(deps);
    expect(emitInstalled).not.toHaveBeenCalled();
  });

  it("does NOT emit update-installed when remote sha matches local", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "same" };
    const emitInstalled = vi.fn();
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("same")),
      emitInstalled,
    });
    await runUpdater(deps);
    expect(emitInstalled).not.toHaveBeenCalled();
  });

  it("emit failure is logged but does not throw", async () => {
    const state = { ...defaultUpdateState(), last_installed_sha: "old" };
    const emitInstalled = vi.fn().mockImplementation(() => {
      throw new Error("eventLog full");
    });
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchRemoteSha: vi.fn().mockResolvedValue(okResult("new")),
      emitInstalled,
    });
    await expect(runUpdater(deps)).resolves.toBeUndefined();
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("emitInstalled failed"));
  });
});

// ── Issue #313: runUpdater version-check via fetchLatestVersion ──

describe("runUpdater (#313 version-check)", () => {
  it("up-to-date when fetched version equals last_installed_version → no install", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.5" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue(okLatest("0.11.5")),
    });
    await runUpdater(deps);
    expect(deps.fetchLatestVersion).toHaveBeenCalled();
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
  });

  it("update available → install + migrate + write banner with version strings", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.0", last_installed_sha: "sha-old" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue(okLatest("0.11.6", "pages", "sha-new")),
    });
    await runUpdater(deps);
    expect(deps.runNpmInstall).toHaveBeenCalled();
    expect(deps.runMigrateAuto).toHaveBeenCalled();
    const final = lastWrittenState(deps);
    expect(final.last_installed_version).toBe("0.11.6");
    expect(final.last_installed_sha).toBe("sha-new");
    expect(final.pending_banner?.from).toBe("0.11.0");
    expect(final.pending_banner?.to).toBe("0.11.6");
  });

  it("Tier 3 failure → writes last_install_error with 'version-check failed:' prefix", async () => {
    const deps = makeDeps({
      fetchLatestVersion: vi.fn().mockResolvedValue(failLatest("pages_5xx", "npm_5xx")),
    });
    await runUpdater(deps);
    const final = lastWrittenState(deps);
    expect(final.last_install_error).toMatch(/^version-check failed:/);
    expect(final.last_install_error).toContain("pages=pages_5xx");
    expect(final.last_install_error).toContain("npm=npm_5xx");
    // Tier 3 does NOT trigger consecutive_install_failures counter
    expect(final.consecutive_install_failures).toBe(0);
    expect(deps.runNpmInstall).not.toHaveBeenCalled();
  });

  it("Tier 3 recovery → clears stale 'version-check failed:' error when up-to-date", async () => {
    // The iter-1 fix from PR #342: prior cycle wrote a Tier-3 error; this cycle
    // succeeds + already current → must clear last_install_error so the
    // SessionStart Tier 3 banner stops firing.
    const state: UpdateState = {
      ...defaultUpdateState(),
      last_installed_version: "0.11.5",
      last_install_error: "version-check failed: pages=pages_5xx (...); npm=npm_5xx (...)",
    };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue(okLatest("0.11.5")),
    });
    await runUpdater(deps);
    const final = lastWrittenState(deps);
    expect(final.last_install_error).toBeNull();
  });

  it("preserves non-Tier-3 last_install_error on successful fetch (reinstall banner owns it)", async () => {
    // A real npm-install error from a prior cycle must NOT be cleared by a
    // successful version-check — that's reinstall-banner's territory.
    const state: UpdateState = {
      ...defaultUpdateState(),
      last_installed_version: "0.11.5",
      last_install_error: "npm install failed: Connection closed by 198.18.0.18 port 22",
      consecutive_install_failures: 3,
    };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue(okLatest("0.11.5")),
    });
    await runUpdater(deps);
    const final = lastWrittenState(deps);
    expect(final.last_install_error).toBe("npm install failed: Connection closed by 198.18.0.18 port 22");
  });

  it("install path uses last_installed_sha for backup (rollback path preserved)", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.0", last_installed_sha: "sha-prev" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue(okLatest("0.11.6")),
    });
    await runUpdater(deps);
    expect(deps.backupCurrentInstall).toHaveBeenCalledWith("sha-prev");
  });

  // Post-merge PR-creator force-update feature.
  it("stamps pending_banner.pr_creator + pr_number when local user matches latest.pr_creator_login", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.5" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue({
        ok: true,
        version: "0.11.6",
        source: "pages",
        sha: "sha-new",
        pr_creator_login: "alice",
        pr_number: 348,
        merged_at: "2026-05-12T03:14:02Z",
      }),
      gatherIdentity: () => ({ ghLogin: "alice", gitEmail: "", env: {} }),
    });
    await runUpdater(deps);
    const final = lastWrittenState(deps);
    expect(final.pending_banner?.pr_creator).toBe(true);
    expect(final.pending_banner?.pr_number).toBe(348);
    expect(final.pending_banner?.from).toBe("0.11.5");
    expect(final.pending_banner?.to).toBe("0.11.6");
  });

  it("does NOT stamp pr_creator when local user is someone else", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.5" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue({
        ok: true,
        version: "0.11.6",
        source: "pages",
        pr_creator_login: "alice",
        pr_number: 348,
      }),
      gatherIdentity: () => ({ ghLogin: "bob", gitEmail: "", env: {} }),
    });
    await runUpdater(deps);
    const final = lastWrittenState(deps);
    expect(final.pending_banner?.pr_creator).toBeUndefined();
    expect(final.pending_banner?.pr_number).toBeUndefined();
    expect(final.pending_banner?.to).toBe("0.11.6"); // normal install still happens
  });

  it("does NOT stamp pr_creator when latest.json omits pr_creator_login (legacy payload)", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.5" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue(okLatest("0.11.6")), // no PR fields
      gatherIdentity: () => ({ ghLogin: "alice", gitEmail: "", env: {} }),
    });
    await runUpdater(deps);
    const final = lastWrittenState(deps);
    expect(final.pending_banner?.pr_creator).toBeUndefined();
    expect(final.pending_banner?.pr_number).toBeUndefined();
  });

  it("does NOT call gatherIdentity when latest.json omits pr_creator_login (no spurious spawn)", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.5" };
    const gather = vi.fn().mockReturnValue({ ghLogin: "alice", gitEmail: "", env: {} });
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue(okLatest("0.11.6")),
      gatherIdentity: gather,
    });
    await runUpdater(deps);
    expect(gather).not.toHaveBeenCalled();
  });

  it("legacy: when gatherIdentity is not injected, never stamps pr_creator (back-compat)", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.5" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue({
        ok: true,
        version: "0.11.6",
        source: "pages",
        pr_creator_login: "alice",
        pr_number: 348,
      }),
      // No gatherIdentity — simulating old bin-updater that doesn't wire it.
    });
    await runUpdater(deps);
    const final = lastWrittenState(deps);
    expect(final.pending_banner?.pr_creator).toBeUndefined();
  });

  it("matches via noreply email even without ghLogin", async () => {
    const state = { ...defaultUpdateState(), last_installed_version: "0.11.5" };
    const deps = makeDeps({
      readState: vi.fn().mockReturnValue(state),
      fetchLatestVersion: vi.fn().mockResolvedValue({
        ok: true,
        version: "0.11.6",
        source: "pages",
        pr_creator_login: "alice",
        pr_number: 348,
      }),
      gatherIdentity: () => ({
        ghLogin: "",
        gitEmail: "12345+alice@users.noreply.github.com",
        env: {},
      }),
    });
    await runUpdater(deps);
    const final = lastWrittenState(deps);
    expect(final.pending_banner?.pr_creator).toBe(true);
  });
});

describe("isDevModeTsExtensionError (W15-001)", () => {
  it("matches real Node ERR_UNKNOWN_FILE_EXTENSION on .ts source file", () => {
    const stderr = [
      "node:internal/modules/esm/get_format:172",
      'TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for /home/u/.npm-global/lib/node_modules/teamagent/dist/migrate-v6.ts',
    ].join("\n");
    expect(isDevModeTsExtensionError(stderr)).toBe(true);
  });

  it("matches Windows-path Node ERR_UNKNOWN_FILE_EXTENSION", () => {
    const stderr =
      'TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for C:\\Users\\u\\.npm-global\\node_modules\\teamagent\\dist\\bin.ts';
    expect(isDevModeTsExtensionError(stderr)).toBe(true);
  });

  it("rejects ERR_UNKNOWN_FILE_EXTENSION mentioning .ts only as field/wrapper text", () => {
    expect(
      isDevModeTsExtensionError(
        "ERR_UNKNOWN_FILE_EXTENSION: payload field user.created_at has .ts wrapper",
      ),
    ).toBe(false);
  });

  it('rejects ERR_UNKNOWN_FILE_EXTENSION mentioning "index.ts" without "Unknown file extension" phrasing', () => {
    expect(
      isDevModeTsExtensionError(
        'ERR_UNKNOWN_FILE_EXTENSION at line 5: cannot import "index.ts" — package main was rewritten',
      ),
    ).toBe(false);
  });

  it("rejects stderr lacking the ERR_UNKNOWN_FILE_EXTENSION marker", () => {
    expect(
      isDevModeTsExtensionError('Unknown file extension ".ts" for foo.ts'),
    ).toBe(false);
  });

  it("rejects empty stderr", () => {
    expect(isDevModeTsExtensionError("")).toBe(false);
  });
});
