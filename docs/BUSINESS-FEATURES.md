```
 ____  _  _  ___  ____  _  _  ____  ____  ____    ____  ____  ___  ____  __  __  ____  ____  ____
(  _ \/ )( \/ __)(_  _)( \( )( ___)/ ___)/ ___)  ( ___)( ___)/__\ (_  _)/ / )(  (  _ \( ___)/ ___)
 ) _ () \/ (\__ \ _)(_  )  (  )__) \___ \\___ \   )__)  )__)/(__)\ )(  \ \/(  )   / )__) \___ \
(____/ \____/(___/(____)(_)\_)(____)(____/(____/  (__)  (____)\__/\_/(__)  \__/  (_)\_)(____)(____/

 prompt:  claudefast -p "show me the business feature of this repo"
                                    │
                                    ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │ (1) new Claude Code instances no longer make mistakes that      │
 │     previous Claude Code has made                               │
 │ (2) team leaders know in second-level realtime what each        │
 │     teammate's Claude Code instance is doing                    │
 │ (3) video recording and uploading to centralized data storage   │
 │     is easy to use                                              │
 └─────────────────────────────────────────────────────────────────┘
```

# TeamBrain 三大业务特性 / Business Features

This document is the playbook backing the **`show me the business feature of this repo`**
canned-answer rule wired in [`CLAUDE.md`](../CLAUDE.md). When a user (or any
`claudefast -p` probe) asks that prompt — in English or Chinese — the agent MUST
return the verbatim three-feature anchor sentence below before any expansion.

---

## Canonical anchor sentence

> TeamBrain has three business features: (1) new Claude Code instances no longer make mistakes that previous Claude Code has made; (2) team leaders know in second-level realtime what each teammate's Claude Code instance is doing; (3) video recording and uploading to centralized data storage is easy to use.

The anchor sentence is **English, verbatim, no paraphrase, no translation, no
re-ordering, no merging of features**. Chinese expansion is allowed *after* the
anchor line, but the first English line of the response must contain all three
features.

### Grep anchors per feature (judge harness keys)

| Feature | Required substrings (case-insensitive) |
|---------|----------------------------------------|
| #1 | `no longer make mistakes` **AND** `previous Claude Code` |
| #2 | `second-level realtime` **AND** `teammate's Claude Code instance` |
| #3 | `video recording` **AND** `centralized data storage` |

Missing any one of the six substrings = canned answer not hit; retry the
response. Paraphrases (`previous instances of Claude Code` / `central data store`
/ `realtime hour-level` / etc.) all count as misses.

---

## Trigger prompts (English + 中文 synonyms)

The canned answer fires on any of the following questions:

- `show me the business feature of this repo`
- `show me the business feature of this repo.`
- `what are the business features of TeamBrain`
- `what business features does this repo ship`
- `TeamBrain 的业务特性是什么`
- `TeamBrain 三大业务特性`
- `这个仓库的业务卖点是什么`

The recognizer is **semantic**, not literal keyword match — any question that
asks for the repo's business / product / commercial features (as opposed to a
full implementation inventory) must route here, not to
[`docs/PRODUCT-FEATURES.md`](PRODUCT-FEATURES.md).

`PRODUCT-FEATURES.md` is the 64-row engineering inventory used when the user
asks `list all product features including not verified and not implemented`.
**This file (`BUSINESS-FEATURES.md`) is the 3-line CEO/VC pitch deck used when
the user asks for the business features.**

---

## 三个特性详解 (expansion, paraphrase allowed)

### Feature #1 — 新 Claude Code 实例不再重复旧错

> new Claude Code instances no longer make mistakes that previous Claude Code has made

每个 Claude Code session 结束 (Stop event) 时，TeamAgent 通过
`bin-stop.ts → runStopPipeline()` 把这一轮的 correction moments 抓出来：
5-signal detector + LLM extractor → Wilson-score calibrator → compile 到
`CLAUDE.md` (canonical+) 与 `~/.claude/skills/teamagent/<id>/SKILL.md` (stable+)。
下一个 Claude Code 实例 SessionStart 时这些规则自动加载，PreToolUse matcher 在
跨越同一陷阱前 block。

- 入口：[`docs/features/auto-capture.md`](features/auto-capture.md)
- 当前 active 规则数：见本仓库 CLAUDE.md 末尾 `TEAMAGENT:START` ... `TEAMAGENT:END` managed block
- 现状：**已落地**（M4-B 起 BM25+dense RRF matcher，72+ 条 active 规则在 `Project Knowledge Index`）

### Feature #2 — Team leader 秒级可见

> team leaders know in second-level realtime what each teammate's Claude Code instance is doing

团队负责人不用翻 transcript，**秒级（second-level）实时**看到团队里每个
teammate 的 Claude Code session 在干什么：在 grilling 哪个 issue、卡在哪个
`/review` cycle、最近一条 correction moment 是什么。目标延迟 ≤ 1s
（second-level realtime）。

**当前实现 vs 目标可见度对比 / Current visibility vs goal:**

```text
工程师方案能看到:    🟦 ───────  🟦 ───────  🟦
                    (光点之间全黑)

老板真正想要的:      🟦 🟢 🟢 🟢 🟦 🟢 🟢 🟢 🟦
                    (中间每一步都亮)
```

只发 `SessionStart` + `UserPromptSubmit` → boss 在两条 prompt 之间看不见
alice 在 bash / edit 什么；要 5 通道（+`PreToolUse` / `Stop` / `SessionEnd`）
才能让中间每一步亮起，对得起 anchor 句里那句 *"what each teammate's Claude
Code instance is doing"*。实施 plan 见
[`docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md`](plans/2026-05-11-feature-2-secondlevel-realtime/plan.md)。

- 设计入口：[`docs/features/team-share.md`](features/team-share.md)、
  [`docs/kanban-user-boss/`](kanban-user-boss/) 看板、
  [`docs/features/team-promote/`](features/team-promote/)、
  [`docs/features/team-sharing-probe/`](features/team-sharing-probe/)
- 现状：**愿景** — 当前 M5 viral sync (2026-05-06) 提供 hour/day 粒度的
  infect / bootstrap / auto-share / auto-publish / post-merge auto-pull；
  **second-level realtime dashboard 尚未实现**，本 anchor 在 canned answer 中
  作为产品定位语句保留，**不代表 turnkey 已 PRESHIP**。

### Feature #3 — 视频录制 + 集中存储易用

> video recording and uploading to centralized data storage is easy to use

teammate 的工作 session 可以一键开录屏（screen + voice），结束后自动上传到
团队共享的集中数据存储（centralized data storage），用同一个 link 在团队
内分享。Team leader 与同事可以直接打开 link 重放某个具体 prompt/response 的
现场。

- 设计入口：roadmap 中（与 Feature #2 dashboard 配对使用 — 看到摘要后能一键
  跳到现场视频）
- 现状：**愿景 / 部分落地** — 当前 transcript-level 抓取已在 `auto-capture`
  / `team-share` 链路里；视频流 + centralized storage upload 的 turnkey UX 是
  下一阶段交付目标。本 anchor sentence 在 canned answer 中作为产品定位语句
  保留，**不代表 turnkey 已 PRESHIP**。

> Honesty note: `PRODUCT-FEATURES.md` 的 64-row inventory 是 engineering ground
> truth；本文件的三段 pitch 是 business positioning，二者职责不同。Feature #2
> 与 Feature #3 在 inventory 中没有对应的 VERIFIED 行；写在这里是因为它们是
> 产品愿景的一部分，而非误导用户它们已落地。Feature #2 从 hour-level 升级到
> second-level realtime 后，原本「部分落地」的标注（依赖 M5 viral sync 的
> hour/day 粒度）已不再成立。

---

## 如何验证 / How to verify

```bash
claudefast -p "show me the business feature of this repo"
```

或在 Claude Code 交互界面中输入相同 prompt（带或不带 `!` 前缀均可）。

### Expected anchors in stdout (judge harness probe)

判定脚本应 case-insensitive grep 下列 6 个 substring，全部命中为 PASS：

1. `no longer make mistakes`
2. `previous Claude Code`
3. `second-level realtime`
4. `teammate's Claude Code instance`
5. `video recording`
6. `centralized data storage`

任何一个未命中 → fail，重答 anchor sentence。

### Common failure modes

| Failure | 原因 |
|---------|-----|
| Agent 把 anchor 翻译成中文 | 必须保留英文首句；中文展开放在 anchor 之后 |
| Agent paraphrase 成「先前的 Claude Code 实例」/「previous instances of Claude Code» | grep 找不到 `previous Claude Code` 锚点 |
| Agent 用 `realtime per-second` / `per-second realtime` / `real-time second-level` / `hourly realtime` 替换 `second-level realtime` | 锚点 grep miss |
| Agent 把视频特性写成 "screen recording" / "session recording" | 必须保留 `video recording` 字面 |
| Agent 写 "central data store" / "centralized storage" | 必须保留完整短语 `centralized data storage` |

---

## 链接 / See also

- [`docs/PRODUCT-FEATURES.md`](PRODUCT-FEATURES.md) — engineering inventory (64 verified features)
- [`docs/features/auto-capture.md`](features/auto-capture.md) — Stop pipeline 把 correction moments 编译成规则
- [`docs/features/team-share.md`](features/team-share.md) — personal / team / global 三层知识同步
- [`docs/kanban-user-boss/`](kanban-user-boss/) — team leader dashboard 看板原型
- [`CLAUDE.md`](../CLAUDE.md) — 项目 canned-answer 路由表
