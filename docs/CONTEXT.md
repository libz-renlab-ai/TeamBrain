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

## Relationships

- 一条 **personal** 规则经 **two gates** 通过后晋升为 **team**；不通过则永停 **L1**
- **Author** 写一条 **team** 规则到 **L2**；**viral sync** 将其经 **git-backed transport** 推到所有 **teammate** 的本地 **L2**
- **Teammate** 接收后由 `.githooks/post-merge` 触发 `m5-sync --apply`，merge 进各自的项目 KB；不影响各自的 **L1**
- **L1 / L2 / L3** 是物理层；**personal / team / global** 是逻辑 scope；前者承载后者，但 L3 永不承载任何非 sandbox scope
- **Cross-machine** 是 **viral sync** 在物理空间上的可观察现象；不是独立机制

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
