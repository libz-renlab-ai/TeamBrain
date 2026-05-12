```text
   ┌─────────────────────────────────────────────────────────────────────┐
   │ research.md — issue #349 pre-comment + label before taking over     │
   │                                                                     │
   │   inputs ──▶ FIXEDFLOW.md ──▶ HOW-TO-CLAIM ──▶ existing labels      │
   │              (§Claim 2-out)   (TL;DR L34-38)   grill-working#fbca04 │
   └─────────────────────────────────────────────────────────────────────┘
```

# research.md — issue #349 pre-comment + tracking label

## Issue 原文

- 编号：[#349](https://github.com/libz-renlab-ai/TeamBrain/issues/349)
- 标题：`[fixedflow] close 别人的issue 需要提前comment`
- Body（≤50 字）：

  > 需要提前comment：1. 我已经开始干了 2. 我来负责 grill-with-docs /grill-via-web 3. 我的机器上开始干了

- Labels：无（既无 `grill-ready`，也无 `docs-grill-ready`，所以 FIXEDFLOW driver 不会自动 dispatch；这是一条纯 doc-only 改动，由 maintainer 手动落地）。
- 评论：
  1. `@hrdAI3 please confirm ; @libz-renlab-ai @liboze2026 please implement it.`
  2. `我来开始干`
- 用户新增澄清（本会话）：`please use tags for easy issue tracking please` — 要求把 GitHub label（tag）作为 tracking 信号串进规则。

## FIXEDFLOW 现状（与本 issue 相关的段落）

- `docs/FIXEDFLOW.md` L24 refusal layer：「24h 内无 grill-ready 一律 close」——这条让 maintainer 在 24h 后可以 close 别人开的非合规 issue，但**没有**要求 close 前先评论。
- `docs/FIXEDFLOW.md` L61-77 `Claim an issue — 2-outcome contract` 与 `Preempted by an existing PR — 2-outcome contract` 描述 driver 行为与平行 PR 处理，**没有**「接手别人 grill-ready issue」的预声明契约。
- `docs/HOW-TO-CLAIM-ISSUE.md` L23-77 描述 claim 之后的三步流程，TL;DR 的第一动作是「派 explore agent」，**没有**「先评论 + 贴 label」的 hand-off 步骤。
- `.github/workflows/issue-conformance.yml` 在 enforce 期可以无预警 close 非合规 issue —— 本 issue 想给这条增加 maintainer-side 的「人手 close 前必须先 comment」契约。

## 现成 label 盘点（`gh label list`）

| label | 颜色 | 现含义 | 与本 issue 关系 |
|---|---|---|---|
| `grill-ready` | `#0e8a16` | issue 有合法 grill comment | 前置 gate |
| `docs-grill-ready` | `#1d76db` | `/grill-with-docs` 已跑过 docs gate | 前置 gate |
| `grill-working` | `#fbca04` | **Cross-host mutex: driver has claimed this grill-ready issue** (`PRE-IMPLEMENT-CLAIM.md`) | **复用作为「我开始干了」的 tracking tag** |
| `ready-for-human` | `#1d76db` | 需要 human judgment | 与本 issue 正交（epic 协调用） |

结论：**不新建 label**。`grill-working` 早就预留为「跨主机 mutex 信号」，正好充当「我已经在我的机器上开始干了」的可视化 tag，串到 maintainer 接手契约里。

## 相关 PR / issue

- 没有已存在的 PR / issue 写「接手前必须先 comment + 贴 label」契约。
- `issue #338` (`ready-for-human` policy — 必须人手 close) 是正交规则。
- `issue #146` retroactive labeling 复盘（POSTMORTEM.md hard rule #6）也是正交规则。

## doc 改动落点

1. **`docs/FIXEDFLOW.md`** —— 在 §`Preempted by an existing PR` 段之后、§`步骤负责人分界` 表之前，插入新段 `Taking over someone else's grill-ready issue — pre-comment + label contract`。
2. **`docs/HOW-TO-CLAIM-ISSUE.md`** —— 在「两道 label gate 必须同时存在」段之后插入一条「接手别人开的 issue 时」分支，引用 FIXEDFLOW 的新段。
3. 同步把 issue #349 写进 FIXEDFLOW.md §`与既有规则的关系` 表的注脚（说明本节由 #349 引入）。

## 该不该改 `issue-conformance.yml`？

不在本 PR 改。理由：
- workflow 自动 close 的对象是「24h 没 grill-ready」的非合规 issue，**不是**别人已经 grill 完的 issue。
- 本 issue 关心的 close 场景是 maintainer 手动 close（接手 / 重分配 / 弃案），不是 conformance Action 的 auto-close。
- 把 workflow 改成「close 前必须见到 pre-comment 与 `grill-working` label」会改自动 close 的语义边界（warn 期 vs enforce 期），属另一道讨论；本 PR 仅落 docs，留下 follow-up issue 入口（写在 plan.md 风险段，不另开 issue）。

## anchor 取舍

用户没有要求 verbatim canned answer，所以本 PR **不向 CLAUDE.md 加 anchor sentence**（也符合 `docs/POSTPR.md` L115「不向 CLAUDE.md 写 FIXEDFLOW canned-answer block」硬约束）；用户只需要规则落到 FIXEDFLOW.md / HOW-TO-CLAIM-ISSUE.md，加 label 串起来即可。
