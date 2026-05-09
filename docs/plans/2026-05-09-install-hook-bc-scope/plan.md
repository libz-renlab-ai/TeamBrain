```
        __          install-hook B+C scope: 5 items in one PR
      <(o )___                                                  
       ( ._> /        ┌─ wire SessionEnd ──┐                   
        `---'         ├─ wire PreCompact ──┤                   
                      ├─ wire DigitalTwin ─┼─► installHook()   
                      ├─ fold SessionStart ┤   channelOps      
                      └─ orphan .sh scan ──┘                   
```

# Plan: install-hook B+C scope (2026-05-09)

## 1. Task description

**做什么**：`teamagent init` 当前只装 4 个 hook channel；项目里有更多已建好的 bin 源没接进来。这个 PR 把 5 件事一次做完，让 init 装满 7-8 个 channel + 收编孤儿 .sh + 把独立的 install-user-hook 折进 installHook。

**5 件事**：

1. **Wire `bin-session-end.cjs`** —— 加 `SESSION_END_TAG`、`sessionEndEntry` 选项、project-level 内联块（镜像现有 Stop 写法）+ user-level channelOps 条目。
2. **Wire `bin-pre-compact.cjs`** —— 同 1 但 channel 是 `PreCompact`；matcher 缺省（PreCompact 无 matcher 概念）。
3. **Wire `bin-digital-twin-tap.cjs`** —— 加为 user-level only 的第二个 Stop channelOps 条目（`tag: DIGITAL_TWIN_TAG`）。**仅 user-level** 的原因：committed `.claude/settings.json` 里 `digital-twin-tap.sh` 已经包了同一个 .cjs 并且有 SIGTERM 转发。如果同时往 project-level `settings.local.json` 也写一份，TeamBrain 自身会 double-tap。User-level 写入只影响打开**别的项目**时（那些项目没有 .sh），保证至少一次触发。已知 TeamBrain 仍会 double-tap，但 `tapSession()` 按 `(cwd, session_id)` 设计应当是幂等的；列入 risk。
4. **Fold `install-user-hook` SessionStart into `installHook()`** —— `installHook()` 的 `mergeUserLevelHooks` 增加一条 `userOnly: true` 的 SessionStart 条目；`packages/cli/src/commands/install-user-hook.ts` 加 deprecation 警告但继续工作（保留 ≥ 1 major version 的兼容窗口）。
5. **Orphan `.sh` scanner** —— 新函数 `auditOrphanShellHooks(cwd)`：扫 `.claude/hooks/*.sh`，cross-ref `.claude/settings.json` + `settings.local.json` 里的 command 字符串，返回未引用的 .sh 列表；`init.ts` 跑完 `installHook` 后调用它，把孤儿打到 stderr 作为 warning（非阻塞）。

**不做什么**：
- ❌ 不删 committed `.claude/settings.json` 里的 `digital-twin-tap.sh` 引用（avoid 破坏 fresh-clone-without-init 体验）
- ❌ 不删 `install-user-hook` 命令本身（仅加 deprecation；删除留给下一个 major version）
- ❌ 不重构 project-level installHook 为 channelOps（保持现有 inline 模式以减小 diff）

## 2. Expected outputs

### 2.1 新增 / 修改文件
- `packages/cli/src/commands/install-hook.ts` —— 4 个新 tag、4 个新 option 字段、4 个新 default entry resolver、2 个新 project-level inline 块（SessionEnd + PreCompact）、扩展 channelOps 4 条、扩展 isTeamagentEntry、扩展 uninstallHook、新函数 `auditOrphanShellHooks`
- `packages/cli/src/commands/install-user-hook.ts` —— 顶部加 deprecation `console.warn`
- `packages/cli/src/commands/init.ts` —— 跑完 installHook 后调用 `auditOrphanShellHooks` 输出 warning step
- `packages/cli/src/__tests__/install-hook.test.ts` —— 新增测试覆盖 4 channel + scanner + deprecation
- `docs/features/hooks-status.md` —— 更新覆盖率表（5/12 → 9-10/12）

### 2.2 Plan 三件套
- `plan.md`（this file, 4-section, < 200 lines）
- `judge.md`（third-party MD playbook, 6-8 probes）
- `report.md`（after merge）

### 2.3 PR
- 单一普通 PR（非 draft），squash-merge `--auto`

## 3. Third-party judge harness (MD playbook)

详见同目录 `judge.md`。MAIN agent 跑 8 个 probe：

- **probe 1** : `pnpm typecheck` 0 错
- **probe 2** : `pnpm test packages/cli/src/__tests__/install-hook.test.ts` 全绿
- **probe 3** : 在 tmpdir 跑 `teamagent init --skip-import --skip-warmup`，验证 `.claude/settings.local.json` 里有 6 个 `_teamagentTag`（pre/post/userprompt/stop + session-end + pre-compact）
- **probe 4** : 验证 user-level `~/.claude/settings.json`（mock 隔离）有 8 个 `_teamagentTag`（同上 + session-start + digital-twin-tap）
- **probe 5** : 跑 `teamagent install-user-hook` 验证 stderr 含 "deprecated" 字样
- **probe 6** : 在含孤儿 .sh 的临时项目跑 init，验证 stderr 列出孤儿名
- **probe 7** : `pnpm verify` 全套不退化
- **probe 8** : LLM-judge 读所有 raw JSON + evidence 给 PASS/FAIL

## 4. Fastprobe commands

```bash
# Probe 1
pnpm typecheck

# Probe 2
pnpm vitest run packages/cli/src/__tests__/install-hook.test.ts

# Probe 3 (manual smoke; full e2e is in vitest)
TMPDIR=$(mktemp -d)
HOME=$TMPDIR pnpm teamagent init --skip-import --skip-warmup --skip-seed --no-user-level-hook
jq '[.hooks | to_entries[] | .value[]?._teamagentTag // empty] | length' "$TMPDIR/.claude/settings.local.json"

# Probe 5 (deprecation)
pnpm teamagent install-user-hook 2>&1 | grep -i "deprecat"

# Probe 6 (orphan scanner)
TMPDIR=$(mktemp -d) && mkdir -p "$TMPDIR/.claude/hooks" && touch "$TMPDIR/.claude/hooks/orphan.sh"
HOME=$TMPDIR pnpm teamagent init --skip-import --skip-warmup --skip-seed --no-user-level-hook 2>&1 | grep "orphan.sh"
```

## 5. Risks & rollback

| 风险 | 概率 | 缓解 |
|------|------|------|
| `tapSession()` 不幂等 → digital-twin double-tap 致脏数据 | 中 | 看源码注释「per (cwd, session_id)」；如果生产数据出问题，回滚为 user-only-but-skip-when-sh-detected |
| `install-user-hook` 在 CI 有人调用 | 低 | 保留 functional 实现，仅加 deprecation log |
| 孤儿 scanner 误报用户自定义 .sh | 中 | 默认仅 warning（非阻塞）；scanner 文档化白名单 env var `TEAMAGENT_HOOK_SCAN_IGNORE` 留作未来扩展 |
| 新 channelOps 条目导致 settings.local.json 体积膨胀 | 低 | 每条 ~150 字节；6 条总计 < 1KB |

**Rollback**: `git revert <merge-sha>`. 后向兼容性：现有用户的旧 settings.local.json 在 install-hook 重跑时被 dedup 函数清理，无残留。

## 6. Out of scope (next PR)

- 把 project-level installHook 重构为统一 channelOps loop（消除 inline 与 channelOps 双轨）
- 删除 `digital-twin-tap.sh` 与 committed settings.json 引用，改为 init-唯一路径
- 删除 `install-user-hook` 命令本身（major version bump）
- `auditOrphanShellHooks` 增加交互模式（`--register-orphans` 让用户决定是否注册）
