import { defineConfig } from "tsup";

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
  },
  format: ["cjs"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: false,
  sourcemap: false,
  splitting: false,
  // 把所有 workspace 包 + zod 打进单文件，避免运行时模块解析
  noExternal: [
    "@teamagent/types",
    "@teamagent/ports",
    "@teamagent/core",
    "@teamagent/adapters",
    "zod",
    "@xenova/transformers",
  ],
  // sharp, onnxruntime-node: native .node addons that cannot be bundled
  external: ["sharp", "onnxruntime-node", "jsdom"],
  // 注入 __dirname/__filename/__esm 等 CJS shims，让 import.meta.url 在 CJS bundle 正常工作
  shims: true,
});
