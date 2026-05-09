# Issue #158 — FIXEDFLOW driver completion report

```
   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  pickup  │ →  │ implement│ →  │  /review │ →  │  PR + sq │
   └──────────┘    └──────────┘    └──────────┘    └──────────┘
        │               │              │              │
   10:48Z m1       implement       adversarial      PR #224
   driver          5 commits       subagent          merged
                                   3 P1 found       73b43bb7
                                   3 fixed
```

## Outcome

✅ **MERGED** via PR [#224](https://github.com/libz-renlab-ai/TeamBrain/pull/224)
at 2026-05-09T11:36:30Z (squash commit `73b43bb7`).

Issue [#158](https://github.com/libz-renlab-ai/TeamBrain/issues/158) auto-closed
at 2026-05-09T11:36:31Z.

## Actual chain executed

`research → implement → /review fix-loop → report` (Boris workflow, code-task
variant).

| Step | What happened |
|---|---|
| 0. sanity gates | issue OPEN, `grill-ready` label, no `needs-human`, no assignees, valid grill comment ending in `--- end grill ---`. |
| 1. pickup | Posted `👋 driver picked up` comment at 10:48:14Z. |
| 2. worktree | Created `.codex/worktrees/issue-158` on branch `feat/issue-158` from `origin/main` (`d056e97`). |
| 3. implementation | 5 atomic commits on local `feat/issue-158`: drop tree-sitter deps + AST gate + catch rollback / install.sh backup+rollback / testable install-rollback.ts module + 10 tests / CHANGELOG / iter-1 hardening. |
| 4. /review (iter 1) | Ran preamble + dispatched a `general-purpose` adversarial subagent (no Codex run — local heuristic). Subagent surfaced **3 P1 + 8 informational findings**. Iter-1 commit hardened: `tar -tzf` validation gate before `rm -rf`, Windows EBUSY skip on rollback, installer-source `.meta.json` matching, Windows `%LOCALAPPDATA%\\pnpm` / `%APPDATA%\\npm` knownRoots, `dist/bin.js` canary, explicit `keep=0` clamp test. PASS at `4212cb2`. |
| 4b. RACE DETECTED | `git push -u origin feat/issue-158` rejected non-fast-forward because **another mainpi session had already opened PR [#224](https://github.com/libz-renlab-ai/TeamBrain/pull/224) at 11:18:06Z** with the same root fix (90% file overlap; `lib/install-backup.ts` instead of `install-rollback.ts`; missing my 3 P1 hardenings). |
| 4c. user decision | AskUserQuestion → user picked **cherry-pick + additional commit + local /review loop + merge**. |
| 4d. cherry-pick | `git reset --hard origin/feat/issue-158` (moved local onto PR #224's branch); manually re-applied iter-1 hardening to PR #224's file structure (different file paths). 1 new commit `71b49b3` on top. Pushed. Comment posted on PR #224 explaining the race + the 3 P1s. |
| 4e. /review (iter 2) | All 21 tests pass (postinstall-duck-sync 4 + warmup 6 + install-rollback 11). typecheck clean. bash -n clean. sha256 regenerated. CI Ubuntu + Windows both COMPLETED SUCCESS (claude-review still IN_PROGRESS at merge time, mergeStateStatus=UNSTABLE, mergeable=true). |
| 5. squash-merge | `gh pr merge 224 --squash --delete-branch` at 11:36:30Z. Merge commit `73b43bb7`. |
| 6. cleanup | This report. |

## Iteration count

From `.fixedflow/iter-158.json`:

- iter 1 (local review): 3 P1 + 3 P2 fixed
- iter 2 (post-cherry-pick re-test): PASS, no new findings

Tokens cumulative: not tracked (this driver did not wire token telemetry).

## Deviations from the grill plan

The grill comment specified:

> `packages/teamagent/postinstall.mjs` 在 catch 路径触发 rollback：
>   - untar 最近一份 backup 到原位置
>   - `recordSetupStatus("install", "rolled-back", "<backup-ts>")` 写到 `~/.teamagent/postinstall.log`
>   - stderr 输出 `⚠️ teamagent install failed; restored backup from <ts>`

The shipped PR #224 implementation **does NOT do destructive rollback in
postinstall.mjs's `main().catch`**. The catch path only logs the failure
and exits 0. Rationale (surfaced by my adversarial review and consistent
with what PR #224's author chose):

1. By the time `main().catch` fires under `npm i -g github:owner/repo#release`,
   npm reify has already replaced the directory contents with the new
   release. Restoring an install.sh-era backup at the npm pkgDir would
   mismatch layouts (npm pkgDir has `node_modules/`, install.sh dir
   doesn't) and yield a non-functional teamagent (sqlite-vec missing).
2. On Windows, `fs.rmSync` of the running pkgDir while postinstall.mjs is
   itself executing from inside that dir hits EBUSY mid-tree, surrounding
   try/catch swallows it silently, and tar overlays partial state.
3. A corrupt-on-disk backup + rmSync = empty pkgDir = the very
   partial-install corruption #158 was filed for.

So the "untar latest backup to original location" sub-clause was dropped
in PR #224 (no destructive postinstall rollback). The alternative
defense-in-depth (install.sh trap ERR rollback, which DOES know
INSTALL_DIR exactly) is intact and now hardened with `tar -tzf`
validation, `dist/bin.js` canary, and FIFO retention.

The other sub-clauses (recordSetupStatus log line + stderr message) are
implemented for the install.sh path.

## Links

| Artifact | URL |
|---|---|
| Issue | https://github.com/libz-renlab-ai/TeamBrain/issues/158 |
| PR | https://github.com/libz-renlab-ai/TeamBrain/pull/224 |
| Squash commit | https://github.com/libz-renlab-ai/TeamBrain/commit/73b43bb7 |
| iter-1 hardening | https://github.com/libz-renlab-ai/TeamBrain/pull/224/commits/71b49b3 (rebased into squash) |
| /review iter-1 PR comment | https://github.com/libz-renlab-ai/TeamBrain/pull/224#issuecomment-4412419636 |

## Follow-up issues to file (deferred from /review iter-1)

These were intentionally out of scope for #158 and should become their
own tickets:

- `vectorOptionalsInstalled` has the same Windows path knownRoots hole
  that `treeSitterDepsInstalled` was hardened against in this PR.
- `~/.teamagent/postinstall.log` grows unbounded (`appendFileSync` with
  no rotation). Cap size at e.g. 256 KB or rotate via
  `fs.renameSync(path, path+'.1')` past threshold.
- `BACKUP_FILE` timestamp uses second-resolution `date -u`. Concurrent
  CI installs in the same second (rare, but documented anti-pattern)
  produce identical filenames; second `tar -czf` clobbers first
  install's backup mid-write. Append PID + brief random suffix.
- `BACKUP_FILE_REGEX` is duplicated literally across `install-backup.ts`
  and `postinstall.mjs` (the legacy install-rollback path I dropped
  during cherry-pick). Single source of truth would prevent silent
  desync if either side switches to `.tar.gz`.
- `restoreFromBackup` has a TOCTOU window between
  `existsSync(backupPath)`, `mkdirSync(targetDir)`, and `spawnSync(tar)`.
  Best-effort acceptable but documented.
- One worktree-specific test failure on `bin-stop.test.ts:76` flagged in
  PR #224 description ("walk-up changes cwd but worktree root has no
  parent"). Passes on main checkout. CI runs from main checkout so it
  passes there; unrelated to #158.
