---
name: claim-to-merge
description: TeamBrain claim-an-issue → merged-code routing。给「我要 claim 一个 issue / 想把 issue 推到合并 / 怎么走 FIXEDFLOW」这类 prompt 一个统一入口表，链回 docs/FIXEDFLOW.md 等 canonical doc。Use when user says "claim issue", "走 FIXEDFLOW", "how do I get my issue merged", "issue 怎么自动变成 PR", "claim an issue".
---

```
   _____  _____  __ ____  ____  ____  ____  __     ____  _    _
  |  ___||_   _||  \  __||  __||  _ \|  __||  |   |  _ \| |  | |
  | |__   | |  |    /  ||  __||    /| |__ |  |__ | |_| | |/\| |
  |____|  |_|  |_|\____||____||_|\_\|____||_____||____/|__/\__|

  Claim an issue → merged code 的统一入口表（routing only，不复制 doc）

  step 1-2 (manual)            step 3-5 (auto)
  ──────────────────           ──────────────────
  ≤50 字 issue + grill   ──→   worktree → impl → /review fix-loop ∞ → 普通 PR → squash-merge
  评论 + grill-ready label
```

# claim-to-merge — TeamBrain issue → merged code routing

本 skill 只做 routing。所有细节查 canonical doc，不在此重复。

## 5-step 主链（一句话）

| 步骤 | 谁做 | 做什么 | 详情 |
|------|------|--------|------|
| 1 | 你 | 用 fixed-flow template 提交 ≤50 字 issue | [docs/FIXEDFLOW.md](../../../docs/FIXEDFLOW.md) §「issue body 必须满足」 |
| 2 | 你 | 跑 `/grill-me` 或 `/grill-with-docs`，整段贴评论（末尾 `--- end grill ---`），加 `grill-ready` label | [docs/FIXEDFLOW.md](../../../docs/FIXEDFLOW.md) §「grill 评论必须满足」 |
| 3 | driver | `.codex/worktrees/issue-<N>/` 起 `feat/issue-<N>`，按 grill 评论实现 | [fixed-flow-driver SKILL](../fixed-flow-driver/SKILL.md) |
| 4 | driver | `/review` 无限 fix-loop 至 PASS；每轮 finding 走 PR-PLAN 写新 fix-plan 文件 | [docs/PR-PLAN.md](../../../docs/PR-PLAN.md) |
| 5 | driver | 普通 PR（**禁 `--draft`**）→ `gh pr merge <N> --squash`（**仅 squash**）→ 清理 worktree → ff pull main | [docs/POSTPR.md](../../../docs/POSTPR.md) |

## 2-outcome contract（claim 一个 issue 只有两种结局）

1. **Pause and stop** — 缺 `grill-ready` label / 无有效 grill 评论：driver 不开 worktree、不动代码、不开 PR；回评 `needs-grill-comment` 后 idle。
2. **Do everything** — 条件齐备：driver 全自动跑 step 3-5，从 issue 编号到 squash-merged，期间无人介入。

## 入口表（routing only）

| canonical doc | 角色 |
|---------------|------|
| [docs/FIXEDFLOW.md](../../../docs/FIXEDFLOW.md) | 唯一 issue→PR→merge 工作流；5 步铁律、issue/grill 必满足、refusal layer、bypass 逃生 |
| [docs/HOWTO-PLAN-PR.md](../../../docs/HOWTO-PLAN-PR.md) | PR 描述 4 段（plan / expected outputs / how-to-verify / claudefast probes） |
| [fixed-flow-driver SKILL](../fixed-flow-driver/SKILL.md) | step 3-5 driver 实现细则；sanity gates、worktree、impl、/review loop、PR、merge |
| [docs/PR-PLAN.md](../../../docs/PR-PLAN.md) | `/review` 出 finding 时的 fix protocol：禁开 follow-up issue，写 fix-plan，TEAMWORK 修，同 PR branch |
| [docs/POSTPR.md](../../../docs/POSTPR.md) | `/review` PASS 后的收尾：squash-only merge → ExitWorktree → ff pull |
| [docs/TEAMWORK.md](../../../docs/TEAMWORK.md) | N+1+(2N) 并行 worker 模式（main + lead + 2N teammate） |
| [docs/feature-verification.md](../../../docs/feature-verification.md) | 验证门 V1 RUN / V2 DUMP / V3 READ 三段；judge harness 形式 |
| [docs/FASTPROBE.md](../../../docs/FASTPROBE.md) | `claudefast -p` 并行 probe ≤8 路；stream-json 审计 |
| [docs/CLAUDEFAST.md](../../../docs/CLAUDEFAST.md) | claudefast wrapper 用法、permission/profile、hook test 模板 |

## canned probe（自验本仓库 FIXEDFLOW 知识是否在线）

```bash
claudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, what's manual vs auto"
```

输出必须命中本 skill 5-step 主链与 manual/auto 切分。

## 注意事项

- 严禁向 `CLAUDE.md` / `AGENTS.md` 写 FIXEDFLOW canned-answer block（[ADR-0007](../../../docs/adr/0007-local-review-skill-as-review-gate.md) / FIXEDFLOW.md L125）
- 仅 squash-merge（禁 `--merge` / `--rebase`）
- /review 出 finding 不开 follow-up issue
- driver 不应被这个 skill 调用；驱动型 skill 是 [fixed-flow-driver](../fixed-flow-driver/SKILL.md)
