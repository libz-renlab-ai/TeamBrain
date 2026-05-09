```
   __
 <(o.o)___    plan: soft-force upgrade (gstack-style)
  ( <_< /     issue #225 — advisory + escalating snooze + CHANGELOG what's-new
   `---'
```

# Plan: Soft-Force Upgrade with CHANGELOG-Driven What's-New

参考：
- 现有 auto-update 设计：`docs/superpowers/specs/2026-04-29-auto-update-design.md`
- gstack 调研报告：见本目录 `research.md`
- CEO 决策：方向 (b) — gstack-style 软强迫（弹窗 + 升 / 不升 / 别问），**不**走 PreToolUse deny

## 1. Task Description (做什么 / 怎么做 / 不做什么)

**做什么**：把现有 advisory banner 升级为 gstack-style 软强迫流。每次 SessionStart 主动提示用户升级，三选一（升 / snooze / never），snooze 走 24h→48h→7d 退避。同时把 `CHANGELOG.md` 解析成 5-7 个用户能看懂的 bullet，post-init / post-auto-update / `teamagent whatsnew` 三处共用同一份。

**怎么做（高层）**：
- Pure functions in `packages/core/`（FCIS 边界）：CHANGELOG 解析、snooze 状态机、prompt 文案构建。所有时间戳从参数注入。
- Imperative shell：扩展 `bin-session-start.ts` 输出新 banner；`init.ts` `renderInitResult` 末尾追加 "🆕 What's new"；新增 `teamagent whatsnew` 命令；`teamagent update` 加 `--snooze` `--never`。
- Schema 扩展：`UpdateState` 新增 `snooze_until_ts` `snooze_level` `never_prompt`；旧 state 缺字段时填 default（向后兼容）。
- 通过 AttributionBus emit `update-prompt-shown` / `update-snoozed` / `update-never-set` 事件——本 PR 不接入 bus（避免 over-scope），先用 stderr 即可。

**不做什么**：
- 不实现 PreToolUse deny（CEO 选 b，不是 a）
- 不动 `update --now` 核心 updater 逻辑（已 PASS 验收）
- 不动 release 分支 CI
- 不引入新 npm 依赖（CHANGELOG parser 用纯 line-scan + regex）
- 不通过 AskUserQuestion 走模型 prompt（gstack 走 skill preamble 注入，TeamAgent 直接 SessionStart stderr banner 更可靠、可测试）

## 2. Expected Outputs (可验收交付物)

| 路径 | 类型 | 内容 |
|------|------|------|
| `packages/core/src/update/changelog-parser.ts` | new pure | `parseChangelog(content, fromVersion, toVersion): {version, theme, bullet}[]` |
| `packages/core/src/update/snooze.ts` | new pure | `nextSnooze(level, now)`、`shouldPromptUpgrade(state, now, env)` |
| `packages/core/src/update/update-state.ts` | extend | +3 字段 + defaults + 旧 state 迁移 |
| `packages/core/src/update/prompt-text.ts` | new pure | `renderUpgradePrompt({fromVer, toVer, bullets, snoozeLevel}): string` |
| `packages/cli/src/session-start-logic.ts` | extend | `maybeShowUpgradePrompt` helper |
| `packages/cli/src/bin-session-start.ts` | extend | 调用新 helper |
| `packages/cli/src/commands/init.ts` | extend | `renderInitResult` ok 路径末尾追加 "🆕 本次新增" 段 |
| `packages/cli/src/commands/whatsnew.ts` | new | `teamagent whatsnew [--since <version>]`，离线读 cache |
| `packages/cli/src/commands/update.ts` | extend | `--snooze` `--never` 子命令 |
| `CHANGELOG.md` | edit | 把 `## Unreleased` 切一段为 `## [0.10.5] — 2026-05-09`，确认解析器 anchor |
| `docs/features/soft-force-upgrade.md` | new | 用户可见行为说明（ASCII 流程图、env 变量 `TEAMAGENT_NEVER_PROMPT`、回滚 recipe） |
| `docs/plans/2026-05-09-issue-225/research.md` | new | gstack 调研全文 |
| `docs/plans/2026-05-09-issue-225/judge.md` | new | judge harness playbook |
| `docs/plans/2026-05-09-issue-225/report.md` | new (after impl) | 完成报告 |

## 3. Third-Party Judge Harness (raw JSON → independent LLM judge)

Playbook：`docs/plans/2026-05-09-issue-225/judge.md`。每条 check 输出 `{id, exit_code, metrics, evidence_dir, stdout_path}` 进 `.judge/<run_id>/judge.json`。最终由独立 LLM judge 只读 raw JSON + evidence 决断 PASS/FAIL；**禁止**让本计划作者、实现 agent、被测代码自评。

| ID | 验证内容 | 工具 |
|----|---------|------|
| J1 | `pnpm typecheck` exit 0 | tsc |
| J2 | core pure 单测全绿（changelog-parser / snooze / prompt-text） | vitest |
| J3 | cli 单测全绿（whatsnew / update-snooze / init-whatsnew-tail） | vitest |
| J4 | snooze 状态机 1→2→3 各次 +24h / +48h / +7d (±5min) | vitest |
| J5 | `never_prompt=true` 后 `shouldPromptUpgrade` 始终返回 false | vitest |
| J6 | 旧 update-state.json (缺新字段) 被无报错读取，缺失字段填 default | vitest |
| J7 | CHANGELOG parser 跨多版本时只取 from→to 区间 | vitest |
| J8 | `teamagent whatsnew --help` exit 0 输出 usage | bin probe |

## 4. Claudefast Probes (canned-answer 锚点)

> 实现完成后这三条必须全绿，否则继续修订。

- `claudefast -p "TeamAgent 现在升级提示是 advisory banner 还是软强迫？"` → 命中 `软强迫|soft-force` + `snooze` + `24h.*48h.*7d` + `CHANGELOG`
- `claudefast -p "TeamAgent 用户怎么永久关闭升级提示？"` → 命中 `teamagent update --never` 或 `TEAMAGENT_NEVER_PROMPT=1`
- `claudefast -p "TeamAgent 装好后怎么看本版新增了什么？"` → 命中 `teamagent whatsnew`
