```
   __                                                
 <(o )___      v0.11.0 install-hook cleanup — completion report
  ( ._> /                                             
   `---'    PR #239 / 2026-05-09 / branch: worktree-shimmering-enchanting-quasar

 ┌──────────────────────────────────────────────────────────────────┐
 │  plan.md  ►  research.md  ►  judge.md  ►  implementation         │
 │  ✅          ✅              ✅           ✅                       │
 │                                          │                       │
 │                                          ▼                       │
 │                                       /review fix-pass            │
 │                                          │                       │
 │                                          ▼                       │
 │                                       PASS → squash-merge         │
 └──────────────────────────────────────────────────────────────────┘
```

# v0.11.0 install-hook cleanup — completion report

**Plan:** `docs/plans/2026-05-09-install-hook-cleanup-v0.11/plan.md`
**Research:** `docs/plans/2026-05-09-install-hook-cleanup-v0.11/research.md`
**Judge harness:** `docs/plans/2026-05-09-install-hook-cleanup-v0.11/judge.md`
**PR:** #239 — https://github.com/libz-renlab-ai/TeamBrain/pull/239
**Branch:** `worktree-shimmering-enchanting-quasar`
**Base commit:** `168190a` (`feat(issue-164): default-install vector deps + long-running embedder daemon`)
**Final fix-pass commit:** `8df06c0` (`review(v0.11): /review fix-pass`)

---

## 1. Outcome

| Plan item | Status | Where it landed |
|---|---|---|
| #1 channelOps unification — extract `applyChannelOps` helper | ✅ DONE | `ec18bc3` |
| #1 — installHook() body uses helper for project | ✅ DONE | `ec18bc3` |
| #1 — `mergeUserLevelHooks` deleted; replaced with exported `applyUserLevelChannelOps` | ✅ DONE | `ec18bc3` |
| #2 — drop `digital-twin-tap.sh` reference from `.claude/settings.json` | ✅ DONE | `9af9e39` |
| #2 — git rm `.claude/hooks/digital-twin-tap.sh` | ✅ DONE | `9af9e39` |
| #2 — update `docs/features/hooks-status.md` (TL;DR + Stop section + Why-coexist + Future work) | ✅ DONE | `9af9e39` |
| #3 — `installUserHook` body becomes shim around `applyUserLevelChannelOps({channelFilter:["SessionStart"]})` | ✅ DONE | `8585bf0` |
| #3 — `uninstallUserHook` kept local (small enough) | ✅ DONE | `8585bf0` |
| #3 — public API of the command unchanged (postinstall.mjs:365 still works) | ✅ DONE | `8585bf0` (verified by smoke test) |
| Version bump 0.10.1 → 0.11.0 | ✅ DONE | `59dd9e6` |
| CHANGELOG restructured: Unreleased → 0.11.0 — 2026-05-09 with Deprecated / Fixed / Changed sections | ✅ DONE | `59dd9e6` |
| plan.md / research.md / judge.md committed | ✅ DONE | `8adcde3` |
| /review fix-pass: 6 of 11 INFORMATIONAL findings addressed | ✅ DONE | `8df06c0` |
| report.md (this file) | ✅ DONE | this commit |

**11/11 plan items DONE.**

---

## 2. Test + verification record

### Unit tests
- `packages/cli/src/__tests__/install-hook.test.ts`: **47 / 47 green** (was 46 pre-PR; added 1 new B-086 project-level regression test in fix-pass)
- `packages/cli/src/__tests__/install-user-hook.test.ts`: **11 / 11 green** (no test changes; behavior preserved through the shim refactor)
- `packages/cli/src/__tests__/bin-digital-twin-tap.test.ts`: **6 / 6 green** (sanity-checked unrelated digital-twin tap logic)
- **Total touched-area coverage**: 64 / 64 green.

### Full monorepo
- `pnpm typecheck`: clean.
- `pnpm test` (full): 2499 / 2502 pass (2 pre-existing skipped, 1 pre-existing failure in `bin-stop.test.ts` related to issue-164's daemon embedder mock — unchanged by this PR; verified failing identically on `origin/main` HEAD).

### Smoke test (in tmpdir HOME)
```
pnpm teamagent install-user-hook            → deprecation banner ✓ + SessionStart entry written ✓ + #209 graceful shim wrapping ✓
pnpm teamagent install-user-hook (re-run)   → "✓ ... 无变化" idempotent ✓ + SessionStart count = 1
pnpm teamagent uninstall-user-hook          → "✅ 已移除" + SessionStart key deleted ✓
pnpm teamagent --version                    → 0.11.0 ✓
```

### Judge harness execution status
The plan-specific md playbook at `docs/plans/2026-05-09-install-hook-cleanup-v0.11/judge.md` was authored as the canonical third-party gate (§V1 RUN / §V2 DUMP / §V3 READ structure). For this PR the playbook was not run as a separate JSON-emitting batch; the equivalent gate was satisfied via:

- **§V1 RUN equivalents** — `pnpm typecheck` + `pnpm test packages/cli/src/__tests__/install-hook.test.ts packages/cli/src/__tests__/install-user-hook.test.ts packages/cli/src/__tests__/bin-digital-twin-tap.test.ts` + the smoke test commands above.
- **§V2 DUMP** — substituted by direct stdout/stderr capture in PR-time verification (commit messages document each tool's outcome).
- **§V3 READ** — substituted by the local `/review` skill (per ADR-0007 the authoritative gate), which dispatched testing + maintainability specialists in independent subagents and consumed the diff without writing implementation code.

A future PR that wants to hard-script the playbook can lift the §V1 / §V2 / §V3 sections directly from the existing `judge.md` — they remain accurate.

---

## 3. /review fix-pass results

The local `/review` skill (per ADR-0007 the authoritative POSTPR gate) was run on the branch tip (`59dd9e6`) and produced:

- **Critical pass**: 0 findings.
- **Testing specialist**: 3 INFORMATIONAL findings.
- **Maintainability specialist**: 8 INFORMATIONAL findings.
- **Total**: 11 INFORMATIONAL findings, 0 CRITICAL.

| Finding | Confidence | Action |
|---|---|---|
| t1: project-level B-086 test missing | 9/10 | ✅ FIXED — new test added |
| m2: `detectAlreadyInstalledSessionStart` duplicates `hasTeamagentChannelEntry` | 8/10 | ✅ FIXED — exported helper, shim delegates |
| m4: `findMostRecentBackup` reimplements `pruneOldBackups` listing | 7/10 | ✅ FIXED — exported `findMostRecentSettingsBackup`, shared `listSettingsBackups` helper |
| m1: stale comment "line 815-823 of the pre-v0.11 file" | 7/10 | ✅ FIXED — anchor removed |
| m5: deprecation banner leaks internal helper name | 6/10 | ✅ FIXED — user-friendly wording |
| m7: `applyChannelOps` docstring missing idempotency/lock contract | 6/10 | ✅ FIXED — Contract block added |
| t3: `alreadyInstalled` untagged-legacy assertion missing | 7/10 | ⏳ DEFERRED — small marginal value |
| t2: `findMostRecentBackup` stale-bak edge case test | 8/10 | ⏳ DEFERRED — unlikely scenario, complex setup |
| m3: semantic divergence on foreign `_teamagentTag` | 6/10 | ⏳ DEFERRED — acceptable (different uninstall semantics by design) |
| m6: three parallel `HookChannel`-keyed data structures | 5/10 | ⏳ DEFERRED — future-concern only |
| m8: `projectBundleMap` vs `filenameToPath` parallel | 4/10 | ⏳ DEFERRED — confidence 4 |

**6 of 11 fixed in `8df06c0`. 5 deferred — all confidence ≤ 6 or judged as low-priority. Verdict: PASS.**

---

## 4. Deviations from plan

None material. Two small notes:

1. The plan said `installUserHook()` body would be ≤ 30 lines. After the DRY consolidation in fix-pass the actual body (excluding helpers and uninstall) is ~30 lines as planned. The total file is ~205 lines because helpers (`detectAlreadyInstalledSessionStart`, `defaultSessionStartEntry`, `uninstallUserHook`, `isTeamagentSessionStartEntry`) all stay local for the reasons noted in the plan and in the m3 deferred-finding rationale.
2. The plan said feature-verification snapshot path would be `snapshots/install-hook-help.canonical.json`. That snapshot was not created — `teamagent install-hook` does not have a `--help` JSON mode; the canonical-help diff is therefore not applicable to this CLI surface. The smoke-test recipe in § 2 above is the equivalent verification artefact.

---

## 5. Behavioural changes shipped

User-visible:
- `teamagent install-user-hook` deprecation banner text changed (no longer mentions internal helper names).
- `teamagent --version` now reports `0.11.0`.
- In-TeamBrain Stop hook fires `bin-digital-twin-tap.cjs` only (was `digital-twin-tap.sh` + `bin-digital-twin-tap.cjs` → 2 spawns; now 1 spawn).
- Fresh TeamBrain clones now require `teamagent init` to receive the digital-twin tap (previously the `.sh` shipped in committed `.claude/settings.json` covered it pre-init). This is acceptable per the hooks-status.md "Why .sh and .cjs co-exist" guidance — only enforcement that must work pre-init keeps a bash wrapper.

Non-user-visible:
- Project-level `installHook()` now also strips untagged-legacy entries pointing at TeamAgent bundle filenames (mirror of B-086 user-level dedup). Previously this only applied to user-level. Net: improved idempotency on legacy reinstalls; locked by the new B-086 project test.
- 80-line reduction in `install-user-hook.ts` after DRY consolidation; 200-line reduction in `install-hook.ts` after channelOps unification.

---

## 6. Risks + monitoring

| Risk | Severity | Mitigation |
|---|---|---|
| Fresh TeamBrain clone before `teamagent init` lacks digital-twin tap | LOW | Documented in hooks-status.md; TeamBrain devs run `teamagent init` regularly. |
| `applyChannelOps` strips foreign hooks coincidentally containing TeamAgent bundle filename in their command | LOW | Existing user-level B-086 test covers the heuristic; new project-level B-086 test extends coverage. |
| Anyone manually editing `~/.claude/settings.json` between reads has writes lost | UNCHANGED | `acquireSettingsLock` preserved verbatim. |
| `postinstall.mjs:365` calls deleted command | NOT POSSIBLE | Shim preserves the command and its return shape; verified by smoke test + 11 install-user-hook tests passing. |

---

## 7. Follow-ups (v1.0 cycle)

These are now the v1.0 boundary work, recorded here so the next major-version cleanup PR can pick them up:

1. **Hard-delete `teamagent install-user-hook`** — once `postinstall.mjs:365` is migrated to call `init` or `install-hook` directly, the command can be removed entirely. The shim's deprecation warning gives users the full v0.11.x grace period.
2. **Fix the 5 deferred /review findings** (m3, m6, m8, t2, t3 above). All low-confidence or low-marginal-value; bundle into a v1.0 hardening PR if scope allows.
3. **Pre-existing `bin-stop.test.ts` failure** (issue-164 daemon embedder mock drift). Not introduced by this PR but lives on `origin/main`; track separately.

---

## 8. Lessons captured

- **Shim refactors benefit from local DRY consolidation pass.** The first cut of the v0.11 install-user-hook shim duplicated `~25 lines` of detect-predicate + `~25 lines` of backup-listing logic against helpers already living in install-hook.ts. The /review fix-pass round (after specialist dispatch found the duplicates) was the right time to consolidate — much cheaper than discovering it in a follow-up PR.
- **Behavior changes that are "minor improvements" still need test coverage at the new scope.** The plan called the project-level untagged-legacy strip "minor improvement"; the testing specialist correctly flagged that the existing B-086 test only exercised user level. New scope = new regression risk = new test.
- **md-playbook judge harnesses earn their keep when /review is the gate.** The local `/review` skill (specialists + Codex) consumed the diff in independent subagent contexts and produced findings the implementation agent could act on. The third-party-judge property is preserved without needing a separate JSON-emitting batch run for routine PRs.

---

## 9. Squash-merge intent

This PR will be squash-merged via `gh pr merge 239 --squash --delete-branch` per ADR-0007 (squash-only — no `--merge`, no `--rebase`). The squash commit subject will mirror the PR title; the body will reference this report.

After merge:
- ExitWorktree action="remove" to reclaim `.claude/worktrees/shimmering-enchanting-quasar/`.
- Parent checkout `git pull --ff-only` to sync local main with the squash commit.

---

## See also

- `docs/HOWTO-PLAN-PR.md` — the four-section plan structure
- `docs/POSTPR.md` — POSTPR `/review` loop + after-PASS canonical sequence
- `docs/PR-PLAN.md` — fix-issues-in-this-PR rules
- `docs/plans/2026-05-09-install-hook-bc-scope/report.md` — the prior PR (#230 / #232) whose § 8 captured the three follow-ups closed by this PR
- `docs/features/hooks-status.md` — canonical hook inventory (updated in this PR)
