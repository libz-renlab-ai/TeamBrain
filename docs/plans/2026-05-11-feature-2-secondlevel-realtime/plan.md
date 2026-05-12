# Plan: Feature #2 — Second-level realtime team monitoring (v2)

```
┌───────────────────────────────┐
│ teammate machine ────────┐    │
│  hook (SessionStart /     │   │
│        UserPromptSubmit) │   │
│   │                       │   │
│   ▼                       │   │
│  cc-status writer ────► JSONL  ── digital-twin uploader ──► receiver
│   (existing store.ts)               (existing bin-uploader)    (existing)
└───────────────────────────│───┘
                            │
                            ▼
              receiver  readLatestAllUsers() ── SSE ──►  kanban DOM
                       (already returns                  (≤1s p50)
                        per-session stale_seconds)
```

Owner: TBD (主 agent + maintainer)
Created: 2026-05-11 (v1), rewritten 2026-05-13 (v2)
Status: **DRAFT — gated on a fresh fixedflow issue + grill cycle before code lands**

## CHANGELOG

- **v2 (2026-05-13)** — re-baselined after Explore-mapped ground truth.
  Q1 locked = **2-channel** (`SessionStart` + `UserPromptSubmit`) per
  `docs/BUSINESS-FEATURES.md` Scope-边界 retraction. Pivoted from greenfield
  SSE design to **"cc-status snapshot store is the realtime backbone"**:
  `packages/digital-twin/src/cc-status/store.ts` already implements
  `readLatestAllUsers` / `readLatestPerSession` returning per-session
  leader-roster rows with computed `stale_seconds` — Feature #2 only needs
  (a) two hook-side emitters, (b) an SSE wrapper around the existing query
  helpers, (c) DOM consumer for the existing `docs/kanban-user-boss/`
  prototype. Code surface ≈ 30% of v1 estimate.
- **v1 (2026-05-11)** — retracted 2026-05-12. Original 5-channel
  (`SessionStart` + `UserPromptSubmit` + `PreToolUse` + `Stop` +
  `SessionEnd`) scope. PreToolUse / Stop / SessionEnd dropped from the
  Feature #2 boss-visibility line per BUSINESS-FEATURES.md.

Forward references:
- 业务锚点：[`docs/BUSINESS-FEATURES.md`](../../BUSINESS-FEATURES.md) § Feature #2
- 三段铁律：[`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md)
- PR 计划骨架：[`docs/HOWTO-PLAN-PR.md`](../../HOWTO-PLAN-PR.md)
- 上下文沉淀：[`research.md`](./research.md)（同目录）
- 第三方 judge harness：`judge.md`（待 grill 完成后写，本目录）
- 草稿 fixedflow issue body：[`draft-feature-2-v2-issue.md`](./draft-feature-2-v2-issue.md)

---

## Task description

把 TeamBrain Feature #2 从「愿景」推到「可演示的 v1」：在 **2 个** Claude
Code hook（`SessionStart` / `UserPromptSubmit`）里 fire-and-forget 推送
**cc-status snapshot**（schema 已存在，复用 `CcStatusSnapshot` type）到团队共享
receiver；leader 在 boss 看板上 **秒级（≤1s p50, ≤3s p99）** 看到每个 teammate
的 Claude Code session 当前在做什么。

### 做什么

- 在 `bin-session-start.cjs` + `bin-user-prompt-submit.cjs` 两个 hook bundle 里
  emit `CcStatusSnapshot`（v1 schema 已在 `packages/digital-twin/src/cc-status/types.ts`），
  payload 含 `event` 字段区分 channel（值取 `session_start` / `user_prompt_submit`）。
- fire-and-forget HTTP POST 到 `<receiver>/v1/cc-status`（端点已在
  `bin-prod-server.ts`），`timeoutMs ≤ 50`，永不阻塞 hook 主路径。
- **新增 SSE wrapper**：`GET /v1/cc-status/stream?team_id=<id>` 在 receiver
  上跑 `readLatestAllUsers` 每 1s 一次 diff + push delta；keep-alive 30s。
- **复用 M5 双闸**：`secret-scanner.ts` + `scope-classifier.ts` 套在
  hook-emit 路径上；uncertain → drop（**不发**给 receiver）。
- 给 `docs/kanban-user-boss/index.html` 接 SSE 数据源；DOM 每秒刷新；
  teammate 30s 无事件 → row 置灰（`stale_seconds > 30`，已由 store 计算）。

### 不做什么

- **不**加 `PreToolUse` / `Stop` / `SessionEnd` 通道（v1 scope-retracted；
  那三个 hook 在 Feature #1 / cc-status / digital-twin tap 里另有用途但与
  Feature #2 boss-visibility 链路无关）。
- **不**动 M5 git-sync 路径（hour/day 异步同步保留作最终一致兜底）。
- **不**做 video recording（那是 Feature #3）。
- **不**做 mobile push / 邮件告警 / SSO / 多租户（v1 单团队、单 receiver token）。
- **不**改 cc-status store 内部 schema / 路径 / rotate 逻辑（已稳，issue #350
  落地，store.ts 已是 sanitized + rotated + path-safe）。
- **不**新写 receiver 项目骨架（复用 `bin-prod-server.ts` + `mock-server.ts`）。

---

## Expected outputs

可验收交付物清单（每条必须能被人 / CI / 另一只 agent 看见）：

### §1 代码 / 配置文件

- [ ] `packages/cli/src/bin-session-start.ts` — 在现有逻辑末尾补
      `postCcStatusSnapshot({ event: 'session_start', ... })`，fire-and-forget
- [ ] `packages/cli/src/bin-user-prompt-submit.ts` — 同上，
      `event: 'user_prompt_submit'`，过 secret-scanner + scope-classifier
      后再发
- [ ] `packages/digital-twin/src/realtime-client.ts` — `postCcStatusSnapshot
      (envelope, {timeoutMs:50, baseUrl})`，永不抛、永不阻塞；
      timeout / 离线 / 5xx 全部 swallow（hook 主路径不感知）
- [ ] `packages/digital-twin/src/realtime-stream.ts` — SSE handler，
      内部 1s 轮询调 `readLatestAllUsers(outputDir, now)`，diff 后 push
- [ ] `packages/digital-twin/src/bin-prod-server.ts` — 注册
      `GET /v1/cc-status/stream` 路由
- [ ] `docs/kanban-user-boss/index.html` + `kanban.js` —
      `new EventSource('/v1/cc-status/stream?team_id=...')`，
      onmessage → DOM row update
- [ ] `docs/kanban-user-boss/styles.css` — `.row.stale { opacity: 0.4; }`
      / `.row.fresh { ... }`

### §2 envelope（沿用现有 `CcStatusSnapshot`）

无 schema 变更。只在 hook-emit 时把 `event` 字段写为
`session_start` / `user_prompt_submit`，其余字段（`session_id`, `user_id`,
`ts`, `model`, `cwd`, `git_branch`, `context_tokens` 等）按
`packages/digital-twin/src/cc-status/types.ts` 已有契约填充。**禁止**
新增私有 schema —— 任何 Feature #2 字段需求都改 cc-status types.ts 并跑契约
测试。

### §3 测试

- [ ] `packages/digital-twin/src/__tests__/realtime-client.test.ts` —
      fire-and-forget 超时 / 离线 / 5xx 三种失败下，`postCcStatusSnapshot`
      不抛、不阻塞、不重试（重试由 M5 git-sync 兜底）
- [ ] `packages/digital-twin/src/__tests__/realtime-stream.test.ts` —
      SSE handler：3 个用户 × 2 session 写入 → stream 30s 内 emit ≥1
      keep-alive；新写入到达后 ≤1s 推到 client
- [ ] `packages/cli/src/__tests__/bin-session-start-realtime.test.ts` —
      hook bundle emit 路径单测；receiver mock 下 timeout=10ms 仍然 hook
      正常返回
- [ ] `packages/cli/src/__tests__/bin-user-prompt-submit-realtime.test.ts` —
      同上 + secret-scanner gate 验证（注入含 API key 的 prompt → 不发）

### §4 看板

- [ ] DOM 在新事件到达后 ≤ 1s 内更新（用 `gstack` skill 实测）
- [ ] 离线 teammate 30s 内置灰（`stale_seconds > 30` 已由 store 计算）
- [ ] secret 字段不出现在 DOM 文本里（privacy probe，注入 10 条带 secret 的
      prompt，grep DOM innerText）

### §5 metric 阈值

- [ ] hook → DOM end-to-end **p50 ≤ 1000 ms, p99 ≤ 3000 ms**
- [ ] hook 主路径 wall-clock 增量 **≤ 5 ms p99**（fire-and-forget，
      timeoutMs=50）
- [ ] secret-scanner 10 条注入用例 **0 条** 泄漏到 realtime stream
- [ ] receiver `readLatestAllUsers` 在 30 user × 3 session × 200 snapshot
      负载下 **p99 ≤ 100ms**（确保 SSE 1s 轮询不被读 IO 拖垮）

### §6 集成

- [ ] PR 打开（普通 PR，非 draft；CLAUDE.md `开发节奏`）
- [ ] 本地 `/review` skill 循环至 PASS（ADR-0007）
- [ ] squash-merge（`gh pr merge <N> --squash --delete-branch`；user memory
      `feedback_squash_only_merge.md`）
- [ ] `docs/plans/2026-05-11-feature-2-secondlevel-realtime/report.md` 写完
- [ ] `~/.teamagent/teambrain/issue_tracking.html` 更新（`docs/ISSUE-TRACKING.md`）

---

## How to eval (3rd-party judge harness)

**禁止**让本计划作者 / 实施 agent / 被测代码自评（user memory
`feedback_verification_only_judge_harness.md`）。

Harness 入口：`docs/plans/2026-05-11-feature-2-secondlevel-realtime/judge.md`
（md playbook；按 user memory `feedback_judge_harness_md_playbook.md`，
**不**写固定 bash 脚本）。MAIN agent 通过 subagents（`docs/TEAMWORK.md`
N+1+(2N)）或 `claudefast -p` 探针（`docs/FASTPROBE.md` 最多 8 路并行）调度。

### §V1 RUN — subagent fan-out 跑下列固定工具

stdout / stderr 落 `evidence_dir`：

- `pnpm typecheck`
- `pnpm vitest run packages/digital-twin/src/__tests__/realtime-client.test.ts`
- `pnpm vitest run packages/digital-twin/src/__tests__/realtime-stream.test.ts`
- `pnpm vitest run packages/cli/src/__tests__/bin-session-start-realtime.test.ts`
- `pnpm vitest run packages/cli/src/__tests__/bin-user-prompt-submit-realtime.test.ts`
- **latency probe**：起 mock receiver，模拟两个 hook fire 100 次，记录
  端到端 ms（hook → SSE client message handler）
- **privacy probe**：注入 10 条含 secret（API key / JWT / email / 私网
  IP / 路径）的 prompt，grep 整个 SSE stream payload + DOM innerText，
  期望 **0 条** 命中
- **dashboard E2E**：`gstack` / `browse` skill 打开
  `docs/kanban-user-boss/index.html`（指向 mock receiver），逐 channel
  触发事件，screenshot 前后 diff，记录 DOM update 延迟
- **roster IO load probe**：在 mock outputDir 下生成 30 user × 3 session ×
  200 snapshot，连续 60s 每秒调一次 `readLatestAllUsers`，记录 p50 / p99

### §V2 DUMP — canonical JSON

写 `.judge/2026-05-13-feature-2-v2/judge.json`，必含：

- `run_id`
- `typecheck.exit_code`
- `tests.failed`
- `latency.p50_ms` / `latency.p99_ms`（hook → DOM）
- `hook_overhead.p99_ms`（hook 主路径增量）
- `privacy.secrets_leaked`
- `dashboard_e2e.dom_update_p99_ms`
- `roster_io.p50_ms` / `roster_io.p99_ms`
- `evidence_dir`

stdout / stderr / raw samples / screenshots 全部入 `evidence_dir`。

### §V3 READ — 另一只 `claudefast -p` 探针

只读 raw `judge.json` + 必要 evidence，输出 `pass | fail | uncertain +
下一步`。判定阈值：

- `typecheck.exit_code == 0`
- `tests.failed == 0`
- `latency.p50_ms ≤ 1000 && latency.p99_ms ≤ 3000`
- `hook_overhead.p99_ms ≤ 5`
- `privacy.secrets_leaked == 0`
- `dashboard_e2e.dom_update_p99_ms ≤ 1500`
- `roster_io.p99_ms ≤ 100`

任一未达 → `fail`；任一指标缺失 → `uncertain`。judge 必须给出下一步动作建议。

---

## Open questions（Q2–Q7 — 本 plan 在 grill 拍板前不开始 code）

| # | 问题 | v2 鸭鸭推荐（未拍板） |
|---|------|----------------------|
| ~~Q1~~ | ~~Hook 通道范围？~~ | **已锁 = 2 通道**（SessionStart + UserPromptSubmit）。BUSINESS-FEATURES.md Scope-边界 retraction。 |
| Q2 | Transport：HTTP POST + SSE / WebSocket / 长轮询？ | **HTTP POST（已有）+ SSE（新增）**。fire-and-forget 简单、防火墙友好；receiver 端 SSE 实现在 1s 轮询 `readLatestAllUsers` 之上，逻辑独立于 client。 |
| Q3 | Receiver 位置：自建 VPS 跑 `bin-prod-server.ts` / Cloudflare Worker / SaaS？ | **自建 VPS 跑 `bin-prod-server.ts`**（已有 token 协议 + cc-status 路由 + uploader 协议）。Cloudflare Worker 不能跑长连接 SSE（限 30s）。 |
| Q4 | Teammate 身份：复用 `identity.ts` user_id+machine_id？ | **复用**（已稳）。`display_name` 沿用 git `user.email`。 |
| Q5 | 看板托管：静态 HTML 本地打开 / `teamagent realtime serve` 内嵌 / VSCode panel？ | **`teamagent realtime serve --dashboard` 内嵌**（`bin-prod-server.ts` 加 static handler，同进程 serve 静态文件 + SSE）。 |
| Q6 | 离线 buffer：hook 端 receiver 不可达时丢弃 / 排队 / 阻塞？ | **丢弃（fire-and-forget）**；M5 git-sync 保留作最终一致兜底。绝不阻塞 hook。 |
| Q7 | 隐私：realtime emit 是否强制过 M5 secret-scanner + scope-classifier？ | **是，强制双闸**。uncertain → drop。team 边界继续用 `team_id = SHA256(normalize(git remote))[:16]`。 |

→ **本 plan 在 Q2–Q7 grill 拍板前不开始 code 实施。** grill 完成后回填本节、
写 `judge.md`、再分 PR 推进 milestone M-F2-A → M-F2-D。

---

## Milestones（grill 拍板后填）

- **M-F2-A** — `realtime-client.ts` + `realtime-stream.ts` + 契约测试（1 个 PR）
- **M-F2-B** — 两个 hook bundle 接 realtime push + secret 闸门（1 个 PR）
- **M-F2-C** — 看板 DOM 接 SSE + privacy probe + roster IO load probe（1 个 PR）
- **M-F2-D** — judge harness 跑全套 + report.md + metric 达阈（1 个 PR）

每个 milestone = 1 个普通 PR，独立 squash-merge。**禁 draft PR**
（CLAUDE.md `开发节奏`）。

---

## Risks

- **延迟超 1s**：若 SSE 1s 轮询 + `readLatestAllUsers` p99 > 1000ms，
  回退到 receiver 维护 in-memory hot cache（写入时 invalidate），不再每次
  扫盘。
- **fire-and-forget 漏报**：hook 不等 ACK；M5 git-sync hour-cadence 兜底
  最终一致；用户接受「秒级精度但偶尔丢点」语义（pitch deck 已确认）。
- **secret 漏到 stream**：privacy probe 10 条注入用例 + DOM grep + SSE
  payload grep，期望 0 泄漏。
- **看板伪在线**：`stale_seconds > 30` 自动置灰，无需 SessionEnd hook。
- **roster IO 撑不住**：load probe 跑 30 user × 3 session × 200 snapshot，
  p99 ≤ 100ms；超阈触发上面的 hot-cache 回退方案。
- **Cross-host issue claim race**：`/fixed-flow-driver` 已通过
  `docs/PRE-IMPLEMENT-CLAIM.md` 的 `grill-working` label 跨主机互斥，
  本 plan 无新风险。
