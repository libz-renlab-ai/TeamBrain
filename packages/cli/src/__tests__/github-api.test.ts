import { describe, it, expect, vi } from "vitest";
import { fetchRemoteSha } from "../github-api.js";

describe("fetchRemoteSha", () => {
  it("returns sha on success", async () => {
    const httpsGet = vi.fn().mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({ commit: { sha: "abc123" } }),
    });
    const sha = await fetchRemoteSha({
      owner: "libz-renlab-ai",
      repo: "TeamBrain",
      branch: "release",
      httpsGet,
    });
    expect(sha).toBe("abc123");
    expect(httpsGet).toHaveBeenCalled();
  });

  it("returns null on 404", async () => {
    const httpsGet = vi.fn().mockResolvedValue({ statusCode: 404, body: "{}" });
    expect(await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    })).toBeNull();
  });

  it("returns null on rate limit (403)", async () => {
    const httpsGet = vi.fn().mockResolvedValue({ statusCode: 403, body: "{}" });
    expect(await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    })).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    const httpsGet = vi.fn().mockResolvedValue({ statusCode: 200, body: "not-json" });
    expect(await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    })).toBeNull();
  });

  it("returns null on network error", async () => {
    const httpsGet = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await fetchRemoteSha({
      owner: "x", repo: "y", branch: "release", httpsGet,
    })).toBeNull();
  });
});
