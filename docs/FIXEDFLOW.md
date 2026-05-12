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

# FIXEDFLOW — TeamBrain 唯一 issue → PR → merge 工作流

适用范围：`https://github.com/libz-renlab-ai/TeamBrain` 的所有 issue 与 PR。

> **取代 `docs/HOW-TO-ISSUE.md`**（已归档至 `docs/archive/HOW-TO-ISSUE.md`）。
> 自 2026-05-09 起，TeamBrain 仅接受走 FIXEDFLOW 的 issue。

## TL;DR — 5+1 步铁律（step 2.5 docs gate）

1. **写 issue（手动，<50 字）** — 通过仓库唯一 issue template 提交，body 限 50 字以内。
2. **issue grill（手动，唯一入口 `/grill-via-web`）** — 在 ChatGPT / Claude.ai 跑 `/grill-via-web` 把 issue 一题一题问透；把整段输出贴回 issue 评论，末尾以 `--- end grill ---` 结束（或保持 60 秒不再编辑）；最后给 issue 加 `grill-ready` label。**`/grill-via-web` 是唯一允许的 issue-grill 入口**——不接受用 `/grill-me` / `/grill-with-docs` 作为 issue grill 入口。
2.5. **docs gate（手动 `/grill-with-docs`，强制）** — `/grill-via-web` 落地后、driver 启动前，maintainer 在 Claude Code 里跑 `/grill-with-docs`，把 grill 结果对照项目代码、`docs/CONTEXT.md` 与 `docs/adr/` 检查一遍；需要落地的术语 / 决策 / 文档增量写到对应 docs + grill log（默认追加到 `docs/adr/0014-save-grilled-comments-to-adr.md`，大型 grill 落到 `docs/adr/0014/<issue-N>.md`）。`/grill-with-docs` 必须写回一条 docs-grill 评论，末尾以 `--- end docs grill ---` 结尾，并**自己**加上 `docs-grill-ready` label。
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
- ❌ any watcher / cron / daemon / background poller / repo-wide scanner / auto-dispatch
- ❌ epic-style issues without `epic` label + named coordinator (see §Epic carve-out)

**No automatic scanner / sweep / poller.** Humans write issues, grill in the web (`/grill-via-web`), then run `/grill-with-docs` to update docs; only after both gates land do humans manually `/fixed-flow-driver` to continue.

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

## driver 行为细则

driver = `.claude/skills/fixed-flow-driver/SKILL.md`（Codex 端在 `.codex/skills/`）。

- **调用方式**：仅由人在 Claude Code 会话里显式 `/fixed-flow-driver <issue-number>`；不存在任何机器自动 dispatch 路径。dispatch 类型只能是 docs-gated grilled-issues（见 §Dispatch policy）。**`/review` 是 merge 前自动的内部 review gate；正常 flow 下用户不需要手动跑 `/review`**。
- **并发 — let the first go**：同一时刻只跑一个 issue worktree（FIFO by issue number）。如果 many workers hit one same worktree（多个 driver 撞 `.codex/worktrees/issue-<N>/`），**let the first go**：第一个 driver 拿到 worktree 锁继续干，后续 driver 检测到 `.codex/worktrees/issue-<N>/.lock` sentinel（含第一个 driver 的 session id）后立即礼让退出 —— **不抢、不强删、不 race**。锁文件由第一个 driver 在 worktree 创建后写入，merge 完成清理 worktree 时一并删除。
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

## 验证（语义 probe，不写 canned-answer block）

按 ADR-0007 / `docs/POSTPR.md` L115 的硬约束，**不向 `CLAUDE.md` 或 `AGENTS.md` 写 FIXEDFLOW canned-answer block**。验证走一条：

1. `claudefast -p "explain TeamBrain FIXEDFLOW: 5 steps, who triggers step 3"` 必须有机命中本文 5 步与「step 3 由 maintainer 手动启动 /fixed-flow-driver skill」语义；与 `snapshots/fixedflow.canonical.txt` 对照。

完整 judge harness 见 `docs/plans/2026-05-09-fixed-flow/judge.md`（§V1 RUN / §V2 DUMP / §V3 READ）；historical 部分提到的 watcher / heartbeat 路径已不再适用。
