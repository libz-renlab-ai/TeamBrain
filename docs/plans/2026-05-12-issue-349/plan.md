```text
   ┌──────────────────────────────────────────────────────────────────────┐
   │ plan.md — issue #349 pre-comment + tracking label before takeover    │
   │                                                                      │
   │   task ──▶ expected outputs ──▶ third-party judge harness            │
   │   (3-line  (FIXEDFLOW.md +     (claudefast -p semantic probe,        │
   │    rule)    HOW-TO-CLAIM      raw JSON + grep, no in-house judge)    │
   │             updates)                                                 │
   └──────────────────────────────────────────────────────────────────────┘
```

# plan.md — issue #349

## (1) Task description / 做什么、怎么做、不做什么

**做什么**：在 `docs/FIXEDFLOW.md` 与 `docs/HOW-TO-CLAIM-ISSUE.md` 里落地 issue #349 的契约——当 maintainer 准备**接手别人开的 issue**（典型表现：原 reporter 已贴 grill 评论但还没人 drive；或 maintainer 决定 close 别人开的非合规 issue 之前），必须**先在 issue 评论里**贴三段声明（"我已经开始干了 / 我来负责 grill-with-docs / grill-via-web / 我的机器上开始干了"），并把 issue 加上 `grill-working` label 作为**跨主机 tracking tag**，之后才能动 worktree / 关 issue / 跑 driver。

**怎么做**：
1. 在 `docs/FIXEDFLOW.md` 第 77 行之后（§`Preempted by an existing PR` 段之后、§`步骤负责人分界` 表之前）插入新段 `Taking over someone else's grill-ready issue — pre-comment + label contract`，约 25 行；段内写：(a) 适用场景；(b) 三段声明字面要求；(c) `grill-working` label 是 tracking tag（颜色 `#fbca04`，复用既有 cross-host mutex 语义）；(d) 出错时的回滚（误贴 label 怎么撤）。
2. 在 `docs/HOW-TO-CLAIM-ISSUE.md` 「两道 label gate 必须同时存在」段（L25 附近）之后插入一条 ≤ 8 行的指针，引用 FIXEDFLOW 新段，告诉 claimant 「如果你不是 reporter 本人，先按 FIXEDFLOW §Taking over 那段贴评论 + label，再走三步流程」。
3. 在 `docs/FIXEDFLOW.md` §`与既有规则的关系` 列表里追加一条本节脚注（`docs/plans/2026-05-12-issue-349/`）。

**不做什么**：
- **不改** `.github/workflows/issue-conformance.yml` 的 auto-close 行为（与本 PR 正交，见 research.md §「该不该改 issue-conformance.yml？」）。
- **不新增**任何 GitHub label —— 复用已存在的 `grill-working`（`PRE-IMPLEMENT-CLAIM.md` 预留语义）。
- **不向** `CLAUDE.md` / `AGENTS.md` 加 canned answer / anchor sentence —— 符合 `docs/POSTPR.md` L115 硬约束。
- **不新增** ADR / spec —— 改动是 ≤ 35 行 doc-only delta，没有跨多文件 / 长寿命决策需要 ADR。
- **不动**任何代码（`packages/**`、`scripts/**`）。
- **不写** report-after-merge 之外的次级 plan / fix-plan（每轮 `/review` 若发现 finding 再写 `<date>-pr-N-fix-plan.md`，按 `docs/PR-PLAN.md`）。

## (2) Expected outputs / 可验收交付物清单

| # | 文件 | 期望状态 | 验证方式 |
|---|------|----------|----------|
| 1 | `docs/FIXEDFLOW.md` | 新增 §`Taking over someone else's grill-ready issue — pre-comment + label contract` 段（25-35 行），含三段声明字面字符串与 `grill-working` label 引用 | `grep -c "Taking over someone else's grill-ready issue" docs/FIXEDFLOW.md` ≥ 1；`grep -c "grill-working" docs/FIXEDFLOW.md` ≥ 1；`grep -c "我已经开始干了" docs/FIXEDFLOW.md` ≥ 1；`grep -c "我来负责 grill-with-docs / grill-via-web" docs/FIXEDFLOW.md` ≥ 1；`grep -c "我的机器上开始干了" docs/FIXEDFLOW.md` ≥ 1 |
| 2 | `docs/HOW-TO-CLAIM-ISSUE.md` | 「两道 label gate」段之后插入 ≤ 8 行指针段，引用 FIXEDFLOW 新段 | `grep -c "Taking over someone else's grill-ready issue" docs/HOW-TO-CLAIM-ISSUE.md` ≥ 1 |
| 3 | `docs/FIXEDFLOW.md` §`与既有规则的关系` | 表尾追加本 plan dir 注脚 | `grep -c "docs/plans/2026-05-12-issue-349" docs/FIXEDFLOW.md` ≥ 1 |
| 4 | `docs/plans/2026-05-12-issue-349/research.md` | research 阶段产物（已写） | 文件存在且 ≥ 50 行 |
| 5 | `docs/plans/2026-05-12-issue-349/plan.md` | 本文件，含 3 段铁律 | 文件存在；按 grep 命中 `task description` + `expected outputs` + `judge harness` 三锚点 |
| 6 | `docs/plans/2026-05-12-issue-349/report.md` | merge 之后补写 | 文件存在（merge 后才生成） |
| 7 | GitHub PR | 普通 PR（非 draft），base = `main`，title 含 `#349`，body 含三段（plan / expected outputs / judge）摘要 | `gh pr view <N> --json isDraft,baseRefName,title` 检查 `isDraft=false`, `baseRefName=main` |
| 8 | merge 状态 | `gh pr merge <N> --squash --delete-branch` 成功，squash commit 入 main | `git log origin/main --oneline | grep "issue-349"` 至少 1 行 |

## (3) Third-party judge harness / 怎么由另一只 LLM + raw JSON evidence 判分

完整 playbook 在 `docs/plans/2026-05-12-issue-349/judge.md`（**本 PR 的 verify gate**）。  
Harness 既不让本 agent 自己宣布 PASS，也不让本 plan 文件自评；只让 `MAIN agent` 在 PR review 阶段把下列 6 个 raw probe 跑一遍，输出原始 stdout + 退出码 + 命中行计数到 `evidence/`，再由**另一个独立 claudefast / haiku session** 只读 `evidence/judge.json` 写 PASS / FAIL。

### V1 RUN（固定工具，全部 deterministic）

```
P1 / grep_in_fixedflow:        grep -c "Taking over someone else's grill-ready issue" docs/FIXEDFLOW.md          (≥ 1)
P2 / grep_label_in_fixedflow:  grep -c "grill-working" docs/FIXEDFLOW.md                                          (≥ 1)
P3 / grep_three_phrases:       for p in "我已经开始干了" "我来负责 grill-with-docs / grill-via-web" "我的机器上开始干了" ; do grep -F -- "$p" docs/FIXEDFLOW.md | wc -l ; done   (三行均 ≥ 1)
P4 / grep_in_howtoclaim:       grep -c "Taking over someone else's grill-ready issue" docs/HOW-TO-CLAIM-ISSUE.md  (≥ 1)
P5 / grep_plan_dir_footnote:   grep -c "docs/plans/2026-05-12-issue-349" docs/FIXEDFLOW.md                        (≥ 1)
P6 / no_new_label:             gh label list --limit 60 | wc -l == 该 PR 开 PR 前 baseline 行数（不新增 label）
```

P1-P6 全部退出码 0、且数值阈值满足 → 写 `evidence/<probe>.txt`。任一失败立刻 fail-fast，停在那条 probe 上。

### V2 DUMP（raw evidence + judge.json）

```
docs/plans/2026-05-12-issue-349/evidence/
├── judge.json          # exit_code map + counts per probe
├── P1.txt              # raw grep stdout
├── P2.txt
├── P3.txt              # three sub-counts
├── P4.txt
├── P5.txt
└── P6.txt              # gh label list raw
```

`judge.json` 字段：`{"probe": "P1", "tool": "grep -c ...", "expected": ">=1", "observed": <int>, "exit_code": 0, "stdout_path": "evidence/P1.txt"}` 数组。

### V3 READ（另一只 LLM 看 raw JSON 当裁判）

```
claudefast -p "Read docs/plans/2026-05-12-issue-349/evidence/judge.json AND the six evidence/*.txt files; for each probe state PASS/FAIL based ONLY on observed vs expected; emit single-line final verdict: PASS if all six PASS, FAIL otherwise. Do NOT read FIXEDFLOW.md or any source file — judge by JSON+text evidence only."
```

PASS 条件硬阈值：6 个 probe 全过、no_new_label probe 显示 label 数量未增长、所有阈值数值满足。

### 反例（什么会导致 fail-fast）

- 三段中文 phrase 漏一句 → P3 失败。
- 把 `grill-working` 写错成 `grill-worker` → P2 失败。
- 在 `HOW-TO-CLAIM-ISSUE.md` 加段但忘了引用新段标题 → P4 失败。
- 偷偷新增 `taking-over` 之类新 label → P6 失败（label 数量增长）。
- 把 `Taking over someone else's grill-ready issue` 翻成中文 → P1 失败（必须保留英文段标题字面字符串以便外部 grep）。

## (4) 风险 / follow-up（非 verify gate，仅记录）

- **conformance workflow 不改**：本 PR 仅落 docs；未来若发现 auto-close 与 maintainer-side pre-comment 契约语义冲突，新开一个 issue 讨论 workflow 改造，**不在本 PR 里改**。
- **grill-working label 已 cross-host mutex 语义**：本 PR 复用语义，未来若 driver 想强制 mutex 落实到 GitHub label 检查（而不是仅靠 `.lock` sentinel），那是 driver 实现层面的事，与本 doc PR 正交。
- **POSTMORTEM hard rule #6 兼容性**：本节要求贴 `grill-working` label 的时点是「接手前」，不是事后；属"contributor 行动时点的可见 docs/labels 是唯一约束源"原则的正向应用，不违反 #6。

## (5) Out-of-scope / follow-up issues (不在本 PR 里做)

| 主题 | 留给谁 | 为什么不在本 PR |
|------|--------|-----------------|
| `issue-conformance.yml` 强制检查 pre-comment | 另开 issue | 改 auto-close 行为是 cross-cut；本 PR 是 doc-only |
| `grill-working` label 在 driver 内做硬 mutex | 另开 issue | 触及 `fixed-flow-driver` 实现 |
| 把三段声明做成 issue-comment template | 另开 issue | 仓库 setting 改动 |
| F7 — `grill-working` label 的 TTL / auto-remove cron（绝档 takeover label 不腐） | 另开 issue | 触及 `.github/workflows/issue-conformance.yml`；adversarial /review iter-1 提出，本 PR 是 doc-only |
| F8 — trivial-fix（≤ 20 LOC 单文件 doc 修复）的 escape hatch 设计 | 另开 issue | 是 design call 而非 doc landing；adversarial /review iter-1 提出 |
