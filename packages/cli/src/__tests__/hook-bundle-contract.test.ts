import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contract test for the hook bundle config (issue #131).
 *
 * Hook bins (bin-session-start.cjs etc) are staged by `teamagent install-user-hook`
 * to ~/.teamagent/hooks/, which sits outside any node_modules tree. Any pure-JS
 * dependency that the bundle leaves as an external `require()` call will fail
 * with MODULE_NOT_FOUND when the staged bin is fired by Claude Code.
 *
 * Native .node addons (sharp, onnxruntime-node, sqlite-vec, web-tree-sitter)
 * cannot be inlined and must remain external — those are a separate concern
 * (they need to be reachable via npm install path resolution, not bundling).
 *
 * This test locks in the noExternal list so that future config edits can't
 * silently regress hook startup on dev machines.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK_CONFIG = path.resolve(HERE, "..", "..", "tsup.hook.config.ts");

const REQUIRED_NO_EXTERNAL = [
  // Pure-JS deps that the staged bin would otherwise fail to resolve.
  // Add to this list whenever a new pure-JS dep is introduced into the hook
  // call graph; do NOT add native .node addons here.
  "js-tiktoken",
];

/**
 * Source-level invariant for the regression fixed 2026-05-09: the staged
 * ~/.teamagent/hooks/bin-session-start.cjs (built by packages/teamagent/tsup.config.ts
 * with web-tree-sitter listed in NATIVE_EXTERNAL) crashed at load time with
 * MODULE_NOT_FOUND because ast-context.ts had a top-level static value import of
 * web-tree-sitter, which esbuild left as a top-level `var X = require(...)` in the
 * bundle. SessionStart never invokes the matcher; the require fired anyway.
 *
 * Lock the fix at the source: the only mention of web-tree-sitter in
 * ast-context.ts may be `import type` (erased at compile time). Runtime access
 * must go through `await import(...)` inside the lazy initAstMatcher path, where
 * a try/catch can degrade to "no AST parser → don't filter" when the module is
 * not resolvable from a staged bundle location.
 */
const AST_CONTEXT = path.resolve(
  HERE, "..", "..", "..", "core", "src", "matcher", "legacy", "ast-context.ts",
);

describe("packages/core ast-context source contract (web-tree-sitter must be lazy)", () => {
  it("uses only `import type` for every static import of web-tree-sitter", () => {
    const rawSrc = fs.readFileSync(AST_CONTEXT, "utf-8");
    const rel = path.relative(process.cwd(), AST_CONTEXT);

    // Strip comments before scanning — otherwise documentation that mentions
    // the buggy pattern (e.g. "old code: `import { Parser } from \"web-tree-sitter\"`")
    // would be mistaken for a real static value import. We only care about
    // executable code.
    const src = rawSrc
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

    // Walk every `from "web-tree-sitter"` occurrence that belongs to a static
    // import (i.e. NOT a dynamic `import("web-tree-sitter")` expression). For
    // each, find the nearest preceding `import` keyword and verify the slice
    // between them starts with `type` — that's the only erased-at-compile-time
    // shape, the one that does not leak as a runtime `require(...)`.
    const fromRe = /from\s+["']web-tree-sitter["']/g;
    const offenders: string[] = [];
    let staticImportCount = 0;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(src)) !== null) {
      const fromIdx = m.index;
      const before = src.slice(0, fromIdx);
      // Skip dynamic-import sites: a dynamic import looks like
      // `import("web-tree-sitter")` and has no preceding `import` keyword
      // followed by named bindings on this same import statement.
      const lastImportIdx = before.lastIndexOf("import");
      if (lastImportIdx < 0) continue;
      // Reject dynamic-import expressions: `import(` immediately at the
      // matched index means a `from` token shouldn't appear, but be defensive.
      const afterImport = before.slice(lastImportIdx + "import".length);
      // If the segment between the `import` keyword and the `from` contains a
      // closing `)` from a dynamic import, treat as not a static import.
      if (/^\s*\(/.test(afterImport)) continue;
      staticImportCount++;
      const between = afterImport.replace(/^\s+/, "");
      if (!/^type\b/.test(between)) {
        offenders.push(`import${afterImport}from "web-tree-sitter"`);
      }
    }

    expect(
      staticImportCount,
      `${rel} should have at least one \`import type ... from "web-tree-sitter"\` to keep ` +
        `the Parser/Language types available at compile time`,
    ).toBeGreaterThanOrEqual(1);

    expect(
      offenders,
      `${rel} contains static value import(s) of web-tree-sitter:\n` +
        offenders.map((o) => `  - ${o.slice(0, 120)}…`).join("\n") +
        `\n\nMust use \`import type ... from "web-tree-sitter"\` and load the runtime via ` +
        `\`await import("web-tree-sitter")\` inside initAstMatcher(). A top-level static value ` +
        `import leaks as a top-level \`require("web-tree-sitter")\` in the published hook bundle, ` +
        `breaking SessionStart on machines where the staged bin lives outside node_modules ` +
        `(regression 2026-05-09).`,
    ).toEqual([]);
  });

  it("has at least one dynamic import of web-tree-sitter", () => {
    const src = fs.readFileSync(AST_CONTEXT, "utf-8");
    // Allow both `await import("web-tree-sitter")` and `import("web-tree-sitter")`.
    const dynImport = /\bimport\s*\(\s*["']web-tree-sitter["']\s*\)/;
    expect(
      dynImport.test(src),
      `${path.relative(process.cwd(), AST_CONTEXT)} must load web-tree-sitter via dynamic import ` +
        `(\`await import("web-tree-sitter")\`) inside initAstMatcher() — pure type imports alone ` +
        `would mean no runtime path to load the parser at all.`,
    ).toBe(true);
  });
});

describe("packages/cli hook bundle config", () => {
  it("declares every pure-JS hook dependency in noExternal", () => {
    const source = fs.readFileSync(HOOK_CONFIG, "utf-8");

    // Capture the noExternal: [...] block. Multi-line, so scan from the
    // literal `noExternal:` to the closing `]` on its own line.
    const match = source.match(/noExternal:\s*\[([\s\S]*?)\]/);
    const block = match?.[1];
    expect(block, "noExternal block not found in tsup.hook.config.ts").toBeTruthy();

    for (const dep of REQUIRED_NO_EXTERNAL) {
      expect(
        block!.includes(`"${dep}"`),
        `tsup.hook.config.ts noExternal must include "${dep}" — otherwise the staged ` +
          `~/.teamagent/hooks/bin-*.cjs will hit MODULE_NOT_FOUND on hook fire (issue #131)`,
      ).toBe(true);
    }
  });

  it("does not list pure-JS deps in external (which would re-break the staged bin)", () => {
    const source = fs.readFileSync(HOOK_CONFIG, "utf-8");
    const match = source.match(/external:\s*\[([\s\S]*?)\]/);
    const block = match?.[1];
    expect(block, "external block not found in tsup.hook.config.ts").toBeTruthy();
    for (const dep of REQUIRED_NO_EXTERNAL) {
      expect(
        block!.includes(`"${dep}"`),
        `tsup.hook.config.ts external must NOT include "${dep}" — pure-JS deps belong in noExternal`,
      ).toBe(false);
    }
  });

  it.skipIf(!fs.existsSync(path.resolve(HERE, "..", "..", "dist", "bin-session-start.cjs")))(
    "built bin-session-start.cjs has no external require() for pure-JS deps",
    () => {
      const distDir = path.resolve(HERE, "..", "..", "dist");
      const bins = fs
        .readdirSync(distDir)
        .filter((f) => f.startsWith("bin-") && f.endsWith(".cjs"));
      expect(bins.length).toBeGreaterThan(0);

      for (const bin of bins) {
        const text = fs.readFileSync(path.join(distDir, bin), "utf-8");
        for (const dep of REQUIRED_NO_EXTERNAL) {
          // Match `require("dep")` or `require('dep')` anywhere in the bundle.
          const re = new RegExp(`require\\(["']${dep.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}["']\\)`);
          expect(
            re.test(text),
            `dist/${bin} contains external require("${dep}") — should be inlined per noExternal config (issue #131)`,
          ).toBe(false);
        }
      }
    },
  );

  /**
   * Native externals (web-tree-sitter etc) are intentionally kept external in
   * packages/teamagent/tsup.config.ts (NATIVE_EXTERNAL) — we cannot inline a
   * WASM-loading runtime safely. But that means any `import` of one of those
   * modules at TS source top-level is still going to leak as a top-level
   * `var X = require("…")` in the staged hook bundle, and the staged bin
   * lives at ~/.teamagent/hooks/ outside any node_modules tree → MODULE_NOT_FOUND
   * on first SessionStart load (regression observed 2026-05-09).
   *
   * Contract: any native external must be lazy-required (via dynamic import,
   * which esbuild lowers to `Promise.resolve().then(() => require("…"))`),
   * so the hook's startup path never fires the require unless the consumer
   * actually invokes the matcher. This test pins that invariant for
   * web-tree-sitter — the one that has bitten us — and is the right place
   * to extend whenever a new native external joins NATIVE_EXTERNAL.
   */
  /**
   * Issue #280: module names that MUST never appear as a top-level eager
   * `var <ident> = require("<name>")` line in any hook bundle. The
   * tree-sitter language packs share `web-tree-sitter`'s WASM-load
   * pattern. `@xenova/transformers` and `onnxruntime-node` are added by
   * issue #280 — they were not statically imported at the time of issue
   * #131's original fix, but are large optional natives that any future
   * caller might inadvertently top-level-import; locking them down now
   * costs nothing and prevents the issue #280 failure mode from creeping
   * back in via a different transitive entry.
   *
   * Add to this list when a new native external joins NATIVE_EXTERNAL in
   * `packages/teamagent/tsup.config.ts` and could plausibly be statically
   * imported from a hot bundle path.
   */
  const LAZY_REQUIRED_NATIVES = [
    "web-tree-sitter",
    "tree-sitter-typescript",
    "tree-sitter-python",
    "onnxruntime-node",
  ];

  /**
   * Issue #280: built dist locations to scan. Both the cli-local dist
   * (`packages/cli/dist/`) and the teamagent dist (`packages/teamagent/dist/`,
   * the one whose contents postinstall copies to `~/.teamagent/hooks/`)
   * must obey the lazy-require contract. The teamagent dist was the
   * actual surface area of issue #280 — the cli dist was already
   * covered by issue #131 but had no analog for the staged bundle.
   */
  const DIST_DIRS = [
    {
      label: "packages/cli/dist",
      dir: path.resolve(HERE, "..", "..", "dist"),
    },
    {
      label: "packages/teamagent/dist",
      dir: path.resolve(HERE, "..", "..", "..", "teamagent", "dist"),
    },
  ];

  for (const { label, dir } of DIST_DIRS) {
    it.skipIf(!fs.existsSync(path.join(dir, "bin-session-start.cjs")))(
      `${label} hook bundles have no TOP-LEVEL require() for native externals (must be lazy)`,
      () => {
        const bins = fs
          .readdirSync(dir)
          .filter((f) => f.startsWith("bin-") && f.endsWith(".cjs"));
        expect(bins.length).toBeGreaterThan(0);

        for (const bin of bins) {
          const text = fs.readFileSync(path.join(dir, bin), "utf-8");
          for (const dep of LAZY_REQUIRED_NATIVES) {
            // Top-level eager form esbuild emits for static `import x from "dep"`
            // when "dep" is in `external`: a `var <ident> = require("dep")` at
            // the start of a line (multiline mode `m`). The dynamic-import
            // shape — `Promise.resolve().then(() => __toESM(require("dep")))` —
            // is fine because the require fires only when the .then callback
            // runs, i.e. when the consumer actually invokes the matcher.
            const escaped = dep.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&");
            const topLevel = new RegExp(
              `^var\\s+[A-Za-z_$][A-Za-z0-9_$]*\\s*=\\s*require\\(["']${escaped}["']\\)`,
              "m",
            );
            expect(
              topLevel.test(text),
              `${label}/${bin} contains top-level require("${dep}") — must be lazy via dynamic import to keep ` +
                `~/.teamagent/hooks/${bin} loadable outside node_modules. Convert the offending ` +
                `static import in packages/core/src/matcher/legacy/ast-context.ts (or its caller) to ` +
                `\`await import("${dep}")\` inside the function that actually needs it.`,
            ).toBe(false);
          }
        }
      },
    );
  }
});
