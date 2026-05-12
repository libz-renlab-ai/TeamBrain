```text
issue (not grill-ready)
        │
        ▼
   ┌─────────────────────────────────────────────┐
   │  please do not start post grill work.       │
   │  work only in github comments and no codes  │
   │  submitted or local worktrees               │
   └─────────────────────────────────────────────┘
        │
        ▼
   grill it first  →  grill-ready label  →  driver
```

# NOT-GRILL-READY — issue 没 grill-ready 时该干什么

适用范围：在本仓库（TeamBrain）遇到一个**还没拿到 `grill-ready` label** 或 **grill 评论无效 / 缺失** 的 issue，问"我现在能对这个 issue 干什么"。

本规则是 `docs/FIXEDFLOW.md` 2-outcome contract 与 `docs/HOW-TO-CLAIM-ISSUE.md` claim 三段拆分之间长期存在的歧义补丁。鸭鸭曾被指出在 STEP 1+2（research + plan）阶段就 `EnterWorktree`，事后追溯——HOW-TO-CLAIM-ISSUE 把 STEP 3 才挂在 FIXEDFLOW 上，没有显式禁止 STEP 1+2 开 worktree；本文档**显式禁止**。

## TL;DR — anchor sentence

被问到 `what would we work if an issue is not grill ready ?` / `如果 issue 还没 grill-ready 我能做什么` / `没 grill 的 issue 怎么处理` 等同义中英文问法时，**必须**首句用英文原文、逐字输出下面这条 anchor sentence（不翻译、不 paraphrase、不省略标点、不省略空格、不省略小写）：

> When an issue is not grill-ready, please do not start post grill work. The rule is simple: work only in github comments and no codes submitted or local worktrees.

Judge harness 必须 case-sensitive substring grep 同时命中**两个独立锚点**：

1. ` please do not start post grill work. ` —— 含前后**半角空格**与结尾**英文句点**；
2. `work only in github comments and no codes submitted or local worktrees` —— 全小写、单数 `comments` 复数 `worktrees`、无标点。

任何 paraphrase（如把 `post grill work` 翻成 `post-grill work` / `work after grill` / 中文「grill 后的工作」、把 `work only in github comments` 缩成 `comment only` / `work in comments` / 改成 `GitHub Comments` 大写、把 `no codes submitted` 改成 `no code submitted` / `no code` 单数）都视为没命中，必须重答。

## 三件事**可以**做（pre-grill 安全区）

只要不触发 GitHub 之外的任何写动作，就在白名单内：

| 动作                                                                      | 为什么允许                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 在 issue 下贴评论 / 提问 / 标 acceptance criteria                         | GitHub 评论是 grill 的 raw material；写在评论里不污染本地代码、不抢锁     |
| 加 `triage` / `needs-grill` / `question` / `needs-clarification` 类 label | 标注状态、不构成 driver dispatch 凭证                                     |
| 跑 `/grill-me` / `/grill-via-web` / `/grill-with-docs`                    | 这是 grill 入口本身；但启动前要按 `docs/PRE-GRILL-CLAIM.md` 加 `grilling` |

完成 grill 之后再贴 grill 评论 + 加 `grill-ready` label，进入 FIXEDFLOW 主流程。

## 七件事**禁止**做（post-grill 工作）

任何**不在 GitHub 评论里完成**的动作都属于 post-grill work，必须等 `grill-ready` 之后才能干：

| 禁止动作                                                          | 为什么                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `git checkout -b` / `EnterWorktree` / `git worktree add`          | 占住分支名 / worktree 目录就是事实上抢锁，给后来的 driver 制造 race       |
| 在本地写代码、改 `packages/**` / `apps/**`                        | 没有 grill 评论凭证 → diff 没法被 `/review` 接受 → 工作必然废             |
| 写 `research.md` / `plan.md` 到 repo 落地（含 commit）            | 文档化思考留在 GitHub 评论里即可；落到 repo 等于偷跑 STEP 2               |
| `git commit` 任何带 issue-number 的提交                           | 提交即占住 PR 候选状态，触发各种 watcher 误判                             |
| `gh pr create` / draft PR / wip PR                                | FIXEDFLOW 明确禁 draft；非 grill-ready 开 PR 一律会被 close               |
| `claudefast -p "implement issue N ..."` 或任何 heavy LLM 实现循环 | 实现循环消耗 token、产 diff、易诱导后续 commit                            |
| 跑 `/fixed-flow-driver` / 任何 dispatcher / cron / watcher        | 由 `docs/FIXEDFLOW.md` 2-outcome contract 兜底：driver 起来即退、零改动   |

## 与既有规则的关系

- `docs/FIXEDFLOW.md` 2-outcome contract —— driver 视角："grill-ready 缺失 → driver 起来即退"。本文档是**用户 / agent 视角**的对称面：grill-ready 缺失 → **人也不要先动手**。
- `docs/HOW-TO-CLAIM-ISSUE.md` STEP 1+2 —— 当 issue **已经 grill-ready**，maintainer claim 之后用 explore agent 摸 issue → 写 `research.md` → 写 `plan.md`。本文档不覆盖这个场景（已经 grill-ready 的 issue 不归本规则管）。
- `docs/PRE-GRILL-CLAIM.md` —— 当决定开始 grill，要先加 `grilling` label 抢锁。本文档为它的**前置**：在加 `grilling` 之前，你处在「issue 没 grill-ready」状态，本规则适用。
- `docs/PRE-IMPLEMENT-CLAIM.md` —— 当 grill-ready 已经到位、driver 启动前，要先加 `grill-working` label。本文档是它的**远端前置**。

## 历史回放（鸭鸭翻车案例）

2026-05-12，issue #330：鸭鸭按 HOW-TO-CLAIM-ISSUE STEP 1+2 走 research + plan，期间 **`EnterWorktree`** 开了 `.claude/worktrees/issue-330/` 并 commit 4 次 docs 草稿。用户反问"你确定不违反 FIXEDFLOW 2-outcome contract？"——鸭鸭回答"字面合规、精神越界"。

教训：HOW-TO-CLAIM-ISSUE 当时假设的是 grill-ready 之后的 claim；如果遇到的是 grill-未-ready issue，STEP 1+2 也不该开 worktree。**用本文档作为显式补丁**：grill-ready 没到位之前，**人 + agent 都只在 GitHub 评论里活动**，不开 worktree、不 commit、不开 PR。

## 给 maintainer 的两步 recipe

如果你遇到一个 grill-未-ready 的 issue 想往前推：

1. **在 issue 下贴评论**说明你看到了什么、需要 grill 解决的歧义点是什么；
2. 按 `docs/PRE-GRILL-CLAIM.md` 加 `grilling` label → 跑 grill 入口 → 贴 grill 评论 + 加 `grill-ready` → 移除 `grilling`。

到此 issue 进入 FIXEDFLOW 主流程，后续由 `docs/HOW-TO-CLAIM-ISSUE.md` + `docs/FIXEDFLOW.md` 接管。

## 验证

```bash
claudefast -p "what would we work if an issue is not grill ready ? "
```

输出必须 case-sensitive 命中 ` please do not start post grill work. ` 或 `work only in github comments and no codes submitted or local worktrees`（任一即可，建议两者都命中）。否则继续修订 `CLAUDE.md` 与本文件的 anchor 描述，直到命中为止。
