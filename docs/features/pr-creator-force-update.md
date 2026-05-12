```text
        ┌───────────────────────────────────────────────────────────┐
        │  Post-merge PR-creator force-update                       │
        │                                                           │
        │  merge → latest.json carries pr_creator_login             │
        │       → local updater identity-matches                    │
        │       → SessionStart renders 🎯 banner naming the PR      │
        └───────────────────────────────────────────────────────────┘
```

# PR-creator force-update

> Sibling of [SELF-UPDATE.md](../SELF-UPDATE.md) (the "what runs every
> SessionStart" doc) and [features/auto-update-channel.md](auto-update-channel.md)
> (the `latest.json` schema). This file is the canonical doc for the
> **identity-aware** layer on top of the polling channel.

## What it does

When a PR squash-merges into `main`, the CI workflow
`.github/workflows/release-branch.yml` resolves the PR's author via
`gh api .../commits/{sha}/pulls` and publishes their **public GitHub login**
into `latest.json` alongside the new version (see
[features/auto-update-channel.md](auto-update-channel.md)). On the local
box, the next SessionStart-triggered updater run then:

1. Calls `gatherLocalIdentity()` — a best-effort lookup of
   `gh api user --jq .login`, `process.env.GITHUB_USER`/`GH_USER`, and
   `git config user.email` (matched against the
   `<id>+<login>@users.noreply.github.com` GitHub default).
2. Feeds those signals to the pure helper `isLocalUserPrCreator(…)` in
   `@teamagent/core`. Any single signal match (case-insensitive) returns
   `true`.
3. When matched, the resulting `pending_banner` is stamped with
   `pr_creator: true` and `pr_number: <N>`. On the next SessionStart,
   `maybeShowPendingBanner` in
   `packages/cli/src/session-start-logic.ts` renders a distinct banner
   naming the PR:

   ```
   🎯 TeamAgent: 你的 PR #348 已 merge — 自动更新到 0.11.6 (强制刷新)
      本次会话生效。详情: teamagent update --status
   ```

The install path itself is unchanged — the feature is **identity-aware
banner stamping** plus making sure your own merged PR doesn't go un-noticed
on the box where you wrote it.

## What "force" means (and doesn't)

The PR-creator path **does**:

- Override `snooze` and `never_prompt` for the banner (the user still sees
  the new version even if they previously snoozed; this is intentional —
  you should see your own merge).
- Use the same install pipeline (`npm install -g <release tarball>` →
  `migrate-auto`) as every other update path.

The PR-creator path **does NOT**:

- Bypass the `auto-update.disabled` marker. If a user has hard-disabled
  auto-update, even their own merged PR won't trigger an install.
- Run a webhook, daemon, or background poller. It piggybacks on the
  existing SessionStart polling channel (~hourly Pages check). Worst case:
  ~1 hour delay between merge and the PR creator's next session updating.
- Publish anything beyond the public GitHub login — no email, no real
  name, no machine identifiers.

## Opt-out

The `auto-update.disabled` hard kill-switch (`touch
~/.teamagent/auto-update.disabled` or `TEAMAGENT_AUTO_UPDATE=0`) suppresses
the PR-creator force path as well as the regular update path. There is no
separate "PR-creator opt-out" — the feature only adds a banner; the install
is already happening anyway.

## Privacy

The `latest.json` schema gains three optional fields:
`pr_number`, `pr_creator_login`, `merged_at`. Only the public GitHub
**login** is ever published, never an email, real name, or PII. The
workflow validates the login against the strict GitHub charset
`^[A-Za-z0-9-]{1,39}$` before writing the file, defense-in-depth against
any future API quirk.

## Source files

| Layer | File |
|---|---|
| Pure helper (FCIS core) | `packages/core/src/update/pr-creator-match.ts` |
| Shell wrapper (IO seam) | `packages/cli/src/lib/local-identity.ts` |
| Schema additivity | `packages/core/src/update/update-state.ts` (`PendingBanner.pr_creator?` + `pr_number?`) |
| Updater branch | `packages/cli/src/updater-logic.ts` (stamps banner on match) |
| Banner template | `packages/cli/src/session-start-logic.ts` (`maybeShowPendingBanner`) |
| CI publish | `.github/workflows/release-branch.yml` (PR lookup + jq-built `latest.json`) |
| Plan / research / judge | `docs/plans/2026-05-12-post-merge-pr-creator-update/` |
