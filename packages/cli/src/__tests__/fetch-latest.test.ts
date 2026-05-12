import { describe, it, expect } from "vitest";
import {
  fetchLatestVersion,
  type HttpsGet,
  type HttpsResponse,
  type FetchLatestResult,
  DEFAULT_PAGES_URL,
  DEFAULT_NPM_URL,
} from "../update/fetch-latest.js";

/**
 * Build a mock `httpsGet` that returns a sequence of responses per URL
 * pattern. Records every call so tests can assert which URLs were touched
 * — critical to ensure api.github.com is NEVER hit by fetchLatestVersion.
 */
function makeMockHttpsGet(
  responder: (url: string) => HttpsResponse | Error,
): { get: HttpsGet; calls: string[] } {
  const calls: string[] = [];
  const get: HttpsGet = async (url) => {
    calls.push(url);
    const result = responder(url);
    if (result instanceof Error) throw result;
    return result;
  };
  return { get, calls };
}

function pagesOk(version: string, sha?: string): HttpsResponse {
  const body = sha
    ? JSON.stringify({ version, sha, releasedAt: "2026-05-12T00:00:00Z" })
    : JSON.stringify({ version, releasedAt: "2026-05-12T00:00:00Z" });
  return { statusCode: 200, body, headers: {} };
}
function npmOk(version: string): HttpsResponse {
  return {
    statusCode: 200,
    body: JSON.stringify({ name: "teamagent", version }),
    headers: {},
  };
}
function status(code: number, body = ""): HttpsResponse {
  return { statusCode: code, body, headers: {} };
}

describe("fetchLatestVersion", () => {
  it("returns pages version when Pages 200 (short-circuit, no npm call)", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return pagesOk("0.11.5", "deadbeef1234");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version).toBe("0.11.5");
      expect(r.sha).toBe("deadbeef1234");
      expect(r.source).toBe("pages");
    }
    expect(mock.calls).toEqual([DEFAULT_PAGES_URL]);
  });

  it("falls back to npm when Pages 5xx", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return status(503);
      if (url === DEFAULT_NPM_URL) return npmOk("0.11.0");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version).toBe("0.11.0");
      expect(r.source).toBe("npm");
      expect(r.sha).toBeUndefined();
    }
    expect(mock.calls).toEqual([DEFAULT_PAGES_URL, DEFAULT_NPM_URL]);
  });

  it("falls back to npm when Pages 404", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return status(404);
      if (url === DEFAULT_NPM_URL) return npmOk("0.11.0");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe("npm");
  });

  it("falls back to npm when Pages parse error", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return { statusCode: 200, body: "<not json>", headers: {} };
      if (url === DEFAULT_NPM_URL) return npmOk("0.11.0");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe("npm");
  });

  it("falls back to npm when Pages network error", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return new Error("ECONNREFUSED");
      if (url === DEFAULT_NPM_URL) return npmOk("0.11.0");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe("npm");
  });

  it("falls back to npm when Pages times out", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return new Error("timeout");
      if (url === DEFAULT_NPM_URL) return npmOk("0.11.0");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe("npm");
  });

  it("returns discriminated failure when both Pages and npm fail", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return status(503);
      if (url === DEFAULT_NPM_URL) return status(503);
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.pagesReason).toBe("pages_5xx");
      expect(r.npmReason).toBe("npm_5xx");
      expect(r.pagesMessage).toBeTruthy();
      expect(r.npmMessage).toBeTruthy();
    }
  });

  it("classifies npm timeout vs network distinctly", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return new Error("ECONNREFUSED");
      if (url === DEFAULT_NPM_URL) return new Error("timeout");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.pagesReason).toBe("pages_network");
      expect(r.npmReason).toBe("npm_timeout");
    }
  });

  it("NEVER calls api.github.com under any scenario (regression gate for issue #313)", async () => {
    const scenarios: Array<(url: string) => HttpsResponse | Error> = [
      // 1. Pages 200 happy path
      (url) => url === DEFAULT_PAGES_URL ? pagesOk("0.11.5") : status(599),
      // 2. Pages 5xx → npm 200
      (url) => url === DEFAULT_PAGES_URL ? status(503) : npmOk("0.11.0"),
      // 3. Pages 404 → npm 200
      (url) => url === DEFAULT_PAGES_URL ? status(404) : npmOk("0.11.0"),
      // 4. Pages timeout → npm timeout
      (_url) => new Error("timeout"),
      // 5. Pages network → npm network
      (_url) => new Error("ECONNREFUSED"),
      // 6. Pages parse → npm 200
      (url) => url === DEFAULT_PAGES_URL
        ? ({ statusCode: 200, body: "<bad json>", headers: {} })
        : npmOk("0.11.0"),
      // 7. Pages 200 missing version field → npm 200
      (url) => url === DEFAULT_PAGES_URL
        ? ({ statusCode: 200, body: JSON.stringify({ foo: "bar" }), headers: {} })
        : npmOk("0.11.0"),
      // 8. Both fail
      (_url) => status(503),
    ];

    for (const scen of scenarios) {
      const mock = makeMockHttpsGet(scen);
      await fetchLatestVersion({ httpsGet: mock.get });
      for (const u of mock.calls) {
        expect(u).not.toContain("api.github.com");
        expect(u).not.toContain("raw.githubusercontent.com");
      }
    }
  });

  it("respects pagesUrl + npmUrl overrides for testing", async () => {
    const customPages = "https://example.test/pages.json";
    const customNpm = "https://example.test/npm.json";
    const mock = makeMockHttpsGet((url) => {
      if (url === customPages) return pagesOk("9.9.9");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({
      httpsGet: mock.get,
      pagesUrl: customPages,
      npmUrl: customNpm,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.version).toBe("9.9.9");
    expect(mock.calls).toEqual([customPages]); // npm not touched
  });

  it("accepts pages payload without sha field", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return pagesOk("0.11.5"); // no sha
      throw new Error(`unexpected url ${url}`);
    });
    const r: FetchLatestResult = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version).toBe("0.11.5");
      expect(r.sha).toBeUndefined();
      expect(r.source).toBe("pages");
    }
  });

  it("treats empty version string in pages payload as parse error", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL)
        return { statusCode: 200, body: JSON.stringify({ version: "" }), headers: {} };
      if (url === DEFAULT_NPM_URL) return npmOk("0.11.0");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toBe("npm"); // fell through to npm
  });

  // Post-merge PR-creator force-update feature: latest.json carries three
  // optional fields that fetchLatestVersion plumbs through to the updater.
  it("plumbs pr_creator_login + pr_number + merged_at from Pages latest.json", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            version: "0.11.6",
            sha: "feedface",
            releasedAt: "2026-05-12T03:14:02Z",
            pr_number: 348,
            pr_creator_login: "LiuShiyuMath",
            merged_at: "2026-05-12T03:13:00Z",
          }),
          headers: {},
        };
      }
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version).toBe("0.11.6");
      expect(r.sha).toBe("feedface");
      expect(r.source).toBe("pages");
      expect(r.pr_creator_login).toBe("LiuShiyuMath");
      expect(r.pr_number).toBe(348);
      expect(r.merged_at).toBe("2026-05-12T03:13:00Z");
    }
  });

  it("leaves PR-creator fields undefined when latest.json omits them (back-compat)", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return pagesOk("0.11.5", "deadbeef");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pr_creator_login).toBeUndefined();
      expect(r.pr_number).toBeUndefined();
      expect(r.merged_at).toBeUndefined();
    }
  });

  it("drops wrong-type PR-creator fields silently", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            version: "0.11.6",
            pr_creator_login: 348,          // wrong type: number
            pr_number: "348",               // wrong type: string
            merged_at: 12345,               // wrong type: number
          }),
          headers: {},
        };
      }
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version).toBe("0.11.6"); // version still parses
      expect(r.pr_creator_login).toBeUndefined();
      expect(r.pr_number).toBeUndefined();
      expect(r.merged_at).toBeUndefined();
    }
  });

  it("npm source never carries PR-creator fields (only Pages does)", async () => {
    const mock = makeMockHttpsGet((url) => {
      if (url === DEFAULT_PAGES_URL) return status(503);
      if (url === DEFAULT_NPM_URL) return npmOk("0.11.0");
      throw new Error(`unexpected url ${url}`);
    });
    const r = await fetchLatestVersion({ httpsGet: mock.get });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("npm");
      expect(r.pr_creator_login).toBeUndefined();
      expect(r.pr_number).toBeUndefined();
    }
  });
});
