import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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

/**
 * #477 P3, end-to-end: this is the real judge harness — it runs the actual
 * BUILT bundle with a preload shim that forces `require("node:sqlite")` to
 * throw `ERR_UNKNOWN_BUILTIN_MODULE`, and asserts the guard catches it
 * (fallback line on stderr, exit 0) instead of leaking a raw stack.
 *
 * Source-level reasoning (the suite above) can't prove esbuild/tsup preserved
 * the import order in the emitted bundle — only running the bundle can. This
 * block is skipped when `dist/` isn't built (fresh checkout / CI test job that
 * doesn't run `pnpm build:hook` first); run `pnpm -F @teamagent/cli build:hook`
 * locally to exercise it.
 */
const DIST_DIR = path.resolve(SRC_DIR, "../dist");
const BUILT_BINS = SQLITE_BUNDLING_BINS.map((f) => f.replace(/\.ts$/, ".cjs"));
const distBuilt =
  fs.existsSync(DIST_DIR) &&
  BUILT_BINS.every((b) => fs.existsSync(path.join(DIST_DIR, b)));

const describeIfBuilt = distBuilt ? describe : describe.skip;

describeIfBuilt("#477 P3: built bundles catch the node:sqlite load failure", () => {
  // Preload shim: makes require("node:sqlite") throw the way a flag-less
  // Node 22.5–23.3 runtime does.
  const shimPath = path.join(os.tmpdir(), `teamagent-477-shim-${process.pid}.cjs`);
  const shimSrc =
    'const Module = require("module");\n' +
    "const orig = Module._load;\n" +
    "Module._load = function (request) {\n" +
    '  if (request === "node:sqlite") {\n' +
    '    const e = new Error("No such built-in module: node:sqlite");\n' +
    '    e.code = "ERR_UNKNOWN_BUILTIN_MODULE";\n' +
    "    throw e;\n" +
    "  }\n" +
    "  return orig.apply(this, arguments);\n" +
    "};\n";

  // The spawned bundle must run as a real production hook would — NOT under
  // the test runner. `arm()` deliberately no-ops when `process.env.VITEST` is
  // set (so importing a bin from its own suite doesn't hijack the worker's
  // crash reporting), so strip VITEST from the child env or the guard would
  // suppress itself and this test would never exercise the real path.
  const prodEnv = { ...process.env };
  delete prodEnv.VITEST;

  for (const built of BUILT_BINS) {
    it(`${built} prints the fallback line, not a raw stack, on a sqlite-less Node`, () => {
      fs.writeFileSync(shimPath, shimSrc, "utf-8");
      try {
        const r = spawnSync(
          process.execPath,
          ["--require", shimPath, path.join(DIST_DIR, built)],
          {
            encoding: "utf-8",
            input: "{}",
            timeout: 20_000,
            windowsHide: true,
            env: prodEnv,
          },
        );
        const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
        expect(out, `${built} must surface the actionable one-liner`).toContain(
          "node:sqlite unavailable on this Node runtime",
        );
        // The whole point of P3: NOT a raw V8 stack dump.
        expect(out, `${built} must NOT leak a raw stack`).not.toMatch(
          /\n\s+at\s+\S+/,
        );
        // Guard exits 0 so the hook fails open (never blocks Claude Code).
        expect(r.status, `${built} must exit 0 (fail open)`).toBe(0);
      } finally {
        try { fs.unlinkSync(shimPath); } catch { /* ignore */ }
      }
    });
  }
});
