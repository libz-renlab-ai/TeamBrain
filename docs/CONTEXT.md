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
