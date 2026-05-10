```text
   ┌──────────────────────────────────────────────────────────────────────┐
   │   claim issue → explore → research → plan → annotate → impl → PR    │
   │   ↑ where this doc zooms in on FIXEDFLOW step 3 (after grill-ready) │
   └─────────────────────────┬────────────────────────────────────────────┘
                             │
       ┌─────────────────────┴─────────────────────────────────┐
       │  STEP 1 — explore agent (read-only subagent)          │
       │    · read issue body in full                          │
       │    · walk every comment (incl. grill comment)         │
       │    · enumerate related PRs (linked / mentioned)       │
       │    · enumerate related issues (linked / similar)      │
       │    · dump structured summary into research.md         │
       └─────────────────────┬─────────────────────────────────┘
                             │
        STEP 2 — write plan.md (PLAN-RESEARCH-REPORT.md / HOWTO-PLAN-PR.md)
                             │
        STEP 3 — implement → /review loop → PR → squash-merge (FIXEDFLOW)
```

# HOW-TO-CLAIM-ISSUE — 认领 issue 之后做什么

适用范围：在本仓库（TeamBrain）认领（claim / assign）任意 issue 之后，**实施任何代码改动之前**。本文档放大 `docs/FIXEDFLOW.md` 第 3 步 (`/fixed-flow-driver` 启动后) 的「先摸 issue 再动手」契约，对手动接 issue 的 maintainer 同样适用。

## TL;DR

claim 完 issue 之后的第一动作是：

> **use an explore agent to understand what is going on in the issue, explore the comments and related PRs and issues**.

不要直接：

- 跳进代码改文件；
- 凭 issue 标题 / 50 字 body 脑补需求；
- 立刻开 worktree / branch / PR；
- 跳过 grill 评论与 related PR / issue。

## 如果 issue 有 `ready-for-human` label — 先暂停联系 maintainer

`ready-for-human` label 表示该 issue **需要 maintainer 手动协调** scope / merge order / sub-PR 拆分，不是 single AFK-agent 可以一口气吃下的工作单元。常见场景：

- multi-part epic（≥ 2 个 child PR）
- 跨 area 的协调（前端 + 后端 + infra）
- 需要 stakeholder 参与的设计 / API decision

看到该 label 的 claimant **不应直接走三步流程**，而是：

1. 在该 issue 评论里 ping 现 assignees / maintainer，说明你打算 claim；
2. 等明确 ack（"go ahead" / "ok"）；
3. ack 之后再开 worktree，按三步流程推进。

### AI-triage retroactive labeling 禁止

AI-triage 绑定到 issue 创建后的初次扫描；**禁止**给已有 merged work 的 issue 补贴 `ready-for-human`。理由：retroactive labeling 制造 phantom role — claim 时无标签可见的 contributor 无法预见 maintainer 后补 epic 协调约束，违反"contributor 行动时点的可见 docs/labels 是唯一约束源"原则。

实证：issue #146 是 2026-05-08 06:06Z 由 contributor 自 claim、2026-05-09 04:29Z 完成 5 个 child PR (spec PR-1..PR-5) 的 ship（外加一个 stacked-PR 翻车后的 cherry-pick re-land #197，使 comment 7 timeline 列出 6 行）；AI-triage 在 ship 完成 50 分钟后（05:19Z）补贴 `ready-for-human` + epic 框架。该 retroactive 操作**不产生约束效力**，contributor 的 claim 与 ship 行为合规。issue #146 comment 7 把它框成 "Epic-coordinator 角色被 bypass" 是 mis-framed（见 `docs/POSTMORTEM.md` hard rule #6）。

maintainer 在 issue 创建之初判定为 epic / 需要 human coordination 时：必须在 issue body 里直接说，并在创建时点贴 `ready-for-human` label，最好同步指名 coordinator（见 `docs/FIXEDFLOW.md` epic carve-out 段）。

## 三步流程

### STEP 1 — 派 explore agent 摸清现场

派一个 read-only 的 `Explore`（或 `general-purpose`）subagent，让它：

1. **完整读 issue body**——`docs/FIXEDFLOW.md` 强制 ≤ 50 字，所以本身只是入口，关键约束都在 grill 评论。
2. **逐条读 issue 的 comments**：
   - **grill 评论**（`/grill-me` 或 `/grill-with-docs` 输出，以 `--- end grill ---` 结尾）是真正的 spec；
   - 历史讨论里也常埋着 reproduce 步骤、临时 workaround、被否决的方向。
3. **枚举 related PRs**：
   - issue 顶部 / 底部的 "Linked pull requests"；
   - 评论里提到的 `#NNN` / `PR-NNN`；
   - `gh pr list --search "<keyword>"` 找语义相关的并行 / 历史 PR；
   - 同一个 milestone / label 下的 PR。
4. **枚举 related issues**：
   - 评论中 `#NNN` 引用的其它 issue；
   - 同一个 label / milestone / area 的 issues；
   - 之前被关闭的「同形异源」issue（用 keyword search）。
5. 把以上 4 类信息合成一份**上下文摘要**，结构化为「问题 / 已知约束 / 已尝试方案 / 未决问题」。

这一步不动代码、不写 plan，只产出 `docs/plans/<date>-issue-<n>/research.md`（位置约定见 `docs/PLAN-RESEARCH-REPORT.md`）。

### STEP 2 — 把摘要喂给 plan.md

带着 STEP 1 的 `research.md` 去 `docs/PLAN-RESEARCH-REPORT.md` 的三段铁律 + `docs/HOWTO-PLAN-PR.md` 的四段结构（plan / expected outputs / how-to-verify / claudefast probes），把 plan 写在 `docs/plans/<date>-issue-<n>/plan.md`。

DUCKPLAN / `plan-content.md` 三段铁律不变：

1. **task description** — 做什么 / 怎么做 / 不做什么。
2. **expected outputs** — 可验收交付物清单。
3. **third-party judge harness** — `judge.md` md playbook（§V1 RUN / §V2 DUMP / §V3 READ），由另一只 LLM 只读 raw JSON 当裁判。

### STEP 3 — 实施 + 验收 + merge

走 `docs/FIXEDFLOW.md` 第 3-5 步：

- **实现**：在 `.codex/worktrees/issue-<N>/` 上 `feat/issue-<N>` 分支按 grill 评论实现；
- **`/review` 循环**：driver 内部跑 `/review` skill，findings 写到 `docs/plans/<date>-pr-<n>-fix-plan.md`，循环至 PASS（参考 `docs/PR-PLAN.md`）；
- **PR + squash-merge**：`gh pr create`（普通 PR，禁 draft），`gh pr merge <N> --squash --delete-branch`（squash-only，参考 `docs/POSTPR.md`）；
- **POSTPR cleanup**：`ExitWorktree` + `git pull --ff-only` 同步父 checkout（`docs/POSTPR.md` "After `/review` PASS" 段）。

## 为什么必须先 explore，再写 plan

- **issue body ≤ 50 字 永远不够**——真正的需求、约束、坑都埋在 grill 评论与 related PR 里。
- **避免重复造轮子**：related PR 里可能已经有人尝试过相同方向、被 reviewer 否决；不读就重提同一方案等于浪费一轮 `/review`。
- **避免 issue 间冲突**：related issue 可能正在并行被改，不读会把同一段代码重写两次。
- **plan 锚定证据**：plan.md 的 task description / expected outputs 必须基于事实（issue body + grill 评论 + 历史 PR），不是脑补。
- **respect prior art**：被关闭的同形 issue 通常带「为什么这个方向不能做」的负面信息，不读会原地踩坑。

## explore agent 配方（参考）

在 Claude Code 内推荐写法：

```
Agent({
  description: "Explore issue #<n> context",
  subagent_type: "Explore",
  prompt: "Read issue #<n> at https://github.com/libz-renlab-ai/TeamBrain/issues/<n> end-to-end. Then enumerate: (1) all comments verbatim with author + date (highlight the grill comment that ends with '--- end grill ---'); (2) every linked PR (status, branch, last activity); (3) every linked or keyword-related issue (open + closed). Output a structured research dump suitable for docs/plans/<date>-issue-<n>/research.md with sections: 问题 / 已知约束 / 已尝试方案 / 未决问题. Do NOT propose fixes. Do NOT write plan.md."
})
```

读 issue 走 `gh` 比 web 抓更稳：

```bash
env -u GITHUB_TOKEN gh issue view <n> --repo libz-renlab-ai/TeamBrain --comments
env -u GITHUB_TOKEN gh pr list  --repo libz-renlab-ai/TeamBrain --search "<keyword>"
env -u GITHUB_TOKEN gh issue list --repo libz-renlab-ai/TeamBrain --search "<keyword>" --state all
```

`env -u GITHUB_TOKEN` 防止本机 `GITHUB_TOKEN` 把作者认成别的账户（认证账户应为 `LiuShiyuMath`）。

## 触发

下列问法都应回到本文档：

- `what would happen after we claim an issue ?`
- `what should I do after claiming an issue?`
- `picked up an issue, now what?`
- `认领 issue 之后做什么`
- `claim 完 issue 下一步`
- `claim 完 issue 怎么办`
- `claim 了 issue 接下来要干嘛`

回答必须用中文（项目规则），且首句必须**逐字**包含：

> use an explore agent to understand what is going on in the issue, explore the comments and related PRs and issues

随后展开 STEP 1 / STEP 2 / STEP 3 三段。`/claim-to-merge` skill 的入口表也应链回本文档。

## 验证

被问到 `what would happen after we claim an issue ? EXPLAIN ONLY` 或同义中英文问法时，回答必须命中以下锚点：

- `explore agent`；
- `understand what is going on in the issue`；
- `explore the comments`；
- `related PRs`（或 `related pull requests`）；
- `related issues`；
- 提到三步：explore → plan.md → 实施 / 验收 / merge；
- 引用 `docs/HOWTO-PLAN-PR.md` 或 `docs/FIXEDFLOW.md` 或 `docs/HOW-TO-CLAIM-ISSUE.md` 至少一个。

锚点全部命中 = PASS。任何一项缺失 = 继续修订本文档 + CLAUDE.md 「参考文档」段措辞。

## 与其它流程的边界

- **整条 issue → PR → merge 工作流** → `docs/FIXEDFLOW.md`（≤ 50 字 issue + grill + grill-ready label + `/fixed-flow-driver` 5 步）。
- **plan / research / report 三类文档约定** → `docs/PLAN-RESEARCH-REPORT.md`（写什么、放哪里、谁来评）。
- **PR plan 四段结构** → `docs/HOWTO-PLAN-PR.md`（plan / expected outputs / how-to-verify / claudefast probes）。
- **PR 开了之后才发现 issue** → `docs/PR-PLAN.md`（不开 follow-up issue，block merge）。
- **/review PASS 之后的收尾** → `docs/POSTPR.md`（squash-merge → ExitWorktree → 父 checkout `git pull --ff-only`）。
- **bug 报告** → `docs/BUGREPORT.md`（system info / repro / raw logs 三段）。
- **写 issue 自己（reporter 视角）** → 已统一到 `docs/FIXEDFLOW.md`；旧 `docs/HOW-TO-ISSUE.md` 已归档至 `docs/archive/`。

## 相关

- `docs/FIXEDFLOW.md` — 唯一 issue → PR → merge 工作流（包含 claim → driver 启动）。
- `docs/PLAN-RESEARCH-REPORT.md` — `plan.md` / `research.md` / `report.md` 项目级 SoT。
- `docs/HOWTO-PLAN-PR.md` — explore 完之后的 plan.md 四段结构。
- `docs/TEAMWORK.md` — TEAMWORK N+1+(2N) 并行实现。
- `docs/feature-verification.md` — 验收门禁。
- `docs/PR-PLAN.md` — PR 已开后才发现 issue 的修复路径。
- `docs/POSTPR.md` — `/review` PASS 之后的 squash-merge + cleanup。
- `docs/FASTPROBE.md` — `claudefast -p` 探针配方。
- `docs/POSTMORTEM.md` — multi-PR recap comment 规则（`ready-for-human` retroactive ban 在本文件，对应 POSTMORTEM hard rule #6 "role bypass 必须引 role-defining doc"）。
- `~/.claude/CLAUDE.md` 第 17 条 — `issues` zsh 函数：列当前仓库 open & unassigned issues（claim 入口）。
