```text
        ┌──────────────────────────────────────────────────────┐
        │  research.md · post-merge PR-creator auto-update     │
        │                                                      │
        │  existing pipeline ──► gap analysis ──► design space │
        └──────────────────────────────────────────────────────┘
```

# Research — Post-merge auto-update for PR creator

> Context for `plan.md` in the same directory. Pure findings — what exists,
> what's missing, what we will reuse vs. add.

## 1. Existing auto-update pipeline (already shipped)

```
  push: main
      │
      ▼
.github/workflows/release-branch.yml
      │  steps:
      │   1. Detect version (jq packages/teamagent/package.json)
      │   2. Pack tarball (pnpm pack)
      │   3. Stage dist/postinstall/install.sh into /tmp/release-stage
      │   4. Create GitHub Release vX.Y.Z (idempotent)
      │   5. Force-push to `release` branch
      │   6. Publish latest.json to gh-pages
      ▼
gh-pages branch ← {version, sha, releasedAt, tarball, generatedBy}
      │
      │ ~hourly poll (CDN, no auth, no rate limit)
      ▼
User machine: bin-updater.cjs (spawned detached by SessionStart hook)
      │
      │ fetchLatestVersion() → version + sha
      │
      │ if remoteVersion === state.last_installed_version → log "up-to-date"; exit
      │
      │ otherwise: backup → npm install -g tarball → migrate-auto
      │            → state.pending_banner = {from, to, at, shown:false}
      ▼
Next SessionStart: maybeShowPendingBanner()
      └─► stderr: "✨ TeamAgent: 已自动更新 <from> → <to>"

Throttle: shouldCheckUpdate() returns true only every state.interval_hours
          (default 1h); user can --disable, --snooze (24h/48h/7d ladder),
          or --never (permanent banner opt-out, install still runs).
```

**Source files** (all in `packages/cli/src/`):

- `bin-updater.ts` — detached subprocess entry, wires deps for `runUpdater`.
- `updater-logic.ts` — pure `runUpdater(deps)` — version-check → install → migrate → state write.
- `update/fetch-latest.ts` — Pages → npm fallback fetch; returns `{ok, version, sha?, source}`.
- `session-start-logic.ts` — `shouldSpawnUpdater()`, `spawnUpdater()`, `maybeShowPendingBanner()`,
  `maybeShowUpgradePrompt()`.
- `commands/update.ts` — foreground subcommands: `check / now / status / disable / enable / rollback / logs / snooze / never`.

**State schema** (`packages/core/src/update/update-state.ts`):

```ts
interface UpdateState {
  last_check_ts; interval_hours; last_installed_sha; last_installed_version;
  installed_at; consecutive_install_failures; last_install_error;
  pending_banner: { from; to; at; shown } | null;
  reinstall_banner_shown_at;
  last_branch_etag; last_branch_sha; next_check_after_ts; consecutive_rate_limits;
  snooze_until_ts; snooze_level; never_prompt; prompt_dismissed_for_to;
}
```

## 2. What's NOT there today

| Gap | Detail |
|---|---|
| **`latest.json` carries no PR-creator metadata.** | Schema is `{version, sha, releasedAt, tarball, generatedBy}`. The release CI step does NOT call the GitHub API to look up which PR landed this commit, so the user's local updater can't tell "is this MY merge?". |
| **No local identity probe.** | `updater-logic` doesn't read `git config user.email` or any GitHub login — only state.json. There's no concept of "is the user running this updater the PR creator?". |
| **`snooze` and `never_prompt` can silence updates indefinitely.** | A snoozed user who just merged a PR will NOT get the update until `snooze_until_ts` elapses (24h-7d). For a PR creator whose `claudefast` / `claude` instance just changed shared behaviour, that's wrong — the next session must run the new code. |
| **`shouldCheckUpdate` has 1h debounce.** | Worst case: PR merges T+0, user opens session T+0:05, hook spawns updater, updater fetches latest.json, sees new version, installs. **OK.** But if `last_check_ts` was set <1h ago by a previous session, the spawn is skipped → up to ~1h delay. We can bypass this for PR creators. |
| **Banner is identical for everyone.** | "✨ TeamAgent: 已自动更新 X → Y" is neutral. A PR creator deserves a custom banner ("🎯 你的 PR #N 已 merge — 自动更新到 vY.Z（强制）") so they can tell their change shipped to their own box. |

## 3. PR creator identity — what's available

**On the CI side** (where `latest.json` is built):

- `${{ github.sha }}` = merge commit SHA.
- `gh api repos/${{ github.repository }}/commits/${{ github.sha }}/pulls --jq '.[0]'`
  returns the merged PR's JSON; `.user.login` = creator's GitHub login,
  `.number` = PR number, `.merged_at` = timestamp.
- This repo squash-merges only (project rule, see `docs/POSTPR.md`), so every
  `push: main` corresponds to exactly one PR. **No multi-PR ambiguity.**

**On the local side** (where bin-updater runs):

- `git config user.email` — set by `git` at clone time; usually the user's
  `belakholesovsky@gmail.com`-style address.
- `git config user.name` — display name.
- `gh api user --jq .login` — authoritative GitHub login IF the user has `gh`
  installed AND authenticated. Often true for active devs; not guaranteed.
- `process.env.GITHUB_USER` / `GH_USER` — set on some CI/dev machines.

**Match heuristic**: match `pr_creator_login` against:
1. `gh api user --jq .login` (best signal — authenticated GitHub identity)
2. `GITHUB_USER` / `GH_USER` env
3. **Fallback**: a noreply-style email pattern `<login>@users.noreply.github.com`
   in `git config user.email` (GitHub default for noreply commits).
4. Email **local-part** match against login (weak — `m1` ≠ `belakholesovsky`),
   so we don't use it.

Local identity probing is **best-effort** — if no signal matches, treat as
"not the PR creator" and follow the normal 1h-debounce + snooze flow. This is
the right default: false negative = same UX as today; false positive = forces
update on someone who didn't actually write the PR (recoverable, just an extra
update).

## 4. Cross-process / privacy considerations

- `pr_creator_login` is a **public GitHub username** (already visible on the
  merged PR page). Publishing it in `latest.json` adds no privacy surface.
- We do NOT publish email, real name, or any PII.
- `gh api user` requires the user to have authenticated `gh`; we run it
  read-only and ignore failures.

## 5. Reusable seams

Designed for this feature without redesign:

- **`PendingBanner`** has an open shape — we can add optional `pr_creator: boolean`
  and `pr_number: number` (both optional in parser) without breaking old state
  files. `isPendingBanner` only requires `from / to / at / shown`.
- **`fetchLatestVersion`** result already returns optional `sha`; extending to
  `pr_creator_login? / pr_number?` is an additive change, no breakage.
- **`runUpdater`** state machine: we add a single branch — when
  `latest.pr_creator_login` matches local identity, set `force=true` and
  bypass the snooze + `last_check_ts` gate. The install path itself is unchanged
  (npm install -g tarball → migrate-auto).
- **`maybeShowPendingBanner`** reads `state.pending_banner.{from,to}`; we add
  one `if (pr_creator)` branch with a different stderr template. Old banner
  is unchanged for non-creators.

## 6. Non-goals (v1)

- **No new daemon / no webhook.** Polling latest.json is enough — within ~1h
  of merge (or immediately on next SessionStart if `last_check_ts` is stale)
  the PR creator's machine updates.
- **No team-wide attribution.** This is only for the PR's *creator*, not
  reviewers or co-authors. Future M5 viral sync can extend.
- **No CI-side push notification to the user's machine.** That requires
  per-user inbound infra (a daemon, an SSE channel, GitHub-app webhook to
  some hosted service). Out of scope; the polling + force-override design
  delivers the user-visible "MUST update on next session" semantic without
  any of that infrastructure.

## 7. Files to touch (and why)

| File | Change | Reason |
|---|---|---|
| `.github/workflows/release-branch.yml` | After the existing `latest.json` write, call `gh api repos/$REPO/commits/$SHA/pulls --jq '.[0]'` and merge `pr_number`, `pr_creator_login`, `merged_at` into `latest.json`. | Source of truth for "who merged this commit". |
| `packages/cli/src/update/fetch-latest.ts` | Extend `FetchLatestSuccess` with `pr_creator_login?: string; pr_number?: number; merged_at?: string`. Parse from `latest.json` (additive). | Plumb new fields to the updater. |
| `packages/core/src/update/update-state.ts` | Extend `PendingBanner` with optional `pr_creator?: boolean` and `pr_number?: number`. | Carry the "this update is special" flag to next SessionStart. |
| `packages/core/src/update/pr-creator-match.ts` (NEW) | Pure helper `isLocalUserPrCreator({prCreatorLogin, ghLogin, env, gitEmail})` returning `boolean`. No IO. | Functional core, testable. |
| `packages/cli/src/lib/local-identity.ts` (NEW) | Thin shell wrapper: `gatherLocalIdentity()` → runs `gh api user --jq .login` + `git config user.email` + env. Catches all errors, returns whatever it gets. | Imperative shell side of the helper. |
| `packages/cli/src/updater-logic.ts` | In `runUpdater`: after `fetchLatestVersion`, if PR-creator match → set `pending_banner.pr_creator = true; pr_number = N`. Also: when match AND `last_installed_version !== remoteVersion`, install regardless of snooze gating. | Wire the force path. |
| `packages/cli/src/session-start-logic.ts` | `maybeShowPendingBanner` — if `pending_banner.pr_creator` → render new template ("🎯 你的 PR #N 已 merge"). `shouldSpawnUpdater` — accept an optional "force" hint when a marker file exists (sets when previous run saw PR-creator pending). | User-facing message + bypass 1h gate after match. |
| `docs/features/auto-update-channel.md` | Schema bump to include new latest.json fields. | Source-of-truth doc. |
| `docs/SELF-UPDATE.md` | New "PR creator force-update" section. | User-facing doc. |

Tests follow Functional-Core-Imperative-Shell convention: pure logic in
`packages/core/src/update/__tests__/pr-creator-match.test.ts` (no IO),
integration in `packages/cli/src/__tests__/updater-pr-creator.test.ts`
(mocks all deps).
