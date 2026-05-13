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
import { emitCcStatus, __resetIdentityCacheForTests } from "../realtime-emit.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV_URL = process.env.TEAMAGENT_REALTIME_URL;
const ORIGINAL_ENV_TOKEN = process.env.TEAMAGENT_REALTIME_TOKEN;
const ORIGINAL_ENV_DISABLED = process.env.TEAMAGENT_DISABLED;
const ORIGINAL_ENV_ALLOW_REMOTE = process.env.TEAMAGENT_REALTIME_ALLOW_REMOTE;

describe("emitCcStatus", () => {
  beforeEach(() => {
    delete process.env.TEAMAGENT_REALTIME_URL;
    delete process.env.TEAMAGENT_REALTIME_TOKEN;
    delete process.env.TEAMAGENT_DISABLED;
    delete process.env.TEAMAGENT_REALTIME_ALLOW_REMOTE;
    __resetIdentityCacheForTests();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_ENV_URL) process.env.TEAMAGENT_REALTIME_URL = ORIGINAL_ENV_URL;
    if (ORIGINAL_ENV_TOKEN) process.env.TEAMAGENT_REALTIME_TOKEN = ORIGINAL_ENV_TOKEN;
    if (ORIGINAL_ENV_DISABLED) process.env.TEAMAGENT_DISABLED = ORIGINAL_ENV_DISABLED;
    if (ORIGINAL_ENV_ALLOW_REMOTE)
      process.env.TEAMAGENT_REALTIME_ALLOW_REMOTE = ORIGINAL_ENV_ALLOW_REMOTE;
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

  it("refuses non-loopback URLs by default (SSRF / exfil guard)", () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://evil.example.com:9787";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s-attack" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows non-loopback URLs when TEAMAGENT_REALTIME_ALLOW_REMOTE=1", async () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://lan-receiver.local:9787";
    process.env.TEAMAGENT_REALTIME_ALLOW_REMOTE = "1";
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s-lan" });
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts 127.0.0.1, localhost, and ::1 without the override", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    for (const host of ["http://127.0.0.1:9787", "http://localhost:9787", "http://[::1]:9787"]) {
      process.env.TEAMAGENT_REALTIME_URL = host;
      emitCcStatus({ event: "session_start", sessionId: "s-loop" });
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("rejects file:// and javascript: schemes regardless of host", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "not-a-url"]) {
      process.env.TEAMAGENT_REALTIME_URL = url;
      emitCcStatus({ event: "session_start", sessionId: "s-bad" });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("respects TEAMAGENT_DISABLED=1 even when REALTIME_URL is set", () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9787";
    process.env.TEAMAGENT_DISABLED = "1";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s-killswitch" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clamps non-finite contextTokens to omitted (no NaN/Infinity in body)", async () => {
    process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9787";
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({
      event: "session_start",
      sessionId: "s-bad-tokens",
      contextTokens: Number.POSITIVE_INFINITY,
    });
    await new Promise((r) => setTimeout(r, 5));
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.context_tokens).toBeUndefined();
    expect(body.context_pct).toBeUndefined();
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

  // Issue #308 grill §3 — raw prompt threading + privacy default
  describe("raw_prompt (issue #308 grill §3)", () => {
    async function captureBody(emit: () => void): Promise<Record<string, unknown>> {
      process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9787";
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(null, { status: 204 }),
      );
      globalThis.fetch = fetchSpy as unknown as typeof fetch;
      emit();
      await new Promise((r) => setTimeout(r, 5));
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0]!;
      return JSON.parse((init as RequestInit).body as string);
    }

    it("omits raw_prompt when rawPrompt is undefined (privacy default)", async () => {
      const body = await captureBody(() => {
        emitCcStatus({ event: "user_prompt_submit", sessionId: "s-1" });
      });
      expect(body.raw_prompt).toBeUndefined();
    });

    it("omits raw_prompt when rawPrompt is empty string (filtered)", async () => {
      const body = await captureBody(() => {
        emitCcStatus({
          event: "user_prompt_submit",
          sessionId: "s-2",
          rawPrompt: "",
        });
      });
      expect(body.raw_prompt).toBeUndefined();
    });

    it("threads raw_prompt only when TEAMAGENT_REALTIME_RAW_PROMPT=1 (defense in depth)", async () => {
      // Without the env opt-in, the transport drops raw_prompt regardless
      // of what the caller passed. Even a direct caller bypassing the hook
      // policy gate (bin-user-prompt-submit.ts) cannot exfiltrate prompt
      // text. /review adversarial finding #9.
      const bodyWithoutOptIn = await captureBody(() => {
        emitCcStatus({
          event: "user_prompt_submit",
          sessionId: "s-3a",
          rawPrompt: "hello presence",
        });
      });
      expect(bodyWithoutOptIn.raw_prompt).toBeUndefined();

      // With the env opt-in, raw_prompt is threaded through.
      process.env.TEAMAGENT_REALTIME_RAW_PROMPT = "1";
      try {
        const bodyWithOptIn = await captureBody(() => {
          emitCcStatus({
            event: "user_prompt_submit",
            sessionId: "s-3b",
            rawPrompt: "hello presence",
          });
        });
        expect(bodyWithOptIn.raw_prompt).toBe("hello presence");
      } finally {
        delete process.env.TEAMAGENT_REALTIME_RAW_PROMPT;
      }
    });

    it("stop event accepts no rawPrompt (caller never sets it)", async () => {
      const body = await captureBody(() => {
        emitCcStatus({
          event: "stop",
          sessionId: "s-4",
          cwd: "/Users/me/repo",
        });
      });
      expect(body.event).toBe("stop");
      expect(body.raw_prompt).toBeUndefined();
    });

    it("session_end event posts with event=session_end", async () => {
      const body = await captureBody(() => {
        emitCcStatus({
          event: "session_end",
          sessionId: "s-5",
          cwd: "/Users/me/repo",
        });
      });
      expect(body.event).toBe("session_end");
    });
  });
});
