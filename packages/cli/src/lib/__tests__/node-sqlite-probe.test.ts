import { describe, it, expect } from "vitest";
import {
  probeNodeSqlite,
  canLoadNodeSqlite,
} from "../node-sqlite-probe.js";

/**
 * Issue #477: the honest "can a hook subprocess load node:sqlite" probe that
 * `doctor` and `init` gate on. The test runner itself is on the supported Node
 * floor (>= 22.5, per package.json engines), so the real probe returns ok; the
 * failure branch is exercised by pointing the probe at a bogus node binary.
 */
describe("probeNodeSqlite (#477)", () => {
  it("returns ok on the test runner's Node (>= 22.5, the supported floor) — P4", () => {
    const r = probeNodeSqlite();
    expect(r.ok).toBe(true);
    // nodeVersion is the *spawned* PATH node's version (may differ from the
    // vitest runtime under nvm/Volta) — just assert it looks like a version.
    expect(r.nodeVersion).toMatch(/^v\d+\./);
    expect(r.detail).toContain("node:sqlite");
  });

  it("canLoadNodeSqlite() agrees with probeNodeSqlite().ok", () => {
    expect(canLoadNodeSqlite()).toBe(probeNodeSqlite().ok);
  });

  it("fails (not throws) when the node binary can't be spawned", () => {
    // A non-existent exec path: spawnSync reports r.error, the probe must
    // surface ok:false with an actionable detail rather than throwing.
    const r = probeNodeSqlite("/nonexistent/teamagent/no-such-node-binary");
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("node:sqlite");
    // Spawned node never started → version is unknown, not a crash.
    expect(r.nodeVersion).toBe("unknown");
  });
});
