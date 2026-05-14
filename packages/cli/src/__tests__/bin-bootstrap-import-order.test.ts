import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Issue #477 regression lock. `lib/hook-bootstrap.ts` arms the
 * `process.on("uncaughtException")` guard for the `node:sqlite` load failure
 * at its own module-load time. For the guard to be installed BEFORE
 * `@teamagent/adapters` → `schema.ts` runs its top-level `require("node:sqlite")`,
 * the `hook-bootstrap` import must be evaluated first — ESM evaluates imports
 * depth-first in source order, so it must be the **first value import** in
 * every sqlite-bundling bin entry.
 *
 * This is a source-level invariant test. It can't prove esbuild/tsup preserves
 * the order in the emitted bundle (that was verified by hand on the built
 * `bin-post-tool-use.cjs`), but it catches the far more likely regression:
 * someone reorders the imports, or adds a new sqlite-pulling import above the
 * bootstrap line.
 *
 * `bin-digital-twin-tap.ts` is intentionally excluded — it imports only
 * `@teamagent/digital-twin`, which never loads `node:sqlite`.
 */

const SRC_DIR = path.resolve(fileURLToPath(import.meta.url), "../..");

const SQLITE_BUNDLING_BINS = [
  "bin-pre-tool-use.ts",
  "bin-post-tool-use.ts",
  "bin-user-prompt-submit.ts",
  "bin-session-start.ts",
  "bin-stop.ts",
  "bin-session-end.ts",
  "bin-pre-compact.ts",
  "bin-updater.ts",
  "bin-embedder.ts",
];

const BOOTSTRAP_IMPORT = 'from "./lib/hook-bootstrap.js"';

/** A value import is `import ... from "..."` that is NOT `import type ...`. */
function isValueImport(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("import ") && !t.startsWith("import type ") && t.includes(" from ");
}

describe("#477: hook-bootstrap import order in bin entries", () => {
  for (const binFile of SQLITE_BUNDLING_BINS) {
    it(`${binFile} imports armHookBootstrap as its first value import`, () => {
      const src = fs.readFileSync(path.join(SRC_DIR, binFile), "utf-8");
      const lines = src.split("\n");

      const bootstrapIdx = lines.findIndex(
        (l) => isValueImport(l) && l.includes(BOOTSTRAP_IMPORT),
      );
      expect(
        bootstrapIdx,
        `${binFile} must import from ./lib/hook-bootstrap.js`,
      ).toBeGreaterThanOrEqual(0);

      const firstValueImportIdx = lines.findIndex(isValueImport);
      // The bootstrap import must BE the first value import — nothing that
      // could transitively load node:sqlite may be evaluated before it.
      expect(
        bootstrapIdx,
        `${binFile}: hook-bootstrap import (line ${bootstrapIdx + 1}) must be the ` +
          `first value import (currently line ${firstValueImportIdx + 1})`,
      ).toBe(firstValueImportIdx);
    });
  }

  it("calls armHookBootstrap() so the import is referenced (not tree-shakeable)", () => {
    for (const binFile of SQLITE_BUNDLING_BINS) {
      const src = fs.readFileSync(path.join(SRC_DIR, binFile), "utf-8");
      expect(src, `${binFile} must call armHookBootstrap()`).toContain(
        "armHookBootstrap();",
      );
    }
  });
});
