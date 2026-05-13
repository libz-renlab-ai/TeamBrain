```text
   plan         research        impl                  judge          report
   ─────  ───►  ─────────  ───► ──────────────────► ──────────────► ──────
   plan.md     research.md    parser fix +         judge.md +       (this)
   3-section   root cause    fresh-dir tests       evidence/run_id
   rigor       diagnosed     in init.test.ts       v3-verdict PASS
```

# Report — Feature ① init-in-new-repo judge harness

> **Update 2026-05-12** (PR #399): the 2026-05-11 PASS evidence in this report
> documents a harness that invoked bare `tsx` and PASSed because the original
> caller happened to have `tsx` on `$PATH`. A fresh worktree (without a global
> `tsx`) got exit 127. The harness recipe in `judge.md` §V1 Step 2 has been
> pinned to `$REPO_ROOT/node_modules/.bin/tsx` with an exit-127 guard. Fresh
> PASS evidence using the pinned recipe lives at
> `evidence/20260512T172508Z-feature1-4bc3b9b7/` (5/5 checks, exit 0). The
> 2026-05-11 evidence dir below is retained as historical record;
> `docs/BUSINESS-FEATURES.md` Feature-1 row points at the 2026-05-12 run.

## Scope delivered

| Plan output | Status | Reference |
|---|---|---|
| Parser fix (`--cwd / --home / --skip-seed`) | ✅ | commits `2f87234` + `1af66e7`, `packages/cli/src/commands/init.ts:1564-1585` |
| `init` CLI help text refresh | ✅ | commit `2f87234`, `packages/cli/src/bin.ts:489-528` |
| parseInitArgs unit-test coverage (13 cases) | ✅ | commits `3ccd31f` + `1af66e7`, `init.test.ts:651-721` |
| executeInit fresh-cwd contract (2 cases) | ✅ | commit `3ccd31f`, `init.test.ts:724-778` |
| Judge MD playbook | ✅ | commit `e977c1e`, `judge.md` |
| Evidence snapshot | ✅ | commits `5fc7898` + `afc8af4`, `evidence/20260511T130402Z-feature1-76e8d1d0/` |
| BUSINESS-FEATURES anchor | ✅ | commit `61b6bd6`, `BUSINESS-FEATURES.md:92-94` |
| PR + `/review` + squash-merge + POSTPR | ⏳ | task #7 (in progress at report write time) |

## Verification trace

- All 68 cases in `packages/cli/src/__tests__/init.test.ts` pass against the
  new parser + new fresh-cwd contract.
- §V1 RUN landed exit code 0; sandbox got `.teamagent/knowledge.db` +
  `.teamagent/.project-root`; `<tmpHome>/.claude/skills/teamagent/` got 1
  compiled skill; stdout shows 9 `✅` markers plus banner `TeamAgent 安装成功`;
  stderr contains only Node's SQLite experimental warning.
- §V2 DUMP `judge.json` records all 5 checks `pass: true`, `overall: PASS`.
- §V3 READ independent Explore subagent (read-only, no source access) read
  raw evidence and emitted `overall: PASS`, `failures: []`. Verdict captured
  in `evidence/20260511T130402Z-feature1-76e8d1d0/v3-verdict.json`.

## Deviations from plan

- **plan said**: harness uses `pnpm --dir <REPO_ROOT> exec teamagent`.
  **actual**: pnpm refuses to run a workspace-script outside a package
  context (`ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`). Harness switched to
  direct `<WORKTREE_ROOT>/node_modules/.bin/tsx <bin.ts>` invocation,
  documented in judge.md §V1 Step 2 rationale. Functionally equivalent;
  the `--cwd` flag remains the authoritative sandbox-target signal.
- **plan said**: evidence under `.judge/<topic>/`.
  **actual**: evidence under `docs/plans/<plan>/evidence/<run_id>/` plus a
  generic `.gitignore` re-allow for `docs/plans/**/evidence/**/*.log`.
  Rationale captured in research.md §4; PR-tracked evidence makes the
  proof reviewable as a plan deliverable instead of a transient artefact.
- One early V1 RUN attempt failed because `git rev-parse --git-common-dir`
  in a worktree resolves to the **main repo's** `.git`, so `REPO_ROOT`
  pointed at the upstream checkout (which has older code). Fixed by
  using `$(pwd)` of the worktree as `WORKTREE_ROOT` in V1 Step 0.
  Misrouted attempt removed from evidence/ in commit `afc8af4`.

## Open questions / followups

- The harness intentionally runs init with `--skip-import --skip-warmup
  --skip-hook --skip-seed`. A complementary "full path" judge (no skips,
  real Claude CLI, real warmup) could prove the heavier install path; out
  of scope for this PR.
- `init` still has a `nested-init-guard` quirk: from inside the worktree
  (which has its own `.teamagent/`), `--cwd=<sandbox>` succeeds because
  `findTeamagentRoot` walks UP from the sandbox path, not from `process.cwd()`.
  This is the intended behavior but worth documenting in a future
  `docs/features/init.md` if it bites a future contributor.

## Duck TL;DR (呷呷~)

鸭鸭对 plan 三段挨条复述：
- **task description**：把 Feature ① 裁判从「读菜单」换成「在新 repo 真的跑 init」，并把 init 在新 repo 跑不通的隐 bug（parser 漏识别 `--cwd/--home/--skip-seed`）修了。
- **expected outputs**：parser + bin help + 9 个 unit test + judge.md + evidence/ PASS run + BUSINESS-FEATURES anchor，全勾上。
- **third-party judge harness**：MD playbook 在 `judge.md`；harness 在 fresh tmp git repo + fresh tmp HOME 上跑 init；dump 8 个 metric + 5 个 check 进 `judge.json`；另一只 Explore subagent（read-only，看不到代码）只读 evidence 拍 PASS。代码、写计划者、init 自己都不当裁判，呷呷~
