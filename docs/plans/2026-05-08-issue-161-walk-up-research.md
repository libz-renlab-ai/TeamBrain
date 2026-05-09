# Issue #161 — call site audit (research.md)

由 sonnet audit agent 在 fix/issue-161-walk-up 分支上跑 grep + read 完成。原计划 5 处 call sites 是 ADR-0008 hook-shell refactor 之前的旧行号；ADR-0008 之后实际是 4 处（PreToolUse / UserPromptSubmit 已经走中央化的 `hook-shell/index.ts:resolvePaths`），但 **audit 发现额外 8 处 plan 没列出**。

## Confirmed call sites — 已被 worker 1 修复 (commit 907d5b3)

| File | Line | Status |
|---|---|---|
| `packages/cli/src/hook-shell/index.ts` | 70 (resolvePaths 内) | ✅ fixed — 覆盖所有 7 个 runHook 通道（PreToolUse/UserPromptSubmit/SessionEnd 等） |
| `packages/cli/src/bin-stop.ts` | 418 (catchUpDbPath) | ✅ fixed |
| `packages/cli/src/bin-stop.ts` | 500 (projectDbPath in narrative scan) | ✅ fixed |
| `packages/cli/src/session-start-logic.ts` | 56 (decideAction) | ✅ fixed |

## Newly found project-scoped call sites — 需要 walk-up 但 worker 1 未修

| # | File | Line | Pattern | 影响（病毒式传播 #1） |
|---|---|---|---|---|
| 1 | `packages/cli/src/session-start-logic.ts` | 50 | `existsSync(join(cwd, ".teamagent", "auto-init.disabled"))` | 子目录读不到 per-project opt-out flag → 已禁用项目从子目录启动会被又一次 auto-init |
| 2 | `packages/cli/src/scan-cursor.ts` | 13/28-34 | `path.join(cwd, ".teamagent/scan-cursor.json")` | Stop hook 增量 scan cursor，子目录会建独立 cursor → 重复扫描已分析过的 turn |
| 3 | `packages/cli/src/harvest-writer.ts` | 9/31 | `path.join(cwd, ".teamagent/last-harvest.md")` | 子目录会建独立 harvest 日志 → 主项目看不到这次 stop 学到的东西 |
| 4 | `packages/cli/src/commands/config.ts` | 19 | `path.join(cwd, ".teamagent/config.json")` | Stop pipeline 读 config (`stop_mode`/`stop_scan_errors`) — 子目录读不到主项目配置 |
| 5 | `packages/cli/src/m5-session-hook.ts` | 42 (`isInfected`) | `path.join(projectRoot, ".teamagent/manifest.json")` | M5 viral session 在子目录看不到 manifest → infect/bootstrap/sync 全部不触发 |
| 6 | `packages/cli/src/commands/recent-entries.ts` | 19 | `path.join(cwd, ".teamagent", "knowledge.db")` | terminal summary 在子目录拿不到项目规则统计 |
| 7 | `packages/adapters/src/mcp/pitfall-server.ts` | 54-57 | `path.join(process.env["TEAMAGENT_CWD"] ?? process.cwd(), ".teamagent/knowledge.db")` | MCP pitfall 工具在子目录返回空 |
| 8 | `packages/cli/src/commands/recording.ts` | 217, 230 | `path.join(cwd, ".teamagent/recordings.json")` 等 | Recording 在子目录写到独立位置 → 主项目看不到 |

## 用户级 call sites — 不需要 walk-up（已确认正确）

11 处 `os.homedir()` 或 `teamagentHomeDir()` 基的引用：bin-stop、bin-pre-compact、hook-shell、bin-session-start、m5-session-hook、warmup-state、bin-updater、postinstall.mjs。这些是用户全局的 `~/.teamagent/`，**不应该 walk-up**。

## 决策

按 PR-PLAN anti-goals + 鸭总激进 viral 原则，**全部 8 处都纳入本 PR**。理由：
- 都符合"病毒式传播 #1：本地任意地方都自动运行"的产品需求
- 修法 pattern 完全一致：`cwd → const root = findTeamagentRoot(cwd) → root`
- 一次性修干净，避免后续 N 个零碎 follow-up PR

## 总结

- 原计划 5 处 → 实际需修 12 处（worker 1 已完成 4，worker 3 待修 8）
- `findTeamagentRoot` helper 已存在，复用
- 修剩余 8 处后跑全套测试 + typecheck + 1+2+3 验证
- push 到 fix/issue-161-walk-up + 开 PR + 跑 `/review`
