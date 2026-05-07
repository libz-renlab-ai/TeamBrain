```
  npm install -g teamagent
          |
          v  postinstall 欢迎块（≤30 行）
  ┌─────────────────────────────┐
  │  ✅ 装好啦 🎉 立刻可以做的 3 件事 │
  └────────────┬────────────────┘
               |  用户输入: teamagent（无参数）
               v
  ┌────────────────────────────────┐
  │  首次运行向导 (first-run wizard) │
  │  选择 1 / 2 / 3 + Enter        │
  │  1) skeleton-demo              │
  │  2) stats                      │
  │  3) --help                     │
  └──────┬───────────┬────────────┘
         |           |
         v           v
   执行子命令     写入 state 文件
         |           |
         v           v
  ┌─────────────────────────────────┐
  │  ~/.teamagent/first-run-state.json │
  │  { completedSteps, lastRunAt }  │
  └─────────────────────────────────┘
         |
         v  第二次 teamagent（无参数）
  "上次你跑了 X，要不要试试 Y？"
```

# First-run welcome / wizard

## Trigger

以下两个条件同时满足时触发：

1. 用户在 shell 里输入 `teamagent`（不带任何参数）
2. `bin.ts` 的 `switch(command)` 命中 `case undefined:`

**装好后立刻触发**：`npm install -g teamagent` 跑完后 `postinstall.mjs` 打印欢迎块（静态文案），用户随即输入 `teamagent` 时才真正进入交互向导。

## UX example

```
✅ 装好啦 🎉 立刻可以做的 3 件事：

  1) teamagent skeleton-demo   — 跑一次 M0 演示，看 TeamAgent 如何学东西
  2) teamagent stats           — 查看知识库里已有多少条经验
  3) teamagent --help          — 列出所有命令

请选择 1 / 2 / 3，然后按 Enter（或 Ctrl+C 退出）：
> 1
```

第二次运行（已有 state）：

```
上次你跑了 skeleton-demo，要不要试试 stats？

  1) teamagent skeleton-demo
  2) teamagent stats
  3) teamagent --help

请选择 1 / 2 / 3，然后按 Enter：
>
```

非 TTY 环境（CI / pipe）：

```
teamagent — 首次运行向导
  1) teamagent skeleton-demo
  2) teamagent stats
  3) teamagent --help
（非交互环境，跳过选择）
```

## State file

路径：`~/.teamagent/first-run-state.json`（与 `update-state.json` 独立，互不干扰）

```json
{
  "version": 1,
  "completedSteps": ["skeleton-demo"],
  "lastRunAt": 1714999999000
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `number` | 固定为 `1`，留作未来 schema 迁移 |
| `completedSteps` | `string[]` | 用户已执行过的子命令名，单调追加 |
| `lastRunAt` | `number` | Unix 毫秒时间戳，每次向导完成后更新 |

首次运行：文件不存在 → 向导显示完整菜单 → 用户选择后写入。
后续运行：读取 `completedSteps`，在菜单上方显示"上次跑了 X"提示。

## Known limits

- **非 TTY（CI / pipe）**：`process.stdin.isTTY` 为假时，向导渲染菜单后直接退出（exit 0），不等待键盘输入，不记录 state。
- **spawn 失败**：子命令 spawn 异常时向导打印错误信息后退出，不重试，exit code 非零。无自动恢复机制。
- **`--help` 路径不受影响**：`bin.ts` 里 `case undefined:` 已与 `--help` / `-h` / `help` 彻底分离；`teamagent --help` 输出与此前 byte-identical。
- **zero new deps**：向导只使用 Node.js 内置 `readline`，不引入任何新 npm 包。
- **state 与 `update-state.json` 独立**：绝对不写入 `~/.teamagent/update-state.json`，避免污染已有升级状态。

## Verification

```bash
# 第三方 judge harness（W4 实现）
bash scripts/judge-first-run.sh

# 检查 judge.json OVERALL
cat .judge/*/judge.json | jq '.checks[] | {id, tool, exit_code}'
```

| Judge check | 验证内容 |
|-------------|---------|
| J1 `typecheck` | `pnpm typecheck` exit 0 |
| J2 `vitest` | `packages/cli/src/__tests__/first-run.test.ts` ≥6 case 全绿 |
| J3 `postinstall` | stdout 含 ✅/装好/skeleton-demo/stats/--help/github.com，≤30 行 |
| J4 `wizard-first` | 首次运行含"装好啦" + 3 命令名；state 文件创建 |
| J5 `wizard-second` | 二次运行含"上次你跑了"；`completedSteps.length > 0` |
| J6 `help-unchanged` | `--help` 输出与 `docs/baselines/help-output.txt` diff 为空 |

规格文档：`docs/specs/2026-05-07-issue87-first-run.md`
