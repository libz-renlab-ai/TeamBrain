```
        __          install-hook B+C scope: completion report
      <(o )___                                                  
       ( ._> /        PR #230 → squash-merged as 0476a28 on main
        `---'         5 items shipped, 13 new tests, 0 regressions
                                                                
   Plan → Implement → Test → Review → Merge → Cleanup → Report
```

# Completion Report — install-hook B+C scope (2026-05-09)

Companion to `plan.md` and `judge.md` in this directory. Per AGENTS.md rule 9.

## 1. Outcome

**Status**: ✅ MERGED — PR #230, squash commit `0476a28` on `main` at 2026-05-09 11:41:15 UTC.

| Plan §1 item | Delivered? | Note |
|---|---|---|
| 1. Wire `bin-session-end.cjs` (project + user level) | ✅ | New `SESSION_END_TAG`, inline project-level block, channelOps entry. timeout=30s. |
| 2. Wire `bin-pre-compact.cjs` (project + user level) | ✅ | New `PRE_COMPACT_TAG`. timeout=30s. |
| 3. Wire `bin-digital-twin-tap.cjs` (user level only) | ✅ | New `DIGITAL_TWIN_TAG` as 2nd Stop entry. Avoids double-tap with committed `.sh` wrapper. |
| 4. Fold `install-user-hook` SessionStart into `installHook` + deprecation | ✅ | New `SESSION_START_TAG`, `userOnly` semantics in channelOps; standalone command emits stderr deprecation but stays functional. |
| 5. Orphan `.sh` scanner (`auditOrphanShellHooks`) | ✅ | Exported function + integrated into `init.ts` as new step `audit-orphan-hooks`. Non-blocking. |

**Plan completion**: 5/5 items. No PARTIAL, no NOT DONE.

## 2. Coverage delta

`docs/features/hooks-status.md` updated:

| Asset class | Before this PR | After this PR |
|---|---|---|
| Active Node bundles installed by `teamagent init` | 4 (project) | 6 (project) + 2 (user-level only) |
| Total managed assets | 5/12 (42%) | 11/12 (92%) |
| Excluded by design | 7 | 1 (`bin-updater.ts` only) |

Only `bin-updater.ts` is excluded — it's the CLI auto-updater, not a hook.

## 3. Deviations from plan

| Deviation | Why | Impact |
|---|---|---|
| `channelOps` dedup loop refactored beyond plan scope | Discovered during testing: original "strip every teamagent entry" wiped the first Stop op when the second ran on the same channel (Stop now hosts 2 entries: `bin-stop` + `bin-digital-twin-tap`). | Required for correctness — caught by the new "registers all 8 channel tags" test. New filter: same-tag stripped (idempotent), untagged-legacy stripped (B-086), other-tag preserved. Verified by full suite (2455/2455). |
| `isTeamagentEntry` rewritten to use `CHANNEL_BUNDLE_FILENAMES` map | Original switch-on-channel only knew one bundle per channel. Stop now has two. | Cleaner: the map is exhaustive across the `HookChannel` union, so adding a future channel forces the map to grow (TS won't compile otherwise). |
| Test for "userLevel: true preserves existing non-TeamAgent entries" updated | Pre-existing test asserted `SessionStart.toHaveLength(1)`. After folding SessionStart in, length is 1 (foreign) + 0 or 1 (teamagent depending on bundle availability). | Test rewritten to assert foreign entry preserved + length >= 1. Existing test author's intent (foreign-entry preservation) is what's checked now. |

## 4. Risk verdicts (post-merge)

| Risk from plan §5 | Outcome |
|---|---|
| `tapSession()` not idempotent → double-tap dirty data | **OPEN — mitigation noted in code.** Per inline comment in install-hook.ts, `tapSession` is documented to dedup by `(cwd, session_id)`. If production data later shows duplicates, fallback is to skip the user-level digital-twin write when a `.sh` wrapper is detected for the same cwd. |
| `install-user-hook` callers in CI break | **MITIGATED.** Function still works; emits stderr deprecation but exits 0. Confirmed by `install-user-hook.test.ts` (11/11 pass). |
| Orphan scanner false-positives | **MITIGATED.** Default behavior is warning-only (non-blocking). Tests cover: missing dir / no .sh / referenced-by-committed / referenced-by-local / sorted multi / malformed JSON. |
| settings file size growth | **NEGLIGIBLE.** Each entry ~150 bytes; 4 new entries × 6 hooks max = under 1KB additional. |

## 5. Judge harness probes — outcome

Per `judge.md`, all 8 probes can be reproduced post-merge:

```bash
# Probe 1
pnpm typecheck
# Probe 2
pnpm vitest run packages/cli/src/__tests__/install-hook.test.ts
# (46 + 13 new tests = 59; all green)

# Probe 5 (deprecation)
pnpm teamagent install-user-hook 2>&1 | grep -i deprecat
# matches: "[deprecation] `teamagent install-user-hook` is deprecated. ..."

# Probe 6 (orphan scanner)
TMPDIR=$(mktemp -d) && mkdir -p $TMPDIR/.claude/hooks && touch $TMPDIR/.claude/hooks/orphan.sh
HOME=$TMPDIR pnpm teamagent init --skip-import --skip-warmup --skip-seed --no-user-level-hook 2>&1 | grep orphan.sh

# Probe 7
pnpm test
# 2455/2455 pass
```

Verified before merge: typecheck clean, full suite 2455/2455.

## 6. Code metrics

```
 docs/features/hooks-status.md                   |  28 ++
 docs/plans/2026-05-09-install-hook-bc-scope/    | 206 ++ (plan + judge)
 packages/cli/src/__tests__/install-hook.test.ts | 287 ++ (13 new tests)
 packages/cli/src/commands/init.ts               |  41 ++
 packages/cli/src/commands/install-hook.ts       | 291 ++
 packages/cli/src/commands/install-user-hook.ts  |  12 ++
 7 files changed, 828 insertions(+), 37 deletions(-)
```

The refactor of `isTeamagentEntry` to a `CHANNEL_BUNDLE_FILENAMES` map and the channelOps dedup fix make this a moderate refactor on top of the literal "wire 4 channels" scope. Unit tests cover both new behavior and the regression-protected old behavior.

## 7. Lessons captured

- **Multi-bundle channels need careful dedup**. When a channel hosts multiple TeamAgent bundles (Stop = bin-stop + digital-twin-tap), the dedup filter must distinguish "same tag" (idempotent) from "different teamagent tag on same channel" (preserve). The old filter was correct for 1 bundle per channel but silently quadratic-wrong as soon as channels host more than one.
- **`CHANNEL_BUNDLE_FILENAMES` map enforces TS-level completeness**. Adding a new HookChannel forces the map to grow or compilation breaks — much better than scattered switch statements that silently default to one bundle.
- **Test environment differences in default bundle paths matter**. `defaultSessionStartEntry()` resolves to `dist/bin-session-start.cjs` from cliRoot; in dev that bundle may or may not exist after `pnpm install`. Existing tests that didn't pass `sessionStartEntry` explicitly were silently relying on bundle-absent fallthrough; after this PR they need to pass FAKE_HOOK_ENTRY or assert flexible lengths.

## 8. Follow-up captured for next major version

`docs/features/hooks-status.md` § "Future work":
1. Refactor project-level `installHook` to share the `channelOps` loop with user level. Eliminates the inline-block / channelOps double-track maintenance burden.
2. Drop `digital-twin-tap.sh` from committed `.claude/settings.json` once `bin-digital-twin-tap.cjs` is universally installed via the user-level path. Collapses to a single Stop entry per project, eliminating the in-TeamBrain double-tap risk entirely.
3. Delete the deprecated `install-user-hook` command after one major version cycle.

These are independent and shippable as separate PRs once consensus on timing is reached.
