import { defineConfig } from "vitest/config";

// 默认 singleThread 是 Windows + pnpm monorepo OOM workaround（见 CLAUDE.md「已知限制」）。
// 但 Linux/macOS 上 310 个测试文件单线程串行 collect 要 ~215s，占 Ubuntu CI 总时长 82%。
//
// 修复策略：只在 CI 且非 Windows 上启用多线程并行。
//   - Windows CI: singleThread = true（保留 OOM workaround，不动）
//   - Linux/macOS CI: threads pool 多 worker + isolate=true（默认），
//     每个文件获得独立 VM context，vi.mock 工厂正确按文件作用（避免 isolate=false
//     模式下跨文件 mock 冲突）。process.env 跨线程共享，本仓库 env-mutating 测试
//     各用不重叠 key（TEAMAGENT_HOME / TEAMAGENT_LLM_MODEL / TEAMAGENT_CLAUDE_MD_LIMIT
//     等），无 race；afterEach 也都正确 restore。
//   - 任何本地（CI 未设置）: singleThread = true（与 ADR-0013 一致：本地 N≥4 sessions
//     并发跑全量会触发 macOS scheduler 饱和，本地行为完全不变）
const isCI = !!process.env.CI;
const isWindows = process.platform === "win32";
const enableParallel = isCI && !isWindows;

export default defineConfig({
  test: {
    globals: false,
    include: ["packages/*/src/**/__tests__/**/*.test.ts"],
    environment: "node",
    fileParallelism: enableParallel,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: !enableParallel,
      },
    },
    // Xenova 模型首次加载可能需要数秒；给嵌入相关测试留足裕量
    testTimeout: 30000,
  },
});
