import { defineConfig } from "tsup";
import fs from "node:fs";
import path from "node:path";

const ENTRIES = {
  bin:                      "../cli/src/bin.ts",
  "bin-pre-tool-use":       "../cli/src/bin-pre-tool-use.ts",
  "bin-post-tool-use":      "../cli/src/bin-post-tool-use.ts",
  "bin-stop":               "../cli/src/bin-stop.ts",
  "bin-session-end":        "../cli/src/bin-session-end.ts",
  "bin-session-start":      "../cli/src/bin-session-start.ts",
  "bin-pre-compact":        "../cli/src/bin-pre-compact.ts",
  "bin-user-prompt-submit": "../cli/src/bin-user-prompt-submit.ts",
  "bin-updater":            "../cli/src/bin-updater.ts",
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
      "zod",
      "@xenova/transformers",
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
