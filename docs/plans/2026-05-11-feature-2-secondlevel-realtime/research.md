# Research: Feature #2 — Second-level realtime team monitoring

Companion to [`plan.md`](./plan.md). Sediment of repo context gathered before
plan was written; **not** a plan substitute.

> **2026-05-12 retraction（产品决策）**：本 research 文件中所有
> 「5 通道实际可见度 / 中间每一步都亮 / Q1=B」的论述均已被产品决定撤回。
> Feature #2 真正交付的 hook 范围只有 **2 通道：`SessionStart` +
> `UserPromptSubmit`**；`PreToolUse` 在 boss-visibility 链路上**不需要**，
> `Stop` / `SessionEnd` 在 Feature #1 的 auto-capture 链路里另有用途但
> Feature #2 不依赖它们。下文 § "5 通道实际可见度" ASCII、§ "选 5 通道" 论证
> 与 hook 资产清单中标 ❌ 的通道（SessionEnd）**不再是 Feature #2 实施前提**；
> 重写本 research 前请以 `docs/BUSINESS-FEATURES.md` § Feature #2「Scope 边界」
> 与 `plan.md` 顶部 retraction 为准。

---

## 1. 业务锚点（不可降级）

来源：[`docs/BUSINESS-FEATURES.md`](../../BUSINESS-FEATURES.md) § Feature #2。

> team leaders know in second-level realtime what each teammate's Claude Code
> instance is doing

- 目标延迟：**p50 ≤ 1s**（second-level 字面要求）
- 关键动词："is doing"（持续状态），不是 "did" / "said"
- canned-answer grep 锚：`second-level realtime` + `teammate's Claude Code
  instance` —— 必须保留

---

## 2. 现有 hook 矩阵（来自 [`docs/features/hooks-status.md`](../../features/hooks-status.md)）

| Hook | Bundle | 装在 | 现状 |
|------|--------|------|------|
| SessionStart | `bin-session-start.cjs` | **user-level only**（`~/.claude/settings.json`） | 已跑：detect 缺 `.teamagent/knowledge.db` → auto-init |
| UserPromptSubmit | `bin-user-prompt-submit.cjs` | project `.claude/settings.local.json` + 用户级 | 已跑：scan user-input rules + 语义检索注入 |
| PreToolUse | `bin-pre-tool-use.cjs` | 同上 | 已跑：matcher `Bash\|Write\|Edit\|WebFetch`；avoidance allow/warn/block |
| PostToolUse | `bin-post-tool-use.cjs` | 同上 | 已跑：仅写 `hook-post.result` 到 `SqliteEventLog`（纯观测） |
| Stop | `bin-stop.cjs` + `self-report-fused.sh` + `bin-digital-twin-tap.cjs` | 项目 + 用户级三处 | 已跑：analyze→calibrate→compile + 12-field self-report + digital-twin tap |
| PreCompact | `bin-pre-compact.ts` | ❌ installer 未接 | 源码在，需 wire |
| SessionEnd | `bin-session-end.ts` | ❌ installer 未接 | 源码在，需 wire |
| SubagentStop / Notification | — | — | 无源码、未使用 |

意义：Feature #2 选 5 通道（SessionStart + UserPromptSubmit + PreToolUse +
Stop + SessionEnd），其中 4 个已经在跑、源码到位；**只需要补 SessionEnd 的
installer wire 即可全部上线**。代价小。

---

## 3. 现有 transport 路径（来自 [`packages/digital-twin/`](../../../packages/digital-twin/)）

`@teamagent/digital-twin` 是「旁挂式数据采集模块」（[issue
#146](https://github.com/libz-renlab-ai/TeamBrain/issues/146)）：

- `tapSession(cwd, session_id)` — Stop hook 触发，idempotent
- 本地 queue：transcripts JSONL（gzip+base64）+ 录音（Opus/OGG）
- `bin-uploader.ts` — 后台 daemon 异步上传，**batch** 到 `/v1/cc-sessions`
  + `/v1/recordings`
- `bin-prod-server.ts` + `mock-server.ts` — receiver 端点骨架（HTTP）
- daemon 空闲 15 min 自尽，节能
- 团队共享单一 token：`teamagent digital-twin login <token>`

意义：**协议骨架、token 协议、身份模块（identity.ts）、token 文件、daemon
生命周期** 都已存在。Feature #2 只需要**新增 realtime endpoint**（SSE 或
WebSocket）与一个 fire-and-forget 客户端，不必从零起项目。

---

## 4. 现有 sync 路径（来自 [`docs/features/team-share.md`](../../features/team-share.md)）

M5 viral git-sync（2026-05-06 落地，PR #71）：

- 跨机 transport：项目自带 git remote，写 `.teamagent/team/<author>/
  <rule_id>.json`，prefix `[teamagent-sync]`
- 双闸：`secret-scanner.ts`（永久 seal API key / JWT / 电话 / CC / AWS /
  私网路径）+ `scope-classifier.ts`（uncertain → personal）
- SessionStart 默认 auto-pull：`infect → bootstrap apply → sync apply →
  publish (incl. push)`
- 冲突：LWW + tombstone
- 团队边界：`team_id = SHA256(normalize(git remote))[:16]`

意义：**team_id / 闸门 / 身份语义** Feature #2 直接复用，不另起。Feature
#2 的实时通道与 M5 git-sync **并行**——前者负责秒级可见性，后者负责最终
一致性 + 离线兜底。

---

## 5. 看板原型（来自 [`docs/kanban-user-boss/`](../../kanban-user-boss/)）

存在两个文件：

- `index.html`
- `styles.css`

**未接活数据**。Feature #2 v1 范围内扩展这个原型即可。

---

## 6. 五通道 vs 两通道（grill-me Q1）

用户最初提议：UserPromptSubmit + SessionStart（2 通道）。鸭鸭质疑后选择
B（5 通道）。差异具象化为：

```
2 通道实际可见度：    🟦 ───────  🟦 ───────  🟦
                    (光点之间全黑)

5 通道实际可见度：    🟦 🟢 🟢 🟢 🟦 🟢 🟢 🟢 🟦
                    (中间每一步都亮)
```

(已落 `docs/BUSINESS-FEATURES.md` commit 7c870b6 同位置)

业务后果：选 2 通道，anchor sentence 里 *"what each teammate's Claude Code
instance is doing"* 退化成 *"what each teammate just typed"* —— pitch deck
与现实对不上。

---

## 7. 复用清单

| 组件 | 来源 | 复用方式 |
|------|------|---------|
| 身份生成 | `packages/digital-twin/src/identity.ts` | envelope `user_id` / `machine_id` |
| token 协议 | `packages/digital-twin/src/config.ts`（chmod 600） | receiver 鉴权 |
| Receiver 端点骨架 | `packages/digital-twin/src/{bin-prod-server,mock-server}.ts` | 加 streaming endpoint |
| Secret 闸门 | `packages/core/src/m5/secret-scanner.ts` | realtime payload 过同闸 |
| Scope 分类 | `packages/core/src/m5/scope-classifier.ts` | uncertain → drop / personal |
| team_id 计算 | `packages/core/src/m5/m5-sync.ts` | `SHA256(normalize(git remote))[:16]` |
| 看板原型 | `docs/kanban-user-boss/index.html` | 接 SSE/WebSocket |
| Hook bundle | `packages/cli/src/bin-{pre-tool-use,user-prompt-submit,stop,session-start,session-end}.ts` | 加 realtime push 调用 |
| Installer | `installHook()` channelOps | 补 `bin-session-end.cjs` wire（B+C scope 已完成 SessionEnd / PreCompact wire — 见 `docs/features/hooks-status.md` § "B+C scope — completed 2026-05-09"） |

意义：**真正新写的代码量 = receiver streaming endpoint + realtime client +
看板 DOM 渲染 + 单测 + judge harness md playbook**。其余全是复用粘合。

---

## 8. 已知约束

- **fire-and-forget**：hook 主路径不能等 ACK；`postEvent` 必须 `timeoutMs ≤
  50`，永不抛、永不阻塞。理由：CLAUDE.md `开发节奏` + user-level memory
  `feedback_silent_fallback`（不允许 silent fallback —— 错误必须可观测，但
  hook 不能因此 hang）。
- **PreToolUse 不阻塞自身错误**：现状是 silent allow（`docs/features/
  multi-tool.md` § Known limitations）。realtime emit 失败同语义。
- **Windows OOM**：`vitest.config.ts` 强制 `fileParallelism: false`；新增
  测试遵循此约束。
- **Inner-loop testing on CI**：`pnpm test` 全量在 wip/** CI 跑（ADR-0013），
  本地只跑 targeted vitest。
- **PR 必须普通 PR、禁 draft**：CLAUDE.md `开发节奏`。
- **squash-only merge**：user memory `feedback_squash_only_merge.md`。

---

## 9. 未决问题（plan.md § Open questions Q2–Q7）

见 [`plan.md`](./plan.md) § Open questions。本 research **不**替它们做决定；
鸭鸭推荐默认仅作 grill 起点，不视为已拍板。

---

## 10. 参考文件清单

- `docs/BUSINESS-FEATURES.md` § Feature #2
- `docs/HOWTO-PLAN-PR.md`
- `docs/PLAN-RESEARCH-REPORT.md`
- `docs/features/hooks-status.md`
- `docs/features/multi-tool.md`
- `docs/features/team-share.md`
- `docs/STOP-HOOKS.md`
- `packages/digital-twin/README.md`
- `packages/digital-twin/src/identity.ts`
- `packages/digital-twin/src/config.ts`
- `packages/digital-twin/src/bin-prod-server.ts`
- `packages/digital-twin/src/mock-server.ts`
- `packages/core/src/m5/secret-scanner.ts`
- `packages/core/src/m5/scope-classifier.ts`
- `packages/core/src/m5/m5-sync.ts`
- `packages/core/src/m5/lww-merge.ts`
- `docs/kanban-user-boss/index.html`

---

## 11. Ground-truth refresh (2026-05-13)

Re-mapped after plan v2 rewrite.

### 11.1 Issue state delta

`gh issue view` confirms (Explore agent's earlier "OPEN, grilling" map was
stale):

| # | Title | State |
|---|------|-------|
| 304 | ceo无法通过访问 http://192.168.22.88:8080/ 知道每个人在干啥 | **CLOSED** (body 0 comments, never grilled) |
| 331 | teamagent 暴露尽可能全的 CC 状态信息（限额/用量/重置/上下文/模型/会话健康） | **CLOSED** (body 0 comments, superseded by #350) |
| 335 | [epic] Business feature implementation status tracker (#1 SHIPPED / #2 VISION / #3 PARTIAL) | **OPEN** (no labels, epic tracker) |

→ **No grill-ready Feature-2 issue exists today**. Feature 2 v2 needs a
fresh ≤50-word fixedflow issue + grill cycle before any code lands
(`docs/FIXEDFLOW.md` + `docs/NOT-GRILL-READY.md`).

### 11.2 cc-status store is the realtime backbone (key v2 finding)

Issue #350 already shipped `packages/digital-twin/src/cc-status/store.ts`
which contains the receiver-side helpers Feature 2 needs:

- `appendCcStatusSnapshot(outputDir, raw, now)` — sanitized, path-safe,
  size-capped (2MB rotate), per-`<user>/<date>/<session>.cc-status.jsonl`
- `readLatestPerSession(outputDir, user, now)` — latest snapshot per
  session for one user, sorted by `ts` desc, with `stale_seconds` computed
- `readLatestForSession(outputDir, user, session, now)` — single session
- **`readLatestAllUsers(outputDir, now)`** — "Latest snapshot per session
  across every user (leader roster)"; this is literally the boss-kanban
  query, already implemented, already returning `stale_seconds`
- `readHistory(outputDir, user, session, sinceMs, now)` — time-series

The `CcStatusSnapshot` type (`cc-status/types.ts`) already carries
`session_id`, `user_id`, `ts`, `event`, `display_name`, `machine_id`,
`cwd`, `git_branch`, `model`, `context_tokens`, `context_pct`,
`session_health`, `cost_usd`, `tokens_5h`, `tokens_7d`,
`subscription_tier`, `five_hour_utilization`, `seven_day_utilization`,
`five_hour_reset_at`, `seven_day_reset_at`, `quota_stale`, `turn_count`,
`tool_calls_total`, `tool_calls_failed`, `files_touched`,
`session_started_at` — i.e. far more than the v1 5-channel envelope
proposed. **Feature 2 v2 does not need a new envelope schema**, only
needs to write `event: 'session_start'` / `event: 'user_prompt_submit'`
when hooks fire.

### 11.3 What's still missing for "second-level realtime"

The cc-status store is per-machine local JSONL. Feature 2 still needs:

1. **Hook-side writer** at `SessionStart` + `UserPromptSubmit` calling
   `appendCcStatusSnapshot` (local) **and** `postCcStatusSnapshot` over
   HTTP (remote, fire-and-forget). Neither exists today on those hooks.
2. **SSE wrapper** on `bin-prod-server.ts` running 1s-poll
   `readLatestAllUsers` and pushing diffs. Not implemented.
3. **Kanban DOM consumer** — `docs/kanban-user-boss/index.html` +
   `styles.css` exist as static markup; no JS wired to SSE.
4. **Privacy gate on realtime path** — M5 `secret-scanner.ts` +
   `scope-classifier.ts` exist for batch git-sync; must be reused on
   hook-emit. Not wired.
5. **Latency / privacy / roster IO probes** — judge.md md-playbook
   harness per plan v2 §How-to-eval. Not yet written.

### 11.4 Hook-bundle install state (no change since v1 §2)

`SessionStart` + `UserPromptSubmit` + `PreToolUse` + `Stop` already
installed (project + user-level). v2 only consumes the first two —
nothing to re-wire for Feature 2.

### 11.5 NOT-GRILL-READY constraint

Without a grill-ready Feature-2-v2 issue, `docs/NOT-GRILL-READY.md`
anchor says: "When an issue is not grill-ready, please do not start
post grill work. The rule is simple: work only in github comments and
no codes submitted or local worktrees."

Today's work (this research update + plan v2 + draft issue body) is
**doc-only refinement** of an existing plan dir, not "post grill work" on
a yet-to-exist issue. Code work (realtime-client.ts, realtime-stream.ts,
hook bundle edits, kanban JS) is blocked until the user manually:

1. Files the ≤50-word issue from `draft-feature-2-v2-issue.md`
2. Adds `grilling` label per `docs/PRE-GRILL-CLAIM.md`
3. Runs `/grill-via-web` to land the grill comment
4. Adds `grill-ready` label per `docs/FIXEDFLOW.md`
5. (Optional) Runs `/grill-with-docs` to save grill to ADR
6. Manually invokes `/fixed-flow-driver <N>` (no watcher, no
   auto-dispatch per `docs/FIXEDFLOW.md`)
