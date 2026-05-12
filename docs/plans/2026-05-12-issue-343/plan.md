# plan.md — issue #343 PR-1: `TEAMAGENT_DISABLED=1` env master kill switch

> 走 `docs/HOWTO-PLAN-PR.md` 四段结构 + 三段铁律（task / outputs / judge harness md playbook）。
> Research：[`./research.md`](./research.md) — 已锁定 5 个 early-return 注入点。
> Judge harness：[`./judge.md`](./judge.md) — §V1 RUN / §V2 DUMP / §V3 READ playbook（不是 bash script）。

---

## ① Task description

### 做什么

给 TeamBrain 装一个**主电源开关**：当用户 shell 里设 `TEAMAGENT_DISABLED=1`，**所有 hook 立即 early-return**，零 token cost、零 stderr、零 AttributionBus event、零 filesystem mutation。

**精确注入点**（来自 research §3）：

| # | 文件 | 行 | 改法 |
|---|---|---|---|
| 1 | `packages/cli/src/bin-session-start.ts` | 115 | handler 入口 `if (ctx.env.TEAMAGENT_DISABLED === "1") return undefined;` |
| 2 | `packages/cli/src/bin-user-prompt-submit.ts` | 105 | handler 入口 `if (ctx.env.TEAMAGENT_DISABLED === "1") return undefined;` *(commit 2，self-/review caught gap)* |
| 3 | `packages/cli/src/bin-pre-tool-use.ts` | 93 | handler 入口 `if (ctx.env.TEAMAGENT_DISABLED === "1") return { permissionDecision: "allow" };` |
| 4 | `packages/cli/src/bin-post-tool-use.ts` | 35 | handler 入口 `if (ctx.env.TEAMAGENT_DISABLED === "1") return {};` *(commit 2)* |
| 5 | `packages/cli/src/bin-stop.ts` | 949 | handler 入口 `if (ctx.env.TEAMAGENT_DISABLED === "1") return;` — **一个 check 覆盖 detached / async / sync 三路径**（research 原提议 3 个 check，实现时按 DRY 简化为 1 个） |
| 6 | `packages/cli/src/bin-session-end.ts` | 72 | handler 入口 `if (ctx.env.TEAMAGENT_DISABLED === "1") return;` *(commit 2)* |
| 7 | `packages/cli/src/bin-pre-compact.ts` | 87 | handler 入口 `if (process.env.TEAMAGENT_DISABLED === "1") return undefined;` *(commit 2，pre-compact handler 类型 narrow 不暴露 ctx.env，读 process.env)* |
| 8 | `packages/cli/src/bin-digital-twin-tap.ts` | 184 | `main()` 顶 `if (process.env.TEAMAGENT_DISABLED === "1") return;` *(commit 2，digital-twin-tap 不走 runHook/runAdvancedHook，无 ctx.env)* |

### 为什么

PR-2 / PR-3 要跑 TB-ON vs TB-OFF 配对实验测 token 成本。没有这个开关，TB-OFF 只能 `pnpm teamagent uninstall`（重 + 多副作用），无法做配对 t-test。这是整个 #343 epic 的**基础设施 prereq**。

### 不在范围（anti-scope）

- ❌ 题库构建（PR-2）
- ❌ Counterfactual Ablation harness（PR-2）
- ❌ scipy `judge.py`（PR-2）
- ❌ token 计量 overlay（PR-3）
- ❌ 最终 A4 报告（PR-3）
- ❌ User-level skills layer 隔离工具（不需要——本 PR 只关 hook，skills 文件在 disable 状态下 Claude Code 还是会读，这正是"主电源开关"的最小语义，不混入 layer 2/3）
- ❌ CLAUDE.md TeamAgent 经验段擦除（同上）
- ❌ 任何 CLI subcommand 行为（`teamagent compile / init / doctor` 等不动）

### LOC 预算

代码净增 ~30 LOC（5 个 early-return + 类型声明）+ 单测净增 ~80 LOC + docs ~30 LOC = **总 ~140 LOC**，远低于 TRIAGE-AND-SPLIT 的 1500 LOC 红线。

---

## ② Expected outputs

### 代码

- [ ] `packages/cli/src/bin-session-start.ts:114` 加 early-return
- [ ] `packages/cli/src/bin-pre-tool-use.ts:99` 加 fast-allow
- [ ] `packages/cli/src/bin-stop.ts:{955, 984, 1060}` 三路径各加 early-return

### 测试

- [ ] `packages/cli/src/__tests__/bin-session-start*.test.ts` 加 1 个 case：env=1 时 handler 返回 undefined，无 fs mutation
- [ ] `packages/cli/src/__tests__/bin-pre-tool-use*.test.ts` 加 1 个 case：env=1 时返回 `{permissionDecision: "allow"}`，无 matcher 触发
- [ ] `packages/cli/src/__tests__/bin-stop*.test.ts` 加 3 个 case：env=1 时 detached / async / sync 三路径均不进 pipeline
- [ ] 新增 `packages/cli/src/__tests__/disabled-env.test.ts`（integration）：3 个 hook 各跑一次，env=1 vs 未设，对比 duration / AttributionBus event count / stderr 行数

### 文档

- [ ] `CHANGELOG.md` 加条目：`feat: TEAMAGENT_DISABLED=1 env disables all hooks (master kill switch for A/B benchmarking, #343)`
- [ ] `docs/features/hooks-status.md`（或同级 env-vars 文档）加 `TEAMAGENT_DISABLED` 段：value `"1"` enables, anything else / unset means enabled
- [ ] `docs/plans/2026-05-12-issue-343/report.md` 记录跑通的证据（claudefast probe `.debug.log` 摘录 + vitest 输出）

### PR 工件

- [ ] **普通 PR**（非 draft），title：`feat(issue-343): TEAMAGENT_DISABLED=1 env master kill switch (PR-1/3)`
- [ ] commit message 格式：`feat(issue-343): add TEAMAGENT_DISABLED=1 env kill switch to all hook entry points`
- [ ] `/review` PASS 后 `gh pr merge <N> --squash --delete-branch`（per `docs/POSTPR.md`）
- [ ] 接 `docs/POSTPR.md` 三步 cleanup（worktree remove → `git pull --ff-only`）
- [ ] **PR 描述里附 claudefast `/export` 的 transcript 文件**

### Negative outputs（anti-regression）

- ✋ `packages/cli/src/commands/install-hook.ts` 不动（仅 hook 行为变化，注册流程不变）
- ✋ `~/.claude/settings.json` 不被修改（仅 hook 内部 early-return）
- ✋ Statusline 渲染不受影响（statusline 走 `settings.local.json` 的 command 字段直接调 `scripts/teamagent-statusline.cjs`，独立 subprocess，不经 hook）
- ✋ `pnpm teamagent compile / init / doctor / update` 等 CLI 子命令行为不变
- ✋ Auto-update / postinstall warmup 行为不变
- ✋ 任何 ADR-0010 / ADR-0012 fixture-replay 测试在 env 未设时全绿

---

## ③ How-to-verify — md playbook

**Hard rule**：judge harness 是 `docs/plans/2026-05-12-issue-343/judge.md` 的 §V1/§V2/§V3 playbook（main agent dispatch），**不是** `scripts/*.sh`。详见 [`./judge.md`](./judge.md)。

### §V1 RUN（执行）

按 `judge.md` §V1：

1. `pnpm install && pnpm build` 一次
2. 三条 vitest targeted 跑（不跑全量，参 ADR-0013）：
   - `pnpm vitest run packages/cli/src/__tests__/bin-session-start*`
   - `pnpm vitest run packages/cli/src/__tests__/bin-pre-tool-use*`
   - `pnpm vitest run packages/cli/src/__tests__/bin-stop*`
   - `pnpm vitest run packages/cli/src/__tests__/disabled-env.test.ts`
3. 两条 claudefast probe（见 § ④）

### §V2 DUMP（产 evidence JSON）

`judge.md` §V2 把 vitest stdout + claudefast `.debug.log` + AttributionBus event count + filesystem mtime diff → 写 `docs/plans/2026-05-12-issue-343/evidence/<run-id>/{vitest.json, probe.json, fs-diff.json}`。

### §V3 READ（main agent 读 JSON 出 PASS/FAIL）

判定规则（写死在 judge.md）：

- ✅ PASS = vitest exit 0 **且** disabled probe `.debug.log` 完全不含 `[teamagent]` 字样 **且** `AttributionBus` event count = 0 **且** filesystem mtime diff = ∅
- ❌ FAIL = 任一条不满足

LLM 不参与判定，判定来自 grep / count / hash 这些 pre-existing 工具。

---

## ④ claudefast probes（具体可跑命令）

### Probe 1: `TEAMAGENT_DISABLED=1` 时 SessionStart 静默

```bash
TEAMAGENT_DISABLED=1 claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/issue-343-pr1/disabled-session.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "echo hello"
```

Expected：
- exit 0
- `disabled-session.debug.log` 完全不含 TeamBrain banner / matcher / M5 / updater 任何输出
- stdout 不被 TB 改写

### Probe 2: 配对对照（baseline vs disabled）

跑同一 prompt 两遍。Baseline：

```bash
claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/issue-343-pr1/baseline-session.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "echo hello"
```

Disabled = Probe 1。**预期差异**：baseline `.debug.log` 含 TB 注入字符串，disabled 不含。`judge.md` §V3 用 byte-level diff 出判决。

---

## 风险 & 边角处理

10 条来自 research §7。本 PR 主要 mitigation：

- 所有 early-return 在 handler **入口前**，确保不会出现 partial state
- `writeStopLock()` 在 line 433（detached / async 路径都在 lock 之前 early-return）→ 不会留 lock leak
- Statusline 独立 subprocess，env 不通过 hook 链传播 → 不受影响
- ADR-0010 fixture-replay 跑测试时**默认不设 env**，不会 false-negative

完整风险表见 research §7。
