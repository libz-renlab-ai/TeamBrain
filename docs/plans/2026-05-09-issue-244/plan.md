```text
   ┌────────────────────────────────────────────────────────────────┐
   │  ISSUE #244 — update-state.json read-modify-write race fix     │
   │                                                                │
   │  current:  read → mutate → write (no lock)  ×3 call sites      │
   │            atomic write protects truncation but NOT lost-update│
   │                                                                │
   │  target:   withUpdateStateLock(home, mutator) {                │
   │              acquire flock (or wx-create lock file w/ retry)   │
   │              s = readState()                                    │
   │              s' = mutator(s)                                    │
   │              writeState(s')   // already atomic tmp+rename     │
   │              release lock                                       │
   │            }                                                    │
   │                                                                │
   │  call sites that switch:                                       │
   │   1. session-start-logic.ts writeUpdateState (non-atomic!)     │
   │   2. bin-updater.ts writeState (3 read-modify-write blocks)    │
   │   3. commands/update.ts {snooze,never,enable,checkCmd} cmds    │
   └────────────────────────────────────────────────────────────────┘
```

# Issue #244 — update-state.json 写入并发安全

Closes #244.

## ① Plan — task description

**做什么**：给 `update-state.json` 的 read-modify-write 序列引入文件锁 `withUpdateStateLock(home, mutator)`，所有 mutating 路径都要切到 helper。

**为什么**：当前 3 个写入点（`session-start-logic.writeUpdateState`、`bin-updater.writeState`、`commands/update.{snooze,never,enable,checkCmd}`）即便有 atomic write（tmp+rename），仍然存在 **lost-update**：
- A 读 state（snooze_level=0）
- B 读 state（snooze_level=0）
- A 写 state（snooze_level=1）
- B 写 state（snooze_until_ts=t+24h，但 snooze_level 仍是 0 因为它读到的是 0）→ A 的更新被丢

并发触发场景：两个 `claude` 窗口同时跑 SessionStart hook + 用户在第三个窗口跑 `teamagent update --snooze`，更新会互相覆盖。

**怎么做**：
1. 新文件 `packages/cli/src/lib/update-state-lock.ts`：
   - `withUpdateStateLock<T>(home, mutator: (s: UpdateState) => UpdateState): UpdateState`
   - 用 `fs.openSync(lockPath, "wx")` 拿到 exclusive lock；竞争时 retry-with-backoff（max 5 次，每次 50–200ms）；超时 throw。
   - 复用 `bin-updater.ts` 现有 `acquireLock`/`releaseLock` 中 stale-pid 检测的思路（pid 死了就强行接管）。
   - mutator 之后调 atomic write；finally 删 lock 文件。
2. 重构 3 个写入点：所有 `read → mutate → writeState` 序列改走 `withUpdateStateLock`。
3. `session-start-logic.writeUpdateState` 顺手补 atomic write（目前是非原子的）。
4. 单测：
   - `update-state-lock.test.ts`：单写、串行写、并发写不丢失、stale pid recovery、超时回退。
   - 覆盖 read-modify-write 链路：mock 一个 sleep-in-mutator 的 mutator，确认两个并发 caller 不会互相覆盖（最终 state 包含两次更新）。

**不做什么**：
- 不重写 `nextSnooze` / `shouldPromptUpgrade` 等 pure functions（它们已经是 functional core）。
- 不引入 npm `proper-lockfile`/`flock` 依赖（fs.openSync wx 已够用，与 `bin-updater.ts:123` 现有思路一致）。
- 不动 `events.db` / `warmup-state.json` / `knowledge.db` 的写入路径（与 #244 无关）。
- 不为 lock 文件加 systemd-style heartbeat（一个 process 抓 lock 几 ms，不需要心跳）。

## ② Expected outputs

- 新文件：`packages/cli/src/lib/update-state-lock.ts`（约 80 行：`withUpdateStateLock` + 私有的 `acquireLock` / `releaseLock` / `atomicWrite`）。
- 新测试：`packages/cli/src/lib/__tests__/update-state-lock.test.ts`（≥6 cases）。
- 修改：
  - `packages/cli/src/session-start-logic.ts:156-161` — `writeUpdateState` 改成调用 `withUpdateStateLock`（mutator 返回传入的 `s` 即可保留旧 caller 语义）；`readUpdateState` 不变。
  - `packages/cli/src/bin-updater.ts` — 把 read-modify-writeState 块包进 `withUpdateStateLock`，本地的 `writeState`/`readState` helper 保留作为 lock 内部的实现细节。
  - `packages/cli/src/commands/update.ts` — `snoozeCmd`、`neverCmd`、`enableCmd`、`checkCmd`（rate-limit 写入分支 + 成功写入分支）切到 `withUpdateStateLock`。
- typecheck pass、所有 update-state 现有单测无回归、新增 race 单测全绿。
- 普通 PR（非 draft），squash-merge。

## ③ How-to-verify (third-party judge harness)

**§V1 RUN**:
- `pnpm typecheck` → 捕获 stdout/exit。
- `pnpm exec vitest run packages/cli/src/lib/__tests__/update-state-lock.test.ts --no-coverage` → 新单测全绿。
- `pnpm exec vitest run packages/cli/src/__tests__/session-start-logic.test.ts packages/cli/src/__tests__/update.test.ts --no-coverage`（如存在）→ 现有 update-state 相关单测无回归。
- `git diff --stat origin/main...HEAD` → 必须只列上面 ② 列出的文件。

**§V2 DUMP**: `judge.json` 应包含：
```json
{
  "exit_code": 0,
  "metrics": {
    "lock_tests_pass": N,
    "lock_tests_fail": 0,
    "regression_tests_pass": M,
    "regression_tests_fail": 0,
    "typecheck_exit": 0,
    "files_changed": ["packages/cli/src/lib/update-state-lock.ts", "packages/cli/src/lib/__tests__/update-state-lock.test.ts", "packages/cli/src/session-start-logic.ts", "packages/cli/src/bin-updater.ts", "packages/cli/src/commands/update.ts"]
  },
  "evidence_dir": ".judge/issue-244/<run_id>/",
  "stdout_path": ".judge/issue-244/<run_id>/stdout.log"
}
```

**§V3 READ**: 独立 `claudefast -p` 只读 raw JSON + diff hunk + 新测试源码（不读 lock 实现源码）回答：
1. 锁是否真的覆盖了 read-modify-write 整段？还是只锁了 write？
2. 新测试是否真的能区分 lost-update（即去掉 lock 后这些测试要红）？
3. 是否引入了 npm 依赖 / 改了 `events.db` 等无关写入路径？
4. session-start-logic 的非原子 write 是否也顺手修了？

## ④ Claudefast probes

- `claudefast -p "TeamAgent snooze 状态写入是否并发安全？"` → 应命中 file lock / withUpdateStateLock / atomic write 关键词。
- `claudefast -p "feat/issue-244 这个分支只改了哪些文件？"` → 应只列 plan 文档 + 上面 ② 列出的实现/测试文件。
