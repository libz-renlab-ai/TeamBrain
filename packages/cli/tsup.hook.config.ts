import { defineConfig } from "tsup";
import fs from "node:fs";
import path from "node:path";

/**
 * Hook 专用打包配置：把 bin-pre-tool-use.ts bundle 成单文件 .cjs
 *
 * 为什么单独一个配置：
 * - Hook 被 Claude Code 在 %TEMP% 目录里 spawn，不在项目根
 * - 不能用 `npx tsx` —— 找不到 workspace 依赖 + 反斜杠路径被 bash 吞
 * - 必须是自包含 .cjs，用 `node <absolute-path>` 直接跑，毫秒级启动
 */
export default defineConfig({
  entry: {
    "bin-pre-tool-use":       "src/bin-pre-tool-use.ts",
    "bin-post-tool-use":      "src/bin-post-tool-use.ts",
    "bin-user-prompt-submit": "src/bin-user-prompt-submit.ts",
    "bin-session-start":      "src/bin-session-start.ts",
    "bin-stop":               "src/bin-stop.ts",
    "bin-session-end":        "src/bin-session-end.ts",
    "bin-pre-compact":        "src/bin-pre-compact.ts",
    "bin-updater":            "src/bin-updater.ts",
    "bin-digital-twin-tap":   "src/bin-digital-twin-tap.ts",
    "bin-embedder":           "src/bin-embedder.ts",
    // Issue #368 (v0.11.1) — uploader daemon spawned by bin-digital-twin-tap.
    // Built into packages/cli/dist/ so `<cliRoot>/dist/bin-uploader.cjs`
    // (`defaultDaemonBinaryEntry` in commands/install-hook.ts) resolves in
    // monorepo dev where cliRoot() = packages/cli/. The published tarball
    // gets its own copy from packages/teamagent/tsup.config.ts where
    // cliRoot() = <install>/teamagent/. Both inline `ulid` via noExternal,
    // fixing the silent MODULE_NOT_FOUND crash that zeroed uploads on every
    // freshly-installed machine before v0.11.1.
    "bin-uploader":           "../digital-twin/src/bin-uploader.ts",
  },
  format: ["cjs"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: false,
  sourcemap: false,
  splitting: false,
  // 把所有 workspace 包 + zod 打进单文件，避免运行时模块解析。
  // js-tiktoken: 纯 JS，bundle 能 inline；不加进来时 bin 被 stage 到
  // ~/.teamagent/hooks/ 后离开 monorepo hoisted node_modules 就找不到 →
  // SessionStart hook 启动时 MODULE_NOT_FOUND 静默崩（issue #131）。
  // 与 packages/teamagent/tsup.config.ts 的发布配置行为对齐。
  noExternal: [
    "@teamagent/types",
    "@teamagent/ports",
    "@teamagent/core",
    "@teamagent/adapters",
    "@teamagent/digital-twin",
    "zod",
    "@xenova/transformers",
    "js-tiktoken",
    "ulid",
  ],
  // sharp, onnxruntime-node, sqlite-vec: native .node addons cannot be bundled.
  // sqlite-vec in particular: when inlined, its loadablePath() resolves relative to the
  // bundle's __dirname, which doesn't have the platform-specific .node binary, so the
  // require silently fails and openDb's _sqliteVecLoad stays undefined → vec0 module
  // never gets registered → all dense vec MATCH queries report "no such module: vec0".
  external: ["sharp", "onnxruntime-node", "jsdom", "sqlite-vec"],
  // 注入 __dirname/__filename/__esm 等 CJS shims，让 import.meta.url 在 CJS bundle 正常工作
  shims: true,
  // statusline 故意不 bundle —— tsup CJS 会把 require("node:sqlite") 重写成
  // require("sqlite") 破坏 builtin。直接复制源文件即可。
  // installHook() 默认找 cli/dist/teamagent-statusline.cjs，没有这一步会软跳过。
  async onSuccess() {
    const src = path.resolve(__dirname, "../../scripts/teamagent-statusline.cjs");
    const dst = path.resolve(__dirname, "dist/teamagent-statusline.cjs");
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  },
});
