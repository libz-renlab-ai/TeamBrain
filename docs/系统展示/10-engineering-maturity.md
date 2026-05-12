# TeamAgent 系统展示: 十、工程成熟度信号

Source index: [系统展示.md](../系统展示.md)

## 十、工程成熟度信号

| 指标 | 状态 |
|---|---|
| **Port/Adapter 契约测试** | 每个 Port 都有 `packages/ports/src/__tests__/*-contract.ts`，新实现必须复用契约套件 |
| **TDD 强制** | 所有新功能：先写测试看红 → 最小实现看绿 → commit |
| **Walking Skeleton 每 Milestone 可跑** | `pnpm teamagent skeleton-demo` 任何 commit 点都跑得通 |
| **可观测性** | Status line 实时显示知识条数/今日拦截/最新日期；实时 HTML dashboard（当前写 `docs/dashboard.html`，按 [`docs/POP-OPEN-HTML.md`](../POP-OPEN-HTML.md) 三条铁律计划改为：Chrome 打开 + 写 `/tmp/...` + 立刻 pop open） |
| **跨平台** | Windows 11 / macOS / Linux 均已验证，Windows 下路径问题已全部 fix（反斜杠、Git Bash、node:sqlite、文件锁）|
| **安装诊断** | `teamagent doctor` 跑 8 项检查，`--fix` 自动修能修的问题 |
| **发布化** | `packages/teamagent` 独立 npm publish 包，`npm install -g teamagent` 5 分钟上手 |
| **本地优先** | 零云依赖、所有知识在本机 SQLite、数据不外传 |

---
