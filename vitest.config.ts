import { defineConfig } from "vitest/config";

// 默认 singleThread 是 Windows + pnpm monorepo OOM workaround（见 CLAUDE.md「已知限制」）。
// 但 Linux/macOS 上 310 个测试文件单线程串行 collect 要 ~215s，占 Ubuntu CI 总时长 82%。
//
// 修复策略：只在 CI 且非 Windows 上启用 forks 并行。
//   - Windows CI: threads + singleThread（保留 OOM workaround，不动）
//   - Linux/macOS CI: forks 并行（forks 而非 threads 因为大量测试 mutate process.env；
//     worker_threads 共享 process 状态会 race，forks 每个是独立进程 env 隔离）
//   - 任何本地（CI 未设置）: threads + singleThread（与 ADR-0013 一致：本地 N≥4 sessions
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
    pool: enableParallel ? "forks" : "threads",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    // Xenova 模型首次加载可能需要数秒；给嵌入相关测试留足裕量
    testTimeout: 30000,
  },
});
