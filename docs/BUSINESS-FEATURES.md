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

### Implementation status at a glance (must be cited alongside the anchor)

| Feature | Today (PRESHIP / Vision) | What customers actually get with the current release |
|---------|--------------------------|------------------------------------------------------|
| **#1** new instances no longer repeat past mistakes | ✅ **PRESHIP** | auto-capture → matcher → Project Knowledge Index, 72+ active rules. End-to-end usable. |
| **#2** leaders see teammates' Claude in second-level realtime | ⚠️ **Vision (NOT PRESHIP)** | `SessionStart` + `UserPromptSubmit` hooks wired **by design** (per the Out-of-scope section below — the original "needs 5 channels" argument has been retracted; per-tool-call mid-step visibility is **not** a product feature). Learnings sync at hour/day granularity (M5 viral sync); leader dashboard is a static prototype at `docs/kanban-user-boss/`. Second-level realtime dashboard UI is planned in `docs/plans/2026-05-11-feature-2-secondlevel-realtime/` but **not shipped**. |
| **#3** video recording + centralized storage easy to use | ✅ **PRESHIP wedge** (upload + share-link) · ⚠️ **Vision** (queue retry, signed ACLs, browser recorder) | `teamagent video upload <file>` ships a single-shot HTTP POST to `/v1/videos` and returns a stable share link the recipient curls back with the correct `Content-Type`. OS-native recording (macOS `screencapture -v` / Linux `ffmpeg -f x11grab` / Windows `ffmpeg -f gdigrab`) stays on the platform tool — the wedge is the upload step, which is what made Feature 3 unconvincing before. Round-trip SHA-256 equality verified via the [Feature 3 judge harness](plans/2026-05-13-feature-3-video-easy/judge.md). Queue/daemon retry, signed share-link ACLs, and a browser-side recorder remain explicit roadmap items in [`docs/features/video-record-upload.md`](features/video-record-upload.md) §Roadmap. |

> **Honesty contract**: any external surface that quotes the anchor sentence
> (pitch deck, website hero, customer SOW, sales call slide) MUST also surface
> the per-feature PRESHIP / Vision label from this table. Quoting the anchor
> alone — without the status row — counts as overclaim and breaks the
> implementation-status disclosure that already lives further down this file
> (Feature #2 现状段, Feature #3 现状段, Honesty note).

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
- 当前 active 规则数：跑 `pnpm teamagent stats`（M4 起 Skills-default，旧 `TEAMAGENT:START...END` managed block 已废弃；规则落在 `~/.claude/skills/teamagent/<id>/SKILL.md` 与 `docs/knowledge/INDEX.md`）
- 现状：**已落地**（M4-B 起 BM25+dense RRF matcher，72+ 条 active 规则在 `Project Knowledge Index`）
- Third-party judge harness：
  - `docs/plans/docs--features--auto-capture--verify-canned-answer/judge.md` — Wilson/recall/precision 检测器 + real-session 实测（auto-capture 行为 gate）
  - `docs/plans/2026-05-11-feature1-init-judge/judge.md` — **openable-and-usable gate**：在 fresh tmp git repo 跑 `teamagent init`，dump stdout/stderr/tree 到 evidence/，由独立 LLM probe 按 5 题判 PASS/FAIL。**取代了原方案里的 `teamagent --help` 字符串检查**（菜单可读不等于产品能装能用）。Harness 现在 pin 到 repo-local `node_modules/.bin/tsx`（fresh worktree 必须先 `pnpm install`；guard 在缺失时 exit 127 with 修复提示）。最近一次 PASS：`docs/plans/2026-05-11-feature1-init-judge/evidence/20260512T172508Z-feature1-4bc3b9b7/`（exit 0、5/5 checks、`.teamagent/{knowledge.db,required.json,.project-root}` + 1 个 exported skill）。

### Feature #2 — Team leader 秒级可见

> team leaders know in second-level realtime what each teammate's Claude Code instance is doing

团队负责人不用翻 transcript，**秒级（second-level）实时**看到团队里每个
teammate 的 Claude Code session 在干什么：在 grilling 哪个 issue、卡在哪个
`/review` cycle、最近一条 correction moment 是什么。目标延迟 ≤ 1s
（second-level realtime）。

**Scope 边界（明确不做）/ Out-of-scope:**

- **不做 per-tool-call 中间步可见**。本特性的可见度单位是 **prompt 边界**，
  不是 tool-call 边界——teammate 每发一条 prompt、每开一个新 session，
  boss 看到一条；两条 prompt 之间 alice 在 bash / edit 什么，**不上报、
  不展示、不需要**。
- **只用 2 通道：`SessionStart` + `UserPromptSubmit`**。**不接** `PreToolUse` /
  `Stop` / `SessionEnd` 来做 boss-visibility——PreToolUse 在这条链路上明确
  **不需要**；"中间每一步亮起"不是产品特性，原文档里那段「需要 5 通道」
  的论证不成立，已撤回。Stop / SessionEnd 在 Feature #1 的 auto-capture
  链路里另有用途，但 Feature #2 不依赖它们。

```text
我们交付的可见度:    🟦 ──────  🟦 ──────  🟦
                    (prompt 之间留白即设计，不补)
```

实施 plan 见
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

- 入口：[`docs/features/video-record-upload.md`](features/video-record-upload.md) — 三命令演示（启动 collector → 系统原生录屏 → `teamagent video upload <file>` 拿回 share link）
- 实现：`packages/cli/src/commands/video.ts`（单次 HTTP POST `/v1/videos`，accept mov / mp4 / webm / mkv）+ `packages/digital-twin/src/mock-server.ts`（`/v1/videos` handler + 视频 MIME GET 回路）
- 第三方 harness：[`docs/plans/2026-05-13-feature-3-video-easy/judge.md`](plans/2026-05-13-feature-3-video-easy/judge.md) — fixture mp4 round-trip 用 SHA-256 byte 等价判 PASS，LLM-cannot-fake
- 现状：**PRESHIP wedge** — upload + share-link 在 2026-05-13 端到端 verified（HTTP 200、`video/mp4` MIME、SHA-256 完整 round-trip）；OS-native 录屏放在客户机已有的工具上（macOS `screencapture -v` / Linux `ffmpeg x11grab` / Windows `ffmpeg gdigrab`）。**Vision 部分**（queue/daemon retry-and-backoff、signed ACL share link、浏览器端无依赖录屏）仍在 [`docs/features/video-record-upload.md`](features/video-record-upload.md) §Roadmap 列表中，不属于已落地范围。
- 与 Feature #1 / #2 协同：transcript-level 抓取继续在 `auto-capture` / `team-share` 链路里；视频是 Feature #2 dashboard 摘要点击进去看现场的那一帧；二者通过同一个 `<user>/<date>/<id>.<ext>` 目录结构共享 collector。

> Honesty note: `PRODUCT-FEATURES.md` 的 64-row inventory 是 engineering ground
> truth；本文件的三段 pitch 是 business positioning，二者职责不同。Feature #2
> 在 inventory 中没有对应的 VERIFIED 行（dashboard UI 尚未落地）；Feature #3 的
> **upload wedge** 已在 [`docs/plans/2026-05-13-feature-3-video-easy/judge.md`](plans/2026-05-13-feature-3-video-easy/judge.md)
> 通过 SHA-256 round-trip 第三方 harness 判过 PASS，但 queue retry / signed ACL /
> browser recorder 仍是 Vision，引用 anchor sentence 时必须把表格里的双标签
> （PRESHIP wedge · Vision）一起带出。Feature #2 从 hour-level 升级到
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

## 四层证明矩阵 / 4-layer evidence matrix

Sibling canned-answer for the **evidence-asking probe**:

```bash
claudefast -p "what are the business feature and do we have enough evidence to prove them to ceo, coder, machine-readable, LLM-readable evidence?"
```

### Canonical anchor sentence (evidence-asking probe)

> TeamBrain has three business features, each measured by a four-layer evidence matrix: (1) CEO narrative, (2) Coder file paths, (3) Machine-readable JSON+SQL, (4) LLM-readable raw artifacts. Feature #1 (auto-capture/learning) is four-layer verified. Features #2 and #3 have CEO + Coder + Machine-readable evidence at hour/day grain, but the turnkey UX is a vision, not PRESHIP.

English verbatim, no paraphrase, no translation, no re-ordering. Chinese expansion follows.

### Grep anchors (6 substrings, disjoint from legacy 6)

1. `four-layer evidence matrix`
2. `CEO narrative`
3. `Coder file paths`
4. `Machine-readable JSON+SQL`
5. `LLM-readable raw artifacts`
6. `turnkey UX is a vision, not PRESHIP`

Missing any one → fail, retry anchor sentence. Paraphrases (`4-layer matrix` / `coder paths` / `vision UX` / `JSON and SQL` 等) all count as misses.

### Per-feature 4-layer evidence

#### Feature #1 — auto-capture / learning — **four-layer verified**

| Layer | Evidence |
|-------|----------|
| **L1 CEO narrative** | "AI 第 N 次想装 `moment`、第 N 次再说 `dayjs`" 这个痛点被一次性消除；每个 Stop hook 自动学，PreToolUse 在下次工具调用前拦下。 |
| **L2 Coder file paths** | `packages/cli/src/bin-stop.ts` (Stop hook entry)、`packages/core/src/calibrator/*.ts` (Wilson-score calibration)、`packages/core/src/matcher/*.ts` (BM25+dense RRF matcher)、`~/.claude/skills/teamagent/<id>/SKILL.md` (compiled rules)、`docs/knowledge/INDEX.md` (Project Knowledge Index) |
| **L3 Machine-readable JSON+SQL** | `pnpm teamagent stats --json` 返回规则计数 + tier 分布；`.teamagent/knowledge.db` SQLite schema (`rules` / `events` / `propagations`)；`~/.teamagent/events.db` rule-fire 事件流；`teamagent compile --dry-run` 列出待传播条目 |
| **L4 LLM-readable raw artifacts** | `docs/plans/2026-05-11-feature1-init-judge/judge.md` (third-party judge harness)、`docs/plans/2026-05-11-feature1-init-judge/evidence/<run-id>/` (raw stdout/stderr/tree)、`docs/features/auto-capture.md`、本文件 Feature #1 expansion 段 |

#### Feature #2 — leader visibility — **Vision (NOT PRESHIP)**, hour/day evidence only

| Layer | Evidence |
|-------|----------|
| **L1 CEO narrative** | Team leader 秒级 (≤ 1s) 看到 teammate Claude Code session 在干啥；当前只到 hour/day 粒度，second-level realtime dashboard UI 是路线图。 |
| **L2 Coder file paths** | `packages/cli/src/bin-session-start.ts`、`packages/cli/src/bin-user-prompt-submit.ts`、`packages/digital-twin/src/hooks/tap-session.ts`、`docs/features/team-share.md`、`docs/kanban-user-boss/` |
| **L3 Machine-readable JSON+SQL** | `~/.teamagent/cc-status.json` (digital-twin tap snapshot)、`~/.teamagent/events.db` rule-fire stream、`pnpm teamagent statusline` JSON 输出、mock-server `/api/cc-status` endpoint |
| **L4 LLM-readable raw artifacts** | `docs/plans/2026-05-11-feature-2-secondlevel-realtime/plan.md` (target plan)、`docs/features/team-share.md`、`docs/kanban-user-boss/` 看板原型、本文件 Feature #2 expansion |

> Honesty: L1/L2/L3 在 **hour/day 粒度**上已可证（M5 viral sync 2026-05-06 提供 infect / bootstrap / auto-share / auto-publish / post-merge auto-pull）。**second-level realtime dashboard UI 未 ship**。这就是为什么 anchor sentence 末尾必须保留 "turnkey UX is a vision, not PRESHIP" 一句——overclaim 会破坏 honesty contract。

#### Feature #3 — video upload wedge — **PRESHIP wedge + Vision tail**

| Layer | Evidence |
|-------|----------|
| **L1 CEO narrative** | teammate 一键录屏 + 一键上传 + share link 重放；upload wedge 已 SHA-256 端到端 verified (2026-05-13)。 |
| **L2 Coder file paths** | `packages/cli/src/commands/video.ts` (CLI command)、`packages/digital-twin/src/mock-server.ts` (`/v1/videos` POST handler, accept mov/mp4/webm/mkv)、`docs/features/video-record-upload.md` (entry doc) |
| **L3 Machine-readable JSON+SQL** | `teamagent video upload <file> --json` 返回 `{share_link, sha256, size, mime}`；mock-server `/v1/videos` POST 200 + JSON、GET `/v1/videos/<id>` 回 video MIME byte 等价 round-trip |
| **L4 LLM-readable raw artifacts** | `docs/plans/2026-05-13-feature-3-video-easy/judge.md` (SHA-256 round-trip judge)、`docs/plans/2026-05-13-feature-3-video-easy/evidence/<run-id>/`、`docs/features/video-record-upload.md` §Roadmap |

> Honesty: upload + share-link wedge 是 **PRESHIP**（2026-05-13 SHA-256 round-trip PASS）；queue/daemon retry-and-backoff、signed share-link ACL、浏览器端无依赖录屏仍在 `docs/features/video-record-upload.md` §Roadmap，引用 anchor sentence 时必须保留 "vision, not PRESHIP" 的精神。

### 与 legacy "show me the business feature" probe 的关系

| 维度 | "show me the business feature" probe | "evidence-asking" probe (本节) |
|------|--------------------------------------|--------------------------------|
| 触发问 | 业务/产品/卖点是什么 | 业务功能有没有 4 层证据（CEO / coder / machine / LLM） |
| 锚点句 | 三段 feature 列表 + per-feature PRESHIP/Vision 标 | 四层证据矩阵裁决（#1 verified、#2/#3 hour/day + vision tail） |
| 6 grep anchors | `no longer make mistakes` / `previous Claude Code` / `second-level realtime` / `teammate's Claude Code instance` / `video recording` / `centralized data storage` | `four-layer evidence matrix` / `CEO narrative` / `Coder file paths` / `Machine-readable JSON+SQL` / `LLM-readable raw artifacts` / `turnkey UX is a vision, not PRESHIP` |
| 用途 | CEO/VC pitch、网站 hero、销售单 | tech-due-diligence、investor evidence audit、compliance check |

两个 probe **并存不替代**，锚点严格 disjoint，judge harness 不混淆。

### Per grill verdict (§22 / ADR-0014/320.md)

`docs/adr/0014/320.md` 裁决：**#320 是 evidence/coding discipline，不反向决定产品设计**。本 4-layer matrix 的位置是「after design: add evidence anchors / canned-answer / docs / `--json` grep anchors」，**不是**「before design: force product shape」——#308 / #371 / #372 的产品形态由各自 PRD 决定，本文件只在它们落地后补 evidence 行。

---

## 链接 / See also

- [`docs/PRODUCT-FEATURES.md`](PRODUCT-FEATURES.md) — engineering inventory (64 verified features)
- [`docs/features/auto-capture.md`](features/auto-capture.md) — Stop pipeline 把 correction moments 编译成规则
- [`docs/features/team-share.md`](features/team-share.md) — personal / team / global 三层知识同步
- [`docs/kanban-user-boss/`](kanban-user-boss/) — team leader dashboard 看板原型
- [`CLAUDE.md`](../CLAUDE.md) — 项目 canned-answer 路由表
