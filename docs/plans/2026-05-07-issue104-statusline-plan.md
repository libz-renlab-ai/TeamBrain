```text
        ┌─────────────────────────────────────────────────────────┐
        │ PLAN — issue 104 statusLine 共存（A + new line）        │
        ├─────────────────────────────────────────────────────────┤
        │ ① task    chain user cmd + TeamBrain cmd via bash -c    │
        │ ② outputs install-hook.ts diff + tests + init.ts msg     │
        │ ③ verify  V1–V5 + 1+2+3 + judge harness                  │
        │ ④ probes  claudefast -h, parallel -p ≤ 3, stream-json    │
        └─────────────────────────────────────────────────────────┘
```

# Issue 104 Plan — statusLine 共存

参考：`docs/HOWTO-PLAN-PR.md`、`docs/HOW-TO-ISSUE.md`、本目录 `*-research.md`。

## ① Task description

**做什么**

让 TeamBrain 在 user-level (`~/.claude/settings.json`) 或 project-level
(`<repo>/.claude/settings.json` / `.claude/settings.local.json`) 已配置 `statusLine`
的情况下，把用户 cmd 与 TeamBrain cmd **chain 渲染**：

```
bash -c '<user_cmd>; echo; <teamagent_cmd>'
```

中间 `echo` 输出换行（issue #104 用户明确要求 "A + a new line"），让两段
statusline 内容显示在不同行；同时把用户原 cmd / type / scope 备份到
`_teamagentOriginalCommand` / `_teamagentOriginalType` / `_teamagentOriginalScope`
字段，便于 uninstall 还原与 V1 字面值定位。

**怎么做**

- 修改 `packages/cli/src/commands/install-hook.ts`：
  - install 时读 user-level `~/.claude/settings.json`（用 `os.homedir()`）
  - 选优先级：project-level non-teamagent statusLine > user-level statusLine > none
  - 选中时构造 chain command；写 project-level；带备份字段；`statusLineSkipped`
    始终为 `false`（保留字段为兼容，但语义改为"未注册过的纯 fallback"）
  - uninstall 按 `_teamagentOriginalScope` 决定：`project` → 写回原 statusLine；
    `user`/`undefined` → 删除 project-level 条目
- 修改 `packages/cli/src/commands/init.ts:597-599`：把 "未覆盖" 提示改为
  "已合并已有 statusLine（scope=user|project）"，仅在实际发生 chain 时打印
- 新增/改测试 `packages/cli/src/__tests__/install-hook.test.ts`：
  - 用户 user-level 有 statusLine → project chain 中包含字面值且带备份字段
  - 用户 project-level 有 non-teamagent statusLine → 同上 + scope=project
  - uninstall scope=project → 还原原值
  - uninstall scope=user → 删 project；user-level mock 文件不变
  - 现有 "does not overwrite user's non-teamagent statusLine" 用例改名为
    "wraps user's non-teamagent statusLine"，断言 chain + 备份
- 新增 audit runner 校验：`audit/runners/feature-19-statusline.ts` 跑实际 V1+V2
  shell case（如已存在则补 chain 断言）

**不做什么**

- 不改 user-level `~/.claude/settings.json`（永远只读）
- 不引入新的 `dist/teamagent-statusline-chain.cjs` 包装层（除非 chain 字符串
  超过 CC 限制，fallback 留 followup issue）
- 不动其它 hook（PreToolUse / PostToolUse / UserPromptSubmit / Stop）
- 不改 user-level 与 project-level 的写入边界（仍只写 project-level）
- 不引入新依赖

## ② Expected outputs

**文件改动**

- `packages/cli/src/commands/install-hook.ts` — chain + 备份字段 + uninstall 还原矩阵
- `packages/cli/src/commands/init.ts` — 提示文案
- `packages/cli/src/__tests__/install-hook.test.ts` — 用例改造 + 新增 chain/还原用例
- `audit/runners/feature-19-statusline.ts` — V1+V2 shell case 断言（看现状决定改/补）
- `docs/plans/2026-05-07-issue104-statusline-research.md`（已写）
- `docs/plans/2026-05-07-issue104-statusline-plan.md`（本文件）
- `docs/plans/2026-05-07-issue104-statusline-report.md`（实施完成时补）

**CLI 行为**

- `pnpm teamagent init` 在 user/project 任一级有 statusLine 时，写出的
  `.claude/settings.local.json` 中 `statusLine.command` 是
  `bash -c '<user_cmd>; echo; node …teamagent-statusline.cjs'` 形态，且包含
  `_teamagentOriginalCommand` 字面值
- `pnpm teamagent uninstall` 后：scope=project 还原，scope=user 删除项目级
- 字面值 `echo USER_OWN_STATUSLINE_TOKEN` 在 issue V1 reproducer 里的
  `~/.claude/settings.json` 永远不被破坏（始终 PASS）

**反目标 anti-goals**

- 不修改 user-level `~/.claude/settings.json` 任何字段
- 不破坏 PreToolUse/PostToolUse/UserPromptSubmit/Stop 注册路径
- 不影响 `pnpm teamagent compile` / `claudefast` / FASTPROBE / POSTPR / TEAMWORK
  锚点回归
- 不引入 Windows native cmd 假设破坏（保持现有 Git Bash 假设）

## ③ How-to-verify

### 3a. 项目 1+2+3 gate（feature-verification.md）

- module under test: `pnpm teamagent install --help`（间接走 install-hook 路径）
  - 若现有命令未暴露独立 `--help`，则以 `pnpm teamagent init --help` 作 canonical
- canonical JSON schema：包含 `command`、`description`、`flags[]`
- `/export` 落点：`docs/exports/2026-05-07-issue104-statusline.txt`
- 1: `claudefast -p "pnpm teamagent init --help -> JSON"` → `.fastprobe/issue104-claudefast.json`
- 2: `codex exec --skip-git-repo-check -s read-only "<同 prompt>"` → `.fastprobe/issue104-codex.json`
- 3: `jq -S . a > A; jq -S . b > B; diff -u A B` 必须空 diff

### 3b. 第三方 judge harness（V1–V5）

`scripts/judge-issue104-statusline.sh`（新建，run/dump/read 三段）：

1. **RUN**：临时 HOME（`mktemp -d`），按 V1–V4 reproducer 顺序跑
   `pnpm teamagent init` / `uninstall`，捕获 `~/.claude/settings.json` 与
   `<tmp-repo>/.claude/settings.local.json` 全文 + statusLine 实际渲染抓样
2. **DUMP**：`.judge/issue104-<run_id>/judge.json`
   schema = `{exit_code, v1, v2, v3, v4, v5, evidence_dir, stdout_path}`，
   每个 vN 字段 = `{pass: bool, reason: string, evidence: path}`
3. **READ**：单独 `claudefast -p` 只读 raw JSON + evidence，给出 PASS/FAIL 表，
   作者 / 实施 agent / 被测代码均**不参与**评分

### 3c. 单元测试

`pnpm test --filter @teamagent/cli` 必须全绿，覆盖：

- chain wrap 用户 user-level cmd
- chain wrap 用户 project-level cmd（优先级高于 user-level）
- 备份字段三件套（`_teamagentOriginalCommand` / `_teamagentOriginalType` /
  `_teamagentOriginalScope`）
- uninstall scope=project 还原
- uninstall scope=user 删 project / user-level mock 不变
- 幂等：第二次 install 不重复嵌套（检测 chain 字符串里已含自家路径）

### 3d. claudefast 探针 V5 回归

- `claudefast -p "what project tools we have?"` 输出仍含 `FASTPROBE` /
  `POSTPR` / `TEAMWORK` 三锚点

## ④ Claudefast probes（开工前跑）

1. **Orient**：`!claudefast -h | head -80`
2. **Heavy ≤ 3 并行 -p**：
   - `!claudefast -p "audit/runners/feature-19-statusline.ts 当前断言什么？输出函数清单和断言行号"`
   - `!claudefast -p "Claude Code statusLine.command 的 shell 解析方式：macOS、Linux、Windows-Git-Bash 各跑哪个 shell？"`
   - `!claudefast -p "项目里其它 hook 怎么处理 Windows 路径与 shell quoting？给 install-hook.ts 的 toForwardSlash/shellQuote 行号"`
3. **Audit-grade**：把 judge harness 的最终 RUN+READ 用 stream-json 留痕到
   `.fastprobe/issue104-judge.{stdout.json,debug.log}`，附入 PR 描述

## 实施顺序（实际开工 commit 切片）

1. `feat(m4): wrap user statusLine into bash -c chain (#104)` — install-hook 主逻辑 + 备份字段 + uninstall 还原
2. `test(m4): chain + restore matrix for statusLine (#104)` — 用例改造与新增
3. `fix(m4): init.ts statusLine prompt now reports merge scope (#104)` — 提示文案
4. `test(m4): judge harness scripts/judge-issue104-statusline.sh (#104)` — V1–V5 实证
5. （可选）`refactor(m4): audit/runners/feature-19-statusline.ts assert chain (#104)`
6. report.md → 普通 PR → POSTPR 循环
