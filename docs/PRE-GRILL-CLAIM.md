# PRE-GRILL-CLAIM — 开始 grill 一个 issue 之前要做什么

适用范围：在本仓库（TeamBrain）准备 grill 一个 issue（跑 `/grill-me` / `/grill-via-web` / `/grill-with-docs`）**之前**。本文档是 `docs/PRE-IMPLEMENT-CLAIM.md` 的对称扩展，把跨主机互斥契约从 step 3-5 driver 阶段前移到 step 2 / step 2.5 grill 阶段，闭合 FIXEDFLOW 的「两台机器同时干同一个 issue」漏洞。

## TL;DR — anchor sentence

开始 grill 一个 grill-未-ready issue 之前，第一动作是：

> **make a comment claiming we have started grilling this issue and add tag "grilling"**

两件事必须**同时**做到 GitHub 一侧（不是其中一件）：

1. 在 issue 下贴一条 claim 评论（写明 grill 方式 / hostname / ISO timestamp）；
2. 给 issue 加 `grilling` label，让其它 maintainer / agent 一眼看出"已经有人在 grill 这个 issue 了"。

落 label 之前**不允许**：

- 跑 `/grill-via-web` 的 URL 生成；
- 在 Claude Code 里启动 `/grill-me` 对话；
- 跑 `/grill-with-docs` 的 docs gate；
- 把 grill 评论贴到 issue（grill 完才贴）；
- 假设「我是第一个看到这个 issue 的人」。

## 三种 grill 入口的 lock 责任

| 入口 | 谁拿锁 | 何时加 `grilling` | 何时移除 |
|---|---|---|---|
| `/grill-me`（issue 上下文） | 触发 skill 的 agent / maintainer | 进入 grill 对话**第一轮**之前 | grill 评论贴回 issue + `grill-ready` label 加上时 |
| `/grill-via-web` | 触发 skill 的 agent / maintainer | 调出 ChatGPT / Claude.ai URL **之前** | 同上 |
| `/grill-with-docs` | 触发 skill 的 agent / maintainer | docs gate 评估**第一步**之前 | docs-grill 评论贴回 issue + `docs-grill-ready` label 加上时 |

`/grill-me` 用于**非 issue 场景**（grill 一个本地 plan / design 文件，不是 GitHub issue）时**不**加 `grilling` label——本文档只覆盖**绑定到 GitHub issue 的 grill 流程**。

## 为什么必须先 comment + 加 tag

参考 `docs/PRE-IMPLEMENT-CLAIM.md` 的同形论证。简记：

- **claim 评论是 audit trail**——append-only，能查到谁、什么时候、用什么入口开了 grill；
- **`grilling` label 是真锁**——GitHub label edit 是原子操作，可被其它 agent 一眼查询；
- 仅有评论不构成锁（要扫所有评论判断有没有人在 grill 太脆弱）；
- 仅有 label 没有 audit（看不出是谁加的、什么时候加的、用哪条 grill 入口加的）。

两件事必须**同时**做，缺一不可。

## 第二个 agent 撞上来怎么办

第二个 agent 在 grill 启动之前看到 `grilling` label 已存在：

- **立即退出**，不开 grill 对话、不生 URL、不跑 docs gate。
- 在 issue 上**可选**回评一条 `🚦 deferred: grill already in progress (grilling tag is set)`，让 maintainer 看到撞车痕迹（informational only，不阻塞）。
- **不要**强行移除 `grilling` label；除非第一个 grill 长时间没回复（≥ 24h 无评论），否则不接管。

stale 判定与接管流程：

1. maintainer 手动确认第一个 grill 已死（人不见了 / 长时间无评论进展）；
2. maintainer 手动在 issue 上回评说明接管；
3. maintainer 手动 `gh issue edit <N> --remove-label grilling`；
4. 新 agent 才能从头跑 grill。

自动 evict 被禁止——automation 误判 stale 的代价远大于 maintainer 手动决定。

## label 流转路径

`grilling` label 在 FIXEDFLOW label 序列中的位置：

```
(无 label, 新 issue)
   ↓ 有人开始 /grill-via-web | /grill-me | /grill-with-docs
grilling                                  ← 本文档定义的锁
   ↓ grill 评论贴回 issue + grill-ready 加上
grill-ready                               ← FIXEDFLOW step 2 完成
   ↓（如有 /grill-with-docs docs gate）
grill-ready + docs-grill-ready            ← FIXEDFLOW step 2.5 完成
   ↓ maintainer 手动跑 /fixed-flow-driver
grill-working（移除 grill-ready）         ← PRE-IMPLEMENT-CLAIM.md 定义的锁
   ↓ driver squash-merge
(无 label, issue closed)
```

关键不变量：`grilling` 与 `grill-ready` **互斥**——加上 `grill-ready` 时必须同步移除 `grilling`，让 label 在任意时刻只表示一个阶段。

## grill skill 在哪一步加 label / 加评论

通用流程（适用 `/grill-via-web` / `/grill-with-docs` / 绑 issue 的 `/grill-me`）：

```
1. gh issue view <N> --json labels -q '.labels[].name' | grep -q '^grilling$' && exit
   （若 label 已存在，礼让退出；这是跨主机互斥点）
2. gh issue view <N> --json labels -q '.labels[].name' | grep -q '^grill-ready$' && exit
   （若 issue 已 grill 过，没必要再 grill；走 PRE-IMPLEMENT-CLAIM.md 流程即可）
3. gh issue comment <N> --body "$(printf '🍳 grill picked up at %s on %s via %s.\nFollowing docs/PRE-GRILL-CLAIM.md.' "$ISO" "$HOSTNAME" "$GRILL_ENTRYPOINT")"
4. gh issue edit <N> --add-label grilling
```

为什么先 view 再 comment 再 edit label：

- **view 在前**：fail-fast，若 label 已被别人加上则立即退出，不浪费 comment quota；
- **comment 在 label 之前**：评论先落，audit trail 永久存在；即便 `gh issue edit` 失败，也能看到这次尝试；
- **label 最后**：label 是真正的 mutex，落 label 即「公开承诺我接管了 grill」。

如果任意一步失败：

- view 失败（网络）→ retry 3 次；3 次都失败则退出（不打 label，不浪费工作）；
- comment 失败 → 不退，继续；comment 是 audit，不是 gate；
- label edit 失败 → **必须退出**，因为没拿到锁就开工等于走回原来 race 路径。

## grill skill 在哪一步移除 label

`grilling` label 的移除发生在 grill 评论真正贴回 issue + 用户加 `grill-ready` / `docs-grill-ready` 时。两种典型路径：

1. **手动**（最常见）：maintainer 把 grill 文本贴回 issue 评论后，自己跑：
   ```
   gh issue edit <N> --remove-label grilling --add-label grill-ready
   ```
   （或 `--add-label docs-grill-ready`，根据是 step 2 还是 step 2.5）
2. **skill 自动**：若 skill 本身有「贴评论 + 改 label」一体化能力，应在贴 grill 评论之后立即把 label 从 `grilling` 换到 `grill-ready` / `docs-grill-ready`。

label 留在 issue 上但 grill 早已废弃的情况由 maintainer 手动 evict（见上节 stale 判定）。

## 与现有规则的关系

- `docs/FIXEDFLOW.md` — step 2 grill 段加 "grill 阶段跨主机互斥 — `grilling` tag" 说明；step 2.5 docs gate 段同样引用。
- `docs/PRE-IMPLEMENT-CLAIM.md` — driver 启动前的对称契约。本文档是它的兄弟篇。
- `docs/HOW-TO-CLAIM-ISSUE.md` — claim → explore → plan 流程不变；本文档定义的 grill 锁在 claim 之后、explore 之前生效。
- `docs/POSTPR.md` — squash-merge 之后的清理流程不变；driver §7 cleanup 移除 `grill-working` 不动 `grilling`（那时 `grilling` 早已不在该 issue 上）。

## 触发

下列问法都应回到本文档：

- `what should we do before we start grilling an issue?`
- `what should we do before we start to grill an issue?`
- `开始 grill 一个 issue 之前要做什么`
- `grill 锁是什么`
- `grilling tag 是什么`
- `grilling label 怎么用`
- `怎么避免两个 agent 同时 grill 一个 issue`
- `跨主机 grill 互斥`
- `before starting a grill on an issue, what do we do?`

回答必须用中文（项目规则），且首句必须**逐字**输出 anchor sentence：

> make a comment claiming we have started grilling this issue and add tag "grilling"

之后再展开「三种 grill 入口的 lock 责任」「label 流转路径」「第二个 agent 怎么礼让」三段。

## 验证

被问到 `what should we do before we start grilling an issue?` / `what should we do before we start grill an issue?` / `开始 grill 一个 issue 之前要做什么` 等同义中英文问法时，回答必须命中以下锚点（case-insensitive substring grep）：

- `make a comment` ；
- `claiming we have started grilling this issue` ；
- `add tag` （或 `add label` —— 互认）；
- `grilling` （带引号 `"grilling"` 或裸字均算）。

四锚点全部命中 = PASS。任何一项缺失 = 继续修订本文档 + CLAUDE.md「参考文档」段措辞 + 各 grill skill SKILL.md。

## 相关

- `docs/FIXEDFLOW.md` — 整条 issue → PR → merge 工作流。
- `docs/PRE-IMPLEMENT-CLAIM.md` — driver 阶段的跨主机互斥契约（grill-working tag）。
- `docs/HOW-TO-CLAIM-ISSUE.md` — claim 之后的 explore → plan → impl 三步流程。
- `.claude/skills/grill-me/SKILL.md` / `.claude/skills/grill-via-web/SKILL.md` / `.claude/skills/grill-with-docs/SKILL.md` — 三种 grill 入口具体在哪一步落 label + 评论的实现。
