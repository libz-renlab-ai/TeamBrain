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
| 关联 issue / PR / 测试 | issue #104；fix PR：#124；源码：`packages/cli/src/commands/install-hook.ts:235-353`；测试：`packages/cli/src/__tests__/install-hook.test.ts:182-262` |

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
⚙ teamagent: rules=N 知识=M 命中=K
```

（第 2 行真正的字段名 / emoji 由 `dist/teamagent-statusline.cjs` 决定，本文不假定具体格式。）

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

- issue #104：https://github.com/libz-renlab-ai/TeamBrain/issues/104
- fix PR：#124（commit `bbb430f` "feat(m4): chain wrap user statusLine via bash -c (#104)"）
- 源码：`packages/cli/src/commands/install-hook.ts:235-353`（注册）/ `:316-320`（uninstall）
- 测试：`packages/cli/src/__tests__/install-hook.test.ts:182-262`
- 历史 plan/research：`docs/plans/2026-05-07-issue104-statusline-{plan,research,report}.md`
- 触发审计入口：`docs/plans/issue-118/research.md` §4
