import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  executePackAdd,
  executePackList,
  executePackRemove,
  packAddExitCode,
  parsePackArgs,
  renderPackAdd,
  renderPackList,
  renderPackRemove,
} from "../commands/pack.js";

function makeTempDirs(): { home: string; packsDir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ta-pack-test-"));
  const home = path.join(root, "home");
  const packsDir = path.join(root, "packs");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(packsDir, { recursive: true });
  // Copy fixture packs into the temp registry dir
  const fixtures = path.join(__dirname, "fixtures", "packs");
  for (const f of fs.readdirSync(fixtures)) {
    fs.copyFileSync(path.join(fixtures, f), path.join(packsDir, f));
  }
  return {
    home,
    packsDir,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

describe("pack CLI", () => {
  let dirs: ReturnType<typeof makeTempDirs>;

  beforeEach(() => {
    dirs = makeTempDirs();
  });

  afterEach(() => {
    dirs.cleanup();
  });

  describe("executePackList", () => {
    it("lists 2 available packs and 0 installed when DB is empty", () => {
      const r = executePackList({ packsDir: dirs.packsDir, homeDir: dirs.home });
      expect(r.available.map((p) => p.name).sort()).toEqual([
        "frontend-js",
        "ops-safety",
      ]);
      expect(r.installed).toEqual([]);
    });

    it("falls back to empty available when packsDir does not exist", () => {
      const r = executePackList({
        packsDir: path.join(dirs.home, "nope"),
        homeDir: dirs.home,
      });
      expect(r.available).toEqual([]);
      expect(r.installed).toEqual([]);
    });
  });

  describe("executePackAdd", () => {
    it("adds 1 rule per pack and reports totals", () => {
      const r = executePackAdd(["frontend-js", "ops-safety"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(r.added).toHaveLength(2);
      const names = r.added.map((a) => a.name).sort();
      expect(names).toEqual(["frontend-js", "ops-safety"]);
      for (const a of r.added) expect(a.rules).toBeGreaterThan(0);
      expect(r.notFound).toEqual([]);
      expect(r.failed).toEqual([]);
    });

    it("reports notFound for unknown pack names", () => {
      const r = executePackAdd(["does-not-exist"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(r.added).toEqual([]);
      expect(r.notFound).toEqual(["does-not-exist"]);
      expect(packAddExitCode(r)).toBe(1);
    });

    it("returns alreadyInstalled on second invocation", () => {
      executePackAdd(["frontend-js"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      const r2 = executePackAdd(["frontend-js"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(r2.added).toEqual([]);
      expect(r2.alreadyInstalled).toEqual(["frontend-js"]);
      expect(packAddExitCode(r2)).toBe(0);
    });

    it("supports the special name 'all'", () => {
      const r = executePackAdd(["all"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(r.added.map((a) => a.name).sort()).toEqual([
        "frontend-js",
        "ops-safety",
      ]);
    });
  });

  describe("executePackRemove", () => {
    it("deletes only entries tagged pack:<name>", () => {
      executePackAdd(["frontend-js", "ops-safety"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      const before = executePackList({
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(before.installed.map((p) => p.name).sort()).toEqual([
        "frontend-js",
        "ops-safety",
      ]);

      const rem = executePackRemove(["frontend-js"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(rem.removed.map((r) => r.name)).toEqual(["frontend-js"]);
      expect(rem.notInstalled).toEqual([]);

      const after = executePackList({
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(after.installed.map((p) => p.name)).toEqual(["ops-safety"]);
    });

    it("reports notInstalled when pack has no rules in store", () => {
      const r = executePackRemove(["frontend-js"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(r.removed).toEqual([]);
      expect(r.notInstalled).toEqual(["frontend-js"]);
    });
  });

  // Regression — Codex review on PR #110 (P2): packaging mismatches must fail loud.
  describe("registry / packaging mismatches (Codex P2 fixes)", () => {
    it("pack add fails when meta exists but rule jsonl is missing", () => {
      // Remove the rule file but keep the meta — simulates a packaging mismatch.
      fs.unlinkSync(path.join(dirs.packsDir, "frontend-js.jsonl"));
      const r = executePackAdd(["frontend-js"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      expect(r.added).toEqual([]);
      expect(r.failed.map((f) => f.name)).toEqual(["frontend-js"]);
      expect(r.failed[0]!.error).toMatch(/rule file missing/);
      expect(packAddExitCode(r)).toBe(1);
    });

    it("pack list shows orphan pack (rules in store but meta missing)", () => {
      // Install both, then delete one's meta to make it orphan.
      executePackAdd(["frontend-js", "ops-safety"], {
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      fs.unlinkSync(path.join(dirs.packsDir, "ops-safety.meta.json"));
      fs.unlinkSync(path.join(dirs.packsDir, "ops-safety.jsonl"));

      const r = executePackList({
        packsDir: dirs.packsDir,
        homeDir: dirs.home,
      });
      const installedNames = r.installed.map((m) => m.name).sort();
      // Both should still surface as installed — orphan must NOT vanish.
      expect(installedNames).toEqual(["frontend-js", "ops-safety"]);
      const orphan = r.installed.find((m) => m.name === "ops-safety")!;
      expect(orphan.description).toMatch(/metadata unavailable/);
      // The available list (from registry) only shows packs whose meta still exists.
      expect(r.available.map((m) => m.name)).toEqual(["frontend-js"]);
    });
  });
});

describe("parsePackArgs", () => {
  it("parses `list --json`", () => {
    const r = parsePackArgs(["list", "--json"]);
    expect(r.sub).toBe("list");
    expect(r.json).toBe(true);
    expect(r.names).toEqual([]);
  });

  it("parses comma-separated names", () => {
    const r = parsePackArgs(["add", "frontend-js,ops-safety"]);
    expect(r.sub).toBe("add");
    expect(r.names).toEqual(["frontend-js", "ops-safety"]);
  });

  it("parses space-separated positional names", () => {
    const r = parsePackArgs(["add", "frontend-js", "ops-safety"]);
    expect(r.names).toEqual(["frontend-js", "ops-safety"]);
  });

  it("rejects empty argv", () => {
    expect(() => parsePackArgs([])).toThrow();
  });

  it("rejects unknown subcommand", () => {
    expect(() => parsePackArgs(["spaghetti"])).toThrow();
  });

  it("rejects add without names", () => {
    expect(() => parsePackArgs(["add"])).toThrow();
  });
});

describe("renderPackList", () => {
  it("prints an installed/available text summary by default", () => {
    const out = renderPackList(
      {
        installed: [],
        available: [
          {
            name: "x",
            description: "y",
            tags: ["z"],
            file_hints: [],
            prompt_version: 1,
          },
        ],
        packsDir: "/tmp/x",
      },
      false,
    );
    expect(out).toContain("(none)");
    expect(out).toMatch(/Available packs.*1/);
    expect(out).toContain("- x [z] — y");
  });

  it("emits canonical JSON when --json", () => {
    const out = renderPackList(
      { installed: [], available: [], packsDir: null },
      true,
    );
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ installed: [], available: [], packs_dir: null });
  });
});

describe("renderPackAdd / renderPackRemove", () => {
  it("renderPackAdd reports unknown packs as ❌", () => {
    const out = renderPackAdd({
      added: [],
      alreadyInstalled: [],
      notFound: ["x"],
      failed: [],
    });
    expect(out).toContain("❌ Unknown pack: x");
  });

  it("renderPackRemove reports removed counts", () => {
    const out = renderPackRemove({
      removed: [{ name: "x", rules: 3 }],
      notInstalled: [],
    });
    expect(out).toContain('Removed pack "x"');
    expect(out).toContain("3 rules deleted");
  });
});
