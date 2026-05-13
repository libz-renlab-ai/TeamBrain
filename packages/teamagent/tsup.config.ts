import { defineConfig } from "tsup";
import fs from "node:fs";
import path from "node:path";

// Issue #299: exported so packages/cli tests can assert parity with
// install-hook.ts's ALL_CHANNELS install table. Every user-installable
// bundleFilename declared in that table MUST appear as a key here,
// otherwise the released dist silently drops the corresponding hook.
export const ENTRIES = {
  bin:                      "../cli/src/bin.ts",
  "bin-pre-tool-use":       "../cli/src/bin-pre-tool-use.ts",
  "bin-post-tool-use":      "../cli/src/bin-post-tool-use.ts",
  "bin-stop":               "../cli/src/bin-stop.ts",
  "bin-session-end":        "../cli/src/bin-session-end.ts",
  "bin-session-start":      "../cli/src/bin-session-start.ts",
  "bin-pre-compact":        "../cli/src/bin-pre-compact.ts",
  "bin-user-prompt-submit": "../cli/src/bin-user-prompt-submit.ts",
  "bin-updater":            "../cli/src/bin-updater.ts",
  // Issue #299: the user-level Stop tap (digital-twin) was declared in
  // install-hook.ts's ALL_CHANNELS install table but never built into dist/,
  // so applyChannelOps silently skipped it after every install. Adding it
  // here + to the cjs block below + noExternal-ing @teamagent/digital-twin
  // makes the bundle land alongside the other bin-*.cjs files.
  "bin-digital-twin-tap":   "../cli/src/bin-digital-twin-tap.ts",
  // Issue #368 (v0.11.1) — the uploader daemon spawned by bin-digital-twin-tap
  // must ship inside the published tarball. Previously the release workflow
  // only built `teamagent`, so packages/digital-twin/dist/bin-uploader.cjs
  // never made it into the tarball; `stageDaemonBinaryToUser` then no-op'd
  // (source missing) and `resolveDaemonBin`'s monorepo fallback path didn't
  // exist on a real install. Result: zero uploads on every curl-installed
  // machine, no error. Bundling here + noExternal-ing 'ulid' below ships a
  // self-contained `dist/bin-uploader.cjs` alongside the other staged bins.
  "bin-uploader":           "../digital-twin/src/bin-uploader.ts",
};

const NATIVE_EXTERNAL = [
  "sharp",
  "onnxruntime-node",
  "jsdom",
  "sqlite-vec",
  "better-sqlite3",
  "web-tree-sitter",
  "tree-sitter-typescript",
  "tree-sitter-python",
  // Externalize so the startup bundle does not hard-require these heavy/native
  // optional deps. Their consumers should import lazily where still needed.
  "@xenova/transformers",
  // ulid uses CJS `require("crypto")` to lazy-load Node crypto. When bundled
  // into our ESM entry, tsup's `__require` shim throws "Dynamic require not
  // supported" → ulid falls through to `throw "secure crypto unusable"` at
  // module-load → bin.js dies before parsing argv. Externalize so Node loads
  // ulid natively (its UMD entry uses real `require`, which works in CJS
  // module context). Requires `ulid` to be a sibling-installed dependency.
  "ulid",
];

export default defineConfig([
  {
    entry: { bin: ENTRIES.bin },
    format: ["esm"],
    platform: "node",
    target: "node22",
    outDir: "dist",
    bundle: true,
    splitting: true,
    noExternal: [
      "@teamagent/types",
      "@teamagent/ports",
      "@teamagent/core",
      "@teamagent/adapters",
      "@teamagent/cli",
      "zod",
    ],
    external: NATIVE_EXTERNAL,
    shims: true,
    // src/bin.ts already has #!/usr/bin/env node; do not add a second banner.
    async onSuccess() {
      // Copy seed/rules.jsonl → dist/seed/rules.jsonl so installed tarball
      // ships the bundled knowledge pack. init.ts resolveSeedPath() looks
      // for it at <pkg>/dist/seed/rules.jsonl in bundled mode.
      const srcSeed = path.resolve(__dirname, "seed", "rules.jsonl");
      if (fs.existsSync(srcSeed)) {
        const dstSeedDir = path.resolve(__dirname, "dist", "seed");
        fs.mkdirSync(dstSeedDir, { recursive: true });
        fs.copyFileSync(srcSeed, path.join(dstSeedDir, "rules.jsonl"));
      }
      // Issue #88: also ship every seed/packs/*.jsonl. doLoadSeed() picks them
      // up by scanning the `packs/` directory next to the resolved seed path.
      const srcPacksDir = path.resolve(__dirname, "seed", "packs");
      if (fs.existsSync(srcPacksDir)) {
        const dstPacksDir = path.resolve(__dirname, "dist", "seed", "packs");
        fs.mkdirSync(dstPacksDir, { recursive: true });
        for (const file of fs.readdirSync(srcPacksDir)) {
          if (!file.endsWith(".jsonl")) continue;
          fs.copyFileSync(
            path.join(srcPacksDir, file),
            path.join(dstPacksDir, file),
          );
        }
      }
      // Issue #225 — soft-force upgrade banner needs CHANGELOG.md at runtime
      // to render the "what's new" bullets. Copy repo-root CHANGELOG.md →
      // dist/CHANGELOG.md so resolveBundledChangelog() in update/changelog-loader
      // can find it next to bin.js. Best-effort: missing CHANGELOG falls back
      // to a generic prompt without bullets (still functional).
      const srcChangelog = path.resolve(__dirname, "../..", "CHANGELOG.md");
      if (fs.existsSync(srcChangelog)) {
        fs.copyFileSync(srcChangelog, path.resolve(__dirname, "dist", "CHANGELOG.md"));
      }
    },
  },
  {
    entry: {
      "bin-pre-tool-use":       ENTRIES["bin-pre-tool-use"],
      "bin-post-tool-use":      ENTRIES["bin-post-tool-use"],
      "bin-stop":               ENTRIES["bin-stop"],
      "bin-session-end":        ENTRIES["bin-session-end"],
      "bin-session-start":      ENTRIES["bin-session-start"],
      "bin-pre-compact":        ENTRIES["bin-pre-compact"],
      "bin-user-prompt-submit": ENTRIES["bin-user-prompt-submit"],
      "bin-updater":            ENTRIES["bin-updater"],
      // Issue #299: bundle the user-level digital-twin Stop tap into the cjs
      // block so install-hook.ts's ALL_CHANNELS entry can actually register.
      "bin-digital-twin-tap":   ENTRIES["bin-digital-twin-tap"],
      // Issue #368 (v0.11.1) — see ENTRIES comment above.
      "bin-uploader":           ENTRIES["bin-uploader"],
    },
    format: ["cjs"],
    platform: "node",
    target: "node22",
    outDir: "dist",
    bundle: true,
    splitting: false,
    noExternal: [
      "@teamagent/types",
      "@teamagent/ports",
      "@teamagent/core",
      "@teamagent/adapters",
      "@teamagent/cli",
      // Issue #299: bin-digital-twin-tap.ts imports from @teamagent/digital-twin
      // (tapSession, ensureDefaultConfig, runHourlyScanIfDue, …). Without
      // noExternal-ing the workspace package, the produced cjs would still
      // call `require("@teamagent/digital-twin")` at runtime, which is not
      // installed in the npm-flat layout of the published tarball.
      "@teamagent/digital-twin",
      "zod",
      "@xenova/transformers",
      // Issue #368 (v0.11.1) — uploader CJS bundle must inline `ulid`.
      // `ulid` is in `teamagent/package.json` dependencies, so tsup's
      // default auto-externalizes it. The staged `bin-uploader.cjs` runs
      // from `~/.teamagent/digital-twin/` which has no node_modules, so a
      // bare `require("ulid")` MODULE_NOT_FOUND-crashes the daemon →
      // silent zero uploads. Force-bundling here mirrors the digital-twin
      // package's own `tsup.config.ts` (commit 559fce0 / #381). Note: ESM
      // bundles still need `ulid` external — its CJS `require("crypto")`
      // breaks tsup's ESM `__require` shim — but CJS bundles use Node's
      // native require, so noExternal is safe here. The ESM bin.js entry
      // above keeps `ulid` in NATIVE_EXTERNAL unchanged.
      "ulid",
    ],
    external: NATIVE_EXTERNAL,
    shims: true,
    // statusline is intentionally NOT bundled — tsup CJS rewrites require("node:sqlite")
    // to require("sqlite"), breaking the builtin. Copy raw source instead.
    async onSuccess() {
      const src = path.resolve(__dirname, "../../scripts/teamagent-statusline.cjs");
      const dst = path.resolve(__dirname, "dist/teamagent-statusline.cjs");
      fs.copyFileSync(src, dst);
    },
  },
]);
