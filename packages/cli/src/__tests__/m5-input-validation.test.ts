import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runM5Share, M5ShareValidationError } from "../commands/m5-share.js";
import { runM5Delete, M5DeleteValidationError } from "../commands/m5-delete.js";
import { runM5Sync } from "../commands/m5-sync.js";
import { FsTeamRuleStore } from "@teamagent/adapters/m5/fs-team-rule-store";

async function mkRepo(): Promise<{ root: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "m5-validation-test-"));
  execSync("git init -q", { cwd: root });
  execSync("git config user.email t@t", { cwd: root });
  execSync("git config user.name t", { cwd: root });
  return { root, cleanup: async () => fs.rm(root, { recursive: true, force: true }) };
}

describe("m5-share input validation (B-114, B-115, B-140)", () => {
  it("rejects rule_id with path-traversal characters", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      await expect(
        runM5Share({ projectRoot: root, text: "x", ruleId: "../../etc/passwd", scope: "team", author: "tester" }),
      ).rejects.toBeInstanceOf(M5ShareValidationError);
    } finally {
      await cleanup();
    }
  });

  it("rejects author with slashes / shell metacharacters", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      await expect(
        runM5Share({ projectRoot: root, text: "x", ruleId: "valid-id", scope: "team", author: "../../evil" }),
      ).rejects.toBeInstanceOf(M5ShareValidationError);
    } finally {
      await cleanup();
    }
  });

  it("rejects future timestamps (>60s ahead)", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      await expect(
        runM5Share({
          projectRoot: root,
          text: "x",
          ruleId: "valid-id",
          scope: "team",
          author: "tester",
          now: "3000-01-01T00:00:00.000Z",
        }),
      ).rejects.toBeInstanceOf(M5ShareValidationError);
    } finally {
      await cleanup();
    }
  });

  it("accepts safe rule_id and author", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      const result = await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review",
        ruleId: "good-rule.v1",
        scope: "team",
        author: "alice",
      });
      expect(result.action.kind).toBe("promote_to_l2");
    } finally {
      await cleanup();
    }
  });
});

describe("m5-delete input validation (B-114, B-115, B-119, B-140)", () => {
  it("rejects rule_id with path-traversal characters", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      await expect(
        runM5Delete({ projectRoot: root, ruleId: "../../etc/passwd", deletedBy: "tester" }),
      ).rejects.toBeInstanceOf(M5DeleteValidationError);
    } finally {
      await cleanup();
    }
  });

  it("rejects --by with slashes", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      await expect(
        runM5Delete({ projectRoot: root, ruleId: "valid-id", deletedBy: "../../evil" }),
      ).rejects.toBeInstanceOf(M5DeleteValidationError);
    } finally {
      await cleanup();
    }
  });

  it("rejects tombstone for nonexistent rule_id (B-119: lineage spoofing)", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      await expect(
        runM5Delete({
          projectRoot: root,
          ruleId: "rule-that-never-existed",
          deletedBy: "tester",
          reason: "ghost",
        }),
      ).rejects.toThrow(/does not exist/);
    } finally {
      await cleanup();
    }
  });

  it("rejects future timestamps", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      // First create an alive rule, then try to delete it with a future ts.
      await runM5Share({
        projectRoot: root,
        text: "PR 后必须 fetch codex review",
        ruleId: "to-delete",
        scope: "team",
        author: "alice",
      });
      await expect(
        runM5Delete({
          projectRoot: root,
          ruleId: "to-delete",
          deletedBy: "bob",
          now: "9999-12-31T23:59:59.999Z",
        }),
      ).rejects.toBeInstanceOf(M5DeleteValidationError);
    } finally {
      await cleanup();
    }
  });
});

describe("m5-sync corrupt-file diagnostics (B-129)", () => {
  it("surfaces corrupt JSON files in skipped_files instead of silent drop", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      const teamDir = path.join(root, ".teamagent", "team", "tester");
      await fs.mkdir(teamDir, { recursive: true });
      await fs.writeFile(path.join(teamDir, "corrupt.json"), "this is not valid json");
      const result = await runM5Sync({ projectRoot: root });
      expect(result.skipped_files).toBeDefined();
      expect(result.skipped_files!.length).toBe(1);
      expect(result.skipped_files![0]!.path).toContain("corrupt.json");
      expect(result.skipped_files![0]!.reason).toMatch(/JSON|parse/i);
    } finally {
      await cleanup();
    }
  });

  it("strips ANSI escape sequences from rendered summary (B-130)", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      // ANSI clear-screen + cursor-home injected as content
      const ansiContent = "\x1b[2J\x1b[Hwiped your terminal\x1b[?25l";
      await runM5Share({
        projectRoot: root,
        text: ansiContent,
        ruleId: "ansi-bomb",
        scope: "team",
        author: "tester",
      });
      const result = await runM5Sync({ projectRoot: root });
      const ansiRule = result.merged.find((m) => m.rule_id === "ansi-bomb");
      expect(ansiRule).toBeDefined();
      // Summary must not contain raw ESC byte (0x1b) — sanitized.
      expect(ansiRule!.summary).not.toMatch(/\x1b/);
    } finally {
      await cleanup();
    }
  });
});

describe("FsTeamRuleStore future-timestamp drop (B-140)", () => {
  it("listAll skips claims whose effective ts is >60s in the future", async () => {
    const { root, cleanup } = await mkRepo();
    try {
      const dir = path.join(root, ".teamagent", "team", "evil");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, "future-rule.json"),
        JSON.stringify({
          rule_id: "future-rule",
          author: "evil",
          current: {
            content: "from the future",
            scope: "team",
            confidence: 0.9,
            deleted: false,
            modified_by: "evil",
            modified_ts: "9999-12-31T23:59:59.999Z",
          },
        }),
      );
      const skipped: Array<{ path: string; reason: string }> = [];
      const store = new FsTeamRuleStore();
      const all = await store.listAll(root, { onSkip: (e) => skipped.push(e) });
      expect(all.length).toBe(0);
      expect(skipped.length).toBe(1);
      expect(skipped[0]!.reason).toMatch(/future/i);
    } finally {
      await cleanup();
    }
  });
});
