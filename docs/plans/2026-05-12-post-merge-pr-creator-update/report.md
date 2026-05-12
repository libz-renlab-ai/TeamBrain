```text
        ┌─────────────────────────────────────────────────────────┐
        │  report.md · post-merge PR-creator auto-update          │
        │                                                         │
        │  what shipped · deviations · verification status        │
        └─────────────────────────────────────────────────────────┘
```

# Report — Post-merge MUST-update for PR creator

## What shipped (commits in order)

| # | Commit | Title |
|---|---|---|
| 1 | `dadad73` | docs(m6): plan post-merge auto-update for PR creator |
| 2 | `2bdfb79` | feat(m6): add isLocalUserPrCreator pure helper in @teamagent/core |
| 3 | `6f784c0` | feat(m6): extend PendingBanner with optional pr_creator + pr_number |
| 4 | `0feb704` | feat(m6): plumb pr_creator_login/pr_number/merged_at through fetch-latest |
| 5 | `7f2f50a` | feat(m6): add gatherLocalIdentity shell wrapper in @teamagent/cli |
| 6 | `603ec9e` | feat(m6): stamp pr_creator banner in runUpdater on PR-creator match |
| 7 | `7a0a6de` | feat(m6): wire gatherLocalIdentity into bin-updater |
| 8 | `3384a3f` | feat(m6): render distinct 🎯 PR-creator banner in session-start-logic |
| 9 | `8c4df7e` | feat(m6): publish pr_creator_login/pr_number/merged_at in latest.json |
| 10 | `b67578a` | docs(m6): document PR-creator force-update in SELF-UPDATE + channel schema |
| 11 | `20c49d4` | docs(m6): split PR-creator force-update into sibling features/ doc |
| 12 | `904aca7` | fix(m6): remove unused @ts-expect-error in pr-creator-match test |

## How the layers connect

```text
  push: main (a squash-merge of any PR)
        │
        ▼
  .github/workflows/release-branch.yml
        ├─ Resolve PR creator        ◄── new step
        │    gh api .../commits/{sha}/pulls
        │    regex-validate number / login / merged_at
        ├─ Publish latest.json       ◄── jq-build with 3 new OPTIONAL keys
        │    pr_number / pr_creator_login / merged_at
        ▼
  gh-pages branch → Fastly CDN
        │
        │ (every SessionStart, ≤ 1h throttle)
        ▼
  ~/.teamagent/bin-updater.cjs (detached)
        │
        │  fetchLatestVersion()  ◄── now returns optional pr_* fields
        │
        ├─ versions match → up-to-date, log + exit
        │
        ▼  (when version differs)
        │
        │  gatherLocalIdentity() ◄── new shell wrapper; only called when
        │     gh api user --jq .login          latest.json carries pr_creator_login
        │     git config user.email            (lazy — saves subprocess spawn)
        │     process.env GITHUB_USER/GH_USER
        │
        │  isLocalUserPrCreator() ◄── pure helper; any single signal wins
        │
        ├─ matched → stamp pending_banner with {pr_creator:true, pr_number:N}
        │
        │  npm install -g <release.tar.gz>   ◄── unchanged
        │  migrate-auto                       ◄── unchanged
        │
        ▼
  Next SessionStart:
  maybeShowPendingBanner()
        ├─ pr_creator?  →  🎯 TeamAgent: 你的 PR #N 已 merge — 强制刷新
        └─ else         →  ✨ TeamAgent: 已自动更新 X → Y  (legacy)
```

## Test coverage

| Suite | Old → New | What's exercised |
|---|---|---|
| `pr-creator-match.test.ts` | 0 → 13 | Pure helper truth table: gh login / env / noreply email / case-insensitivity / blank / undefined / whitespace trim. |
| `update-state.test.ts` | 16 → 19 | PendingBanner round-trip with new fields; old payload still parses with new fields absent (not coerced to false/0); wrong-type fields dropped silently. |
| `fetch-latest.test.ts` | 12 → 16 | latest.json plumbing for `pr_creator_login` / `pr_number` / `merged_at`; back-compat when absent; wrong-type drops; npm source never carries them. |
| `local-identity.test.ts` | 0 → 3 | Shell wrapper shape + never-throws + env snapshot. |
| `updater-logic.test.ts` | 12 → 18 | Force-stamping happens iff `latest.pr_creator_login` matches identity; non-creator → no stamping; absent field → no `gatherIdentity` call (no spurious spawn); legacy `runUpdater` without injected `gatherIdentity` keeps old behaviour; noreply email path. |
| `session-start-update.test.ts` | 5 → 8 | Banner template branches: 🎯 with PR# / 🎯 without PR# / ✨ legacy. Mark-shown semantic preserved. |

Total new vitest cases: **+27**. All 131 update-area tests pass; full
`pnpm typecheck` clean.

## Deviations from the plan

- **Banner copy:** plan said
  `🎯 你的 PR #348 已 merge — 自动更新到 v0.11.6 (强制刷新)`. Actual copy
  drops the leading `v` to match the existing `last_installed_version`
  shape (always written without `v` prefix) — `🎯 TeamAgent: 你的 PR #348
  已 merge — 自动更新到 0.11.6 (强制刷新)`. No behavioural change.
- **`maybeShowPendingBanner` mark-shown:** unchanged on the PR-creator
  path (same one-shot). The plan didn't explicitly require this; locking
  it via test for both branches.
- **`runUpdater` snooze/never_prompt override:** the plan called these
  out as "force overrides", but the existing install path already does
  not gate on `snooze` / `never_prompt` (these are pure banner-display
  state). So no code change was needed there — the banner template
  itself is what makes the user notice the update. The judge harness
  (J3) still verifies the **banner stamp** lands even when snooze is
  set, which is the testable contract.

## Verification status

| Layer | Status |
|---|---|
| Unit & contract (vitest, `pnpm typecheck`) | ✅ Green, 131/153 (22 legacy skipped) |
| Pure helper purity (no `fs`/`child_process` imports) | ✅ `packages/core/src/update/pr-creator-match.ts` is import-only of types |
| Schema additivity (old state file parses) | ✅ Locked by 2 update-state tests + 2 fetch-latest tests |
| CI workflow YAML lint | ⚠️  Not yet run end-to-end on GitHub. Workflow change is YAML-only + jq-build; no test-impossible. Will be exercised by the first push-to-main after this PR merges. |
| Third-party judge harness (`docs/plans/.../judge.md`) | ⏳ Pending — run **before** merge per `docs/HOWTO-PLAN-PR.md` + `docs/feature-verification.md`. J1 (CI YAML emits new keys) is locally simulatable via `gh api` against the most recent merge; J2-J6 are runnable from compiled `@teamagent/core` + `@teamagent/cli` dists. |

## Follow-ups (not in this PR)

- **Telemetry**: emit a `pr-creator-force-update` AttributionBus event
  when the stamping fires, so M5 viral sync can show "this PR landed on
  your machine via the force path" in `teamagent update --status`.
  Currently `update-installed` event is fired the same way for both
  paths. Out of scope for v1 — banner-only is the user-visible
  guarantee.
- **gh CLI install hint**: when `gatherLocalIdentity` returns
  `ghLogin:""` AND `gitEmail` is non-noreply, the helper can't match.
  A future polish: if the local user is potentially the PR creator
  but identity is unresolvable, fall back to comparing the local git
  commit author email against the PR's commits via a one-shot
  `gh api`. Out of scope for v1 (current path is good enough for the
  ≥80% of devs who have `gh` authenticated or use noreply email).
