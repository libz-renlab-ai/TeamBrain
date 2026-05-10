import { describe, expect, it } from "vitest";
import {
  isStepDone,
  makeEmptyState,
  markStepDone,
  nextPendingStep,
  pendingSteps,
} from "../lifecycle.js";
import { STEP_KEYS } from "../schema.js";

describe("lifecycle", () => {
  describe("makeEmptyState", () => {
    it("creates a v1 state with the given projectId and `now` for all timestamps", () => {
      const s = makeEmptyState("p_x", 1700000000000);
      expect(s.schemaVersion).toBe("v1");
      expect(s.projectId).toBe("p_x");
      expect(s.createdAt).toBe(1700000000000);
      expect(s.updatedAt).toBe(1700000000000);
      expect(s.lastRunAt).toBe(1700000000000);
      expect(s.completedSteps).toEqual([]);
    });

    it("rejects empty projectId", () => {
      expect(() => makeEmptyState("", 0)).toThrow();
    });

    it("rejects negative or non-finite `now`", () => {
      expect(() => makeEmptyState("p_x", -1)).toThrow();
      expect(() => makeEmptyState("p_x", Number.NaN)).toThrow();
      expect(() => makeEmptyState("p_x", Infinity)).toThrow();
    });

    it("uses Date.now() when `now` is omitted", () => {
      const before = Date.now();
      const s = makeEmptyState("p_x");
      const after = Date.now();
      expect(s.createdAt).toBeGreaterThanOrEqual(before);
      expect(s.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe("markStepDone", () => {
    it("appends a step to completedSteps and bumps timestamps", () => {
      const start = makeEmptyState("p_x", 1000);
      const next = markStepDone(start, "npm-global-install", 2000);
      expect(next.completedSteps).toEqual(["npm-global-install"]);
      expect(next.updatedAt).toBe(2000);
      expect(next.lastRunAt).toBe(2000);
      expect(next.createdAt).toBe(1000); // not bumped
      expect(next.projectId).toBe("p_x");
    });

    it("is idempotent — same step twice produces the same step list", () => {
      const start = makeEmptyState("p_x", 1000);
      const once = markStepDone(start, "hook-write", 2000);
      const twice = markStepDone(once, "hook-write", 3000);
      expect(twice.completedSteps).toEqual(["hook-write"]);
      expect(twice.updatedAt).toBe(3000); // timestamp does bump
    });

    it("preserves order of insertion when adding multiple steps", () => {
      let s = makeEmptyState("p_x", 1000);
      s = markStepDone(s, "config-write", 2000);
      s = markStepDone(s, "hook-write", 3000);
      s = markStepDone(s, "npm-global-install", 4000);
      expect(s.completedSteps).toEqual([
        "config-write",
        "hook-write",
        "npm-global-install",
      ]);
    });

    it("does not mutate the input state", () => {
      const start = makeEmptyState("p_x", 1000);
      const before = JSON.stringify(start);
      markStepDone(start, "hook-write", 2000);
      expect(JSON.stringify(start)).toBe(before);
    });

    it("rejects negative or non-finite `now`", () => {
      const start = makeEmptyState("p_x", 1000);
      expect(() => markStepDone(start, "hook-write", -1)).toThrow();
      expect(() => markStepDone(start, "hook-write", Number.NaN)).toThrow();
    });
  });

  describe("isStepDone", () => {
    it("returns false for an empty state", () => {
      const s = makeEmptyState("p_x", 1000);
      for (const step of STEP_KEYS) {
        expect(isStepDone(s, step)).toBe(false);
      }
    });

    it("returns true after a step is marked done", () => {
      const s = markStepDone(makeEmptyState("p_x", 1000), "hook-write", 2000);
      expect(isStepDone(s, "hook-write")).toBe(true);
      expect(isStepDone(s, "config-write")).toBe(false);
    });
  });

  describe("pendingSteps", () => {
    it("returns all canonical steps for an empty state (default allSteps)", () => {
      const s = makeEmptyState("p_x", 1000);
      expect(pendingSteps(s)).toEqual([...STEP_KEYS]);
    });

    it("excludes done steps and preserves canonical order", () => {
      let s = makeEmptyState("p_x", 1000);
      s = markStepDone(s, "hook-write", 2000);
      s = markStepDone(s, "post-install-verify", 3000);
      expect(pendingSteps(s)).toEqual([
        "npm-global-install",
        "plugin-copy",
        "config-write",
        "migration-apply",
      ]);
    });

    it("returns empty when all steps are done", () => {
      let s = makeEmptyState("p_x", 1000);
      let t = 2000;
      for (const step of STEP_KEYS) {
        s = markStepDone(s, step, t++);
      }
      expect(pendingSteps(s)).toEqual([]);
    });

    it("respects a custom allSteps list", () => {
      const s = markStepDone(
        makeEmptyState("p_x", 1000),
        "hook-write",
        2000,
      );
      expect(
        pendingSteps(s, ["hook-write", "config-write"]),
      ).toEqual(["config-write"]);
    });
  });

  describe("nextPendingStep", () => {
    it("returns the first canonical step for an empty state", () => {
      const s = makeEmptyState("p_x", 1000);
      expect(nextPendingStep(s)).toBe("npm-global-install");
    });

    it("returns the next not-done step (canonical order)", () => {
      const s = markStepDone(
        makeEmptyState("p_x", 1000),
        "npm-global-install",
        2000,
      );
      expect(nextPendingStep(s)).toBe("hook-write");
    });

    it("returns null when every canonical step is done", () => {
      let s = makeEmptyState("p_x", 1000);
      let t = 2000;
      for (const step of STEP_KEYS) {
        s = markStepDone(s, step, t++);
      }
      expect(nextPendingStep(s)).toBeNull();
    });

    it("respects a custom allSteps list", () => {
      const s = markStepDone(
        makeEmptyState("p_x", 1000),
        "hook-write",
        2000,
      );
      expect(
        nextPendingStep(s, ["hook-write", "config-write", "post-install-verify"]),
      ).toBe("config-write");
    });
  });
});
