```
+-------------------------------------------------------------+
| issue #338 — `ready-for-human` 不许 agent 关 — research      |
|                                                              |
|   label semantics    ──┐                                     |
|   (HOW-TO-CLAIM L47+)  │                                     |
|                        ├──► gap:                             |
|   retroactive ban     ─┤    "agents must never                |
|   (POSTMORTEM #6)      │     gh issue close                  |
|                        │     a ready-for-human"              |
|   close paths matrix  ─┘    is NOT in docs yet               |
|   (FIXEDFLOW.md)                                             |
+-------------------------------------------------------------+
```

# research.md — issue #338

上下文审计 — 给 plan.md 做 docs-context 锚定。本研究只读，不动代码 / docs。

## 1. issue #338 本身

- 标题：`policy: ready-for-human issues must be closed by humans by hand — NEVER ask agents to close`
- labels：`documentation`, `ready-for-human`
- 状态：OPEN（**只允许真人 maintainer 手动 close**，本 issue 是它自己最好的测试用例）
- body 三段：(1) 适用范围（明确列出禁止 agent / bot 调用 `gh issue close`）；(2) 为什么（label 描述 "Needs human judgment / external access / design decision"，连"该不该 close"本身就是 human judgment 事件）；(3) 与 FIXEDFLOW 的关系（与 `grill-ready` 互斥的 dispatch 标签，无自动 dispatcher）。
- "落地建议" 三条：1) 在 `docs/FIXEDFLOW.md` 加一节 "Human-ready issues — never auto-close"；2) 给 stale-issue / cleanup watcher 加白名单；3) 可选 pre-close hook。

`gh issue view 338` 返回 `assignees: []` + comments: `[]` — issue 没人评论 / 无 grill comment / 无 `grill-ready` label。因此 issue **不在 FIXEDFLOW dispatch path 上**——`/fixed-flow-driver` 看到都会 refuse。本工单走「人手 maintainer 直接 land docs」路径（user-driven，不是 driver-driven）。

## 2. 现有 docs 里 `ready-for-human` 的覆盖面

`grep -rn "ready-for-human" docs/ --include="*.md"` 命中 12 条，分布在 5 个文件：

| 文件 | 行 | 现有覆盖 |
|---|---|---|
| `docs/HOW-TO-CLAIM-ISSUE.md` | 47-69 | **label 语义定义**（"需要 maintainer 手动协调"）+ **AI-triage retroactive labeling 禁止**（#146 反例）+ **grill-after triage 例外**（split 当刻贴 label 不算事后追认） |
| `docs/POSTMORTEM.md` | 75, 129 | hard rule #6 "Role bypass 必须引 role-defining doc"；reference 段引 HOW-TO-CLAIM-ISSUE |
| `docs/TRIAGE-AND-SPLIT.md` | 111, 141, 170 | split 当刻贴 `epic` / `ready-for-human` 不违反 retroactive ban；#146 反例引用 |
| `docs/FIXEDFLOW.md` | 108, 116, 184 | epic carve-out §点 1（创建时点贴 `epic` 或 `ready-for-human`）；#146 反例；reference 段引 HOW-TO-CLAIM-ISSUE |
| `docs/plans/2026-05-10-issue-245/report.md` | 65 | report 引用（不算规则） |

**缺口**：没有任何 doc 显式说「带 `ready-for-human` label 的 issue **agent / bot 不许调用 `gh issue close`**」。现有规则只覆盖 (a) label 何时贴、(b) 不许事后补贴；不覆盖 (c) 谁有权 close 一条已带 label 的 issue。

## 3. 与 close 行为相关的现有规则

`grep "gh issue close" docs/`：

- `docs/plans/2026-05-10-issue-273/report.md:56` — driver step 7 历史记载（`gh issue close --comment` 在 PR `Closes #N` auto-close 后报 already-closed，不影响 outcome）
- `docs/plans/2026-05-11-issue-283/report.md:95` — report-only 记录

`docs/FIXEDFLOW.md` 里 driver 行为细则 §boris-workflow 收尾段没有显式提 close issue 的语义。`docs/POSTPR.md` 三步 cleanup 也没有。**现实路径**：driver squash-merge 时 PR body 通常含 `Closes #N` 触发 GitHub auto-close（不是 agent 主动 close）。本 issue #338 想 codify 的是：即使 agent 想主动 `gh issue close`（不通过 PR 关键字），对 `ready-for-human` issue 也禁止。

## 4. 与 FIXEDFLOW 的 dispatch label 关系

issue body 自身已给出关键 mapping：

| Label | Dispatcher | Close 路径 |
|---|---|---|
| `grill-ready` | `/fixed-flow-driver`（maintainer 手动启动） | PR squash-merge `Closes #N` 触发 GitHub auto-close（不是 agent 主动） |
| `ready-for-human` | **没有自动 dispatcher** | **只能真人手动 close** |

互斥关系：如果一条 issue 同时挂 `ready-for-human` 与 `grill-ready` → 先 remove `grill-ready` 再让 driver 介入。**这条互斥约束目前不在任何 docs 里**，需要落地。

## 5. 插入点候选 — `docs/FIXEDFLOW.md`

读完 193 行全文：
- §refusal layer（L139-150）讲 issue-conformance Action 在哪些情况下 close issue（warn 期 + enforce 期），但**完全没提**对 `ready-for-human` issue 的 whitelist。
- §driver 行为细则（L152-161）讲 driver 内部行为，没提 driver 是否会主动 close issue。
- §bypass / escape hatch（L163-172）讲少量 bypass label。
- §与既有规则的关系（L174-185）reference 段。

**最佳插入点 = §refusal layer 之后、§driver 行为细则 之前**（L150-152 之间）。新 section 命名 "Human-ready issues — never auto-close"，覆盖：
1. 规则正文（agent / bot 不许 close `ready-for-human` issue）
2. 与 `grill-ready` 互斥
3. conformance Action whitelist 要求（即 issue body §落地建议 §2）
4. 反向引用 HOW-TO-CLAIM-ISSUE / POSTMORTEM 已有的 label 语义 + retroactive ban，避免重复内容

另外 §与既有规则的关系 段要补一条 reference 行（指向新 section 自身名字 + 引 issue #338 作 anchor）。

## 6. 不在本 PR 里做的事

- **不**实装 stale-issue watcher whitelist（issue body §2 落地建议）— 仓库里没找到现成 stale-issue watcher（`.github/workflows/` 只有 issue-conformance；未发现 stale-bot config）。即使有，watcher 实现属于 code change，不是 docs；超出 "until docs merged" 的边界。docs 里写明 "any future stale-bot must whitelist ready-for-human" 即可。
- **不**实装 pre-close hook（issue body §3）— 同上。
- **不** close issue #338 自身 — 这是 issue 文本明确禁止的（"即使 agent 读到本规则后同意 —— 本 issue 自己也不许被 agent close"）。

## 7. PR 验证策略

走 `docs/feature-verification.md` V1 路径不合适（这是 docs change，没 CLI 命令可探）。改用 `docs/HOWTO-PLAN-PR.md` 推荐的 claudefast probe + 本地 `/review` skill：

1. **本地 `/review` skill PASS**（ADR-0007 authoritative gate）— PR 开之前必跑。
2. **claudefast 语义 probe** — 问 "Can a Claude Code agent close an issue with `ready-for-human` label?" 应返回明确 "NO + 引用新 FIXEDFLOW section"。该 probe 写在 plan.md §judge harness 段。

## 8. 与 user 指令的对齐

user prompt = `work on #338 until docs merged`。映射：
- "work on #338" = land the docs change from §落地建议 §1（FIXEDFLOW section）
- "until docs merged" = PR 必须 squash-merge 才算完成
- **不** close issue #338（issue 文本规则 + meta-rule "ready-for-human" 必须人手 close）

完成定义：PR 状态 = MERGED；issue #338 状态 = 仍 OPEN（等 libz 真人按 close）。
