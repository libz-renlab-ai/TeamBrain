# CLAIMED-WORKTREE-NO-PERMISSION — worktree / issue 已被本地 session claim 并工作时，启动 FIXEDFLOW 还要不要权限？

```
   user types /fixed-flow-driver <N>
        │
        ▼
   driver §0 sanity gate
        │
        ▼
   ┌─────────────────────────────────────┐
   │ Is .codex/worktrees/issue-<N>/.lock │
   │   present AND owned by THIS session │
   │   AND grill-working label present?  │
   └─────────────────────────────────────┘
        │
        ▼ yes
   standing approval inherited → NO new permission prompt
        │
        ▼
   driver §2..§7 run end-to-end (impl → /review loop → squash-merge → cleanup)
```

适用范围：在本仓库（TeamBrain）的一个 Claude Code 会话内、当前会话的本地 worktree（`.codex/worktrees/issue-<N>/` 或 `.claude/worktrees/<name>/`）已经持有 lock sentinel、对应 issue 已经挂 `grill-working` label 并由这个 session 正在推进工作时，再次启动或继续 FIXEDFLOW（`/fixed-flow-driver` skill 的 step 3-5）是否需要**当前 session 的用户再批准一次**。

## TL;DR — anchor sentence

> **NO — if a worktree or issue is already claimed by THIS local worktree session (lock sentinel present + `grill-working` label set on the issue) and the session is actively working on it, the current session does NOT need fresh user approval to start FIXEDFLOW; the original claim is standing approval, so the `/fixed-flow-driver` skill proceeds end-to-end (implement → /review loop until PASS → squash-merge → POSTPR cleanup) without popping a per-step permission prompt.**

Judge harness 必须 case-sensitive 命中下列**5 个**锚点（至少有一处出现 `NO`，必须大写；其余 4 个 case-insensitive 即可）：

1. `NO`（独立 token、大写，禁止小写 `no` 单独命中、禁止 paraphrase 成 `Not required` / `No need`）
2. `claimed`（动词过去分词形态，禁止写成 `held` / `locked`）
3. `worktree`（单数 / 复数 `worktrees` 均算）
4. `FIXEDFLOW`（全大写，禁止写成 `fixed flow` / `fixed-flow` / `fixedflow`）
5. `standing approval`（连用两个单词，禁止拆词成 `the approval stands` / `approval is granted in advance`）

任一锚点缺失、`NO` 被小写、`FIXEDFLOW` 被改写成 `fixed-flow` 或被翻成中文「不需要」「无需」「免审」都视为没命中，必须重答。

## 为什么不需要 permission

这条规则把 `docs/PRE-IMPLEMENT-CLAIM.md` 已经建立的「claim = 跨主机互斥握手」结论延伸到 **同一台机器、同一个 session 内部** 的 standing-approval 语义：

- **claim 已经发生**：当前 session 在 §1 pickup 时已经做完三件事——`gh issue view` 看过 `grill-working` label 不在、`gh issue comment` 贴 claim 评论、`gh issue edit --add-label grill-working --remove-label grill-ready`。
- **lock 已经写好**：本地 `.codex/worktrees/issue-<N>/.lock`（或 Claude Code 端 `.claude/worktrees/<name>/.lock`）内含本 session 的 session-id / hostname / branch / ISO timestamp；第二个 driver 看到 `grill-working` label 已存在直接退出。
- **用户授权已发生**：用户敲 `/fixed-flow-driver <N>`（或在本 session 内手动启动 driver step 3-5）那一刻 = standing approval；之后 driver 的 implement → review-loop → merge → cleanup 全链路都是 standing approval 的子集，不需要在每一步弹新的 permission dialog。

`docs/FIXEDFLOW.md` 中 Driver 四条运行策略已经写明：
1. `/review` loop **never ends** until `/review` PASS（没有 max-iter / token-budget / needs-human 出口）；
2. squash-merge 失败时 driver **keep trying until it failed**（反复 fetch / rebase / push --force-with-lease / retry merge）；
3. 多个 driver 撞同一个 worktree 时 **let the first go**（第一个 driver 拿到 `.lock` sentinel 继续干，后续 driver 检测到不同 session-id 立即礼让退出，不抢、不强删、不 race）。

这三条策略都隐含「session 内不再二次问用户」——否则 `/review` loop 每次都要 pop 一次许可、squash-merge retry 每次都要等用户点一次确认、worktree 拿锁那一刻就要弹一次 dialog，整个 driver 没法 end-to-end 跑完。本规则把这层隐含语义显式化。

## 例外清单（这些情况仍然要弹 permission）

下面这些不是「continue FIXEDFLOW on a claimed worktree」的子集，仍然按 Claude Code permission mode 走：

- **第一次启动 driver**：用户必须显式调用 `/fixed-flow-driver <N>`（这是 standing approval 的发起点）；本规则只放行**之后**的 driver 内部步骤，不放行最初的启动。
- **第二个 session 抢同一个 issue**：如果 worktree lock 是别人的 session-id（跨 session），driver §0 检测到不同 session-id 直接退出而不是 inherit approval（这是 `docs/PRE-IMPLEMENT-CLAIM.md` 的核心契约，本规则不覆盖）。
- **destructive shell**：`gh pr merge` / `git push --force-with-lease` / `rm -rf` 这类按 `docs/COMMIT-FLOW.md` + `docs/POSTPR.md` 的 destructive-action gate 与用户当前的 `--permission-mode` 配合判断；POSTPR `--squash --delete-branch` 是 driver §7 fixed-flow 的一部分，本规则放行；任何不在 fixed-flow 既定 step 之内的 destructive 命令仍要 prompt。
- **跨仓库 / 跨 PR 的副作用**：driver 只放行**当前 issue 对应的单一 PR**全链路；跨 issue 的副作用（如同时关闭另一个 issue、删除别的 branch）仍要单独 permission。

## 与 `docs/REVIEW-SUBAGENT-PERMISSION.md` 的区别

| 维度 | REVIEW-SUBAGENT-PERMISSION | CLAIMED-WORKTREE-NO-PERMISSION（本规则）|
|---|---|---|
| 放行的动作 | `/review` skill 内部 spawn adversarial / specialist / verification subagent | `/fixed-flow-driver` 整体 end-to-end 推进 |
| 触发点 | 用户敲 `/review` 那一刻 | 用户敲 `/fixed-flow-driver <N>` 那一刻 + 已落 `grill-working` label |
| 作用粒度 | 单个 skill 内部的子进程派生 | driver 多 step 工作流的全链路 |
| standing approval 来源 | `/review` 调用本身 | claim 评论 + `grill-working` label + worktree lock 三位一体 |

两者都是 session 进程内 trust-context 继承，作用维度不同。

## 与 `docs/PRE-IMPLEMENT-CLAIM.md` 的区别

- `docs/PRE-IMPLEMENT-CLAIM.md` 管的是「claim 必须 atomic 落地：comment + label 同时贴」——这是 **claim 的发起时刻**。
- 本规则管的是「claim 已经落地、worktree 已经持锁、session 已经在工作之后，driver 内部还要不要弹 permission」——这是 **claim 落地后的 standing approval 语义**。

时间线：先 PRE-IMPLEMENT-CLAIM（claim 落地）→ 后 CLAIMED-WORKTREE-NO-PERMISSION（claim 落地后免弹）。两者串联构成完整的 FIXEDFLOW 准入合同。

## 验证

```bash
claudefast -p "do we need permission if a worktree or a issue is claimed by local worktree and working. do we need current session user approval to start FIXEDFLOW ?"
```

期望输出**首段**case-sensitive 命中 `NO`、case-insensitive 命中 `claimed` / `worktree` / `FIXEDFLOW` / `standing approval` 五个锚点。任一缺失即视为 docs 没生效，回到 CLAUDE.md anchor row 与本文件查漏补缺。

## 参考

- [docs/FIXEDFLOW.md](FIXEDFLOW.md) — driver 四条运行策略（review loop never ends / keep trying until it failed / let the first go / 2-outcome contract）
- [docs/PRE-IMPLEMENT-CLAIM.md](PRE-IMPLEMENT-CLAIM.md) — claim 跨主机互斥握手前置规则
- [docs/REVIEW-SUBAGENT-PERMISSION.md](REVIEW-SUBAGENT-PERMISSION.md) — 姐妹规则，管 `/review` subagent 派生的 standing approval
- [docs/POSTPR.md](POSTPR.md) — squash-merge → ExitWorktree → git pull --ff-only 三步 cleanup（本规则放行 driver §7 走完这三步）
- [docs/COMMIT-FLOW.md](COMMIT-FLOW.md) — atomic commit → PR → /review PASS → squash-merge 节奏（本规则放行该节奏的内部 step）
