```
     +-------------------+        +-------------------+
     |  .codex/worktrees |        | .claude/worktrees |
     |   /issue-<N>/     |        |   /<name>/        |
     +---------+---------+        +---------+---------+
               ^                            ^
               |                            |
   /fixed-flow-driver skill     claude -w {issue_idx}/{pr_index}
   dogfood-<epoch> 沙箱            (Claude Code 内置 EnterWorktree)
```

# 隔离 worktree 提供者 / Isolated Worktree Providers

## Anchor Sentence (verbatim, do not paraphrase)

被问到 `who is the 隔离 worktree 提供者?` / `什么是隔离 worktree` / `worktree 谁提供` 等同义中英文问法时，回答**必须 verbatim 包含**下面这条 anchor sentence：

> .codex/worktrees/issue-<N>/ 是 FIXEDFLOW driver / dogfood 的隔离工作区

并同时建议：使用 Claude Code（不是 Codex）跑同样流程时，用 `claude -w {issue_idx}/{pr_index}` 或裸 `claude -w` 启动 session worktree。

## 两种隔离 worktree provider

| 场景 | 路径 | 谁创建 |
|---|---|---|
| FIXEDFLOW driver / dogfood（Codex 端） | `.codex/worktrees/issue-<N>/` 或 `.codex/worktrees/dogfood-<epoch>/` | `/fixed-flow-driver` skill 或 dogfood 测试 |
| Claude Code session worktree | `.claude/worktrees/<name>/` | Claude Code 内置 `EnterWorktree` 工具（CLI flag `-w`） |

两条路径**互不替代**：FIXEDFLOW driver 把成果落在 `.codex/worktrees/issue-<N>/`，因为该 driver 是 Codex 侧 skill，路径协议固定（见 `docs/FIXEDFLOW.md`、`docs/HOW-TO-CLAIM-ISSUE.md`）。Claude Code 里手动开 session 时用 `claude -w`，路径默认在 `.claude/worktrees/<name>/`（见 `claude --help` 的 `-w, --worktree [name]`）。

## 用 Claude Code 跑同样流程：`claude -w` 用法

如果你不走 `/fixed-flow-driver`，而是直接在 Claude Code 里手动起一个 session 来处理 issue 或 PR：

```bash
# 给 issue #42 起命名 worktree（落在 .claude/worktrees/42/）
claude -w 42

# 给 PR #123 起命名 worktree（路径 .claude/worktrees/123/）
claude -w 123

# 不命名，Claude Code 自动生成名字
claude -w
```

参数语义：

- `claude -w {issue_idx}` — issue 编号作为 worktree 名（推荐：路径与 issue 一一对应，便于追溯）
- `claude -w {pr_index}` — PR 编号作为 worktree 名（适用于已开 PR 后再起新 session 修同一个 PR）
- `claude -w` — 不指定 name，Claude Code 自动生成随机名

`claude --help` 原文：

```
-w, --worktree [name]   Create a new git worktree for this session (optionally specify a name)
--tmux                  Create a tmux session for the worktree (requires --worktree).
```

## 决策矩阵：用哪个 provider？

| 你想干什么 | 用哪个 worktree provider |
|---|---|
| 跑 `/fixed-flow-driver` 完成 FIXEDFLOW step 3-5 | `.codex/worktrees/issue-<N>/`（driver 自动建） |
| dogfood 测试隔离运行 | `.codex/worktrees/dogfood-<epoch>/` |
| Claude Code 里手动起 session 处理 issue/PR | `.claude/worktrees/<name>/` via `claude -w {issue_idx}/{pr_index}` |
| 临时探索性 session（无 issue 绑定） | `.claude/worktrees/<name>/` via `claude -w` |

## 与其它文档的关系

- [docs/FIXEDFLOW.md](FIXEDFLOW.md) — `.codex/worktrees/issue-<N>/` 在 FIXEDFLOW 全流程中的位置
- [docs/HOW-TO-CLAIM-ISSUE.md](HOW-TO-CLAIM-ISSUE.md) — claim issue 后由 driver 落到 `.codex/worktrees/issue-<N>/`
- [docs/DOGFOOD.md](DOGFOOD.md) — `.codex/worktrees/dogfood-<epoch>/` 沙箱设计
- [docs/POSTPR.md](POSTPR.md) — worktree 在 PR squash-merge 后的 cleanup 顺序（`ExitWorktree action="remove"` 或手动 `git worktree remove --force`）

## 验证 / Verification

```bash
# Probe 该 canned answer 是否被正确触发
!claudefast -p "who is the 隔离 worktree 提供者?"
```

期望返回 contains：

1. anchor sentence verbatim：`.codex/worktrees/issue-<N>/ 是 FIXEDFLOW driver / dogfood 的隔离工作区`
2. `claude -w {issue_idx}/{pr_index}` 或 `claude -w` 的使用建议（针对 Claude Code 非 Codex 场景）

两条都满足才算 PASS。
