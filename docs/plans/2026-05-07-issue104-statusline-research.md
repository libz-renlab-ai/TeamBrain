```text
                ┌───────────────────────────────────────────────┐
                │ ISSUE 104 — STATUSLINE COEXISTENCE RESEARCH    │
                │                                                │
                │   user-level   ~/.claude/settings.json         │
                │       │                                        │
                │       ▼ (CC merges, project takes precedence)  │
                │   project      .claude/settings.local.json     │
                │       │                                        │
                │       ▼                                        │
                │   CC renders ONE statusLine.command            │
                └───────────────────────────────────────────────┘
                            │
                            ▼
              fix: project cmd = bash -c '<user>; echo; <teamagent>'
                       + backup _teamagentOriginalCommand
```

# Issue 104 Research — statusLine 共存

## 现状机制

- TeamBrain 安装入口：`packages/cli/src/commands/install-hook.ts` 中 `installHook()`。
- 写入位置固定为 **project-level** `<cwd>/.claude/settings.local.json`，从不触碰 user-level `~/.claude/settings.json`。
- statusLine 注册逻辑（`install-hook.ts:222-244`）：
  - 检查 `settings.statusLine` 是否存在且未带 `_teamagentTag`
  - 已存在且非 teamagent → `statusLineSkipped = true`，**保留用户原值，不写自家 cmd**
  - 否则写入 `{type:"command", command:"node …teamagent-statusline.cjs", _teamagentTag:"teamagent-statusline"}`
- uninstall（`install-hook.ts:316-320`）只删带 `_teamagentTag` 的，用户原值保留。

## V1–V5 对当前 main 的实际命中

| 项 | 当前行为 | 当前结论 |
| --- | --- | --- |
| V1: `~/.claude/settings.json` 仍包含用户原 command 字面值 | TeamBrain 从不写 `~/.claude/settings.json` | **已 PASS** |
| V2: 用户 + TeamBrain 双内容渲染共存 | CC 解析时 project-level shadow user-level，只渲染 project-level；用户 user-level 只在 user 没装 TeamBrain 时可见 | **FAIL — 这是真实 gap** |
| V3: 没 statusLine 时 TeamBrain 注册成功 | 现在就成立 | **已 PASS** |
| V4: uninstall 后 user-level 字面值不变 | 我们从不动 user-level | **已 PASS** |
| V5: claudefast 探针锚点（FASTPROBE / POSTPR / TEAMWORK） | 与 statusLine 无关 | **已 PASS** |

## V2 为什么失败

`~/.claude/settings.json` 与 `<repo>/.claude/settings.local.json` 都定义 `statusLine` 时，Claude Code resolution = project > user。TeamBrain 写到 project，user-level 被静默 shadow，CC 只跑 project-level command，于是用户原 statusline 输出消失。文件层面字面值仍在 user-level，所以 V1 grep 还过；但渲染层面 V2 不过。

**项目级**也存在同样问题：用户在 `<repo>/.claude/settings.json`（不是 `.local.json`）里手动写了 statusLine 时，当前代码走 skip 分支，**TeamBrain 状态栏完全不显示**，issue 描述的「两者无法共存」第二种形态就是这个。

## 既有测试

`packages/cli/src/__tests__/install-hook.test.ts:182-262` 覆盖：

1. 无 statusLine → 注册（PASS，方向不变）
2. 已是 teamagent tag → 幂等更新（PASS，方向不变）
3. **用户 non-teamagent statusLine → skip 不覆盖**（要改：改成 wrap）
4. uninstall 移除 teamagent tag（要改：还要支持还原 wrapped 的原值）
5. uninstall 保留用户 non-teamagent（继续 PASS，但语义变成"只删项目级 wrap，未触碰 user-level"）

## 设计要点

- **数据流**：install 读 project + user 两层 → 选最高优先级用户 cmd → wrap → project 写 chain。
- **wrap 形态**：`bash -c '<user_cmd_escaped>; echo; <teamagent_cmd>'`
  - 单引号包外、单引号转义为 `'\''`
  - 中间 `echo` 保证两段输出**换行**（用户要求 "A + a new line"）
- **备份字段**：
  - `_teamagentOriginalCommand`: 用户原 cmd 字面值
  - `_teamagentOriginalType`: 用户原 type（默认 `"command"`）
  - `_teamagentOriginalScope`: `"project"` | `"user"`（决定 uninstall 怎么还原）
- **uninstall 还原矩阵**：
  - `scope=project` → 把 project-level statusLine 写回 `{type, command}`
  - `scope=user` → 直接删 project-level statusLine（user-level 本来就没动，自动恢复 V4）
  - 无 scope（说明 install 时 user 双层都为空）→ 直接删
- **`statusLineSkipped` 语义**：变成永远 `false`（始终注册），init.ts:597 提示文案改为 "已合并已有 statusLine（user/project scope）"，否则保持 silent。

## 风险 / 已知边界

1. 用户**装完后**才编辑 `~/.claude/settings.json` 改 user-level statusLine：项目里 chain 命令仍然嵌的是旧字面值。**接受**——下次 `pnpm teamagent init` 重跑会刷新；report.md 里写明这个已知边界。
2. Windows native cmd 不带 `bash`：项目所有 hook 都已假设 Git Bash（见 `install-hook.ts:90` `toForwardSlash` 注释）。沿用同一假设，不引入新复杂度。
3. Shell 注入：用户 cmd 是用户自己写的，已经在用户机器上以 user 身份执行；wrap 不引入额外攻击面，但单引号转义必须正确（`'` → `'\''`）。
4. CC 对 `statusLine` 是否做长度限制 / 行截断：`bash -c '...'` 串可能很长，但实测 CC 没硬限制。如真截断，fallback 是写一个 dist/teamagent-statusline-chain.cjs，由它读 settings 再串接——本次先按内联 wrap 做，超长再升级。

## 参考

- 现状代码：`packages/cli/src/commands/install-hook.ts`
- 现状测试：`packages/cli/src/__tests__/install-hook.test.ts`
- init 调用点：`packages/cli/src/commands/init.ts:582-604`
- audit runner：`audit/runners/feature-19-statusline.ts`
- 项目 plan 规约：`docs/HOWTO-PLAN-PR.md`、`docs/HOW-TO-ISSUE.md`
- issue: https://github.com/libz-renlab-ai/TeamBrain/issues/104
