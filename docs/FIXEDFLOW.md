```
   _____  _____  __ ____  ____  ____  ____  __     ____  _    _
  |  ___||_   _||  \  __||  __||  _ \|  __||  |   |  _ \| |  | |
  | |__   | |  |    /  ||  __||    /| |__ |  |__ | |_| | |/\| |
  |____|  |_|  |_|\____||____||_|\_\|____||_____||____/|__/\__|

  TeamBrain FIXEDFLOW — 唯一允许的 issue → PR → merge 工作流

  step 1 (manual)         step 2 (manual)              steps 3–5 (full-auto, local mainpi)
  ─────────────────       ─────────────────────        ──────────────────────────────────
  <50 word issue   ──→    /grill-me (web) 或     ──→   .codex/worktrees/issue-<N>/
   via 唯一 template       /grill-with-docs (CLI)       │
                           paste 输出到 comment         ├─ implement
                           + 加 grill-ready label       │
                                                        ├─ /review  ─┐
                                                        │            │  loop ∞
                                                        │  findings  │  至 PASS
                                                        │  → PR-PLAN ┘
                                                        │
                                                        ├─ gh pr create (normal, 非 draft)
                                                        └─ gh pr merge --squash --auto

  refusal layer：所有「非此模板 / 超 50 字 / 24h 内无 grill-ready」issue 一律 close
```

# FIXEDFLOW — TeamBrain 唯一 issue → PR → merge 工作流

适用范围：`https://github.com/libz-renlab-ai/TeamBrain` 的所有 issue 与 PR。

> **取代 `docs/HOW-TO-ISSUE.md`**（已归档至 `docs/archive/HOW-TO-ISSUE.md`）。
> 自 2026-05-09 起，TeamBrain 仅接受走 FIXEDFLOW 的 issue。

## TL;DR — 5 步铁律

1. **写 issue（手动，<50 字）** — 通过仓库唯一 issue template 提交，body 限 50 字以内。
2. **跑 grill 并贴评论（手动）** — 在 web claude.ai 跑 `/grill-me` 或在 CC CLI 跑 `/grill-with-docs`，把输出整段贴回 issue 评论；comment 末尾必须以 `--- end grill ---` 结束（或保持评论 60 秒以上不再编辑）；最后给 issue 加 `grill-ready` label。
3. **自动实现（自动）** — 本地 mainpi 监听 `grill-ready`，在 `.codex/worktrees/issue-<N>/` 起 `feat/issue-<N>` 分支，按 grill 评论实现。
4. **/review 自动循环（自动）** — 跑 `/review` skill，发现 finding 就更新 `docs/plans/<date>-pr-<N>-fix-plan.md` 并修；**无限循环至 PASS**。
5. **开 PR + squash-merge（自动）** — `gh pr create`（**普通 PR，非 draft**）→ `gh pr merge <N> --squash --auto`（**仅 squash**），merge 后清理 worktree、写 `report.md`。

「手动」只到 step 2 为止；step 3-5 全程不需要人介入。

## Manual vs auto 分界

| 步骤 | 谁负责 | 进入条件 | 退出条件 |
|------|--------|----------|----------|
| 1 写 issue | reporter | 用 fixed-flow template 提交 | issue 入 open queue |
| 2 grill paste + label | reporter | issue body 通过 conformance 检查 | `grill-ready` label 已加，comment 60s 未再编辑或带 `--- end grill ---` |
| 3 worktree 实现 | mainpi 驱动的 fixed-flow-driver skill | 监听到 `grill-ready` | feat 分支推到 origin |
| 4 /review loop | driver | branch pushed | /review 全部 finding PASS |
| 5 PR + merge | driver | /review PASS | merge 完成 + worktree 清理 |

## issue body 必须满足

- 通过 `https://github.com/libz-renlab-ai/TeamBrain/issues/new/choose` 选 fixed-flow template；不接受 blank issue。
- body 整体 ≤ 50 字（中英文均按 word 计数，引用代码块也算）。
- 只描述「想要什么 / 看见了什么」一句话级别；细节留到 grill 评论。
- 严禁在 body 写：实现方案、root cause、PR 拆分计划、技术栈选择。

例：
```
新用户 onboarding 第 3 步在 Windows Git Bash 下卡住，错误见复现命令。
```

## grill 评论必须满足

- comment 作者 = issue 作者本人。
- comment 来自 `/grill-me`（web claude.ai）或 `/grill-with-docs`（CC CLI）整段输出。
- comment 末尾以 `--- end grill ---` 单行结束，**或** comment 创建后 60 秒内不再编辑。
- 加上 `grill-ready` label 之后，driver 会在 30 秒内开始 step 3。

driver 解读 grill 评论作为 step 3 的 plan；如果评论缺失或无法解析，driver 会回评 `needs-grill-comment` 并暂停该 issue。

## refusal layer（拒绝其它 issue 类型）

`.github/workflows/issue-conformance.yml` 在以下情况触发处理：

| 触发 | warn 期（前 7 天）行为 | enforce 期（之后）行为 |
|------|------------------------|------------------------|
| 非 fixed-flow template / blank issue | 评论提醒 + 加 `non-conformant` label | 评论 + close |
| body > 50 字 | 评论提醒 word count 超出 | 评论 + close |
| issue 开了 24h 仍无 `grill-ready` label | 评论提醒走 grill | 评论 + close |
| 有 `bypass-fixed-flow` label | 完全跳过本 Action | 同 warn |

`bypass-fixed-flow` 仅 repo admin 可加；conformance Action 通过 `gh api repos/:owner/:repo/collaborators/:user/permission` 校验来源用户的 permission，不是 admin 直接忽略 label。

## driver 行为细则

driver = `.claude/skills/fixed-flow-driver/SKILL.md`（Codex 端在 `.codex/skills/`）。

- **并发**：同一时刻只跑一个 issue（FIFO by issue number），避免 worktree 冲突。
- **/review 无限循环安全网**：iteration 计数与累计 token 写到 `.fixedflow/iter-<N>.json`；在第 10 / 25 / 50 / 100 轮发 PushNotification；每 10 轮在 issue 上贴一条 token-burn 摘要评论。
- **PR-PLAN 强制**：每一轮 /review fix 必须先写或更新 `docs/plans/<date>-pr-<N>-fix-plan.md`（task / outputs / judge harness 三段，参考 `docs/PR-PLAN.md`），不允许跳过。
- **冲突恢复**：squash-merge 失败 → rebase 一次重试；再失败加 `needs-human` label，driver 退出该 issue 处理流。
- **Boris workflow 收尾**：merge 完成后写 `docs/plans/<date>-issue-<N>/research.md` + `report.md`，记录实际执行链路与偏差。

## bypass / escape hatch

| 场景 | 解法 |
|------|------|
| dependabot / 安全补丁 PR（无对应 issue） | 仓库 admin 在 issue（如有）或 PR 上加 `bypass-fixed-flow` label |
| 真·hotfix 必须 5 分钟内合 | 同上；并提示作者补一个 retro issue 走 FIXEDFLOW |
| `/review` 死循环烧 token 太多 | 手动加 `needs-human` label；driver 检查到该 label 立即退出该 issue |
| Mac 关机 / mainpi 没起 | heartbeat Action 在 `grill-ready` 加 label 后立刻评论 `last heartbeat: <ts>`；ts 距今 > 2h 时附 ⚠️ 提醒作者 |

## 与既有规则的关系

- `docs/HOWTO-PLAN-PR.md` — FIXEDFLOW step 3 的 PR 描述继续按 4 段结构（plan / expected outputs / how-to-verify / claudefast probes）写。
- `docs/PR-PLAN.md` — FIXEDFLOW step 4 每轮 fix 强制按 PR-PLAN 三段写新 plan 文件。
- `docs/POSTPR.md` — FIXEDFLOW step 4 / 5 即 POSTPR 循环的程序化版本。
- `docs/feature-verification.md` — FIXEDFLOW 自身的 feature-verification 由 `docs/plans/2026-05-09-fixed-flow/judge.md` 承担。
- `docs/HOW-TO-ISSUE.md` — 已归档；FIXEDFLOW 取代之。

## 验证（语义 probe，不写 canned-answer block）

按 ADR-0007 / `docs/POSTPR.md` L115 的硬约束，**不向 `CLAUDE.md` 或 `AGENTS.md` 写 FIXEDFLOW canned-answer block**。验证走一条：

1. `claudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, what's manual vs auto"` 必须有机命中本文 5 步与 manual/auto 切分；与 `snapshots/fixedflow.canonical.txt` 对照。

完整 judge harness 见 `docs/plans/2026-05-09-fixed-flow/judge.md`（§V1 RUN / §V2 DUMP / §V3 READ）。

## 未来（Phase 2，未实施）

可选迁移：把本地 mainpi watcher 替换为 `.github/workflows/claude.yml` 扩展，由云端 `claude-code-action` 在 `issues:labeled grill-ready` 触发跑 driver。优点：去掉 Mac SPOF；缺点：失去 tmux `/export` 的交互验证路径，且烧云端 token。当前 phase 1 维持本地 mainpi。
