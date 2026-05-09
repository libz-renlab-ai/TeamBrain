```text
              ┌────────────────────────────────────────────┐
              │  REPORT — issue 168 statusline relabel     │
              │                                            │
              │  plan → research → implement → /review×3   │
              │  → PR #212 → CI → squash-merge             │
              └────────────────────────────────────────────┘
```

# Report — Issue 168

实施记录、偏差、风险与后续事项。本文件在 PR 提交后写就；后续 merge / cleanup 步骤完成时回填。

## 时间线

| 阶段 | commit | 摘要 |
|------|--------|------|
| 计划 | `3430cb4` | docs(issue-168): plan + research + judge + playground |
| 实施 | `5f1e31a` | fix(issue-168): label + de-overlap + warning-suppress + B-lite |
| 测试 | `607774c` | test(issue-168): vitest 6 specs + audit runner sync |
| /review iter-1 | `5dbca8b` | fix: HELPED 移除 metadata kinds + warning filter 收紧 + matchAll 唯一声明 |
| /review iter-2 | `22a19d4` | fix: countEventsSince 上界 + hint map 同步 + 注释剥离 |
| /review iter-3 | — | NO FINDINGS — clean review |
| PR | #212 | 开普通 PR（非 draft），4 段 description |

## 实际交付

`scripts/teamagent-statusline.cjs` 改动：
- 输出格式从 `TeamAgent · rules:N · helped:T/W · risk:T · 护航中` 改成 `TeamAgent | 规则:N | 帮过:T今/W周 | 拦过:T今 | <hint>`。分隔符全改成 ` | `（含未初始化提醒、未安装提示、sqlite 不可用三条 fallback 消息）。
- `HELPED_EVENT_KINDS` 与 `RISK_EVENT_KINDS` 设计为不相交集；新增 `ai.override.complied/ignored/blocked_circumvented`、`scenario.run`、`error.candidate.approved`；移除 `hook-post.result` 和 `error.candidate.rejected`（metadata，不进任一桶）；不再让 `hook-pre.warned/blocked` 同时进 HELPED + RISK。
- `process.removeAllListeners("warning") + process.on("warning", filter)` 抑制 Node 22 SQLite ExperimentalWarning，保留 DeprecationWarning / MaxListenersExceededWarning / 其他 warning 信号。
- `countEventsSince` 加 `timestamp <= now` 上界，未来时间戳不再让 今/周 计数膨胀。
- B-lite idle hint：`helpedToday + helpedWeek + riskToday` 全为 0/null 且 `getLatestContributionHint` 找不到事件时，hint 切到 `待命中（让我学几条规则吧）`。命中过事件后回到 `护航中` 或 `CONTRIBUTION_HINTS` 文案。
- `CONTRIBUTION_HINTS` map 删除 `hook-post.result` 和 `error.candidate.rejected` 两个 key，与 HELPED 桶语义一致。

`audit/runners/feature-19-statusline.ts` 改动：把两处 `exact:TeamAgent正在运行 · 规则库：N条`（早就漂移、与生产代码不匹配）同步到新格式 `exact:TeamAgent | 规则:N | 帮过:-今/-周 | 拦过:-今 | 待命中（让我学几条规则吧）`。

`packages/cli/src/__tests__/statusline-format.test.ts`（新文件）9 个单测，覆盖：中文标签 + 时间窗后缀；helped/risk 在 warned + blocked 上不重复计数；`hook-post.result` + `error.candidate.rejected` 不进 HELPED；ExperimentalWarning 被抑制；非 ExperimentalWarning（`process.stderr.write` 路径）保留；0/0/0 idle hint；命中过事件 hint 切走；未来时间戳不进今/周；HELPED ∩ RISK = ∅ 静态校验（`matchAll` + 注释剥离 + 唯一声明断言）。

`docs/plans/2026-05-09-issue-168/`：plan.md（三段铁律）、research.md（事件 kind 分类调查）、judge.md（md-playbook judge harness §V1/§V2/§V3）、playground/statusline-designs.html（19.4 KB self-contained HTML，5 label 风格 × 4 分隔符 × 4 idle hint × ExperimentalWarning toggle，3 样本数据并排渲染）。

## 偏差

- **worktree 路径违反 CLAUDE.md 约定**：本项目要求 worktree 在 `.codex/worktrees/<task-name>/`，实际 worktree 在 `.claude/worktrees/168/`（harness 自动创建）。延续 `docs/plans/2026-05-09-issue-174-newuser-ux-plan.md` 的处理方式：不在中途迁移，仅在本 report 注明。
- **未实现 issue 方案 B 完整版**：原 issue 提到"前 7 天 / 前 100 hooks 切换提示文案"。本 PR 只做 B-lite（0/0/0 时切换）。完整 B 需要持久化 install timestamp，超出本 PR scope。
- **playground HTML 计入 docs commit**：原 plan.md 没列这个产物，是用户在 implement 之前要求 subagent 生成的设计探索物。19.4 KB 自包含 HTML，未进生产代码路径。
- **HELPED/RISK 桶比 plan 更严格**：plan.md 写的是 "HELPED = passive_matched + override.complied + 信息事件" 与 "RISK = warned/blocked + bypass + ..."；实际通过 /review 两轮收紧到 HELPED 不收 metadata（`hook-post.result` + `error.candidate.rejected`）。这是收益更高的版本。

## 验证矩阵

- `pnpm typecheck` — clean。
- `pnpm test` — 219 files / 2385 tests passed。
- `pnpm verify` — 5/5 PRR=100 KP=5。
- `node scripts/teamagent-statusline.cjs` 实测输出：`TeamAgent | 规则:57 | 帮过:85今/572周 | 拦过:26今 | 护航中`，无 ExperimentalWarning 残留。
- `/review` 跑了 3 轮，iter-3 NO FINDINGS。

## 后续事项

- 待 CI 绿后 squash-merge（`gh pr merge 212 --squash --delete-branch`）。
- merge 后 `ExitWorktree action="remove"`（worktree 是 EnterWorktree 创建的，可由 ExitWorktree 删）。
- 父 checkout 跑 `git pull --ff-only` 同步 main。
- 如果 issue #168 未在 PR title 自动关闭，手动 close 并附 PR 链接。
- 完整版方案 B（首日 / 前 100 hooks 引导）若要做，单独开 issue。

## 风险评估

| 风险 | 评估 | 缓解 |
|------|------|------|
| 下游 grep 老英文 token | 已检查：repo 内 `rules:` / `helped:` / `risk:` 无 outside-of-diff 命中 | 单测断言新格式不含老英文 token |
| Windows 中文显示宽度 | CC `statusLine` 单行无硬截断（issue #104 验证过） | 不变 |
| Node 22 警告抑制副作用 | 仅过滤 `ExperimentalWarning`，保留其他 warning | iter-1 修复 |
| 未来时间戳/时钟漂移 | `countEventsSince` 加上界 `<= now` | iter-2 修复 |
| 静态测试假阴性 | `matchAll` + 注释剥离 + 唯一声明断言 | iter-1+iter-2 修复 |
| dist/ 未同步 | tsup `onSuccess` 在 build 时自动从 scripts/ 拷贝 | 无人手动改 dist/，CI build 时刷新 |
