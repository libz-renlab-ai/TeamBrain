# Clean-uninstall recipe（手动卸载 TeamAgent）

> **范围说明**：这是一份**手动**卸载步骤，是 issue #477 的交付物之一。它存在的原因是
> 当前没有一个真正干净的 `teamagent uninstall` 命令——那个命令是 Bug #4 的范围，会在
> **另一个独立 issue** 里实现。在它落地之前，按本文档操作可以把 TeamAgent 从一台机器上
> 彻底摘干净，让之后的重装是一次真正干净的重装。

## 为什么需要它

issue #477 的根因是：在 Node 22.5–23.3 上，Claude Code 把 hook 当子进程 spawn，子进程
**不继承**调用 shell 的 `NODE_OPTIONS`，所以让 CLI 能跑的 `--experimental-sqlite`
workaround 从来没到达 hook —— 每个 hook 都因 `ERR_UNKNOWN_BUILTIN_MODULE` 静默失效
（DOA），而 `doctor` 还一路报绿。#477 的代码修复（把 flag 焊进 hook 注册命令 + 让
`doctor` / `init` 诚实地探测 node:sqlite 可加载性）只对**新装**生效。已经被旧版本写脏
`~/.claude/settings.json` 的机器，按 grill 决策走「内部用户重装」——重装前先按本文档
清干净。

## 步骤

### 1. 移除 `~/.claude/settings.json` 里的 TeamAgent hook 条目

TeamAgent 写入的 hook 条目带 `_teamagentTag`（如 `teamagent-pre-tool-use`、
`teamagent-session-start`、`teamagent-stop` 等），或者 `command` 字段里指向
`bin-*.cjs` / `teamagent-statusline.cjs`。

- 打开 `~/.claude/settings.json`
- 删掉 `hooks` 下每个 channel 数组里所有带 `_teamagentTag` 前缀为 `teamagent-` 的条目，
  以及 `command` 里出现 `teamagent` / `~/.teamagent/hooks/` 的条目
- 如果某个 channel 数组被清空，连同该 channel key 一起删
- 删掉 `statusLine` 字段（如果它的 `command` 指向 `teamagent-statusline.cjs`，或带
  `_teamagentTag: "teamagent-status-line"`）
- 项目级配置同理检查 `<project>/.claude/settings.json` 与
  `<project>/.claude/settings.local.json`

> 旧版本可能写过**裸 `node <bundle>`** 形态的命令（没有 `--experimental-sqlite`）——
> 这正是 #477 的 DOA 源头。重装后新命令会带上 flag（见
> `packages/cli/src/lib/node-sqlite-flags.ts`），所以这一步必须把旧条目删干净，不能只
> 改不删。

### 2. 删除 `~/.teamagent`

```bash
rm -rf ~/.teamagent
```

这一目录下有 staged hook bundles（`~/.teamagent/hooks/`）、knowledge / events sqlite
DB、embedder / updater 状态文件、日志、rollback 备份等。全删，重装会重建。

> 项目级 `<project>/.teamagent/`（含 `knowledge.db`）按需保留或删除：保留则重装后
> `init` 会判定「已初始化」而跳过 auto-init；想要全新一遍就一起删。

### 3. 确认没有残留 daemon 在跑

TeamAgent 会 spawn 两类后台进程：embedder daemon（`bin-embedder.cjs`）和 uploader
daemon（`bin-uploader.cjs`）。卸载前确认它们已退出：

```bash
# macOS / Linux
pgrep -fl 'bin-embedder.cjs|bin-uploader.cjs' || echo "no teamagent daemons running"
# 如有残留，按 PID kill：
pkill -f 'bin-embedder.cjs' ; pkill -f 'bin-uploader.cjs'
```

```powershell
# Windows PowerShell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'bin-embedder\.cjs|bin-uploader\.cjs' } |
  Select-Object ProcessId, CommandLine
# 如有残留：Stop-Process -Id <pid>
```

daemon 都带 idle-exit（embedder 30 分钟无活动自动退），所以正常情况下关掉 Claude Code
一会儿后它们会自己消失；这一步只是确认，不是必须手动 kill。

### 4. （可选）卸载全局 CLI

```bash
npm uninstall -g teamagent
```

### 5. 验证

```bash
# 不应再有 teamagent 条目
cat ~/.claude/settings.json
# 不应存在
ls ~/.teamagent 2>/dev/null
```

之后重装（`npm install -g teamagent` → 在项目里 `teamagent init`）就是一次干净安装：
新的 hook 注册命令会带上 `--experimental-sqlite --no-warnings`，`teamagent doctor` 的
node 检查会真的 spawn 一个子进程验证 `node:sqlite` 能加载，`init` 在不支持的 Node 上会
fail-loud 而不是假报成功。

## Forward intent（不在 #477 范围内）

- **Node floor 提到 24**：`node:sqlite` 在 Node 24 上是非实验特性，到那时
  `--experimental-sqlite` flag 可以从所有 hook 注册命令、spawn 点和探针里**整体移除**
  （`NODE_SQLITE_FLAGS` 改成空数组或直接删调用点）。这一步要等团队的 Node 采用率跟上，
  是一个独立 follow-up。
- **真正的 `teamagent uninstall` 命令**（Bug #4）：本文档的手动步骤应该被一个幂等的
  `teamagent uninstall` 子命令取代——它自动做第 1–3 步。那是另一个独立 issue 的范围，
  不在 #477 里。
