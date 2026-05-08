```text
       ┌──────────────────────────────────────────────────────────────┐
       │  issue-118 plan — make the 7 silent-update triggers visible  │
       │                                                              │
       │   research.md  ─►  plan.md  ─►  fix docs/code  ─►  probes    │
       │   (7 triggers)     (this)       (#4 + #7 docs)    (verify)   │
       │                                                              │
       │   gates: claudefast probe 1 + 2 + tmux render + lifecycle    │
       └──────────────────────────────────────────────────────────────┘
```

# Issue 118 Plan — visible auto-update audit (scoped slice)

This PR ships a **scoped slice** of issue #118: not the full audit-CLI yet, but the two highest-friction triggers (#4 statusline already fixed via PR #124, #7 auto-upgrade now canonically documented) become **discoverable** by AI probes and **verifiable** locally.

## ① Task description

**做什么**

- 顶层 user-facing canonical doc 两份：`docs/SELF-UPDATE.md`（自动升级生命周期）、`docs/STATUSLINE.md`（chain wrap 行为）。
- `CLAUDE.md` project-tools 表新增两行，把 `SELF-UPDATE` / `STATUSLINE` 当作可触发关键词链到 docs。
- `docs/plans/issue-118/research.md`：把 7 条触发点 + 5 字段一次性扒出来，作为后续完整 audit doc 的事实基线。

**怎么做**

- 复用既有 sibling research：#100（Stop hook→`CLAUDE.md`）、#104（statusline）。新增 `bin-updater.ts` / `updater-logic.ts` / `session-start-logic.ts` / `update-state.ts` / `should-check.ts` 的 5 字段抽取。
- ASCII art 顶部、< 200 行；`docs/SELF-UPDATE.md` 含完整 lifecycle、状态文件 schema、ENOTEMPTY failure mode、inspection 命令、opt-out 三方式。
- `docs/STATUSLINE.md` 含 chain wrap ASCII、三种渲染场景、备份字段 schema、uninstall restore 矩阵、tmux dogfood recipe。

**不做什么**

- **不**实现 `pnpm teamagent audit-auto-updates --since` 的统一审计 CLI（issue #118 的 V3，留给后续 PR）。
- **不**对 #4 / #7 改代码——#4 已经 PR #124 修好；#7 实现已就位（`updater-logic.test.ts` 7 单测），本 PR 只补可发现性 docs。
- **不**加 `~/.teamagent/auto-update-events.jsonl` 之类的新存储。
- **不**改 `~/.claude/skills/`、`~/.claude/projects/`（auto-memory 标 out-of-tree）。

## ② Expected outputs

| 文件 | 状态 | 说明 |
|------|------|------|
| `docs/SELF-UPDATE.md` | NEW | 顶层 user-facing canonical doc，< 200 行 |
| `docs/STATUSLINE.md` | NEW | 顶层 user-facing canonical doc，< 200 行 |
| `CLAUDE.md` | EDIT | project-tools 表新增 SELF-UPDATE / STATUSLINE 两行 |
| `docs/plans/issue-118/research.md` | NEW | 7 触发点事实清单，151 行 |
| `docs/plans/issue-118/plan.md` | NEW | 本文件 |
| `docs/plans/issue-118/report.md` | NEW | 结案报告 + evidence 指针 |
| `.fastprobe/issue118-probe[12]-*.txt` | EVIDENCE | claudefast probe v1（FAIL baseline）+ v2（PASS） |
| `.fastprobe/issue118-tmux-statusline-raw.txt` | EVIDENCE | tmux+claudefast 实际渲染抓样 |

**反目标 anti-goals**

- 不破坏 `FASTPROBE` / `POSTPR` / `TEAMWORK` 三个老锚点
- 不动 user level `~/.claude/settings.json`
- 不动其它 trigger（#1/#2/#3/#5/#6）的现有行为
- 不在 `main` 改、不 `git reset --hard`、不 force push

## ③ How-to-verify (judge harness — markdown playbook, MAIN agent dispatched)

**没有 fixed bash 脚本。** harness 是本节描述的 dispatch 表，由 MAIN agent 读 `plan.md` + `judge.md`-style 规格，按 probe 性质选择 subagent / claudefast，evidence 落到 `.fastprobe/`。

| Probe | 触发方式 | 期望结果 | Evidence 路径 |
|-------|---------|---------|---------------|
| **V1 statusline** | `claudefast -p "please based on codes and docs , draw the expected statusline for me please"` | 画两行 ASCII（用户原 / TeamBrain），提到 `bash -c` chain + `echo` 分隔 | `.fastprobe/issue118-probe1-statusline-v2.txt` |
| **V2 自动升级** | `claudefast -p "read docs and codes about 自动升级 please"` | SessionStart → 1h debounce → detached `bin-updater.cjs` → `npm install -g` → migrate-auto；opt-out 文件 / env；状态文件 schema | `.fastprobe/issue118-probe2-autoupgrade-v2.txt` |
| **V3 tmux render** | tmux session 跑 claudefast，capture-pane 看实际 statusline | 两行连续输出（用户原 + TeamBrain）；不替换、不丢字段 | `.fastprobe/issue118-tmux-statusline-raw.txt` |
| **V4 lifecycle walk** | THIS machine `~/.teamagent/` 状态文件 + log 直接读 | 当前 v0.10.1，rollback 4 个快照各 11MB，update.log 显示 5 天 ENOTEMPTY 真实失败模式 | report.md inline |
| **V5 anchors regression** | `claudefast -p "what project tools we have?"` | 仍含 `FASTPROBE` / `POSTPR` / `TEAMWORK` 三锚点 | report.md 验证 |

**裁判**：不让被测代码 / 实施 agent 自评。若 V1-V5 全 PASS（已记录 evidence 文件），merge；任意 fail → 在本 PR branch 修，按 POSTPR loop 走。

## ④ Claudefast probes（开工前已跑 baseline + v2）

```text
v1 baseline → docs 缺 → V1 FAIL（claudefast hallucinate JSON 10 次）/ V2 部分 PASS（24h vs 1h debounce）
↓ 写 SELF-UPDATE.md + STATUSLINE.md + CLAUDE.md links
v2 retry   → V1 PASS / V2 PASS（命中 1h、PACKAGE_SPEC SSH→HTTPS、3 次失败 24h backoff、状态文件 schema 全对）
```

## 实施顺序（已 commit 的切片）

1. `docs(m5): research issue-118 — 7 auto-update triggers inventory` — research.md
2. `docs(m5): canonical SELF-UPDATE.md + STATUSLINE.md + CLAUDE.md links` — 用户文档与可发现性
3. `docs(m5): plan + report for issue-118 (scoped slice)` — 本文件 + report.md

## 后续（不在本 PR）

- 完整 audit doc `docs/auto-update-audit.md`：枚举 7 触发点 + 5 字段，是 V1 的扩展形态
- `pnpm teamagent audit-auto-updates --since N` CLI（issue #118 V3）
- 修复 THIS machine 的 ENOTEMPTY 持续失败（issue 待开）
- 把 #5a matcher silent fallback 在用户角度做出可见性
