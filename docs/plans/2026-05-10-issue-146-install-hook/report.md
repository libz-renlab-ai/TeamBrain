```
   _____
  ( o>    issue-146 install-hook TODO — fused PR #265 squash-merged
   \\_<_)  daemon binary now staged via teamagent install-hook
    |  |   issue-146 series F-list 至此全部 closed
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  step 0           step 1            step 2-3            step 4-5
  ────────         ──────            ─────────────       ──────────
  user picks       worktree at       defaultDaemon-      push → PR #265
  option B         .codex/...        BinaryEntry +       auto-merge on
  + "one fused"    feat/issue-       stageDaemonBinary-  CI green → squash
                   146-install-hook  ToUser + JSDoc      (commit c40319d)
                                     fix → 6 new tests
```

# Issue #146 install-hook TODO — post-merge report

| 字段 | 值 |
|------|-----|
| issue | [#146](https://github.com/libz-renlab-ai/TeamBrain/issues/146) (multi-part umbrella — F1/F2/F3/F9 全 closed；本 PR 收掉 F1 report 列的 install-hook TODO；至此 issue-146 series 已无 open follow-up) |
| PR | [#265](https://github.com/libz-renlab-ai/TeamBrain/pull/265) |
| squash commit | `c40319d` on `main` |
| branch | `feat/issue-146-install-hook` (本地 + 远端均已删) |
| commit count on branch | 1 (per "one fused") |
| /review iter | 0 — 自审 + CI gating（option B） |
| 时间窗 | ~2026-05-10 13:30 → 14:00 UTC |

## 实际执行链

| step | 动作 | 锚点 |
|------|------|------|
| 0 | 锚点：`docs/plans/issue-146-f1/report.md` 「Open follow-ups」段 + `bin-digital-twin-tap.ts:resolveDaemonBin` JSDoc 里的 TODO 注释，确认 install-hook TODO 是 issue-146 series 仅剩的 open item | F1 report.md L60-63 + JSDoc L106-111 |
| 1 | worktree `.codex/worktrees/issue-146-install-hook` off `origin/main` + `feat/issue-146-install-hook` branch | `git worktree add` 干净 |
| 2 | 在 `install-hook.ts` 加 `defaultDaemonBinaryEntry()` (mirrors `resolveDaemonBin` monorepo path) + `stageDaemonBinaryToUser()` exported helper（atomic tmp+rename + skip-if-newer + best-effort）；扩 `InstallHookOptions.daemonBinaryEntry` + `installHook` return type 加 `daemonBinary: DaemonStagingResult` | install-hook.ts L168-241 |
| 3 | 在 `installHook()` 末尾（`applyUserLevelChannelOps` 之后）调用 `stageDaemonBinaryToUser` | install-hook.ts L887-895 |
| 4 | `bin-digital-twin-tap.ts` `resolveDaemonBin` JSDoc：移除 TODO，把 self-install 重新定位为 "fresh-install + dev-worktree safety net" | bin-digital-twin-tap.ts L106-117 |
| 5 | 加 6 个新单测（helper happy path / source missing / idempotent skip-if-newer / stale-overwrite / installHook 集成 / installHook 缺源 no-throw） | install-hook.test.ts +109 lines |
| 6 | typecheck 通过 + 全 187 文件 / 2245 tests + 2 skipped 全绿 | `pnpm typecheck` exit 0 |
| 7 | fused commit `460c940`：3 files, +243/-7；commit message 含 "Did" + "Did not" | git log |
| 8 | push + `gh pr create` 普通 PR (非 draft) → PR #265 | github.com/.../pull/265 |
| 9 | `gh pr merge 265 --squash --auto` → CI 三平台全绿 → auto-merge fire → squash 落 `c40319d` | merge timestamp 2026-05-10T05:50:17Z |
| 10 | 清 worktree + delete local branch + delete remote branch + `git pull --ff-only` 同步父 checkout main | 见上文 git log |

## Deviations

1. **No FIXEDFLOW**：没单独开 ≤50 字 issue + grill；option B 是 user 显式选择。
2. **No /review iter**：option B；本地 /review skill 没在这条链上跑——CI 的 `claude-review` cloud bot 提供 informational pass。
3. **npm-flat install layout 路径未覆盖**：`defaultDaemonBinaryEntry()` 仅返回 monorepo 路径 `<cliRoot>/../digital-twin/dist/bin-uploader.cjs`。npm flat 分发场景（`npm install -g github:...#release`）下，digital-twin 的 dist 可能与 cli 的 dist colocated。缓解：caller 可显式传 `daemonBinaryEntry` 覆盖；运行时 `resolveDaemonBin` 的 self-install fallback 仍兜底。Follow-up 可以 mirror `findUpdaterBinary` 的 candidates list。
4. **No issue close**：父级 #146 仍 OPEN（multi-part umbrella，本 PR 不闭，因为没 doc 说所有 sub-tasks 都跑完了等于父 issue close）。

## 验证证据

| Judge | 命令 / 锚点 | 结果 |
|-------|------------|------|
| J1 typecheck | `pnpm typecheck` | exit 0 |
| J2 install-hook suite | `pnpm exec vitest run packages/cli/src/__tests__/install-hook.test.ts` | 53 passed (47 existing + 6 new) |
| J3 全量回归 | `pnpm exec vitest run packages/cli packages/core packages/digital-twin` | 187 files / **2245 passed + 2 skipped** |
| J4 dest 路径契约 | `installHook({...}).daemonBinary.destPath === <home>/.teamagent/digital-twin/bin-uploader.cjs` | passed |
| J5 best-effort 契约 | `installHook` with non-existent `daemonBinaryEntry` returns `{staged:false, reason:"source missing..."}` 不抛错 | passed |
| J6 idempotency | 二次调用 `stageDaemonBinaryToUser` skip-if-newer 路径 dest mtime 不变 | passed |
| J7 stale overwrite | 把 dest mtime 改老 + source 改新，再调用应覆盖 | passed |
| CI ubuntu | GitHub Actions | passed |
| CI windows | GitHub Actions | passed |
| CI claude-review | GitHub Actions | passed |

## issue-146 series 收口状态

| F# | scope | PR | 状态 |
|----|-------|----|------|
| F1 | bin-uploader.cjs 没 build → daemon 永远跑不起来 | #252 | ✅ MERGED |
| F2 | envelope schema mismatch | #263 | ✅ MERGED |
| F3 | recording not attached to daemon | #263 | ✅ MERGED |
| F9 | zero-touch silent amplification (consent + first-run banner) | #263 | ✅ MERGED |
| install-hook TODO | bin-uploader.cjs 升级管线 | #265 (本) | ✅ MERGED |

**至此 issue-146 series 的所有 documented follow-up 全部 closed。父级 issue #146 是否 close 由 maintainer 决定。**

## 链接

- PR: https://github.com/libz-renlab-ai/TeamBrain/pull/265
- squash commit: https://github.com/libz-renlab-ai/TeamBrain/commit/c40319d
- 兄弟 reports: [issue-146-f1](../issue-146-f1/report.md) · [2026-05-10-issue-146-f2-f3-f9](../2026-05-10-issue-146-f2-f3-f9/report.md)
- 父 issue：[#146](https://github.com/libz-renlab-ai/TeamBrain/issues/146)（仍 OPEN）
