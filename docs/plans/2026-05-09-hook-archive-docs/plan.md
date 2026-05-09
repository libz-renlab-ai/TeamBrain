```
        __
      <(o )___
       ( ._> /
        `---'         hook-archive-docs : remove orphans + canonical doc
                                                                          
   .claude/hooks/*.sh        ─►  delete 2 orphans (laziness, teamagent-stop)
   docs/features/hooks-status.md  ─►  NEW canonical hook status reference
   docs/STOP-HOOKS.md        ─►  drop "Orphaned Scripts" stale section
   bugs.md                   ─►  mark B-092 obsolete (file deleted)
   .claude/hooks/*.sh        ─►  refresh comments referencing removed files
```

# Plan: Archive orphan hooks + canonical hook status doc (2026-05-09)

## 1. Task description

**做什么**：把 `.claude/hooks/` 下两个孤儿 shell 脚本删掉，并新增/更新文档让"项目级 hooks 全景图"成为单一权威来源（single source of truth）。

**怎么做**：
- `git rm .claude/hooks/laziness-self-report.sh`（已被 `self-report-fused.sh` 12-field 版本取代）
- `git rm .claude/hooks/teamagent-stop.sh`（B-103 老 shim，`bin-stop.cjs` 现已直接由 `teamagent init` 注册到 `settings.local.json`）
- 新建 `docs/features/hooks-status.md` —— 项目级 hook 完整资产表（`.sh` + `.cjs` + `bin-*.ts` 源、装在哪、谁用谁不用），ASCII art 时间轴展示 hook 触发顺序
- 更新 `docs/STOP-HOOKS.md` —— 删除 "Orphaned Scripts" section（指向已删除文件的链接），改成指向新 hooks-status.md
- 更新 `bugs.md` —— `B-092`（laziness-self-report.sh on Windows jq 失效）标记 obsolete，原因：file removed
- 更新 `.claude/hooks/digital-twin-tap.sh` 头注释 —— 之前引用 `teamagent-stop.sh` 作为 mirror pattern，改为直接说明 B-103 pattern 而不指向已删除文件
- 更新 `.claude/hooks/self-report-fused.sh` 头注释 —— 把 "replaces laziness-self-report.sh" 调整为 "12-field self-report (single Stop hook)"，不再引用已删除的 .sh
- 更新 worktree-level `CLAUDE.md` —— 在 "参考文档" section 加一行指向 `docs/features/hooks-status.md`

**不做什么**：
- ❌ 不动 `.cjs` 主路（PreToolUse / PostToolUse / UserPromptSubmit / Stop bin bundles），它们正常运转
- ❌ 不修 `installHook()` 的 channelOps 数组（这是 B+C scope 的下一个 PR；本次只 archive + docs）
- ❌ 不删 `bin-session-start.ts` / `bin-session-end.ts` / `bin-pre-compact.ts` / `bin-digital-twin-tap.ts`，它们是已建未接的功能源（下个 PR 接进 init）
- ❌ 不动 `docs/specs/hook-add-laziness/verify/*` 验证夹具（历史快照，保留）
- ❌ 不改 `docs/legacy/judge-scripts/*`（已 archive，里面引用旧 .sh 是历史正确）

## 2. Expected outputs

### 2.1 文件删除（git rm）
- `.claude/hooks/laziness-self-report.sh`
- `.claude/hooks/teamagent-stop.sh`

### 2.2 文件新建
- `docs/features/hooks-status.md`（< 200 行，ASCII art at top per project rule 10）

### 2.3 文件更新
- `docs/STOP-HOOKS.md`（删除 "Orphaned Scripts" section）
- `bugs.md`（B-092 status open → obsolete）
- `.claude/hooks/digital-twin-tap.sh`（refresh head comment）
- `.claude/hooks/self-report-fused.sh`（refresh head comment）
- `CLAUDE.md`（add reference to hooks-status.md in 参考文档 section）

### 2.4 Plan 三件套（本目录）
- `plan.md`（this file）
- `judge.md`（third-party judge harness MD playbook）
- `report.md`（after merge — completion record per AGENTS.md rule 9）

### 2.5 PR
- 普通 PR（非 draft per worktree CLAUDE.md "PR 必须是普通 PR"）
- Squash-merge with `--delete-branch`（per memory feedback_squash_only_merge）
- Title: `chore(hooks): archive 2 orphan .sh + add canonical hooks-status doc`
- Body 含 4 段：summary / verification commands / risk / link to plan.md

## 3. Third-party judge harness (MD playbook)

参考 memory `feedback_judge_harness_md_playbook` —— judge harness 是 MD playbook，由 MAIN agent 通过 subagent 或 `claudefast -p` 探针 dispatch，**不是固定 bash 脚本**。

详情见 `docs/plans/2026-05-09-hook-archive-docs/judge.md`。MAIN agent 跑 6 个 probe，每个产出 `{exit_code, stdout_path, evidence_dir, metrics}` JSON，最后由 `claudefast -p` 调一次 LLM-judge 读 raw JSON 得 PASS/FAIL verdict。

Probe 概览（详细 prompt 见 judge.md）：
- **probe 1** : 验证 2 个 .sh 已从工作树消失
- **probe 2** : 验证 git 历史里仍可追溯（`git log --diff-filter=D --follow` 命中）
- **probe 3** : 验证 `docs/features/hooks-status.md` 存在 + ASCII art 在顶部 + 行数 < 200
- **probe 4** : 验证 `docs/STOP-HOOKS.md` 不再引用已删除文件
- **probe 5** : 验证 `bugs.md` 中 B-092 状态字段不再为 `open`
- **probe 6** : `pnpm typecheck` + `pnpm test` 不退化（baseline 是 `git diff` 前的 status）

## 4. Fastprobe commands

按 worktree CLAUDE.md "Feature 验证门禁"，PR 前必须可重现：

```bash
# Probe 1: orphans gone
test ! -f .claude/hooks/laziness-self-report.sh && \
test ! -f .claude/hooks/teamagent-stop.sh && echo "PASS: orphans removed"

# Probe 2: git history still traces them
git log --diff-filter=D --follow -- .claude/hooks/laziness-self-report.sh | head -5
git log --diff-filter=D --follow -- .claude/hooks/teamagent-stop.sh | head -5

# Probe 3: hooks-status.md exists, has ASCII art, < 200 lines
test -f docs/features/hooks-status.md && \
head -5 docs/features/hooks-status.md | grep -q '```' && \
[ $(wc -l < docs/features/hooks-status.md) -lt 200 ] && \
echo "PASS: hooks-status.md OK"

# Probe 4: STOP-HOOKS.md no longer references deleted files
! grep -E "laziness-self-report\.sh|teamagent-stop\.sh" docs/STOP-HOOKS.md && \
echo "PASS: STOP-HOOKS.md cleaned"

# Probe 5: bugs.md B-092 not open anymore
grep -A 0 "^| B-092" bugs.md | grep -qv "open$" && echo "PASS: B-092 closed"

# Probe 6: typecheck + test
pnpm typecheck && pnpm test
```

## 5. Risks & rollback

| 风险 | 缓解 |
|------|------|
| 用户脚本 hardcode 调用 `.claude/hooks/laziness-self-report.sh` | 已搜索：仅 `bugs.md`/`docs/specs/hook-add-laziness/verify/*` 引用，前者是 bug 跟踪、后者是历史夹具。无 active code path 调用。 |
| `.claude/hooks/digital-twin-tap.sh` 注释里引用 `teamagent-stop.sh` 作为 mirror pattern，删除后注释失真 | 同步更新该 .sh 的头注释，去掉 cross-reference |
| 用户在 `~/.claude/settings.json` 自己 hardcode 引用了已删除 .sh | 不影响——committed `.claude/settings.json` 只引 `self-report-fused.sh` + `digital-twin-tap.sh`；用户自定义层级 TeamAgent 不管 |

**Rollback**：`git revert <merge-sha>`，文件回到工作树。Plan 三件套 + 新文档保留作为历史记录。

## 6. Out of scope (下个 PR)

- 把 `bin-session-end.cjs` / `bin-pre-compact.cjs` / `bin-digital-twin-tap.cjs` 接进 `installHook()` 的 channelOps 数组（B scope）
- 删除 `teamagent install-user-hook` 独立命令，把 SessionStart 折进 `installHook()` user-level 分支（C scope）
- `.claude/hooks/*.sh` 孤儿扫描器 + warning（B scope 一部分）

这些独立 PR 完成；本次只做 archive + canonical doc，作为 B+C 全链路的第 1 步。
