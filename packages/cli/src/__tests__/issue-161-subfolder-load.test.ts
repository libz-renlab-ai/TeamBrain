/**
 * Regression test for issue #161 — subfolder cwd can't load teamagent.
 *
 * Verifies that when a user runs Claude Code from a subdirectory,
 * the walk-up resolution correctly finds the parent's .teamagent/knowledge.db
 * instead of looking for a non-existent one in the subdirectory.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { findTeamagentRoot } from "../find-teamagent-root.js";

const tmpdirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-161-test-"));
  tmpdirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpdirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
});

describe("issue #161 subfolder walk-up regression", () => {
  it("resolves db path to parent .teamagent when cwd is a subfolder", () => {
    const tmpRoot = makeTmpDir();

    // Set up: dir/.teamagent/knowledge.db exists AND dir has a project marker
    // (hardened walk-up requires both)
    const dir = path.join(tmpRoot, "dir");
    const teamagentDir = path.join(dir, ".teamagent");
    fs.mkdirSync(teamagentDir, { recursive: true });
    fs.writeFileSync(path.join(teamagentDir, "knowledge.db"), ""); // empty file
    fs.writeFileSync(path.join(dir, "package.json"), "{}");

    // Set up: dir/sub/ is the user's actual cwd (subfolder of the project root)
    const sub = path.join(dir, "sub");
    fs.mkdirSync(sub, { recursive: true });

    // Simulate what a hook would do: find project root from cwd = dir/sub
    const resolvedRoot = findTeamagentRoot(sub);

    // The resolved db path should point to dir/.teamagent/knowledge.db,
    // NOT dir/sub/.teamagent/knowledge.db
    const resolvedDbPath = path.join(resolvedRoot, ".teamagent", "knowledge.db");
    const subDbPath = path.join(sub, ".teamagent", "knowledge.db");

    expect(path.resolve(resolvedDbPath)).toBe(path.resolve(path.join(dir, ".teamagent", "knowledge.db")));
    expect(path.resolve(resolvedDbPath)).not.toBe(path.resolve(subDbPath));
  });
});
