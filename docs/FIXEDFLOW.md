```
   _____  _____  __ ____  ____  ____  ____  __     ____  _    _
  |  ___||_   _||  \  __||  __||  _ \|  __||  |   |  _ \| |  | |
  | |__   | |  |    /  ||  __||    /| |__ |  |__ | |_| | |/\| |
  |____|  |_|  |_|\____||____||_|\_\|____||_____||____/|__/\__|

  TeamBrain FIXEDFLOW — 唯一允许的 issue → PR → merge 工作流

  step 1 (human)   step 2 (human)        step 2.5 (human)         steps 3–5 (human runs skill)
  ──────────────   ──────────────────    ─────────────────────    ───────────────────────────
  <50 word issue ─▶ /grill-via-web   ──▶ /grill-with-docs     ──▶ maintainer 在 Claude Code 跑
   via 唯一        (ChatGPT/Claude.ai)  (CLI, docs gate)            /fixed-flow-driver skill
   template        paste grill 到       写 docs-grill comment       │
                   issue comment        + 自加 docs-grill-ready     ├─ implement
                   + 加 grill-ready                                  │
                                                                     ├─ /review  ─┐
                                                                     │            │  loop ∞
                                                                     │  findings  │  至 PASS
                                                                     │  → PR-PLAN ┘
                                                                     │
                                                                     ├─ gh pr create (普通 PR)
                                                                     └─ gh pr merge --squash --auto

  refusal layer：非此模板 / 超 50 字 / 24h 内无 grill-ready 一律 close
  禁止任何 watcher / cron / daemon / 后台轮询 / 自动 dispatch / repo-wide sweep
  step 3-5 必须由人手动 invoke；两个 label（grill-ready + docs-grill-ready）必须同时存在
```

# FIXEDFLOW — TeamBrain manual fallback issue → PR → merge 工作流

> **Status (2026-05-14)**: per [ADR-0015](adr/0015-symphony-replaces-fixedflow.md),
> the **default** driver for grill-ready issues is now autonomous Symphony
> (fork [`LiuShiyuMath/symphony#claude-multi-provider`](https://github.com/LiuShiyuMath/symphony/tree/claude-multi-provider),
> see [`docs/SYMPHONY-FLOW.md`](SYMPHONY-FLOW.md) Q0-Q5 lifecycle).
> Manual `/fixed-flow-driver` (this doc) remains supported as the
> **fallback** path for: (a) hotfix / synchronous-control situations,
> (b) issues a maintainer explicitly opts into manual mode for, and
> (c) debugging Symphony itself. The Phase-2 cutover (root `CLAUDE.md`
> "禁止 watcher" hard-rule rewrite) lands in a follow-up PR so this PR
> stays small and reversible.

## Original FIXEDFLOW spec (manual driver path)

适用范围：`https://github.com/libz-renlab-ai/TeamBrain` 的所有 issue 与 PR。

> **取代 `docs/HOW-TO-ISSUE.md`**（已归档至 `docs/archive/HOW-TO-ISSUE.md`）。
> 自 2026-05-09 起，TeamBrain 仅接受走 FIXEDFLOW 的 issue。

## TL;DR — 5+1 步铁律（step 2.5 docs gate）

1. **写 issue（手动，<50 字）** — 通过仓库唯一 issue template 提交，body 限 50 字以内。
2. **issue grill（手动，唯一入口 `/grill-via-web`）** — **开始之前**先按 `docs/PRE-GRILL-CLAIM.md` 跨主机互斥：`gh issue comment` 写 claim 评论 + `gh issue edit --add-label grilling`（看到 `grilling` 已存在则礼让退出，**不抢、不强删**）。然后在 ChatGPT / Claude.ai 跑 `/grill-via-web` 把 issue 一题一题问透；把整段输出贴回 issue 评论，末尾以 `--- end grill ---` 结束（或保持 60 秒不再编辑）；最后 `gh issue edit <N> --remove-label grilling --add-label grill-ready` 把锁换到下一阶段。**`/grill-via-web` 是唯一允许的 issue-grill 入口**——不接受用 `/grill-me` / `/grill-with-docs` 作为 issue grill 入口。
2.5. **docs gate（手动 `/grill-with-docs`，强制）** — `/grill-via-web` 落地后、driver 启动前，maintainer 在 Claude Code 里跑 `/grill-with-docs`。**开始之前**同样按 `docs/PRE-GRILL-CLAIM.md` 加 claim 评论 + `grilling` label（若 step 2 已 swap 成 `grill-ready`，docs gate 重新加 `grilling`）。把 grill 结果对照项目代码、`docs/CONTEXT.md` 与 `docs/adr/` 检查一遍；需要落地的术语 / 决策 / 文档增量写到对应 docs + grill log（默认追加到 `docs/adr/0014-save-grilled-comments-to-adr.md`，大型 grill 落到 `docs/adr/0014/<issue-N>.md`）。`/grill-with-docs` 必须写回一条 docs-grill 评论，末尾以 `--- end docs grill ---` 结尾，并**自己**做 `gh issue edit <N> --remove-label grilling --add-label docs-grill-ready` 完成 label 同步。
3. **手动跑 driver（人手）** — maintainer 看到 `grill-ready` + `docs-grill-ready` **同时存在**的 issue 后，在 Claude Code 里执行 `/fixed-flow-driver` skill 并传入 issue 编号；driver 在 `.codex/worktrees/issue-<N>/` 起 `feat/issue-<N>` 分支，按 grill 评论实现。
4. **/review 循环（driver 内部自动 — never ends）** — driver 跑 `/review` skill，发现 finding 就更新 `docs/plans/<date>-pr-<N>-fix-plan.md` 并修；**`/review` loop never ends — 只有 PASS 能终止 driver**；`needs-human` label 不再退出 driver，仅作 informational signal。正常 flow 下用户**不**手动跑 `/review`。
5. **开 PR + squash-merge（driver 内部自动 — keep trying until it failed）** — `gh pr create`（**普通 PR，非 draft**）→ `gh pr merge <N> --squash --auto`（**仅 squash**）；如果 squash-merge 失败 → rebase 重试 → rebase 再失败也不 bail，**keep trying until it failed**（详见 §冲突恢复）；merge 成功后清理 worktree、写 `report.md`。

「人手」贯穿 step 1-3：reporter 写 issue + 跑 web grill，maintainer 跑 `/grill-with-docs` docs gate 并**主动**调起 driver。**禁止任何 watcher / 守护进程 / 后台轮询 / 自动 dispatch / repo-wide scanner / cron job**——driver 只能由人在 Claude Code 会话里显式启动。如果链路在中途卡住，人类可以手动跑 `/claim-to-merge` 或 `/fixed-flow-driver` 接上，这是人手补救入口，**不是 happy path**。

## Dispatch policy — only docs-gated grilled-issues

The FIXEDFLOW driver may **only** be dispatched on **docs-gated grilled-issues** — issues that have **both**: (a) valid grill comment + `grill-ready` label; (b) valid docs-grill comment + `docs-grill-ready` label. Dispatch is always manual, in a Claude Code session.

- ✅ **docs-gated grilled-issues** — both gates set, human runs `/fixed-flow-driver <N>` in Claude Code.
- ❌ blank / non-grill-template issues
- ❌ stale or missing grill comment (>24h without `grill-ready`)
- ❌ `grill-ready` set but `docs-grill-ready` missing (docs gate not run)
- ❌ retroactive AI-triage labels (see `docs/HOW-TO-CLAIM-ISSUE.md`)
- ❌ any watcher / cron / daemon / background poller / repo-wide scanner / auto-dispatch **on the fixed-flow track** (see scoping note below for the Symphony track carve-out)
- ❌ epic-style issues without `epic` label + named coordinator (see §Epic carve-out)
- ❌ **`track:symphony` label present** — this issue is routed to the Symphony driver, not fixed-flow. Driver §0 must refuse + post a 1-line comment citing `docs/TWO-DRIVER-COEXISTENCE.md` §2 + exit. Same refusal applies for `symphony-working` / `symphony-blocked` labels.
- ❌ **Symphony PR exists for this issue** — `gh pr list --search "Closes #<N> in:body" --label "track:symphony"` returns non-empty. Driver §0 must refuse even if `track:symphony` got stripped from the issue itself; a mid-flight Symphony PR means the issue is owned by Symphony. Recovery procedure in `docs/TWO-DRIVER-COEXISTENCE.md` §5b stale recovery.

**No automatic scanner / sweep / poller on the fixed-flow track.** Humans write issues, grill in the web (`/grill-via-web`), then run `/grill-with-docs` to update docs; only after both gates land do humans manually `/fixed-flow-driver` to continue.

**Scope note — watcher prohibition applies to fixed-flow track only.** The `禁止任何 watcher / cron / daemon / 后台轮询 / 自动 dispatch / repo-wide sweep` rule (also stated in the banner above) applies to the fixed-flow track. The Symphony track (issues labeled `track:symphony`) explicitly opts in to autonomous polling and auto-dispatch per `docs/SYMPHONY-FLOW.md`; the cross-track contract — including how the two never claim the same issue — lives in `docs/TWO-DRIVER-COEXISTENCE.md`.

## Claim an issue — what happens (2-outcome contract)

「Claim an issue」= maintainer 拿到一个 issue 编号、决定要不要跑 `/fixed-flow-driver` skill。结局**只有两种**：

1. **Pause and stop if any gate missing** — driver 起来后先校验 issue 是否同时齐备：(a) grill comment + `grill-ready` label；(b) docs-grill comment + `docs-grill-ready` label。任一缺失或评论无法解析 → driver 不动代码、不开 worktree、不写 PR；回评说明缺哪一道 gate（`needs-grill-comment` 或 `needs-docs-grill`），或交给 conformance Action 在 24h 后 auto-close，立刻退出。
2. **Do everything from issue → merged PR with `/review` fix-loop** — 两道 gate 都满足时 driver 全程跑：建 `.codex/worktrees/issue-<N>/` → 按 grill comment 实现 → 跑 `/review` skill 进 **循环 fix**（每轮写 `docs/plans/<date>-pr-<N>-fix-plan.md` 三段计划）至 PASS → 开**普通** PR（`--draft` 严禁）→ `gh pr merge <N> --squash --auto`（仅 squash）→ 清理 worktree、写 `report.md`。期间无第三方 reviewer，但启动这件事 **必须由人主动做**。

简记：**any gate missing ⇒ driver 起来即退；both gates set ⇒ driver 一路跑到 squash-merge；driver 永远只在被人显式调用时才存在。**

## Preempted by an existing PR — 2-outcome contract

如果你（或 driver）准备 claim 一个 issue 时，发现仓库里**已经有别人开了 PR** 实现这个 issue（典型表现：`gh pr list --search "issue-<N>"` 出来一条非自己开的 PR；或者自己 PR 推上去之后才看到 base 上多了对位 PR），结局**只有两种**：

1. **Review and give up（review 全 PASS ⇒ 放弃自己的 PR）** — 用本地 `/review` skill（ADR-0007 权威 review gate）跑一遍那个已存在 PR 的 diff；如果 `/review` 返回 no actionable findings（无 P1/P2，CI 也绿），就**放弃自己这条线**：关闭自己的 PR（如果已开）、`ExitWorktree action="remove"`、删本地 `feat/issue-<N>` 分支、按 `docs/POSTPR.md` 让那条**别人的** PR 走 `gh pr merge <N> --squash --delete-branch`（仅 squash）。不要再为同一个 issue 开重复 PR。
2. **Append fix to that PR + /review loop（review 有问题 ⇒ 在那个 PR 上追加修复）** — 如果 `/review` 在那个 PR 上找到 P1/P2 finding，**严禁** 另开一个 follow-up PR / follow-up issue（按 `docs/POSTPR.md` 的 hard rule）。改成：在 `docs/plans/<date>-pr-<n>-fix-plan.md` 写 PR-PLAN 三段（task / expected outputs / judge harness），按 `docs/TEAMWORK.md` 的 N+1+(2N) 模式修；fix commits 推到**那个 PR 的同一 branch**（同 org maintainer 通常有权限；fork PR 则在 PR 评论里贴 fix-plan + patch 引导原作者 push），然后**基于那个 PR** 继续跑 `/review` fix-loop 至 PASS，最后 squash-merge 那个 PR；按 `docs/POSTPR.md` 收尾（必要时 `ExitWorktree action="remove"` 清掉为 fix 开的 worktree，再**回父 checkout** 跑 `git pull --ff-only` 把本地 `main` 同步到 origin/main 含刚 squash 的 commit）。

简记：**review good ⇒ review and give up；review bad ⇒ append fix commits to that PR + /review loop based on that PR ⇒ squash-merge 那个 PR。** 永远不为同一个 issue 维持两个并行 PR。

鸭鸭说 (>ω<)：呷呷~ 如果发现别人已经把活儿干了，鸭鸭就先用 `/review` 给那个 PR 当裁判。判得过就放手让他去 squash-merge；判不过也别另起炉灶，直接把补丁推到那个 PR 的同一个 branch 上，循环 `/review` 到 PASS。一个 issue 永远只对应一个 squash-merged PR，绝不能有两条平行线哟~

## Taking over someone else's grill-ready issue — pre-comment + label contract

适用场景：你（maintainer）准备**接手别人开的 grill-ready issue**。本节只覆盖**两种**情形，**不**覆盖 hand-close 非合规 issue：

- (a) **Unattended grill-ready**：原 reporter 已贴 grill 评论 + `grill-ready` label，但 24h 内没人 drive，maintainer 决定自己跑 `/grill-with-docs` + `/fixed-flow-driver`。
- (b) **Stale in-progress claim**：issue 已有别人评论「我来开始干」或 self-assign，但**距离他们最后一次评论 / push 已 ≥ 24h** 无任何 commit / comment 推进，maintainer 想接过来。

**显式 not in scope**：hand-close 一条非合规 issue（>50 字 body / 非 fixed-flow template / 24h 无 `grill-ready`）**不**走本节——这是 `.github/workflows/issue-conformance.yml` 自动 close 的工作。需要立即 hand-close 时用 `gh issue close <N> --reason "not planned"`，**不要** add `grill-working` label（否则违反 `docs/POSTMORTEM.md` hard rule #6 的 retroactive-labeling 禁令）。

### 进入门禁 (必须满足之一，**不能跳过**)

1. **Ghost-timer ≥ 24h**：previous claimant 的 last comment 或 last commit 已经 ≥ 24h。**必须**在 takeover 评论里粘一行 `gh issue view <N> --json updatedAt,comments` 的截取证明这条 24h 间隔。
2. **Explicit ack**：previous claimant 在 issue 评论里**写一句**说同意 takeover（`+1` reaction **不算**）。**必须**在 takeover 评论里贴他们 ack 那条评论的链接。

两条都不满足而擅自 takeover 视为 griefing，任何其他 maintainer 都可以 revert label 并 ping 你回滚。

### Takeover 评论格式

进入门禁满足后，在 issue 评论里贴下面三段 **verbatim 中文声明**（顺序固定，禁翻译、禁 paraphrase、禁简写），并跟一行 evidence（ghost-timer 截取或 ack 链接）：

1. 我已经开始干了
2. 我来负责 grill-with-docs / grill-via-web
3. 我的机器上开始干了

可选补充：`host=<machine-id-or-name>` / `branch=feat/issue-<N>` 或 `branch=worktree-issue-<N>+pr-<i>` 让其他 maintainer 看到你的工作位置。

**贴完评论之后**，再**自己**给 issue 加 `grill-working` label（颜色 `#fbca04`，与 driver mutex 共用同一 label——具体语义见 `docs/PRE-IMPLEMENT-CLAIM.md`）。然后才可以：

- 开 `.codex/worktrees/issue-<N>/` 或 `.claude/worktrees/issue-<N>+pr-<i>/` 起 `feat/issue-<N>` branch；
- 跑 `/grill-with-docs` 补 docs gate（如果情形 a 且 `docs-grill-ready` 缺）；
- 跑 `/fixed-flow-driver` 启动 step 3-5。

### 为什么 reuse `grill-working`（不新建 label）

`grill-working` 既是 driver mutex（driver 自动加），也是 human takeover signal（maintainer 手动加）——`docs/PRE-IMPLEMENT-CLAIM.md` §`同一 label，两种来源` 定义两套语义如何共存（看 `.lock` sentinel + 看 pickup 评论锚点可以 O(1) 区分谁加的）。GitHub label 是仓库 metadata，比评论文本更易扫描（`gh issue list --label grill-working` 一行命令出全集），符合 #349 的「tags for easy issue tracking」要求。

### 回滚

贴完三段声明 + label 之后改变主意（previous claimant 上线回评 / 发现 scope 太大要 triage-and-split），按 `docs/PRE-IMPLEMENT-CLAIM.md` §`Rollback`：在同一线程追加 `--- abandoning takeover ---` 一行，**自己**移除 `grill-working` label；不要靠他人接力回收 label。

### 与既有规则的边界

- **vs `Preempted by an existing PR`**：那一节解决「issue 已有别人开的 PR」的双轨 PR 竞争；本节解决「issue 还没人开 PR，但有别人 mid-claim」的接手前仪式——两节互补，不重叠。
- **vs `docs/POSTMORTEM.md` hard rule #6**：本节门禁要求 takeover 必须发生在 grill-ready issue（已经走过 reporter-grill），label 添加是**创建时点**的 takeover signal（不是事后追认 epic）；不属于 #6 禁止的 retroactive 操作。**Hand-close 非合规 issue 显式 not in scope** 正是为了不踩 #6。
- **vs SessionStart banner contract**：`docs/specs/2026-05-11-fixedflow-sessionstart-banner.zh.md` 的 banner / docs-only trigger 语义本节不动；takeover 跑的 driver 仍走 banner gate。
- **vs conformance Action auto-close**：本节只管 maintainer 的手动 takeover；machine path 不受本节约束。

## 步骤负责人分界

| 步骤 | 谁负责 | 进入条件 | 退出条件 |
|------|--------|----------|----------|
| 1 写 issue | reporter | 用 fixed-flow template 提交 | issue 入 open queue |
| 2 issue grill (`/grill-via-web`) | reporter | issue body 通过 conformance 检查 | `grill-ready` label 已加，comment 60s 未再编辑或带 `--- end grill ---` |
| 2.5 docs gate (`/grill-with-docs`) | maintainer 在 Claude Code | step 2 完成 | docs-grill comment 末尾带 `--- end docs grill ---` + `docs-grill-ready` label 已加 |
| 3 启动 driver | maintainer 在 Claude Code 里跑 `/fixed-flow-driver` skill | step 2 + 2.5 都完成 + maintainer 主动调用 | feat 分支推到 origin |
| 4 /review loop | driver 内部 | branch pushed | /review 全部 finding PASS |
| 5 PR + merge | driver 内部 | /review PASS | merge 完成 + worktree 清理 |

## issue body 必须满足

- 通过 `https://github.com/libz-renlab-ai/TeamBrain/issues/new/choose` 选 fixed-flow template；不接受 blank issue。
- body 整体 ≤ 50 字（中英文均按 word 计数，引用代码块也算）。
- 只描述「想要什么 / 看见了什么」一句话级别；细节留到 grill 评论。
- 严禁在 body 写：实现方案、root cause、PR 拆分计划、技术栈选择。

例：
```
新用户 onboarding 第 3 步在 Windows Git Bash 下卡住，错误见复现命令。
```

## Epic / multi-PR carve-out

「Epic」issue = 一个 issue 需要拆为 ≥ 2 个 child PR 才能完成 ship。这是上一节「body ≤ 50 字 + 禁实现方案」的**唯一合法例外**，必须**同时**满足：

1. **创建时点贴 label**：issue 创建当下由 maintainer / repo admin 手动贴 `epic` 或 `ready-for-human` label（不接受 AI-triage retroactive labeling，见 `docs/HOW-TO-CLAIM-ISSUE.md` "ready-for-human label" 段）。
2. **指名 coordinator**：issue body 必须明确写出 coordinator 的 GitHub username（通常 ≠ reporter）；coordinator 是 step 3+ 的人手判断中枢。
3. **PR 拆分映射**：issue body 列出 PR-1 / PR-2 / ... 的边界（每条 ≤ 1 行），让 child PR 的 reviewer 能比对实际 PR 是否对应 epic 拆分。

**Coordinator ack 规则**：每个 child PR 在 `gh pr create` 之前必须先在 issue 评论里 ping coordinator 拿一次显式 ack（"我打算开 PR-2 实现 X" → coordinator 回 "go ahead" → 然后才开 worktree / branch / PR）。无 ack 直接 ship 的 child PR 视为越权 — 但越权判定基于**当时已存在的 epic label + coordinator 字段**，不基于事后追认（见 `docs/POSTMORTEM.md` hard rule #6）。

**Child PR 仍走 squash-only + base against main**：FIXEDFLOW 的 squash-only 与 `docs/POSTPR.md` "Squash repo: PRs must base against main" 规则在 epic 路径下**不松绑**。Stacked PR 在 epic 内同样禁止；child PR 必须 sequential ship（PR-1 squash-merge → 等 main 更新 → 在新 main 上开 PR-2）。

**实证 / 反例**：issue #146 是 epic 但**未在创建时点贴 label / 未指名 coordinator** 即开放给 contributor self-claim；5 个 child PR ship 完成后 AI-triage 才补 `ready-for-human` label。该路径**不构成本节定义的 epic carve-out**（缺创建时点 label + coordinator 字段），retroactive 操作无约束效力。详细复盘见 `docs/POSTMORTEM.md`。

**Triage 入口 — grill 完发现 issue 太大怎么办**：FIXEDFLOW step 2 与 step 3 之间，maintainer **必须**先对 grilled issue 跑一遍「单 PR 可 ship 测试」。命中任一 oversized 信号（≥2 独立 expected output / 跨无关 package 顺序依赖 / 跨团队 / grill 自己写了拆分 / 预估 diff > 1500 LOC 或 > 30 文件 / draft 试做必然命中跨区域 P1/P2）→ 走 `docs/TRIAGE-AND-SPLIT.md` 拆出 ≥ 2 个新 child issue，原 issue 在 split 同一刻升级为本节定义的 epic tracking issue（**这一刻就是 epic 结构的"创建时点"**，不算 retroactive labeling）。**禁止**：直接对 oversized issue 跑 `/fixed-flow-driver`；也禁止 driver / watcher 自动判定 oversized 并拆。

## grill 评论必须满足

- comment 作者 = issue 作者本人（或 reporter 授权的 grill helper）。
- comment 来自 `/grill-via-web`（ChatGPT / Claude.ai）整段输出。
- comment 末尾以 `--- end grill ---` 单行结束，**或** comment 创建后 60 秒内不再编辑。
- 加上 `grill-ready` label 之后，maintainer 才会被允许进入 step 2.5（docs gate）。

driver 启动时会同时校验 grill comment + docs-grill comment + 两个 label；任一缺失立刻退出并按 §Claim an issue 段返回对应回评。

## docs-grill 评论必须满足

- comment 作者 = maintainer（运行 `/grill-with-docs` 的人）。
- comment 来自 `/grill-with-docs` 在 Claude Code 里对 grill 结果做 docs-against-code/CONTEXT/ADRs 检查后的输出，**不是**一次新的 grill。
- comment 内容至少描述：哪些 docs 被更新（含 `docs/CONTEXT.md` 术语 delta 与 ADR 增删）；如果不需要更新 docs，显式写「no docs update needed」。
- comment 末尾以 `--- end docs grill ---` 单行结束。
- `/grill-with-docs` 自己负责加 `docs-grill-ready` label；maintainer 不要靠手贴 label 绕过这条 skill 的实际执行。

`/grill-with-docs` 默认把决策追加到 `docs/adr/0014-save-grilled-comments-to-adr.md`；大型 grill 落到 `docs/adr/0014/<issue-N>.md`（详见 ADR-0014）。

## refusal layer（拒绝其它 issue 类型）

`.github/workflows/issue-conformance.yml` 在以下情况触发处理：

| 触发 | warn 期（前 7 天）行为 | enforce 期（之后）行为 |
|------|------------------------|------------------------|
| 非 fixed-flow template / blank issue | 评论提醒 + 加 `non-conformant` label | 评论 + close |
| body > 50 字 | 评论提醒 word count 超出 | 评论 + close |
| issue 开了 24h 仍无 `grill-ready` label | 评论提醒走 grill | 评论 + close |
| 有 `bypass-fixed-flow` label | 完全跳过本 Action | 同 warn |

`bypass-fixed-flow` 仅 repo admin 可加；conformance Action 通过 `gh api repos/:owner/:repo/collaborators/:user/permission` 校验来源用户的 permission，不是 admin 直接忽略 label。

## Human-ready issues — never auto-close

策略由 issue #338 codify。`ready-for-human` label 的官方描述是 `Needs human judgment / external access / design decision`——「该不该 close」本身就是一次 human-judgment 事件。因此：

**带 `ready-for-human` label 的 issue 只能由真人 maintainer 手动 close。禁止 agent / bot 把它从 `open` 状态迁出（close / delete / transfer / convert-to-discussion / lock-as-resolved 等任何 state transition），也禁止 agent / bot 私自 remove `ready-for-human` label 以绕过本规则。**

### 适用范围

**Intent-based ban（不靠枚举 API 名）**：任何**非真人 actor**（Claude Code / Codex / `/fixed-flow-driver` / `/claim-to-merge` / 任何 autonomous worker / 任何 bot / 任何 watcher / 任何 cron / 任何 stale-bot / 任何 GitHub Action 在 `pull_request: closed` / `schedule:` / `issues:` / `workflow_dispatch:` 等任意触发下）对带 `ready-for-human` label 的 issue 做下列任意一种**状态迁移**——一律禁止：

- ❌ close（`gh issue close` / `gh issue edit --state closed` / `PATCH /repos/:owner/:repo/issues/:N -f state=closed` / `@octokit/rest` 的 `octokit.issues.update({state:"closed"})` / GraphQL `closeIssue` mutation / `gh api graphql` 等价调用 / 批量 close 脚本……）
- ❌ delete（`gh issue delete` / GraphQL `deleteIssue`）
- ❌ transfer（`gh issue transfer` 转出到别的 repo）
- ❌ convert-to-discussion（`gh issue develop` / web UI convert）
- ❌ lock + 标 off-topic / spam / resolved 当作软关闭使用
- ❌ remove `ready-for-human` label（`gh issue edit --remove-label ready-for-human` / API `DELETE /issues/:N/labels/...`）——本质等价于解除本规则的保护，agent 自己摘 label 等于自己解除自己的约束，必须禁止
- ❌ remove `grill-ready` / `docs-grill-ready` label：**只要 issue 同时挂着 `ready-for-human` label**，agent / bot 也不能擅自 strip 任何相关 dispatch label（与 §与 `grill-ready` 互斥 段配套——label 状态的任何编辑都属于 human-judgment 事件，必须由真人 maintainer 操作；agent 看到双 label 共存只能贴评论 + 退出）

枚举只是脚手架，**判定原则 = "非真人 actor + 任何把 issue 从 open 状态搬出去或编辑保护 label（无论是 `ready-for-human` 自身还是与之 mutex 的 `grill-ready` / `docs-grill-ready`）= forbidden，与具体 API 表面无关"**。新的 GitHub feature / 第三方工具引入新的 close-equivalent surface 时默认落入本禁令，不需要每个新 surface 都来改本规则。

补充约束：

- ❌ 即使 agent 判断该 issue 已被某 merged PR 解决 / 已过期 / 是 duplicate / 已被另一条 issue 覆盖 —— 只能贴评论说明，**不许自己做任何状态迁移**。
- ❌ 即使 agent 读到本规则后口头同意 —— 本规则本身也不许被 agent close / delete / transfer（issue #338 自身就是它的 self-test case）。
- ✅ 只有真人 maintainer（libz 的任一 GitHub 账号 / 其它有 maintain 权限的真人）在浏览器 / CLI 里手动操作，才是合法路径。
- ✅ **PR 关键字 auto-close 例外（必须双因子可机器验证的 human-ack）**：若真人 maintainer 已经手动判定该 issue 「等 PR fix 即可结案」，可以在 PR body 写 `Closes #N`，让 GitHub 在 squash-merge 时 auto-close。但 agent 必须**同时**满足下列**两个**独立 factor（任一缺失 = 走默认禁令 ❌；单 factor 不足，**两因子设计是为了让单一 PAT 失陷无法独立完成 bypass**）：
  - **Factor (a) — label removed by non-agent human**：`ready-for-human` label 已被在 PR open **之前**手动 remove，且必须**同时**满足：(i) `gh api repos/:owner/:repo/issues/:N/events` 查到 `unlabeled` 事件；(ii) 事件 actor 的 `actor.type == "User"` 且 `actor.login` 不在 repo 已知 bot allowlist（例如不匹配 `*-bot` / `dependabot` / `github-actions` / 任何 PAT-driven agent identity）；(iii) actor permission ≥ maintain（`gh api repos/:owner/:repo/collaborators/:user/permission`）；(iv) actor 不是即将合 PR 的作者本人；(v) label **从 PR open 到 squash-merge 之间持续保持 absent**（events API 不出现新的 `labeled ready-for-human` 事件——禁止 add-then-strip 时序绕过）。
  - **Factor (b) — explicit ack comment by another human maintainer**：issue 上有一条 repo maintainer（与 Factor (a) 的 actor 不同人——「不同人」以 `actor.login` 字符串严格不等判定，不接受同一人换 device / session / IP 的辩解；permission 通过 `gh api repos/:owner/:repo/collaborators/:user/permission` 返回 `admin` / `maintain` / `write`；账号必须 `user.type == "User"` 且 `actor.login` 不在 repo 已知 bot allowlist——例如不匹配 `*-bot` / `dependabot` / `github-actions` / 任何 PAT-driven agent identity，与 Factor (a) 的 bot-exclusion 完全对称）authored 的评论包含字面字符串 `ack: close-via-PR #<PR-N>`（`<PR-N>` 必须等于即将合 PR 的编号）；评论发布在 PR squash-merge **之前**；评论作者必须能在 issue audit log 中独立可见。
  - **PR body 必须明文引用两份证据**（label-removed event URL + actor 用户名 + permission level + bot-check 通过；ack 评论 URL + 评论作者 + permission level + bot-check 通过）。任一未引用 / 任一 factor 缺失 / 两个 factor 的 `actor.login` 同字符串 / 两个 factor 由同一 PAT 触发 = 走默认禁令 = ❌。**单凭 "我觉得 maintainer 应该同意" / "讨论里似乎有共识" / 单 factor 满足，都不算合规 ack。**

### 与 `grill-ready` 互斥

`ready-for-human` 与 `grill-ready` 是**互斥**的 dispatch 标签：

| Label | Dispatcher | Close 路径 |
|---|---|---|
| `grill-ready` + `docs-grill-ready` | `/fixed-flow-driver`（maintainer 手动启动） | PR squash-merge 含 `Closes #N` 触发 GitHub auto-close（PR 关闭副作用，非 agent 主动） |
| `ready-for-human` | **没有自动 dispatcher** | **只能真人手动 close**（PR-keyword auto-close 例外要求 §适用范围 的双因子 human-ack：label-removed-by-non-bot-human-maintainer + 另一位真人 maintainer 的 `ack: close-via-PR #<N>` 评论；单 remove label 不够） |

如果同一条 issue 同时挂 `ready-for-human` 与 `grill-ready`：**先 remove `grill-ready`** 再让 driver 介入；如果反向决策（升级为人手处理），先 remove `grill-ready` + `docs-grill-ready` 再贴 `ready-for-human`。driver 看到 `ready-for-human` label 一律拒绝 dispatch（参见 §Dispatch policy）。

**两个 label 的 remove 都必须由真人 maintainer 操作**——agent / bot 不能为了让自己跑得动而自己 remove `ready-for-human`（会与本节 §适用范围 的 label-strip 禁令冲突；driver 看到该 label 时**只能拒绝 dispatch + 退出**，绝不能 strip-and-continue）。

### 与 refusal layer 的关系

`.github/workflows/issue-conformance.yml` 在 enforce 期会对「24h 内无 `grill-ready` label」的 issue 评论 + close（§refusal layer）。**此 close 路径必须 whitelist `ready-for-human`**：conformance Action 与任何未来的 stale-bot / cleanup watcher / repo-wide sweep 一律不得 close 带 `ready-for-human` label 的 issue。docs 在此提前 codify 这条约束；workflow yaml 的实装在另行 issue 跟进，不在本规则的 docs PR 范围。

**Transition guard（yaml whitelist 落地前）**：在 conformance Action 的 yaml 实际增加 `ready-for-human` whitelist 之前，maintainer 必须**操作层手动**保证「`ready-for-human` 与 missing-`grill-ready`」不在同一条 issue 上共存超过 24h——要么及时贴 `grill-ready`（走 FIXEDFLOW dispatch），要么主动 manual close（按本节合法路径）。在过渡期出现 conformance Action 误关 `ready-for-human` issue 的情况，立即由真人 maintainer reopen + 在事件复盘里 patch 这条约束，不要让 Action 的延迟成为规则被绕过的借口。

### 落地建议（仅 enforcement 时点可选 — 禁令本身仍是 MUST）

下面三条是把上面 §适用范围 的 MUST 禁令落到自动化拦截层的**实装建议**，每条的「做不做 / 何时做」由 maintainer 决定；但**做不做 enforcement 实装 ≠ 放宽禁令本身**——只要 `ready-for-human` label 还在 issue 上，§适用范围 的状态迁移 + label-strip 禁令对所有 agent / bot 永远是 hard rule。

1. 给 stale-issue / cleanup watcher 加白名单：`ready-for-human` 永不自动 close（与 §与 refusal layer 的关系 段对齐）。
2. 可选 pre-close hook：检测 `gh issue close`（及 §适用范围 列出的任意等价 close API / 状态迁移 / label-strip）actor 是 bot/agent + issue 含 `ready-for-human` label → reject。
3. driver / `/claim-to-merge` 看到 `ready-for-human` label 时只能贴评论并退出，不得触发任何 close 调用 / label-strip（已由 §Dispatch policy 的 refusal 路径覆盖）。

### 与 retroactive ban 的关系

本节只规定「已经带 `ready-for-human` label 的 issue 谁可以 close」。「label 谁可以贴 / 何时可以贴」由 `docs/HOW-TO-CLAIM-ISSUE.md` "ready-for-human label" 段 + `docs/POSTMORTEM.md` hard rule #6 + `docs/TRIAGE-AND-SPLIT.md` 共同 codify（核心：创建时点贴合法；ship 后 retroactive 补贴无约束效力）。两条规则不重叠：贴 label 是入口约束，close 是出口约束。

## driver 行为细则

driver = `.claude/skills/fixed-flow-driver/SKILL.md`（Codex 端在 `.codex/skills/`）。

- **调用方式**：仅由人在 Claude Code 会话里显式 `/fixed-flow-driver <issue-number>`；不存在任何机器自动 dispatch 路径。dispatch 类型只能是 docs-gated grilled-issues（见 §Dispatch policy）。**`/review` 是 merge 前自动的内部 review gate；正常 flow 下用户不需要手动跑 `/review`**。
- **并发 — let the first go（同主机）**：同一时刻只跑一个 issue worktree（FIFO by issue number）。如果 many workers hit one same worktree（多个 driver 撞 `.codex/worktrees/issue-<N>/`），**let the first go**：第一个 driver 拿到 worktree 锁继续干，后续 driver 检测到 `.codex/worktrees/issue-<N>/.lock` sentinel（含第一个 driver 的 session id）后立即礼让退出 —— **不抢、不强删、不 race**。锁文件由第一个 driver 在 worktree 创建后写入，merge 完成清理 worktree 时一并删除。**注意**：`.lock` 只在本地文件系统，不能跨主机；跨主机互斥见下条。
- **跨主机互斥 — `grill-working` tag**（详见 `docs/PRE-IMPLEMENT-CLAIM.md`）：driver §1 在动任何代码之前必须 **make a comment claiming we have started working on this issue and add tag "grill-working"** —— 两个动作同时落到 GitHub。`grill-working` label 是真正的跨主机 mutex（GitHub label edit 是原子操作，可被其它 driver 在 §0 sanity gate 一眼查询）；claim 评论是 audit trail。第二个 driver 在 §0 看见 `grill-working` 存在即礼让退出，**不强行移除 label**。merge 成功后由 driver §7 cleanup `gh issue edit <N> --remove-label grill-working` 释放。driver 异常退出留下 stale `grill-working` 由 maintainer 手动 evict（≥ 24h 无 progress 才算 stale），**禁止 automation 自动 evict**。`grill-working` label 不存在时（仓库未创建）driver 报错退出、由 maintainer 一次性 `gh api repos/<owner>/<repo>/labels --method POST -f name=grill-working` 创建。
- **/review 循环 — never ends**：`/review` loop 是无限循环；它 **never ends** until `/review` PASS。没有 max-iter cutoff、没有 token-budget kill、没有 needs-human 退出。driver 持续 finding → fix-plan → commit → 再 `/review`，永远不放弃，**until it passes**。iteration 计数与累计 token 写到 `.fixedflow/iter-<N>.json`；driver 在第 10 / 25 / 50 / 100 / 250 / 500 / ... 轮发 PushNotification；每 10 轮在 issue 上贴一条 token-burn 摘要评论作 informational signal，但 loop 不为此停。`needs-human` label 在 loop 中**仅作 informational**，不再触发退出（曾经是 escape hatch，现已废弃）。
- **PR-PLAN 强制**：每一轮 /review fix 必须先写或更新 `docs/plans/<date>-pr-<N>-fix-plan.md`（task / outputs / judge harness 三段，参考 `docs/PR-PLAN.md`），不允许跳过。
- **冲突恢复 — keep trying until it failed**：`gh pr merge --squash --auto` 失败 → `git rebase origin/main` → `--force-with-lease` push → 再次 `gh pr merge --squash --auto`。如果 squash-merge 失败后 rebase 再失败，driver **不再加 `needs-human` label 然后退出**；改为 **keep trying until it failed** —— 继续 fetch / rebase / push / retry merge，直到物理上跑不动为止（PR 被 upstream close、branch 被远端删、repo 权限被撤、或维护者 kill 进程）。每 5 次 retry 发一次 PushNotification；除非物理失败，永不放弃。
- **Boris workflow 收尾**：merge 完成后写 `docs/plans/<date>-issue-<N>/research.md` + `report.md`，记录实际执行链路与偏差。

## bypass / escape hatch

| 场景 | 解法 |
|------|------|
| dependabot / 安全补丁 PR（无对应 issue） | 仓库 admin 在 issue（如有）或 PR 上加 `bypass-fixed-flow` label |
| 真·hotfix 必须 5 分钟内合 | 同上；并提示作者补一个 retro issue 走 FIXEDFLOW |
| `/review` 死循环烧 token 太多 | 不再触发退出 —— `/review` loop never ends until PASS。`needs-human` label 仅作 informational；要真停只能 kill 进程或关 PR |
| maintainer 一时没看到 grill-ready / docs-grill-ready issue | 没事——issue 留在队列里等下一次 maintainer 主动巡检（**无 SLA，无 scanner，无 cron**） |
| 链路在中途卡住（grill 落地后 docs gate 漏了，或 docs gate 之后 driver 没起） | 人类手动跑 `/claim-to-merge` 或 `/fixed-flow-driver` 接上；这是人手补救入口，非 happy path |
| squash-merge 持续失败 | driver 不 bail；keep trying until it failed —— 反复 rebase/retry，直到物理上跑不动（PR closed / branch deleted / 进程被杀） |

## 与既有规则的关系

- `docs/specs/2026-05-11-fixedflow-sessionstart-banner.zh.md` — Chinese SessionStart banner 文案 / gate contract / hard rules / docs-only trigger semantics SoT。
- `docs/adr/0014-save-grilled-comments-to-adr.md`（+ `docs/adr/0014/<issue-N>.md` siblings） — `/grill-with-docs` 把 grill 决策持久化到 ADR 的具体规则。
- `docs/HOWTO-PLAN-PR.md` — FIXEDFLOW step 3 的 PR 描述按 4 段结构写。
- `docs/PR-PLAN.md` — FIXEDFLOW step 4 每轮 fix 强制按 PR-PLAN 三段写新 plan 文件。
- `docs/POSTPR.md` — FIXEDFLOW step 4 / 5 即 POSTPR 循环的程序化版本。
- `docs/feature-verification.md` — FIXEDFLOW 自身的 feature-verification 由 `docs/plans/2026-05-09-fixed-flow/judge.md` 承担。
- `docs/HOW-TO-ISSUE.md` — 已归档；FIXEDFLOW 取代之。
- `docs/POSTMORTEM.md` — multi-PR recap comment 规则；epic 类 issue 的复盘叙事约束在那里（hard rule #6 + #7）。
- `docs/HOW-TO-CLAIM-ISSUE.md` — claim 前必须看到两个 label；`ready-for-human` + AI-triage retroactive ban；epic carve-out 引用。
- `docs/TRIAGE-AND-SPLIT.md` — grill 完发现 issue 太大时的 triage 入口（人手 maintainer 判断瞬间）。
- 本文 §Human-ready issues — never auto-close — codify by issue #338；规定带 `ready-for-human` label 的 issue 只能由真人手动 close、所有 agent / bot 禁止 `gh issue close`、`grill-ready` 互斥关系、refusal-layer whitelist 要求。
- `docs/plans/2026-05-12-issue-349/` — 接手别人 grill-ready issue 时的 pre-comment + `grill-working` label 契约由 issue #349 引入（本文件 §Taking over someone else's grill-ready issue — pre-comment + label contract）。
- `docs/PRE-IMPLEMENT-CLAIM.md` — `grill-working` label 双语义（driver mutex + human takeover）、takeover 门禁（24h ghost-timer / explicit ack）、回滚、冲突解决的 canonical doc；由 #349 backfill。

## 验证（语义 probe，不写 canned-answer block）

按 ADR-0007 / `docs/POSTPR.md` L115 的硬约束，**不向 `CLAUDE.md` 或 `AGENTS.md` 写 FIXEDFLOW canned-answer block**。验证走一条：

1. `claudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, who triggers step 3"` 必须有机命中本文 5 步与「step 3 由 maintainer 手动启动 /fixed-flow-driver skill」语义；与 `snapshots/fixedflow.canonical.txt` 对照。

完整 judge harness 见 `docs/plans/2026-05-09-fixed-flow/judge.md`（§V1 RUN / §V2 DUMP / §V3 READ）；historical 部分提到的 watcher / heartbeat 路径已不再适用。
