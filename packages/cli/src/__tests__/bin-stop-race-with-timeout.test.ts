import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { raceWithTimeout } from "../bin-stop.js";

/**
 * Codex-found regression on PR #196 (issue #189 follow-up):
 *
 * The original `Promise.race + new Promise(setTimeout(..., resolve))` pattern
 * for both scan-errors and semantic-scan never called `clearTimeout` when the
 * work-promise won, and didn't `unref` the timer. Effects:
 *   1. The Stop hook process stayed alive until the full timeout elapsed even
 *      after work completed in milliseconds.
 *   2. The per-cwd singleton lock was held for the same duration, blocking
 *      every subsequent Stop event for up to 30s — visible regression in
 *      hook responsiveness reported by Codex.
 *
 * `raceWithTimeout` fixes both: it `clearTimeout`s the timer in the `finally`
 * branch and `unref`s it so it doesn't pin the event loop.
 */
describe("raceWithTimeout (issue #189 follow-up, Codex-found)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the work value when work resolves before the timeout", async () => {
    const work = Promise.resolve("ok");
    const result = await raceWithTimeout(work, 60_000);
    expect(result).toBe("ok");
  });

  it("returns null when the timeout fires before work resolves", async () => {
    const work = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 5_000);
    });
    const promise = raceWithTimeout(work, 1_000);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(promise).resolves.toBeNull();
  });

  it("clears the pending timer when work wins (no late-firing leak)", async () => {
    const clearSpy = vi.spyOn(global, "clearTimeout");
    const work = Promise.resolve(42);
    await raceWithTimeout(work, 60_000);
    expect(clearSpy).toHaveBeenCalled();
  });

  it("unrefs the timer so it does not keep the event loop alive", async () => {
    const setSpy = vi.spyOn(global, "setTimeout");
    const work = Promise.resolve("done");
    await raceWithTimeout(work, 60_000);
    // Find the timer object the helper created (a Timeout in node, not a
    // browser handle). Vitest's fake timers expose `unref` on it.
    const calls = setSpy.mock.results;
    expect(calls.length).toBeGreaterThan(0);
    const timerObj = calls[0]!.value as { unref?: () => void } | undefined;
    expect(timerObj && typeof timerObj.unref === "function").toBe(true);
  });

  it("propagates rejection from the work promise", async () => {
    const work = Promise.reject(new Error("boom"));
    await expect(raceWithTimeout(work, 60_000)).rejects.toThrow(/boom/);
  });
});
