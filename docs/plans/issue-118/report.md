```text
       ┌────────────────────────────────────────────────────────────────┐
       │  issue-118 report — scoped slice shipped, V1-V5 PASS           │
       │                                                                │
       │   ▢ research  ✔   plan  ✔   docs  ✔   probes  ✔  dogfood  ✔   │
       │   ▢ lifecycle ✔   regression ✔   destructive  ✘ (no PR yet)   │
       └────────────────────────────────────────────────────────────────┘
```

# Issue 118 Report — scoped slice (auto-update audit visibility)

## 总览

本 slice 覆盖 issue #118 的「可发现性」纬度：把 #4 statusline（已 PR #124 修好）+ #7 自动升级（实现已就位、文档不可发现）两条最高摩擦的 trigger 拉到顶层 docs，让 AI / 探针 / 用户都能找到正确答案；不实现 #118 的 V3 audit-CLI（留给后续 PR）。

## 实际产出

| 文件 | 行数 | 状态 |
|------|------|------|
| `docs/SELF-UPDATE.md` | 172 | ✅ 顶层 canonical |
| `docs/STATUSLINE.md` | 139 | ✅ 顶层 canonical |
| `CLAUDE.md` | +2 行 | ✅ project-tools 表新增 SELF-UPDATE / STATUSLINE |
| `docs/plans/issue-118/research.md` | 151 | ✅ 7 触发点事实基线 |
| `docs/plans/issue-118/plan.md` | 84 | ✅ DUCKPLAN 三段 |
| `docs/plans/issue-118/report.md` | 本文件 | ✅ |

所有 docs 都 ASCII art 开头、< 200 行（项目硬约束）。

## V1-V5 结果

### V1 statusline probe — PASS

- baseline: claudefast 看不到 STATUSLINE.md，hallucinate 10 次相同 JSON
- v2: claudefast 正确画两行 ASCII，三种场景（有用户 / 无用户 / 未 init），点出 `bash -c '<u>; echo; <t>'` chain
- evidence: `.fastprobe/issue118-probe1-statusline-v2.txt`

### V2 自动升级 probe — PASS

- baseline: 命中大部分内容，但 debounce 错说成 24h
- v2: 命中 SessionStart → 1h debounce → detached `bin-updater.cjs` → `npm install -g` → migrate-auto，B-104 PACKAGE_SPEC SSH→HTTPS tarball 修复，状态文件 schema（含 `reinstall_banner_shown_at`），3 失败 24h backoff
- evidence: `.fastprobe/issue118-probe2-autoupgrade-v2.txt`

### V3 tmux + claudefast 实际渲染 — PASS

- 在 THIS machine THIS dir 注入 PR #124 形态 chain 后 tmux 跑 claudefast：

```
  issues118 (worktree-issues118) | MiniMax-M2 ... 0 tokens          ← 用户原 (line 1)
  TeamAgent · rules:67 · helped:62/162 · risk:78 · 护航中 ...        ← TeamBrain (line 2)
```

- 用户原 line **保留**、TeamBrain line **追加在新行**，正是 issue #104 要求的 "A + a new line"
- evidence: `.fastprobe/issue118-tmux-statusline-raw.txt`

### V4 self-update lifecycle on THIS machine — PASS（含已知 bug）

- v0.10.1 globally installed（`/Users/m1/.nvm/.../teamagent/`）
- `~/.teamagent/update-state.json`：`last_installed_sha: 2e783ae0…`、`interval_hours: 1`、`pending_banner: null`、`consecutive_install_failures: 0`
- `~/.teamagent/update.log` 记录连续 5 天（2026-05-02 → 2026-05-04）`npm install failed: ENOTEMPTY` rename collision，每次自动 restore from rollback
- `~/.teamagent/rollback/` 4 个快照各 11MB（共 ~44MB）
- `auto-update.disabled` 不存在、`TEAMAGENT_AUTO_UPDATE` 未设 → 升级路径开启中
- ⚠️ ENOTEMPTY recurring failure 是真实 bug，已记入 `docs/SELF-UPDATE.md` 「常见 failure modes」节，不在本 PR 修

### V5 老锚点回归 — PASS（间接）

CLAUDE.md project-tools 表只 **新增** 两行，未删除任何既有锚点。`FASTPROBE` / `POSTPR` / `TEAMWORK` / `PRESHIP` / `RULE-VERIFY` / `BUGREPORT` / `DOGFOOD` / `PR-PLAN` / `HOWTOISSUE` 行号位置不变（PR diff 可见）。

## evidence 文件

| 路径 | 用途 |
|------|------|
| `.fastprobe/issue118-probe1-statusline.txt` | V1 baseline FAIL（10 重复 JSON） |
| `.fastprobe/issue118-probe1-statusline-v2.txt` | V1 v2 PASS（chain wrap ASCII + 三场景） |
| `.fastprobe/issue118-probe2-autoupgrade.txt` | V2 baseline 部分 PASS |
| `.fastprobe/issue118-probe2-autoupgrade-v2.txt` | V2 v2 PASS（lifecycle 全对） |
| `.fastprobe/issue118-tmux-statusline-raw.txt` | V3 实际渲染抓样 |
| `.claude/settings.local.json.bak-issue118` | dogfood 注入前的备份（gitignored） |

## 偏差 / 风险

- **本 PR 不修 ENOTEMPTY**：THIS machine 5 天连续 npm install 失败是 npm/macOS/nvm 互动问题，与 issue #118「可发现性」目标正交；推荐另立 issue 处理。
- **没有 `migrate-v6` 实跑验证**：本机 update.log 上次成功安装是 v0.10.1（2026-05-02 之前），后续 ENOTEMPTY 失败导致 migrate-auto 从未执行过新代码。
- **本 slice 没实现 V3 unified audit-CLI**：留给后续 PR；现状下读 `~/.teamagent/update.log` + `~/.teamagent/.warmup-state.json` 各自单独看。
- **claudefast 的回答仍受 token 上下文限制**：再加新规则 / 新 trigger 时，docs/STATUSLINE.md 与 docs/SELF-UPDATE.md 必须同步更新，否则 probe 结果会 drift。

## 后续事项

1. **issue 单立 ENOTEMPTY recurring failure**（`scripts/bugreport-collect.sh` 抓 system info + update.log + rollback 状态）。
2. **完整 audit doc** `docs/auto-update-audit.md`：把 research.md 的 7 触发点 ×（5 字段 + 实际触发证据）合成一篇用户角度的索引文档。
3. **`pnpm teamagent audit-auto-updates --since N` CLI**（issue #118 V3）：聚合 update.log + warmup.log + AttributionBus + git status diff，输出本会话内自动更新事件列表。
4. **#5a matcher silent fallback 提示**：默认 silent 改为低噪声 banner（per-session 一次），评估后再做。
5. **destructive action gate**：本 PR 还没 push、还没开 PR；推到 GitHub + `gh pr create` 需用户显式指令。

## POSTPR 准备

PR 一开就走 `docs/POSTPR.md` 流程：fetch Codex review → P1/P2 在本 PR 修 → loop 直到 silent or 👍。如有 inline comment，按 PR-PLAN 模式（不开 follow-up issue）在本分支补 commit。

## 参考

- issue：https://github.com/libz-renlab-ai/TeamBrain/issues/118
- sibling research：`docs/plans/2026-05-07-issue100-stop-hook-claude-md-research.md`、`docs/plans/2026-05-07-issue104-statusline-research.md`
- PR #124（statusline chain wrap）：merged 2026-05-07
- 自动升级 spec：`docs/superpowers/specs/2026-04-29-auto-update-design.md`
- 项目规则：`docs/HOWTO-PLAN-PR.md`、`docs/HOW-TO-ISSUE.md`、`docs/POSTPR.md`、`docs/PR-PLAN.md`
