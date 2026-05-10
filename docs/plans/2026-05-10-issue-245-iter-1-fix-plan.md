```
   _____
  ( o>    /review iter-1 — fix-plan
   \\_<_)  把 fire-and-forget emit 改成 await，把 emit 移到
    |  |   pruneOldBackups 之前；保护 telemetry 不漏行
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

# Issue #245 — /review iter-1 fix-plan

`/review` 第 1 轮（feat/issue-245 rebase 后）找到 2 条 P2 finding（confidence ≥ 7）。本文档按 [docs/PR-PLAN.md](../../PR-PLAN.md) 三段记录如何修。**禁止开 follow-up issue / follow-up PR**——同 PR branch 内修。

## 1. Task description

| # | severity | confidence | location | problem | fix |
|---|----------|------------|----------|---------|-----|
| F1 | P2 | 8/10 | `packages/cli/src/commands/update.ts` snoozeCmd / neverCmd | `emitUpgradeEventSync` 在没有 injected eventLog 时走 `void emitUpgradeEvent(...).catch(...)` fire-and-forget；CLI 命令立即 return，process 在 events.db open + sqlite write 完成前 exit；snooze / never 的转化率事件被默默丢失 | 把两个 cmd 改成 `async`，调用 `emitUpgradeEvent`（async 变体）并 `await`，runUpdateCommand 已是 async 签名兼容 |
| F2 | P2 | 7/10 | `packages/cli/src/updater-logic.ts` runUpdater 成功路径 | emit 调用排在 `pruneOldBackups()` 之后；如果 pruneOldBackups 抛错（disk full / 权限 / 路径不存在），整个成功 emit 被 `try {} finally { releaseLock }` 跳过，`update-installed` 事件丢失。维护副作用不应该挡 telemetry | emit 移到 writeState 之后、pruneOldBackups 之前；emit 自带 try/catch 不影响后续；同时把 `emitInstalled` dep 签名改成 `() => void \| Promise<void>` 并在 runUpdater 里 `await`，让 bin-updater 的 detached process 也不会在异步写完成前 exit |

## 2. Expected outputs

- `packages/cli/src/commands/update.ts`：snoozeCmd / neverCmd 异步化 + 改用 `emitUpgradeEvent`，import 同步切到 async 变体
- `packages/cli/src/updater-logic.ts`：emit 移位 + `emitInstalled` 签名 widen + `await deps.emitInstalled(...)`
- `packages/cli/src/bin-updater.ts`：emitInstalled 包装由 `emitUpgradeEventSync` 切到 `emitUpgradeEvent`（async）
- 测试：现有 28 个 update.test.ts + 22 个 updater-logic.test.ts + 2 个 e2e + 13 个 prompt + 33 个 stats 用例不破（vi.mock 已经同时 mock sync + async 两个 emit 入口，async 切换无需新增 case）
- `pnpm typecheck` 全绿
- `.fixedflow/iter-245.json` 增到 iter=2

## 3. Third-party judge harness

| step | 工具 / 命令 | 期望 |
|------|-------------|------|
| RUN-J1 | `pnpm typecheck` | exit 0，无 TS 报错 |
| RUN-J2 | `pnpm exec vitest run packages/cli/src/__tests__/update.test.ts packages/cli/src/__tests__/updater-logic.test.ts packages/cli/src/__tests__/upgrade-events-e2e.test.ts packages/cli/src/__tests__/maybe-show-upgrade-prompt.test.ts packages/cli/src/__tests__/stats.test.ts` | 5 个文件 ≥98 tests passed |
| RUN-J3 | `pnpm exec vitest run packages/cli packages/core` | 全量 ≥2050 tests passed (与 rebase 前持平) |
| DUMP | iter file `.fixedflow/iter-245.json` 写最终 `iter` / `last_iter_at` / cumulative tokens（cumulative 由后续 read 阶段判定，本轮置 0 占位） | 文件存在、JSON 合法 |
| READ | LLM judge：阅读 J1/J2/J3 raw exit code + stdout + diff 摘要，输出 PASS / FAIL；任何 J 失败 = FAIL，回到 task description 重写 | PASS |

「LLM judge」按 [docs/feature-verification.md](../../feature-verification.md) 的 V3 READ 阶段执行——**rule-of-thumb：只看 raw 工具输出，不让被测代码自评**。

---

> 本 iter 修完后预期 `/review` 第 2 轮 PASS（P0/P1/P2 都没有新 finding）。
> 如果第 2 轮还有新 finding：在本文件之外另开 `docs/plans/2026-05-10-issue-245-iter-2-fix-plan.md`，**禁开 follow-up issue**。
