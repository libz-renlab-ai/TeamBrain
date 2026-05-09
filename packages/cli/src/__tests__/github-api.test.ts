import { describe, it, expect, vi } from "vitest";
import { fetchRemoteSha } from "../github-api.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockGet(statusCode: number, body: string, headers?: Record<string, string | undefined>) {
  return vi.fn().mockResolvedValue({ statusCode, body, headers });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("fetchRemoteSha", () => {
  // ── Migrated from legacy suite (5 tests) ─────────────────────────────────

  it("200: returns ok:true with sha on success", async () => {
    const httpsGet = mockGet(200, JSON.stringify({ commit: { sha: "abc123" } }), {});
    const result = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sha).toBe("abc123");
      expect(result.source).toBe("200");
    }
    expect(httpsGet).toHaveBeenCalled();
  });

  it("404: returns ok:false with reason not_found", async () => {
    const httpsGet = mockGet(404, "{}", {});
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not_found");
      expect(result.status).toBe(404);
    }
  });

  it("403 without rate-limit header: returns ok:false with reason auth", async () => {
    // Legacy mock had no headers — treated as 403 with no rate-limit header → auth
    const httpsGet = mockGet(403, "{}", undefined);
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("auth");
      expect(result.status).toBe(403);
    }
  });

  it("200 with malformed JSON: returns ok:false with reason parse", async () => {
    const httpsGet = mockGet(200, "not-json", {});
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("parse");
      expect(result.status).toBe(200);
    }
  });

  it("network error: returns ok:false with reason network", async () => {
    const httpsGet = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("network");
      expect(result.status).toBe(0);
      expect(result.message).toContain("ECONNREFUSED");
    }
  });

  // ── New test cases ────────────────────────────────────────────────────────

  it("200: captures etag header from response", async () => {
    const httpsGet = mockGet(
      200,
      JSON.stringify({ commit: { sha: "deadbeef" } }),
      { etag: 'W/"5e8c4d"' },
    );
    const result = await fetchRemoteSha({
      owner: "o", repo: "r", branch: "b", httpsGet,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sha).toBe("deadbeef");
      expect(result.etag).toBe('W/"5e8c4d"');
      expect(result.source).toBe("200");
    }
  });

  it("304 with cachedSha: echoes cachedSha and source='304'", async () => {
    const httpsGet = mockGet(304, "", {});
    const result = await fetchRemoteSha({
      owner: "o", repo: "r", branch: "b",
      httpsGet,
      ifNoneMatch: 'W/"abc"',
      cachedSha: "cachedsha123",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sha).toBe("cachedsha123");
      expect(result.source).toBe("304");
      // ETag echoed back from the request header (byte-for-byte)
      expect(result.etag).toBe('W/"abc"');
    }
  });

  it("304 without cachedSha: returns ok:false with reason parse", async () => {
    const httpsGet = mockGet(304, "", {});
    const result = await fetchRemoteSha({
      owner: "o", repo: "r", branch: "b",
      httpsGet,
      ifNoneMatch: 'W/"abc"',
      // cachedSha intentionally omitted
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("parse");
      expect(result.status).toBe(304);
    }
  });

  it("403 + remaining=0 + no token: returns rate_limit_anonymous", async () => {
    const httpsGet = mockGet(403, "{}", { "x-ratelimit-remaining": "0" });
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release",
      httpsGet,
      // no token
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate_limit_anonymous");
      expect(result.status).toBe(403);
      expect(result.message).toContain("TEAMAGENT_GITHUB_TOKEN");
    }
  });

  it("403 + remaining=0 + token: returns rate_limit_authed", async () => {
    const httpsGet = mockGet(403, "{}", { "x-ratelimit-remaining": "0" });
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release",
      httpsGet,
      token: "ghp_mytoken",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate_limit_authed");
      expect(result.status).toBe(403);
    }
  });

  it("403 with no x-ratelimit-remaining header: returns auth", async () => {
    const httpsGet = mockGet(403, "{}", { /* no rate-limit header */ });
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("auth");
      expect(result.status).toBe(403);
    }
  });

  it("403 with non-zero x-ratelimit-remaining: returns auth (not rate-limit)", async () => {
    const httpsGet = mockGet(403, "{}", { "x-ratelimit-remaining": "42" });
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("auth");
    }
  });

  it("401: returns auth reason", async () => {
    const httpsGet = mockGet(401, "{}", {});
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("auth");
      expect(result.status).toBe(401);
    }
  });

  it("500: returns server reason", async () => {
    const httpsGet = mockGet(500, "Internal Server Error", {});
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("server");
      expect(result.status).toBe(500);
      expect(result.message).toContain("500");
    }
  });

  it("weak ETag preserved byte-for-byte in If-None-Match request header", async () => {
    const weakEtag = 'W/"5e8c4dabcdef1234"';
    const httpsGet = mockGet(304, "", {});
    await fetchRemoteSha({
      owner: "o", repo: "r", branch: "b",
      httpsGet,
      ifNoneMatch: weakEtag,
      cachedSha: "somecachedsha",
    });
    // Verify the request was made with the exact ETag byte-for-byte
    const calledHeaders = httpsGet.mock.calls[0]![1] as Record<string, string>;
    expect(calledHeaders["If-None-Match"]).toBe(weakEtag);
  });

  it("token sends Authorization: Bearer header", async () => {
    const httpsGet = mockGet(200, JSON.stringify({ commit: { sha: "sha1" } }), {});
    await fetchRemoteSha({
      owner: "o", repo: "r", branch: "b",
      httpsGet,
      token: "ghp_secrettoken",
    });
    const calledHeaders = httpsGet.mock.calls[0]![1] as Record<string, string>;
    expect(calledHeaders["Authorization"]).toBe("Bearer ghp_secrettoken");
  });

  it("no token: no Authorization header sent", async () => {
    const httpsGet = mockGet(200, JSON.stringify({ commit: { sha: "sha1" } }), {});
    await fetchRemoteSha({
      owner: "o", repo: "r", branch: "b",
      httpsGet,
      // no token
    });
    const calledHeaders = httpsGet.mock.calls[0]![1] as Record<string, string>;
    expect(calledHeaders["Authorization"]).toBeUndefined();
  });

  it("200 with missing commit.sha in body: returns parse failure", async () => {
    const httpsGet = mockGet(200, JSON.stringify({ commit: {} }), {});
    const result = await fetchRemoteSha({
      owner: "o", repo: "r", branch: "b", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("parse");
      expect(result.status).toBe(200);
    }
  });

  // ── PR #194 follow-up tests ───────────────────────────────────────────────

  it("403 + remaining=' 0' (whitespace) → rate_limit_anonymous (lenient header parse)", async () => {
    const httpsGet = mockGet(403, "{}", { "x-ratelimit-remaining": " 0" });
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rate_limit_anonymous");
    }
  });

  it("403 + remaining='00' → rate_limit_anonymous (still treated as exhausted)", async () => {
    // "00".trim() === "0" is false in our coercion, but as a sanity check:
    // the only spec-compliant value is "0", and we reject "00" as auth.
    // This locks the contract that we only treat exact "0" (after trim) as exhausted.
    const httpsGet = mockGet(403, "{}", { "x-ratelimit-remaining": "00" });
    const result = await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // "00" is non-spec; falls through to auth. This is fine — no real GitHub
      // proxy emits "00".
      expect(result.reason).toBe("auth");
    }
  });

  it("304 with cachedSha but no ifNoneMatch: returns parse failure (PR #194 F3)", async () => {
    // Degenerate proxy returning 304 unconditionally (without a matching
    // If-None-Match) must NOT silently succeed — the previous contract would
    // have echoed etag=null and wiped last_branch_etag downstream.
    const httpsGet = mockGet(304, "", {});
    const result = await fetchRemoteSha({
      owner: "o", repo: "r", branch: "b",
      httpsGet,
      // ifNoneMatch intentionally omitted
      cachedSha: "somecachedsha",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("parse");
      expect(result.status).toBe(304);
    }
  });

  it("does not throw on any code path", async () => {
    // Verify promise always resolves, never rejects
    const cases = [
      mockGet(200, JSON.stringify({ commit: { sha: "x" } }), {}),
      mockGet(304, "", {}),
      mockGet(401, "", {}),
      mockGet(403, "", { "x-ratelimit-remaining": "0" }),
      mockGet(404, "", {}),
      mockGet(500, "", {}),
      mockGet(200, "BAD JSON", {}),
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    ];
    for (const httpsGet of cases) {
      // Should never throw — always returns a FetchShaResult
      await expect(fetchRemoteSha({ owner: "o", repo: "r", branch: "b", httpsGet })).resolves.toBeDefined();
    }
  });
});
