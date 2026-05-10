```text
              .teamagent/team/<author>/<rule_id>.json
                                |
                                v
   personal scope ----[viral sync via git]----> team scope
   (L1, never out)                              (L2, project KB)
                                                       |
                                                       v
                                              other teammates' KBs
                                              (cross-machine, post-merge)
```

# TeamBrain Context

TeamBrain 的领域语言总则。术语在代码、CLI scope 字段、`docs/features/team-share.md`、`docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md` 之间保持一致；本文件是冲突时的仲裁源。

## Language

### Scope（一条规则的可见范围）

**personal**:
本地、永不离开本机的 scope；用户产生的所有规则的第一站。
_Avoid_: private, A 的 brain 内容, L1-only

**team**:
经两道闸门后写到项目 git 的 scope，全项目成员可读写。
_Avoid_: group, shared, cross-user, group-shared

**global**:
跨项目、机器全局的 scope，存 `~/.teamagent/global.db`。
_Avoid_: machine-wide, user-wide

### Mechanism（让 team scope 落地的机制）

**Viral sync**:
让 team-scope 规则经 git 自动流通的机制总称（infect / bootstrap / sync / enforcement 四子系统）。
_Avoid_: group sync, federated sync, cross-user sync

**Two gates**:
任一 personal 规则进入 team scope 前必经的两道闸门：硬性密钥扫描 + scope classifier。
_Avoid_: privacy filter, redactor

**Author**:
单条 team-scope 规则的来源人，在 `.teamagent/team/<author>/<rule_id>.json` 即此目录名。
_Avoid_: A, member A, contributor, actor

**Teammate**:
同项目中除 author 外的任一成员；在 viral sync 接收端被规则触发的角色。
_Avoid_: B, member B, consumer, downstream

### Storage layers（物理与逻辑层）

**L1 (personal layer)**:
本机 KB，承接所有用户产生的规则；与 `scope=personal` 一一对应。
_Avoid_: local-only, private store

**L2 (team layer)**:
项目 git 内 `.teamagent/team/` 子树，承接 `scope=team` 的副本。
_Avoid_: shared layer, repo-bound layer

**L3 (sandbox layer)**:
DOGFOOD 等临时实验产物的存放地，永不进 git。
_Avoid_: ephemeral store, tmp store

### Transport & boundaries

**Git-backed transport**:
TeamBrain 唯一的 team-scope 同步通道，复用项目自身的 git remote。
_Avoid_: federated transport, P2P, central server

**Cross-machine**:
描述同一 team scope 的规则跨越物理机器边界这件事；与 viral 正交（viral 描述传播模式，cross-machine 描述边界）。
_Avoid_: cross-instance, cross-laptop, multi-host

**Federated**:
**保留给 gbrain**，描述 gbrain 自身的 mirror / 多源拓扑；TeamBrain rules **不**用此词。
_Avoid_: 在 TeamBrain 上下文中混用 federated 描述任何 team-scope rule transport

### Calibration & tier（一条规则的成熟度与决策来源）

**Confidence**:
单调标量 ∈ [0, 1]，描述「这条规则历史上有多准」。由 `RuleBasedCalibrator`（=旧 v1）在 Stop hook 里根据 events 自动更新；纯函数、无 LLM。**只是一个信号**，不直接决定 compile / enforcement。
_Avoid_: score, accuracy, trust, reliability

**Tier**:
一条规则的 maturity / enforcement / compile gate 等级，6 档枚举：`experimental | probation | stable | canonical | enforced | dormant`。`stable` 及以上才会被 `pnpm teamagent compile` 写进 Skills；`enforced` 是最强档；`dormant` 等同旧 `archived` 状态。**Tier 不由内部 calibrator 自动算**——见 ADR-0004——而是由外部 agent / 人类通过 `teamagent set-tier` 写入。
_Avoid_: status, level, stage, rank, grade, confidence-bucket

**Calibration source**:
审计字段，记录当前 `tier` 是谁设的：`auto-rule`（RuleBasedCalibrator 推出来的提案，目前不写 tier，预留）/ `manual`（人类直接 CLI）/ `subagent`（Claude Code 通过 Agent tool 派出的 subagent 写的）。每次 tier 变化连同 `tier_set_at` 时间戳与 `--reason` 文本一并落库。
_Avoid_: setter, owner, author（与 viral sync 的 Author 撞名）

**Calibration subagent**:
Claude Code 用 Agent tool 派出的、专门做 tier 重判的临时 agent。读 events / 搜 gbrain / 看 repo，最后调 `teamagent set-tier` 写回。**不在 TeamBrain 进程里跑**——TeamBrain 不内嵌 LLM。
_Avoid_: AgenticCalibrator（暗示是 TeamBrain 内部模块、与 ADR-0004 冲突）, AI calibrator, smart calibrator

### Subagents in the verification stack（per `docs/AGENTIC-CODING-POLICY.md` §3 / §1；issue #273）

仓内同时存在三类 Claude Code Agent-tool 派生 / user-level skill 入口，三者都是 host-agent 进程内的 LLM 行为，TeamBrain core 仍 LLM-free（与 ADR-0004 一致）。它们职责正交，不可互相替代。

**Verification subagent**:
`/fixed-flow-driver` skill 在 step 4 `/review loop` 内、每轮 fix commit 之后、`/review` 之前 spawn 的 Claude Code Agent-tool 派生 subagent。读 `git diff HEAD~1` + commit message + grill comment；输出 repro 命令 + pass/fail + 反例输入；写到当前 `docs/plans/<date>-pr-<n>-fix-plan.md` 的 §judge harness 段。**不**进 `packages/core/`，**不**进 `packages/cli/`，**不**直接 `bus.emit({...})`，**不**读 `/review` skill 输出（避免对答案过拟合），**不**修改 repo（read-only 出 repro）。
_Avoid_: blind verification subagent（grill 阶段历史名；canonical 词是 Verification subagent）, attacker subagent（暗示对抗，实际职责是独立验证）, test-writing subagent（与 §2 self-witness ad-hoc 测试禁令冲突）

**Three-subagent triage table**:

| subagent / skill | 调用方 | 输入 | 输出 / 写入 | 调用时机 |
|---|---|---|---|---|
| **Verification subagent** | `/fixed-flow-driver` driver，fix-loop 内 | 当前 diff、最近一次 commit、grill comment | pass/fail + repro 命令，写入 `docs/plans/<date>-pr-<n>-fix-plan.md` §judge harness | 每轮 fix commit 之后，`/review` 之前 |
| **`/review` skill** (gstack, ADR-0007) | `/fixed-flow-driver` driver，POSTPR loop | PR diff、CI 状态 | finding list，driver 据此回写 fix-plan | step 4 fix-loop 入口 |
| **Calibration subagent** (ADR-0004) | Claude Code 主线，Stop hook 后 | TeamBrain events、规则 evidence | `teamagent set-tier` CLI 调用 | rule maturity 重判，**与 verification 链路正交** |

### Module structure（port / adapter 在物理目录上的分布）

**Archived port**:
曾经存在于 `packages/ports/src/` 但因 deletion-test 失败（only one production adapter，且 callers 直接 import 该 adapter 而非走 port type）被搬到 `packages/ports/src/_archived/` 抽屉的 port interface。原文件保留在抽屉内供考古与未来复活，但**不再**从 `packages/ports/src/index.ts` export，**不在** CLAUDE.md「Port 接口冻结于 M0」元约束范围内。复活条件：出现 ≥2 个真实 production adapter，或 contract test 能 meaningfully exercise 一个非平凡的 in-memory fake。详见 ADR-0005。
_Avoid_: deprecated（暗示还能用、即将删；archived 是已经下线）
_Avoid_: legacy port（暗示老但还在跑；archived 不再 export）
_Avoid_: dead code（暗示无用应被 git rm；archived 是有意保留作 design history）

### Integration & shell（hook channel 集成与共享 imperative shell）

**Hook channel**:
Claude Code 与 TeamBrain 的集成通道。M6 时点共 8 个：`PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `Stop` / `PreCompact` / `SessionStart` / `SessionEnd` / `Updater`（per `docs/features/multi-tool.md`）。每个 channel 有独立的 input/output schema、stdout envelope、timeout 约束，且**永远不阻断**——异常一律 exit 0。MCP / Cursor channel 适配 NOT YET。
_Avoid_: hook（无修饰，太泛）, tool integration（不区分 input/output 方向）, SDK channel（与 `@anthropic-ai/claude-agent-sdk` 概念混淆）

**HookShell**:
8 个 Hook channel 共享的 imperative shell module（`packages/cli/src/hook-shell/`）。两层 API：`runHook` 默认层（`bin-post-tool-use` / `bin-pre-tool-use` / `bin-user-prompt-submit` 等不需要 spawn detached / lock 的 channel 用，~30 行 boilerplate）+ `runAdvancedHook` 进阶层（`bin-stop` / `bin-session-end` / `bin-pre-compact` / `bin-session-start` 这种需要 spawn detached self / lock file / pipeline timeout / lazy resources 的 channel 用，opt-in via `escape: { detached?, lock?, pipelineTimeoutMs?, manualResources? }`）。TS conditional type `RequireAtLeastOneEscape` 强制进阶层必须传至少一个 `escape.*` 字段才编译，机械化简单-vs-复杂的 layer 选择。HookShell 持有 `DualLayerStore` / `SqliteEventLog` / `AttributionBus` 三件套的 lifecycle，并自动 wire `StdoutRenderer` 订阅 bus 让 `bus.emit({...})` 自动镜像 stderr per `TEAMAGENT_VISIBILITY`。详见 ADR-0008。
_Avoid_: hook framework（错位的 plugin/middleware 联想）, hook runner（runner 通常暗示长进程，hook 是短进程）, shell（无修饰，太泛）

**Hook handler**:
单个 Hook channel 的 channel-specific 业务函数，运行在 HookShell 的 `handler(ctx)` 槽位。位于 `packages/core/src/hook/`（自 ADR-0008 起；之前的 `createPreToolUseHandler` / `createPostToolUseHandler` 在 `packages/adapters/`，违反 FCIS 元约束）。每个 handler 是纯函数 + 注入 deps（`idGen` / `now` / `formatStyle` 等），通过 `bus.emit({ kind, ... })` 发 user-visible 系统事件，**不**直接 `process.stderr.write`。adapter 端保留 thin wrapper 绑生产 deps 让旧 caller 0 改动。
_Avoid_: handler（无修饰）, hook function（与 React hooks 联想冲突）, hook callback（暗示同步触发链）

**Delivery mode**:
单条 `AttributionEvent` 的「audience + blocking」复合标签，三档枚举：`log | context | block`，加在 `AttributionEventBase` 上 optional 默认 `"log"`。`log` 仅给用户看；`context` 暗示 Claude 应消费此事件作 context（用于 future PostToolUse / UserPromptSubmit exit 2 退码反馈）；`block` 暗示这是阻断性归因（用于 future PreToolUse exit 2 + block 副作用）。**当前是 metadata only**——`HookShell.runHook` / `runAdvancedHook` 始终 exit 0（per ADR-0008 的 "never block harness" 保证），delivery 字段不映射到退码，仅供 Renderer 未来按 delivery 做装饰渲染（如 context 事件加 `[→Claude]` 前缀）+ grep 检索点 + future ADR 在已有字段上扩展退码聚合。详见 ADR-0009。
_Avoid_: severity（描述事件响度 info/highlight/warning，与 delivery 正交，不要混用）
_Avoid_: audience（仅描述谁看不描述阻止；delivery 同时承载两个维度，单字段收窄到 3 种实际有意义组合）
### Bottom-level testing（per ADR-0010；scenario-fixture corpus with α-strict gate）

**Scenario fixture**:
一次 `claudefast -p` 会话的完整录像档案，住 `tests/fixtures/scenarios/<feature-slug>--<scenario-name>/`；含 immutable raw（`transcript.jsonl` + `hooks.raw.log`）+ 派生产物（`events.jsonl` + `expected_decisions.json` + `events/`）+ `db-seed.json` + `audit/`（capture 时 LLM I/O 全程留底）+ `judge.md`。Slug 即 ID 即 grep target；count-type 派生由 ephemeral LLM-generated 脚本一次性产出，仅落 `audit/`，永不进 `packages/*/src/`。
_Avoid_: snapshot, recording, capture, sample（前三者与早期 ad-hoc 录像术语重叠；canonical 词是 scenario fixture）

**Three replay tiers**:
(a) byte-level event diff（毫秒、每 commit、`pnpm test` 也跑）；(b) sequence + DB-state-after diff（秒级、每 PR）；(c) LLM-judge expected-decisions 对照（分钟级、temperature=0、dual-consensus、PR-blocking）。三层走 α-strict gate：任一 FAIL 即阻 PR；唯一逃生口是 `<fixture>/judge-overrides.jsonl` append-only 人审记录。详 ADR-0010。
_Avoid_: layer / level / stage（与 L1/L2/L3 storage layer 撞名；tier 是 canonical 词）；裸 `tier` 也避免——calibration `Tier`（rule maturity 6 档）≠ replay tier（verification 三层），写时用 `replay tier` / `verification tier` 显式区分。

### Install paths（3-path taxonomy；TeamBrain 如何抵达用户机器）

**Path A (`release/install.sh`)**:
end-user 一行 `curl|bash` 安装器；下载 pinned tarball 到 `~/.local/lib/teamagent/`、symlink `~/.local/bin/teamagent`、结束语打印 `Run: teamagent init`（v0.9.4 起**不**自动 init）。
_Avoid_: "the npm path", "production install"

**Path B (`scripts/bootstrap.sh`, post-#155)**:
contributor / from-source 安装路径；cloned repo 内顺跑一行 `bash scripts/bootstrap.sh`，脚本内部串跑 `pnpm install && pnpm build && pnpm teamagent init` 完成 V1=1。脚本本身 NEW (issue #155 创建)；INSTALL.md 4 步保留为 dev fallback appendix（手动分步看输出时用）。git clone 不计入 V1 prompt 数（视为源码获取动作而非安装动作）。
_Avoid_: "the dev install"（撞名 fallback）, "the 4-step install"（指 legacy fallback，不是新 Path B）

**4-step install (legacy)**:
INSTALL.md 内列的 `pnpm install` → `pnpm build` → `pnpm teamagent skeleton-demo` → `pnpm teamagent init`，issue #155 落地后**降级为 dev fallback appendix**。仍可单步跑（dev 想分别看输出时用），但不再是推荐路径；推荐路径 = `bash scripts/bootstrap.sh`。step 1+2 是 pnpm 框架命令（`teamagent` CLI 自身要 step 2 编译完才存在，chicken-and-egg），bootstrap.sh 通过 shell 串行规避此问题。
_Avoid_: "the canonical install" (它已不再 canonical)

**V1 (one-prompt acceptance criterion)**:
issue #155 的 headline 验收度量：Claude Code 的严格权限模式下，装 TeamBrain 的 install 动作只触发 1 次 Bash permission prompt。**Path A 强化版**（`install.sh` auto-init）和 **Path B**（`bootstrap.sh`）都需达成 V1=1。**legacy 4-step** 自然违反 V1（4 prompts），但作为 fallback 不在 V1 度量范围内。git clone 不计入 prompt 数。
_Avoid_: "strict-mode test", "the install prompt count"

**5-section manifest**:
弹窗前必须念给用户听的 5 段固定结构：`[config]` / `[skills]` / `[kb]` / `[download]` / `[refusal]`。canonical 源 = `docs/install-manifest.txt`（仓内单点真理）；`scripts/bootstrap.sh` 运行时 `cat` 它；`release/install.sh` 因为是远程下载脚本必须 embed 同份内容（heredoc）；CI snapshot test 锁三方字节一致（txt vs install.sh embed vs bootstrap.sh cat-target）。INSTALL.md prose 版本可独立行文，但 5 段段名必须出现。
_Avoid_: "the install preview"（preview 是 `--preview` flag 的事，跟 manifest 是两回事）, "the dry-run output", "the section headers"

### Review & PR workflow（开 PR 到 merge 之间的 review 链；ADR-0007 设定 `/review` skill 为权威 gate）

**POSTPR loop**:
开 PR 到 merge approve 之间的 fix loop；终止 gate 是本地 `/review` skill。

**`/review` skill**:
gstack user-level Claude Code skill ("Pre-landing PR review")；ADR-0007 指定为 POSTPR loop 的权威终止 gate。
_Avoid_: "review command", "PR review tool"

**Self-discipline-via-matcher**:
TeamBrain 的偏好 enforcement primitive —— 真文档语义 + M4-B BM25+dense-RRF+soft-AND matcher + `claudefast -p` 探针验证；明确**不**等于 canned-answer regex 锚点或平台分支保护。
_Avoid_: "canned-answer enforcement", "doc hacking", "grep gate"

**Negative-space platform layer**:
有意为之的 GitHub-native review 自动化缺席（无 CODEOWNERS、无 required reviews、无 branch protection）；强制力归 actor 层（agent / hook / CLI / doc-matcher），不归平台层。
_Avoid_: "soft discipline"（错把 deliberate 缺席当成 gap）

**PR-PLAN**:
POSTPR loop 在 open PR 内发现 issue 时写的 plan；三段式（task / expected outputs / third-party judge harness）；走 TEAMWORK 执行；落在 `docs/plans/<date>-pr-<n>-fix-plan.md`。
_Avoid_: "fix plan", "follow-up issue"

### Install manifest sections（issue #155 「一鸭到位」manifest 的 canonical 段名；resolved in grill 2026-05-10）

**`[config]`**:
manifest 第 1 段。描述 install 写到 user-level 的所有配置文件。包含 `~/.claude/settings.json` 中被 teamagent tag 标记的 hook / statusline block + `~/.teamagent/{global.db, manifest.json, sessions/, .warmup-state.json, locks/}` 全部 user-level state。
_Avoid_: hooks（仅一类）, settings（仅一文件）

**`[skills]`**:
manifest 第 2 段。**仅**指 `<project>/.claude/skills/<id>/SKILL.md`（init.ts mirror 的 project-level skill 集合：`canary` / `design-html` / `design-shotgun` / `office-hours` / `plan-ceo-review` + `claim-to-merge`）。**user-level `~/.claude/skills/teamagent/<id>/SKILL.md`** 是 compile 的衍生输出，由 `[kb]` 源数据 派生，**不**单独在 manifest 列出。
_Avoid_: 把 user-level compile 输出写进 [skills]（会让 manifest 跟 install 实际行为不一致）

**`[kb]`**:
manifest 第 3 段。描述 install 写到 project-level 知识库的全部文件。包含 `<project>/.teamagent/{knowledge.db, manifest.json, team/<author>/<rule_id>.json, locks/}` —— M5 viral sync 写到项目内的全部内容。
_Avoid_: 仅 knowledge.db（会漏 manifest.json + team/ + locks/）, seed-packs（那是源数据，不是 install 产物）

**`permission prompt`**:
V1 指标「install 全程恰好 1 次授权」计数的对象。仅指 Claude Code 在 PreToolUse hook 返回 `permissionDecision: "ask"` 时拉起的侧边 UI 弹窗。**不**含 OS 层 sudo / `release/install.sh` 自己的 `y/N` / TeamAgent 自身的 confirm dialog。
_Avoid_: prompt（与 LLM prompt 撞名）, confirmation（语义太宽）, dialog（语义太宽）

## Relationships

- 一条 **personal** 规则经 **two gates** 通过后晋升为 **team**；不通过则永停 **L1**
- **Author** 写一条 **team** 规则到 **L2**；**viral sync** 将其经 **git-backed transport** 推到所有 **teammate** 的本地 **L2**
- **Teammate** 接收后由 `.githooks/post-merge` 触发 `m5-sync --apply`，merge 进各自的项目 KB；不影响各自的 **L1**
- **L1 / L2 / L3** 是物理层；**personal / team / global** 是逻辑 scope；前者承载后者，但 L3 永不承载任何非 sandbox scope
- **Cross-machine** 是 **viral sync** 在物理空间上的可观察现象；不是独立机制
- 一条规则同时持有 **Confidence**（自动、连续）和 **Tier**（外部、离散）两条独立轴；前者由 `RuleBasedCalibrator` 自动推进，后者由 **Calibration subagent** 或人类通过 `teamagent set-tier` 推进，**Calibration source** 字段忠实记账谁推的
- **Tier ≥ stable** 是 `pnpm teamagent compile` 写 Skills 的门槛；因此 **Tier** 决定 compile gate，**Confidence** 不直接决定
- **Calibration subagent** 走 git-backed transport / cross-machine **无关** —— 它是 host agent 进程内的本地行为，输出落到 L1 还是 L2 由所改 rule 自身的 scope 决定
- 每个 **Hook channel** 的 imperative shell 都走 **HookShell** 的两层 API；channel-specific 业务在 **Hook handler** 内（住 core，纯函数）；user-visible 副作用全部通过 `ctx.bus.emit` 走 **AttributionBus** + StdoutRenderer，禁止 `process.stderr.write`（per ADR-0008 + lint rule `scripts/check-bin-stderr.sh`）
- 每条 **AttributionEvent** 携带可选 **Delivery mode** 标签描述意图；当前 **HookShell** 始终 exit 0 不读此字段，但 **Renderer** 可读它做 future 装饰；该字段是 audience+blocking 维度的 architectural future-proof（详见 ADR-0009）
- **POSTPR loop** 终止 = **`/review` skill** PASS + CI green + 无 merge 冲突（ADR-0007）
- **PR-PLAN** 在 **POSTPR loop** 命中 issue 时写；走 **TEAMWORK** 执行；不允许 follow-up issue 替代
- **Path A** issue #155 落地后 = `install.sh` 末尾 auto-run `teamagent init`，curl|bash 单一 Bash 调用 ⇒ V1=1（end-user / AI 入口）
- **Path B** issue #155 落地后 = `bash scripts/bootstrap.sh` 串跑 `pnpm install && pnpm build && pnpm teamagent init` ⇒ V1=1（contributor 源码入口）
- **legacy 4-step install** 仍存在于 `INSTALL.md` 作 dev fallback appendix（dev 想分别看输出时手动跑），不在 V1 度量范围内
- `release/install.sh` 走 binary tarball；`scripts/bootstrap.sh` 走 source 编译；两个入口都需要 issue #155 grill 出来的 5-section manifest + **重入幂等** (idempotency) 行为
- **不引入 resume notebook**——install 全程靠底层工具天然幂等：`tar -xzf` 覆盖、`ln -sf` 替换、`pnpm` 缓存与续传、`curl -C -` 断点续传、`teamagent init` 子步骤"已注册则跳过"。CEO 鸭 decision 3 "断了能续" 通过幂等达成，不靠应用层小本本。详见 ADR-0011 (accepted)。
- **Self-discipline-via-matcher** 是 enforcement primitive；**Negative-space platform layer** 是它在 GitHub 层的可观察后果，不是独立机制
- **`/review` skill** 与 **Calibration subagent** 都是 host-agent 进程内 LLM 行为；TeamBrain core 仍然 LLM-free（与 ADR-0004 一致）

## Example dialogue

> **Dev:** "A 在自己 cc 里犯错被纠正，B 怎么收到？"
> **Domain expert:** "A 是 **author**，B 是 **teammate**。A 的纠正先进 A 的 **L1**（**personal**）；通过 **two gates** 后写到 **L2**（**team**）；**viral sync** 自动 commit + push 走 **git-backed transport**；B 端 `git pull` 触发 post-merge hook，规则 merge 进 B 的 **L2**；B 后续 prompt 命中时由 PreToolUse / UserPromptSubmit / Stop 三通道之一拦截。整条链是 **cross-machine** 的，但'cross-machine'本身不是机制名，机制是 **viral sync**。"
>
> **Dev:** "那 A 的 brain 和 B 的 brain 是分开的两个 brain 吗？"
> **Domain expert:** "TeamBrain 没有 per-person brain。每人一份本地项目 KB，里面区分 **personal / team / global** 三种 scope。'A 的 brain'要么指 A 的整个本地 KB（包含 A 的 personal + 已 pull 进来的 team），要么是历史遗物（issue #82 早期措辞），不是 canonical 用法。"
>
> **CEO duck:** "PR 一开就 review 然后修，这就是 **POSTPR loop** 吧？"
> **Domain expert:** "对。当前 **POSTPR loop** 的权威 reviewer 是 **`/review` skill**（ADR-0007）。"
>
> **CEO duck:** "GitHub 没 required review，那纪律怎么落地？"
> **Domain expert:** "靠 **self-discipline-via-matcher** —— 真文档 + BM25 matcher + `claudefast -p` 探针自洽。GitHub 没 gate 是 **negative-space platform layer**，是 deliberate design choice，不是 bug。"

## Flagged ambiguities

- **"group sharing" vs "team sharing"** — issue #82 title 用 group，所有代码 / scope_level 字段 / docs 用 team；解决：team 为 canonical，group 为待替换同义词，issue title 应同步 edit
- **"A 的 brain / B 的 brain"** — issue #82 body 把经验实体化成 per-person brain；解决：no per-person brain，只有项目级 KB + 三种 scope；遇此措辞替换为 "A 的 personal-scope rules" / "A 写入 L2 的规则"
- **"federated"** — gbrain config 用 federated source 指它自己的镜像源；issue #82 body 又用 "gbrain federated source" 暗指 TeamBrain transport；解决：federated 仅指 gbrain；TeamBrain transport 永远叫 git-backed transport
- **"cross-machine sync"（`docs/features/planned/cross-machine-sync.md`）** — 该文件标 Status: PLANNED Phase 4，但 M5 已经 supersede；解决：cross-machine 为现象描述词，不再做新机制名；该文件应在 M5 verify 后归档或改为指向 M5
- **"Calibrator v1 / v2"** — 历史上有两套 Calibrator port + impl 并存（`packages/ports/src/calibrator.ts` + `calibrator-v2.ts`）；v2 引入了 Wilson LB / `Observation` / 自动 Tier 状态机，但 callers 全程 hardcode v1；解决：见 ADR-0004，v2 整套删掉，**RuleBasedCalibrator (=v1)** 是 in-process 唯一 calibrator，仅动 **Confidence**；**Tier** 改由外部写
- **"5-tier vs 6-tier"** — CLAUDE.md「TeamAgent 经验」第 4 条与设计文档曾写 5-tier；实际枚举 6 档（含 `dormant`）；解决：6-tier 为 canonical，文档在 ADR-0004 实现 PR 中对齐
- **"AgenticCalibrator"** — 在 grilling 过程中曾被提出作为 TeamBrain 内部模块名；解决：拒绝；TeamBrain 不内嵌 LLM，agentic 判断由 host 端的 **Calibration subagent** 完成
- **"5 handler factories" vs "2 handler factories"** — ADR-0008 + 早期 plan.md 假设 5 个 hook handler factory 要从 adapters 搬到 core；实际 inventory 只有 2 个（`pre-tool-use-sdk.ts` + `post-tool-use-sdk.ts`）。其他 hook channel（user-prompt-submit / stop / session-* / pre-compact / updater）已经直接以 `bin-*.ts` 形态在 `packages/cli/src/`，没有 `createXxxHandler(deps)` factory 模式可搬。**实际 sweep = 2 个 factory**，per commit 2 (PreToolUse) + commit 3 (PostToolUse)
- **"audience vs delivery" / "exit 2 vs metadata"** — 候选 2 grilling (2026-05-08) 中曾考虑给 `AttributionEvent` 加 `audience: "user" | "claude" | "both"` + `blocking: bool` 两个独立字段，并让 delivery=context/block 触发 hook 退 2 让 Claude 拿 stderr 当 context；解决：单字段 `delivery: "log" | "context" | "block"` 收窄到 3 种实际有意义组合，且 α2 决议保留 ADR-0008 的 always-exit-0 保证——delivery 当前是 metadata 字段不映射退码；详见 ADR-0009
- **"review"** — ADR-0007 之后 bare "review" 默认指 **`/review` skill**（本地 gate）；引用历史 cloud-reviewer 流程时请直接指 ADR-0007
- **"纪律软 / soft discipline"** — CEO-mode summary 用语，描述 GitHub 层缺自动化；解决：这是 **negative-space platform layer**（deliberate），不是 discipline gap；CEO 文案此后须改用后者
- **"PR-PLAN scope"** — `docs/PR-PLAN.md` 当前 scope 是 post-PR；grilling 中有用户把 issue → PR-PLAN 视为 pre-PR 流程；解决：post-PR 为 canonical；pre-PR plans 走 `docs/HOWTO-PLAN-PR.md`，未来若要扩 PR-PLAN 到 pre-PR 须独立 ADR
- **"vector model 默认是否安装"** — issue #155 (2026-05-08) 写在 PR #227 (issue #164, MERGED 2026-05-09) **之前**，那时 vector deps 是 opt-in (`TEAMAGENT_INCLUDE_OPTIONAL=1`)；PR #227 之后 vector deps 进 `packages/teamagent/dependencies` default-installed + 加 embedder daemon；ADR-0001 已被 PR #227 同步更新 (Revised: 2026-05-09)。本 worktree (worktree-146) 在 b112b7e 落后于 main，本地 ADR-0001 文件仍是旧版，**别误判为 drift**。**Resolution**: 实施 issue #155 各 order 前必须 rebase/pull main 获取 ADR-0001 v2 + 新 deps；`--skip-vector-model` (Order 3) 在 v2 truth 下是从默认 opt-out，语义自洽
- **"4-step install vs 4 sub-steps of init"** — issue #155 body 与多份 order plan 在 "4" 是 Path B 的 4 条 pnpm 命令、还是 `teamagent init` 内部的 4 个子步骤之间摇摆。**Resolution**: canonical "**4-step install**" = Path B 的 pnpm 4 步；init 内部的子步骤不另起数字
- **"strict permission mode"** — issue #155 body 暗示这是 TeamBrain 可调的安装行为模式；实际是 **Claude Code 自己的 permission mode**，TeamBrain 完全无法影响。**Resolution**: 任何文档讨论 prompt 数时显式标 "Claude Code 的严格权限模式"，不简写
- **"resume notebook (续命小本本)"** — Order 2 plan 设计了一个 `packages/core/src/install-state/` 模块作 per-project resume 状态机；CEO 鸭 decision 3 "断了能续" 也暗示需要这种小本本。grill 阶段发现 install 全程都已天然幂等 (tar/ln -sf/pnpm 缓存/curl -C -/init 步骤 skip-if-exists)，专门写小本本属过度设计。**Resolution**: 取消 Order 2，靠幂等达成 V3 验收；如未来出现非幂等步骤再回头加，独立 ADR 决议

## Testing channels

新增（ADR-0013，2026-05-10）。

**Inner-loop testing**:
工作进行中的全量测试套件运行通道；由 `wip/**` 分支推送触发 `.github/workflows/inner-loop.yml` 执行 `pnpm test` + `pnpm verify`。
_Avoid_: developer-loop testing、quick-test、`pnpm test` 本地直跑（后者已被 ADR-0013 禁掉）

**wip 分支**:
临时分支命名空间 `wip/<topic>`，用于 inner-loop CI 触发；非 PR 分支，PR merge 后即可删除。
_Avoid_: feature branch、scratch branch、dev branch（这些都是更宽语义）

**Single-file targeted exception**:
inner-loop testing 规则的本地例外：单文件运行（`pnpm vitest run path/to/x.test.ts` 或 `--testNamePattern` 过滤）允许本地，因 vitest 只起 1 worker 不进 scheduler-overload 区。
_Avoid_: dev-mode test、quick local test、targeted vitest（无主语易混 PR-gate）

**Scheduler-overload**:
N 个并发 session 各自跑全套测试时 OS scheduler 队列饱和的现象；表现为 loadavg 飙升（>200）但 CPU 使用率不高（<20%），用户体感为"机器太热"但 thermal level 仍 "normal"。`toohot` 命令观测到的根因；不是 thermal throttle。
_Avoid_: thermal throttle、CPU contention、heat（这三个都是症状层；机制层 canonical 是 scheduler-overload）
