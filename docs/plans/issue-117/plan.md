```text
       ┌─────────────────────────────────────────────────┐
       │  plan.md — issue #117 terminal theme installer  │
       │                                                 │
       │  ① plan          ② expected outputs             │
       │  ③ how-to-verify ④ claudefast probes            │
       └────────────────────┬────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
   teamagent             init.ts         release/
   setup-terminal     pack-prompt 风     terminal-themes
   (新命令)           格 prompt           .terminal /
   ┌─[Y/N/c/s]─┐      → terminal-prompt   teambrain.json /
   │ all / mini│       step               JetBrainsMonoNF.ttf
   │ custom    │
   └───────────┘
            │               │               │
            └───────────────┴───────────────┘
                            ▼
                   research.md (已写) ← 平台事实底料
                            ▼
                   probes/*.jsonl ← 探针证据
                            ▼
                   feature-verification 1+2+3 + 5 项 issue 验证
                            ▼
                       open normal PR
                            ▼
                       POSTPR loop until 👍
```

# Plan — issue #117：TeamBrain 安装应顺手为用户装好 terminal 主题

- **Issue**：[#117](https://github.com/libz-renlab-ai/TeamBrain/issues/117)
- **Branch**：`worktree-install-terminal`
- **Worktree**：`/Users/m1/projects/TeamBrain/.claude/worktrees/install-terminal`
- **Owner**：@LiuShiyuMath
- **Date**：2026-05-07
- **Reference**：`docs/HOWTO-PLAN-PR.md`（4 段结构）+ `~/.claude/CLAUDE.md` DUCKPLAN 三段铁律
- **配套**：`./research.md`（事实底料）、`./probes/*.jsonl`（claudefast 探针）

---

## ① Plan — task description（做什么 / 怎么做 / 不做什么）

### 1.1 做什么（user-visible behavior）

新增 **opt-in** 终端主题安装能力。两种入口：

1. **新命令** `teamagent setup-terminal`：interactive 指南，是 issue 主诉求「interactive setting guide」的本体。
2. **init 末尾打印一段 markdown 提示**（沿用 `pack-prompt` 范式），告诉用户「跑 `teamagent setup-terminal` 一键装个推荐主题」。Init 自身保持 non-interactive。

`setup-terminal` 顶部一次问：

```
继续吗？(Y)es / (N)o / (c)ustom / (s)kip:
```

- `Y` (默认 Enter) → 走 **all** 路径：装 iTerm2 DynamicProfile + Terminal.app Window Setting + JetBrainsMono Nerd Font + 询问是否设默认。
- `N` 或 `s` → 跳过，0 副作用退出。
- `c` → 进 **custom** 分步：每个子步骤独立 y/N。

> issue V1 要求 stdout 出现 `terminal` / `主题` / `Profile` / `theme` 关键字 + `yes / no / skip` 三选项。我们的顶层提示同时含：`terminal`（命令名）、`主题`（提示文案）、`Profile`（提示文案）、`Y/N/c/s`（包含 yes/no/skip 字面）。

### 1.2 怎么做（实现路径）

**新文件**：

- `packages/cli/src/commands/setup-terminal.ts`
  - `executeSetupTerminal(opts)`：纯函数 + IO，分 detect / plan / apply / verify 四阶段（仿 init.ts 的 step pattern）。
  - `parseSetupTerminalArgs(argv)`：解析 `--uninstall` / `--all` / `--minimal` / `--no-prompt` / `--dry-run`。
  - `renderSetupTerminalResult(result)`：Markdown-friendly 输出，与 `init.ts:renderInitResult` 风格一致。
- `packages/cli/src/__tests__/setup-terminal.test.ts`
  - 行为测试：detect、prompt 文案、apply（dry-run + 真实写入隔离 tmp HOME）、uninstall 还原、不破坏用户原 Profile（V3 模拟）。
- `release/terminal-themes/TeamBrain.terminal`：预构建 plist（手动用 Terminal.app GUI 配 Solarized Dark + JetBrainsMono Nerd Font Mono 后 export，落到 git）。
- `release/iterm2-profiles/teambrain.json`：Solarized Dark 的 iTerm2 DynamicProfile JSON（手写）。**TODO at implementation**：在落地这份 JSON 前用 `uuidgen`（macOS 自带）或 `node -e "console.log(crypto.randomUUID())"` 一次性生成一个真 UUID，写死在 git 里。**幂等性靠固定 GUID** —— 每次 TeamBrain 升级时这份文件 GUID 必须保持同一个值，否则 iTerm2 会把它当成新 Profile 重复加载。本 plan 不在这里写假 UUID 占位。
- `release/fonts/JetBrainsMonoNerdFontMono-Regular.ttf` + `release/fonts/LICENSE`（OFL）。
- `docs/features/setup-terminal.md`：feature canned answer 入口（仿 `docs/features/compile.md`）。

> ⚠️ **Tarball packaging — Codex P1 on PR #127 fixed**
>
> 仓库 root `package.json` 是 `"private": true`、root `files` 不被 publish 看到；真正 publish 的是 `packages/teamagent/`（`files: ["dist/", "postinstall.mjs"]`）。`pnpm build:publish` 触发 `tsup` 打包到 `packages/teamagent/dist/`；`npm pack --dry-run` 在那里跑。
>
> 因此 release 资源**不能只放仓库根** —— 必须经过一次 build-time 复制让它们出现在 `packages/teamagent/dist/release/`，与现有的 `dist/seed/rules.jsonl` 走同一条「dev 仓库内 / bundled dist 内」的路径。
>
> 资源解析层模仿 `packages/cli/src/commands/init.ts:506-526` 的 `resolveSeedPath()`：
> ```ts
> // dev:  <repo>/release/iterm2-profiles/teambrain.json
> // bundled: <pkg-root>/dist/release/iterm2-profiles/teambrain.json
> function resolveTerminalAssetPath(rel: string): string | undefined { ... }
> ```

**改文件**：

- `packages/cli/src/commands/init.ts`：
  - `executeInit` 末尾追加 `terminal-prompt` step（模仿 `pack-prompt`），生成一段含「`terminal` / `主题` / `Profile` / `Y/N/skip`」关键字的 markdown 块，放到 `result.terminalPrompt`。
  - `renderInitResult` 在末尾渲染 `result.terminalPrompt`。
  - 不真正调用 setup-terminal——只打印提示。Init 仍 non-interactive。
- `packages/cli/src/__tests__/init.test.ts`：追加 1 个断言「`renderInitResult(result)` 输出含 `terminal` 与 `Y/N/skip`」。
- `packages/cli/src/cli.ts`（若存在 sub-command 路由表）：注册 `setup-terminal`。
- `packages/teamagent/tsup.config.ts`：加 `onSuccess` hook（或 sibling `prebuild.cjs`）把仓库根 `release/{terminal-themes,iterm2-profiles,fonts}` 复制到 `packages/teamagent/dist/release/`。**这是 Codex P1 的真正落点** —— 不动 root `package.json`，不动 `packages/teamagent/package.json` 的 `files` 数组（`dist/` 已被 ship 覆盖），让资源跟着 dist 一起进 tarball。
- `packages/teamagent/package.json`：**不必**改 `files`（`dist/` 已涵盖）。改 `prebuild` 或加 `onSuccess` 即可。如果选择放 sibling 复制脚本，则 `prebuild` 加一行 `node prebuild-copy-release.cjs`。
- `CLAUDE.md`：project tools 表追加 1 行 `setup-terminal | 终端主题 opt-in 安装；详见 docs/features/setup-terminal.md`。

**关键实现细节**（防止 V3 翻车）：

| 操作                        | TeamBrain 标记                                                | 不覆盖契约                                                                                       |
|-----------------------------|---------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| iTerm2 DynamicProfile       | 文件名 `teambrain.json` + Profile `Name="TeamBrain"`         | 用户已有同名 Profile：DynamicProfile 旁载（iTerm2 行为，无法关）；我们用前缀 `TeamBrain ` 避免撞名 |
| iTerm2 Default Bookmark Guid | 设默认前 `defaults read` 备份到 `~/.teamagent/.terminal-backup.json` | 用户没显式同意「设默认」就不动                                                                   |
| Terminal.app Window Setting | 导入名 `TeamBrain`                                            | 用户已有同名时（不太可能）：跳过 + 警告                                                          |
| Terminal.app Default Setting| `defaults read` 备份                                          | 同上                                                                                             |
| Nerd Font                   | 文件名 `JetBrainsMonoNerdFontMono-Regular.ttf`               | 用户已装同名（mtime / SHA 比对）：跳过 + 标 `font_already_installed`                              |

**卸载（`teamagent setup-terminal --uninstall`）**：

1. 删 `~/Library/Application Support/iTerm2/DynamicProfiles/teambrain.json`
2. 从 `com.apple.Terminal` 的 `Window Settings` 删除 `TeamBrain` 键
3. 还原 `Default Bookmark Guid` / `Default Window Settings` / `Startup Window Settings`（从 backup.json 读取）
4. 删 `~/Library/Fonts/JetBrainsMonoNerdFontMono-Regular.ttf`（仅当 install 时由我们装；backup.json 里有 `font_installed_by_us=true` 标记）
5. 不删 `~/.teamagent/`（其它 TeamBrain 数据共用）

### 1.3 不做什么（anti-goals）

- **不做** Ghostty / WezTerm 支持（推到下一个 PR；issue V2 只要求「至少一种」）
- **不做** Linux / Windows 支持（issue 没要求；非 darwin 平台 `setup-terminal` 直接 `console.log("当前只支持 macOS")` 退出 0）
- **不动** `install-hook.ts`、`compile.ts`、Stop hook、Skill 相关代码
- **不动** init.ts 现有 step 顺序（只在末尾追加新 step，不改前面任何步骤）
- **不引入** 新依赖（只用 `node:fs` / `node:os` / `node:child_process`，已在 monorepo 用过）
- **不做** 字体的 system-wide 安装（不需要 sudo，`~/Library/Fonts` 即可）
- **不做** 自动重启 Terminal.app / iTerm2（让用户手动重启；自动重启会丢未保存窗口）
- **不做** GUI 截图 / 视觉 diff 测试（M0；后续 PR 可加）

### 1.4 与 issue #104 的关系

issue #104（`statusLine` 不覆盖）的 `_teamagentTag` + `statusLineSkipped` 提示模式是本 PR 的设计参照。terminal Profile 等价做法见 1.2 表格。两个 issue 正交：本 PR 不动 `install-hook.ts`。

---

## ② Expected outputs — reviewer-checkable artifacts

### 2.1 文件交付清单

| 路径                                                              | 类型 | 行/字节预估     | reviewer 检查                                                |
|-------------------------------------------------------------------|------|-----------------|--------------------------------------------------------------|
| `packages/cli/src/commands/setup-terminal.ts`                     | 新增 | ~400 行         | TypeScript 编译过；含 `executeSetupTerminal` / `parseSetupTerminalArgs` / `renderSetupTerminalResult` 三个 export |
| `packages/cli/src/__tests__/setup-terminal.test.ts`               | 新增 | ~250 行         | `pnpm test` 全绿；至少含 8 个 `it(...)` 覆盖 V1–V5            |
| `packages/cli/src/commands/init.ts`                               | 改   | +~30 行         | `result.terminalPrompt` 字段在 `InitResult` 接口里；`renderInitResult` 末尾渲染 |
| `packages/cli/src/__tests__/init.test.ts`                         | 改   | +~10 行         | 追加 1 个 `it("init 末尾打印 terminal-prompt", ...)`         |
| `release/terminal-themes/TeamBrain.terminal`                      | 新增 | ~3 KB binary    | `plutil -lint` 通过；`plutil -p` 能 dump 出 `name=TeamBrain` |
| `release/iterm2-profiles/teambrain.json`                          | 新增 | ~80 行 JSON     | `jq '.Profiles[].Name'` 输出 `TeamBrain`；`Guid` 字段为合法 UUID |
| `release/fonts/JetBrainsMonoNerdFontMono-Regular.ttf`             | 新增 | ~2 MB binary    | `file <path>` 输出 `TrueType Font`；SHA256 锁在 `release/fonts/SHA256SUMS` |
| `release/fonts/LICENSE`                                           | 新增 | ~1 KB           | OFL 1.1 全文                                                 |
| `release/fonts/SHA256SUMS`                                        | 新增 | 1 行            | `sha256sum -c` 通过                                          |
| `docs/features/setup-terminal.md`                                 | 新增 | ~80 行          | 含 6 节模板（参照 `docs/features/compile.md`）               |
| `docs/plans/issue-117/plan.md`                                    | 新增 | 本文件          | reviewer 能找到对应章节                                      |
| `docs/plans/issue-117/research.md`                                | 已存 | ~200 行         | 已写完                                                       |
| `docs/plans/issue-117/probes/*.jsonl`                             | 已存 | 3 文件          | claudefast 探针证据                                          |
| `docs/plans/issue-117/report.md`                                  | 新增 | 实施完写        | 含实际 commit SHA、verification artifact 路径                |
| `packages/teamagent/tsup.config.ts`（或 sibling `prebuild-copy-release.cjs`） | 改/新增 | +~15 行 | 把 `<repo>/release/*` 复制到 `dist/release/*`，让 npm pack 把资源带进 tarball（**Codex P1 fix on PR #127**） |
| `CLAUDE.md`                                                       | 改   | +1 行           | project tools 表新增 `setup-terminal` 行                     |

> ❌ **Anti-fix（不要改这里）**：root `package.json` 是 `"private": true`，不参与 publish。改它的 `files` 数组**没用**——这是被 Codex P1 抓的原始错误版本，已替换为 `tsup.config.ts` 那一行。

### 2.2 CLI / 行为契约（reviewer 跑命令验证）

```bash
# A1: 命令存在且 help 不报错
pnpm teamagent setup-terminal --help
# 期望：stdout 含 "setup-terminal" / "Y/N" / "uninstall"，exit 0

# A2: dry-run 不动磁盘
pnpm teamagent setup-terminal --dry-run --no-prompt --all
# 期望：stdout 列出"会做什么"；ls ~/Library/Application\ Support/iTerm2/DynamicProfiles/ 没新增 teambrain.json

# A3: --no-prompt --all 实装
pnpm teamagent setup-terminal --no-prompt --all
# 期望：teambrain.json 落到 ~/Library/Application Support/iTerm2/DynamicProfiles/
# 期望：~/.teamagent/.terminal-backup.json 存在（哪怕只记录 timestamp）

# A4: --uninstall 还原
pnpm teamagent setup-terminal --uninstall --no-prompt
# 期望：teambrain.json 不存在；用户原 default 仍是原值

# A5: init 末尾打印 terminal-prompt
pnpm teamagent init --dry-run
# 期望：stdout 末尾出现一段含 "terminal" / "主题" / "Y/N/skip" 的 markdown 块

# A6: 非 darwin 平台 graceful
TEAMAGENT_FAKE_PLATFORM=linux pnpm teamagent setup-terminal --no-prompt --all
# 期望：stdout 含 "当前只支持 macOS"；exit 0；磁盘无副作用

# A7: 真正的 publish tarball 含 release 资源（Codex P1 回归保护）
pnpm build:publish
cd packages/teamagent && npm pack --dry-run 2>&1 | grep -E 'release/(iterm2-profiles|terminal-themes|fonts)/'
# 期望：grep 命中 ≥ 3 行（每个目录至少 1 个文件出现在 tarball 内容里）
# 反例（修复前）：grep 0 命中，setup-terminal 运行时找不到资源
```

### 2.3 PR artifacts

- 普通 PR（**非 draft**），目标 `main`
- Commit message 格式：`feat(m4): add setup-terminal command for opt-in terminal theme install (refs #117)`
- PR description 含本 plan 的链接 + 6 节 verification（V1–V5 + claudefast 锚点）
- 1+2+3 feature verification artifact：`docs/feature-verification/setup-terminal/2026-05-07-{claudefast,codex,export}.json` 三件套，`/export` 文件附在 PR contents

---

## ③ How-to-verify — third-party judge harness

> 关键铁律：**不要让代码自己评价自己。** 见 `~/.claude/docs/rules/testing-judge-harness.md`。本节定义 RUN → DUMP → READ 三段式。

### 3.1 项目通用 1+2+3 门禁（`docs/feature-verification.md`）

模块名：`setup-terminal`。Canonical JSON schema（`teamagent setup-terminal --help --json`）：

```json
{
  "command": "setup-terminal",
  "description": "Opt-in installer for TeamBrain terminal theme (color / font) on macOS",
  "subcommands": [],
  "flags": [
    {"name": "--all", "description": "..."},
    {"name": "--minimal", "description": "..."},
    {"name": "--custom", "description": "..."},
    {"name": "--uninstall", "description": "..."},
    {"name": "--no-prompt", "description": "..."},
    {"name": "--dry-run", "description": "..."},
    {"name": "--help", "description": "..."}
  ],
  "platforms_supported": ["darwin"]
}
```

三步：

1. `claudefast -p --output-format stream-json "{teamagent setup-terminal --help --json 的 canonical JSON 内容}"` → 落 `docs/feature-verification/setup-terminal/2026-05-07-claudefast.json`
2. `codex exec --skip-git-repo-check -s read-only "<同 prompt>"` → 落 `2026-05-07-codex.json`
3. `jq -S '.' file1 > /tmp/a; jq -S '.' file2 > /tmp/b; diff -u /tmp/a /tmp/b` 必须 byte-identical

加 tmux interactive session：

```bash
tmux new -d -s setup-terminal-export 'claudefast -p "请把 teamagent setup-terminal --help 的输出原样回显一遍，附 /export"'
# 用户在 tmux session 内手动 `/export docs/feature-verification/setup-terminal/2026-05-07-export.txt`
```

附文件加进 PR contents。

### 3.2 issue #117 V1–V5 验证（plan-specific judge harness）

**Judge harness 路径**：`packages/cli/scripts/judge-issue-117.sh`（新增）。

**RUN 阶段**（固定工具）：

```bash
#!/usr/bin/env bash
# packages/cli/scripts/judge-issue-117.sh
set -u
RUN_ID="${1:-$(date +%Y%m%dT%H%M%S)}"
EVIDENCE=".judge/issue-117/$RUN_ID"
mkdir -p "$EVIDENCE"

# 用 tmp HOME 隔离，避免污染本机
SANDBOX_HOME="$(mktemp -d)/sandbox-home"
mkdir -p "$SANDBOX_HOME/Library/Application Support/iTerm2/DynamicProfiles"
mkdir -p "$SANDBOX_HOME/Library/Fonts"

# V1: install stdout 含 opt-in 关键字
HOME="$SANDBOX_HOME" pnpm teamagent init --dry-run > "$EVIDENCE/v1-init-stdout.txt" 2>&1
v1_pass=$(grep -E 'terminal|主题|Profile|theme' "$EVIDENCE/v1-init-stdout.txt" \
       && grep -E 'Y/N/skip|y/N/skip|yes.*no.*skip' "$EVIDENCE/v1-init-stdout.txt" \
       && echo true || echo false)

# V2: --no-prompt --all 实装到 sandbox HOME
HOME="$SANDBOX_HOME" pnpm teamagent setup-terminal --no-prompt --all > "$EVIDENCE/v2-install-stdout.txt" 2>&1
[ -f "$SANDBOX_HOME/Library/Application Support/iTerm2/DynamicProfiles/teambrain.json" ] && v2_pass=true || v2_pass=false

# V3: 用户已有 Profile 不被破坏
echo '{"existing":"DO_NOT_TOUCH"}' > "$SANDBOX_HOME/Library/Application Support/iTerm2/DynamicProfiles/userown.json"
HOME="$SANDBOX_HOME" pnpm teamagent setup-terminal --no-prompt --all > /dev/null 2>&1
[ -f "$SANDBOX_HOME/Library/Application Support/iTerm2/DynamicProfiles/userown.json" ] \
  && grep -q DO_NOT_TOUCH "$SANDBOX_HOME/Library/Application Support/iTerm2/DynamicProfiles/userown.json" \
  && v3_pass=true || v3_pass=false

# V4: --uninstall 还原；用户文件不动
HOME="$SANDBOX_HOME" pnpm teamagent setup-terminal --no-prompt --uninstall > "$EVIDENCE/v4-uninstall-stdout.txt" 2>&1
[ ! -f "$SANDBOX_HOME/Library/Application Support/iTerm2/DynamicProfiles/teambrain.json" ] \
  && [ -f "$SANDBOX_HOME/Library/Application Support/iTerm2/DynamicProfiles/userown.json" ] \
  && v4_pass=true || v4_pass=false

# V5: claudefast 锚点
claudefast -p "what project tools we have?" > "$EVIDENCE/v5-claudefast.txt" 2>&1
v5_pass=$(grep -F FASTPROBE "$EVIDENCE/v5-claudefast.txt" \
       && grep -F POSTPR "$EVIDENCE/v5-claudefast.txt" \
       && grep -F TEAMWORK "$EVIDENCE/v5-claudefast.txt" \
       && echo true || echo false)

# DUMP
cat > "$EVIDENCE/judge.json" <<EOF
{
  "run_id": "$RUN_ID",
  "issue": 117,
  "evidence_dir": "$EVIDENCE",
  "checks": {
    "V1_optin_prompt": $v1_pass,
    "V2_install_writes_profile": $v2_pass,
    "V3_user_profile_intact": $v3_pass,
    "V4_uninstall_restores": $v4_pass,
    "V5_claudefast_anchors": $v5_pass
  },
  "exit_code": 0
}
EOF

# 必须全 PASS 才退 0
jq -e 'all(.checks[]; .)' "$EVIDENCE/judge.json" > /dev/null && exit 0 || exit 1
```

**READ 阶段**：

```bash
claudefast -p "Read .judge/issue-117/<RUN_ID>/judge.json and the V1/V2/V4 stdout files. 
Return PASS or FAIL with one-line reason for each check. Do not run anything else."
```

判定规则：5 个 check 必须全 `true`。任何一个 `false` 视为未修复。

### 3.3 单元测试覆盖

`packages/cli/src/__tests__/setup-terminal.test.ts` 必须含：

| 测试名                                                          | 覆盖契约                          |
|-----------------------------------------------------------------|----------------------------------|
| `dry-run: 不写磁盘，stdout 列出会做什么`                         | A2                               |
| `--no-prompt --all: iTerm2 DynamicProfile 落地`                 | V2 / A3                          |
| `--no-prompt --all: 用户已有同名 Profile 时跳过且警告`           | V3                               |
| `--no-prompt --all: 字体已装时跳过`                              | V3 (Font path)                   |
| `--no-prompt --all: 未显式同意默认前不改 Default Bookmark Guid` | V3                               |
| `--uninstall: 删 teambrain.json 但不动 userown.json`            | V4                               |
| `--uninstall: 还原 backup.json 里记录的原 default`              | V4                               |
| `非 darwin 平台 graceful exit 0 + stdout warn`                  | A6                               |
| `parseSetupTerminalArgs 解析 --uninstall / --all / --no-prompt`| 单元覆盖 args parser             |
| `renderSetupTerminalResult 输出含 Y/N/skip 字面`                | V1                               |

### 3.4 与 issue #104 的回归

加 1 个 init.test.ts 用例：用户已有 statusLine 时 init 不被新 terminal-prompt 步骤破坏（grep `statusLineSkipped` 警告仍能命中）。

---

## ④ Claudefast probes — BEFORE coding（已跑）

### 4.1 已落地的 probes（`docs/plans/issue-117/probes/`）

| 文件                                | prompt 摘要                                      | 状态                                    |
|-------------------------------------|--------------------------------------------------|-----------------------------------------|
| `iterm2-dynamic-profiles.jsonl`     | iTerm2 DynamicProfiles 路径 / schema / 同名行为 | ✓ 完整答案（见 research.md §4）         |
| `terminal-app-plist.jsonl`          | Terminal.app .terminal plist + open + defaults  | ⚠ Stop hook 截断，研究信息已 fallback 到 macOS 系统约定（见 research.md §5） |
| `nerd-font.jsonl`                   | Nerd Font 推荐 / 安装路径 / 缓存刷新            | ⚠ 同上，fallback（见 research.md §6）   |

**Stop hook 截断风险**：项目级 12-field `<self-report>` Stop hook 偶尔会让 model 第二轮只回 self-report 块。后续 probe 跑时考虑 `--bare` 临时绕过（仅 probe 用，不进 verification 1+2+3）。

### 4.2 实施前还要补的 probes（≤8 路并行）

按 `docs/FASTPROBE.md` 三步：

```bash
# Step 1: orient (已做)
claudefast -h | head -80

# Step 2: ≤8 路并行（实施前再跑一次）
P1: "在 packages/cli/src/__tests__/init.test.ts 中找到 mkTmp / commonOpts 模板，列出 setup-terminal.test.ts 应直接复用的 helper 名称与签名。"
P2: "搜 packages/cli/src/commands/install-hook.ts 里 _teamagentTag / STATUS_LINE_TAG 的使用模式，写一个对应到 terminal Profile 的 _teamagentTerminalTag 等价方案。"
P3: "对照 release/install.sh 与 package.json 的 files 字段，确认 release/terminal-themes / release/iterm2-profiles / release/fonts 加进去后 npm pack 会带上。"
P4: "search for 'render.*Prompt|terminalPrompt|packPrompt' across packages/core 与 packages/cli, 确认 terminalPrompt 字段不会与现有命名冲突。"
P5: "list iTerm2 Solarized Dark 的 16 ANSI 颜色 RGB 值（标准定义），输出 JSON 格式直接喂 release/iterm2-profiles/teambrain.json。"
P6: "在 macOS 上验证 plutil -lint 与 plutil -p 命令对一份 .terminal 文件应该输出什么；列出最小可用 plist 必填键。"
P7: "搜 packages/ports/src/__tests__/*-contract.ts，看 setup-terminal 是否需要新 port（比如 TerminalConfigStore），还是直接调 fs/exec 即可。"
P8: "针对 V5 (claudefast 锚点)，列 packages/cli/src 里所有写 'project tools' 的文件，确认改 CLAUDE.md 加 setup-terminal 行不会破坏 grep。"
```

### 4.3 Stream-json audit probe（PR 描述要附）

```bash
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --debug hooks \
  --debug-file .fastprobe/issue-117-final.debug.log \
  --permission-mode acceptEdits \
  "Read packages/cli/src/commands/setup-terminal.ts and explain its 4 phases.
   Cite the line numbers of detect / plan / apply / verify."
```

输出落到 `.fastprobe/issue-117-final.{transcript,debug}.log`，PR 评论里贴关键摘要。

---

## After-PR — POSTPR loop

按 `docs/POSTPR.md`：

1. PR opened → CI + Codex review
2. 5 分钟内 fetch Codex inline comments：
   ```
   env -u GITHUB_TOKEN gh api repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments \
     --jq '.[] | select(.user.login=="chatgpt-codex-connector[bot]") | {body, path, line}'
   ```
3. P1 红色 → 必修；P2 黄色 → 默认 fix-before-merge；P3 蓝色 → 视情况
4. push fix → 重跑 1+2+3 + judge harness → 重新 fetch Codex review
5. 停止条件：CI green + 无 conflict + Codex 👍 或 silent
6. merge 前确保 release tarball 含字体（`npm pack --dry-run` 验证 file list 含 `release/fonts/*.ttf`）

---

## 风险与回滚

| 风险                                                         | 概率 | 影响 | 缓解                                                 |
|--------------------------------------------------------------|------|------|------------------------------------------------------|
| iTerm2 DynamicProfile 与用户同名 Profile 撞名                 | 低   | 中   | 强制前缀 `TeamBrain `；研究 §4 覆盖                  |
| Terminal.app `.terminal` plist 在 macOS 26+ 格式变更         | 低   | 中   | `ProfileCurrentVersion=2.07` lock；CI 加 plutil -lint |
| Nerd Font 用户已装但版本不同                                  | 中   | 低   | SHA256 比对，不同就跳过 + 警告                       |
| `~/Library/Fonts` 写权限被 SIP 拦                             | 极低 | 中   | catch + 报错；不影响主流程                           |
| 卸载时 backup.json 已被删 → 无法还原 default                  | 低   | 中   | 卸载前先 try-read backup；缺失就只删自己装的，不动 default |
| issue #104 statusLineSkipped 提示与新 terminal-prompt 互踩    | 低   | 低   | 两个 prompt 段彼此独立；init.test.ts 加共存测试       |
| npm tarball 因 .ttf 体积超阈值                                | 低   | 低   | JetBrainsMonoNF Mono Regular ~2MB，远低于 npm 50MB 上限 |
| release 资源没进 tarball（assets 漏发）                       | 中→低 | 高   | A7 回归断言（`npm pack --dry-run` grep 资源路径）；与 `dist/seed/` 走同一条 build-time 复制路径，复用现有验证模式 |

**完整回滚**：

```bash
git revert <merge-commit>
# 用户侧手动跑：
teamagent setup-terminal --uninstall
```

---

## Quick checklist（PR 描述粘贴）

```
- [ ] plan.md / research.md / probes/ 已落到 docs/plans/issue-117/
- [ ] setup-terminal.ts + .test.ts 单元测试全绿
- [ ] init.ts 末尾追加 terminal-prompt step；init.test.ts 加断言
- [ ] release/ 三个新目录 + package.json files 字段更新
- [ ] docs/features/setup-terminal.md 6 节模板写完
- [ ] CLAUDE.md project tools 表加 1 行
- [ ] V1–V5 judge harness 全 PASS（.judge/issue-117/<run_id>/judge.json）
- [ ] feature-verification 1+2+3 三件套（claudefast / codex / export）落地
- [ ] PR 是普通 PR（非 draft），目标 main
- [ ] POSTPR 循环：Codex 👍 或 silent 才 merge
- [ ] report.md 写完
```
