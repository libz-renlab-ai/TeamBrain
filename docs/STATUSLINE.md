```text
       ┌─────────────────────────────────────────────────────────────┐
       │  TeamBrain statusLine chain wrap (issue #104 / PR #124)     │
       │                                                             │
       │   user_cmd      echo (LF)      teamagent_cmd                │
       │       │             │              │                        │
       │       └──── bash -c '<u>; echo; <t>' ────┘                  │
       │                       │                                     │
       │                       ▼ Claude Code 渲染                    │
       │   ┌────────────────────────────────────────────────────┐   │
       │   │ <user statusline output>                           │ ① │
       │   │ ⚙ teamagent: rules=N 知识=M 命中=K                  │ ② │
       │   └────────────────────────────────────────────────────┘   │
       └─────────────────────────────────────────────────────────────┘
```

# Statusline / 状态栏共存

Claude Code 一次只渲染一条 `statusLine.command`。如果用户已经有自己的 statusline（user level `~/.claude/settings.json` 或 project level `.claude/settings.local.json`），TeamBrain 会**用 `bash -c` chain 把两段连起来**，中间一个 `echo` 分行——不替换、不丢字段、可还原（issue #104 / PR #124）。TeamBrain **只读写 project-level `.claude/settings.local.json`**（gitignored、per-host），从不修改用户提交到仓库的 `.claude/settings.json`。

## TL;DR

- **预期渲染**：两行，**第 1 行是用户原 statusline 输出**，**第 2 行是 TeamBrain 的统计行**。
- **形态**：`<repo>/.claude/settings.local.json` 里的 `statusLine.command` 是 `bash -c '<user_cmd_escaped>; echo; <teamagent_cmd>'`。
- **从不动 user level**：`~/.claude/settings.json` 永远不被写。
- **可逆**：`pnpm teamagent uninstall` 还原（详见下文 restore 矩阵）。
- **没用户原 statusline 时**：直接 `<teamagent_cmd>`（无 `bash -c` wrapper、无 `echo`），单行渲染。

## 5 字段速查

| 字段 | 内容 |
|------|------|
| trigger | `pnpm teamagent init` 或 `pnpm teamagent install-hook`（直接 / 间接经由 init）。 |
| impact scope | `<cwd>/.claude/settings.local.json` 的 `statusLine` 字段：`{type:"command", command, _teamagentTag, _teamagentOriginalCommand?, _teamagentOriginalType?, _teamagentOriginalScope?}`。从不写 user level `~/.claude/settings.json`。 |
| audit trail | init / install-hook 的 stdout 报告 `已合并已有 statusLine（scope=user|project）` 或 `首次注册`；日志层面无独立 file，只有 stdout / `init.ts:597` 的提示。 |
| opt-out | `pnpm teamagent uninstall`（删除 `_teamagentTag` 项并按备份 scope 还原）；或手动编辑 `.claude/settings.local.json` 删 `statusLine`。 |
| 关联 issue / PR / 测试 | issue #104（chain wrap）/ issue #331（CC runtime 字段扩展）；fix PR：#124；源码：`packages/cli/src/commands/install-hook.ts:235-353`、`scripts/teamagent-statusline.cjs`；测试：`packages/cli/src/__tests__/install-hook.test.ts:182-262`、`packages/cli/src/__tests__/statusline-format.test.ts` |

## TeamBrain statusline 字段速查（issue #331 起）

完整渲染（有 CC stdin 时）：

```
TeamAgent | 规则:N | 帮过:T今/W周 | 拦过:T今 | 项目:<name> | 模型:M | 上下文:CK | 用量:$X.XX | 5h:H | 7d:D | 会话:OK | <hint>
```

| 字段 | 来源 | 何时显示 / 跳过 |
|------|------|------------------|
| `规则:N` | 项目 / 全局 `.teamagent` knowledge.db (非 wiki) | always（DB 缺 → `规则:-`） |
| `帮过:T今/W周` | `~/.teamagent/events.db` HELPED_EVENT_KINDS 计数 | always（events.db 缺 → `帮过:-`） |
| `拦过:T今` | `~/.teamagent/events.db` RISK_EVENT_KINDS 计数 | always |
| `项目:<name>` | `path.basename` of main checkout (worktree-aware via `findMainCheckoutFromWorktree`); capped at 32 chars + `...` suffix; falls back to `unknown` on root-only / empty / unreadable cwd. issue #306. | always |
| `模型:M` | CC stdin JSON `model.display_name`（缺则 `model.id`） | stdin 提供时 |
| `上下文:CK` | `transcript_path` 末尾 256 KB 反向扫到的最近一条 assistant `message.usage` = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` | transcript 可读且有 usage |
| `用量:$X.XX` | CC stdin `cost.total_cost_usd` 2 位小数 | `> 0` 时；`=== 0` 跳过避免 `$0.00` 噪声 |
| `5h:H` | 同 transcript 目录下 `mtime > now-7d` 的 JSONL（cap 20 file，tail 256 KB），按 `timestamp` 累加最近 5h 的 assistant 全部 token | 至少 1 行 in-window |
| `7d:D` | 同上、累加最近 7d | 至少 1 行 in-window |
| `会话:OK` / `会话:⚠超长` | CC stdin `exceeds_200k_tokens` 布尔 | key 存在时显示；缺则跳过 |
| `<hint>` | `~/.teamagent/events.db` 最近一行的 `CONTRIBUTION_HINTS[kind]`；全 0 → `待命中（让我学几条规则吧）` | always |

**容错铁律**：任何一个新字段抛错 → 单独跳过（不挂整行）；空 / 非法 stdin → 6 个新字段全跳，老 4 字段 byte-identical。

**不暴露**：CC 没原生 5h/7d quota / reset API，本地累加的 5h/7d 只反映**本机** transcript（同一 cwd 不同 worktree 共享 `~/.claude/projects/<encoded-cwd>/`），不报"limit"也不报"reset 时间"——避免误导。

## 期望渲染（用户视角）

### 用户原本有 statusline

`~/.claude/settings.json`（user level）：

```json
{ "statusLine": { "type": "command", "command": "echo USER_HOME_STATUSLINE" } }
```

→ `pnpm teamagent init` 后 `<repo>/.claude/settings.local.json`：

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash -c 'echo USER_HOME_STATUSLINE; echo; node /…/dist/teamagent-statusline.cjs'",
    "_teamagentTag": "teamagent-statusline",
    "_teamagentOriginalCommand": "echo USER_HOME_STATUSLINE",
    "_teamagentOriginalType": "command",
    "_teamagentOriginalScope": "user"
  }
}
```

Claude Code 渲染：

```
USER_HOME_STATUSLINE
TeamAgent | 规则:N | 帮过:T今/W周 | 拦过:T今 | 模型:M | 上下文:CK | 用量:$X.XX | 5h:H | 7d:D | 会话:OK | <hint>
```

第 2 行字段定义见上"TeamBrain statusline 字段速查"。

### 用户原本没 statusline

→ `statusLine.command` 直接是 `node /…/dist/teamagent-statusline.cjs`（无 `bash -c`、无 `echo`、无备份字段，单行渲染）。

## Backup field schema

`statusLine` 中三个备份字段决定 `uninstall` 时如何还原：

| 字段 | 含义 | 取值 |
|------|------|------|
| `_teamagentOriginalCommand` | 用户原 cmd 字面值 | string |
| `_teamagentOriginalType` | 用户原 type | `"command"`（默认） |
| `_teamagentOriginalScope` | 来源层级 | `"project"` / `"user"` |

只有发生 chain wrap 时才写这三个字段；用户原本没 statusline 时不写。

## Uninstall restore matrix

`pnpm teamagent uninstall` 找到带 `_teamagentTag: "teamagent-statusline"` 的项后：

| `_teamagentOriginalScope` | 行为 |
|---------------------------|------|
| `"project"` | 把 project-level `statusLine` 写回 `{type: _teamagentOriginalType, command: _teamagentOriginalCommand}`（用户在项目里写过的 cmd 还原） |
| `"user"` | 直接**删掉** project-level `statusLine`；user level `~/.claude/settings.json` 本来就没动，自动恢复用户的体验 |
| 没有备份字段 | 直接删 project-level `statusLine`（说明 install 时用户也没有，删了就回到原样） |

## inspection commands

```bash
# 看 project level 的 statusLine
cat .claude/settings.local.json | jq '.statusLine'

# 看 user level 的 statusLine（永远不被 TeamBrain 改）
cat ~/.claude/settings.json | jq '.statusLine'

# 一次看清楚两层 + 备份字段（什么 scope 被收编了）
jq -n \
  --slurpfile p .claude/settings.local.json \
  --slurpfile u ~/.claude/settings.json \
  '{project: $p[0].statusLine, user: $u[0].statusLine}'
```

## tmux + claudefast dogfood

要在本地实际看渲染效果（不是只看配置文件）：

```bash
# 1. 装 statusline（先确保 dist 已 build）
pnpm install && pnpm build
node packages/cli/dist/bin.js install-hook

# 2. tmux 起 claudefast，让它实际把 statusLine 渲染出来
tmux new-session -d -s sl-dogfood "claudefast"
sleep 5
tmux capture-pane -t sl-dogfood -p | tail -10

# 3. 期望：两行连续输出（用户原 + teamagent）
```

## 参考

- issue #104：https://github.com/libz-renlab-ai/TeamBrain/issues/104（chain wrap user statusline via `bash -c`）
- issue #331：https://github.com/libz-renlab-ai/TeamBrain/issues/331（暴露 CC 运行时状态：模型/上下文/用量/5h/7d/会话健康）
- fix PR：#124（commit `bbb430f` "feat(m4): chain wrap user statusLine via bash -c (#104)"）
- 源码：`packages/cli/src/commands/install-hook.ts:235-353`（注册）/ `:316-320`（uninstall）；`scripts/teamagent-statusline.cjs`（CC stdin 解析 + 字段渲染）
- 测试：`packages/cli/src/__tests__/install-hook.test.ts:182-262`、`packages/cli/src/__tests__/statusline-format.test.ts`
- 历史 plan/research：`docs/plans/2026-05-07-issue104-statusline-{plan,research,report}.md`、`docs/plans/2026-05-12-issue331-statusline/{research,plan,judge,report}.md`
- 触发审计入口：`docs/plans/issue-118/research.md` §4
