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

## Relationships

- 一条 **personal** 规则经 **two gates** 通过后晋升为 **team**；不通过则永停 **L1**
- **Author** 写一条 **team** 规则到 **L2**；**viral sync** 将其经 **git-backed transport** 推到所有 **teammate** 的本地 **L2**
- **Teammate** 接收后由 `.githooks/post-merge` 触发 `m5-sync --apply`，merge 进各自的项目 KB；不影响各自的 **L1**
- **L1 / L2 / L3** 是物理层；**personal / team / global** 是逻辑 scope；前者承载后者，但 L3 永不承载任何非 sandbox scope
- **Cross-machine** 是 **viral sync** 在物理空间上的可观察现象；不是独立机制
- 一条规则同时持有 **Confidence**（自动、连续）和 **Tier**（外部、离散）两条独立轴；前者由 `RuleBasedCalibrator` 自动推进，后者由 **Calibration subagent** 或人类通过 `teamagent set-tier` 推进，**Calibration source** 字段忠实记账谁推的
- **Tier ≥ stable** 是 `pnpm teamagent compile` 写 Skills 的门槛；因此 **Tier** 决定 compile gate，**Confidence** 不直接决定
- **Calibration subagent** 走 git-backed transport / cross-machine **无关** —— 它是 host agent 进程内的本地行为，输出落到 L1 还是 L2 由所改 rule 自身的 scope 决定

## Example dialogue

> **Dev:** "A 在自己 cc 里犯错被纠正，B 怎么收到？"
> **Domain expert:** "A 是 **author**，B 是 **teammate**。A 的纠正先进 A 的 **L1**（**personal**）；通过 **two gates** 后写到 **L2**（**team**）；**viral sync** 自动 commit + push 走 **git-backed transport**；B 端 `git pull` 触发 post-merge hook，规则 merge 进 B 的 **L2**；B 后续 prompt 命中时由 PreToolUse / UserPromptSubmit / Stop 三通道之一拦截。整条链是 **cross-machine** 的，但'cross-machine'本身不是机制名，机制是 **viral sync**。"
>
> **Dev:** "那 A 的 brain 和 B 的 brain 是分开的两个 brain 吗？"
> **Domain expert:** "TeamBrain 没有 per-person brain。每人一份本地项目 KB，里面区分 **personal / team / global** 三种 scope。'A 的 brain'要么指 A 的整个本地 KB（包含 A 的 personal + 已 pull 进来的 team），要么是历史遗物（issue #82 早期措辞），不是 canonical 用法。"

## Flagged ambiguities

- **"group sharing" vs "team sharing"** — issue #82 title 用 group，所有代码 / scope_level 字段 / docs 用 team；解决：team 为 canonical，group 为待替换同义词，issue title 应同步 edit
- **"A 的 brain / B 的 brain"** — issue #82 body 把经验实体化成 per-person brain；解决：no per-person brain，只有项目级 KB + 三种 scope；遇此措辞替换为 "A 的 personal-scope rules" / "A 写入 L2 的规则"
- **"federated"** — gbrain config 用 federated source 指它自己的镜像源；issue #82 body 又用 "gbrain federated source" 暗指 TeamBrain transport；解决：federated 仅指 gbrain；TeamBrain transport 永远叫 git-backed transport
- **"cross-machine sync"（`docs/features/planned/cross-machine-sync.md`）** — 该文件标 Status: PLANNED Phase 4，但 M5 已经 supersede；解决：cross-machine 为现象描述词，不再做新机制名；该文件应在 M5 verify 后归档或改为指向 M5
- **"Calibrator v1 / v2"** — 历史上有两套 Calibrator port + impl 并存（`packages/ports/src/calibrator.ts` + `calibrator-v2.ts`）；v2 引入了 Wilson LB / `Observation` / 自动 Tier 状态机，但 callers 全程 hardcode v1；解决：见 ADR-0004，v2 整套删掉，**RuleBasedCalibrator (=v1)** 是 in-process 唯一 calibrator，仅动 **Confidence**；**Tier** 改由外部写
- **"5-tier vs 6-tier"** — CLAUDE.md「TeamAgent 经验」第 4 条与设计文档曾写 5-tier；实际枚举 6 档（含 `dormant`）；解决：6-tier 为 canonical，文档在 ADR-0004 实现 PR 中对齐
- **"AgenticCalibrator"** — 在 grilling 过程中曾被提出作为 TeamBrain 内部模块名；解决：拒绝；TeamBrain 不内嵌 LLM，agentic 判断由 host 端的 **Calibration subagent** 完成
