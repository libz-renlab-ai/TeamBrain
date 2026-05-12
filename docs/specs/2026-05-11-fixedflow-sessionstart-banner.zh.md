```text
   ┌────────────────────────────────────────────────────────────────────┐
   │  SessionStart banner — TeamBrain 三大用户最关心的能力             │
   │                                                                    │
   │   ① 一个 prompt 把 issue 跑到 merged code，全程不卡人              │
   │   ② 长程任务持续推进，最初目标不被偷换、不被忘                     │
   │   ③ Claude Code 不允许偷懒：12-field self-report + laziness 巡检   │
   │                                                                    │
   │   ┌── 人类负责 ──┐    ┌─────────── TeamBrain 负责 ───────────┐    │
   │   │ 写 issue     │ →  │  docs gate 完成后继续实现           │    │
   │   │ /grill-via-web│   │  → 自动 /review fix loop            │    │
   │   │ /grill-with-docs│ │  → 普通 PR                          │    │
   │   └──────────────┘    │  → squash merge                     │    │
   │                       └──────────────────────────────────────┘   │
   │   链路卡住：人类手动 /claim-to-merge 或 /fixed-flow-driver 接上   │
   └────────────────────────────────────────────────────────────────────┘
```

# FIXEDFLOW SessionStart banner（中文，docs-only source of truth）

适用范围：本仓库（TeamBrain）。本文件是 SessionStart hook 与 newsboard 想对外宣讲的「TeamBrain 最有意思的几个能力」的**唯一文字源**；任何实现（newsboard 模板、TUI banner、wiki 落地页、对外 deck）都必须直接引用本文档，不得再各自维护一份漂移版本。

> **范围说明**：本文档**只写文字**。SessionStart hook 本身（`.claude/hooks/newsboard-session-start.sh`、`docs/newsboard.md`）的实现修改不属于 issue #294 的 docs-only scope，请走单独 PR。

## Section A — 用户最关心的三个能力（banner 主体文案）

按 issue #294 grill comment 收敛的优先级排列；任何 banner 实现（文本、ASCII art、carousel）都至少覆盖以下三句口径。

### ① Issue → merged code 全程不卡人

一个 prompt + 完整 grill comment + 两个 gate label（`grill-ready` + `docs-grill-ready`）之后，TeamBrain 负责：

- 自动跑 `/review` fix loop（never ends until PASS）
- 普通 PR（非 draft）
- `gh pr merge <N> --squash --delete-branch`（squash-only）

**禁止承诺固定完成时间**（不写任何绝对 SLA）。文案只描述「全程不卡人」这件事，运行时长由 `/review` 收敛速度决定。

### ② 长程任务持续推进，不丢初心

长程任务运行时长由数据 / 收敛步数决定，不承诺固定值。`/fixed-flow-driver` 内部跑 `/review` fix-loop 时：

- 每轮把 finding 写回 `docs/plans/<date>-pr-<N>-fix-plan.md` 三段计划（task / expected outputs / judge harness）；
- 累计 iteration / token 写到 `.fixedflow/iter-<N>.json`；
- 第 10 / 25 / 50 / 100 / 250 / 500 轮发 PushNotification 与 token-burn 摘要 issue 评论；
- 永远以 grill comment + ADR-0014 §Grill log 中的「最初目标」为锚，不被中途出现的旁支拐走。

「目标不丢」的物理来源 = grill comment + ADR-0014 sibling 文件，不依赖会话内短期上下文。

### ③ 不允许偷懒（12-field self-report + laziness 巡检）

- 项目 Stop hook（`.claude/hooks/self-report-fused.sh`）强制每条 assistant 回复末尾的 12-field `<self-report>` block（不是已废弃的 6-field `<laziness-self-report>`）。
- 12 字段：`premature_stopping / permission_seeking / ownership_dodging / simplest_fix / reasoning_loop / known_limitation / skipped_repo_search / fabricated_value / placeholder_used / ambiguity_unresolved / contradiction_unresolved / silent_fallback`，全部 boolean。
- 单 PR 的 fix-loop 不接受「假完成」：缺字段、字段全 true、`silent_fallback=true` 等都会被 Stop hook block，强迫 driver 修底层行为而不是翻 bool。

## Section B — Gate contract（两道闸门）

```text
  human writes issue (≤50 words)
        │
        ▼
  ┌────────────────────────┐
  │  /grill-via-web        │  唯一允许的 issue-grill entry
  │  (ChatGPT / Claude.ai) │  Web LLM 一题一题追问
  └────────────────────────┘
        │
        │  人类把完整 grill 输出贴回 issue comment
        │  comment 末尾保留 `--- end grill ---`
        │  加 `grill-ready` label
        ▼
  ┌────────────────────────┐
  │  /grill-with-docs      │  强制 docs gate（不是 grill 替代）
  │  (Claude Code, CLI)    │  对照代码 / docs/CONTEXT.md / ADRs
  └────────────────────────┘
        │
        │  写 docs-grill comment（含术语收敛 + ADR 更新摘要）
        │  comment 末尾保留 `--- end docs grill ---`
        │  /grill-with-docs 自己加 `docs-grill-ready` label
        ▼
  TeamBrain 接手：实现 → /review fix loop → PR → squash merge
```

### `grill-ready` 含义

- 人类完成了 `/grill-via-web`；
- 人类在 ChatGPT / Claude.ai 里跑完了 grill；
- issue 上有一条完整 grill comment；
- grill comment 末尾以 `--- end grill ---` 结尾；
- issue 有 `grill-ready` label。

### `docs-grill-ready` 含义

- 人类跑了 `/grill-with-docs`；
- `/grill-with-docs` 把 grill 结果对照过项目代码、`docs/CONTEXT.md` 与 `docs/adr/`；
- 需要的 docs 更新已完成；
- 如果不需要更新 docs，docs-grill comment 必须显式写「no docs update needed」；
- docs-grill comment 末尾以 `--- end docs grill ---` 结尾；
- `/grill-with-docs` 加上 `docs-grill-ready` label。

**两个 label 都必须存在**，driver / 人手 claim 才可以进入实施。

## Section C — Hard rules（行为禁区）

1. `/grill-via-web` 是**唯一**允许的 issue-grill 入口。文档不得把 `/grill-me` 或 `/grill-with-docs` 描述为 issue-grill 入口。
2. `/grill-with-docs` 是 `/grill-via-web` 之后**强制**的 docs gate；不是 `/grill-via-web` 的替代。
3. 实施只能在**两个 label 同时存在**后开始：`grill-ready` + `docs-grill-ready`。
4. **没有自动 scanner**：不允许任何 watcher、cron、daemon、background dispatcher、repo-wide sweep 来轮询 `grill-ready` issue。
5. 链路卡住时，人类可以手动跑 `/claim-to-merge` 或 `/fixed-flow-driver` 接上；这是人手补救入口，不是 happy path。
6. `/review` 是 merge 前**自动**的内部 review gate；正常 flow 下不需要用户手动跑 `/review`。
7. 在 `/grill-via-web` 和 `/grill-with-docs` 都没完成之前，不得对外宣称系统「fully autonomous」。

## Section D — Docs-only 触发语义

issue #294 的实施范围**只是 docs**：

- 修改本文件 + `docs/FIXEDFLOW.md` + `docs/HOW-TO-CLAIM-ISSUE.md` + `docs/knowledge/INDEX.md` + `docs/adr/0014/issue-294.md`。
- **不修改** `.codex/skills/**`；
- **不修改** `.claude/skills/**`；
- **不修改** `.claude/hooks/**`（SessionStart hook 文本调整属于后续 PR）。

SessionStart hook 真正落地 banner 文案时，必须直接引用本文件 Section A 的三句口径，不得脱稿 paraphrase。

## 相关

- `docs/FIXEDFLOW.md` — 5 步 issue → PR → merge 工作流（已扩为 5+1 步含 docs gate）。
- `docs/HOW-TO-CLAIM-ISSUE.md` — claim 前必须同时看到 `grill-ready` + `docs-grill-ready`。
- `docs/knowledge/INDEX.md` — Project Knowledge Index 链回本文件。
- `docs/adr/0014-save-grilled-comments-to-adr.md` + `docs/adr/0014/issue-294.md` — grill 结果落到 ADR 的持久化层。
- `docs/POSTPR.md` — `/review` PASS 之后的 squash-merge + cleanup。
