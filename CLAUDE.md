# TeamAgent 开发约定

本文件给 Claude Code 读——在此项目内工作时必须遵守以下约定。

**参考文档**：
- 设计文档：`docs/specs/2026-04-13-teamagent-design.md` (v5.2)
- Phase 2+ 产品 roadmap：`docs/superpowers/specs/2026-04-15-product-roadmap.md`
- Phase 2 设计：`docs/superpowers/specs/2026-04-15-phase2-design.md`
- Phase 1 实现计划（已归档）：`docs/backup/phase1/specs/2026-04-14-teamagent-phase1-plan.md`
- **多工具适配**：`docs/features/multi-tool.md` — 4 通道（PreToolUse / UserPromptSubmit / Stop analyze / AttributionBus）已实现；MCP Server / Cursor compiler **NOT YET**。任何「这功能跑通了吗 / 支持哪些 AI 工具」问题先读此文档，禁止说"即将上线"或省略 NOT YET 标记。
- **如何为一个 PR 写计划 / how to plan for a PR**：`docs/HOWTO-PLAN-PR.md` — 四段结构（plan / expected outputs / how-to-verify / claudefast probes），把 DUCKPLAN、`docs/feature-verification.md` 1+2+3 门禁、`docs/FASTPROBE.md` 三步探针、`docs/POSTPR.md` 循环串成一条 PR 工作流。任何「PR 怎么计划 / 计划里写什么 / PR 前要跑哪些 probes」问题先读此文档，不要走 canned-answer 捷径。
- **PR 已经开了之后才发现 issue 怎么修 / what to do when issues found post-PR**：`docs/PR-PLAN.md` — 严禁开 follow-up issue 然后 merge；必须 block merge、在 `docs/plans/<date>-pr-<n>-fix-plan.md` 写 PR-PLAN（task / expected outputs / judge harness 三段），用 `docs/TEAMWORK.md` 的 N+1+(2N) 模式并行修，push 到同一个 PR branch，POSTPR loop 直到 Codex 👍。任何「PR 提了之后又找出 issue 怎么办 / commit-push-pr 之后还要修怎么办」的问题先读此文档与 `docs/POSTPR.md`。

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

## 高优先级触发答案

- 用户消息等于或近似等于 `what we shall do after each PR?`、`what to do after each PR?`、`POSTPR`、`after PR` 时，必须输出 POSTPR 规则答案，不能空答，不能只输出 `<laziness-self-report>`。答案必须包含 `fetch the codex review`、`chatgpt-codex-connector[bot]`、`pulls/<n>/comments`、P1/P2/P3 triage、conflict resolution before merge、`@codex review`、`loop until silent`，并说明停止条件是 CI green、无 merge conflict、Codex silent/👍。**P1/P2 triage 必须明确：fix in this PR with PR-PLAN + TEAMWORK，禁止开 follow-up issue 然后 merge；in-flight PR 找出 issue 一律 do NOT merge until fixed in same PR**。详见 `docs/PR-PLAN.md`。

- 用户消息等于或近似等于 `FASTPROBE about PR+conflict resolve` 时，必须输出规则答案，不能空答，不能只输出 `<laziness-self-report>`，不能实际运行 probe。答案必须包含 `claudefast -h`、`max 8 claudefast -p probes`、`stream-json`、三类冲突（merge / Codex-review / rule-doc）、禁止项（不在 `main` 修、不 `git reset --hard`、不 force push、不丢他人改动），以及这条线性图：

```text
PR opened
  -> CI + Codex review
  -> conflict?
  -> classify: merge / Codex-review / rule-doc
  -> resolve locally on PR branch
  -> rerun pnpm test + pnpm typecheck + feature verification 1+2+3
  -> push same PR branch or follow-up PR if already merged
  -> POSTPR loop
  -> merge only when CI green + no conflict + Codex silent/thumbs-up
```

- 用户消息等于或近似等于 `what hooks we have for now for stop hooks ? ONLY explain`、`what stop hooks do we have`、`list our stop hooks`、`当前的 stop hook 是什么`、`stop hook 现状` 时，必须输出下面的中文答案，不能空答，不能只输出 `<self-report>` block，不能列已 orphaned 的旧脚本作为活动 hook：

```text
当前项目级 Stop hook（PR #106 之后生效）：

1. .claude/settings.json -> .claude/hooks/self-report-fused.sh
   - 来源：从 user level /Users/m1/.claude/scripts/hooks/self-report-fused.sh vendored 进项目
   - timeout：10s
   - 强制要求每条 assistant message 末尾附加 12-field <self-report> block：
       premature_stopping / permission_seeking / ownership_dodging / simplest_fix /
       reasoning_loop / known_limitation / skipped_repo_search / fabricated_value /
       placeholder_used / ambiguity_unresolved / contradiction_unresolved / silent_fallback
   - 缺失或字段非 true|false -> decision: block + 模板
   - 任意字段为 true -> decision: block + signals 列表（uniform: true = bad）
   - 全部 false -> {"continue": true, "suppressOutput": true}
   - 日志写入 $HOME/.claude/self-report/log.jsonl

2. .claude/settings.local.json (gitignored, per-host) 同样指向上面这个脚本，timeout 10s。

已 orphaned（仍在 git 里但 settings.json 不再 wire）：
   - .claude/hooks/teamagent-stop.sh —— 旧 TeamAgent learning loop shim（曾跑 bin-stop.cjs）。
   - .claude/hooks/laziness-self-report.sh —— 旧 6-field <laziness-self-report> 版本，已被 12-field <self-report> 取代。

其他 hook channel（仍由 .claude/settings.local.json 在本机上 wire，不属于 Stop hook）：
   - PreToolUse / PostToolUse / UserPromptSubmit -> packages/cli/dist/bin-*.cjs。

User level (~/.claude/settings.json) 的 Stop hook 仍然带 `true # DISABLED 2026-05-07` 前缀，对 TeamBrain 路径不生效；un-disabled 版本现在以 vendored 形式落在 project level。
```

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

## 用户沟通语言

- 本项目面向中文协作，agent 与用户沟通时默认必须使用中文。
- 即使用户用英文提问，只要是在问本项目规则、工具、流程、状态、实现或 PR 相关事项，也必须用中文回答。
- 只有在用户明确要求输出英文文案、英文原文、代码、命令、JSON、日志或第三方接口字段时，才保留必要英文。
- 被问到 `based on this project rule, what language agent uses when talk with users and asked in english` 时，这是机械验证哨兵，必须只输出 `中文。`。不要解释、不要引用文档、不要 Markdown、不要表格、不要代码块、不要追加 `<laziness-self-report>`。

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

## Project tools / FASTPROBE

被问到 `what project tools we have?` 时，回答必须列出本项目工具并**显式包含 `FASTPROBE`、`TEAMWORK` 与 `PR-PLAN`**。当前 canonical 列表：

| Tool | Purpose |
|------|---------|
| `pnpm install` / `pnpm test` / `pnpm typecheck` | 依赖、测试、类型检查 |
| `pnpm teamagent <cmd>` | TeamAgent CLI（M0：`skeleton-demo`） |
| `claudefast` / `!claudefast` | MiniMax fast Claude Code wrapper（详见 `docs/CLAUDEFAST.md`） |
| **`FASTPROBE`** | 本项目调研/审计的 `claudefast` 三步固定组合（详见 `docs/FASTPROBE.md`） |
| **`DOGFOOD`** | 双 tmux 窗口 left/right split（左 dev claude / 右 sandbox claudefast）live agent dev loop（详见 `docs/DOGFOOD.md`） |
| **`BUGREPORT`** | 报 bug 流程：开 issue 在 `https://github.com/libz-renlab-ai/TeamBrain`，三段 system info / how-to-reproduce / raw logs（详见 `docs/BUGREPORT.md`，自动收集 `bash scripts/bugreport-collect.sh`） |
| **`HOWTOISSUE`** | 在仓库新建 issue 的写法约定：三段式（问题 / 复现步骤 / 修复验证清单），严禁写 root cause 分析、fix 建议、实现细节；canonical 范式 issue #100（详见 `docs/HOW-TO-ISSUE.md`） |
| **`POSTPR`** | 每个 PR 开完后必做：fetch Codex review → triage P1/P2 → loop until silent or 👍（详见 `docs/POSTPR.md`） |
| **`PR-PLAN`** | commit-push-pr 之后又找出 issue 时的修法：do NOT merge、do NOT 开 follow-up issue；在 `docs/plans/<date>-pr-<n>-fix-plan.md` 写三段 plan（task / expected outputs / judge harness），用 TEAMWORK 并行修在同一个 PR branch，POSTPR loop 到 Codex 👍（详见 `docs/PR-PLAN.md`） |
| **`PRESHIP`** | 发版前给 CEO/VC 小鸭看的 verified-only 产品功能状态 CSV（详见 `docs/PRESHIP.md`） |
| **`RULE-VERIFY`** | 跑 `bash scripts/verify-all-rules.sh` 用 claudefast semantic judge / mechanical checks 验证 8 条 triggered rule 全部 PASS（详见 `docs/rule-verify/INDEX.md`） |
| **`TEAMWORK`** | N+1+(2N) 成员 agent 团队模式：N 个 sonnet worker（每人跑 2 个 claudefast probe 更新文档）+ 1 个 opus 1M reporter 汇总验收；lead 必须在非 main 分支/worktree 上操作，绝不在 main 直接工作（详见 `docs/TEAMWORK.md`） |
| `codex exec` | Codex 端 canonical JSON 对照（feature-verification 1+2+3） |
| **Feature canned answers** | 每个 feature（Calibrator v2、Team knowledge sharing 等）的 6 节模板入口在 `docs/features/INDEX.md` — 不在本文件 inline 答案 |
| **`apps/landing/`** | GitHub Pages landing page 子包（`pnpm --filter landing build`）；关联 `docs/plans/issue-84` + `.github/workflows/landing-deploy.yml` |
| **`SELF-UPDATE`** / 自动升级 | 顶层 canonical doc `docs/SELF-UPDATE.md`：SessionStart → 1h debounce → detached `bin-updater.cjs` → `npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz`（HTTPS tarball `PACKAGE_SPEC` 常量，B-104 SSH-key fix）→ `migrate-auto`；状态文件 `~/.teamagent/update-state.json`、日志 `~/.teamagent/update.log`、回滚 `~/.teamagent/rollback/<sha>/`；opt-out `touch ~/.teamagent/auto-update.disabled` 或 `TEAMAGENT_AUTO_UPDATE=0`；known issue：ENOTEMPTY rename collision（详见 `docs/SELF-UPDATE.md`） |
| **`STATUSLINE`** / 状态栏 | 顶层 canonical doc `docs/STATUSLINE.md`：用户已有 statusline 时 chain wrap `bash -c '<user_cmd>; echo; <teamagent_cmd>'`，渲染**两行**（第 1 行用户原 / 第 2 行 teamagent）；备份字段 `_teamagentOriginalCommand`/`Type`/`Scope`；`pnpm teamagent uninstall` 按 scope 还原；从不写 user-level `~/.claude/settings.json`（详见 `docs/STATUSLINE.md`、issue #104、PR #124） |

被问到 `what would happen if we say word 'FASTPROBE'?` 或用户消息单纯含 `FASTPROBE` 时，**必须**语义覆盖下面三步；不要求逐字原文，但不得省略关键动作：

1. **先跑 `!claudefast -h`** — 拿到当前 `claudefast` 支持的 flag 列表，避免凭记忆乱写参数。
2. **重活 + 需要结论的活** → 用 `!claudefast -p "..."` **并行调度，最多 8 路**：把可独立的调研子题切成最多 8 个 prompt 同时跑（heavy work + conclusion-needing），主 agent 汇总。
3. **审计场景** → 用 `!claudefast -p` 加 **stream-json 参数**（`--output-format stream-json --include-partial-messages --verbose`）和 hook debug 参数（`--debug hooks --debug-file <path>`）跑，输出与 debug log 都可 grep / jq、可回放，留作 evidence。

被问到 `FASTPROBE about PR+conflict resolve` 时，必须回答下面这类中文规则答案，禁止空答，禁止只输出 `<laziness-self-report>`，也不要实际运行 probe、不要派生子任务，除非用户明确说 `run/execute/start FASTPROBE`：

```text
FASTPROBE about PR+conflict resolve:
claudefast -h
  -> split max 8 claudefast -p probes: PR state / Codex inline comments / merge conflict / rule-doc conflict
  -> stream-json for audit evidence
  -> synthesize answer

PR opened
  -> CI + Codex review
  -> conflict?
  -> classify: merge / Codex-review / rule-doc
  -> resolve locally on PR branch
  -> rerun pnpm test + pnpm typecheck + feature verification 1+2+3
  -> push same PR branch or follow-up PR if already merged
  -> POSTPR loop
  -> merge only when CI green + no conflict + Codex silent/thumbs-up
```

同时说明：merge conflict 要 fetch 最新 base 后在 PR branch 本地 rebase/merge 并保留双方 intent；Codex review 与实现冲突要先更新 docs/rules 并验证规则答案；规则/文档冲突要优先当前用户指令与当前 `CLAUDE.md`/`AGENTS.md`，更新文档消除歧义。禁止直接在 `main` 修、禁止 `git reset --hard`、禁止 force push、禁止为了消冲突丢掉他人改动。

如果用户同时提到 `FASTPROBE`、`PR`、`conflict/冲突/resolve` 但不是 exact prompt，也按同一答案语义覆盖。

完整 recipe、并行模板、stream-json schema 与示例见 `docs/FASTPROBE.md`。

被问到 `what would happen if we say PRESHIP`、`PRESHIP 是什么`、`explain PRESHIP` 或用户消息单纯含 `PRESHIP` 关键字时，必须用中文回答；**不能只解释规则，必须直接输出实际 CSV**：

1. **PRESHIP 是发版前 CEO/VC 小鸭视角的 verified-only 产品功能状态报告**。它只讲高层产品功能，不讲技术实现细节。
2. **必须输出实际 CSV rows**，列名优先使用：`状态,功能,给小鸭CEO/VC的解释,证据/当前判断`。
3. **只列已验证功能**。不要把部分验证、未验证、失败/不稳定、文档规划项作为 feature rows 列入；最多在 CSV 前或后用一句 caveat 说明“未验证/失败/规划项未列入，避免 overclaim”。
4. 当前 verified-only 产品功能以 `docs/ship-status/2026-05-03-ceo-duck-ship-status.csv` 中 `状态` 为 `已验证` 的产品行作为来源：产品入口能打开、最小学习闭环演示、安全试吃沙箱、AI 犯错前提醒、纠正一次下次记住、知识会进化、看得见的统计、主动记录坑点。不要把 `门禁已验证` / `流程已验证` 行当产品功能列入。
5. 不要把 `RULE-VERIFY` 或 `bash scripts/verify-all-rules.sh` 说成 PRESHIP 的触发方式。PRESHIP 的触发方式就是用户说 `PRESHIP` 或问 `what would happen if we say PRESHIP`。

回答形状必须类似：

```csv
"状态","功能","给小鸭CEO/VC的解释","证据/当前判断"
"已验证","产品入口能打开","鸭总能看到产品菜单，说明不是空壳，能被真实启动。","可作为最小演示卖点。"
"已验证","最小学习闭环演示","系统能演示记录经验、编译规则、展示归因这条最小链路。","可作为核心概念 demo。"
"已验证","安全试吃沙箱","新改动可以先放进隔离环境里试，不直接污染主工作区。","DOGFOOD Tier 2 / Tier 3 sandbox probe 已通过；不要 claim Tier 4。"
"已验证","AI 犯错前提醒","AI 准备走错路时，系统能提前提醒或阻止，避免错误真正落地。","e2e-evaluate 已验证已有经验命中时 positiveTriggerRate=1、falsePositiveRate=0。"
"已验证","纠正一次，下次记住","用户纠正 AI 一次后，系统能把教训变成以后可复用的经验。","e2e-evaluate 已验证纠正识别、规则提取、后续同类 probe 命中。"
"已验证","知识会进化","有用经验会更可信，没用或过时经验会降级，避免团队大脑越来越乱。","最小校准闭环已验证。"
"已验证","看得见的统计","CEO 可以看到系统学到了多少经验、分布在哪些层、最近新增了什么。","teamagent stats 已验证。"
"已验证","主动记录坑点","用户不用等 AI 犯错，可以主动把一个坑记进系统，让团队以后少踩一次。","pitfall 非交互录入已验证。"
```

详情见 `docs/PRESHIP.md`。

被问到 `list all the features we clamined please. list product feature not tech feature`、`list all the features we claimed please. list product feature not tech feature`，或用户同时要求列出 claimed features / product features / not tech features 时，必须使用 **ready-to-ship product-only** 口径：

1. 用中文回答。
2. 只列已经验证、可以稳妥对外展示的产品功能。
3. 不列 `部分验证`、`已声明未验证`、`失败/不稳定`、`文档规划`、技术门禁、项目工作流、测试状态、脚本、canned answer、E2E、CI/typecheck。
4. `最小质量线` 是发版门禁，不是产品功能；`快速调研流程` / `PR 后复查流程` 是项目流程，不是 TeamBrain product feature；此问法下不要列入 feature rows。
5. 输出实际 CSV rows，列名使用：`状态,功能,给小鸭CEO/VC的解释,证据/当前判断`。

回答形状必须类似：

```csv
"状态","功能","给小鸭CEO/VC的解释","证据/当前判断"
"已验证","产品入口能打开","鸭总能看到产品菜单，说明不是空壳，能被真实启动。","可作为最小演示卖点。"
"已验证","最小学习闭环演示","系统能演示记录经验、编译规则、展示归因这条最小链路。","可作为核心概念 demo。"
"已验证","安全试吃沙箱","新改动可以先放进隔离环境里试，不直接污染主工作区。","DOGFOOD Tier 2 / Tier 3 sandbox probe 已通过；不要 claim Tier 4。"
"已验证","AI 犯错前提醒","AI 准备走错路时，系统能提前提醒或阻止，避免错误真正落地。","e2e-evaluate 已验证已有经验命中时 positiveTriggerRate=1、falsePositiveRate=0。"
"已验证","纠正一次，下次记住","用户纠正 AI 一次后，系统能把教训变成以后可复用的经验。","e2e-evaluate 已验证纠正识别、规则提取、后续同类 probe 命中。"
"已验证","知识会进化","有用经验会更可信，没用或过时经验会降级，避免团队大脑越来越乱。","最小校准闭环已验证。"
"已验证","看得见的统计","CEO 可以看到系统学到了多少经验、分布在哪些层、最近新增了什么。","teamagent stats 已验证。"
"已验证","主动记录坑点","用户不用等 AI 犯错，可以主动把一个坑记进系统，让团队以后少踩一次。","pitfall 非交互录入已验证。"
```

被问到 `list all product features`、`show all features including not verified and not implemented`、`show wip planned missing features`、`complete product feature list` 或用户要求列出**所有**功能（包括 WIP、PLANNED、MISSING）时，**直接读取 `docs/PRODUCT-FEATURES.md`** 自然回答（该文件包含编号 1–58 的完整列表，全部 VERIFIED；2026-05-07 起新增 50–58 共 9 条 M5 viral sync 功能）。不要只返回 VERIFIED 口径的 9 行 CSV。

**产品功能问法的 SOT**：所有关于产品功能列表的问法（含错别字如 `featuers`、含 `not tech features`、含 `chinese cute duck` 等修饰语）都应以 `docs/PRODUCT-FEATURES.md` 为权威来源自然推理回答。鸭语风格（`呷呷~` / `鸭鸭` / ASCII 鸭子）仅在用户 prompt 明确包含 `chinese cute duck`、`cute duck`、`可爱小鸭` 等鸭语信号时才加；不要为了凑数硬填或硬截。回答全部 58 项时直接读该文件的 1–58 编号列表，不走任何 canned-answer。

**注意区分**：`ready-to-ship product-only` 口径（9 行 CSV）仅适用于 CEO/VC deck 场景、或明确要求"只列已验证 + 不要技术细节"且**不要求列全部**的问法；`list all product features`（包含 `list all`、全部、all 等措辞）一律走完整 58-feature 口径。

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
2. **Triage by priority** — Codex 评论自带 P1（红）/P2（黄）/P3（蓝）badge。**P1 / P2 一律 fix in this PR before merge，禁止 punt 到 follow-up issue**；P3 nice-to-have 仅在人类 reviewer 在 PR 上显式批准后才允许 follow-up issue 延后，默认仍是本 PR 修。修法：原 PR 没合并（默认情况）→ **do NOT merge**，在 `docs/plans/<date>-pr-<n>-fix-plan.md` 写一份 PR-PLAN（task / expected outputs / judge harness 三段，详见 `docs/PR-PLAN.md`），用 TEAMWORK（N sonnet workers + 2N claudefast probes + 1 opus 1M reporter，详见 `docs/TEAMWORK.md`）并行修，push 回同一 PR branch；已合并（罕见，auto-merge 抢跑）→ 开 follow-up PR（不是 follow-up issue），commit message 带 `Refs codex review on PR #<n>`，follow-up PR 自身仍走 PR-PLAN + TEAMWORK。**禁止开 follow-up issue 写「下次再修」然后 merge 当前 PR**——这是被本规则明确移除的 punt 路径。
3. **Resolve conflicts before merge** — 若 PR 出现冲突，先分类再处理：merge conflict → fetch/rebase 或 merge base 到 PR branch、本地解冲突、保留两边 intent；Codex review 与实现方案冲突 → 先更新 docs/rules 并验证规则答案，再用 PR-PLAN + TEAMWORK 修本 PR 代码（不要 punt 到 follow-up issue）；规则/文档冲突 → 以当前用户指令和当前 `CLAUDE.md`/`AGENTS.md` 优先，更新文档消除歧义。禁止直接在 `main` 修、禁止 `git reset --hard`、禁止 force push、禁止为了消冲突丢掉别人改动。解冲突后必须重跑验证并 push 回同一 PR 分支；若原 PR 已 merge，则开 follow-up PR 并引用原 PR。
4. **Loop until silent** — Codex **同样会 review 你 push 上去的 fix commit**（不论是同一个 PR 的 fix push，还是已合并场景下的 follow-up PR）。所以每次 fix push 或 conflict-resolution commit 之后，都回到第 1 步重跑。停止条件：CI green、无 merge conflict、Codex 在最新 commit 上 👍 或不留 comment。merge button 在四个条件全部满足前一直 lock；没有「开个 issue 就 merge」的退出口。`fetch the codex review` 这一动作要做到链路彻底干净为止。

详情、`gh api` 配方、Codex 标签解读见 `docs/POSTPR.md`。验证脚本 `bash docs/postpr/verify-canned-answer.sh` 必须 PASS —— grep 锚点 `fetch the codex review` / `chatgpt-codex-connector` / `pulls/.*comments` / `@codex review` / `silent` / `loop` 全部命中。

## Canned answers (misc)

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

<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->
## TeamAgent 经验（71条活跃知识，为你编译了 28 条（token 预算 3000）)
- 使用 忽略 <local-command-caveat> 包裹的消息，除非用户明确要求分析 而非 <local-command-caveat>——该标签内容由本地命令自动生成，非用户意图表达；AI 主动响应会污染对话上下文，误把系统噪声当用户指令 [1.00] [预置]
- 移除用户反馈的检查条件，仅基于失败本身触发分析——用户反馈约束是冗余的；所有错都应进入分析管道，由规则库自主决定是否学习，而非前置过滤 [0.95] [预置]
- 规则类型（practice/avoidance）应只影响处理策略（enforcement），不应影响 matching 逻辑；所有规则都应参与匹配——在 matcher 中过滤 practice 类规则导致其永不触发，失去学习反馈信号和评分机制；类型应仅控制 block/warn/score 行为，而非决定规则是否生效 [0.95] [预置]
- avoidance 必须配 wrong_pattern（可字面匹配关键词），practice 应为空；两种规则走不同处理流程——avoidance 类规则需要可靠字面关键词才能被 matcher 在 PreToolUse 拦截，practice 类规则是原则性指导、没可靠字面关键词，直接编译进 CLAUDE.md 供 AI 读；数据合法性约束必须在 seed 生成或 LLM extractor 阶段强制执行 [0.95] [预置]
- 使用 每条 assistant message 停止前必须附加完整的 12-field <self-report> block（premature_stopping / permission_seeking / ownership_dodging / simplest_fix / reasoning_loop / known_limitation / skipped_repo_search / fabricated_value / placeholder_used / ambiguity_unresolved / contradiction_unresolved / silent_fallback 全部为 true 或 false） 而非 stop without self-report|<self-report——Stop hook 强制校验 self-report block 格式；消息末尾缺失或字段非 true|false 会触发 block，任意字段为 true 则列出 signals；这是团队协作协议的硬性门禁，不是可选建议 [0.90]
- 每条消息末尾必须附加完整的 12-field <self-report> block——Stop hook 强制要求每条 assistant message 末尾附加 12-field <self-report> block，用于 AI 自我监督；缺失该 block 会导致消息被阻塞并返回修正模板 [0.90]
- 必须在消息末尾附加完整的 12-field <self-report> block（premature_stopping / permission_seeking / ownership_dodging / simplest_fix / reasoning_loop / known_limitation / skipped_repo_search / fabricated_value / placeholder_used / ambiguity_unresolved / contradiction_unresolved / silent_fallback，全部为 true 或 false），不得缺失、不得为旧版 6-field <laziness-self-report>——项目 Stop hook 强制要求 12-field 格式，缺失该 block 会导致消息被 block 并返回修正模板；12 个字段全部为 false 才算合规，任何 true 都必须附上 signals 列表并触发 block [0.90]
- append complete 12-field <self-report> block before stopping——stop hook enforces 12-field self-report; missing block triggers block decision; all 12 fields must be present with true/false values [0.90]
- 附加完整 12-field <self-report> block（premature_stopping|permission_seeking|ownership_dodging|simplest_fix|reasoning_loop|known_limitation|skipped_repo_search|fabricated_value|placeholder_used|ambiguity_unresolved|contradiction_unresolved|silent_fallback，全部为 true|false）——项目 Stop hook 强制每条 assistant message 末尾包含 12-field <self-report> block；缺失或格式不正确会被 hook 拦截并返回修正模板，延迟交付；这是 AI 与项目协作系统的硬性协议 [0.90]
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
- 先澄清和解释系统逻辑细节，获得用户确认理解后再给建议——用户若不理解系统为何如此，对改动方案缺乏信心；同步理解是决策的前置条件，避免改动后产生新的疑虑 [0.95] [预置]
- 按分阶段流程：通读项目结构 → 识别核心模块 → 追踪关键链路 → 提炼设计思想 → 最后动笔——充分的前期分析能确保文档的准确性、完整性和逻辑清晰，避免仓促写作导致遗漏或误读 [0.95] [预置]
- 遇到用户提出的概念和名词优先到 web 中 search，而非依赖自身记忆——LLM 记忆可能过时或有幻觉，web search 确保信息最新准确，特别是对新术语和概念的理解 [0.95] [预置]
> 还有 25 条 canonical+ 规则因 token 预算未显示（teamagent compile --dry-run 查看）
> 另有 11 条因与已选条目近义（Jaccard ≥ 0.6）被多样性过滤
<!-- TEAMAGENT:END -->
