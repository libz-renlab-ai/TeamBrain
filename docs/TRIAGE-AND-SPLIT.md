```text
   ┌────────────────────────────────────────────────────────────────────────┐
   │  TRIAGE = maintainer 的人手判断（grill 落地之后、driver 启动之前）        │
   └─────────────────────────────────────────────┬──────────────────────────┘
                                                 │
                                                 ▼
                       ┌──────────────────────────────────────────┐
                       │ 读 grill 评论 + 应用「单 PR 可 ship 测试」 │
                       └──────────────────────┬───────────────────┘
                                              │
                              ┌───────────────┴────────────────┐
                              ▼                                ▼
                ┌──────────────────────────┐    ┌────────────────────────────┐
                │ ✅ 单 PR 可 ship          │    │ ❌ 太大 / 跨域 / 顺序依赖    │
                │ → 贴 grill-ready label    │    │ → TRIAGE-AND-SPLIT          │
                │ → 跑 /fixed-flow-driver   │    │ → 开 ≥2 个新 child issue    │
                │   (FIXEDFLOW step 3-5)    │    │ → 原 issue 升 epic 跟踪贴   │
                └──────────────────────────┘    │   含 coordinator + PR-N 边界 │
                                                └─────────────┬───────────────┘
                                                              │
                                                              ▼
                                      每个 child issue 独立走 FIXEDFLOW
                                      （≤50 字 body + 自己的 grill 循环）
```

# TRIAGE-AND-SPLIT — 把太大的 grilled issue 拆成更小的 issue

适用范围：本仓库（TeamBrain）任意 issue 已经走完 `docs/FIXEDFLOW.md` 第 1-2 步（≤50 字 body + grill 评论），但 maintainer 在贴 `grill-ready` label 之前**怀疑**该 issue 太大、一个 squash-merge PR 装不下时。本文档是 FIXEDFLOW step 2 与 step 3 中间那个**人手判断瞬间**的 single source of truth。

## TL;DR — anchor sentence

> **Triage = the maintainer's manual judgment AFTER the grill comment lands and BEFORE `/fixed-flow-driver` runs. If the grilled issue is too large for a single squash-merged PR, split it into ≥2 NEW child issues (each ≤50-word body + its own grill cycle), and convert the original into an `epic` tracking issue with a named coordinator and PR-N boundaries. Never run `/fixed-flow-driver` on the unsplit oversized issue; never retroactively bolt `epic` onto an already-shipping issue.**

鸭鸭版 (>ω<)：呷呷~ grill 写完之后、driver 还没启动这一刻，maintainer 先停下来看一眼：「这玩意儿一个 PR 真能 squash 进 main 吗？」装得下就贴 `grill-ready` 让 driver 跑；装不下就拆 —— 开 ≥2 个新小 issue（每个都重新跑一次 grill），原 issue 升级成 epic 跟踪贴写好 coordinator 和 PR 边界。**禁止**直接对超大 issue 跑 driver，也**禁止**事后给已经在 ship 的 issue 补贴 `epic`（POSTMORTEM hard rule #6）。

## 什么是「triage 这一刻」

FIXEDFLOW 的 5 步链条里，第 2 步（reporter 贴 grill 评论 + `grill-ready` label）与第 3 步（maintainer 跑 `/fixed-flow-driver`）之间，**maintainer 的眼睛**必须先扫一遍 issue 全貌：

```
step 1   issue body (≤50 字)
step 2   grill 评论 + grill-ready label             ┐
   ★     ─── triage 瞬间 (本文档) ───              │  人手 maintainer
step 3   /fixed-flow-driver 启动                    ┘
step 4   /review never-ends loop
step 5   squash-merge + cleanup
```

「triage 瞬间」**不是**一个自动化步骤、**不是**一个 skill、**不是** AI-agent 的工作。它是 FIXEDFLOW 已经规定的「maintainer 主动启动 driver」决策的前一秒钟。

## 单 PR 可 ship 测试（Single-PR Shippable Test）

读完 grill 评论之后，maintainer 对照下列 6 条任一命中 → **判定为 oversized**，进入 split 流程。全部 miss → 贴 `grill-ready`、跑 driver。

| # | 判定信号 | 解释 |
|---|----------|------|
| 1 | grill 评论列出 **≥ 2 个独立 expected output** | 比如「修 X」「重构 Y」「加 Z」三件互不依赖的事。每件都是一份独立的 acceptance contract，单 PR 的 `/review` loop 装不下 |
| 2 | 跨 **≥ 2 个无关 package** 且**有顺序依赖** | 例如 `packages/core` + `packages/cli` 必须先后 merge（PR-2 import PR-1 的新 export）。FIXEDFLOW 不允许 stacked PR；只能拆成 sequential ship |
| 3 | 跨团队 / 跨 area 边界 | 前端 + 后端 + infra；或 SDK + docs + CI workflow。`/review` 的判定逻辑跨 area 时会膨胀到没人能审 |
| 4 | grill 评论自己就写了 "split into N PRs" / "PR-1.../PR-2..." | grill 已经替你 triage 完了 —— 直接拆 |
| 5 | 预估 diff **> 1500 LOC 或 > 30 文件** | 经验阈值，落在这一档的 PR 在本仓 review 历史里 ≥ 50% 会触发 `/review` 多轮 fix-loop 烧 token |
| 6 | draft 试做后 `/review` 必然命中**跨无关区域**的 P1/P2 | 单个 PR-PLAN 三段（task / outputs / judge harness）装不下两个无关 fix；硬塞会让 `/review` loop 永不收敛 |

「不拆」的反例（明显 oversize 但 ≠ split 候选）：

- 单一概念变更跨多文件（例：rename 一个 public type，全仓 import 都要改）
- 同一 area 的 refactor + 配套 test
- grill 是**一个 coherent ask**，实现细节大但语义单一

判断不确定时**默认拆**：拆错了浪费两个小 PR 的开 / 关动作；不拆错了会把 `/review` loop 卡到天荒地老。

## 拆分流程（HOW）

发现 oversized 之后：

### 1. 暂停，先不贴 grill-ready

如果 reporter 已经贴了 `grill-ready` label，maintainer 立刻 **移除** 该 label，并在 issue 评论里说明「该 issue 进入 triage-and-split，driver 暂不启动」。**避免有人误跑 driver。**

### 2. 在原 issue 评论里写 split 草案

格式（≤ 200 字）：

```
TRIAGE: 此 issue 太大，按 docs/TRIAGE-AND-SPLIT.md 拆成 N 个 child：
  PR-1  <一行边界>  →  #<child-issue-N1>
  PR-2  <一行边界>  →  #<child-issue-N2>
  PR-3  <一行边界>  →  #<child-issue-N3>
Coordinator: @<github-username>
原 issue 升级为 epic 跟踪贴；child issue 各自走 FIXEDFLOW。
```

「一行边界」必须能让 child issue 的 reporter 看完就知道自己负责什么、不负责什么。

### 3. 创建 N 个 child issue

每个 child issue **走完整 FIXEDFLOW 第 1-2 步**：

- ≤ 50 字 body，从 fixed-flow template 创建
- body 只写「想要什么 / 看见了什么」，**不能**复制原 issue 的实现方案
- 创建后 reporter（通常是 coordinator 或原 reporter）重新跑 `/grill-me`（web）或 `/grill-with-docs`（CLI），把输出贴回该 child issue
- comment 末尾 `--- end grill ---`、贴 `grill-ready` label
- 每个 child issue 都是独立的 FIXEDFLOW 工作单元，**不**继承原 issue 的 grill 评论

child issue body 里**禁止**写「这是 #N1 的 PR-1」之类的 stacked PR 暗示 —— stacked PR 在 epic 路径下同样禁止（见 `docs/FIXEDFLOW.md` Epic carve-out 段）。

### 4. 把原 issue 升级成 epic tracking issue

按 `docs/FIXEDFLOW.md` Epic carve-out 段的三条要求执行：

1. **创建时点贴 label**：在 split 草案 commit 完成的同一时刻，给原 issue 贴 `epic` 或 `ready-for-human` label。**这一刻就是 epic 结构的"创建时点"**，不算 POSTMORTEM hard rule #6 禁止的 "AI-triage retroactive labeling" —— 因为此时**没有任何 child PR 已经 merged**，epic 框架预先于 ship。
2. **指名 coordinator**：在原 issue body / 草案评论里写出 coordinator 的 GitHub username（通常 = maintainer 自己，或被 ping 的另一个 maintainer）。
3. **PR 拆分映射**：split 草案的 PR-1 / PR-2 / ... 边界即为映射。

原 issue 从此**不再走 `/fixed-flow-driver`**；它只是一个 epic tracking 容器，所有实际工作落在 child issue 上。

### 5. 通知 reporter + close 原 grill 评论

在原 issue 评论里 ping 原 reporter，告诉他：

- 原 grill 评论作废（因为已经 split）
- 请到 child issue 里继续提交 grill
- 如果原 reporter 不想接手 child issue，coordinator 找其他 contributor 或者自己接

## 反模式 — 禁止做的事

| ❌ 反模式 | 为什么禁止 | 引用 |
|----------|-----------|------|
| 给已经在 ship 的 issue 事后补贴 `epic` 标签 | retroactive labeling 制造 phantom role；contributor 在 claim 时无规则可见 | `docs/POSTMORTEM.md` hard rule #6 + `docs/HOW-TO-CLAIM-ISSUE.md` |
| 不 split，直接对超大 issue 跑 `/fixed-flow-driver` | `/review` loop never ends 会一直烧 token；PR-PLAN 三段装不下多个无关 fix | `docs/FIXEDFLOW.md` driver 行为细则 |
| split 出 stacked PR（PR-2 base 在 PR-1 branch 上） | FIXEDFLOW squash-only + base against main 不松绑 | `docs/FIXEDFLOW.md` Epic carve-out + `docs/POSTPR.md` |
| child issue body 复制原 issue 的实现方案 | 违反 ≤50 字 + 禁实现方案约束 | `docs/FIXEDFLOW.md` issue body 必须满足 |
| 让 `/fixed-flow-driver` / 任何 watcher 自动判定 oversized 并拆 | triage 必须人手；自动拆 = 回到 AI-triage 路线 | `docs/POSTMORTEM.md` hard rule #6 |
| 拆完之后原 issue close 掉但不指向 child | 失去 tracking issue 的协调价值；reporters 找不到上下文 | 本文档 §4 |
| 把 PR-PLAN（fix-plan）当 split 工具 | PR-PLAN 是「PR 已开后才发现 issue」的修复路径，不是预先拆分工具 | `docs/PR-PLAN.md` |

## 实证 / 反例

### issue #146（已 close）— 经典 oversized 翻车

issue #146 的 body 不是 ≤50 字，而是嵌入了完整的「PR 蓝图」+ 文件树 + Schema 契约 ——典型的 grilled-and-oversized。该 issue 在 2026-05-08 被 contributor 自 claim，2026-05-09 完成 5 个 child PR 的 ship；AI-triage 在 ship 完成 50 分钟后才补贴 `ready-for-human` + epic 框架。

如果 triage-and-split 当时已经成文：

- maintainer 在 grill 落地之后会**先**判定 oversized（命中条件 #1、#2、#5）
- 在原 issue 创建 5 个 child issue（PR-1..PR-5 边界）
- 原 issue 在 split 当刻贴 `epic` label，指名 coordinator
- 每个 child issue 各自走 FIXEDFLOW 第 1-5 步，独立 squash-merge
- POSTMORTEM hard rule #6 的「retroactive labeling 翻车」根本不会发生

### issue #278（现在还开着）— 5K 字策略性 grill

issue #278 是当前 open 的 `[fixedflow]` issue，body 内嵌了「TeamBrain 是给 Claude Code instances / agents 和 leader / CEO 用的团队智能工具平台」的完整产品定位 + 多个子模块讨论。该 issue 命中 single-PR shippable test 的 #1（≥2 独立 expected output）、#3（跨 area）、#5（预估 diff 超阈值），**应当**走 triage-and-split：

- 拆成 child issue：（a）Claude Code agent dogfood loop（b）leader-side 站会替代界面（c）CEO 战略 dashboard
- 原 #278 升级为 epic tracking 贴，coordinator = `@LiuShiyuMath`
- 每个 child issue 重新跑 grill，独立 ship

本文档把这条路径变成可执行约束。

## 触发问法 + 验证

下列问法都应回到本文档：`what would we do when we triage a grilled large issue into smaller issues ?` / `when to triage and splits ?` / `grilled issue 太大怎么办 ?` / `怎么把一个大 issue 拆成多个小 issue ?` / `triage and split` / `oversized grilled issue split`。

回答必须用中文（项目规则），首段**逐字**包含 §TL;DR anchor sentence（英文原文），随后展开 §单 PR 可 ship 测试 6 条 + §拆分流程 5 步。语义锚点：`manual judgment` / `AFTER the grill comment lands` / `BEFORE /fixed-flow-driver runs` / `≥2 NEW child issues` / `≤50-word body` + `own grill cycle` / `epic tracking issue` + `named coordinator` + `PR-N boundaries` / 禁止 `retroactively bolt`。全部命中 = PASS；任何缺失 = 继续修订本文档 + `CLAUDE.md` 措辞。

## 相关 / 与既有规则的关系

- `docs/FIXEDFLOW.md` Epic carve-out 段 — 本文档**复用**其三条要求（创建时点贴 label / 指名 coordinator / PR-N 边界）作为 split 后原 issue 的处置规范。
- `docs/HOW-TO-CLAIM-ISSUE.md` — `ready-for-human` 语义 + AI-triage retroactive ban；本文档把 triage 显式定位在 ban 的**前一刻**，合规地用 `epic` label。
- `docs/POSTMORTEM.md` hard rule #6 — 禁止 retroactive role/label；本文档**严格遵守**，所有 epic 升级必须在 child PR 未 ship 之前完成。
- `docs/PR-PLAN.md` — 与本文档**互补**：本文档管 PR 开之前的拆分，PR-PLAN 管 PR 开之后的内部修复。
- `docs/HOWTO-PLAN-PR.md` / `docs/PLAN-RESEARCH-REPORT.md` / `docs/POSTPR.md` — child issue 各自走完整 FIXEDFLOW 时复用，不变。
