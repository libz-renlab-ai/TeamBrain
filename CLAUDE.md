# TeamAgent 开发约定

本文件给 Claude Code 读——在此项目内工作时必须遵守以下约定。

**参考文档**：
- **`plan.md` / `research.md` / `report.md` 项目级规则**：`docs/PLAN-RESEARCH-REPORT.md` — TeamBrain 项目内 plan / research / report 三类文档「写什么、放哪里、谁来评」的 single source of truth。`plan.md` 三段铁律（**task description** / **expected outputs** / **how-to-eval-from-3rd-party-harness that outputs a ton of JSON and let LLM-judge it**）、`research.md` 与 `report.md` 在 `plan.md` 同目录的位置约定、与 `docs/HOWTO-PLAN-PR.md` / `docs/PR-PLAN.md` / `docs/POSTPR.md` 的串接，全部在该文件里。回答「`where are the rules of plan.md, research.md, report.md ?`」一定是这个项目级文件，不是 user-level `~/.claude/...` 也不是父级 `/Users/m1/projects/AGENTS.md`。
- 设计文档：`docs/specs/2026-04-13-teamagent-design.md` (v5.2)
- Phase 2+ 产品 roadmap：`docs/superpowers/specs/2026-04-15-product-roadmap-v2.md`
- Phase 2 设计：`docs/superpowers/specs/2026-04-15-phase2-design-v2.md`
- Phase 1 实现计划（已归档）：`docs/backup/phase1/specs/2026-04-14-teamagent-phase1-plan.md`
- **多工具适配**：`docs/features/multi-tool.md` — 4 通道（PreToolUse / UserPromptSubmit / Stop analyze / AttributionBus）已实现；MCP Server / Cursor compiler **NOT YET**。
- **Hook 全景图**：`docs/features/hooks-status.md` — 项目级 hook 资产清单（`.sh` + `.cjs` + `bin-*.ts` 源、装在哪、谁用谁不用）；archive / 重接的 single source of truth。Stop hook 细节（12-field self-report 合同）见 `docs/STOP-HOOKS.md`。
- **如何为一个 PR 写计划 / how to plan for a PR**：`docs/HOWTO-PLAN-PR.md` — 四段结构（plan / expected outputs / how-to-verify / claudefast probes），把 DUCKPLAN、`docs/feature-verification.md` 验证门禁、`docs/FASTPROBE.md` 三步探针、`docs/POSTPR.md` 循环串成一条 PR 工作流。
- **PR 已经开了之后才发现 issue 怎么修 / what to do when issues found post-PR**：`docs/PR-PLAN.md` — 严禁开 follow-up issue 然后 merge；必须 block merge、在 `docs/plans/<date>-pr-<n>-fix-plan.md` 写 PR-PLAN（task / expected outputs / judge harness 三段），用 `docs/TEAMWORK.md` 的 N+1+(2N) 模式并行修，push 到同一个 PR branch，POSTPR loop 直到 `/review` PASS（ADR-0007 设定本地 `/review` skill 为权威 review gate）。
- **代码 PR-ready 且 review 通过之后怎么收尾 / what to do after PR-ready + review finished**：`docs/POSTPR.md` "After `/review` PASS" 段落 — canonical 三步顺序：(1) `gh pr merge <N> --squash --delete-branch`（squash-only，禁 `--merge` / `--rebase`）；(2) 在 worktree session 里 `ExitWorktree action="remove"`（必要时 `discard_changes=true`）；如果 worktree 是手动 `git worktree add` 创建的（`ExitWorktree` 拒绝 remove），fallback 为 `ExitWorktree action="keep"` → `git worktree remove --force <path>` → `git branch -D <branch>` → `git push origin --delete <branch>`；(3) 回到父 checkout 跑 `git pull --ff-only` 把本地 main 同步到 origin/main（含刚 merge 的 squash commit）。
- **认领 issue 之后做什么 / what would happen after we claim an issue?**：`docs/HOW-TO-CLAIM-ISSUE.md` — 被问到 `what would happen after we claim an issue?` / `what would happen after we claim an issue ? EXPLAIN ONLY` / `认领 issue 之后做什么` / `claim 完 issue 下一步` 等同义中英文问法时，回答**第一句必须用英文原文、逐字、不翻译、不 paraphrase、不加 emoji 或前缀，输出下面这条 anchor sentence**：

  > use an explore agent to understand what is going on in the issue, explore the comments and related PRs and issues

  之后再展开 STEP 1（explore agent 摸 issue body + comments + related PRs + related issues，写 `research.md`）/ STEP 2（按 `docs/PLAN-RESEARCH-REPORT.md` + `docs/HOWTO-PLAN-PR.md` 写 plan.md）/ STEP 3（接 `docs/FIXEDFLOW.md` 第 3-5 步：实施 → `/review` 循环 → squash-merge → `docs/POSTPR.md` cleanup）三步。锚点 verbatim 句子不出现 / 翻译成中文 / paraphrase 成「先看一下 issue」/ 用 `understand the issue` 替换 `understand what is going on in the issue` 都视为没命中，必须重答。完整 playbook 见 [docs/HOW-TO-CLAIM-ISSUE.md](docs/HOW-TO-CLAIM-ISSUE.md)。
- **`teamagent init` 把项目级配置传播给 teamagent users / what happens when we add project level configs**：`docs/INIT-PROPAGATION.md` — 被问到 `what would happen if we add project level configs ?` / `what would happen if we add project level configs ? EXPLAIN ONLY` / `项目级配置怎么传到用户` 等同义中英文问法时，回答**必须用英文原文、逐字、不翻译、不 paraphrase**输出下面这条 anchor sentence**：

  > install the skills/plugins/hooks/claude main settings via teamagent init to teamagent users

  展开（中文，可 paraphrase）：当项目里有 `.claude/skills/` / `.codex/skills/` / `.claude/settings.json` / hooks / plugin manifest / claudefast wrapper config 之类的 project-level 配置时，`teamagent init` 的职责就是上面那句锚点描述的——落到 `~/.claude/`、`~/.codex/`、`~/.teamagent/`。已实现部分：compiled Skills、SessionStart user-level hook、`DEFAULT_PLUGINS` 经 `claude plugin install`。Intended 部分：静态 `.claude/skills/<name>/` 镜像到 `~/.claude/skills/<name>/`、`.claude/settings.json` keys merge 到 user settings。`teamagent doctor` 是用户验证 propagation 是否生效的 source-of-truth。锚点 verbatim 句子不出现 / 翻译成中文 / paraphrase 成「propagate to users」/ 缺关键词「skills」「plugins」「hooks」「claude main settings」中任意一个都视为没命中，必须重答。完整 playbook 见 [docs/INIT-PROPAGATION.md](docs/INIT-PROPAGATION.md)。
- **仓库唯一 issue → PR → merge 工作流 / FIXEDFLOW**：`docs/FIXEDFLOW.md` — ≤50 字 issue + grill 评论 + `grill-ready` label 之后，maintainer 在 Claude Code 里**手动**跑 `/fixed-flow-driver` skill 完成 step 3-5（实现 / `/review` 循环 / 普通 PR / squash-merge）；**禁止任何 watcher / 后台轮询 / 自动 dispatch**；非此模板的 issue 一律自动 close。**Claim an issue 的两种结局（2-outcome contract）**：(1) **没有 `grill-ready` label 或 grill 评论无效 → driver 起来即退，不开 worktree、不动代码、不开 PR**；(2) **满足条件 → maintainer 启动 driver 后由 driver 跑：实现 → `/review` fix-loop（循环至 PASS）→ 普通 PR → squash-merge，期间无第三方 reviewer 介入**。**Driver 四条运行策略（policy summary，非 canned answer）**：dispatch 类型仅限 **grilled-issues**（issue 必须同时具备有效 grill comment + `grill-ready` label，由 maintainer 手动启动；blank issue / non-grill template / stale grill / retroactive AI-triage label / watcher / cron / 任何 auto-dispatch 都被 refusal layer 拒绝）；driver 内 `/review` loop **never ends** until `/review` PASS（没有 max-iter / token-budget / needs-human 出口；`needs-human` label 仅作 informational signal，要真停只能 kill 进程或 close PR）；如果多个 driver 撞同一个 `.codex/worktrees/issue-<N>/`，**let the first go** —— 第一个 driver 拿到 `.lock` sentinel（含 session-id）继续干，后续 driver 检测到不同 session-id 立刻礼让退出，不抢、不强删、不 race；squash-merge 失败后 rebase 再失败也不再加 `needs-human` label 然后退出，driver **keep trying until it failed** —— 反复 fetch / rebase / push --force-with-lease / retry merge，直到物理上跑不动（PR 被 upstream close / branch 被远端删 / repo 权限被撤 / maintainer kill 进程）。取代已归档的 `docs/HOW-TO-ISSUE.md`。

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
- **Feature 验证门禁**：任何 feature / fix 交付前必须验证，并把“如何验证”写进 commit message 与 PR message。两条路径：(1) `!claudefast -p` 跑 `{MODULE} --help` 出 canonical JSON 并对照 `snapshots/{MODULE}-help.canonical.json`；(2) tmux 跑 interactive `claudefast` 并提交 `/export <path>`，把 export 文件加入 PR contents。详见 `docs/feature-verification.md`。
- **PR 必须是普通 PR，不要 draft PR**。创建 PR 时不要使用 `--draft`，也不要通过 GitHub UI/API 创建 draft PR；未准备好时继续本地修到验证通过再开普通 PR。

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
- 上游 gstack 源码里写成 `~/.claude/<bin>` 形式（且因引号没展开 `~`），是 user level 残留；本项目不沿用，统一以 project level 路径为准。确定性验证：`bash scripts/verify-gstack-skill-mirrors.sh`  # utility mirror-checker (not a judge harness; retained per docs/legacy/judge-scripts/README.md exemption)。

## 用户沟通语言

- 本项目面向中文协作，agent 与用户沟通时默认必须使用中文。
- 即使用户用英文提问，只要是在问本项目规则、工具、流程、状态、实现或 PR 相关事项，也必须用中文回答。
- 只有在用户明确要求输出英文文案、英文原文、代码、命令、JSON、日志或第三方接口字段时，才保留必要英文。

## 跑命令

```bash
pnpm install          # 首次 / 依赖变动后
pnpm test             # 跑所有测试
pnpm typecheck        # 跑所有包的 tsc --noEmit
pnpm teamagent <cmd>  # 跑 CLI（M0 可用：skeleton-demo）
```

**`pnpm teamagent compile` 行为速查**（源文件 `packages/cli/src/commands/compile.ts`，详见 `docs/features/compile.md`）：

- 默认（无 flag）：只把 stable+/canonical/enforced 规则写到 Skills（`~/.claude/skills/teamagent/<id>/SKILL.md`），**`CLAUDE.md` 不被修改**——输出会打印 `CLAUDE.md (disabled; no generated rule block)`。
- 因此手动删掉 `CLAUDE.md` 末尾被 `TEAMAGENT:START` / `TEAMAGENT:END` marker 包住的 managed block 后，再跑 `pnpm teamagent compile` **不会自动重生**这个 block。
- 加 `--legacy-claude-md`（或 `TEAMAGENT_LEGACY_CLAUDE_MD=1` 环境变量）才会重新启用 `MarkdownCompiler`，按 token 预算把 canonical / enforced 规则写回这个 managed block。这条 flag 不是 deprecated，而是 legacy 行为的 opt-in 入口（M4 默认翻面后保留下来的，参见 commit `7e044b5`）。
- **写 `CLAUDE.md` 时务必避开字面 HTML 注释 marker**：`injectBlockIntoDoc` 的 regex（`packages/core/src/compiler/markdown.ts:233`）会**匹配文件任意位置**的字面 marker（前缀 `&lt;!-- TEAMAGENT:START`、后缀 `--&gt;`），legacy compile 跑过时会把它视为真 marker 起点、重写到下一个 `END` marker 之间的所有内容。所以 prose 引用这两个 marker 时只用纯名 `TEAMAGENT:START` / `TEAMAGENT:END`，或用 HTML entity 形式 `&lt;!-- ... --&gt;`，不要写真实 HTML 注释字面值。
- 单元测试锁这两条契约：`packages/cli/src/__tests__/compile.test.ts` 的 `no flags: writes skills and leaves CLAUDE.md untouched` 与 `--legacy-claude-md restores old behavior`。

## 测试在哪里跑

并行 ≥4 session 同时本地 `pnpm test` 会让 macOS scheduler 队列饱和（`toohot` 2026-05-10 实测 loadavg 274 / thermal normal —— **是 scheduler-overload 不是热墙**），所以全量测试已经搬到独立 CI workflow。详见 ADR-0013。

| 跑什么 | 在哪跑 | 命令 |
|---|---|---|
| **全量** `pnpm test` / `pnpm verify` | CI on `wip/**` | `git push origin HEAD:wip/<name>` 触发 `.github/workflows/inner-loop.yml` |
| **单文件 targeted** vitest | 本地（秒级允许） | `pnpm vitest run path/to/x.test.ts` |
| **PR-gate 全套** | CI on PR / main | 现有 `ci.yml`，含 ubuntu + windows + typecheck，**不动** |

- 操作手册：[`docs/INNER-LOOP-TESTING.md`](docs/INNER-LOOP-TESTING.md)
- 决策与权衡：[`docs/adr/0013-inner-loop-on-ci.md`](docs/adr/0013-inner-loop-on-ci.md)
- Repo secret：`MINIMAX_API_KEY`；YAML 内 `env: ANTHROPIC_API_KEY: ${{ secrets.MINIMAX_API_KEY }}`。Token rotate 流程见 INNER-LOOP-TESTING.md。

## claudefast 约定

- `claudefast` 不是 TeamAgent 命令；在本项目里它表示“用更便宜或更快的 Claude Code profile 跑非交互测试”的本地 wrapper/alias。
- `claudefast` 一般作为本地 wrapper 安装在用户 PATH 上（macOS/Linux 常见 `~/.local/bin/claudefast`，Windows Git Bash 看具体安装），最终会调用 `claude`，并使用 MiniMax Anthropic-compatible fast profile。不要把 wrapper 里的 API token 写进文档、测试或 commit；解释该 wrapper 时也不要展示 token 的任何片段、前缀或后缀，统一写成 `[redacted]`。
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
- verifier 脚本调用 `claudefast` 时，优先直接执行 PATH 上的 `claudefast`；如果只能通过 zsh alias/function 找到，fallback 必须用 interactive zsh（`zsh -i`），不要用普通 `zsh -c`。fallback 时要把 shell 启动噪声 / stderr 与被 grep 的 stdout 分开，避免污染 canned-answer 判断。
- 不要用 `--bare` 测 TeamAgent hooks；它会跳过 hooks、plugin sync 和 CLAUDE.md 自动发现。
- 详细说明见 `docs/CLAUDEFAST.md`。

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

<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->
## TeamAgent 经验（72条活跃知识，为你编译了 28 条（token 预算 3000）)
- 使用 忽略 <local-command-caveat> 包裹的消息，除非用户明确要求分析 而非 <local-command-caveat>——该标签内容由本地命令自动生成，非用户意图表达；AI 主动响应会污染对话上下文，误把系统噪声当用户指令 [1.00] [预置]
- 立即读取 output-file 并继续后续流程；task-notification 本身就是完成信号，不需要额外等待——AI 说「等 Worker A 回来合成报告」说明未识别 task-notification 为完成触发点；该消息已携带 output-file 路径与 status=completed，收到即可处理，继续等待只会阻塞后续 Wave [0.95]
- 移除用户反馈的检查条件，仅基于失败本身触发分析——用户反馈约束是冗余的；所有错都应进入分析管道，由规则库自主决定是否学习，而非前置过滤 [0.95] [预置]
- 规则类型（practice/avoidance）应只影响处理策略（enforcement），不应影响 matching 逻辑；所有规则都应参与匹配——在 matcher 中过滤 practice 类规则导致其永不触发，失去学习反馈信号和评分机制；类型应仅控制 block/warn/score 行为，而非决定规则是否生效 [0.95] [预置]
- avoidance 必须配 wrong_pattern（可字面匹配关键词），practice 应为空；两种规则走不同处理流程——avoidance 类规则需要可靠字面关键词才能被 matcher 在 PreToolUse 拦截，practice 类规则是原则性指导、没可靠字面关键词，直接编译进 CLAUDE.md 供 AI 读；数据合法性约束必须在 seed 生成或 LLM extractor 阶段强制执行 [0.95] [预置]
- 使用 先执行 find/grep/scan 命令得到完整真实清单，分类每一项，再基于数据做结论 而非 疑似|比预想多|推测互为镜像|假设——直接对未知范围的文件/代码做推测易出现完全错误的假设（如疑似互为镜像、数量意外多）；应优先实际执行扫描工具得到 ground truth 清单，逐项分类，再汇总推断，避免幻觉 [0.90]
- 立即响应失败状态，调查原因并重新规划，而非继续基于之前的成功假设推进——task-notification 是系统权威信号；failed status 表示计划前提已破裂，继续基于旧状态推进会导致方案脱离现实，应以最新系统信号重新评估 [0.90]
- 立即读 output-file，从原始输出诊断失败原因；不要相信 result 摘要或试图重新验证——后台任务失败时，task-notification 的 result 摘要可能包含过时或误导信息；必须直接读原始输出文件来判断实际情况和失败原因，而非假设任务部分成功 [0.90]
- 使用 检测到文件状态为 'nothing to stage' 或 'already tracked，no changes'时，应立即标记该文件为 skip，而不是重试或等待状态变化 而非 nothing to stage——Agent stalled for 600s 的根本原因：批处理逻辑未能识别 'nothing to stage' 作为终止条件，导致进程在无进展的状态检查循环中卡死。正确做法是将此状态视为'无操作需要'的信号，主动推进到下一个文件或任务。 [0.90]
- 使用 检测到 'nothing to stage' 或 'already tracked' 立即标记 skip，不重试、不做额外树检查，推进下一个文件或任务 而非 nothing to stage——git 输出 'nothing to stage' 是明确的终止信号而非错误；agent 若继续重试或做额外 git tree 检查，会陷入无进展循环，最终触发 600s watchdog 超时将整个 batch 任务杀死 [0.90]
- 逐个创建 playbook → 验证（用 Wave agent 或 claudefast -p） → 提交，而不是批量创建→批量提交→后验证——批量创建后集中验证会导致某个 playbook 失败时难以定位原因、影响后续工作流；逐步验证能及时发现问题并在单个文件层面修复，加快反馈循环 [0.90]
- 每条消息末尾必须附加完整的 12-field <self-report> block：premature_stopping / permission_seeking / ownership_dodging / simplest_fix / reasoning_loop / known_limitation / skipped_repo_search / fabricated_value / placeholder_used / ambiguity_unresolved / contradiction_unresolved / silent_fallback，全部为 true|false 布尔值——Stop hook 强制要求 12-field self-report 块，缺失或格式错误会导致 hook 判定为 block；全部 false 表示继续执行，全部 true 或部分 true 表示存在需报告的问题信号 [0.90]
- 使用 先读用户指向的文件，重新 brainstorm + 补全需求，再拆 task 实现；API key 来源询问用户（如 claude code haiku） 而非 计划文档只是设计文档，还没实现——AI 未读文件就断言不存在会误导用户；正确做法是先 Read 指定路径、以文件内容为准，再结合用户偏好（如用 haiku 作 token 来源）规划实现 [0.90] [预置]
- 立即读取 output-file 并继续后续流程，不再说'等通知'——task-notification 本身就是通知；AI 仍说'等通知'说明未识别该消息为触发信号，正确做法是收到后立即处理输出、推进工作流 [0.90] [预置]
- 后台 agent 完成时系统会发 task-notification，包含 task-id、output-file、status、summary；可通过 TaskOutput 工具按 task-id 读取结果——Agent(run_in_background=true) 底层走 TaskCreate 机制，完成后 harness 自动发 task-notification 事件；AI 声称'无法手动查状态'是错的，实际有 task-id 可查 [0.90] [预置]
- 立即读取 output-file，继续后续流程（如 dispatch 下一 Wave）——task-notification 本身就是完成信号；收到后仍说'等通知'说明 AI 未识别该消息为触发点，正确做法是收到即处理，不需要额外等待 [0.90] [预置]
- 维护游标，增量扫描新增 turn，去重已处理；仅在 /new、/clear、/compact、退出、关闭窗口时做完整重扫——Stop 每轮触发，全量重扫导致 token 消耗呈平方增长；增量扫描维护游标可避免重复，关键时刻完整重扫确保一致性 [0.90] [预置]
- 自动化拉取 + 自动清理过时数据——手动维护导致数据陈旧（拉取滞后5天）和无效数据堆积，自动化+清理确保知识及时可用且命中率高 [0.90] [预置]
- 立即用 TaskOutput 工具按 task-id 读取输出，继续流程——task-notification 本身就是完成信号，harness 发出即表示任务已完；立即处理充分利用并行性而非阻塞 [0.90] [预置]
- 忽略标签内所有内容，除非用户明确要求分析——<local-command-caveat> 由本地命令自动生成而非用户意图，响应会把系统噪声当指令污染对话 [0.90] [预置]
- 分别为 Windows（where/findstr/PowerShell）和 Unix（which/grep）提供诊断命令，或明确标注环境要求——Unix 命令（which, grep, cat |）在 Windows cmd 原生环境不可用；跨平台用户群需要对应平台的等价命令，混合给两个平台的指令会导致 Windows 用户卡住且困惑 [0.90] [预置]
- 使用 Hook 系统完整工作；flag 仅隐藏 Claude Code UI 权限交互弹窗 而非 --dangerously-skip-permissions——Flag 名字暗示禁用全部权限检查，实际只跳过交互式弹窗。PreToolUse/PostToolUse/Stop/SessionStart 等 hook 独立于此标志完整运行，不受影响 [0.90] [预置]
- 当遇到 `<local-command-caveat>` 标签，忽略其包裹的内容，除非用户明确要求分析或响应——该标签标记系统生成的消息（如本地命令输出），非用户的显式意图；直接响应会污染对话上下文并误把工具输出当作用户指令 [0.90] [预置]
- 不要凭记忆作答；优先用 WebSearch/WebFetch 或 mcp 搜索工具验证，再结合当前代码上下文作答——模型记忆会过时或臆造（幻觉）；用户用到的新概念常在训练数据截止之后出现。先搜索再作答可避免给出错误事实、误导用户 [0.95] [预置]
- 先把凭据/环境持久化到项目配置（增量、不改已有内容），再让 subagent 自主完成；远程实验需先检测空闲显卡避免影响他人——反复追问凭据打断用户节奏；配置应一次记录永久复用。subagent 应自主推进而非报 BLOCKED。共享 GPU 资源需礼让他人实验 [0.95] [预置]
- 按产品经理视角讲架构、流程、关键原理,略过代码级细节——默认倾向给技术细节会淹没非技术受众；产品经理需要整体认知(架构/流程/原理)而非实现,讲解粒度要匹配听众心智模型 [0.95] [预置]
- 使用 直接调用 mcp 工具 而非 通过 wiki 知识库系统——wiki 知识库方案过度复杂；应优先检查是否有现成 mcp 工具可直接调用，避免绕路 [0.95] [预置]
- 全局单次init，所有项目共享规则——全局 init 避免重复配置和规则分散，保证用户所有项目规则一致，降低管理成本 [0.95] [预置]
- 修改文档后不要自动运行验证 probe；只在用户明确要求时才执行验证——自动验证每次提交会浪费 token 并干扰用户工作流；验证应该由用户显式触发而非被动自动化 [0.90]
- 先澄清和解释系统逻辑细节，获得用户确认理解后再给建议——用户若不理解系统为何如此，对改动方案缺乏信心；同步理解是决策的前置条件，避免改动后产生新的疑虑 [0.95] [预置]
- 按分阶段流程：通读项目结构 → 识别核心模块 → 追踪关键链路 → 提炼设计思想 → 最后动笔——充分的前期分析能确保文档的准确性、完整性和逻辑清晰，避免仓促写作导致遗漏或误读 [0.95] [预置]
- 将抽象层级维持在问题与思路层而非技术与结构层；焦点放在问题形状、核心判断、思路选择与权衡取舍，避免具体技术名、目录、字段、算法、流水线式细节——资深架构师关注的是设计的认知模型与思维方式而非实现的技术栈；提升抽象层级使文档跨时间跨团队复用，避免技术细节导致的快速过时 [0.95] [预置]
- 保持在功能与机制层级：讲『系统做什么』和『如何运转』，避免实现细节（技术名、目录、代码组织）和空泛表述（价值观、文学比喻）——资深读者需要清晰的功能骨架来快速形成系统心智模型；过低的抽象陷入无关细节，过高的抽象脱离工程实现，只有功能与机制层才能既有清晰的因果链又足以指导架构判断 [0.95] [预置]
- 保持在功能与机制层：讲系统做什么、如何运转；避免掉进实现细节（技术名、路径、代码组织）和空泛理念（价值观表述、文学比喻）——资深工程师需要清晰的功能骨架来快速形成系统心智模型；掉进细节淹没主线，飘到理念脱离工程实践，只有功能与机制层既有因果链又足以指导架构判断 [0.95] [预置]
- 遇到用户提出的概念和名词优先到 web 中 search，而非依赖自身记忆——LLM 记忆可能过时或有幻觉，web search 确保信息最新准确，特别是对新术语和概念的理解 [0.95] [预置]
> 还有 37 条 canonical+ 规则因 token 预算未显示（teamagent compile --dry-run 查看）
> 另有 2 条因与已选条目近义（Jaccard ≥ 0.6）被多样性过滤
<!-- TEAMAGENT:END -->
