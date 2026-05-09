```
   ___       ___       ___
  ( o>     ( o>      ( o>      Stop hook 验证 + user-level cjs stale 排查
  //)      //)       //)       2026-05-09
  v"       v"        v"
   |        |         |
   v        v         v
  pong   self-report  SessionStart
 (-p)    (project,    crash =
         stream-json  pre-#206
         3 触发)      stale build
```

# self-report-fused 验证 + ~/.teamagent/hooks 陈旧副本排查

## TL;DR

1. **`.claude/hooks/self-report-fused.sh` 已启用**——本次会话里 `claude -p --output-format stream-json --include-hook-events` 实测触发 3 次，写到 `~/.claude/self-report/log.jsonl`（行数从 3585 → 3588）。
2. **项目版（9530B）≠ user-level 源版（8957B）**——项目版是 superset，多 11 行 B-092 jq-缺失 graceful 降级；不应该用 user-level 源版覆盖项目版。
3. **SessionStart hook crash `Cannot find module 'web-tree-sitter'`**：根因是 `~/.teamagent/hooks/bin-session-start.cjs` 是 commit `acd2525`（#206）修复前的 stale build，**当前 main 已修，需要重装 user-level hook 即可**。

## 验证 1：self-report-fused.sh 在本项目启用

`.claude/settings.json:10` 注册：

```json
{ "type": "command",
  "command": "bash \"${CLAUDE_PROJECT_DIR}/.claude/hooks/self-report-fused.sh\"",
  "timeout": 10 }
```

stream-json 实测（worktree `twinkly-waddling-alpaca`，2026-05-09 18:33Z）：

| # | log.jsonl action | 触发原因 |
|---|---|---|
| 1 | `block_missing_report` | 模型只回 `pong`，未带 `<self-report>` block |
| 2 | `approve` | 模型补带空 block，12 项全 `false` |
| 3 | `block_alarm` | 模型自陈 5 项 `true_signals` |

每次 Stop event 同时 spawn 6 个并行 hook（`hook_event:"Stop"` × 6）= `settings.json` 的 self-report-fused + digital-twin-tap + `settings.local.json` 的 teamagent-stop + user-level `~/.claude/settings.json` 的 3 个 Stop hook，数量对得上。

## 验证 2：项目版 vs user-level 源版差异

| 路径 | 大小 | mtime |
|---|---|---|
| `~/.claude/scripts/hooks/self-report-fused.sh` | 8957B | 2026-05-06 |
| `<repo>/.claude/hooks/self-report-fused.sh` | 9530B | 2026-05-09 |

`diff` 显示项目版多 11 行 `B-092` 增量：jq 不在 PATH 时输出 `{"continue":true,"suppressOutput":true}` + stderr 一行提示，避免 hook 静默失效（Windows Git Bash 用户场景）。**项目版是 strict superset**，不应该被 user-level 源版回退覆盖。

## 验证 3：SessionStart hook crash 根因 = stale user-level cjs

stream-json 错误堆栈（节录）：

```
Error: Cannot find module 'web-tree-sitter'
Require stack:
- /Users/m1/.teamagent/hooks/bin-session-start.cjs
  at Object.<anonymous> (.../bin-session-start.cjs:4398:30)
```

第 4398 行：

```js
var import_web_tree_sitter = require("web-tree-sitter");
```

这是 **top-level static require**，发生在脚本 module-load 阶段，进程级 `uncaughtException` handler 接不到。

### 跟当前 main 对比

| 维度 | user-level (`~/.teamagent/hooks/`) | project dist (`packages/cli/dist/`) |
|---|---|---|
| 文件大小 | 245383B | 366768B |
| `web-tree-sitter` 出现次数 | 1（top-level require） | 3（已 inline 进 bundle） |
| mtime | 2026-05-09 13:04 | 2026-05-08 11:29 |

`packages/core/src/matcher/legacy/ast-context.ts:2` 现状：

```ts
import type { Parser as ParserType } from "web-tree-sitter";
// ...
let wts = await import("web-tree-sitter").catch(() => null);
```

类型 import + 动态 import + catch fallback，**当前源码已防御**。`packages/cli/src/__tests__/hook-bundle-contract.test.ts` 里的契约测试也锁死了这一点。

### 时序对照

```
2026-05-09 13:04 ── user-level cjs build (mtime, stale)
                            │
2026-05-09 15:07 ── commit acd2525 = #206 fix landed
                    fix(session-start): lazy-load web-tree-sitter
                    to unblock hook startup
                            │
2026-05-09 18:33 ── 本次 stream-json 验证仍命中老 cjs crash
```

user-level 副本是 #206 修复**前**的 build，crash 跟当前源码无关。

## C 修复 recipe（不需要改源码）

跑 install-user-hook 用最新 dist 覆盖陈旧副本：

```bash
cd /Users/m1/projects/TeamBrain
pnpm install
pnpm --filter @teamagent/cli build
pnpm teamagent install-user-hook
```

验证（stale 标记应该不见了）：

```bash
grep -c 'require("web-tree-sitter")' ~/.teamagent/hooks/bin-session-start.cjs
# 期望: 0
ls -la ~/.teamagent/hooks/bin-session-start.cjs
# 期望: 文件大小 ≈ project dist 的 366KB（含 inline 后的 web-tree-sitter）
```

## B-092 jq 保护是否反向同步到用户级？

**不**。这是用户的 user-level dotfile 决定，不在本仓库 PR 范围。本 doc 只记录差异事实。如果用户决定同步，命令是：

```bash
cp <repo>/.claude/hooks/self-report-fused.sh ~/.claude/scripts/hooks/self-report-fused.sh
```

## 是否应该加 install-time sanity check

未来可以考虑：在 `packages/cli/src/commands/install-user-hook.ts` 装完 cjs 后 grep 一次，含 `var X = require("web-tree-sitter")` 这种 stale 标记就 abort + 提示用户先 rebuild。**留作后续 issue**，本 PR 不展开。

## 引用

- 修复 commit：`acd2525` = #206 `fix(session-start): lazy-load web-tree-sitter to unblock hook startup`
- 契约测试：`packages/cli/src/__tests__/hook-bundle-contract.test.ts:50-115`
- 源码当前状态：`packages/core/src/matcher/legacy/ast-context.ts:1-55`
- self-report-fused 源：`.claude/hooks/self-report-fused.sh`
- 验证产物（gitignore 排除）：`.fastprobe/stream.json`、`.fastprobe/hooks.debug.log`
