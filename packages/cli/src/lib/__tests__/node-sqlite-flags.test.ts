import { describe, it, expect } from "vitest";
import {
  NODE_SQLITE_FLAGS,
  NODE_SQLITE_FLAGS_STR,
} from "../node-sqlite-flags.js";

/**
 * Issue #477: the flags every TeamAgent hook subprocess needs to load
 * `node:sqlite`. These are the single source of truth shared by the hook
 * registration command strings, the SessionStart spawn sites, and the doctor /
 * init probe — so the contract gets a regression lock.
 */
describe("NODE_SQLITE_FLAGS (#477)", () => {
  it("carries --experimental-sqlite and --no-warnings, in that order", () => {
    expect(NODE_SQLITE_FLAGS).toEqual([
      "--experimental-sqlite",
      "--no-warnings",
    ]);
  });

  it("string form is the space-joined argv form", () => {
    expect(NODE_SQLITE_FLAGS_STR).toBe("--experimental-sqlite --no-warnings");
    expect(NODE_SQLITE_FLAGS_STR).toBe(NODE_SQLITE_FLAGS.join(" "));
  });

  it("string form contains the load-bearing --experimental-sqlite flag", () => {
    // P1 anchor: every hook registration command string is built from this.
    expect(NODE_SQLITE_FLAGS_STR).toContain("--experimental-sqlite");
  });
});
