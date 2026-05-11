# Plan: Feature #2 — Second-level realtime team monitoring

Owner: TBD (主 agent + maintainer)
Created: 2026-05-11
Status: **DRAFT — gated on Q2–Q7 grill resolution before code lands**

Forward references:
- 业务锚点：[`docs/BUSINESS-FEATURES.md`](../../BUSINESS-FEATURES.md) § Feature #2
- PR 计划骨架：[`docs/HOWTO-PLAN-PR.md`](../../HOWTO-PLAN-PR.md)
- 三段铁律：[`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md)
- 上下文沉淀：[`research.md`](./research.md)（同目录）
- 第三方 judge harness：`judge.md`（待 grill 完成后写，本目录）

---

## Task description

把 TeamBrain Feature #2 从「愿景」推到「可演示的 v1」：在 5 个 Claude Code hook
（`SessionStart` / `UserPromptSubmit` / `PreToolUse` / `Stop` / `SessionEnd`）
里 fire-and-forget 推送结构化事件到团队共享 receiver，让 team leader 在 boss
看板上**秒级（≤1s p50）**看到每个 teammate 的 Claude Code session 在做什么。

**做什么**：

- 在上述 5 个 hook 的 `.cjs` bundle 里 emit 结构化事件（envelope schema 见
  Expected outputs §2）；用 fire-and-forget HTTP POST，timeout ≤ 50ms，永不
  阻塞 hook 主路径。
- 复用 `@teamagent/digital-twin` 的 receiver 协议骨架（`bin-prod-server.ts` +
  `mock-server.ts`），新增 streaming endpoint（SSE 或 WebSocket，决定见 Q2）。
- 复用 M5 outbound gate（`secret-scanner.ts` + `scope-classifier.ts`）：
  realtime 流必须同样过双闸；uncertain → scrub / drop，default = personal。
- 扩展 `docs/kanban-user-boss/index.html` 原型，接活数据，每秒刷新。
- teammate 30s 无事件 → 看板 row 状态置「idle」（🔅）；SessionEnd 显式置离线。

**不做什么**：

- 不动 M5 git-sync 路径（hour/day 异步同步作为冗余保留）。
- 不做 video recording（那是 Feature #3）。
- 不做 mobile push / 邮件告警（v1 仅 web 看板）。
- 不做 SSO / 多租户（v1 单团队共享一个 receiver token）。
- 不改 hook 主逻辑（matcher / self-report / digital-twin tap 全部保留）。

---

## Expected outputs

可验收交付物清单（每条必须能被人 / CI / 另一只 agent 看见）：

### §1 代码 / 配置文件

- [ ] `packages/digital-twin/src/realtime-server.ts` — receiver streaming 端点（SSE / WebSocket，Q2 决定）
- [ ] `packages/digital-twin/src/realtime-client.ts` — `postEvent(envelope, {timeoutMs:50})`，永不抛、永不阻塞
- [ ] 5 个 hook bundle 接 realtime push：`bin-pre-tool-use.ts` / `bin-user-prompt-submit.ts` / `bin-stop.ts` / `bin-session-start.ts` / `bin-session-end.ts`
- [ ] `bin-session-end.ts` 同步补 installer wire；现有源码已存在但 `installHook()` 未接
- [ ] `packages/cli/src/commands/realtime-server.ts` — `teamagent realtime serve`
- [ ] `docs/kanban-user-boss/index.html` + `styles.css` — 接 SSE/WebSocket，每秒刷新

### §2 envelope schema（5 channel 通用）

```jsonc
{
  "v": 1,
  "channel": "SessionStart|UserPromptSubmit|PreToolUse|Stop|SessionEnd",
  "ts_ms": 1715472002123,
  "team_id": "sha256(normalize(git_remote))[:16]",
  "user_id": "<digital-twin identity.ts>",
  "machine_id": "<digital-twin identity.ts>",
  "session_id": "<claude-code session>",
  "cwd_hash": "sha256(<cwd>)[:12]",   // 不送原 cwd，防泄漏
  "git_branch": "<branch or null>",
  "payload": {
    // channel-specific (见 §3)
  },
  "scope": "team|personal",            // M5 scope-classifier 输出
  "redacted_fields": ["..."]           // M5 secret-scanner sealed list
}
```

### §3 每通道 payload

- `SessionStart`：`{cold:bool}` — 不送 prompt
- `UserPromptSubmit`：`{prompt_excerpt:str(<=200), prompt_sha:str}` — 过双闸
- `PreToolUse`：`{tool:"Bash|Edit|Write|WebFetch", target_hint:str(<=80)}`
- `Stop`：`{self_report:obj, turn_ms:int, tools_used:int}`
- `SessionEnd`：`{reason:"clear|logout|window_close|signal", turn_count:int}`

### §4 测试

- [ ] `packages/digital-twin/src/__tests__/realtime-contract.ts` — 契约测试
      套件（按 ports 的 contracts 规则；后续任何 receiver 实现都跑同一套）
- [ ] `packages/digital-twin/src/__tests__/realtime-client.test.ts` —
      fire-and-forget 超时 / 离线 / 反压不阻塞 hook
- [ ] `packages/cli/src/__tests__/bin-*-realtime.test.ts` — 每个 hook
      bundle 的 emit 路径单测（5 个）

### §5 看板

- [ ] DOM 在新事件到达后 ≤ 1s 内更新（用 `gstack` skill 实测）
- [ ] 离线 teammate 30s 内置灰
- [ ] secret 字段不出现在 DOM 文本里（privacy probe）

### §6 metric 阈值

- [ ] hook → DOM end-to-end **p50 ≤ 1000 ms, p99 ≤ 3000 ms**
- [ ] hook 主路径 wall-clock 增量 **≤ 5 ms p99**（fire-and-forget）
- [ ] 注入 10 条含 secret 的 prompt，realtime stream 中 **0 条泄漏**

### §7 集成

- [ ] PR 打开（普通 PR，非 draft，参见 CLAUDE.md `开发节奏`）
- [ ] 本地 `/review` skill 循环至 PASS（ADR-0007）
- [ ] squash-merge（`gh pr merge <N> --squash --delete-branch`，参见
      user memory `feedback_squash_only_merge.md`）
- [ ] `docs/plans/2026-05-11-feature-2-secondlevel-realtime/report.md` 写完

---

## How to eval (3rd-party judge harness)

**禁止**让本计划作者 / 实施 agent / 被测代码自评。

Harness 入口：`docs/plans/2026-05-11-feature-2-secondlevel-realtime/judge.md`
（md playbook；按 user memory `feedback_judge_harness_md_playbook.md`，
**不**写固定 bash 脚本）。MAIN agent 通过 subagents（`docs/TEAMWORK.md`
N+1+(2N)）或 `claudefast -p` 探针（`docs/FASTPROBE.md` 最多 8 路并行）调度。

- **§V1 RUN**（subagent fan-out 跑下列固定工具，stdout / stderr 落
  `evidence_dir`）：
  - `pnpm typecheck`
  - `pnpm vitest run packages/digital-twin/src/__tests__/realtime-contract.ts`
  - `pnpm vitest run packages/digital-twin/src/__tests__/realtime-client.test.ts`
  - `pnpm vitest run packages/cli/src/__tests__/bin-*-realtime.test.ts`
  - latency probe：起 mock receiver，模拟每个 hook fire 100 次，记录
    端到端 ms（含网络模拟延迟）
  - privacy probe：注入 10 条含 secret（API key / JWT / email / 私网
    IP / 路径）的 prompt，grep realtime stream payload，期望 0 条命中
  - dashboard E2E：`gstack` / `browse` skill 打开 `docs/kanban-user-boss/
    index.html`，逐 channel 触发事件，screenshot 前后 diff，记录 DOM
    更新延迟

- **§V2 DUMP**：写 canonical JSON 到 `.judge/2026-05-11-feature-2/judge.json`，
  必含 `run_id`、`typecheck.exit_code`、`tests.failed`、`latency.p50_ms/p99_ms`、
  `hook_overhead.p99_ms`、`privacy.secrets_leaked`、`dashboard_e2e.dom_update_p99_ms`、
  `evidence_dir`，并把 stdout / stderr / raw samples / screenshots 放入 evidence。

- **§V3 READ**：另一只 `claudefast -p` 探针只读 raw `judge.json` + 必要
  evidence，输出 `pass | fail | uncertain + 下一步`。判定阈值：

  - typecheck.exit_code == 0
  - tests.failed == 0
  - latency.p50_ms ≤ 1000 && latency.p99_ms ≤ 3000
  - hook_overhead.p99_ms ≤ 5
  - privacy.secrets_leaked == 0
  - dashboard_e2e.dom_update_p99_ms ≤ 1500

  任一未达 → `fail`，judge 必须给出下一步动作建议；任意指标缺失 → `uncertain`。

---

## Open questions（grill-me 后续 Q2–Q7，**gated**）

| # | 问题 | 鸭鸭推荐默认（未拍板） |
|---|------|----------------------|
| Q1 | Hook 范围：2 / 4 / 5 通道？ | **B = 5 通道**（已落 BUSINESS-FEATURES.md ASCII 对比） |
| Q2 | Transport：HTTP POST + SSE / WebSocket / gRPC？ | **HTTP POST + SSE**（fire-and-forget 简单、防火墙友好） |
| Q3 | Receiver 位置：复用 `bin-prod-server.ts`（团队自建 VPS）/ Cloudflare Worker / SaaS？ | **复用 `bin-prod-server.ts`**（已有 token 协议） |
| Q4 | Teammate 身份：`identity.ts` user_id+machine_id / git config user.email / OAuth？ | **`identity.ts` 复用**，git user.email 作为可读 label |
| Q5 | 看板托管：静态 HTML 本地打开 / `teamagent realtime serve` 内嵌 / VSCode panel？ | **`teamagent realtime serve --dashboard`** 内嵌一起跑 |
| Q6 | 离线 buffer：hook 端 receiver 不可达时丢弃 / 排队到 digital-twin uploader / 阻塞？ | **丢弃（fire-and-forget）+ M5 git-sync 兜底**，绝不阻塞 |
| Q7 | 隐私：realtime 流是否强制过 M5 secret-scanner + scope-classifier？ | **是，强制双闸**；uncertain → drop |

→ **本 plan 在 Q2–Q7 grill 拍板前不开始 code 实施。** grill 完成后回填本节、
写 `judge.md`、再分 PR 推进 milestone M-F2-A → M-F2-E。

---

## Milestones（拍板后填）

M-F2-A receiver + schema + contract tests；M-F2-B 5 hook realtime client；
M-F2-C privacy gate + idle heartbeat；M-F2-D live dashboard；M-F2-E metrics +
judge harness + report.md。每个 milestone = 1 个普通 PR，独立 squash-merge。

---

## Risks

- **延迟超 1s**：若 SSE p99 > 3s，回退到每秒 GET `/v1/realtime/state?since=<cursor>`。
- **fire-and-forget 漏报**：hook 不等 ACK；M5 git-sync 保留作最终一致兜底。
- **secret 漏到 stream**：privacy probe 跑满 10 条注入用例，期望 0 泄漏。
- **看板伪在线**：SessionEnd 可能丢；30s 心跳超时置灰。
