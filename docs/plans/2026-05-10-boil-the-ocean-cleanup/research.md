```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   research.md — boil-the-ocean-cleanup                             │
   │                                                                    │
   │   actions tag landscape │ claude-action root cause │ J5 limits      │
   │   wip/** trigger        │ secret matrix            │ ADR refs       │
   └────────────────────────────────────────────────────────────────────┘
```

# 1 GitHub Actions 版本现状

## 1.1 当前 pin（2026-05-10 进入 PR 前 fetch）

```
.github/workflows/ci.yml                    : checkout@v4, pnpm/action-setup@v4, setup-node@v4
.github/workflows/claudefast-anchors.yml    : checkout@v4, setup-node@v4
.github/workflows/inner-loop.yml            : checkout@v4, pnpm/action-setup@v4, setup-node@v4
.github/workflows/install-canned-answer-check.yml: checkout@v4, setup-node@v4, github-script@v7
.github/workflows/install-verify.yml        : checkout@v4 ×5, pnpm/action-setup@v4, setup-node@v4, upload-artifact@v4
.github/workflows/landing-deploy.yml        : checkout@v4, setup-node@v4, pnpm/action-setup@v4, upload-pages-artifact@v3, deploy-pages@v4
.github/workflows/nightly-llm-smoke.yml     : checkout@v4, pnpm/action-setup@v4, setup-node@v4
.github/workflows/release-branch.yml        : checkout@v4, setup-node@v4, pnpm/action-setup@v4
.github/workflows/v5-fixture-replay.yml     : checkout@v4, pnpm/action-setup@v4, setup-node@v4, github-script@v7
.github/workflows/claude.yml                : checkout@v4, anthropics/claude-code-action@v1   ← 删
.github/workflows/claude-code-review.yml    : checkout@v4, anthropics/claude-code-action@v1   ← 删
.github/workflows/issue-conformance.yml     : (script-only, no `uses:`)                       ← 不动
```

## 1.2 v5 stable tag 实测（`gh api repos/<owner>/<repo>/tags`）

| Action | latest major | v5 stable? | bump target | 理由 |
|---|---|---|---|---|
| actions/checkout | v6.0.2 | **v5.0.1 yes** | `@v5` | Node 24 兼容下限；不冲 v6 减少 surface area |
| actions/setup-node | v6.4.0 | **v5.0.0 yes** | `@v5` | 同上 |
| pnpm/action-setup | v6.0.6 | **v5.0.0 yes** | `@v5` | 同上 |
| actions/upload-artifact | v7.0.1 | **v5.0.0 yes** | `@v5` | 同上；v6/v7 有 deprecation 但 v5 仍是 Node 24 支持 |
| actions/github-script | v9.0.0 | n/a (跳过) | `@v8` (v8.0.0) | v9 引入 ESM-only `@actions/github` v9，`require()` 在 runtime 抛错；v8 是 Node 24 兼容且 CommonJS 仍可用的最稳定档 |
| actions/upload-pages-artifact | v5.0.0 | **v5.0.0 yes** | `@v5`（从 v3） | v3 是 Node 16/20，v5 内部已 bump upload-artifact v7 |
| actions/deploy-pages | v5.0.0 | **v5.0.0 yes** | `@v5` | release notes 显式："Update Node.js version to 24.x" |

**为什么不直接全冲 latest？** `@v5` 满足 Node 24 兼容硬指标即可；v6/v7 各家 release notes 多带 cache/path 行为微调（setup-node v6 改 cache key 算法、checkout v6 默认 `fetch-tags=false`），跨 2 个 major 的 collateral damage 风险高。一次 bump 只解一个明确问题（Node 24 deadline），bump 后跑 inner-loop CI 验证；后续 v5 EOL 时再单独 bump。

## 1.3 deadline 时间线

- **2026-06-02** GitHub runner 默认 Node.js 切到 24；v4 action 仍可跑但触发 deprecation warning。
- **2026-09-16** v4 action 在 Node 20 模式下被**移除**，强制 Node 24。**不 bump 则 CI 整体崩**。

距今 ~4 个月，不是 emergency；但 PR 工作量 < 30 分钟，顺手做掉减少未来分散维护成本。

---

# 2 claude.yml + claude-code-review.yml 失败根因

## 2.1 文件作用

- `.github/workflows/claude-code-review.yml`：每个 PR `opened/synchronize/ready_for_review/reopened` 时调用 `anthropics/claude-code-action@v1`，run `/code-review:code-review <repo>/pull/<n>`。
- `.github/workflows/claude.yml`：监听 `issue_comment` / `pull_request_review_comment` / `issues` / `pull_request_review`，body 含 `@claude` 时唤醒 `anthropics/claude-code-action@v1`。

## 2.2 失败根因

两个根因叠加：

1. **secret 名错位**：两个 workflow 都引用 `secrets.CLAUDE_CODE_OAUTH_TOKEN`（实际仓库该 secret **存在**），但用户原话说"workflow 引用 `secrets.ANTHROPIC_API_KEY`，但仓库 secret 只有 `MINIMAX_API_KEY` + `CLAUDE_CODE_OAUTH_TOKEN`"——可能是早期版本或某 step 的间接引用；当前文件直接引用 OAuth token，理论上可工作但仍持续红 X，说明**第二个根因更主导**。
2. **`anthropics/claude-code-action@v1` 自身 bug**：`Internal error: directory mismatch for directory ... tsconfig.json, fd 4`。这是 action runtime 内部错误，**不是** workflow 配置错误，无法在仓库这一侧 workaround。bump action 大版本可能修，但需要真 Anthropic API 账单（MiniMax token 走的是 Anthropic-compatible 端点，但 `claude-code-action` 不一定接受非官方 base URL；且非默认设置在 action input 里没暴露）。

## 2.3 ADR-0007 与 redundant 判定

ADR-0007（`docs/adr/0007-local-review-as-authoritative-gate.md`）明确：

> 本地 `/review` skill 是 PR 合并前的权威 review gate；cloud `claude-code-review.yml` 只作 supplementary，不阻塞 merge。

`memory/feedback_run_review_after_pr.md` 与 `docs/POSTPR.md` 也一致复述："Loop until /review PASS, do not gate on the cloud Codex bot." 既然 cloud 路径不阻塞、当前还跑不通、修根因要真 Anthropic billing，**直接删**比修便宜。

## 2.4 三种解法对比（用户原始消息已总结）

| 解法 | 工作量 | 失去能力 | 风险 |
|---|---|---|---|
| A 直接删 | 5 分钟 | cloud Claude review（已 broken，仓库本来就没用） | 0；ADR-0007 已声明本地 /review 权威 |
| B continue-on-error | 10 分钟 | 啥都不失去 | 假绿色，藏问题 |
| C 修根因 | 1 小时 + Anthropic 账单 | 啥都不失去 | 需付费账单；MiniMax 兼容未 verified |

用户已推荐 A。本 PR 取 A。

---

# 3 J5 完整曲线限制

## 3.1 spec 原始要求（来自 `docs/plans/2026-05-10-inner-loop-on-ci/judge.md` §J5）

```
N=1 / N=2 / N=3 / N=4：每加 1 session 同时跑（每 session 各自 push 不同 wip 分支让 CI 各自跑），
每档采一次 toohot --once，合并写 judge/J5/loadavg-curve.json。
Pass: post_change_samples[3].loadavg_1m < 100。
```

## 3.2 当前实际（`loadavg-curve.json`）

- form: lite — N=5 单点，loadavg_1m=8.54（vs baseline 274，32× drop）。
- limitations_acknowledged 三条：
  1. 单点不是曲线；
  2. driver agent 无法 spawn 用户 Mac 上的额外 Claude Code 窗口；
  3. 5m/15m loadavg 仍带本日早晨 toohot incident 的残余衰减。

## 3.3 driver agent 物理限制

- Claude Code session 是用户 GUI 进程，由用户在 Mac UI 上手动开启。
- driver agent 在自己的 session 内运行，无 OS-level GUI automation 权限（macOS sandbox + 没装 Hammerspoon / osascript 在此 session 不可用）。
- 即便能 spawn，CI 上每个 wip 分支对应一个独立 GitHub Actions runner，loadavg 是**用户 Mac 本地的**而非 runner 上的；本地 sample 必须由真坐在 Mac 前的人在每个 N 时间点跑 `toohot --once`。
- **结论**：driver 这条路堵死。能做的是写 runner playbook，让用户后续在心情好时半小时内手动收齐 4 个 sample。

## 3.4 现有 PASS 判定的强度

`loadavg-curve.json.regression_check` 给 verdict=PASS，理由：N=5 比 spec N=4 还多 1 个 session，loadavg 仍 8.54，远低于 100 阈值（12× headroom）。这是**比原 spec 更严格**的单点证据；曲线只是补强，不影响 inner-loop CI 路线的 ship 决策。

`docs/plans/2026-05-10-inner-loop-on-ci/judge/_overall/verdict.md` `J5 — PASS (lite form)` 已锁结论；本 PR 只补 follow-up 工具，不重判结论。

---

# 4 wip/** CI trigger（不动 inner-loop.yml 语义）

`inner-loop.yml`：

- trigger: `push` to `wip/**` （`*` 不跨 `/`，`**` 跨）。
- concurrency: `inner-loop-${{ github.ref }}`，`cancel-in-progress: true`（同分支新 push 取消旧 run）。
- env: `ANTHROPIC_API_KEY` 与 `MINIMAX_API_KEY` 都映射到 `secrets.MINIMAX_API_KEY`；`ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic`；3 个 default model 全 `MiniMax-M2.7-highspeed`；`API_TIMEOUT_MS=3000000`。
- steps: `checkout` → `pnpm/action-setup` → `setup-node` (node 22, cache pnpm) → `pnpm install --frozen-lockfile` → `pnpm test` → `pnpm verify`。

本 PR 只改 `uses:` 行的 `@v4` → `@v5`；node-version 22 不动（与 Node 24 兼容是 action 本身的事，跑 `pnpm test` 的 node 解释器版本由 setup-node 输入决定）。

# 5 Repo 状态截图（PR 起点）

```
branch: worktree-elegant-gathering-donut
HEAD:   264bb3a docs(toohot): post-merge report for inner-loop-on-ci PR #270
remote: origin = https://github.com/libz-renlab-ai/TeamBrain.git
sync:   origin/main..HEAD == 0 commits, HEAD..origin/main == 0 commits  → in sync
clean:  working tree clean, no untracked
```

# 6 secret 矩阵

| name | 用途 | 谁用 | 本 PR 动它吗 |
|---|---|---|---|
| `MINIMAX_API_KEY` | claudefast wrapper / inner-loop / claudefast-anchors | inner-loop.yml, claudefast-anchors.yml | 不动 |
| `CLAUDE_CODE_OAUTH_TOKEN` | claude-code-action | claude.yml, claude-code-review.yml | workflow 删了，secret 留着无害 |
| `ANTHROPIC_API_KEY` | （无 secret 名下数据；workflow 内是 alias env） | inner-loop.yml `env` 块映射自 MINIMAX_API_KEY | 不动 |

---

# 7 引用文档

- `docs/HOWTO-PLAN-PR.md` — 4 段 PR plan + judge.md md playbook 硬规则。
- `docs/POSTPR.md` — `/review` PASS 后 squash-merge + worktree cleanup 三步。
- `docs/PR-PLAN.md` — review 出问题就在本 PR 修，不开 follow-up issue。
- `docs/feature-verification.md` — 项目级 verification gate。
- `docs/FASTPROBE.md` — claudefast 三步探针。
- `docs/adr/0007-local-review-as-authoritative-gate.md` — 本地 /review 权威性来源。
- `docs/adr/0013-inner-loop-on-ci.md` — wip/** CI 路由由来（J5 baseline 274 数据点）。
- `docs/plans/2026-05-10-inner-loop-on-ci/judge.md` §J5 — full-curve spec 原文。
- `docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/loadavg-curve.json` — 当前 lite 单点。
- `~/.claude/CLAUDE.md` `feedback_judge_harness_md_playbook.md` — judge 必须 md playbook，禁 `scripts/*.sh`。
