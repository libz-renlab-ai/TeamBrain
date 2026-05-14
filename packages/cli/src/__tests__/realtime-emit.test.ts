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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emitCcStatus, __resetIdentityCacheForTests } from "../realtime-emit.js";

const ORIGINAL_FETCH = globalThis.fetch;
// Issue #308 /review finding #10: previous pattern
// `if (ORIGINAL) process.env.X = ORIGINAL` left the env var leaked to the
// NEXT test file when the original was undefined (which is typical CI).
// Snapshot + delete-or-restore — matching presence-command.test.ts.
//
// Issue #350 (v0.11.1): HOME + USERPROFILE join the list so the
// resolveBaseUrl() saved-config fallback (reads <HOME>/.teamagent/digital-twin.json)
// can be sandboxed to a tmpdir per-test. beforeEach deletes from the env, then
// the digital-twin-fallback tests explicitly set HOME/USERPROFILE to the
// freshly-mkdtemped sandbox. afterEach restores the original values via the
// same loop so no leak.
const ENV_KEYS = [
  "TEAMAGENT_REALTIME_URL",
  "TEAMAGENT_REALTIME_TOKEN",
  "TEAMAGENT_DISABLED",
  "TEAMAGENT_REALTIME_ALLOW_REMOTE",
  "TEAMAGENT_REALTIME_RAW_PROMPT",
  "HOME",
  "USERPROFILE",
] as const;

/**
 * Issue #350 (v0.11.1) — every test in this file sandboxes HOME / USERPROFILE
 * to a tmp dir so `resolveBaseUrl()`'s saved-config fallback (which reads
 * `<HOME>/.teamagent/digital-twin.json`) doesn't see the developer's real
 * configured endpoint. Tests that exercise the fallback path explicitly
 * `fs.writeFileSync` a config into the sandbox HOME first.
 */
let sandboxHome: string;

describe("emitCcStatus", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    // Issue #350 (v0.11.1) — point HOME / USERPROFILE at a fresh tmpdir so
    // resolveBaseUrl()'s saved-config fallback can't see the real one. The
    // loop above already deleted them; this re-sets to the sandbox so
    // homeForConfig() in realtime-emit.ts returns the sandbox path on both
    // POSIX and Windows.
    sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), "realtime-emit-test-"));
    process.env.HOME = sandboxHome;
    process.env.USERPROFILE = sandboxHome;
    __resetIdentityCacheForTests();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    // Issue #350 (v0.11.1) — drop the tmpdir HOME. Best-effort: ignore EBUSY
    // / EPERM on Windows so a slow handle-release doesn't fail the test.
    try {
      fs.rmSync(sandboxHome, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  function writeDigitalTwinConfig(cfg: {
    enabled: boolean;
    endpoint: string;
    token?: string | null;
  }): void {
    const cfgDir = path.join(sandboxHome, ".teamagent");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, "digital-twin.json"),
      JSON.stringify({
        schema_version: "1",
        identity: { user_id: "test@example.com", machine_id: "test-host" },
        uploader: {
          enabled: cfg.enabled,
          endpoint: cfg.endpoint,
          token: cfg.token ?? null,
        },
        consented_at: new Date().toISOString(),
      }),
    );
    __resetIdentityCacheForTests();
  }

  it("is a no-op when TEAMAGENT_REALTIME_URL is unset AND no saved digital-twin config", () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s1", cwd: "/tmp" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("issue #350 — falls back to digital-twin config endpoint when env unset", async () => {
    writeDigitalTwinConfig({
      enabled: true,
      endpoint: "http://192.168.22.88:8080",
      token: "team-shared",
    });
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s-cfg", cwd: "/tmp" });
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0]!;
    // Config-derived URL bypasses the loopback gate — see resolveBaseUrl()
    // security rationale.
    expect(url).toBe("http://192.168.22.88:8080/v1/cc-status");
  });

  it("issue #350 — does NOT fall back when uploader.enabled is false", () => {
    writeDigitalTwinConfig({
      enabled: false,
      endpoint: "http://192.168.22.88:8080",
      token: "team-shared",
    });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s-paused" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("issue #350 — env URL still wins over saved config", async () => {
    writeDigitalTwinConfig({
      enabled: true,
      endpoint: "http://192.168.22.88:8080",
      token: "team-shared",
    });
    process.env.TEAMAGENT_REALTIME_URL = "http://127.0.0.1:9787";
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emitCcStatus({ event: "session_start", sessionId: "s-env-wins" });
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe("http://127.0.0.1:9787/v1/cc-status");
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
