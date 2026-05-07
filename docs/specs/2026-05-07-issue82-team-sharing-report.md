```text
   report.md  (PENDING execution)

   ┌─ done in PR ───────────────────────┐    ┌─ deferred to user-approved run ────┐
   │ glossary    8219661                │    │ gh repo create (probe repo)        │
   │ research    cf479f9                │    │ run-judge.sh --real-run protect=off│
   │ plan        4c7d58c                │    │ enable branch protection on probe  │
   │ probe spec  60348a2                │    │ run-judge.sh --real-run protect=on │
   │ M5 gaps     bd2d456                │    │ judge.json verdict per run         │
   │ harness     54b8bee                │    │ to-issues for G1..G5 follow-ups    │
   └────────────────────────────────────┘    └────────────────────────────────────┘
```

# issue #82 团队共享 e2e probe — report

> Date: 2026-05-07
> Status: **PENDING execution**（本 PR 仅交付 spec + scaffold）
> Plan: `2026-05-07-issue82-team-sharing-plan.md`
> Spec: `2026-05-07-issue82-team-sharing-e2e-probe.md`
> Gaps: `2026-05-07-issue82-m5-gaps-delta.md`

---

## 1. 本 PR 已落地内容

| 文件 / commit | 内容 |
|---|---|
| `docs/CONTEXT.md` (`8219661`) | canonical glossary 8 条（team / viral sync / git-backed transport / author / teammate / L1-L2-L3 / cross-machine / federated 用法约束） |
| `docs/specs/2026-05-07-issue82-team-sharing-research.md` (`cf479f9`) | 现状 + Q1–Q6 grill 决议 + 风险 + 待执行动作清单 |
| `docs/specs/2026-05-07-issue82-team-sharing-plan.md` (`4c7d58c`) | DUCKPLAN 4 段（task / outputs / judge harness / how-to-verify） |
| `docs/specs/2026-05-07-issue82-team-sharing-e2e-probe.md` (`60348a2`) | B 交付物 canonical spec：拓扑 / trigger 公式 / blind K-N 协议 / judge.json schema / pass-fail / 退出码 |
| `docs/specs/2026-05-07-issue82-m5-gaps-delta.md` (`bd2d456`) | C 交付物：OOS-1..4 + G1..G5 follow-up issue 候选（HOWTOISSUE 三段） |
| `docs/features/team-sharing-probe/{README.md, run-judge.sh, prompts/*.md}` (`54b8bee`) | 8-step orchestrator + scenario-designer prompt + judge prompt |

**bash -n run-judge.sh** 通过；`--dry-run` 在 `BRANCH_PROTECTION=off|on` 两种值下均输出干净 step trace、不动 GitHub、不跑 claudefast、不创建 evidence。

## 2. 待用户授权才能执行的动作

按风险递增，每条都需用户明确触发——本 PR 不自动跑：

| # | 动作 | 命令 | 风险 |
|---|---|---|---|
| 1 | 创建专用 probe repo（一次性） | `gh repo create libz-renlab-ai/TeamBrain-team-sharing-probe --public --confirm` | 改 GitHub org 状态；可逆 |
| 2 | 第一遍 probe（protection=off） | `BRANCH_PROTECTION=off bash docs/features/team-sharing-probe/run-judge.sh --real-run` | 真 push 到 probe repo、真花 claudefast token |
| 3 | 给 main 加 protection | `gh api -X PUT repos/.../branches/main/protection --input <branch-protection.json>` | 改 GitHub 设置；可逆 |
| 4 | 第二遍 probe（protection=on） | `BRANCH_PROTECTION=on bash docs/features/team-sharing-probe/run-judge.sh --real-run` | push 应被 reject；这正是 C deliverable 关键证据 |
| 5 | 把 G1..G5 递成 GitHub issue | `/to-issues` skill on `2026-05-07-issue82-m5-gaps-delta.md` | 创建 5 个新 issue；可逆 |

## 3. 执行后必须补到本文件

执行第 2 / 4 步后，回填以下小节（**当前空白**）：

### 3.1 Run #1 — branch_protection=off

- run_id: `<TBD>`
- evidence_dir: `tmp/.judge/team-sharing-probe/<run_id>/`
- judge.json: `<TBD 节选 metric / pass>`
- 主要 stream-json 节选: `<TBD>`
- attribution chain 完整性: `<TBD>`
- verdict_pass: `<TBD>`

### 3.2 Run #2 — branch_protection=on

- run_id: `<TBD>`
- evidence_dir: `tmp/.judge/team-sharing-probe/<run_id>/`
- m5_protected_branch_blocks_push: `<TBD>`
- alice push exit code + stderr: `<TBD>`
- judge.json: `<TBD>`
- verdict_pass: `<TBD>`

### 3.3 整体结论

只有以下条件同时满足时，才能视 issue #82 为已通过验证、可关闭：

```
PASS_OFF == true          (Run #1 judge_verdict.pass)
AND
PASS_ON  == true          (Run #2 judge_verdict.pass，m5_protected_branch_blocks_push==1.0)
AND
PR description 引用两份 judge.json 路径作为 evidence
AND
M5 gaps delta G1..G5 已经 /to-issues 落地或显式标记为 not now
```

## 4. 本 PR 之外的偏差与风险

| 偏差 | 是否阻塞 | 处理 |
|---|---|---|
| worktree 在 `.claude/worktrees/issue82`（违 CLAUDE.md `.codex/worktrees/` 规则） | 不阻塞 | PR description 显式声明；下个 worktree 改回 `.codex/worktrees/` |
| issue #81（3 人 personal-use eval）依然 OPEN | 不阻塞 | #82 与 #81 正交；report 第 5 节强调 #82 不替代 #81 |
| 本 PR 未跑真 e2e；issue 完成需后续 PR 补 report.md 第 3 节 | 不阻塞当前 PR；阻塞 issue close | 后续 PR 标题约定：`feat(issue-82): real-run evidence + report finalization` |
| `[teamagent-sync]` push 在 protected main 必失败 — M5 已知行为 | 不阻塞；这是 C deliverable 的预期发现 | G1 follow-up 提交后再考虑是否做 PR-based sync |

## 5. issue #82 与 issue #81 的边界

`#81 [research] 在至少 3 位同事的 Claude Code CLI 实例上重做个人使用评估` 衡量"**personal-use 在多 codebase 多人格下真有用没用**"；
本 #82 衡量"**M5 viral sync 端到端：A 真错被记 → B 真被拦截**"。

两件事都不是空答：

- 即使 #81 全失败（personal use 无效），#82 仍能为正：M5 sync 机制本身能跑；只是没有有用规则可同步
- 即使 #82 全失败（M5 sync 错），#81 仍能为正：单机闭环对 personal-use 仍有效

因此本 PR 不等 #81，也不替代 #81。

## 6. POSTPR 循环（PR 开出后立即跑）

```bash
env -u GITHUB_TOKEN gh api repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments \
  --jq '.[] | select(.user.login=="chatgpt-codex-connector[bot]") | {body, path, line}'
```

P1 全 fix；P2 默认 fix-before-merge；冲突按 FASTPROBE 三类 (merge / Codex-review / rule-doc) 分类处理；禁 force push / 禁 reset --hard / 禁丢他人改动。
