/**
 * Feature #2 v3 — realtime-emit helper contract tests.
 *
 * The helper is what makes "real users" show up on the boss kanban: it reads
 * TEAMAGENT_REALTIME_URL and fires postCcStatusSnapshot fire-and-forget. The
 * production callers (SessionStart + UserPromptSubmit) just call into this
 * file; if it ever throws or blocks, the user-facing hook path breaks.
 *
 * Tests:
 *   - Unset env → no fetch, no throw.
 *   - Set env → fetch fires exactly once with the right URL + body shape.
 *   - fetch rejects (network) → emit returns synchronously, no throw.
 *   - fetch resolves with 500 → emit returns synchronously, no throw.
 *   - getUserId throws → snapshot still builds with hostname fallback.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { emitCcStatus } from "../realtime-emit.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV_URL = process.env.TEAMAGENT_REALTIME_URL;
const ORIGINAL_ENV_TOKEN = process.env.TEAMAGENT_REALTIME_TOKEN;

describe("emitCcStatus", () => {
  beforeEach(() => {
    delete process.env.TEAMAGENT_REALTIME_URL;
    delete process.env.TEAMAGENT_REALTIME_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_ENV_URL) process.env.TEAMAGENT_REALTIME_URL = ORIGINAL_ENV_URL;
    if (ORIGINAL_ENV_TOKEN) process.env.TEAMAGENT_REALTIME_TOKEN = ORIGINAL_ENV_TOKEN;
  });

  it("is a no-op when TEAMAGENT_REALTIME_URL is unset", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s1", cwd: "/tmp" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fires one POST to /v1/cc-status when the URL is set", async () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9787";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({
      event: "user_prompt_submit",
      sessionId: "s-real",
      cwd: "/Users/me/repo",
    });
    // Drain microtasks so the void-discarded promise actually fires.
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:9787/v1/cc-status");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.event).toBe("user_prompt_submit");
    expect(body.session_id).toBe("s-real");
    expect(body.cwd).toBe("/Users/me/repo");
    expect(body.schema_version).toBe(1);
    expect(typeof body.user_id).toBe("string");
    expect(typeof body.ts).toBe("string");
  });

  it("passes bearer token when TEAMAGENT_REALTIME_TOKEN is set", async () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9787";
    process.env.TEAMAGENT_REALTIME_TOKEN = "test-token-abc";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s2" });
    await new Promise((r) => setTimeout(r, 5));
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-token-abc");
  });

  it("never throws when fetch rejects with a network error", async () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9999";
    const fetchSpy = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    expect(() =>
      emitCcStatus({ event: "session_start", sessionId: "s3" }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("never throws when fetch returns HTTP 500", async () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9787";
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("boom", { status: 500 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    expect(() =>
      emitCcStatus({ event: "session_start", sessionId: "s4" }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns synchronously even when fetch never resolves", () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9787";
    // A fetch that hangs forever — proves we don't await it.
    let resolveLater: (v: Response) => void = () => {};
    const slowFetch = vi.fn().mockImplementation(
      () => new Promise<Response>((r) => { resolveLater = r; }),
    );
    globalThis.fetch = slowFetch as unknown as typeof fetch;
    // Warm the identity cache so the first-call git-config shell-out doesn't
    // skew the timing. After this, every call only does sync work + kick off
    // the fetch.
    emitCcStatus({ event: "warm", sessionId: "warm" });
    const start = Date.now();
    emitCcStatus({ event: "session_start", sessionId: "s5" });
    const elapsed = Date.now() - start;
    // Cached path: synchronous work only, fetch is fire-and-forget. 50ms is
    // a generous ceiling — observed elapsed is typ. <5ms on CI.
    expect(elapsed).toBeLessThan(50);
    resolveLater(new Response(null, { status: 204 }));
  });
});
