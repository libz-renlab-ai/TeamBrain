```
                              ┌───────────────────────────────┐
                              │  ① Task description           │
                              │  ② Expected outputs           │
                              │  ③ Judge harness (md playbook)│
                              │  ④ Cute Chinese duck recap    │
                              └───────────────────────────────┘
```

# plan.md — issue #371 日报总结功能 (MVP, member × project one-liner)

> 走 `docs/HOWTO-PLAN-PR.md` + `docs/PLAN-RESEARCH-REPORT.md` 三段铁律 + DUCKPLAN 第 4 段。
>
> Research：[`./research.md`](./research.md) — 已锁定 cwd-encoding 规则、hook 注入点、worktree 合并启发。
> Judge harness：[`./judge.md`](./judge.md) — §V0 RUN-ID / §V1 RUN / §V2 DUMP / §V3 READ playbook，main agent dispatch，**不是** `scripts/*.sh`。

---

## ① Task description

### 做什么

1. **新 core 模块** `packages/core/src/daily-summary/`：
   - `cwd-decode.ts` — Claude Code `~/.claude/projects/<encoded-cwd>/` 目录名 ↔ 绝对路径解码
   - `project-key.ts` — 把 `cwd` 折叠成 canonical project key（合并 `.codex/worktrees/<task>` / `.claude/worktrees/<task>` 回 host repo）
   - `scanner.ts` — 扫 `~/.claude/projects/` 子目录，按 mtime 过滤"今天"，group by project key
   - `aggregator.ts` — 每个 project 的 session 数 / 用户消息数 / assistant 字符数粗摘要（**不**调 LLM）
   - `prompt-matcher.ts` — 三层 matcher：白名单 / `日报` 关键词 + 可注入 LLM seam / 放行
   - `rewriter.ts` — 把 aggregator 输出 + 元指令拼成 `additionalContext` block；员工自己的 Claude 窗口看到后生成一句话/项目
   - `index.ts` — 公开 barrel export

2. **新 CLI 子命令** `teamagent daily`：
   - `pnpm teamagent daily --help` → canonical JSON 帮助（per `docs/feature-verification.md`）
   - `pnpm teamagent daily` → 把当下扫到的"今天活动"以 JSON 输出到 stdout
   - `pnpm teamagent daily --archive` → 同时写 `${TEAMAGENT_HOME}/daily/<YYYY-MM-DD>.md`
   - `pnpm teamagent daily --projects-root=PATH` → 测试 / fixture 注入
   - `--date=YYYY-MM-DD` 不在本 PR 范围（grill §3 把"历史日期"列入二期）

3. **修改 `bin-user-prompt-submit.ts`**：在 M4-A 注入与 rule retriever **之间**插入 daily-summary 短路逻辑——
   - 通过 `prompt-matcher.match()` 判定
   - 命中 → 走 daily-summary 路径产出 `additionalContext` + 归档 + 直接 return（跳过 rule retriever 与 recording memory，避免 prompt 同时被多个 block 包裹）
   - 未命中 → 继续走原流程

4. **修改 `bin.ts`**：注册 `case "daily"` 路由 + `--help` 顶层菜单条目。

5. **单元测试 + 集成测试**：
   - `packages/core/src/daily-summary/__tests__/*.test.ts` × 5（每模块一支）
   - `packages/cli/src/__tests__/daily.test.ts` —— CLI command 端到端
   - `packages/cli/src/__tests__/bin-user-prompt-submit-daily-injection.test.ts` —— hook wiring（用 fixture jsonl）

6. **DOC**：CHANGELOG / docs/features/daily-summary.md（新建短文档，单页对接 grill spec）。

### 为什么

issue #371 在 grill 里被定为 TeamBrain 三大业务特性 #2「team leaders know in second-level realtime what each teammate's Claude Code instance is doing」的 day-level 入口。本 PR 是 member × project daily 视图 MVP，配合 PR-415 已落地的 ADR-0014 docs/adr/0014/371.md verdict。

### 不在范围（anti-scope）

- ❌ 层 B：manager / 跨员工聚合（grill §3）
- ❌ 「昨天的日报」/ 任意日期（grill §3）
- ❌ 富格式（表格、PR 引用、commit 关联）
- ❌ 推送 Slack / 邮件 / 飞书
- ❌ 敏感信息过滤（grill §3）
- ❌ 真实 LLM 兜底意图判定接 claudefast（grill §4 允许降级为白名单 + slash；本 PR ship matcher seam，但只单测 stub）
- ❌ Stop hook 回写 Claude 总结到 archive（二期；本 PR 归档"原始活动 dump"）
- ❌ `daily.triggers` 自定义白名单走 `~/.teamagent/config.json`（本 PR 只接 `TEAMAGENT_DAILY_TRIGGERS=...` env override）

## ② Expected outputs

### 代码

- [ ] `packages/core/src/daily-summary/cwd-decode.ts` (~50 LOC)
- [ ] `packages/core/src/daily-summary/project-key.ts` (~40 LOC)
- [ ] `packages/core/src/daily-summary/scanner.ts` (~110 LOC)
- [ ] `packages/core/src/daily-summary/aggregator.ts` (~70 LOC)
- [ ] `packages/core/src/daily-summary/prompt-matcher.ts` (~90 LOC)
- [ ] `packages/core/src/daily-summary/rewriter.ts` (~70 LOC)
- [ ] `packages/core/src/daily-summary/index.ts` (~15 LOC)
- [ ] `packages/core/src/index.ts` — 加 barrel export
- [ ] `packages/cli/src/commands/daily.ts` (~150 LOC)
- [ ] `packages/cli/src/bin-user-prompt-submit.ts` — wire daily-summary（~25 LOC change）
- [ ] `packages/cli/src/bin.ts` — `case "daily"` + help entry（~15 LOC change）

### 测试

- [ ] `packages/core/src/daily-summary/__tests__/cwd-decode.test.ts`
- [ ] `packages/core/src/daily-summary/__tests__/project-key.test.ts`
- [ ] `packages/core/src/daily-summary/__tests__/scanner.test.ts`
- [ ] `packages/core/src/daily-summary/__tests__/aggregator.test.ts`
- [ ] `packages/core/src/daily-summary/__tests__/prompt-matcher.test.ts`
- [ ] `packages/cli/src/__tests__/daily.test.ts`
- [ ] `packages/cli/src/__tests__/bin-user-prompt-submit-daily-injection.test.ts`

### 文档

- [ ] `CHANGELOG.md` — Unreleased > Added 条目
- [ ] `docs/features/daily-summary.md`（新短页）
- [ ] `docs/plans/2026-05-13-issue-371-daily-summary/research.md` ✅
- [ ] `docs/plans/2026-05-13-issue-371-daily-summary/plan.md` ✅ 本文
- [ ] `docs/plans/2026-05-13-issue-371-daily-summary/judge.md`
- [ ] `docs/plans/2026-05-13-issue-371-daily-summary/report.md`（跑完后写）

### Evidence（judge harness 落点）

- [ ] `docs/plans/2026-05-13-issue-371-daily-summary/evidence/<run-id>/typecheck.json`
- [ ] `docs/plans/2026-05-13-issue-371-daily-summary/evidence/<run-id>/vitest.json`
- [ ] `docs/plans/2026-05-13-issue-371-daily-summary/evidence/<run-id>/daily-help.json`
- [ ] `docs/plans/2026-05-13-issue-371-daily-summary/evidence/<run-id>/fixture-scan.json`

### PR 工件

- [ ] **普通 PR**（禁 draft，per CLAUDE.md §开发节奏）
- [ ] title: `feat(issue-371): daily summary hook + member×project enumeration (Closes #371)`
- [ ] commit message 格式：`feat(issue-371): ...` / `test(issue-371): ...` / `docs(issue-371): ...`
- [ ] `/review` PASS（ADR-0007）→ `gh pr merge <N> --squash --delete-branch`（CLAUDE.md squash-only）
- [ ] POSTPR cleanup：`ExitWorktree action=remove` + `git pull --ff-only` + driver §7 strip `grill-working` label + close issue

### Negative outputs（anti-regression）

- ✋ 不动 rule retriever / recording memory 既有路径（daily 命中时短路，未命中时透明）
- ✋ 不动 `bin-pre-tool-use.ts` / `bin-stop.ts`（grill 只要求 UserPromptSubmit 一道闸）
- ✋ 不动 dual-layer store / events.db / sqlite-vec（daily 不写 store）
- ✋ 不增加新 npm dep（用 node:fs + node:path + 既有 `@teamagent/core`）
- ✋ 不动 `pnpm verify`（hook 短路是 best-effort, try/catch 包裹避免污染主路径）

## ③ How-to-verify — md playbook

**Hard rule**：judge harness 是 [`./judge.md`](./judge.md)，main agent dispatch，**不是** bash 脚本。

### §V1 RUN

1. `pnpm -F @teamagent/core typecheck` + `pnpm -F @teamagent/cli typecheck`
2. `pnpm vitest run packages/core/src/daily-summary/__tests__/`（5 个单测）
3. `pnpm vitest run packages/cli/src/__tests__/daily.test.ts packages/cli/src/__tests__/bin-user-prompt-submit-daily-injection.test.ts`
4. `pnpm -F @teamagent/cli build`（生成 `.cjs` bundle）
5. `pnpm teamagent daily --help` → 出 JSON
6. Fixture scan：`TEAMAGENT_HOME=$(mktemp -d) pnpm teamagent daily --projects-root=docs/plans/2026-05-13-issue-371-daily-summary/evidence/fixture-projects --archive`

### §V2 DUMP

每步输出落 `evidence/<run-id>/<step>.json` / `<step>.stdout`：
- `typecheck.json` — `{exit_code, duration_ms}`
- `vitest.json` — `{exit_code, passed, failed, total}`
- `daily-help.json` — `--help` 原始 JSON 输出
- `fixture-scan.json` — fixture 扫到的 project × session 表
- `archive-sample.md` — 归档样本（便于人眼审核渲染）

### §V3 READ（main agent 读 JSON 出 PASS/FAIL）

PASS = 全部满足：
- typecheck.json `exit_code == 0`（cli + core 各一次）
- vitest.json `exit_code == 0` 且 `failed == 0` 且 `passed >= 6`（5 个单元 + ≥1 集成）
- daily-help.json 是合法 JSON 且含 fields `command`, `usage`, `flags`
- fixture-scan.json 至少 1 个 project group，且 `worktreeMergedCount >= 1`（确认 worktree 合并启发生效）
- archive-sample.md 非空且首行含 `# Daily activity` 字样

FAIL = 任一不满足。注意：**LLM 兜底意图判定** **不**进入 PASS 条件（grill §4 允许降级为白名单 + slash）；只单测 stub 验。

## ④ 鸭鸭复述 — explain to a cute Chinese duck

```
      _
   __( o)>
   \ (_ ) 呷呷~
    `---' 鸭鸭说：
```

呷呷~ 鸭鸭这就给同事讲讲这次要造个啥小玩意：

1. **任务描述**：员工干完一天活儿，对着 Claude Code 说"总结一下今天的日报"——TeamAgent 这只小鸭子拦下这句话，扫一下员工本机今天用过的所有项目（包括 `.codex/worktrees/...` 这些小窝），把每个项目今天聊了几次、敲了几行 prompt 整理好，**改写当前的 prompt** 塞回员工那台 Claude 自己去生成一句话总结（鸭鸭不打 OpenAI 电话，省钱！），同时把"原始活动账本"也存到 `~/.teamagent/daily/<日期>.md`，下次想翻账可以直接看本机文件。

2. **预期产出**：
   - 一个新 core 模块（七只小鸭文件：`cwd-decode` / `project-key` / `scanner` / `aggregator` / `prompt-matcher` / `rewriter` / `index`），加 5 只单测小鸭
   - 一个新 CLI 子命令 `pnpm teamagent daily`，带 `--help` JSON 输出 + `--archive` 选项，配 1 只集成测试
   - 修改 `bin-user-prompt-submit.ts` 把 daily-summary 接进 hook，配 1 只 hook 集成测试
   - 一份 `CHANGELOG` 条目 + 一页 `docs/features/daily-summary.md`
   - 一组 evidence JSON 落到 `docs/plans/2026-05-13-issue-371-daily-summary/evidence/<run-id>/`
   - 一个**普通 PR**（不许是 draft！）+ atomic commits + `/review` PASS + squash-merge + POSTPR 三步清理

3. **第三方 judge harness**：鸭鸭**不**自己说自己代码好——写一份 `judge.md` playbook，里面就 3 段（§V1 跑命令、§V2 把 stdout 倾倒成 JSON、§V3 主鸭读 JSON 决定 PASS / FAIL）。判决条件全部写死成数字 / 字段存在性 / substring 命中：typecheck `exit==0`、vitest `failed==0` 且 `passed>=6`、`daily-help.json` 是合法 JSON 含 `command`/`usage`/`flags`、fixture-scan 至少合并到 1 个 worktree、archive sample 首行 `# Daily activity`。任何一项 fail 整体 FAIL，**不让被测代码自己评、不让 LLM 拍脑袋**。
