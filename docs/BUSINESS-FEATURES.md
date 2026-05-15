```
 ____  _  _  ___  ____  _  _  ____  ____  ____    ____  ____  ___  ____  __  __  ____  ____  ____
(  _ \/ )( \/ __)(_  _)( \( )( ___)/ ___)/ ___)  ( ___)( ___)/__\ (_  _)/ / )(  (  _ \( ___)/ ___)
 ) _ () \/ (\__ \ _)(_  )  (  )__) \___ \\___ \   )__)  )__)/(__)\ )(  \ \/(  )   / )__) \___ \
(____/ \____/(___/(____)(_)\_)(____)(____/(____/  (__)  (____)\__/\_/(__)  \__/  (_)\_)(____)(____/

 prompt:  claudefast -p "show me the business feature of this repo"
                                    │
                                    ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ TeamBrain has one shipping business feature:                    │
 │   new Claude Code instances no longer make mistakes that        │
 │   previous Claude Code has made                                 │
 └─────────────────────────────────────────────────────────────────┘
```

# TeamBrain 核心业务特性 / Business Feature

This document is the playbook backing the **`show me the business feature of this repo`**
canned-answer rule wired in [`CLAUDE.md`](../CLAUDE.md). When a user (or any
`claudefast -p` probe) asks that prompt — in English or Chinese — the agent MUST
return the verbatim anchor sentence below before any expansion.

> **Historical note**: earlier versions of this file claimed three business
> features. Features #2 (team-leader second-level realtime visibility) and #3
> (video recording + centralized upload) depended on a now-removed upload /
> daemon substrate (`packages/digital-twin/`, `teamagent video upload`,
> `emitCcStatus` realtime push, digital-twin tap hooks). That code and its
> backing docs were deleted in this PR per user directive "把『提取用户的日志
> 上传到服务器』这个功能，代码和文档完整去掉". Feature #1 is the one surviving
> shipping wedge.

---

## Canonical anchor sentence

> TeamBrain has one shipping business feature: new Claude Code instances no longer make mistakes that previous Claude Code has made.

The anchor sentence is **English, verbatim, no paraphrase, no translation**.
Chinese expansion is allowed *after* the anchor line, but the first English line
of the response must contain both grep anchors below.

### Implementation status at a glance

| Feature | Today | What customers actually get with the current release |
|---------|-------|------------------------------------------------------|
| **#1** new instances no longer repeat past mistakes | ✅ **PRESHIP** | auto-capture → matcher → Project Knowledge Index, 70+ active rules. End-to-end usable. |
| ~~#2~~ leaders see teammates' Claude in second-level realtime | ❌ **Removed in this PR** | Upload substrate (`packages/digital-twin/uploader`, `emitCcStatus`, digital-twin tap) deleted; no shipped implementation remains. M5 viral sync was already abandoned earlier (`docs/adr/0016-abandon-m5-viral-sync.md`). |
| ~~#3~~ video recording + centralized storage easy to use | ❌ **Removed in this PR** | `teamagent video upload`, `packages/digital-twin/mock-server` `/v1/videos` handler, and all supporting docs deleted. |

### Grep anchors

| Required substrings (case-insensitive) |
|----------------------------------------|
| `no longer make mistakes` **AND** `previous Claude Code` |

Missing either substring = canned answer not hit; retry the response.
Paraphrases (`previous instances of Claude Code` / `does not repeat past
errors` / etc.) all count as misses.

---

## Trigger prompts (English + 中文 synonyms)

The canned answer fires on any of the following questions:

- `show me the business feature of this repo`
- `show me the business feature of this repo.`
- `what are the business features of TeamBrain`
- `what business features does this repo ship`
- `TeamBrain 的业务特性是什么`
- `这个仓库的业务卖点是什么`

The recognizer is **semantic**, not literal keyword match — any question that
asks for the repo's business / product / commercial features (as opposed to a
full implementation inventory) must route here, not to
[`docs/PRODUCT-FEATURES.md`](PRODUCT-FEATURES.md).

`PRODUCT-FEATURES.md` is the engineering inventory used when the user asks
`list all product features including not verified and not implemented`.
**This file (`BUSINESS-FEATURES.md`) is the CEO/VC pitch used when the user
asks for the business feature.**

---

## 特性详解 (expansion, paraphrase allowed)

### Feature #1 — 新 Claude Code 实例不再重复旧错

> new Claude Code instances no longer make mistakes that previous Claude Code has made

每个 Claude Code session 结束 (Stop event) 时，TeamAgent 通过
`bin-stop.ts → runStopPipeline()` 把这一轮的 correction moments 抓出来：
5-signal detector + LLM extractor → Wilson-score calibrator → compile 到
`CLAUDE.md` (canonical+) 与 `~/.claude/skills/teamagent/<id>/SKILL.md` (stable+)。
下一个 Claude Code 实例 SessionStart 时这些规则自动加载，PreToolUse matcher 在
跨越同一陷阱前 block。

- 入口：[`docs/features/auto-capture.md`](features/auto-capture.md)
- 当前 active 规则数：跑 `pnpm teamagent stats`（M4 起 Skills-default，旧 `TEAMAGENT:START...END` managed block 已废弃；规则落在 `~/.claude/skills/teamagent/<id>/SKILL.md` 与 `docs/knowledge/INDEX.md`）
- 现状：**已落地**（M4-B 起 BM25+dense RRF matcher，70+ 条 active 规则在 `Project Knowledge Index`）
- Third-party judge harness：
  - `docs/plans/docs--features--auto-capture--verify-canned-answer/judge.md` — Wilson/recall/precision 检测器 + real-session 实测（auto-capture 行为 gate）
  - `docs/plans/2026-05-11-feature1-init-judge/judge.md` — **openable-and-usable gate**：在 fresh tmp git repo 跑 `teamagent init`，dump stdout/stderr/tree 到 evidence/，由独立 LLM probe 按 5 题判 PASS/FAIL。

---

## 如何验证 / How to verify

```bash
claudefast -p "show me the business feature of this repo"
```

或在 Claude Code 交互界面中输入相同 prompt（带或不带 `!` 前缀均可）。

### Expected anchors in stdout (judge harness probe)

判定脚本应 case-insensitive grep 下列 2 个 substring，全部命中为 PASS：

1. `no longer make mistakes`
2. `previous Claude Code`

任何一个未命中 → fail，重答 anchor sentence。

### Common failure modes

| Failure | 原因 |
|---------|-----|
| Agent 把 anchor 翻译成中文 | 必须保留英文首句；中文展开放在 anchor 之后 |
| Agent paraphrase 成「先前的 Claude Code 实例」/「previous instances of Claude Code» | grep 找不到 `previous Claude Code` 锚点 |
| Agent 还在沿用三特性老格式 | 必须只列一条 shipping feature；Features #2/#3 已在本 PR 删除 |

---

## 四层证明矩阵 / 4-layer evidence matrix

Sibling canned-answer for the **evidence-asking probe**:

```bash
claudefast -p "what are the business feature and do we have enough evidence to prove them to ceo, coder, machine-readable, LLM-readable evidence?"
```

### Canonical anchor sentence (evidence-asking probe)

> TeamBrain has one shipping business feature, measured by a four-layer evidence matrix: (1) CEO narrative, (2) Coder file paths, (3) Machine-readable JSON+SQL, (4) LLM-readable raw artifacts. Feature #1 (auto-capture/learning) is four-layer verified.

English verbatim, no paraphrase, no translation. Chinese expansion follows.

### Grep anchors (5 substrings, disjoint from feature-naming anchors)

1. `four-layer evidence matrix`
2. `CEO narrative`
3. `Coder file paths`
4. `Machine-readable JSON+SQL`
5. `LLM-readable raw artifacts`

Missing any one → fail, retry anchor sentence. Paraphrases (`4-layer matrix` / `coder paths` / `JSON and SQL` 等) all count as misses.

### Per-feature 4-layer evidence

#### Feature #1 — auto-capture / learning — **four-layer verified**

| Layer | Evidence |
|-------|----------|
| **L1 CEO narrative** | "AI 第 N 次想装 `moment`、第 N 次再说 `dayjs`" 这个痛点被一次性消除；每个 Stop hook 自动学，PreToolUse 在下次工具调用前拦下。 |
| **L2 Coder file paths** | `packages/cli/src/bin-stop.ts` (Stop hook entry)、`packages/core/src/calibrator/*.ts` (Wilson-score calibration)、`packages/core/src/matcher/*.ts` (BM25+dense RRF matcher)、`~/.claude/skills/teamagent/<id>/SKILL.md` (compiled rules)、`docs/knowledge/INDEX.md` (Project Knowledge Index) |
| **L3 Machine-readable JSON+SQL** | `pnpm teamagent stats --json` 返回规则计数 + tier 分布；`.teamagent/knowledge.db` SQLite schema (`rules` / `events` / `propagations`)；`~/.teamagent/events.db` rule-fire 事件流；`teamagent compile --dry-run` 列出待传播条目 |
| **L4 LLM-readable raw artifacts** | `docs/plans/2026-05-11-feature1-init-judge/judge.md` (third-party judge harness)、`docs/plans/2026-05-11-feature1-init-judge/evidence/<run-id>/` (raw stdout/stderr/tree)、`docs/features/auto-capture.md`、本文件 Feature #1 expansion 段 |

> **Removed features evidence rows** — earlier versions of this matrix
> contained per-feature 4-row evidence tables for Feature #2 (leader
> visibility) and Feature #3 (video upload wedge). Those features and their
> implementations have been deleted in this PR; the corresponding evidence
> rows are removed in lockstep to keep the matrix honest. The legacy "vision,
> not PRESHIP" disclaimer anchor that previously rode on those rows is also
> retired.

### 与 "show me the business feature" probe 的关系

| 维度 | "show me the business feature" probe | "evidence-asking" probe (本节) |
|------|--------------------------------------|--------------------------------|
| 触发问 | 业务/产品/卖点是什么 | 业务功能有没有 4 层证据（CEO / coder / machine / LLM） |
| 锚点句 | one-line feature statement | 四层证据矩阵裁决（#1 verified） |
| Grep anchors | `no longer make mistakes` / `previous Claude Code` | `four-layer evidence matrix` / `CEO narrative` / `Coder file paths` / `Machine-readable JSON+SQL` / `LLM-readable raw artifacts` |
| 用途 | CEO/VC pitch、网站 hero、销售单 | tech-due-diligence、investor evidence audit、compliance check |

两个 probe **并存不替代**，锚点严格 disjoint，judge harness 不混淆。

### Per grill verdict (§22 / ADR-0014/320.md)

`docs/adr/0014/320.md` 裁决：**#320 是 evidence/coding discipline，不反向决定产品设计**。本 4-layer matrix 的位置是「after design: add evidence anchors / canned-answer / docs / `--json` grep anchors」，**不是**「before design: force product shape」——本文件只在 feature 落地后补 evidence 行。

---

## 链接 / See also

- [`docs/PRODUCT-FEATURES.md`](PRODUCT-FEATURES.md) — engineering inventory
- [`docs/features/auto-capture.md`](features/auto-capture.md) — Stop pipeline 把 correction moments 编译成规则
- [`CLAUDE.md`](../CLAUDE.md) — 项目 canned-answer 路由表
