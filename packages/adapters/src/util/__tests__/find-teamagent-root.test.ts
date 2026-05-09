/**
 * Sanity test for adapters' copy of findTeamagentRoot (issue #161).
 *
 * The cli package has the canonical helper at packages/cli/src/find-teamagent-root.ts
 * with full coverage; adapters cannot import it (cli depends on adapters, not
 * the other way around), so we keep a synced copy in adapters/util/. This test
 * locks the contract on the copy.
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

function createDb(dir: string): void {
  const td = path.join(dir, ".teamagent");
  fs.mkdirSync(td, { recursive: true });
  fs.writeFileSync(path.join(td, "knowledge.db"), "");
}

describe("adapters findTeamagentRoot", () => {
  it("returns parent when cwd is subfolder and parent has knowledge.db", () => {
    const root = makeTmpDir();
    createDb(root);
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
});
