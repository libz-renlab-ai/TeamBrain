/**
 * Sanity test for adapters' wrapper around findTeamagentRoot (issue #161).
 *
 * The wrapper delegates to the hardened helper in `../walk-up.ts` (mirror of
 * `@teamagent/cli/src/lib/walk-up.ts`) and supplies a `?? cwd` fallback so
 * callers see a `string` instead of `string | null`.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { findTeamagentRoot } from "../find-teamagent-root.js";

const tmpdirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ta-adapters-root-"));
  tmpdirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpdirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

function createProject(dir: string): void {
  const td = path.join(dir, ".teamagent");
  fs.mkdirSync(td, { recursive: true });
  fs.writeFileSync(path.join(td, "knowledge.db"), "");
  // project marker — hardened helper requires one alongside the DB
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
}

describe("adapters findTeamagentRoot wrapper", () => {
  it("returns parent when cwd is subfolder and parent has knowledge.db + project marker", () => {
    const root = makeTmpDir();
    createProject(root);
    const sub = path.join(root, "packages", "deep");
    fs.mkdirSync(sub, { recursive: true });
    expect(path.resolve(findTeamagentRoot(sub))).toBe(path.resolve(root));
  });

  it("returns cwd unchanged when no ancestor has knowledge.db", () => {
    const root = makeTmpDir();
    const sub = path.join(root, "no-db");
    fs.mkdirSync(sub, { recursive: true });
    expect(path.resolve(findTeamagentRoot(sub))).toBe(path.resolve(sub));
  });

  it("rejects bare knowledge.db without a project marker (hostile-ancestor defense)", () => {
    // attacker plants knowledge.db in a directory that is NOT a project
    const root = makeTmpDir();
    const td = path.join(root, ".teamagent");
    fs.mkdirSync(td, { recursive: true });
    fs.writeFileSync(path.join(td, "knowledge.db"), "");
    // NO package.json / .git — bare DB only
    const sub = path.join(root, "sub");
    fs.mkdirSync(sub, { recursive: true });
    // Hardened helper rejects the parent; wrapper falls back to cwd
    expect(path.resolve(findTeamagentRoot(sub))).toBe(path.resolve(sub));
  });
});
