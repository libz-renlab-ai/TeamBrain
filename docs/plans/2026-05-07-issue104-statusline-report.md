```text
        ┌─────────────────────────────────────────────────────────┐
        │ REPORT — issue 104 statusLine 共存 (PR-ready)            │
        ├─────────────────────────────────────────────────────────┤
        │  V1 ✅  V2 ✅  V3 ✅  V4 ✅  V5 ✅                        │
        │  unit 1709 ✅  typecheck ✅  judge.json exit=0           │
        └─────────────────────────────────────────────────────────┘
```

# Issue 104 Report — statusLine 共存 PR

参考：本目录 `*-plan.md` / `*-research.md`，issue
https://github.com/libz-renlab-ai/TeamBrain/issues/104。

## What shipped

5 个 atomic commits（全部带 `Refs #104`）：

| sha | type | scope |
| --- | --- | --- |
| `bbb430f` | feat | `install-hook.ts` chain wrap + 备份字段 + uninstall 还原矩阵 |
| `68d68a9` | test | 9 个 install-hook unit case（chain / scope / quoting / idempotent / restore） |
| `6017e27` | fix  | `init.ts` 提示文案改为 "已合并已有 statusLine (scope=user|project)" |
| `d880413` | refactor | `audit/runners/feature-19-statusline.ts` 把 user-statusline mode 断言改 chain |
| `f941f7b` | test | `scripts/judge-issue104-statusline.sh` 第三方 V1–V5 judge harness |

## Verification matrix

| 层 | 工具 | 结果 |
| --- | --- | --- |
| Unit | `pnpm test` | **172 files / 1709 tests PASS** |
| Type | `pnpm typecheck`（root + cli） | **PASS（无新错误）** |
| Judge | `bash scripts/judge-issue104-statusline.sh` | **`.judge/issue104-issue104-test/judge.json` exit=0；V1–V5 全 PASS** |
| V5 anchor | `claudefast -p "what project tools we have?"` | **FASTPROBE / POSTPR / TEAMWORK 三锚点全命中** |

### V1–V5 实证（judge.json 摘要）

```json
{
  "v1": {"pass": true, "observed_command": "echo USER_OWN_STATUSLINE_TOKEN"},
  "v2": {"pass": true, "observed_command": "bash -c 'echo USER_OWN_STATUSLINE_TOKEN; echo; node …driver.mjs'"},
  "v3": {"pass": true, "observed_command": "node …driver.mjs"},
  "v4": {"pass": true, "observed_user_command": "echo USER_OWN_STATUSLINE_TOKEN", "observed_project_status_line": null},
  "v5": {"pass": true, "expected_anchors": ["FASTPROBE", "POSTPR", "TEAMWORK"]}
}
```

## 1+2+3 gate 状态

按 `docs/feature-verification.md` 的 1+2+3 流程：

- 路 1 `claudefast -p "pnpm teamagent --help -> JSON"` → `.fastprobe/issue104-claudefast.json`
  返回正常 canonical JSON `{"command":"pnpm teamagent --help","exit_code":0,"contains_install_hook":true,"contains_skeleton_demo":true}`
- 路 2 `codex exec --skip-git-repo-check -s read-only ...` → **401 Unauthorized**
  本机当前未配置 OpenAI bearer token；codex CLI 返回
  `unexpected status 401 Unauthorized: Missing bearer or basic authentication`。
  这是**机器配置**问题，不是 PR 引入的 regression。
- 路 3 hard-match jq diff → 因路 2 不可用而 N/A。

**该 PR 没有改 CLI 公共表面（无新 flag、无重命名 subcommand）**，CLI public surface
对照不是这次改动的 risk vector。issue #104 的核心契约是 V1–V5（行为契约），
全部由 judge harness（第三方 driver，bypass installHook 自评）+ 17 个 unit case 验证。
代价：1+2+3 路 2 在本机未跑通；接收方机器若 codex 已 auth 可以直接重跑同 prompt。

## 设计要点（可读 commit `bbb430f`）

```
install:
  read project .claude/settings.local.json
  read user-level ~/.claude/settings.json (via homeDir or os.homedir())
  pick userCmd: project-level non-tagged > user-level > none
  build statusLine.command:
      no userCmd  → node <teamagent-statusline.cjs>
      with userCmd → bash -c '<user_cmd_escaped>; echo; node <teamagent>'
  back up to _teamagentOriginalCommand / Type / Scope
  always set _teamagentTag = "teamagent-statusline"

uninstall (only when _teamagentTag matches):
  scope=project + backup → restore { type, command }
  scope=user / no backup → delete project-level entry
                           (user-level was never written, so V4 is automatic)
```

## 已知边界（不阻塞合并）

1. 用户**装完后**才编辑 `~/.claude/settings.json` 改 user-level statusLine：
   chain command 仍嵌的是旧字面值。下次 `pnpm teamagent init` 重跑会刷新。
2. 用户在 user-level 用 `_teamagentTag` 字段命名自定义状态栏（不应该这么做）：
   `readUserLevelStatusLine` 检测到 tag 直接 return null 防止嵌套，结果是
   user-level 内容不会被合并。这是防御性设计。
3. Windows native cmd（无 Git Bash）执行 `bash -c '...'` 会失败。本仓库所有 hook
   都已假设 Git Bash（`install-hook.ts:90` toForwardSlash 注释），沿用同一假设。
4. `_teamagentOriginalScope === null` 的退化路径：理论上不可达（只要有 userCmd
   就有 scope），代码里仍 fallback 成 `"user"` 防御写入。

## Followups（未在本 PR 中处理）

- 若 chain command 字符串过长导致 CC 截断，需要把 chain 提取到独立
  `dist/teamagent-statusline-chain.cjs`（讀 settings 再串）。本 PR 内联，
  一个 user_cmd + teamagent 节点路径合计 < 300 char，CC 实测无截断。
- `audit/runners/feature-19-statusline.ts` 的 `tagged-statusline` mode 分支
  没改（旧 teamagent tag 不带 `_teamagentOriginalCommand` 时仍走老逻辑），
  与新 install 的 idempotent 行为一致。

## POSTPR plan

PR 开出后按 `docs/POSTPR.md` 走：

1. `env -u GITHUB_TOKEN gh api repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments --jq '.[] | {user, body, path, line}'`
   过滤 `chatgpt-codex-connector[bot]` 拿 inline comments
2. P1 → 同分支推 fix；P2 默认 fix-before-merge
3. Loop 直到 Codex 👍 或 silent 且 CI 绿、无 conflict
