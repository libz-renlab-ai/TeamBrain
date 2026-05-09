```
              ___        ___        ___       ___       ___
             |fix|  →   |verify|  →|review|  →|merge|  →|done|
             |___|       |___|      |___|     |___|      |___|
                merged at acd2525 on 2026-05-09T07:07:03Z (PR #206)
```

# Report — fix-session-start-hook

## Outcome

PR `#206` merged into `main` via `gh pr merge 206 --squash --delete-branch`. Squash commit on `main`: `acd2525 fix(session-start): lazy-load web-tree-sitter to unblock hook startup (#206)`. Remote branch `worktree-fix-start-hok` deleted on push side.

## What shipped (vs plan.md §2 "Expected outputs")

| 项 | 计划 | 实际 |
|---|---|---|
| 源码改动 | `packages/core/src/matcher/legacy/ast-context.ts` lazy import | ✅ commit `2d40623` 顶层 `import type` + `await import("web-tree-sitter")` 内 try/catch |
| 测试改动 | `packages/cli/src/__tests__/hook-bundle-contract.test.ts` 加 source + bundle 不变量 | ✅ commit `2d40623` 加两组 6 个测试；`c3fe986` 应用 /review 反馈：comment-strip + LAZY_REQUIRED_NATIVES 扩到 `tree-sitter-typescript` / `tree-sitter-python` |
| 计划文档 | `docs/plans/2026-05-09-fix-session-start-hook/{research,plan,judge,report}.md` | ✅ research/plan/judge 入第一 commit；report（本文件）作为 post-merge follow-up |
| 构建产物 | `packages/cli/dist/bin-session-start.cjs` 与 `packages/teamagent/dist/bin-session-start.cjs` 顶层无 `var X = require("web-tree-sitter")` | ✅ judge harness step 3 grep count = 0 |
| 运行验证 | bin-session-start 烟测 exit 0、stderr 无 `MODULE_NOT_FOUND` | ✅ judge harness step 4 |
| 单元测试 | `pnpm exec vitest run hook-bundle-contract` 全绿 | ✅ 6/6 pass（step 5）；全仓 1794/1794 pass |
| 类型检查 | `pnpm typecheck` 全绿 | ✅ |
| PR 形态 | normal (非 draft) | ✅ |
| `/review` | 循环到 PASS | ✅ 第一轮 PASS（adversarial subagent）+ auto-fix 4 个 INFO 中的 2 个 + 第二轮 PASS |
| 合并方式 | `gh pr merge --squash` | ✅ |

## 偏差

1. **已 staged 的 hook bin 不会被本 PR 修复**：`~/.teamagent/hooks/bin-session-start.cjs` 仍是旧 bundle（245383 bytes，line 4398 顶层 `require("web-tree-sitter")`）。用户在这台机器要拿到 fix 必须重跑 `teamagent install-user-hook`、或 `pnpm install` 触发 postinstall、或 npm 重装。这点在 plan §1（不做什么）和 PR body 里都已声明，不是"漏做"。
2. **合并后 gh CLI 报 `failed to run git: fatal: 'main' is already checked out at '/Users/m1/projects/TeamBrain'`**：是 `gh` 想把当前 worktree 切到 main 时撞上父 checkout 已占 main，**不影响合并本身**——`gh pr view --json state` 显示 `MERGED`、`mergedAt: 2026-05-09T07:07:03Z`、`mergeCommit: acd2525...`。后续再清当前 worktree（`fix-start-hok`）和本地分支 `worktree-fix-start-hok` 即可，合并状态权威在远端。
3. **/review 第一轮的 5 个 INFO 中只 auto-fix 了 2 个**：剩 3 个（pre-existing 并发竞态、`Parser.init` 不在 try/catch 里、`docstring slightly misleading`）属于 pre-existing 行为或读者误读，超出本 PR 范围；如有需要可作为独立 follow-up issue。

## 未做（明确不在范围）

- 没改 `packages/teamagent/tsup.config.ts` 的 `NATIVE_EXTERNAL` / `packages/cli/tsup.hook.config.ts` 的 `external` 列表；两份 tsup 配置发散是另一个独立 cleanup PR。
- 没动 matcher 上层（`match.ts` / `keyword-matcher.ts` / `soft-and-scorer.ts` 等）。
- 没把 `~/.teamagent/hooks/` 已 staged 的 bin 重写——重装才能拿到 fix。
- 没改 CHANGELOG（仓库现无 CHANGELOG.md；项目 release notes 走 git history + PR body）。

## Judge harness 结果（locked-in）

`run_id = 2026-05-09T064714Z`，`.judge/` 是 `.gitignore` 里的目录，artifact 仍保留在本 worktree（不会进入 git）：

| step | 名称 | exit | metric |
|---|---|---|---|
| 1 | `pnpm typecheck` | 0 | — |
| 2 | `pnpm --filter @teamagent/cli run build:hook`（cli 配置，inline w-t-s） | 0 | — |
| 2b | `pnpm --filter teamagent run build`（teamagent 配置，external w-t-s——崩过的那条路径） | 0 | bin-session-start.cjs 247938 bytes |
| 3 | `grep -nE 'var [A-Za-z_0-9]+ = require\("web-tree-sitter"\)' bin-session-start.cjs` | 1 (no match) | top_level_require_count = 0 |
| 4 | `printf '{"hook_event_name":"SessionStart","cwd":"/tmp"}' \| node bin-session-start.cjs` | 0 | stderr_has_module_not_found = false, stderr_has_web_tree_sitter = false |
| 5 | `pnpm exec vitest run hook-bundle-contract.test.ts` | 0 | 6 / 6 pass |

第三方 LLM judge（Explore subagent，只读 raw judge.json + step files，不读源码 / 不跑工具）：`VERDICT: PASS`，6 个 pass criteria 全部命中。

## 后续事项

- **可独立成 PR 的低优先级 follow-up**：
  - `initAstMatcher()` 把 `Parser.init` 拉进 try/catch + 缓存 in-flight Promise 解决 pre-existing 并发竞态。
  - 统一 `packages/teamagent/tsup.config.ts` 与 `packages/cli/tsup.hook.config.ts` 的 native external 列表（目前 cli inline w-t-s、teamagent external w-t-s，两份 bundle 行为分叉）。
  - 把 `LAZY_REQUIRED_NATIVES` 进一步扩到 `sharp` / `onnxruntime-node` / `sqlite-vec` / `better-sqlite3`（先确认它们目前是否真的 lazy 再加，避免一加就红）。
- **本地 worktree 清理（不在本 commit 范围）**：合并完成后 `/Users/m1/projects/TeamBrain/.claude/worktrees/fix-start-hok` 与本地分支 `worktree-fix-start-hok` 已经无用，由用户决定何时回收（`git worktree remove --force <path>` + `git branch -D worktree-fix-start-hok`）。
