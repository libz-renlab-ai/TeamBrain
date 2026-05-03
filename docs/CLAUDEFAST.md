# Claudefast Usage

本文说明本项目里提到的 `claudefast` 是什么，以及如何用它测试 TeamAgent 的 Claude Code hooks。

## 两个含义

### 1. 机器上的 `claudefast`

`claudefast` 不是 TeamAgent 自带命令，而是这台机器上的本地 wrapper。

当前机器上它位于：

```bash
/Users/liushiyu/.local/bin/claudefast
```

它的行为是：

- 检查 `claude` 命令是否存在。
- 设置 Anthropic-compatible API 环境变量。
- 使用 MiniMax fast profile 作为底层模型服务。
- 最后执行 `claude --dangerously-skip-permissions --add-dir "$PWD" "$@"`。

不要把机器本地 wrapper 里的 API token 写进项目文档、测试 fixtures、日志或 commit。解释机器 wrapper 时也不要展示 token 的任何片段、前缀或后缀；统一写成 `[redacted]`。文档里只记录行为，不记录凭据。

在其他机器上，`claudefast` 可能不存在，也可能只是一个别名，例如：

```bash
alias claudefast='claude --model haiku'
```

或者是一个使用其他 Anthropic-compatible provider 的 wrapper。项目测试脚本不应假设它一定使用 MiniMax，只应假设它最终调用 Claude Code CLI。

### 2. 项目里的 `claudefast` 约定

在 TeamAgent 项目里，`claudefast` 指“用更便宜或更快的 Claude Code profile 跑非交互测试”的习惯写法。

推荐用于 hook JSON 测试的流程是先探测本机 wrapper 支持哪些 flag：

```bash
claudefast -h > /tmp/claudefast-help.txt
```

当前项目约定：不要把 `--include-hook-events` 当成可用 flag 或验收证据。
hook evidence 来自 `--debug hooks --debug-file <path>`；stream-json 负责保存
conversation / tool-use transcript。常见形态是：

```bash
claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file /tmp/teamagent-hooks.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "你的测试 prompt"
```

含义：

- `-p` / `--print`：非交互执行，输出后退出。
- `-p` 必须带 prompt 参数，或通过 stdin 提供 prompt；不要只给 flags。
- `--output-format stream-json`：按 JSON event stream 输出，适合脚本解析。
- `--debug hooks --debug-file <path>`：把 hook 调试证据写入指定文件；这是本项目的 hook evidence 来源。
- `--include-partial-messages`：输出模型流式增量，适合测试实时 UI 或解析器。
- `--verbose`：当前 Claude Code 要求 `-p --output-format stream-json` 必须带此参数。
- `--permission-mode acceptEdits`：减少普通编辑授权打断，同时保留 hook 行为。

在 Claude Code 交互界面里，`!claudefast ...` 通常表示“执行本地 shell 命令”。在普通 shell、npm script、CI、测试脚本里，命令名应写成 `claudefast ...`，不要带 `!`。

## TeamAgent 测试注意事项

`claudefast` 适合测试 Claude Code 会话里的事件：

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PostToolUse`
- `Stop`
- 工具调用事件
- hook deny / warn / pass 决策

它不适合直接测试 TeamAgent 自己的 CLI 数据管线，例如：

- `teamagent init`
- `teamagent doctor --json`
- `teamagent stats`
- `teamagent compile`
- `teamagent calibrate`
- `teamagent wiki:*`
- benchmark report 生成

这些功能应直接用 `pnpm teamagent ...` 或对应包的测试命令验证。

## 常用命令

查看机器上的 wrapper：

```bash
command -v claudefast
sed -n '1,120p' "$(command -v claudefast)"
```

查看 Claude Code 支持的参数：

```bash
claudefast -h
```

测试 TeamAgent hook JSON：

```bash
claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file /tmp/teamagent-hooks.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "创建一个 TypeScript 文件，里面用 axios 发请求"
```

只测最终 JSON 结果而不关心 hook stream：

```bash
claudefast -p \
  --output-format json \
  --permission-mode acceptEdits \
  "用一句话解释 TeamAgent"
```

不要用 `--bare` 测 TeamAgent hooks。`--bare` 会跳过 hooks、plugin sync、CLAUDE.md 自动发现等机制，会把 TeamAgent 最需要观察的行为关掉。

## 批量测试脚本

项目提供了一个并发池脚本，用 `claudefast -p` 批量测试 stream-json 与 TeamAgent hooks：

```bash
pnpm smoke:claudefast
```

默认行为：

- 并发数：8。
- 输出目录：`scripts/out/claudefast-stream-json/<timestamp>/`。
- 每个 case 都会保存：
  - `command.json`：实际执行的命令参数。
  - `stdout.jsonl`：Claude Code stream-json 原始输出。
  - `stderr.log`：stderr。
  - `summary.json`：该 case 的检测摘要。
- 根目录会生成 `report.json` 汇总所有 case。
- 运行前会临时写入一条专用 block fixture 规则，用来验证 `permissionDecision=deny`；脚本退出时会删除该规则。

可用参数：

```bash
pnpm smoke:claudefast -- --dry-run
pnpm smoke:claudefast -- --concurrency=8
pnpm smoke:claudefast -- --batch-size=8
pnpm smoke:claudefast -- --timeout-ms=180000
pnpm smoke:claudefast -- --case=write-batch-insert-deny
pnpm smoke:claudefast -- --bin=/path/to/claudefast
pnpm smoke:claudefast -- --out=/tmp/teamagent-stream-json
```

当前覆盖的测试面：

- CLAUDE.md / docs context loading。
- `--json-schema` 结构化输出。
- tool_use / tool_result stream events。
- `Bash` / `Write` / `Edit` / `WebFetch` 的 hook 可观测性。
- `SessionStart` / `UserPromptSubmit` / `PreToolUse` / `PostToolUse` / `Stop` hook debug evidence。
- TeamAgent warn reason。
- TeamAgent block / deny reason。
- partial message chunks。
