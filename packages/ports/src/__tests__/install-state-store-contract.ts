import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type {
  InstallState,
  InstallStateStore,
} from "../install-state-store.js";

/**
 * Vitest contract suite for any conforming `InstallStateStore` impl.
 *
 * Usage:
 *   describe("FsInstallStateStore", () => {
 *     runInstallStateStoreContract(async () => {
 *       const root = await fs.mkdtemp(...);
 *       return {
 *         store: new FsInstallStateStore({ rootDir: root }),
 *         teardown: () => fs.rm(root, { recursive: true, force: true }),
 *       };
 *     });
 *   });
 *
 * The factory returns a fresh-per-test store + an optional teardown the
 * suite invokes in afterEach. Returning a teardown is what lets the
 * fs-backed adapter tear down its tmpdir between tests without leaking
 * file handles.
 *
 * Behaviours verified:
 *   - load on a never-saved projectId returns null
 *   - save then load returns the same value (round-trip)
 *   - save overwrites a previous save for the same projectId
 *   - two distinct projectIds are independent
 *   - save preserves all six fields exactly (timestamps, completedSteps order)
 *   - completedSteps order is preserved across save/load
 *   - schemaVersion mismatch is caller's problem (the Port writes what it
 *     gets; corruption recovery is in the impl's load path)
 */
export function runInstallStateStoreContract(
  factory: () => Promise<{
    store: InstallStateStore;
    teardown?: () => Promise<void>;
  }>,
): void {
  describe("InstallStateStore contract", () => {
    let store: InstallStateStore;
    let teardown: (() => Promise<void>) | undefined;

    beforeEach(async () => {
      const made = await factory();
      store = made.store;
      teardown = made.teardown;
    });

    afterEach(async () => {
      if (teardown) await teardown();
    });

    it("load on a never-saved projectId returns null", async () => {
      expect(await store.load("p_never_seen")).toBeNull();
    });

    it("save then load returns the same value (round-trip)", async () => {
      const state = makeState("p_round_trip", {
        completedSteps: ["npm-global-install"],
      });
      await store.save("p_round_trip", state);
      const loaded = await store.load("p_round_trip");
      expect(loaded).toEqual(state);
    });

    it("save overwrites a previous save for the same projectId", async () => {
      const first = makeState("p_overwrite", {
        completedSteps: ["npm-global-install"],
        updatedAt: 1000,
        lastRunAt: 1000,
      });
      const second = makeState("p_overwrite", {
        completedSteps: ["npm-global-install", "hook-write"],
        updatedAt: 2000,
        lastRunAt: 2000,
      });
      await store.save("p_overwrite", first);
      await store.save("p_overwrite", second);
      expect(await store.load("p_overwrite")).toEqual(second);
    });

    it("two distinct projectIds are independent", async () => {
      const a = makeState("p_a", { completedSteps: ["hook-write"] });
      const b = makeState("p_b", { completedSteps: ["plugin-copy"] });
      await store.save("p_a", a);
      await store.save("p_b", b);
      expect(await store.load("p_a")).toEqual(a);
      expect(await store.load("p_b")).toEqual(b);
    });

    it("preserves all six fields exactly across save/load", async () => {
      const state: InstallState = {
        schemaVersion: "v1",
        projectId: "p_exact",
        createdAt: 1700000000000,
        updatedAt: 1700000001234,
        completedSteps: ["npm-global-install", "hook-write", "config-write"],
        lastRunAt: 1700000005678,
      };
      await store.save("p_exact", state);
      const loaded = await store.load("p_exact");
      expect(loaded).toEqual(state);
      // Defensive: confirm individual fields, not just deep-equal
      expect(loaded?.schemaVersion).toBe("v1");
      expect(loaded?.projectId).toBe("p_exact");
      expect(loaded?.createdAt).toBe(1700000000000);
      expect(loaded?.updatedAt).toBe(1700000001234);
      expect(loaded?.lastRunAt).toBe(1700000005678);
      expect(loaded?.completedSteps).toEqual([
        "npm-global-install",
        "hook-write",
        "config-write",
      ]);
    });

    it("preserves completedSteps insertion order across save/load", async () => {
      const state = makeState("p_order", {
        completedSteps: [
          "config-write",
          "hook-write",
          "npm-global-install",
          "plugin-copy",
        ],
      });
      await store.save("p_order", state);
      const loaded = await store.load("p_order");
      expect(loaded?.completedSteps).toEqual([
        "config-write",
        "hook-write",
        "npm-global-install",
        "plugin-copy",
      ]);
    });

    it("save then load with empty completedSteps round-trips", async () => {
      const state = makeState("p_empty", { completedSteps: [] });
      await store.save("p_empty", state);
      expect(await store.load("p_empty")).toEqual(state);
    });

    it("multiple save/load cycles in sequence remain consistent", async () => {
      let s = makeState("p_seq", { completedSteps: [] });
      await store.save("p_seq", s);
      expect(await store.load("p_seq")).toEqual(s);

      s = { ...s, completedSteps: ["npm-global-install"], updatedAt: 2000 };
      await store.save("p_seq", s);
      expect(await store.load("p_seq")).toEqual(s);

      s = {
        ...s,
        completedSteps: [...s.completedSteps, "hook-write"],
        updatedAt: 3000,
      };
      await store.save("p_seq", s);
      expect(await store.load("p_seq")).toEqual(s);
    });
  });
}

/** Test helper: build a state with sensible defaults overridable per case. */
function makeState(
  projectId: string,
  overrides: Partial<Omit<InstallState, "schemaVersion" | "projectId">> = {},
): InstallState {
  return {
    schemaVersion: "v1",
    projectId,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    completedSteps: [],
    lastRunAt: 1700000000000,
    ...overrides,
  };
}

/**
 * In-memory fake used to lock the contract before any real impl ships.
 *
 * Re-exported for use by other tests that want a noop store in scope
 * (e.g., the convenience-fn tests in `@teamagent/core/install-state/checkpoint`).
 */
export class InMemoryInstallStateStore implements InstallStateStore {
  private readonly map = new Map<string, InstallState>();

  async load(projectId: string): Promise<InstallState | null> {
    const stored = this.map.get(projectId);
    if (!stored) return null;
    // Defensive deep-clone via JSON so the contract doesn't accidentally
    // succeed because the impl returns the same reference (which would
    // mask races a real fs impl could not avoid).
    return JSON.parse(JSON.stringify(stored)) as InstallState;
  }

  async save(projectId: string, state: InstallState): Promise<void> {
    this.map.set(projectId, JSON.parse(JSON.stringify(state)) as InstallState);
  }
}
