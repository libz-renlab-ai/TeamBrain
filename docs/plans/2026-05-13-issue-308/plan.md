```
┌──────────────────────────────────────────────────────────────────────────┐
│ Issue #308 — 满足 leader 微管理的需求                                       │
│                                                                            │
│   grill verdict §31:                                                       │
│   "立即上报 SessionStart/UserPromptSubmit；green light；完整 prompt evidence" │
│                                                                            │
│   ┌─────────────┐    ┌─────────────────┐    ┌──────────────────────┐      │
│   │ Hook fires  │ →  │ emitCcStatus    │ →  │ receiver /v1/cc-     │      │
│   │ (SS/UPS/Stop│    │ + raw_prompt    │    │ status (per-user)    │      │
│   └─────────────┘    └─────────────────┘    └──────────┬───────────┘      │
│                                                          │                 │
│         ┌────────────────────────────────────────────────┘                 │
│         ↓                                                                  │
│   ┌──────────────────────┐    ┌────────────────────────────┐              │
│   │ computePresenceState │ →  │ active / idle / offline /   │              │
│   │ (pure FCIS core)     │    │ error  (4-state)            │              │
│   └──────────────────────┘    └────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────┘
```

# Plan — issue #308 event-upload bedrock + presence state machine

> Grill: [docs/adr/0014/308.md](../../adr/0014/308.md) (§2 + §3 + §11).
> Source: [chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46](https://chatgpt.com/s/t_6a03861d49b081918ed2c900f3870c46).
> Follows [docs/HOWTO-PLAN-PR.md](../../HOWTO-PLAN-PR.md) 4-section structure.

## 1. Task description

**做什么.** 把 issue #308 的 grill verdict §2/§3/§11 落到代码：让 SessionStart / UserPromptSubmit / Stop 三类 Claude Code hook 都成为 leader 首页 green light 的事件来源，并提供一个 pure FCIS presence state machine 把这些 hook 事件归约成 `active / idle / offline / error` 四态。

**当前状态（research 结果）.**

- ✅ SessionStart hook (`packages/cli/src/bin-session-start.ts`) 已经 emit `event: "session_start"` cc-status snapshot（PR #401/#404 已落地）。
- ✅ UserPromptSubmit hook (`packages/cli/src/bin-user-prompt-submit.ts`) 已经 emit `event: "user_prompt_submit"`。
- ✅ `CcStatusSnapshot` schema (`packages/digital-twin/src/cc-status/types.ts`) 已经定义；POST `/v1/cc-status` 已经存在。
- ✅ `realtime-emit.ts` 已经做好 env-gated 默认 loopback-only fire-and-forget；50ms timeout，不阻塞 hook 主路径。
- ❌ Stop hook (`packages/cli/src/bin-stop.ts`) **没有** emit cc-status — green light 永远不会变 offline。
- ❌ SessionEnd hook (`packages/cli/src/bin-session-end.ts`) **没有** emit cc-status — 同上。
- ❌ `CcStatusSnapshot` schema 没有 `raw_prompt` 字段 — grill §3 要求 "完整存 raw prompt"。
- ❌ 没有 presence state machine — leader 端没办法把 snapshot 历史归约成 4 态。
- ❌ 没有 `pnpm teamagent presence` CLI — 没法在本地肉眼 verify "我现在是 active 还是 idle"。

**怎么做（implementation order，每步一个 atomic commit）.**

1. **`feat(issue-308): add raw_prompt optional field to CcStatusSnapshot`** — 在 `packages/digital-twin/src/cc-status/types.ts` 添加 `raw_prompt?: string` 字段（additive，schema_version 不变，下游 receiver 不变）。
2. **`feat(issue-308): UserPromptSubmit emit raw_prompt under TEAMAGENT_REALTIME_RAW_PROMPT`** — 在 `packages/cli/src/bin-user-prompt-submit.ts` 的 emitCcStatus 调用里，如果 `process.env.TEAMAGENT_REALTIME_RAW_PROMPT === "1"` 就把 `input.prompt` 透传到 `raw_prompt`。默认 off（隐私默认，需要用户显式 opt-in）。
3. **`feat(issue-308): Stop hook emits cc-status with event=stop`** — 在 `packages/cli/src/bin-stop.ts` 的 main handler 里调用 `emitCcStatus({ event: "stop", sessionId, cwd })`。
4. **`feat(issue-308): SessionEnd hook emits cc-status with event=session_end`** — 同上，在 `bin-session-end.ts`。
5. **`feat(issue-308): presence state machine in packages/core/src/presence/`** — 新文件 `state-machine.ts` 实现 pure FCIS function `computePresenceState(input: PresenceInput, now: number, config?: PresenceConfig): PresenceState`，4 态：`active | idle | offline | error`。默认 TTL：`active_ttl=10min`, `idle_after=10min`, `offline_after=60min`, `Stop=immediate offline`。
6. **`feat(issue-308): teamagent presence CLI subcommand`** — 新文件 `packages/cli/src/commands/presence.ts` + 注册到 `packages/cli/src/teamagent.ts`。fetch `${TEAMAGENT_REALTIME_URL}/api/cc-status/latest?user_id=<self>`，喂给 `computePresenceState`，print 一个 `state=active (last_event=user_prompt_submit, 2m 14s ago)` 风格的单行。无 URL 时打印 `state=unknown (TEAMAGENT_REALTIME_URL not set)` 并 exit 0。
7. **`feat(issue-308): tests for presence state machine + bin-stop emit`** — vitest 单元测试覆盖 state machine 4 态边界 + Stop hook emit one snapshot 行为。

**不做的事.**

- ❌ 不实现服务器端 `raw_events` 表。grill §2 提到 "raw prompt 完整写入 raw_events" 是 receiver-side 数据层，本仓库（client side）只负责按 schema POST。Server-side schema 是 follow-up（且会跨多个 issue，per `docs/adr/0014/batch-2026-05-13-architecture.md` 的 cross-cutting）。
- ❌ 不实现 `normalized_event` summary/tags/work_item hint 生成 — grill §2 明确这是 downstream job。
- ❌ 不实现 #371 daily summary 集成 — grill §31 verdict 明确 "#308 不作为 #371 日报的主数据源"。
- ❌ 不实现 #372 anomaly detection / live inspection — grill §22 明确 #308 只是 "AI event source 边界"。
- ❌ 不破坏现有 `TEAMAGENT_REALTIME_URL` env-gated default loopback-only contract — 任何新增 field 必须保持 backward compat。
- ❌ 不修改 SessionStart / UserPromptSubmit 现有 emit 行为（只是 UserPromptSubmit 在 opt-in flag 下额外带 raw_prompt）。

## 2. Expected outputs

**新增文件.**

- `packages/core/src/presence/state-machine.ts` — pure FCIS state machine。
- `packages/core/src/presence/state-machine.test.ts` (or `__tests__/state-machine.test.ts`) — 4-state boundary tests。
- `packages/cli/src/commands/presence.ts` — `pnpm teamagent presence` subcommand 实现。
- `packages/cli/src/__tests__/presence-command.test.ts` — CLI smoke test（env-gated mocking）。
- `docs/plans/2026-05-13-issue-308/research.md` — 本研究产出（已写）。
- `docs/plans/2026-05-13-issue-308/report.md` — Boris workflow report（merge 后写）。
- `docs/plans/2026-05-13-issue-308/judge.md` — 本计划的 third-party judge harness playbook。

**修改文件.**

- `packages/digital-twin/src/cc-status/types.ts` — 添加 `raw_prompt?: string` 字段 + 注释说明 opt-in flag。
- `packages/cli/src/bin-user-prompt-submit.ts` — 透传 `raw_prompt` 给 emitCcStatus（条件 opt-in）。
- `packages/cli/src/realtime-emit.ts` — `EmitInput` 增加 `rawPrompt?: string` 字段 + 透传给 snapshot。
- `packages/cli/src/bin-stop.ts` — 在 main handler 调用 `emitCcStatus({ event: "stop", sessionId, cwd })`。
- `packages/cli/src/bin-session-end.ts` — 调用 `emitCcStatus({ event: "session_end", sessionId, cwd })`。
- `packages/cli/src/teamagent.ts` (or whichever file registers subcommands) — 注册 `presence` subcommand。
- `packages/cli/src/__tests__/realtime-emit.test.ts` — 扩展覆盖 `rawPrompt` 透传 + Stop emit 路径。
- `packages/core/src/index.ts` — re-export presence state machine 公共接口（per FCIS scope-binding policy）。

**可见 deliverable.**

1. `pnpm teamagent presence` 跑得通：
   - 无 receiver URL 时输出 `state=unknown (TEAMAGENT_REALTIME_URL not set)`。
   - 有 receiver URL 时拉到的最新 snapshot 决定 state（active/idle/offline/error）。
2. 单元测试：state machine 覆盖率 ≥80%（CLAUDE.md M0 contract test 约束）。
3. Stop hook 一次 fire 产生且仅产生一个 cc-status POST（fire-and-forget 50ms timeout 内）。
4. SessionStart → UserPromptSubmit → Stop 三段 hook chain 在本地 loopback receiver（`pnpm teamagent digital-twin demo` 或 `mock-server`）上跑一遍能看到 3 个 snapshot 落到 receiver 的 cc-status store。
5. `git log feat/issue-308 --oneline` 显示 7 个 atomic commits（每个对应上面 implementation order 的一步）。

**Verification artifacts（落到 PR body）.**

- `pnpm test` 全部测试（含新增 presence + bin-stop emit + CLI）绿。
- `pnpm typecheck` 全绿。
- `pnpm teamagent presence` 在本地 mock-server 上的 happy-path stdout 截图（HTML，per `docs/VISUAL-PROOF-PR.md` 贴到 PR comment）。
- `/review` PASS 一次（ADR-0007 唯一 review gate）。

## 3. How-to-eval-from-3rd-party-harness (judge harness)

详细 playbook 落在 `docs/plans/2026-05-13-issue-308/judge.md`。骨架：

**Probe 1: State machine 4-态边界**（subagent 派遣，pure data only）

- Input: 4 个 fixture event time series（active / idle / offline / error 各一组）。
- Run: `pnpm vitest run packages/core/src/presence/state-machine.test.ts --reporter=json` 输出原始 JSON。
- Judge: 另一只 LLM 只读 JSON `numTotalTests / numPassedTests / failed[]`，判 PASS iff `numTotalTests >= 4 && numFailedTests === 0`。

**Probe 2: Stop hook emit 单次 POST 验证**（subagent 派遣，整 bin-stop runtime）

- Input: 在测试环境跑一次 `bin-stop.ts` (mock stdin + mock fetch)。
- Run: `pnpm vitest run packages/cli/src/__tests__/bin-stop-emit.test.ts --reporter=json`。
- Judge: 另一只 LLM 读 JSON，判 PASS iff "fetch called exactly once with /v1/cc-status URL + event=stop body"。

**Probe 3: CLI smoke**

- Input: `TEAMAGENT_REALTIME_URL=http://127.0.0.1:9787 pnpm teamagent presence` 在本地起一个 mock receiver。
- Run: 用 `Bash` tool 跑命令，把 stdout / stderr / exit_code 收集到 `judge_out/probe-3.json`。
- Judge: 另一只 LLM 读 JSON，判 PASS iff `exit_code === 0 && stdout matches /^state=(active|idle|offline|error|unknown)/`。

**Probe 4: schema additive**

- Input: 旧版本 receiver mock + 新 client。
- Run: 客户端发包含 `raw_prompt` 字段的 snapshot；旧 schema_version=1 receiver 必须 accept 200。
- Judge: 另一只 LLM 读 HTTP response JSON，判 PASS iff `status === 200 && receiver kept the original fields`。

**Probe 5: 隐私默认 off**

- Input: 不设 `TEAMAGENT_REALTIME_RAW_PROMPT`，跑 UserPromptSubmit emit。
- Run: 测试用 mock receiver capture body。
- Judge: 读 JSON 判 PASS iff `body.raw_prompt === undefined`。

**所有 probe 走 claudefast probes（per `docs/FASTPROBE.md`）或 vitest JSON reporter。任何 probe FAIL 都要 update fix-plan，重跑 /review loop。Verification subagent (per `docs/AGENTIC-CODING-POLICY.md` §3) 在每轮 /review 之间独立审 git diff。`/review` PASS 是唯一终止信号 (ADR-0007)。**

## 4. claudefast probes (canned-answer compliance)

本 PR 不新增 canned-answer rule，但需要保留现有 anchor sentence 不被破坏。在 merge 前跑：

```bash
# Verify existing anchors still hit
claudefast -p "what would happen if we say 'DUCKPLAN'"          # → 四段
claudefast -p "what should we do before we start implment a grill-ready issue ?"  # → grill-working anchor
claudefast -p "what should we do after we create an issue or finish merging a PR ?"  # → ISSUE-TRACKING anchor
```

所有 probe 必须命中各自既有的 grep 锚点。本 PR 改动只在 packages/ + docs/plans/ 范围，不动 CLAUDE.md / AGENTS.md / docs/*.md anchor 规则文件，所以预期 0 影响。

---

**Branch**: `worktree-issue-308` (Claude Code EnterWorktree 默认；fixed-flow-driver skill 的 `feat/issue-${N}` 命名约束适配为 Claude Code 形态)
**Worktree**: `.claude/worktrees/issue-308/`
**Driver**: `/fixed-flow-driver` (session id `bg-b47033b8`)
**Lock**: `.claude/worktrees/issue-308/.lock` (sentinel written)
