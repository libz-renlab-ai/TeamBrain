import { describe, expect, it } from "vitest";
import { InMemoryInstallStateStore } from "@teamagent/ports/contracts";
import { checkpoint } from "../checkpoint.js";
import { isStepDone, pendingSteps } from "../lifecycle.js";
import { STEP_KEYS } from "../schema.js";

describe("checkpoint(store, projectId, step, now)", () => {
  it("creates a fresh notebook on first call and records the step", async () => {
    const store = new InMemoryInstallStateStore();
    const after = await checkpoint(store, "p_first", "npm-global-install", 1000);
    expect(after.completedSteps).toEqual(["npm-global-install"]);
    expect(after.createdAt).toBe(1000);
    expect(after.updatedAt).toBe(1000);
    expect(after.lastRunAt).toBe(1000);
    // And the store reflects it
    const loaded = await store.load("p_first");
    expect(loaded).toEqual(after);
  });

  it("appends successive steps without re-creating createdAt", async () => {
    const store = new InMemoryInstallStateStore();
    const a = await checkpoint(store, "p_seq", "npm-global-install", 1000);
    const b = await checkpoint(store, "p_seq", "hook-write", 2000);
    expect(a.createdAt).toBe(1000);
    expect(b.createdAt).toBe(1000); // preserved
    expect(b.updatedAt).toBe(2000);
    expect(b.completedSteps).toEqual(["npm-global-install", "hook-write"]);
  });

  it("is idempotent for repeat calls of the same step", async () => {
    const store = new InMemoryInstallStateStore();
    await checkpoint(store, "p_idem", "config-write", 1000);
    const second = await checkpoint(store, "p_idem", "config-write", 2000);
    expect(second.completedSteps).toEqual(["config-write"]);
    expect(second.updatedAt).toBe(2000); // bumped
  });

  it("two distinct projectIds keep their notebooks independent", async () => {
    const store = new InMemoryInstallStateStore();
    await checkpoint(store, "p_a", "npm-global-install", 1000);
    await checkpoint(store, "p_b", "hook-write", 2000);
    const a = await store.load("p_a");
    const b = await store.load("p_b");
    expect(a?.completedSteps).toEqual(["npm-global-install"]);
    expect(b?.completedSteps).toEqual(["hook-write"]);
  });

  it("works through the full canonical step sequence", async () => {
    const store = new InMemoryInstallStateStore();
    let t = 1000;
    let last = await checkpoint(store, "p_full", STEP_KEYS[0], t);
    for (let i = 1; i < STEP_KEYS.length; i++) {
      t += 100;
      last = await checkpoint(store, "p_full", STEP_KEYS[i]!, t);
    }
    // All steps recorded, in canonical order
    expect(last.completedSteps).toEqual([...STEP_KEYS]);
    for (const step of STEP_KEYS) {
      expect(isStepDone(last, step)).toBe(true);
    }
    expect(pendingSteps(last)).toEqual([]);
  });

  it("returns the saved state (not a stale local copy)", async () => {
    const store = new InMemoryInstallStateStore();
    const returned = await checkpoint(store, "p_saved", "plugin-copy", 1000);
    const loaded = await store.load("p_saved");
    expect(returned).toEqual(loaded);
  });
});
