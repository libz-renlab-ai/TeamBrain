/**
 * Tests for findTeamagentRoot wrapper (cli/src/find-teamagent-root.ts).
 *
 * The wrapper delegates to `lib/walk-up.ts#findTeamagentRoot` (hardened) and
 * supplies a `?? cwd` fallback so callers that need a `string` keep working.
 *
 * Hardened helper requires BOTH:
 *   (a) `<dir>/.teamagent/knowledge.db` is a regular file
 *   (b) `<dir>` has a project marker (.git, package.json, etc.)
 * It also caps the walk at `~` and rejects symlinks. These properties are
 * regression-tested below to make sure the wrapper does not silently drop them.
 *
 * Issue #161 — subfolder cwd can't load teamagent: hook entrypoints previously
 * did `path.join(cwd, ".teamagent", "knowledge.db")` without ancestor walk-up.
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

/** Create `.teamagent/knowledge.db` (empty file) AND a project marker under `dir`. */
function createProject(dir: string): void {
  const dbDir = path.join(dir, ".teamagent");
  fs.mkdirSync(dbDir, { recursive: true });
  fs.writeFileSync(path.join(dbDir, "knowledge.db"), "");
  // hardened walk-up requires a project marker alongside the DB
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
}

describe("findTeamagentRoot wrapper", () => {
  it("returns cwd when cwd itself has .teamagent/knowledge.db + project marker", () => {
    const root = makeTmpDir();
    createProject(root);
    expect(path.resolve(findTeamagentRoot(root))).toBe(path.resolve(root));
  });

  it("returns parent when cwd is a subdirectory and parent is a project", () => {
    const root = makeTmpDir();
    createProject(root);
    const sub = path.join(root, "sub");
    fs.mkdirSync(sub, { recursive: true });
    expect(path.resolve(findTeamagentRoot(sub))).toBe(path.resolve(root));
  });

  it("returns grandparent when cwd is two levels deep and grandparent is a project", () => {
    const root = makeTmpDir();
    createProject(root);
    const grandchild = path.join(root, "sub", "deep");
    fs.mkdirSync(grandchild, { recursive: true });
    expect(path.resolve(findTeamagentRoot(grandchild))).toBe(path.resolve(root));
  });

  it("returns cwd unchanged when no ancestor has the DB", () => {
    const root = makeTmpDir();
    const sub = path.join(root, "no-teamagent", "sub");
    fs.mkdirSync(sub, { recursive: true });
    expect(path.resolve(findTeamagentRoot(sub))).toBe(path.resolve(sub));
  });

  it("terminates at filesystem root and returns cwd (no infinite loop)", () => {
    const root = makeTmpDir();
    const deep = path.join(root, "a", "b", "c", "d");
    fs.mkdirSync(deep, { recursive: true });
    expect(path.resolve(findTeamagentRoot(deep))).toBe(path.resolve(deep));
  });

  it("normalizes paths (trailing separator)", () => {
    const root = makeTmpDir();
    createProject(root);
    expect(path.resolve(findTeamagentRoot(root + path.sep))).toBe(path.resolve(root));
  });

  it("returns nearest ancestor when both grandparent and parent are projects", () => {
    const root = makeTmpDir();
    createProject(root); // grandparent is a project
    const mid = path.join(root, "mid");
    fs.mkdirSync(mid, { recursive: true });
    createProject(mid); // mid is also a project
    const sub = path.join(mid, "sub");
    fs.mkdirSync(sub, { recursive: true });
    expect(path.resolve(findTeamagentRoot(sub))).toBe(path.resolve(mid));
  });

  // ─── Hardening regression tests ─────────────────────────────────────────────
  // These lock in the security guards of `lib/walk-up.ts` so the wrapper can't
  // silently regress to a basic walk-up that would honour attacker-planted DBs.

  it("rejects bare knowledge.db without a project marker (hostile-ancestor defense)", () => {
    const root = makeTmpDir();
    const td = path.join(root, ".teamagent");
    fs.mkdirSync(td, { recursive: true });
    fs.writeFileSync(path.join(td, "knowledge.db"), "");
    // NO package.json / .git — bare DB only
    const sub = path.join(root, "sub");
    fs.mkdirSync(sub, { recursive: true });
    // Hardened walk-up rejects → wrapper falls back to cwd
    expect(path.resolve(findTeamagentRoot(sub))).toBe(path.resolve(sub));
  });

  it("rejects a symlink at <dir>/.teamagent/knowledge.db (lstat hardening)", () => {
    const root = makeTmpDir();
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    const td = path.join(root, ".teamagent");
    fs.mkdirSync(td, { recursive: true });
    // Plant a real DB elsewhere then symlink it into the candidate path
    const decoy = makeTmpDir();
    fs.writeFileSync(path.join(decoy, "real.db"), "");
    fs.symlinkSync(path.join(decoy, "real.db"), path.join(td, "knowledge.db"));
    const sub = path.join(root, "sub");
    fs.mkdirSync(sub, { recursive: true });
    // lstat returns the symlink itself (not isFile()); walk-up keeps going
    expect(path.resolve(findTeamagentRoot(sub))).toBe(path.resolve(sub));
  });
});
