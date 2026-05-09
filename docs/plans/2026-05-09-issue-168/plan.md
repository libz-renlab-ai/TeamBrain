```text
                ┌──────────────────────────────────────────┐
                │  ISSUE 168 — STATUSLINE 字段无标签 (>ω<)  │
                │                                          │
                │  ① task        本 plan 文件               │
                │  ② outputs     reviewer 可勾选的产物       │
                │  ③ judge.md    md playbook (无 fixed bash) │
                └────────────────┬─────────────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
       scripts/teamagent-statusline.cjs       audit/runners/feature-19-statusline.ts
       ────────────────────────────────       ─────────────────────────────────────
       A. 加中文标签                          同步更新 expected output 字符串
       C. 消除 helped/risk 重叠
       D. 抑制 SQLite ExperimentalWarning
       B-lite. 0/0/0 时给"待命引导" hint
                │
                ▼
       single squash-merge PR feat/issue-168
                │
                ▼
       judge.md §V1/§V2/§V3 + 项目 1+2+3 gate
```

# Issue 168 — 状态栏字段无标签

> **Scope owner**: 单个 squash-merge PR。
> **Branch**: `worktree-168`（当前 worktree 在 `.claude/worktrees/168/`；这违反了 `CLAUDE.md` 里 `.codex/worktrees/` 约定，但 worktree 是 harness 创建的，不在本次内迁移——`report.md` 里记一笔）。
> **Status**: PLAN（写完即开始 implement，user 已说 "claim, fix, ..., merge"）。

---

## ① Task description

修复 [issue #168](https://github.com/libz-renlab-ai/TeamBrain/issues/168)：状态栏 `helped:X/Y · risk:Z` 字段对新用户完全不可读，且 `HELPED_EVENT_KINDS` 与 `RISK_EVENT_KINDS` 在事件来源上互相重叠（`hook-pre.warned` / `hook-pre.blocked` 同时计入两者），数学上对新用户讲不通。

### 做什么

| # | 改动                                  | 文件                                                   | 形态                                |
|---|---------------------------------------|--------------------------------------------------------|-------------------------------------|
| A | 字段加中文标签 + 时间窗注释            | `scripts/teamagent-statusline.cjs:246-248`              | 模板字符串重写                      |
| C | 拆开 HELPED / RISK，事件不重叠          | `scripts/teamagent-statusline.cjs:115-136`              | 常量数组重排                        |
| D | 抑制 `ExperimentalWarning` 噪音         | `scripts/teamagent-statusline.cjs:1-13`                 | `process.removeAllListeners('warning')` |
| B-lite | 全 0 时 hint 切换为"待命引导"      | `scripts/teamagent-statusline.cjs:185-195` / `:242`     | `getLatestContributionHint` fallback 重写 |
| E | 同步 audit runner 期望输出              | `audit/runners/feature-19-statusline.ts:301,316,331,350` | 字符串调整 + 新增 events.db seed   |

### 怎么做

- **A. 中文标签**：`TeamAgent · rules:N · helped:T/W · risk:T · 护航中` →
  `TeamAgent · 规则:N · 帮过:T今/W周 · 拦过:T今 · 护航中`。保留 ASCII `·` 分隔符（与现有 demo / 老 docs 兼容）。
- **C. 消除重叠**：
  - `HELPED_EVENT_KINDS` 改为只含**正向 / 信息事件**：`passive_matched`, `hook-post.result`, `ai.narrative.injected`, `ai.narrative.complied`, `ai.override.complied`, `pitfall.added`, `compiler.updated`, `extractor.extracted`, `calibrator.adjusted`, `init.completed`。
  - `RISK_EVENT_KINDS` 改为只含**风险 / 拦截事件**：`hook-pre.warned`, `hook-pre.blocked`, `ai.override.ignored`, `ai.override.blocked_circumvented`, `ai.output.bad_pattern`, `ai.narrative.recurred`, `ai.user_input.flagged`, `error.candidate.added`。
  - 两数组互不重叠 → `helped + risk` 之和等于"今日所有事件"，新手能加减。
- **D. 抑制 ExperimentalWarning**：`process.removeAllListeners('warning')` 紧接 `"use strict"` 之后；只屏蔽 statusline 进程，不影响主进程。
- **B-lite. 待命引导**：当 `helpedToday + helpedWeek + riskToday === 0` 且 `getLatestContributionHint` 找不到事件时，hint 输出 `待命中（让我学几条规则吧）`；命中过事件后回到 `护航中` / 具体最近事件文案。
- **E. audit 同步**：把 `feature-19-statusline.ts` 里 `exact:TeamAgent正在运行 · 规则库：5条` 这类**已经早就过时**的期望串改为新格式；同时给两个 seeded 场景额外 seed events.db，让 `helped` / `risk` 字段可被 audit 验证。

### 不做什么

- **不**把 statusline 行格式改成多行。CC `statusLine.command` 单行渲染，多行会被截断。
- **不**改事件 schema / events.db 表结构。只调整 statusline 读取时的分类逻辑。
- **不**实现 issue 提到的方案 B 完整版（前 7 天 / 前 100 hooks 全程切换提示文案）。完整 B 需要持久化 install timestamp，超出本 PR scope；只做 0/0/0 时的 fallback hint。
- **不**改 `CONTRIBUTION_HINTS` 文案。最新事件的"刚做了什么"提示与本 issue 无关。
- **不**改主流程进程的 warning handler，只在 statusline 进程内屏蔽。
- **不**触碰 `dist/teamagent-statusline.cjs`：tsup `onSuccess` 会自动从 `scripts/` 拷过去（见 `packages/teamagent/tsup.config.ts:107-110` 与 `packages/cli/tsup.hook.config.ts:60-62`）。
- **不**开 follow-up issue。`/review` 发现的问题按 `docs/PR-PLAN.md` 在本 PR 里 PR-PLAN 修。

---

## ② Expected outputs

reviewer（人或 `/review` skill）能逐项勾选的产物：

- [ ] `scripts/teamagent-statusline.cjs` 修改：A/C/D/B-lite 四点全落地；diff 行数 < 80。
- [ ] `audit/runners/feature-19-statusline.ts` 期望串同步到新格式；events.db seed 增补；audit dry-run 通过（`pnpm tsx audit/runners/feature-19-statusline.ts` 退出码 0）。
- [ ] 新增 vitest 单元测试 `packages/cli/src/__tests__/statusline-format.test.ts`：
  - case 1: 全空 DB → 输出含 `待命中（让我学几条规则吧）`；不含 `helped:` / `risk:` 英文 token；不含 `ExperimentalWarning`。
  - case 2: seeded events with mixed kinds → `helped` 计数只包含正向 kinds，`risk` 计数只包含风险 kinds，且两者不重叠（同一个 `hook-pre.warned` 事件不会被计两次）。
  - case 3: 输出含 `规则:` / `帮过:` / `拦过:` 中文标签；不含 `helped:` / `risk:` 英文裸字段。
- [ ] `docs/plans/2026-05-09-issue-168/` 三段套：`plan.md`（本文件）+ `research.md`（事件 kind 来源调查）+ `judge.md`（md playbook）+ `report.md`（implement 完成后写）。
- [ ] `pnpm test` 全绿、`pnpm typecheck` 全绿。
- [ ] `pnpm verify` 通过（M7 5 场景 mock LLM）。
- [ ] PR：`feat/issue-168` → `main`，普通 PR（非 draft），title `fix(issue-168): label statusline fields + de-overlap helped/risk + suppress sqlite warning`，body 含 4 段（plan / outputs / judge / probes）+ `claudefast /export` 文件。
- [ ] `/review` PASS（POSTPR loop 至 PASS）。
- [ ] CI 绿（ubuntu + windows smoke lane）。
- [ ] squash-merge 成功（`gh pr merge <N> --squash --delete-branch`）。

### 反目标 (anti-goals)

- **不**改 `dist/teamagent-statusline.cjs`：手动改它会被下次 tsup 覆盖。
- **不**改 `CONTRIBUTION_HINTS` map（最新事件 hint 与本 issue 无关）。
- **不**改 `events.db` schema。
- **不**降低 statusline 启动速度：当前是同步 sqlite 查询，新增逻辑也必须保持纯同步（不引入 async / fs.promises）。
- **不**重新 init project DB 流程（`hasProjectDb` / `isProjectDir` 早返路径不变）。
- **不**让 statusline 在任何分支上输出多行（CC statusLine 单行渲染）。

---

## ③ How-to-verify — judge harness

完整 md playbook 见同目录 [`judge.md`](./judge.md)。结构遵循 `docs/HOWTO-PLAN-PR.md` § 3b：

- **§V1 RUN** — 跑 4 个固定工具：`pnpm test packages/cli/src/__tests__/statusline-format.test.ts`、`pnpm typecheck`、`echo {} | node scripts/teamagent-statusline.cjs`、`pnpm tsx audit/runners/feature-19-statusline.ts`。
- **§V2 DUMP** — 写 `.judge/issue-168/judge.json`，schema：`{exit_code, metrics: {helped_kinds_overlap_count, risk_kinds_overlap_count, warning_lines_in_stderr, has_chinese_label_规则, has_chinese_label_帮过, has_chinese_label_拦过, idle_hint_when_zero}, evidence_dir, stdout_path}`。
- **§V3 READ** — 一次 `claudefast -p` 只读 `judge.json` + evidence，给 PASS / FAIL 结论。被改的代码 / 实现的 agent / PR 作者**都不**做 judge。

### 项目 1+2+3 gate（`docs/feature-verification.md`）

- **module under test**: `scripts/teamagent-statusline.cjs`（无 `--help`，但有固定输出）；改成 prob `node scripts/teamagent-statusline.cjs` 的 stdout / stderr 拆 JSON。
- **expected JSON schema**: `{stdout, stderr_warning_count, exit_code, has_label_规则, has_label_帮过, has_label_拦过}`。
- **/export path**: `docs/plans/2026-05-09-issue-168/exports/issue-168-export.txt`（tmux interactive run 结束时 `/export <path>`）。

---

## See also

- `docs/HOWTO-PLAN-PR.md` — 4 段 PR plan 框架。
- `docs/PR-PLAN.md` — POSTPR / fix-in-PR 强制规则。
- `docs/POSTPR.md` — `/review` PASS 后 squash-only merge 收尾。
- `docs/FIXEDFLOW.md` — TeamBrain 唯一 issue→PR→merge 工作流。
- `docs/feature-verification.md` — 1+2+3 验证 gate。
- `~/.claude/CLAUDE.md` `plan-content.md` / DUCKPLAN — plan.md 三段铁律。
