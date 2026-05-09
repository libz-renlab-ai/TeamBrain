import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Regression test for issue #189: bin-stop.cjs leaks node processes when
 * fetch to huggingface.co hangs forever. Root cause: XenovaRuleEmbedder.
 * loadModel() called @xenova/transformers' pipeline() which internally
 * uses globalThis.fetch with no AbortSignal — undici worker thread holds
 * the socket, event loop never drains, process refuses to exit.
 *
 * Fix: wrap globalThis.fetch with AbortSignal.timeout inside loadModel.
 *
 * This test mocks the @xenova/transformers pipeline so it actually calls
 * globalThis.fetch (so our wrapping is exercised), and mocks fetch to
 * return a Promise that never resolves but properly listens to its
 * AbortSignal. With the fix, embed() must reject (via AbortError) within
 * a small multiple of the configured timeout. Without the fix, embed()
 * would hang past the test timeout.
 */
describe("XenovaRuleEmbedder fetch timeout (issue #189)", () => {
  let origFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    origFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    delete process.env["TEAMAGENT_EMBEDDER_FETCH_TIMEOUT_MS"];
  });

  it("loadModel rejects within timeout when fetch hangs forever", async () => {
    // Mock pipeline() to internally call globalThis.fetch — exercising
    // our fetch wrapper. Without the wrapper, this test would hang.
    vi.doMock("@xenova/transformers", () => ({
      pipeline: vi.fn().mockImplementation(async () => {
        // Real transformers.js calls fetch many times during init; one
        // call is sufficient to prove the timeout path.
        await fetch("https://huggingface.co/Xenova/test/resolve/main/config.json");
        return vi.fn();
      }),
      env: { remoteHost: "https://huggingface.co/" },
    }));

    // Replace globalThis.fetch with one that never resolves but listens
    // to AbortSignal — exactly what undici does in production for our
    // wrapper to exploit.
    globalThis.fetch = vi.fn().mockImplementation(
      (_input: unknown, init?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            if (init.signal.aborted) {
              reject(new DOMException("aborted", "AbortError"));
              return;
            }
            init.signal.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }
          // No signal -> hang forever (pre-fix behavior surface).
        });
      },
    ) as typeof globalThis.fetch;

    process.env["TEAMAGENT_EMBEDDER_FETCH_TIMEOUT_MS"] = "300";

    const { XenovaRuleEmbedder } = await import("../xenova-rule-embedder.js");
    const embedder = new XenovaRuleEmbedder();

    const start = Date.now();
    await expect(embedder.embed(["hello"])).rejects.toThrow();
    const elapsed = Date.now() - start;
    // Timeout 300ms; allow up to 4× for CI jitter and module-resolution.
    expect(elapsed).toBeLessThan(1500);
  }, 5000);

  it("loadModel restores globalThis.fetch on error path", async () => {
    vi.doMock("@xenova/transformers", () => ({
      pipeline: vi.fn().mockImplementation(async () => {
        throw new Error("simulated transformers init failure");
      }),
      env: { remoteHost: "https://huggingface.co/" },
    }));

    const sentinel = vi.fn() as unknown as typeof globalThis.fetch;
    globalThis.fetch = sentinel;

    const { XenovaRuleEmbedder } = await import("../xenova-rule-embedder.js");
    const embedder = new XenovaRuleEmbedder();
    await expect(embedder.embed(["x"])).rejects.toThrow(
      /simulated transformers init failure/,
    );
    // Even on error, the wrapper must be removed so subsequent unrelated
    // fetches use the original implementation (not our timeout shim).
    expect(globalThis.fetch).toBe(sentinel);
  }, 5000);
});
