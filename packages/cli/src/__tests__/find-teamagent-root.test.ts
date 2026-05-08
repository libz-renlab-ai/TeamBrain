/**
 * Unit tests for findTeamagentRoot walk-up helper.
 *
 * Issue #161 — subfolder cwd can't load teamagent:
 * all hook entrypoints previously did `path.join(cwd, ".teamagent", "knowledge.db")`
 * without ancestor walk-up. These tests verify the fix before implementation.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { findTeamagentRoot } from "../find-teamagent-root.js";

const tmpdirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-root-test-"));
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

/**
 * Create an empty `.teamagent/knowledge.db` under `dir`.
 * The function only does `existsSync`, so an empty file is fine.
 */
function createDb(dir: string): void {
  const dbDir = path.join(dir, ".teamagent");
  fs.mkdirSync(dbDir, { recursive: true });
  fs.writeFileSync(path.join(dbDir, "knowledge.db"), "");
}

describe("findTeamagentRoot", () => {
  it("returns cwd when cwd itself has .teamagent/knowledge.db", () => {
    const root = makeTmpDir();
    createDb(root);
    const result = findTeamagentRoot(root);
    expect(path.resolve(result)).toBe(path.resolve(root));
  });

  it("returns parent when cwd is a subdirectory and parent has db", () => {
    const root = makeTmpDir();
    createDb(root);
    const sub = path.join(root, "sub");
    fs.mkdirSync(sub, { recursive: true });

    const result = findTeamagentRoot(sub);
    expect(path.resolve(result)).toBe(path.resolve(root));
  });

  it("returns grandparent when cwd is two levels deep and grandparent has db", () => {
    const root = makeTmpDir();
    createDb(root);
    const grandchild = path.join(root, "sub", "deep");
    fs.mkdirSync(grandchild, { recursive: true });

    const result = findTeamagentRoot(grandchild);
    expect(path.resolve(result)).toBe(path.resolve(root));
  });

  it("returns cwd unchanged when no ancestor has db", () => {
    const root = makeTmpDir();
    const sub = path.join(root, "no-teamagent", "sub");
    fs.mkdirSync(sub, { recursive: true });
    // No db created anywhere

    const result = findTeamagentRoot(sub);
    expect(path.resolve(result)).toBe(path.resolve(sub));
  });

  it("stops at filesystem root and returns cwd (no infinite loop)", () => {
    // Use a directory near the FS root but that doesn't have a .teamagent dir.
    // We can't easily create a dir AT the fs root in tests, but we can verify
    // the function terminates for a normal path with no db.
    const root = makeTmpDir();
    const deep = path.join(root, "a", "b", "c", "d");
    fs.mkdirSync(deep, { recursive: true });

    // Should terminate and return the input cwd, not infinite loop
    const result = findTeamagentRoot(deep);
    expect(path.resolve(result)).toBe(path.resolve(deep));
  });

  it("normalizes paths via path.resolve on both sides", () => {
    const root = makeTmpDir();
    createDb(root);
    // Pass in a path with a trailing separator — resolve should still work
    const result = findTeamagentRoot(root + path.sep);
    expect(path.resolve(result)).toBe(path.resolve(root));
  });

  it("finds nearest ancestor, not farthest — stops at first match walking up", () => {
    // grandparent has db AND child has db → should return child (nearest)
    const root = makeTmpDir();
    createDb(root); // grandparent has db
    const mid = path.join(root, "mid");
    fs.mkdirSync(mid, { recursive: true });
    createDb(mid); // mid also has db
    const sub = path.join(mid, "sub");
    fs.mkdirSync(sub, { recursive: true });

    const result = findTeamagentRoot(sub);
    // Should return mid (nearest ancestor with db), not root
    expect(path.resolve(result)).toBe(path.resolve(mid));
  });
});
