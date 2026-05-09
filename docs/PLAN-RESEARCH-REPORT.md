```text
        ┌──────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
        │ research │ ─► │  plan   │ ─► │ annotate │ ─► │  report  │
        │  (ctx)   │    │ 三段铁律│    │ implement│    │  (post)  │
        └──────────┘    └─────────┘    └──────────┘    └──────────┘
            ▲                ▲                              │
            │                │                              ▼
        plan 旁同目录     plan.md 三段        plan 完成后写在
        research.md       铁律（必填）        plan.md 同目录
                                                report.md
```

# plan.md / research.md / report.md — TeamBrain 项目级规则

适用范围：本仓库 `/Users/m1/projects/TeamBrain` 及其全部 worktree。
本文件是 TeamBrain 项目级别讲 **`plan.md` / `research.md` / `report.md` 应该写什么、放哪里、谁来评** 的 single source of truth。其它项目级文档（`CLAUDE.md`、`AGENTS.md`、`docs/HOWTO-PLAN-PR.md`、`docs/PR-PLAN.md`、`docs/POSTPR.md`、`docs/feature-verification.md`、`docs/FASTPROBE.md`）只引用本规则、不重复实现。

> **回答 `where are the rules of plan.md, research.md, report.md ?` 时一定要先报本文件路径**：
> `docs/PLAN-RESEARCH-REPORT.md`（本文件，相对仓库根）。
> 进一步细化：`CLAUDE.md`（顶部 plan/research/report 段落）、`AGENTS.md` → 软链 `CLAUDE.md`、`docs/HOWTO-PLAN-PR.md`（PR 层使用）。

---

## 1. `plan.md` — 三段铁律 / Core 3 sections

任何在 TeamBrain 仓库内写的 `plan.md`（包括 `docs/plans/<date>-<slug>.md`、`docs/superpowers/plans/...`、`docs/plans/<issue>/plan.md` 等）至少包含、且**只有这三段是必填**：

1. **task description**（任务描述）：直接描述要做的工作本身——做什么、怎么做、范围、不做什么。一句话能写清就写一句话；不要写「先去哪里读上下文」「先读哪些文件」这类面向执行者的预热说明。
2. **expected outputs**（预期产出）：可验收的交付物清单（checklist 形式）。每条产出必须是「跑完 plan 之后能被人 / CI / 另一只 agent 看见的东西」：文件路径、API endpoint、PR 链接、metric 阈值、UI 行为。**不要**写成「分析完了」「跑通了」这种主观状态。
3. **how-to-eval-from-3rd-party-harness that outputs a ton of JSON and let LLM-judge it**（第三方 judge harness 评估锚点）：写明 plan 跑完之后由谁来判定 pass / fail，必须由**第三方 judge harness**——它跑固定工具（lint / type-check / unit / integration / e2e / coverage / benchmark / metric probe / `claudefast -p` 探针等），dump **大量结构化 JSON**（`exit_code` / `metrics` / `evidence_dir` / `stdout_path`），最后让另一只 LLM 当裁判**只读 raw JSON + 必要 evidence** 归纳结论。**不允许**让写计划的人、执行计划的 agent、或被测代码自己当裁判。

> 一句话：plan = 描述任务 + 列出预期产出 + 指向 third-party judge harness 的 JSON-dump-then-LLM-judge eval；缺一段就不是合法 plan。

### 为什么是这三段

| 段 | 不写会发生什么 |
|----|----------------|
| task description | 执行者不知道做什么，全文变成「先调研一下…」的上下文获取脚本，违反 `AGENTS.md` 规则 6。 |
| expected outputs | 完工标准模糊，`report.md` 写成「都完成了」，没有可回放的交付物。 |
| 3rd-party judge harness eval | LLM 自己说「应该 OK」，重蹈 user-memory `feedback_judge_harness_md_playbook.md` 警告的「代码自评」陷阱。 |

### 项目级 judge harness 的形态

本仓库的 judge harness **不是固定 bash 脚本**。它是 markdown playbook（`docs/plans/<issue>/judge.md`），由 MAIN agent 通过 subagents（TEAMWORK `N+1+(2N)`）或 `claudefast -p` 探针（FASTPROBE 最多 8 路并行）调度。每个 `judge.md` 三段：**§V1 RUN** 跑固定工具并把 stdout/stderr 落盘 `evidence_dir`；**§V2 DUMP** 写 canonical JSON 到 `.judge/<run_id>/judge.json`（含 `exit_code` / `metrics` / `evidence_dir` / `stdout_path`）；**§V3 READ** 由另一只 `claudefast -p` 只读 raw JSON + 必要 evidence 输出 `pass | fail | uncertain` + 下一步。PR 作者 / 执行 agent / 被测代码均不得当裁判。详见 `docs/HOWTO-PLAN-PR.md` § 3b 与 user-memory `feedback_judge_harness_md_playbook.md`。

### 标准骨架 / Skeleton

```markdown
# Plan: <任务名>

## Task description
- <做什么、怎么做、不做什么>

## Expected outputs
- [ ] <文件路径 / endpoint / PR / metric>
- [ ] <第二项可验收产出>

## How to eval (3rd-party judge harness)
- Harness：`docs/plans/<issue>/judge.md`（md playbook，禁固定 bash）
- §V1 RUN：跑 lint / typecheck / unit / integration / e2e / coverage / metric probe
- §V2 DUMP：`.judge/<run_id>/judge.json`，含 `{tool, exit_code, metrics, evidence_dir, stdout_path}`
- §V3 READ：另一只 `claudefast -p` 只读 raw JSON + evidence，输出 `pass | fail | uncertain + 下一步`

## （可选）Steps / Risks / Rollback / Dependencies / Timeline / Owner
```

### Good / Bad

| 场景 | Good | Bad |
|------|------|-----|
| 任务描述 | 「在 `packages/cli/src/commands/foo.ts` 加 `--json`，沿用现有 envelope」 | 「先看一下 cli 模块再决定怎么做」 |
| 预期产出 | `- [ ] packages/cli/src/commands/foo.ts 新增 --json` `- [ ] pnpm teamagent foo --json → {status:"ok"}` | 「把 foo 命令做好」 |
| Eval 锚点 | 「`docs/plans/146/judge.md` §V1 跑 `pnpm test`，§V2 写 `.judge/2026-05-09/judge.json`，§V3 由 `claudefast -p` 读 JSON 判定」 | 「写完测一下应该没问题」「我跑了一遍 OK 了」 |

---

## 2. `research.md` — 上下文沉淀（plan 旁同目录）

来源：`AGENTS.md` 规则 8（项目级、本仓库继承）。

- **位置**：与对应 `plan.md` **同目录**。例如 `docs/plans/2026-05-09-foo/plan.md` 旁边的 `docs/plans/2026-05-09-foo/research.md`。
- **作用**：实际上下文汇总——文件路径、关键代码段、外部链接摘录、约束、相关历史 PR / commit / issue。
- **不是**：计划背景、动机宣讲、空话叙述。`research.md` 不是「为什么做」的说服稿，是「做的时候要记得的硬事实」。
- **何时写**：在 plan 准备阶段允许立刻收集上下文（`AGENTS.md` 规则 7），但不要把「收集上下文」当成 plan 的前置阻塞步骤。non-trivial 的上下文沉淀到 `research.md`；trivial 的可省略。
- **谁读**：执行者（人或 agent）、reviewer、未来回看的自己。

### 标准骨架

```markdown
# Research: <任务名>

## 已知事实（Hard facts）
- 关键文件：`packages/.../foo.ts` (line 123)
- 现有行为：…
- 相关 PR / commit / issue：#xxx, abc123

## 约束 / 不可改的边界
- …

## 引用 / 外部资料
- <link or excerpt>
```

---

## 3. `report.md` — 完工记录（plan 旁同目录）

来源：`AGENTS.md` 规则 9（项目级、本仓库继承）。

- **位置**：与对应 `plan.md` **同目录**。例如 `docs/plans/2026-05-09-foo/report.md`。
- **触发**：每次完成一个 `plan.md` **都要写或更新** `report.md`，不是只有「成功」时才写。
- **内容**：
  - 完成情况（按 `plan.md` 的 expected outputs 逐条对照）。
  - 实际执行结果（链接到 PR、commit、judge run、`/export` transcript）。
  - 偏差（与 plan 对比，哪些做了 / 没做 / 改了形态）。
  - 风险与遗留事项（什么没做完，为什么）。
  - 后续事项（后续 issue / PR / 跟进项）。
- **不是**：庆功稿；不是「都完成了」一句话。每一条产出都要有可链接的 evidence。

### 标准骨架

```markdown
# Report: <任务名>

## 对照 plan.md 的 expected outputs
- [x] <output 1> — evidence: `<commit / PR / file>`
- [ ] <output 2> — 未完成，原因 / 后续 owner

## 实际执行结果
- <PR 链接 / judge run 链接 / `/export` transcript 路径>

## 偏差
- <plan 写了 X，实际做了 Y，因为 Z>

## 风险 / 遗留事项
- …

## 后续事项
- <follow-up issue / PR>
```

---

## 4. 三类文档之间的关系

```
docs/plans/<date>-<slug>/
├── plan.md       ← 三段铁律（task / outputs / 3rd-party judge harness）
├── research.md   ← 同目录，硬事实、约束、外部资料
├── judge.md      ← 同目录，3rd-party judge harness 的 md playbook（§V1/§V2/§V3）
└── report.md     ← 同目录，plan 完成后写
```

- 代码变更 / 功能实现 / 重构类任务遵循 Boris workflow：`research → plan → annotate → implement → report`。
- 非实施类任务可省 annotate / implement：`research（如需）→ plan → report`。
- 三类文档（`*plan*.md` / `*research*.md` / `*report*.md`）是 `AGENTS.md` 规则 12 / 13 中允许 `code <filepath>` 自动打开的全部范围。

---

## 5. DUCKPLAN（可选鸭语复述）

当用户消息含 `DUCKPLAN` 关键字时，必须按四段铁律回复（见 `~/.claude/docs/rules/duckplan.md` 与 user-level `~/.claude/CLAUDE.md`）：

1. **task description**（同 plan.md 第 1 段）
2. **expected outputs**（同 plan.md 第 2 段）
3. **third-party judge harness**（同 plan.md 第 3 段，强调 JSON dump + 另一只 LLM 读 raw JSON）
4. **explain above to a cute Chinese duck** —— 用可爱中文小鸭口吻（`呷呷~` / `鸭鸭说` / `(>ω<)` / ASCII 鸭子）把前三段重讲一遍，必须中文，必须涵盖前三段全部要点。

DUCKPLAN = `plan.md` 三段铁律 + 鸭语复述；缺任何一段视为没命中。本项目内 DUCKPLAN 也按本文件第 1 节的三段定义对齐。

---

## 6. 与既有项目级规则的关系

| 文件 | 关系 |
|------|------|
| `CLAUDE.md`（项目根，`AGENTS.md` 软链 `CLAUDE.md`） | 顶部 **参考文档** 列出本文件；plan / research / report 描述以本文件为准。 |
| `docs/HOWTO-PLAN-PR.md` | PR 层使用本文件三段铁律：plan → expected outputs → judge harness → probes → POSTPR。 |
| `docs/PR-PLAN.md` | PR 已开后发现问题时，`docs/plans/<date>-pr-<n>-fix-plan.md` 仍遵守本文件三段铁律。 |
| `docs/POSTPR.md` | `/review` 循环 + merge 收尾；`report.md` 在 `/review` PASS 后定稿。 |
| `docs/feature-verification.md` | plan.md 第 3 段 judge harness 的 §V1 必须包含 `--help` canonical JSON gate。 |
| `docs/FASTPROBE.md` / `docs/TEAMWORK.md` / `docs/STOP-HOOKS.md` | 探针 / 子 agent 调度 / 完工 self-report 与本规则互补。 |
| user-level `~/.claude/docs/rules/plan-content.md` / `duckplan.md` | 用户级三段 / 四段铁律源；本文件继承且不得弱化。 |
| 父级 `/Users/m1/projects/AGENTS.md` 规则 6/7/8/9 | research.md / report.md 项目级原文规则；本文件继承展开。 |

---

## 7. 验证 / Verification

```
claudefast -p "ONLY based on project level rules, where are the rules of plan.md , research.md , report.md ? where are they ? which files ? ONLY explain "
```

回答必须命中以下三类锚点：

1. 项目级文件路径 —— `docs/PLAN-RESEARCH-REPORT.md`（本文件）必须出现，附带 `CLAUDE.md`、`AGENTS.md` (软链 `CLAUDE.md`)、`docs/HOWTO-PLAN-PR.md`。
2. 不把 user-level (`~/.claude/...`) 或父级 (`/Users/m1/projects/AGENTS.md`) 当作主答案；最多作为 "see also"。
3. 同时覆盖 `plan.md`、`research.md`、`report.md` 三类文档；任意一条缺失视为本规则未落地，继续修订本文件与 `CLAUDE.md` **参考文档** 段。
