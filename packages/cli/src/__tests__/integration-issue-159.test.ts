/**
 * Integration tests for issue #159 — GitHub rate-limit + ETag in fetchRemoteSha
 *
 * These tests cover the six scenarios from § 4c of the plan:
 *   (1) Anonymous rate limit → rate_limit_anonymous + token-suggestion message
 *   (2) Authenticated rate limit → rate_limit_authed + Authorization header verified
 *   (3) ETag conditional GET round-trip: 200→ETag captured, 304→If-None-Match echoed byte-for-byte
 *   (4) runUpdater backoff lifecycle via rate-limit state fields
 *   (5) 404 → not_found
 *   (6) Network throw → network reason, status 0
 *
 * NOTE: This file references types from Slice A (FetchShaResult) and updater-logic
 * changes from Slice C (backoff fields). It will fully pass once all slices land.
 */

import { describe, it, expect, vi } from "vitest";
import { fetchRemoteSha, type FetchShaResult } from "../github-api.js";
import { runUpdater } from "../updater-logic.js";
import { defaultUpdateState, type UpdateState } from "@teamagent/core";
import type { UpdaterDeps } from "../updater-logic.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockHttpsGet(
  statusCode: number,
  body: string,
  headers: Record<string, string | undefined> = {},
) {
  return vi.fn().mockResolvedValue({ statusCode, body, headers });
}

// ── Scenario 1: Anonymous rate limit ─────────────────────────────────────────

describe("issue-159 integration: anonymous rate limit", () => {
  it("403 + x-ratelimit-remaining:0 without token → rate_limit_anonymous + TEAMAGENT_GITHUB_TOKEN hint", async () => {
    const httpsGet = mockHttpsGet(403, "{}", { "x-ratelimit-remaining": "0" });

    const result = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet,
      // No token — anonymous request
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate_limit_anonymous");
      expect(result.message).toContain("TEAMAGENT_GITHUB_TOKEN");
    }
  });
});

// ── Scenario 2: Authenticated rate limit ──────────────────────────────────────

describe("issue-159 integration: authenticated rate limit", () => {
  it("403 + x-ratelimit-remaining:0 with token → rate_limit_authed; Authorization header sent", async () => {
    const httpsGet = mockHttpsGet(403, "{}", { "x-ratelimit-remaining": "0" });

    const result = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet,
      token: "fake-token",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate_limit_authed");
    }

    // Verify Authorization header was actually sent
    const calledHeaders = httpsGet.mock.calls[0]![1] as Record<string, string>;
    expect(calledHeaders["Authorization"]).toBe("Bearer fake-token");
  });
});

// ── Scenario 3: ETag conditional GET round-trip ───────────────────────────────

describe("issue-159 integration: ETag conditional GET round-trip", () => {
  it("200 returns ETag; 304 echoes If-None-Match byte-for-byte with weak prefix preserved", async () => {
    // First call: fresh 200 with ETag
    const firstGet = mockHttpsGet(
      200,
      JSON.stringify({ commit: { sha: "sha1" } }),
      { etag: 'W/"abc"' },
    );
    const firstResult = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet: firstGet,
    });

    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) throw new Error("Expected first result to be ok");
    expect(firstResult.sha).toBe("sha1");
    expect(firstResult.source).toBe("200");
    expect(firstResult.etag).toBe('W/"abc"');

    // Capture the etag from the first response (narrowed to string for the next call)
    const capturedEtag = firstResult.etag ?? undefined;
    expect(capturedEtag).toBe('W/"abc"');

    // Second call: conditional GET with If-None-Match → 304
    const secondGet = mockHttpsGet(304, "", {});
    const secondResult = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet: secondGet,
      ifNoneMatch: capturedEtag,
      cachedSha: "sha1",
    });

    expect(secondResult.ok).toBe(true);
    if (!secondResult.ok) throw new Error("Expected second result to be ok");
    expect(secondResult.sha).toBe("sha1");
    expect(secondResult.source).toBe("304");

    // Assert If-None-Match was sent byte-for-byte with weak prefix W/" preserved
    const secondHeaders = secondGet.mock.calls[0]![1] as Record<string, string>;
    expect(secondHeaders["If-None-Match"]).toBe('W/"abc"');
  });
});

// ── Scenario 4: runUpdater backoff lifecycle ──────────────────────────────────

// Issue #313: runUpdater no longer calls fetchRemoteSha — version-check moved
// to fetchLatestVersion (Pages + npm registry, neither subject to GitHub
// rate-limit). The "backoff lifecycle" scenario below tested behavior that
// has been removed; skipped to preserve historical documentation, will be
// deleted once #313's CHANGELOG entry has propagated through one release.
// fetchRemoteSha itself is preserved in github-api.ts for install-path SHA
// pinning — scenarios 1-3 + 5-6 below still exercise it as a unit and pass.
describe.skip("issue-159 integration: runUpdater backoff lifecycle (#313 removed)", () => {
  it("rate-limit increments consecutive_rate_limits without touching consecutive_install_failures; success resets", async () => {
    // Use a non-trivial initial state so "unchanged" assertions are non-trivial
    let currentState: UpdateState = {
      ...defaultUpdateState(),
      last_installed_sha: "sha-success", // matches success mock → up-to-date short-circuit
      consecutive_install_failures: 7,    // non-zero: must remain unchanged after rate-limit
      last_install_error: "prev-error",   // must remain unchanged after rate-limit
    };
    let currentNow = 1000;

    // fetchRemoteSha mock: first call returns rate-limit failure, second returns success
    const mockFetchRemoteSha = vi
      .fn()
      // First call: rate limit anonymous
      .mockResolvedValueOnce({
        ok: false,
        reason: "rate_limit_anonymous",
        status: 403,
        message: "GitHub anonymous rate limit exhausted; set TEAMAGENT_GITHUB_TOKEN to authenticate (5000 req/h)",
      } satisfies FetchShaResult)
      // Third call (after backoff expires): success
      .mockResolvedValueOnce({
        ok: true,
        sha: "sha-success",
        etag: 'W/"newetag"',
        source: "200",
      } satisfies FetchShaResult);

    const deps: UpdaterDeps = {
      // Issue #313: fetchLatestVersion is now required; stub for typecheck even
      // though the surrounding describe is .skip'd (TS still type-checks .skip'd
      // bodies).
      fetchLatestVersion: vi.fn().mockResolvedValue({
        ok: true,
        version: "0.0.0",
        source: "pages",
      }),
      fetchRemoteSha: mockFetchRemoteSha,
      runNpmInstall: vi.fn().mockResolvedValue({ ok: true }),
      runMigrateAuto: vi.fn().mockResolvedValue({ ok: true }),
      backupCurrentInstall: vi.fn().mockReturnValue(""),
      restoreFromBackup: vi.fn(),
      pruneOldBackups: vi.fn(),
      readState: () => currentState,
      writeState: vi.fn((s: UpdateState) => { currentState = s; }),
      log: vi.fn(),
      now: () => currentNow,
      acquireLock: vi.fn().mockReturnValue(true),
      releaseLock: vi.fn(),
    };

    // === Call 1: Rate-limit hit ===
    await runUpdater(deps);

    // After first call: consecutive_rate_limits incremented, backoff set
    expect(currentState.consecutive_rate_limits).toBe(1);
    // Backoff: delayHours = min(2^(1-1), 24) = 1h; next_check_after_ts = 1000 + 3_600_000
    expect(currentState.next_check_after_ts).toBeGreaterThan(currentNow);
    const expectedBackoffEnd = 1000 + 1 * 3600 * 1000; // 3_601_000
    expect(currentState.next_check_after_ts).toBe(expectedBackoffEnd);

    // IMPORTANT: consecutive_install_failures and last_install_error must be UNCHANGED
    expect(currentState.consecutive_install_failures).toBe(7);
    expect(currentState.last_install_error).toBe("prev-error");

    // === Call 2: Still within backoff window — fetch should NOT be called ===
    currentNow = 3_000_000; // Before backoff expires (expectedBackoffEnd = 3_601_000)
    const fetchCallCountBeforeCall2 = mockFetchRemoteSha.mock.calls.length;
    await runUpdater(deps);
    // Fetch was not called (backoff skip)
    expect(mockFetchRemoteSha.mock.calls.length).toBe(fetchCallCountBeforeCall2);

    // === Call 3: After backoff window expires, fetch returns success ===
    currentNow = 4_000_000; // After backoff expires
    await runUpdater(deps);

    // Success path: consecutive_rate_limits reset to 0, next_check_after_ts reset to 0
    expect(currentState.consecutive_rate_limits).toBe(0);
    expect(currentState.next_check_after_ts).toBe(0);
    // ETag state populated
    expect(currentState.last_branch_etag).toBe('W/"newetag"');
    expect(currentState.last_branch_sha).toBe("sha-success");

    // Verify fetch was called exactly twice total (call 1 + call 3; call 2 was skipped)
    expect(mockFetchRemoteSha).toHaveBeenCalledTimes(2);
  });
});

// ── Scenario 5: 404 not_found ─────────────────────────────────────────────────

describe("issue-159 integration: 404 not_found", () => {
  it("404 response → reason not_found", async () => {
    const httpsGet = mockHttpsGet(404, "{}", {});

    const result = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
      expect(result.status).toBe(404);
    }
  });
});

// ── Scenario 6: Network error ─────────────────────────────────────────────────

describe("issue-159 integration: network error", () => {
  it("httpsGet rejects → reason network, status 0, message contains ECONNREFUSED", async () => {
    const httpsGet = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("network");
      expect(result.status).toBe(0);
      expect(result.message).toContain("ECONNREFUSED");
    }
  });
});
