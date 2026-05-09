```
   __
 <(o.o)___    PR-PLAN iter-1 fix
  ( <_< /     issue #225 — fixes from local /review
   `---'
```

# PR-PLAN iter-1: Fix /review findings (issue #225)

Per `docs/PR-PLAN.md`: when /review finds issues, write a 3-section PR-PLAN, fix in same branch, do NOT open follow-up issues.

## 1. Task description

Fix the three findings the local /review surfaced on `feat/issue-225`:

- **[P1] Soft-force banner only fires once per pending_banner** — gated on `shown===false`, conflicts with the plan's "re-fires every SessionStart until A/B/C." Plus double-fires alongside the legacy `maybeShowPendingBanner` on the first SessionStart.
  - **Approach**: split semantics. `pending_banner.shown` keeps its original meaning (one-shot post-install celebration). Add a new field `prompt_dismissed_for_to: string` to `UpdateState` that tracks "user has acknowledged this `to` version via --now/--snooze/--never." `shouldPromptUpgrade` re-fires whenever `prompt_dismissed_for_to !== state.pending_banner.to` AND snooze elapsed AND not never_prompt. `maybeShowPendingBanner` continues to fire its post-install celebration on first SessionStart only (don't remove — different UX).
  - **Why split**: removing `maybeShowPendingBanner` would lose the "✨ 已自动更新" success message which has its own value (confirms the auto-update worked). The two banners answer different questions: legacy = "we just upgraded you," new = "what's new + how to control upgrade prompts." They can coexist on first SessionStart and only the new one should re-fire.

- **[P3] `--limit` accepts NaN** — `Number.parseInt("foo", 10)` returns NaN, not validated, breaks `parseChangelog`'s cap.
  - **Approach**: add a validation guard in `parseWhatsNewArgs` that throws on non-finite or non-positive integers.

- **[P3] `docs/SELF-UPDATE.md` doesn't mention the new soft-force prompt**.
  - **Approach**: append a one-paragraph "See also" pointer to `docs/features/soft-force-upgrade.md`.

## 2. Expected outputs

| Path | Type | Contents |
|------|------|----------|
| `packages/core/src/update/update-state.ts` | extend | +1 field `prompt_dismissed_for_to: string`, default `""`, parse with type guard |
| `packages/core/src/update/snooze.ts` | extend | `shouldPromptUpgrade` reads new field; new helper `shouldDismissUpgradePromptOn(action)` |
| `packages/core/src/update/__tests__/snooze.test.ts` | extend | new cases: re-fires while not dismissed, dismisses on --now/--snooze/--never |
| `packages/core/src/update/__tests__/update-state.test.ts` | extend | round-trip + bw-compat for `prompt_dismissed_for_to` |
| `packages/cli/src/commands/update.ts` | edit | `snoozeCmd` / `neverCmd` / `nowCmd` set `prompt_dismissed_for_to = state.pending_banner?.to ?? ""` |
| `packages/cli/src/__tests__/maybe-show-upgrade-prompt.test.ts` | extend | re-fire test (banner shown twice across two SessionStarts when no dismissal) |
| `packages/cli/src/commands/whatsnew.ts` | edit | `parseWhatsNewArgs` validates `--limit` is finite positive int |
| `packages/cli/src/__tests__/whatsnew.test.ts` | extend | parse error case |
| `docs/SELF-UPDATE.md` | edit | "See also" pointer to soft-force-upgrade.md |

## 3. Third-party judge harness

(Reuses the same J1-J8 playbook from `docs/plans/2026-05-09-issue-225/judge.md`.) Additional checks for iter-1:

| ID | Check |
|----|-------|
| J9 | snooze re-fire — vitest case "shouldPromptUpgrade returns true on second SessionStart when no dismissal" |
| J10 | dismissal — vitest case "snoozeCmd sets prompt_dismissed_for_to = pending_banner.to" |
| J11 | `--limit foo` — vitest case "parseWhatsNewArgs throws on non-numeric limit" |
| J12 | `--limit -3` — vitest case "parseWhatsNewArgs throws on non-positive limit" |

All run as part of J2 + J3 vitest suites; LLM judge reads the same `judge.json`.
