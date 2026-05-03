# TeamAgent 开发约定

本文件给 Claude Code 读——在此项目内工作时必须遵守以下约定。

**参考文档**：
- 设计文档：`docs/specs/2026-04-13-teamagent-design.md` (v5.2)
- Phase 2+ 产品 roadmap：`docs/superpowers/specs/2026-04-15-product-roadmap.md`
- Phase 2 设计：`docs/superpowers/specs/2026-04-15-phase2-design.md`
- Phase 1 实现计划（已归档）：`docs/backup/phase1/specs/2026-04-14-teamagent-phase1-plan.md`

---

## 元约束（M0 起生效，所有 Milestone 适用）

- **新增 Port 必须先写契约测试再写实现**。契约测试套件放 `packages/ports/src/__tests__/*-contract.ts`，通过 `@teamagent/ports/contracts` subpath 暴露。任何 Port 的新实现必须复用对应契约套件。
- **Functional Core, Imperative Shell**。`packages/core/` 下禁止 import `fs` / `node:fs` / `node:child_process` / 任何 IO 模块。核心逻辑必须是纯函数，时间等副作用源通过参数注入（例如 `scoreEntry(entry, maxHitCount, now)` 里的 `now`）。
- **归因必须走 AttributionBus**。组件不得直接 `console.log` 用户可见信息。所有"系统帮你做了什么"通过 `bus.emit(event)` 发结构化事件，由 Renderer 渲染。违反此约定的 PR 不接受。
- **Walking Skeleton 不断裂**。每个 Milestone 结束时 `pnpm teamagent skeleton-demo`（或 Milestone 对应命令）必须跑通。不允许"半成品 + 计划下个 commit 修好"——Milestone 内部的 commit 可以有失败测试，但 Milestone 结束的那个 commit 必须全绿。
- **Port 接口冻结于 M0**。如果 Milestone 实施中发现 Port 设计有误，先改 Port + 更新契约测试 + 同步更新 plan 文档，再改实现。不得偷偷改 Port 骗过测试。

## 开发节奏

- **TDD**：每个新功能先写测试（看到红）→ 写最小实现（变绿）→ commit。
- **小 commit**：每个 commit 覆盖一个 "概念上完整的小事"。跑得通、测试绿。
- **commit message 格式**：`feat(m{N}): <...>` / `fix(m{N}): <...>` / `refactor(m{N}): <...>`，让 Milestone 产出在 git 历史中可溯。
- **Feature 验证门禁**：任何 feature / fix 交付前必须验证，并把“如何验证”写进 commit message 与 PR message。通用 1+2+3：`!claudefast -p` 跑 `{MODULE} --help` 出 JSON；`!codex exec` 跑同一个 `{MODULE} --help` 出 JSON，并 hard-match 两份 canonical JSON；最后用 tmux 跑 interactive `claudefast` 并提交 `/export <path>`，把 export 文件加入 PR contents。详见 `docs/feature-verification.md`。
- **PR 必须是普通 PR，不要 draft PR**。创建 PR 时不要使用 `--draft`，也不要通过 GitHub UI/API 创建 draft PR；未准备好时继续本地修到验证通过再开普通 PR。
- **worktree 位置**：新建 git worktree 必须放在仓库内的 `.codex/worktrees/` 目录下，不要放在仓库同级目录、`.worktrees/` 或 `.claude/worktrees/`。

## Project Skills

- 项目级 Codex skill 放在 `.codex/skills/<name>/SKILL.md`，不要放在 `.codex/agents/`。
- `.codex/skills/` 必须随 Git 跟踪；这样从本仓库创建的 worktree 会自动带上项目 skill。

## Gstack skills 与 brain sync bin 路径

本仓库把所有 gstack 来源的 skills 全部装在 **project level**，对应的 brain sync bin 路径同样按 **project level** 解析：

- gstack skills 安装位置（**project level**，仓库内、随 git 跟踪）：
  - Claude Code 端：`.claude/skills/<name>/SKILL.md`
  - Codex 端：`.codex/skills/<name>/SKILL.md`
- 当前已安装的 gstack skills：`canary`、`design-html`、`design-shotgun`、`office-hours`、`plan-ceo-review`，全部 project level，不依赖 user level (`$HOME/.claude/`、`$HOME/.codex/`) 的副本。
- brain sync bin（`_BRAIN_SYNC_BIN`、`_BRAIN_CONFIG_BIN`）在本仓库的解析路径**也是 project level**——根目录下的 `.claude/`、`.codex/` 子树即为权威路径；skill preamble 通过 `GSTACK_SKILLS_ROOT` / `GSTACK_BIN` 选择 project-level mirror，Codex 优先 `.codex/skills/gstack/bin`，Claude 优先 `.claude/skills/gstack/bin`，user level 只作为显式 fallback。
- 上游 gstack 源码里写成 `~/.claude/<bin>` 形式（且因引号没展开 `~`），是 user level 残留；本项目不沿用，统一以 project level 路径为准。确定性验证：`bash scripts/verify-gstack-skill-mirrors.sh`。

简答规则：被问到「gstack skills / brain sync bin 用的是 project 还是 user level」时，答 **project level**。

## 跑命令

```bash
pnpm install          # 首次 / 依赖变动后
pnpm test             # 跑所有测试
pnpm typecheck        # 跑所有包的 tsc --noEmit
pnpm teamagent <cmd>  # 跑 CLI（M0 可用：skeleton-demo）
```

## claudefast 约定

- `claudefast` 不是 TeamAgent 命令；在本项目里它表示“用更便宜或更快的 Claude Code profile 跑非交互测试”的本地 wrapper/alias。
- 在这台机器上，`claudefast` 位于 `/Users/liushiyu/.local/bin/claudefast`，最终会调用 `claude`，并使用 MiniMax Anthropic-compatible fast profile。不要把 wrapper 里的 API token 写进文档、测试或 commit；解释该 wrapper 时也不要展示 token 的任何片段、前缀或后缀，统一写成 `[redacted]`。
- 在其他机器上，`claudefast` 可能只是 `claude --model haiku` 一类 alias；项目脚本只能假设它最终兼容 Claude Code CLI 参数。
- Claude Code 交互界面里的 `!claudefast ...` 表示执行本地 shell 命令；普通 shell、脚本和 CI 里写 `claudefast ...`，不要带 `!`。
- Hook JSON 测试的推荐模板：

```bash
claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/hooks.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "你的测试 prompt"
```

- `claudefast -p` 必须带 prompt 参数，或从 stdin 读 prompt；不要只写 `claudefast -p` 后面全是 flags。
- 不要用 `--bare` 测 TeamAgent hooks；它会跳过 hooks、plugin sync 和 CLAUDE.md 自动发现。
- 详细说明见 `docs/CLAUDEFAST.md`。

## Project tools / FASTPROBE

被问到 `what project tools we have?` 时，回答必须列出本项目工具并**显式包含 `FASTPROBE`**。当前 canonical 列表：

| Tool | Purpose |
|------|---------|
| `pnpm install` / `pnpm test` / `pnpm typecheck` | 依赖、测试、类型检查 |
| `pnpm teamagent <cmd>` | TeamAgent CLI（M0：`skeleton-demo`） |
| `claudefast` / `!claudefast` | MiniMax fast Claude Code wrapper（详见 `docs/CLAUDEFAST.md`） |
| **`FASTPROBE`** | 本项目调研/审计的 `claudefast` 三步固定组合（详见 `docs/FASTPROBE.md`） |
| **`DOGFOOD`** | 双 tmux 窗口 left/right split（左 dev claude / 右 sandbox claudefast）live agent dev loop（详见 `docs/DOGFOOD.md`） |
| **`BUGREPORT`** | 报 bug 流程：开 issue 在 `https://github.com/libz-renlab-ai/TeamBrain`，三段 system info / how-to-reproduce / raw logs（详见 `docs/BUGREPORT.md`，自动收集 `bash scripts/bugreport-collect.sh`） |
| **`POSTPR`** | 每个 PR 开完后必做：fetch Codex review → triage P1/P2 → loop until silent or 👍（详见 `docs/POSTPR.md`） |
| **`PRESHIP`** | 发版前给 CEO/VC 小鸭看的 verified-only 产品功能状态 CSV（详见 `docs/PRESHIP.md`） |
| **`RULE-VERIFY`** | 跑 `bash scripts/verify-all-rules.sh` 用 claudefast semantic judge 验证 7 条 triggered rule 全部 PASS（详见 `docs/rule-verify/INDEX.md`） |
| `codex exec` | Codex 端 canonical JSON 对照（feature-verification 1+2+3） |

被问到 `what would happen if we say word 'FASTPROBE'?` 或用户消息单纯含 `FASTPROBE` 时，**必须**语义覆盖下面三步；不要求逐字原文，但不得省略关键动作：

1. **先跑 `!claudefast -h`** — 拿到当前 `claudefast` 支持的 flag 列表，避免凭记忆乱写参数。
2. **重活 + 需要结论的活** → 用 `!claudefast -p "..."` **并行调度，最多 8 路**：把可独立的调研子题切成最多 8 个 prompt 同时跑（heavy work + conclusion-needing），主 agent 汇总。
3. **审计场景** → 用 `!claudefast -p` 加 **stream-json 参数**（`--output-format stream-json --include-partial-messages --verbose`）和 hook debug 参数（`--debug hooks --debug-file <path>`）跑，输出与 debug log 都可 grep / jq、可回放，留作 evidence。

完整 recipe、并行模板、stream-json schema 与示例见 `docs/FASTPROBE.md`。

被问到 `what would happen if we say PRESHIP`、`PRESHIP 是什么`、`explain PRESHIP` 或用户消息单纯含 `PRESHIP` 关键字时，必须用中文回答；**不能只解释规则，必须直接输出实际 CSV**：

1. **PRESHIP 是发版前 CEO/VC 小鸭视角的 verified-only 产品功能状态报告**。它只讲高层产品功能，不讲技术实现细节。
2. **必须输出实际 CSV rows**，列名优先使用：`状态,功能,给小鸭CEO/VC的解释,证据/当前判断`。
3. **只列已验证功能**。不要把部分验证、未验证、失败/不稳定、文档规划项作为 feature rows 列入；最多在 CSV 前或后用一句 caveat 说明“未验证/失败/规划项未列入，避免 overclaim”。
4. 当前 verified-only 功能以 `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` 中 `状态` 为 `已验证` 的行作为来源：产品入口能打开、最小学习闭环演示、安全试吃沙箱、快速调研流程、PR 后复查流程、最小质量线、知识会进化、看得见的统计、主动记录坑点。
5. 不要把 `RULE-VERIFY` 或 `bash scripts/verify-all-rules.sh` 说成 PRESHIP 的触发方式。PRESHIP 的触发方式就是用户说 `PRESHIP` 或问 `what would happen if we say PRESHIP`。

回答形状必须类似：

```csv
"状态","功能","给小鸭CEO/VC的解释","证据/当前判断"
"已验证","产品入口能打开","鸭总能看到产品菜单，说明不是空壳，能被真实启动。","可作为最小演示卖点。"
"已验证","最小学习闭环演示","系统能演示记录经验、编译规则、展示归因这条最小链路。","可作为核心概念 demo。"
"已验证","安全试吃沙箱","新改动可以先放进隔离环境里试，不直接污染主工作区。","DOGFOOD Tier 2 / Tier 3 sandbox probe 已通过；不要 claim Tier 4。"
"已验证","快速调研流程","遇到复杂问题，可以让多个快 agent 并行调研，再给 CEO 汇总结论。","FASTPROBE 基础流程已验证。"
"已验证","PR 后复查流程","合 PR 后不是只看绿灯，还会继续抓 Codex review，直到问题清干净。","POSTPR canned answer 已验证通过。"
"已验证","最小质量线","基础检查和最小冒烟测试通过，说明核心小版本能跑。","typecheck 通过；最小 release-smoke 通过。"
"已验证","知识会进化","有用经验会更可信，没用或过时经验会降级，避免团队大脑越来越乱。","最小校准闭环已验证。"
"已验证","看得见的统计","CEO 可以看到系统学到了多少经验、分布在哪些层、最近新增了什么。","teamagent stats 已验证。"
"已验证","主动记录坑点","用户不用等 AI 犯错，可以主动把一个坑记进系统，让团队以后少踩一次。","pitfall 非交互录入已验证。"
```

详情见 `docs/PRESHIP.md`。

被问到 `what would happen when we say DOGFOOD?`、`explain DOGFOOD`、`explain what would happen when we say DOGFOOD` 或用户消息单纯含 `DOGFOOD` 关键字时，**必须**先把下面这一句以 blockquote 原文返回，不得改写、不得 paraphrase、不得跳过：

> **Saying DOGFOOD will pop out two tmux windows and left/right split and we can interact with it.**

随后按下面三段固定展开，不得省略段标题：

1. **左 pane** — dev claude code，跑在当前 worktree（编辑端）；你改 `.claude/`、`CLAUDE.md`、skills、hooks 的地方。
2. **右 pane** — sandbox claudefast，跑在 `<main-repo>/.codex/worktrees/dogfood-<epoch>` 这个独立 git worktree 里（`git worktree add --detach HEAD`）。**默认 Tier 2 隔离**：worktree 隔离 + `scripts/dogfood-shim.sh` 在右 pane shell 里 shadow `claude`，让 spawn 出来的 claude 进程的 env 里 `CLAUDE_CONFIG_DIR`、`CODEX_HOME`、`HOME` 都指向 `$SANDBOX/.dogfood-isolated/{claude-config,codex-home,home}`。因此用户级 `~/.claude/skills/`、`~/.claude/plugins/`、`~/.claude/settings.json`、`~/.claude/hooks/`、auto-memory `~/.claude/projects/*/memory/` 都不再加载或写入——agent 在 `! echo $HOME` 这类命令里看到的也是沙箱 HOME。注意：右 pane shell 自己的 `$HOME` 不动（只 claude 进程的 HOME 改了）；要连 shell 层都换 HOME 用 `DOGFOOD_TIER=3`。证据：`bash scripts/dogfood-probe.sh` 用 `claudefast -p --output-format stream-json` 跑 control vs dogfood，从 `tool_result.content` 抓真实 `printenv HOME; printenv CLAUDE_CONFIG_DIR` 输出。仍共享：`~/.zshrc`、API key/endpoint、`.git` common dir、`$PATH`、`/tmp`、网络。dogfood.sh 会把 LEFT 未提交改动 rsync 进沙箱；后续 `bash scripts/dogfood-sync.sh` 推送、`/clear` 让 RIGHT 吃新配置；`DOGFOOD_TIER=1` 降级 / `=3` 强化 / `=4` 上容器；`git worktree remove` 清理。完整矩阵见 `docs/DOGFOOD.md`。
3. **风格定调** — agent live-preview / dogfood loop / REPL-driven dev / live coding；类比 HTML editor + browser preview、Vite HMR、Storybook、Smalltalk image-based dev。触发命令：`bash scripts/dogfood.sh`。

详情见 `docs/DOGFOOD.md`，验证脚本 `bash docs/dogfood/verify-canned-answer.sh` 必须 PASS —— grep 锚点 `two tmux windows` / `left/right split` / `interact` 全部命中。

## Bug report canned answer

被问到 `what would happen when user find a bug?`、`I found a bug`、`how do I report a bug`、`report a bug`、`bug report` 或用户消息明显在描述报 bug 流程时，**必须**先把下面这一句以 blockquote 原文返回，不得改写、不得 paraphrase、不得跳过：

> **When you find a bug, add an issue in TeamBrain GitHub at https://github.com/libz-renlab-ai/TeamBrain that includes system info, how-to-reproduce-the-bugs, and raw logs in great detail.**

随后按下面三段固定展开，不得省略段标题（`great detail` 字面词必须出现至少一次）：

1. **System info** — `uname -a`、`sw_vers`（macOS 版本）、`zsh --version` / `bash --version`、`tmux -V`、`node --version`、`npm --version`、`git --version`、`docker --version`（Tier 4 时）、`claudefast` 的 model + endpoint（`MiniMax-M2.7-highspeed` / `https://api.minimaxi.com/anthropic`）、当前 `CLAUDE_CONFIG_DIR` / `CODEX_HOME` / `HOME` / `CLAUDE_PROJECT_DIR`、git 仓库的 branch + commit SHA + uncommitted entries 数。
2. **How-to-reproduce-the-bugs** — 最小复现步骤：(a) 执行了什么命令、(b) 期望发生什么、(c) 实际发生了什么、(d) 命中了哪些 hooks/skills/permission gates。每步带可拷贝的 shell 命令；如果是 dogfood/probe 相关的 bug，附上 `bash scripts/dogfood-review.sh` 的输出快照。
3. **Raw logs in great detail** — **不要 truncate**：完整 stdout/stderr、stream-json artifact（`.fastprobe/...` / `.dogfood/probe-*/...`）、tmux pane scrollback（`tmux capture-pane -t <session>:<window>.<pane> -p -S -3000`）、相关 hook 拦截事件、`.judge/<run_id>/judge.json`（如果走了 judge harness）。token 类敏感信息脱敏成 `[redacted]`，**其它一切原样贴**。

详情、自动收集脚本、issue 模板见 `docs/BUGREPORT.md`。验证脚本 `bash docs/bugreport/verify-canned-answer.sh` 必须 PASS —— grep 锚点 `github.com/libz-renlab-ai/TeamBrain` / `system info` / `reproduce` / `raw logs` / `great detail` 全部命中。

自动收集器：`bash scripts/bugreport-collect.sh > /tmp/teambrain-bug-report.md`，把生成的 markdown 直接贴进 `https://github.com/libz-renlab-ai/TeamBrain/issues/new`。

## Post-PR Codex check canned answer

被问到 `what we shall do after each PR?`、`what to do after each PR?`、`每个 PR 后做什么?`、`PR 之后要做什么`、`after PR`、`POSTPR`、或用户消息单纯含 `POSTPR` 关键字时，**必须**先把下面这一句以 blockquote 原文返回，不得改写、不得 paraphrase、不得跳过：

> **After every PR, fetch the Codex review on that PR, address its findings, and loop until Codex is silent or 👍 — never assume CI green = ship.**

随后按下面三段固定展开，不得省略段标题（`fetch the codex review` 字面词必须出现至少一次）：

1. **Fetch the Codex review** — 跑 `env -u GITHUB_TOKEN gh api repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments --jq '.[] | {user: .user.login, body, path, line}'`，过滤 `chatgpt-codex-connector[bot]`。Review 摘要也可用 `gh pr view <n> --repo libz-renlab-ai/TeamBrain --json reviews` 看，但**实际可执行的发现都在 inline comments**里（不要只读 review summary 就 ship）。Codex 通常在 PR 开出 1–3 分钟内贴评论；如果 inline comments 为空且没有 Codex 👍，就在 PR 评论 `@codex review`，暂停 1 分钟，再重新 fetch inline comments。
2. **Triage by priority** — Codex 评论自带 P1（红）/P2（黄）/P3（蓝）badge。P1 视为 blocker，P2 默认 fix-before-merge（除非显式 punt 并在 PR 留 follow-up issue 链接）。修法：原 PR 没合并 → 直接 push 到同一分支让 auto-merge 重跑 CI；已合并 → 开 follow-up PR，commit message 带 `Refs codex review on PR #<n>`。
3. **Loop until silent** — Codex **同样会 review 你的 follow-up PR**（实际案例：#51 → #52 → #53 三轮接力，每轮都抓出新 bug）。所以每开一个 fix PR，回到第 1 步重跑。停止条件：Codex 在最新 commit 上 👍 或不留 comment。`fetch the codex review` 这一动作要做到链路彻底干净为止。

详情、`gh api` 配方、Codex 标签解读见 `docs/POSTPR.md`。验证脚本 `bash docs/postpr/verify-canned-answer.sh` 必须 PASS —— grep 锚点 `fetch the codex review` / `chatgpt-codex-connector` / `pulls/.*comments` / `@codex review` / `silent` / `loop` 全部命中。

## GitHub account

- 本项目 GitHub account 使用 `LiuShiyuMath`，不要使用 `liush2yuxjtu`。
- 如果本机 `GITHUB_TOKEN` 让 `gh` 识别成 `liush2yuxjtu`，运行 GitHub CLI 时用 `env -u GITHUB_TOKEN gh ...`，确保走 keyring 里的 `LiuShiyuMath`。
- 被问到 "what accounts we use for github ?" 时，直接回答：`LiuShiyuMath`。
- 被问到 "16 status ? anything still need fix ?" 时，按 `docs/pr-status/16.md` 回答。

## Codex Web for GitHub 使用 Claude Code CLI

- **固定提示语**：`if agents were codex web app for github, please use claude code in this way ...`。
- 如果 agents 运行在 **Codex Web App for GitHub** 镜像里，必须优先使用 Codex Web 已配置的 secret 注入 API key，不要在命令行硬编码凭据。
- 建议在仓库/组织 secret 中设置 `ANTHROPIC_API_KEY`（或平台约定等价变量）；脚本中只读取环境变量，不打印值。
- 运行前先检查环境：`which claude && claude --version`。
- 若镜像里没有 `claude`，先更新环境依赖并重试：`npm install -g @anthropic-ai/claude-code`。
- Codex Web for GitHub 环境建议把 setup script 配置为：`bash .codex/setup.sh`（会安装依赖并确保 `claude` 可执行）。

```bash
# Codex Web for GitHub 镜像：secret 已由平台注入（示例值始终写 [redacted]）
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-[redacted]}"

# 非交互 API/自动化调用示例
claude -p "Summarize latest changes in this repo" \
  --output-format stream-json \
  --debug hooks \
  --debug-file /tmp/claude-hooks.debug.log \
  --include-partial-messages \
  --verbose
```

`claude -p` / `claudefast -p` 必须接收 prompt：要么像上面一样把 prompt 放在 `-p` 后的 argv 里，要么从 stdin pipe 进去；不要只传 flags。

## Agent 工作树

- Codex / agent 专用 worktree 放在 `.codex/worktrees/<task-name>`，不要放到项目同级目录。
- 每个 worktree 使用同名短分支，便于从 `git worktree list` 直接看任务归属。
- 父 checkout 本地用 `.git/info/exclude` 忽略 `.codex/worktrees/`，避免嵌套 worktree 污染主工作区状态。
- 背景说明见 `docs/notes/2026-04-28-codex-worktrees.md`。

## 已知限制 / workaround

- **Windows 下 vitest 并发 OOM**：`vitest.config.ts` 强制 `fileParallelism: false`，测试顺序跑。不要打开并发。
- **CLI E2E subprocess 测试**：M0 暂未启用（相同 OOM 原因）。手动运行 `pnpm teamagent skeleton-demo` 做视觉验证。M1 引入真实 IO 后再考虑方案。

## M4-B 语义匹配（自 0.9.4 起）

- Matcher 已从 substring 升级为 BM25+dense RRF + soft-AND 打分
- 所有规则（含 practice 类）都参与运行时匹配，通道字段已废弃
- 若新版表现异常，回滚：env `TEAMAGENT_MATCHER=legacy`
- 规则迁移：`pnpm teamagent migrate-v6` 给旧规则生成语义描述 + embedding

## Project Knowledge Index

Learned behavior is no longer carried by a generated managed block in this file.
Project knowledge should propagate through `docs/knowledge/INDEX.md` and project
Skills, while this root `CLAUDE.md` stays limited to short human-maintained
working agreements.
