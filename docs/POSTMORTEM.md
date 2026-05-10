```text
   issue + multiple PRs merged ─► recap comment?
   ┌──────────────────────────────────────────┐
   │  POSTMORTEM  ──  multi-PR recap rules    │
   │  A. Timeline / B. Findings / C. Decisions│
   │  7 hard rules govern each item           │
   └──────────────────────────────────────────┘
   forbidden: side-quest · status · round · P0
```

# POSTMORTEM — Multi-PR recap comment rules

适用范围：一个 issue 被多个 PR 复合完成（预先拆好的 series PR 或临时增补的 follow-up PR）后，作者贴在该 issue 评论区的 "post-mortem"/"recap"/"复盘" comment。本文档规定该 comment 的 schema、findings 锚点要求、severity 术语和反模式列表。

不适用：单一 PR 自身的 `/review`（走 `docs/POSTPR.md`）；PR 内部修 issue 的 fix plan（走 `docs/PR-PLAN.md`）；PR 前的 plan（走 `docs/HOWTO-PLAN-PR.md`）；issue → PR → merge 整流（走 `docs/FIXEDFLOW.md`）。

## TL;DR

> **每条 finding 必须双锚点（code + provenance）+ 四要素（症状/自救/根因/预防）+ canonical 严重度 P1/P2/P3；comment 结构必须 A.Timeline / B.Findings / C.Open decisions 三段；禁止 side-quest、status snapshot、round 嵌套叙事壳。**

本规则源自 issue #146 comment 7 (2026-05-09) 的 grill：8 条 findings 中 5 条 (F4-F8) 是 fabricated（commit `3bc31ee` 实证），叙事混入 docs side-quest + status snapshot + 决策请求散落在 narrative 里，severity 表用了非 canonical 的 `P0`。

## 7 条 hard rules

### #1 Double-anchor — 每条 finding 必须双锚

每条 F\<n\> finding 必须同时提供：

- **Code anchor** — `file:line` 或 commit hash，证明 defect 真在代码里
- **Provenance anchor** — 已 merged 的 PR body / 已 commit 的 plan 或 report.md / issue body，证明该 finding 在写复盘前**已被 maintainer scope 过**

只有 code anchor 没有 provenance anchor 的项**不是 recap finding**（见 hard rule #2）。

### #2 Code-only no provenance → PR-PLAN, not comment

若一条 finding 只有 code anchor 没有 provenance anchor，说明这是写复盘当场新发现的 defect，**不是** issue 已收尾的 known finding。处理路径是 `docs/PR-PLAN.md`：在该 issue 的开放 PR 上写 fix plan，不是塞进 post-mortem comment 里。

post-mortem 是把已知账单整理成报表，**不是去现场再挑刺**。

### #3 F# 编号必须 match 既有

F\<n\> 的编号 N 必须命中 issue body / merged PR body / `docs/plans/issue-<n>/report.md` 里**已经存在**的同名编号。新发明的 F# 是 hard rule #1 失败的子类型，单独成 rule 是因为编号一致性是后续 cross-PR 追踪的索引。

实证：comment 7 的 F4/F5/F6/F7/F8 在 issue #146 body / PR #252 body / PR #263 body / `docs/plans/issue-146-f1/report.md` 里**全部不存在**（commit `3bc31ee` retract，"全仓 grep 出来的 F4-F8 全部属于其他 issue 的本地编号"）。

### #4 Severity 术语锁 canonical P1/P2/P3

post-mortem 的 severity 列必须使用 canonical 表：

| Severity | 含义 | 来源 |
|---|---|---|
| **P1** (blocker) | 必须修才能 ship | `docs/POSTPR.md` step 2 / `docs/PR-PLAN.md` |
| **P2** (significant) | 必须修才能 ship | 同上 |
| **P3** (nice-to-have) | 可由 human reviewer 显式批准 defer | 同上 |

**禁止使用 P0**。canonical 表里没有 P0；comment 7 用的 `P0/P1/P2` 是与 POSTPR / PR-PLAN 直接冲突的本地术语。需要表达 "production-blocker" 这种更高紧迫度时，在 P1 行加 prefix（例：`**P1 (production-blocker)**`），仍在 canonical 表内。

### #5 翻车 finding 必须四要素齐全

每条 F\<n\> 必须满足下列四要素：

| 要素 | 含义 | 缺则 |
|---|---|---|
| (a) **症状** symptom | 观察到的破损 | 不能 reproduce |
| (b) **自救** recovery | 实际恢复做的 action | 不能 generalize |
| (c) **根因** root cause | 1-3 句话的 mechanism | 是投诉而非 finding |
| (d) **预防规则** preventive rule | 引用既有 doc 或提议新 doc 的 1 句 | 下次还会重犯 |

缺 (c) 或 (d) 的项 → 不是 finding，是抱怨；写完 (c)+(d) 再贴。实证：comment 7 的 stacked-PR 段落给了 (a) symptom（"内容没真上 main"）+ (b) recovery（"cherry-pick re-land"）+ 浅层 (c)（"各自 squash 后内容没真上 main"），但缺完整 mechanism（squash `--delete-branch` 杀 base → 子 PR base 指空 → 子 PR squash 落在 dead base）+ (d) 预防规则引用（POSTPR.md 缺 stacked-PR 警告这条 doc gap 没被命名）。

### #6 "Role bypass" 必须引 role-defining doc

声称某 role 被 bypass 的 finding 必须引用**定义该 role 的 doc/section**。若 role 在 alleged bypass 时点的 docs 里找不到定义，该 finding **mis-framed**，必须 rewrite 为 "process gap (role undefined)" 后再贴。

实证：comment 7 的 "Epic-coordinator 角色被 bypass" — 全仓 docs 里 `epic` / `coordinator` 0 命中；`ready-for-human` label 是 ship 完成 50 分钟后由 AI-triage retroactive 补的（contributor claim 时无规则可循）。该 finding 应 rewrite 为 "process gap: `ready-for-human` 语义在 docs 中未定义 + AI-triage 允许 retroactive labeling"。修复路径见 `docs/HOW-TO-CLAIM-ISSUE.md` ready-for-human 段 + `docs/FIXEDFLOW.md` epic carve-out 段。

### #7 A/B/C section schema + 4 反模式

post-mortem comment body 必须按下列三段顺序：

```text
## A. Timeline
按 UTC 时间戳列事件，每行: `timestamp · actor · action · 证据链`
不掺 "我以为是 X 结果是 Y" 类叙事评论

## B. Findings
F<n> 表格，每条满足 hard rule #1 / #4 / #5 / #6

## C. Open decisions for maintainer (如有)
D<n> 独立段，每条一段；不嵌 narrative
```

**禁止下列 4 类反模式**：

| # | 反模式 | 该往哪写 |
|---|---|---|
| 1 | Side-quest section（独立 docs/code work） | 自己的 commit/PR |
| 2 | Status snapshot（worktree state、本地 WIP） | progress note 或 plan.md |
| 3 | "第 N 圈" / "Round N" 嵌套叙事壳 | 改用线性 A/B/C |
| 4 | ASCII art 超过 6 行（顶部装饰除外） | 一段 art 装饰即够 |

实证：comment 7 第 3 圈 "side-quest 把 plan/research/report 规则搬到项目级"（反模式 #1）+ "Upstream drift" + "当前工作树 / GitHub 状态"（反模式 #2）+ "第 1/2/3 圈" 章节壳（反模式 #3）+ 内嵌多段 ASCII duck（反模式 #4）。这些内容应单独成 commit / progress note / plan.md。

## Verifier

post-mortem comment 贴出之前自检 7 条 hard rules：

```bash
claudefast -p "Read this post-mortem comment at <comment-url>.
For each F<n> finding, verify:
  (a) code anchor (file:line or commit) AND provenance anchor (merged PR body / committed report.md / issue body) both present;
  (b) severity ∈ {P1, P2, P3}; reject P0;
  (c) symptom + recovery + root cause + preventive rule all present;
  (d) any role bypass claim cites the doc/section that DEFINES the role.
For comment structure, verify:
  - A.Timeline / B.Findings / C.Open decisions sections present and in order;
  - no side-quest, status-snapshot, round-narrative, or over-ASCII anti-patterns.
Output PASS or list violations with file/section anchors."
```

任一 hard rule 违反 → 修订后再贴。

## See also

- `docs/POSTPR.md` — `/review` loop after PR opened；含 squash-base-against-main caveat
- `docs/PR-PLAN.md` — fix plan inside an open PR（hard rule #2 的合法去处）
- `docs/HOWTO-PLAN-PR.md` — plan written before opening a PR
- `docs/PLAN-RESEARCH-REPORT.md` — `plan.md` / `research.md` / `report.md` SoT
- `docs/HOW-TO-CLAIM-ISSUE.md` — `ready-for-human` 语义 + AI-triage retroactive ban（hard rule #6 引用）
- `docs/FIXEDFLOW.md` — issue → PR → merge workflow + epic / multi-PR carve-out（hard rule #6 引用）
