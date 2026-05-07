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
});
