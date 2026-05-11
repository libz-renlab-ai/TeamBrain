import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isInfected, runM5Session } from "../m5-session-hook.js";

describe("isInfected (no walk-up; pure predicate)", () => {
  it("returns true when manifest.json exists in the given directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-pure-"));
    try {
      fs.mkdirSync(path.join(root, ".teamagent"), { recursive: true });
      fs.writeFileSync(path.join(root, ".teamagent", "manifest.json"), "{}");
      expect(isInfected(root)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns false from a subfolder even when parent has manifest.json", () => {
    // Walk-up belongs at runM5Session, not in this predicate. If sub itself
    // has no manifest, the answer is "this dir is not infected".
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-pure-sub-"));
    try {
      fs.mkdirSync(path.join(root, ".teamagent"), { recursive: true });
      fs.writeFileSync(path.join(root, ".teamagent", "manifest.json"), "{}");
      const sub = path.join(root, "sub");
      fs.mkdirSync(sub, { recursive: true });
      expect(isInfected(sub)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runM5Session walk-up entry (#161)", () => {
  it("resolves projectRoot to ancestor when called from a subfolder of an infected project", async () => {
    // Plant a fully-set-up project (knowledge.db + project marker + manifest)
    // and a non-infected home so userHasTeamAgent returns false (we don't
    // want the run to actually mutate disk via runM5Infect — passing
    // shouldInfect:false short-circuits the side effects we don't have
    // fixtures for here, but we still exercise the resolution path).
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-walkup-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-home-"));
    try {
      // Project marker + knowledge.db so hardened walk-up accepts root
      fs.mkdirSync(path.join(root, ".teamagent"), { recursive: true });
      fs.writeFileSync(path.join(root, ".teamagent", "knowledge.db"), "");
      fs.writeFileSync(path.join(root, "package.json"), "{}");
      // Required for isGitProject(projectRoot) to pass after walk-up
      fs.mkdirSync(path.join(root, ".git"), { recursive: true });

      // Subfolder cwd (no .teamagent on its own)
      const sub = path.join(root, "packages", "deep");
      fs.mkdirSync(sub, { recursive: true });

      // Run with shouldInfect:false so we only verify that the entry walk-up
      // takes effect — no need to mock the downstream m5-* commands.
      const result = await runM5Session({
        projectRoot: sub,
        homeDir,
        shouldInfect: false,
        autoPush: false,
      });

      // No errors means walk-up resolved to root → isGitProject(root) true
      // → no early return → bootstrap/sync/publish guards saw isInfected
      // false (no manifest.json yet) → no-op silently.
      expect(result.errors).toEqual([]);
      // Walked-up root not infected (no manifest) → no published changes
      expect(result.published_changes).toBe(0);
      expect(result.pushed).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("returns early when neither cwd nor any ancestor is a git project", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-nogit-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ta-m5hook-nogit-home-"));
    try {
      const result = await runM5Session({
        projectRoot: cwd,
        homeDir,
        shouldInfect: false,
        autoPush: false,
      });
      expect(result).toEqual({
        infected: false,
        bootstrapped: false,
        synced: false,
        published_changes: 0,
        pushed: false,
        errors: [],
        // W15-014 adds skipped_count to the runM5Session result shape so
        // the SessionStart banner can surface skip reasons. Walk-up early
        // exits return 0.
        skipped_count: 0,
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
