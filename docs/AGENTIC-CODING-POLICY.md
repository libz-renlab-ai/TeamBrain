```text
            __        Agentic-Coding Blind Verification
       ___ ( o)>      Policy — TeamBrain in-repo SSOT.
       \   <_. )      14 grill-resolved boundaries that
        `---'         keep coding agents fast AND honest:
                      no self-grading, no self-witness
                      tests, no canned-answer enforcement.
```

# Agentic Coding Blind Verification Policy

适用范围：TeamBrain 仓库的全部 coding-agent 工作流（`/fixed-flow-driver`、subagent、`claudefast -p` 探针、`/review` skill 调用、PR-PLAN fix-loop）。

本文是 **in-repo SSOT**：政策原意见 issue #273 grill 评论；本文是落地版本，所有冲突点已在 issue #273 grill round 2（`/grill-with-docs`）中映射到既有 TeamBrain primitive。**冲突时本文优先于 grill 原文，但仍下游于 ADR**。

---

## 0. TL;DR — 三条铁律

1. **主 coding agent 修代码，不自己当 judge。** 验证由 `/review` skill（ADR-0007） + Verification subagent（本文 §3） + scenario fixture corpus（ADR-0010） 三组 host-agent-internal 入口共同承担；TeamBrain core 永远 LLM-free（ADR-0004）。
2. **测试代码分两类。** Contract / fixture / regression test **进 repo**（TDD red-green-refactor 必需）；self-witness ad-hoc test **不进 repo**（落 `/tmp` 或 `.fixedflow/<issue>/scratch/`）。
3. **真文档 + matcher 是 enforcement substrate。** `claudefast -p` 探针走真文档语义检索（self-discipline-via-matcher）；不允许 canned-answer block / hook anchor regex 替代真 doc（ADR-0007）。

---

## 1. 角色 → TeamBrain primitive 映射

| policy 角色 | TeamBrain primitive | 物理位置 | 调用入口 |
|------|------|------|------|
| 主 coding agent | `/fixed-flow-driver` skill 实例 | `.claude/skills/fixed-flow-driver/SKILL.md` | maintainer 在 Claude Code 会话**手动**唤起 |
| Verification subagent | driver 内 Claude Code Agent-tool 派生 subagent | driver 运行时（非持久化） | `/fixed-flow-driver` step 4 fix-loop 内 spawn |
| `/review` skill | gstack user-level skill (ADR-0007) | `~/.claude/skills/review/SKILL.md` | driver step 4 fix-loop 入口 |
| Calibration subagent | 既有 (ADR-0004) — rule maturity tier 重判 | host agent 进程内，独立链路 | 与本 policy 正交 |

> Grill resolution §12.

---

## 2. 测试代码二分（grill §1 / §5）

| 类别 | 是否进 repo | 例 |
|------|------------|-----|
| **Contract / fixture / regression** | ✅ 进 | `packages/ports/src/__tests__/*-contract.ts`, `tests/fixtures/scenarios/<feature-slug>--<scenario-name>/`（ADR-0010） |
| **Self-witness ad-hoc** | ❌ 不进，落 `/tmp` 或 `.fixedflow/<issue>/scratch/` | 一次性 repro 脚本、临时 mock 服务 |

**TDD 不被禁。** `CLAUDE.md` 元约束「**新增 Port 必须先写契约测试再写实现**」与「TDD red-green-refactor」依然有效。区别：grill comment / issue body / PR-PLAN 已规划的 acceptance criteria 对应的测试是计划产物，**应当**由主 agent 写、commit；主 agent 为「让自己安心」临时新增的 throwaway 测试**不得** git add。

scenario fixture 走 ADR-0010 三层 replay tier (a/b/c) α-strict gate；外部回归走 `tests/fixtures/scenarios/` 而非另立 external suite。

---

## 3. Verification subagent

**职责**：在 `/fixed-flow-driver` 的 step 4 `/review loop` 内、每轮 fix commit 之后、`/review` 之前，由 driver spawn 一个 Claude Code Agent-tool 派生 subagent，独立攻击 `git diff HEAD~1`、提出 repro 命令 + pass/fail 判断 + 反例输入；结果写入当前 `docs/plans/<date>-pr-<n>-fix-plan.md` 的 `## How to eval` §judge harness 段。

**约束**：

- **不进** `packages/core/`（FCIS 元约束：core 禁 import `fs` / `node:child_process`）。
- **不进** `packages/cli/`（不通过 `pnpm teamagent` CLI 命令暴露）。
- **不直接** `bus.emit({...})`（AttributionBus 是 hook channel 的事，per ADR-0008 / ADR-0009）。
- **不读** `/review` skill 的输出（避免对答案过拟合）；读 diff、commit message、grill comment。
- **不修改** repo 文件（read-only diff analysis + 出 repro 命令；fix 由主 agent 应用）。

**输出格式**：写到 `fix-plan.md` 的 §judge harness 子段，与 `claudefast -p` 探针并列；不替代 `/review` skill 的权威 gate（per ADR-0007）。

> Grill resolution §2 / §10 / §13。

---

## 4. Feature lookup — Option α（grill §4）

不引入 `feature_index` 12-字段 schema，不引入 `interface FeatureIndex`。Feature 索引走既有三件套：

- `docs/features/INDEX.md` —— 人写 prose 索引；
- `docs/feature-inventory/` —— 机器跑出的快照；
- M4-B BM25+dense-RRF+soft-AND matcher（CONTEXT.md `Self-discipline-via-matcher`）。

**通过判据**：`claudefast -p "what are the related PRs and Issues for feature <X>?"` semantic probe 能从真文档检索回相关 PR / Issue / fixture（ADR-0010 命名）/ docs 段落。Option β（新建 `packages/core/src/feature-index/` + `pnpm teamagent feature-index list/show`）需独立 ADR（reserved as ADR-0014），**不**进 issue #273。

---

## 5. 验证命令统一走 `claudefast`（grill §3）

**禁** policy 文档 hardcode `claude -p --model haiku`（绕过 `claudefast` wrapper、暴露 token、违反用户级默认 MiniMax-M2.7-highspeed）。

**改用**：

```bash
claudefast -p "what is the right api for <feature_or_module>? answer in the form: old API / new API / deprecation warning"
```

通过判据三段（old API / new API / deprecation warning）保留；模型选择由 `claudefast` wrapper 内部决定，policy 不写死。详 `docs/CLAUDEFAST.md`。

---

## 6. Merge gate（grill §6 / §7）

**Gate 0（前置，权威）**：本地 `/review` skill PASS（ADR-0007）。fail 则进入 §7 fix-loop，**不允许跳过**。

**Gate 1-12（下游 sub-criteria，由 `/review` 内部判据可能引用）**：existing tools / build / lint / typecheck / Verification subagent / 安全 / 依赖 / 回归 / scenario fixture corpus（ADR-0010） / minimal diff / `claudefast` docs gate（§5） / `claudefast` feature lookup probe（§4）。

**合并命令（hardcode）**：

```bash
gh pr merge <N> --squash --delete-branch
```

**严禁**：`--merge` / `--rebase`（user-level memory 锁定 squash-only）；`--draft`（开 PR 时禁；project-level CLAUDE.md 锁定）。

---

## 7. Fix-loop 与 PR-PLAN 强制（grill §8 / §9）

PR 一旦开起，每一轮 `/review` finding 必须写或更新：

```
docs/plans/<YYYY-MM-DD>-pr-<N>-fix-plan.md
```

三段铁律（per `docs/PR-PLAN.md` + `docs/PLAN-RESEARCH-REPORT.md`）：**task description / expected outputs / third-party judge harness**。**严禁**开 follow-up issue / follow-up PR 替代 PR-PLAN（POSTPR.md hard rule）。

**循环上限**：50 iter（≈ 2-4h CI 时间）。超即 driver 自动加 `needs-human` label + 退出，不再无限烧 token（per ADR-0013 单轮 2-5 min CI 时间预算）。

**测试通道**（per ADR-0013）：

- full-suite `pnpm test` / `pnpm verify`：**禁本地直跑**；推 `wip/**` 分支触发 `.github/workflows/inner-loop.yml`。
- 单文件 targeted vitest（`pnpm vitest run path/to/x.test.ts`）：允许本地，作 fix-loop 内快速 smoke。
- 最终 PR-gate：现有 `.github/workflows/ci.yml`（ubuntu + windows + typecheck），不动。

**Token-burn 公示**：driver 在 iter ∈ {10, 25, 50, 100} 时 `PushNotification`，每 10 iter 在 issue 上贴 token 摘要评论（per `docs/FIXEDFLOW.md` L129）。

---

## 8. 政策不替代什么（grill §11 / §14）

**Stop hook 12-field `<self-report>` 契约独立**：本 policy 仅约束 PR/issue body 与 comments 的 audit timeline；`.claude/hooks/self-report-fused.sh` 强制每条 assistant message 末尾的 12-field block（`premature_stopping` / ... / `silent_fallback`，per `docs/STOP-HOOKS.md`）**不被本节豁免**。两层独立。

**out-of-scope（不在 issue #273 PR 内做）**：

- `feature_index` schema（Option β，留 ADR-0014）；
- Verification subagent 自动挂 PostToolUse hook（留独立 ADR）；
- `pnpm teamagent verify-subagent` CLI 命令；
- public API 弃用周期具体落地策略；
- 改写 ADR-0007 / ADR-0010 / ADR-0013 的决策（policy 仅引用）。

---

## 9. References

- ADR-0004（Calibration via Claude Code subagent）—— TeamBrain core LLM-free。
- ADR-0007（Local `/review` skill as POSTPR review gate）—— gate 0 唯一权威。
- ADR-0008（HookShell as imperative shell）—— 8 hook channel 共享 shell；FCIS。
- ADR-0009（Delivery mode as metadata）—— `bus.emit({...})` 禁 `process.stderr.write`。
- ADR-0010（Bottom-level fixtures）—— `tests/fixtures/scenarios/<feature-slug>--<scenario-name>/` α-strict 三层 replay tier。
- ADR-0013（Inner-loop tests on dedicated CI workflow）—— `wip/**` 推送触发 inner-loop CI。
- `docs/FIXEDFLOW.md` —— issue→PR→merge 5-step；step 3-5 由 `/fixed-flow-driver` skill 手动驱动。
- `docs/HOWTO-PLAN-PR.md` —— 4-section PR plan（plan / outputs / how-to-verify / probes）。
- `docs/PR-PLAN.md` —— 同 PR 内 fix-loop 三段铁律；禁 follow-up issue。
- `docs/POSTPR.md` —— `/review` 循环至 PASS + squash-merge + cleanup。
- `docs/PLAN-RESEARCH-REPORT.md` —— `plan.md` / `research.md` / `report.md` 项目级 SSOT。
- `docs/CLAUDEFAST.md` —— `claudefast -p` 验证 wrapper 约定。
- `docs/feature-verification.md` —— feature-verification gate（`--help` canonical JSON 锚）。
- `docs/STOP-HOOKS.md` —— `.claude/hooks/self-report-fused.sh` 12-field 契约。
- `docs/CONTEXT.md` `### Subagents in the verification stack` —— Verification / `/review` / Calibration 三联表。
- `.claude/skills/fixed-flow-driver/SKILL.md` step 4 —— Verification subagent spawn point。
