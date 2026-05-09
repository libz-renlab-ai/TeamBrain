```
   __                                                
 <(o )___      Install-hook Cleanup PR (v0.11.0)     
  ( ._> /                                             
   `---'    Plan: 2026-05-09 / slug: install-hook-cleanup-v0.11

 ┌─────────────────────────────────────────────────────────────────┐
 │  channelOps  unify         .sh  →  .cjs only      install-      │
 │  (project +  ─────►        (drop committed   ────► user-hook    │
 │   user fold)               digital-twin .sh)       soft-retire  │
 │     #1                          #2                     #3       │
 └─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                        bump 0.10.1 → 0.11.0
                                │
                                ▼
                    judge harness (md playbook)
                                │
                                ▼
                       PR → /review PASS → squash
```

# Install-hook Cleanup PR — v0.11.0

**Status**: planning
**Date**: 2026-05-09
**Worktree branch**: `worktree-shimmering-enchanting-quasar`
**Source of truth for scope**: `docs/plans/2026-05-09-install-hook-bc-scope/report.md` § 8 "Follow-up captured for next major version"

This PR closes the three follow-ups that PR #230 (B+C scope) intentionally deferred. The user has chosen **option A — bundle all 3 into ONE PR with a soft-retire (shim) for `install-user-hook`** so the npm postinstall path keeps working.

---

## ① Task description

### What we are doing

**#1 — channelOps unification (refactor, no behavior change)**
Project-level `installHook()` currently registers six channels (PreToolUse / PostToolUse / UserPromptSubmit / Stop / SessionEnd / PreCompact) via copy-pasted inline blocks. User-level `mergeUserLevelHooks()` already uses a clean `channelOps` array + loop covering eight ops. We extract a single `applyChannelOps(scope, ops, settings, homeDir)` helper that both paths call, parametrized by:

- `scope`: `"project"` (no staging, plain `node <path>` command) or `"user"` (stage to `~/.teamagent/hooks/`, wrap via `buildUserLevelHookCommand`)
- `ops`: scope-tagged list of channel operations
- `settings`: the in-memory ClaudeSettings being mutated
- `homeDir`: required for user-level staging path

`installHook()`'s body shrinks to: build ops list → `applyChannelOps("project", projectOps, projectSettings, homeDir)` → statusLine block (unchanged, statusLine is not a hook channel) → write project settings → if userLevel: acquire lock → `applyChannelOps("user", userOps, userSettings, homeDir)` → write user settings → release lock.

**#2 — drop `digital-twin-tap.sh` reference + file**
Today the committed `.claude/settings.json` Stop[] has two entries: `self-report-fused.sh` and `digital-twin-tap.sh`. The `.sh` was kept because PR #230 chose user-level-only for the `.cjs` to avoid double-tap inside TeamBrain. After this PR:

- Remove the `digital-twin-tap.sh` HookCommand from `.claude/settings.json` Stop[]
- Delete `.claude/hooks/digital-twin-tap.sh` (now unreferenced)
- Update `docs/features/hooks-status.md` TL;DR table (active `.sh` count 2 → 1) and the "Why `.sh` and `.cjs` co-exist" section
- TeamBrain devs continue to receive digital-twin tap via the user-level `bin-digital-twin-tap.cjs` written by `mergeUserLevelHooks` on `teamagent init` (which everyone working in TeamBrain runs)

Net effect: 1 tap per session in TeamBrain (was 2) and 1 tap per session in other projects (unchanged) — the in-TeamBrain double-tap risk is eliminated entirely, not just deduped via `tapSession()` idempotency.

**#3 — `install-user-hook` soft-retire (shim)**
`packages/cli/src/commands/install-user-hook.ts` currently has its own ~80-line SessionStart-write implementation that duplicates the SessionStart slice already implemented inside `mergeUserLevelHooks`. After this PR:

- Export `mergeUserLevelHooks` as `installUserLevelHooks(homeDir, entries, opts?)`
- Add an `opts.channelsFilter?: HookChannel[]` (or `sessionStartOnly?: boolean`) so the shim can request only the SessionStart slice
- Rewrite `installUserHook()` body as a 5-line shim: print existing deprecation warning → call `installUserLevelHooks(homeDir, { sessionStartEntry, ... }, { channelsFilter: ["SessionStart"] })` → derive InstallUserHookResult shape from the staged path and the pre/post settings file diff for `alreadyInstalled` + `backupPath`
- `uninstallUserHook()` similarly becomes a thin wrapper over the same single-channel filter (uninstall path is shared with `uninstallHook`'s SessionStart sweep)
- Public API of the command (signature, return shape, deprecation banner text) stays bit-for-bit compatible; the postinstall.mjs caller does not break
- Standalone command remains functional through the next major version cycle (delete is for v1.0)

### How (high level)

1. Extract `applyChannelOps` helper → all current tests stay green (channel iteration order may change; tests assert presence not order, but verify)
2. Refactor `installHook()` body to call helper for project scope
3. Refactor `mergeUserLevelHooks()` body to call helper for user scope — keep export name `mergeUserLevelHooks` for internal compat, add public alias `installUserLevelHooks` for cross-file use
4. Edit committed `.claude/settings.json`: remove digital-twin-tap.sh entry from Stop[]
5. `git rm .claude/hooks/digital-twin-tap.sh`
6. Update `docs/features/hooks-status.md` (TL;DR + § "Why `.sh` and `.cjs` co-exist" + § "Future work" — strike #2, leave #1 marked done if landed, leave #3 with new "after major v1.0" wording)
7. Rewrite `installUserHook` / `uninstallUserHook` bodies as shims
8. Bump `packages/teamagent/package.json` version 0.10.1 → 0.11.0; bump CHANGELOG `## Unreleased` → `## 0.11.0 — 2026-05-09` with three sub-sections (Refactor / Fixed / Deprecated)
9. Run `pnpm test` + `pnpm typecheck`; resolve any breakage from the refactor (most likely `install-hook.test.ts` / `install-user-hook.test.ts` need minor adjustments)
10. Run feature-verification (`teamagent install-hook --help` canonical JSON diff)
11. Open normal PR; loop `/review` until PASS

### What we are NOT doing (anti-goals)

- **Not** deleting the `install-user-hook` command or its CLI surface — that is the v1.0 cut. This PR keeps it as a shim with deprecation warning.
- **Not** touching `postinstall.mjs:365` — the shim preserves the call signature so npm postinstall is unaffected.
- **Not** writing `bin-digital-twin-tap.cjs` to project-level `.claude/settings.local.json` — keeping it user-level-only is the whole reason removing the `.sh` is now safe.
- **Not** changing the statusLine chain-wrap logic (#104) — statusLine is not a hook channel and stays in its own block inside `installHook()`.
- **Not** changing the `_teamagentTag` constants or the dedup heuristics (`isTeamagentEntry` / `CHANNEL_BUNDLE_FILENAMES`) — they are correct as of PR #230 and changing them invalidates re-install dedup for every existing user.
- **Not** archiving `self-report-fused.sh` — that is the project-level enforcement script, out of scope for this cleanup.
- **Not** bumping to 1.0.0 — current semver track is 0.x, where minor bumps signal breaking changes per project convention. v1.0.0 lands when `install-user-hook` is hard-deleted (next PR cycle).

---

## ② Expected outputs

Reviewer-checkable list. Each item maps to a file path or a CLI assertion.

### Code (project-level changes)

- `packages/cli/src/commands/install-hook.ts`:
  - New exported helper `applyChannelOps(scope, ops, settings, homeDir)`
  - `installHook()` body uses helper for project scope (inline blocks gone)
  - `mergeUserLevelHooks()` body uses helper for user scope (inline channelOps loop body extracted into helper)
  - Public re-export `installUserLevelHooks = mergeUserLevelHooks` (or rename) so install-user-hook.ts can call it without circular import
- `packages/cli/src/commands/install-user-hook.ts`:
  - `installUserHook()` body ≤ 30 lines: deprecation warning → call shared helper → return shape
  - `uninstallUserHook()` body ≤ 15 lines: similar shim path

### Code (committed settings + on-disk hook scripts)

- `.claude/settings.json`: Stop[] has only the `self-report-fused.sh` HookCommand (digital-twin-tap.sh entry removed)
- `.claude/hooks/digital-twin-tap.sh`: file deleted (`git rm`)

### Docs

- `docs/features/hooks-status.md`:
  - TL;DR table updated: "🟢 Active `.sh` scripts wired by committed `.claude/settings.json`" count `2 → 1`; row text references only `self-report-fused.sh`
  - § 5 "Stop" table: row for `digital-twin-tap.sh` removed
  - § "Why `.sh` and `.cjs` co-exist": updated to note self-report-fused is the only remaining `.sh`
  - § "Future work" updated: strike #1 if landed, replace #2 with "✅ landed in v0.11.0", leave #3 ("delete deprecated `teamagent install-user-hook` after one major version") for v1.0
- `docs/plans/2026-05-09-install-hook-cleanup-v0.11/plan.md`: this file
- `docs/plans/2026-05-09-install-hook-cleanup-v0.11/research.md`: context dump (file inventory, signature traces, existing test contracts)
- `docs/plans/2026-05-09-install-hook-cleanup-v0.11/judge.md`: third-party md-playbook judge harness (§V1 RUN / §V2 DUMP / §V3 READ)
- `docs/plans/2026-05-09-install-hook-cleanup-v0.11/report.md`: written after PR opens; populated through merge

### Versioning

- `packages/teamagent/package.json` `version`: `0.10.1 → 0.11.0`
- `CHANGELOG.md`: new top section `## 0.11.0 — 2026-05-09` with:
  - **Deprecated**: `teamagent install-user-hook` is now a shim with deprecation warning; logic delegated to shared user-level installer. Will be removed in v1.0.0.
  - **Fixed**: in-TeamBrain double-tap risk on Stop hook eliminated by removing `digital-twin-tap.sh` from committed `.claude/settings.json` (now relies on user-level `bin-digital-twin-tap.cjs`).
  - **Refactor**: project-level and user-level hook installation share a single `applyChannelOps` helper; eliminates 6 inline copy-pasted channel blocks.

### CLI / verification artefacts

- `pnpm test` — all suites green (vitest must report 0 failures across the monorepo; `fileParallelism: false` is the project default and stays in effect)
- `pnpm typecheck` — zero new errors
- Canonical help diff: `claudefast -p 'teamagent install-hook --help and emit canonical JSON'` output matches existing snapshot (or snapshot updated if help text legitimately changed; diff is part of the PR)
- `/export <path>` artefact attached to PR description — produced by an interactive `claudefast` tmux run that exercises `teamagent install-hook` and `teamagent install-user-hook` end-to-end

### PR artefacts

- Normal (non-draft) PR opened against `main`
- PR body contains the Quick Checklist from `docs/HOWTO-PLAN-PR.md` § "Quick checklist"
- All commit messages follow `feat(m{N}) / fix(m{N}) / refactor(m{N}) / chore(m{N})` convention
- Final commit: `chore(m4): bump teamagent 0.10.1 → 0.11.0 + CHANGELOG`

---

## ③ How-to-verify (third-party judge harness)

The full md playbook lives at `docs/plans/2026-05-09-install-hook-cleanup-v0.11/judge.md`. It is the canonical third-party judge harness for this PR — **md playbook only, no fixed `.sh` script**. The MAIN agent dispatches it through subagents (TEAMWORK pattern) or `claudefast -p` probes (FASTPROBE max 8 parallel).

The playbook documents three sections per `~/.claude/docs/rules/testing-judge-harness.md`:

- **§V1 RUN** — fixed tools to invoke (`pnpm test`, `pnpm typecheck`, feature-verification canonical-help diff, `teamagent install-hook --dry-run` smoke, orphan-scanner self-check after removing `.sh`)
- **§V2 DUMP** — canonical JSON schema written to `.judge/<run_id>/judge.json` with `exit_code`, `metrics`, `evidence_dir`, `stdout_path`
- **§V3 READ** — separate `claudefast -p` reads ONLY raw JSON + evidence and grades. PR author / executing agent / code-under-test never grade themselves.

In addition to the playbook, the project-wide gate in `docs/feature-verification.md` applies:

1. Module under test: `teamagent install-hook` (the umbrella command — same JSON schema as before this PR; cleanup must not change it)
2. Snapshot path: `snapshots/install-hook-help.canonical.json` (create if missing during this PR)
3. `/export` path: `docs/plans/2026-05-09-install-hook-cleanup-v0.11/exports/v0.11-installhook.export.txt`

After PR opens, the POSTPR loop applies (`docs/POSTPR.md`):

```
PR opened → CI + /review → issues found?
   → block the merge
   → write PR-PLAN at docs/plans/<date>-pr-<n>-fix-plan.md
   → execute on the SAME PR branch (TEAMWORK if parallelizable)
   → re-run pnpm test + pnpm typecheck + feature-verification gate
   → re-run /review on the new diff
   → stop only when CI green + no conflict + /review PASS
```

Then squash-merge per ADR-0007 (`gh pr merge <N> --squash --delete-branch`), write `report.md`, ExitWorktree, parent `git pull --ff-only`.

---

## See also

- `docs/HOWTO-PLAN-PR.md` — the four-section plan structure
- `docs/POSTPR.md` — POSTPR `/review` loop
- `docs/PR-PLAN.md` — fix-issues-in-this-PR rules (no follow-up issue punt)
- `docs/feature-verification.md` — canonical-help JSON diff gate
- `docs/FASTPROBE.md` — claudefast probe recipe
- `docs/features/hooks-status.md` — canonical hook inventory
- `docs/plans/2026-05-09-install-hook-bc-scope/report.md` § 8 — verbatim source for this scope
- `~/.claude/docs/rules/testing-judge-harness.md` — user-level judge harness rule
