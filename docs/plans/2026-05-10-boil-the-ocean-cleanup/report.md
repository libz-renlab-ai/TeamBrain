```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   report.md — boil-the-ocean-cleanup (PRE-MERGE DRAFT)             │
   │                                                                    │
   │   plan + judge → 4 atomic commits → wip CI green →                 │
   │   PR open → /review loop (in progress) → squash-merge (pending)    │
   │                                                                    │
   │   状态：PR-OPEN，pending /review PASS                                │
   └────────────────────────────────────────────────────────────────────┘
```

# Pre-merge report — boil-the-ocean-cleanup

## 状态：PR-OPEN

PR 已开，inner-loop.yml CI 已绿（run #25628617294，1m27s，conclusion=success）。
等待 `/review` 跑完后 squash-merge。

本文件是 pre-merge 草稿；squash 落地后追加 §post-merge 段。

## 实际交付（vs plan.md §2 expected outputs）

| Artifact | 期望 | 实际 | 偏差 |
|---|---|---|---|
| 9 个 workflow @v4 → @v5 | 13×checkout、9×setup-node、7×pnpm/action-setup、1×upload-artifact、1×upload-pages-artifact (@v3→@v5)、1×deploy-pages | ✓ 全部 bump，inner-loop CI 全绿 | 无 |
| github-script @v7 → @v8 | 2 文件（install-canned-answer-check + v5-fixture-replay） | ✓ | 无 |
| 删 claude-code-review.yml | option A（直接删） | ✓ | 无 |
| 删 claude.yml | option A | ✓ | 无 |
| J5 runner.md（md playbook，禁 .sh） | 4-point manual procedure，~20-30min | ✓ §2-§5 N=1..4 + §6 schema + §7 验证 + §8 失败模式 | 无 |
| loadavg-curve.json `follow_up_for_full_curve` 指向 runner | jq 字符串含 `runner.md` | ✓ | 无 |
| plan.md / research.md / judge.md | 三段铁律 + ASCII art + md playbook | ✓ | 无 |

## CI 证据

- run #25628617294: https://github.com/libz-renlab-ai/TeamBrain/actions/runs/25628617294
- branch: `wip/boil-the-ocean-cleanup`
- duration: 1m27s
- conclusion: success
- 验证 v5 action 在 ubuntu-latest 上的 `pnpm install --frozen-lockfile` + `pnpm test` + `pnpm verify` 全跑通

`Run actions/checkout@v5` / `Run pnpm/action-setup@v5` / `Run actions/setup-node@v5` 全 ✓，证明跨大版本 bump 没破坏 inner-loop pipeline。

## Atomic commits（4 个）

```
c732dfd docs(toohot): J5 full-curve runner playbook
9aacb03 chore(ci): drop redundant claude-code-review and claude workflows
b847377 chore(ci): bump GitHub Actions to Node 24-compatible v5/v8
b1f2e41 docs(boil-the-ocean): plan, research, judge harness for cleanup PR
```

每 commit 单一关注点，message 含 why（为何 bump、为何取 option A、为何 md playbook）。

## 偏差与原因

无偏差。plan.md §2 列的所有 expected outputs 都按 spec 落地。

## 风险

| 风险 | 概率 | 缓解 |
|---|---|---|
| @v5 action 在 PR 触发的 ci.yml（不是 inner-loop.yml）路径上行为不同 | 低 | ci.yml 与 inner-loop.yml 用同样 3 个 action（checkout/setup-node/pnpm/action-setup），inner-loop 已绿，差异主要在 matrix（windows + ubuntu）；windows runner Node 24 已支持 |
| github-script @v8 在某些 polyfill 上行为变化 | 中 | install-canned-answer-check.yml + v5-fixture-replay.yml 两处使用，POSTPR 跑 ci.yml 时 windows leg 可能暴露；workflow 都是 issue-creating，failure path 比 happy path 重要 |
| upload-pages-artifact @v3 → @v5（跨 2 大版本）出 schema 不兼容 | 中 | landing-deploy.yml 只在 push to main 触发，PR merge 后第一次 main push 可能暴露；如果挂，回滚单文件即可（不影响其它 workflow） |
| claude.yml / claude-code-review.yml 删除后用户在 issue/PR 评论 `@claude` 期待响应 | 低 | ADR-0007 已声明本地 `/review` 权威，仓库本来就不依赖 cloud Claude review；用户已明确推荐 option A |

## 后续事项

- `/review` 跑完后，PR-PLAN 处理任何 P1/P2（如有）。
- squash-merge 后跑 `/Users/m1/projects/TeamBrain/docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md` （optional，nice-to-have）。
- main push 触发 `landing-deploy.yml` 后观察一次 deploy；如挂，回滚 `upload-pages-artifact` 到 @v4。
- `MINIMAX_API_KEY` token rotate（P0，PR 范围外，secret 操作）由用户手动执行。

## §review-loop — /review 过程记录

`/review` skill 跑了一轮。dispatch 了 1 个 adversarial general-purpose subagent + 1 个 distribution/CI-CD specialist subagent。

### Subagent 报告整合

| 来源 | severity | confidence | 内容 | verdict |
|---|---|---|---|---|
| adversarial | CRITICAL | 9 | `actions/upload-pages-artifact@v5` 不存在，max v3.0.1 | **FALSE** — `gh api repos/actions/upload-pages-artifact/tags` 实测最新 v5.0.0；agent 说错 |
| adversarial | CRITICAL | 8 | `pnpm/action-setup@v5` 需要 explicit `version:` input | **FALSE** — packageManager 字段（`pnpm@9.15.9`）由 v5 action 默认读取；本 PR ci.yml ubuntu+windows 已绿，证伪 |
| adversarial | CRITICAL | 9 | 6 处 doc 描述删掉的 workflow 仍是 live（POSTPR / PR-PLAN / HOWTO-PLAN-PR / README / features/INDEX / features/claude-code-action） | **TRUE** — fix-up commit `a3cb647` 已修 |
| adversarial | INFO | 6 | J5 runner.md `等 ~10 秒` 与 CI runner 启动 30-90s 不对齐，会污染 sample | **FALSE 但 wording 模糊** — 本地 loadavg 与 CI runner CPU 无因果关系；fix-up commit 同步把 §2.3 wording 改清楚（10s 是等本地 push 退出，不是同步 CI runner 高峰） |
| adversarial | INFO | 5 | github-script@v8 在 v5-fixture-replay.yml 内 `if: false` 没跑过 | **TRUE 但低风险**——文件本来 disabled，等启用前用 workflow_dispatch 验证即可 |
| specialist | INFO | 9 | `landing-deploy.yml` 的 upload-pages-artifact @v3→@v5 跨 2 大版本，PR 内未触发 | **接受为 post-merge 风险**——v5 tag 真实存在；deploy-pages@v5 release notes 说 "Update Node.js version to 24.x" |
| specialist | INFO | 9 | `release-branch.yml` 仅在 push to main 时触发，PR 内未跑过 | **同上**——风险有界；如 break，回滚单文件 |
| specialist | INFO | 8 | claudefast-anchors / nightly-llm-smoke / install-canned-answer-check / v5-fixture-replay 仅 schedule/dispatch 触发 | **接受为 post-merge 风险**——不在 PR 触发面 |
| specialist | INFO | 10 | `secrets.CLAUDE_CODE_OAUTH_TOKEN` 删除两个 workflow 后变成 orphaned secret | **post-merge 手动清理**——repo admin 在 GitHub UI 删 secret |
| specialist | INFO | 7 | 所有 actions 用 moving major tag (`@v5`/`@v8`)，未 SHA-pin | **接受**——项目惯例如此；supply-chain 强化属于另一议题，不是 deadline 范围 |

### `/review` 处理决策

- **TRUE-CRITICAL（dangling docs）→ fix-up commit `a3cb647`**：6 个文件 52 inserts / 36 deletes。改动全是 prose tense + table row 注释，无 source / config 改动。
- **TRUE-INFO（J5 runner wording）→ 同 commit `a3cb647`**：1 line wording fix。
- **FALSE-CRITICAL（v5 不存在 / pnpm 需 version）→ 不动**：commit message 留下证据（`gh api` 实测 + ci.yml ubuntu+windows 已绿）。
- **post-merge INFO → 不动**：accepted risk，写在本 §和 plan.md §2.4 风险表里；merge 后跟踪 release-branch.yml + landing-deploy.yml 第一轮 push 的 run。

### CI 二次验证

`a3cb647` 推到 wip/boil-the-ocean-cleanup 后 inner-loop.yml 再跑一遍证明 doc 改动不破坏 build。

## §post-merge — 待 squash-merge 后追加

待落地：
- merge commit SHA
- 实际 squash 时间
- /review 第二轮（如有）verdict
- merge 后 main push 的 ci.yml + landing-deploy.yml + release-branch.yml run 状态（landing-deploy 本 PR 触发了路径，会跑）
- worktree cleanup 命令实际执行结果
- repo admin 删 orphaned `CLAUDE_CODE_OAUTH_TOKEN` secret 的状态
