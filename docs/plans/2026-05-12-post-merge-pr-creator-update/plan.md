```text
        ┌───────────────────────────────────────────────────────────┐
        │  plan.md · post-merge auto-update for the PR creator      │
        │                                                           │
        │  (1) task description     做什么 / 怎么做 / 不做什么      │
        │  (2) expected outputs     可验收交付物                    │
        │  (3) judge harness        第三方 JSON 评判                │
        └───────────────────────────────────────────────────────────┘
```

# Plan — Post-merge MUST-update for PR creator

> 三段铁律按 `~/.claude/CLAUDE.md` + `docs/PLAN-RESEARCH-REPORT.md`。
> 上下文见 [`research.md`](./research.md)；评判见 [`judge.md`](./judge.md)。
> 四段结构（plan / outputs / verify / probes）按 `docs/HOWTO-PLAN-PR.md`。

## CHANGELOG

- **v1** (2026-05-12): initial.

---

## (1) Task description

**做什么 / what to do**:

After every PR is squash-merged into `main`, the PR creator's `teamagent`
installation on their **own machine** MUST update to that just-released version
on their next `claude` SessionStart — overriding the normal 1-hour
debounce, overriding any active `snooze`, and overriding `never_prompt`.
The rest of the team (and unrelated machines) keeps the existing soft-poll
behaviour (~hourly Pages check, snoozeable banner).

**怎么做 / how**:

The "MUST update on PR creator's box" requirement is delivered by three additive
changes — no service, no daemon, no webhook. Everything piggybacks on the
already-shipped `latest.json` ↔ `bin-updater.cjs` polling channel.

1. **CI publishes PR-creator metadata to `latest.json`.** After
   `release-branch.yml` writes the existing `{version, sha, releasedAt,
   tarball, generatedBy}` payload, it calls
   `gh api repos/$REPO/commits/$SHA/pulls --jq '.[0]'` to look up the just-
   merged PR and merges three new fields into the same file:

   ```jsonc
   {
     // … existing fields …
     "pr_number": 348,
     "pr_creator_login": "LiuShiyuMath",
     "merged_at": "2026-05-12T03:14:02Z"
   }
   ```

2. **Local identity probe + pure match helper.** A new pure function
   `isLocalUserPrCreator({prCreatorLogin, ghLogin, env, gitEmail})` in
   `@teamagent/core` returns `true` when the local user matches the PR creator
   via (priority order) `gh api user --jq .login`, `GITHUB_USER`/`GH_USER` env,
   or `*@users.noreply.github.com` email pattern. **Pure, no IO** — testable.
   A thin shell wrapper `gatherLocalIdentity()` lives in
   `packages/cli/src/lib/local-identity.ts` and feeds the helper at runtime.

3. **Updater + banner wiring.** Inside `runUpdater` (post-fetch), if the
   helper returns `true` AND `remoteVersion !== state.last_installed_version`,
   the updater takes the **force path**:
   - install runs regardless of `snooze_until_ts` / `never_prompt`;
   - the resulting `pending_banner` carries `pr_creator: true` and
     `pr_number: <N>`;
   - `maybeShowPendingBanner` renders a distinct stderr line:
     `🎯 TeamAgent: 你的 PR #348 已 merge — 自动更新到 v0.11.6 (强制刷新)`.

**Atomic commits** (TDD — red → green → commit each):

1. `feat(m6): extend latest.json schema with PR-creator metadata in CI`
2. `feat(m6): add pr-creator-match pure helper + tests in @teamagent/core`
3. `feat(m6): add gatherLocalIdentity shell wrapper in @teamagent/cli`
4. `feat(m6): plumb pr_creator_login through FetchLatestSuccess`
5. `feat(m6): extend PendingBanner with optional pr_creator + pr_number fields`
6. `feat(m6): wire force-update path into runUpdater for PR creator`
7. `feat(m6): render distinct PR-creator banner in session-start-logic`
8. `docs(m6): update auto-update-channel.md + SELF-UPDATE.md`

**不做 / explicit non-goals**:

- ✘ No GitHub webhook, no SSE channel, no server-side push.
- ✘ No team-wide attribution (reviewers / co-authors). Only `pr_creator_login`.
- ✘ No PII in `latest.json` — only the public GitHub login.
- ✘ No new daemon / no cron / no background watcher process.
- ✘ No bypass of the `auto-update.disabled` marker — if the user explicitly
  disabled auto-update, we still respect that hard kill-switch. The force path
  only bypasses `snooze` and `never_prompt` (which are about the *banner*, not
  the install).
- ✘ No new dependencies. All new code uses node:fs / node:child_process /
  node:https — already in use.

---

## (2) Expected outputs

Concrete, file-level, reviewable deliverables (no "infrastructure improvements"
hand-waving):

### Code

| Path | What |
|---|---|
| `.github/workflows/release-branch.yml` | Adds a `gh api … /pulls` lookup + injects `pr_number / pr_creator_login / merged_at` into the heredoc that writes `latest.json`. |
| `packages/core/src/update/pr-creator-match.ts` (new) | Pure `isLocalUserPrCreator(input): boolean` + types. |
| `packages/core/src/update/__tests__/pr-creator-match.test.ts` (new) | ≥6 vitest cases covering match by gh login / env / noreply email / no signal / blank PR creator / case-insensitive. |
| `packages/core/src/update/update-state.ts` | `PendingBanner` gains optional `pr_creator?: boolean`, `pr_number?: number`. `parseUpdateState` + `isPendingBanner` accept the new fields additively. |
| `packages/core/src/update/__tests__/update-state.test.ts` | New cases: PendingBanner with PR creator round-trips; old state files still parse. |
| `packages/cli/src/update/fetch-latest.ts` | `FetchLatestSuccess` gains optional `pr_creator_login? / pr_number? / merged_at?`; parsing is additive (missing → undefined). |
| `packages/cli/src/lib/local-identity.ts` (new) | `gatherLocalIdentity(): { ghLogin?, gitEmail?, env }`. Wraps `gh api user`, `git config user.email`, `process.env`. Catches all errors. |
| `packages/cli/src/updater-logic.ts` | New `deps.gatherIdentity?: () => LocalIdentity` (optional, test-injectable). When latest carries `pr_creator_login` and helper matches, install regardless of snooze; persisted banner carries `pr_creator: true`. |
| `packages/cli/src/bin-updater.ts` | Wires the real `gatherLocalIdentity` into `runUpdater(deps)`. |
| `packages/cli/src/session-start-logic.ts` | `maybeShowPendingBanner` branches on `pending_banner.pr_creator`. New banner text uses `🎯` + PR number. |
| `packages/cli/src/__tests__/updater-pr-creator.test.ts` (new) | Integration: fetch returns `pr_creator_login` match + non-matching version → force-install fires even when snooze active. |
| `packages/cli/src/__tests__/session-start-logic.test.ts` | New cases: pr_creator banner template, fallback to legacy template, mark-shown still works. |

### Docs

| Path | What |
|---|---|
| `docs/features/auto-update-channel.md` | Schema bump for the three new `latest.json` fields. Sample payload + non-breaking-change note. |
| `docs/SELF-UPDATE.md` | New "PR creator force-update" section: trigger, semantics, opt-out (`auto-update.disabled`), banner text, FAQ. |
| `docs/plans/2026-05-12-post-merge-pr-creator-update/{plan,research,judge,report}.md` | This planning bundle. |

### Behavioural contracts (verifiable end-to-end)

1. **Schema additivity**: an old `update-state.json` (without the new PendingBanner
   fields) parses without error; default values are absent fields, not zero/false.
2. **Pure helper**: `isLocalUserPrCreator(...)` is pure — same inputs → same
   output, no `fs` / `child_process` / `os.homedir` access. Enforced by lint
   (`no-restricted-imports` in `packages/core/eslint.config`) — see Functional
   Core / Imperative Shell contract in root `CLAUDE.md`.
3. **CI step idempotency**: running the workflow twice on the same merge SHA
   produces the same `latest.json` payload (PR lookup is read-only).
4. **Force semantics**: when `latest.pr_creator_login` matches local identity
   and `remoteVersion !== state.last_installed_version`, the install path
   fires even if `state.snooze_until_ts > now` AND `state.never_prompt === true`.
   But it does NOT fire if the `auto-update.disabled` marker exists.
5. **Banner template**: when `pending_banner.pr_creator === true`,
   `maybeShowPendingBanner` writes a stderr line containing `🎯` AND
   `PR #` AND `merge`. Non-creator banners do NOT contain `🎯`.

### Walking skeleton

`pnpm teamagent skeleton-demo` still passes — no Port redesign, no breaking change.
`pnpm typecheck` clean. `pnpm vitest run packages/core/src/update packages/cli/src/__tests__/updater-pr-creator` green.

---

## (3) Third-party judge harness

See [`judge.md`](./judge.md) for the full MD playbook (per
`~/.claude/memory/feedback_judge_harness_md_playbook.md`).

**Shape**: MAIN agent dispatches 6 probes (J1…J6) via `Bash` / `claudefast -p`
subagents. Each probe writes raw stdout/stderr + a `J<N>.json` to
`.judge/<run_id>/`. A separate LLM judge ingests **only** the raw JSON +
evidence dirs and emits a final PASS/FAIL `verdict.json`. No `scripts/*.sh`
one-shot pipeline. No self-grading by the code under test.

**Pinned PASS thresholds** (counted in `verdict.json`):

| Probe | What it proves | Pass when |
|---|---|---|
| **J1** | CI workflow emits `latest.json` with the three new keys | `latest_json_keys ⊇ {pr_number, pr_creator_login, merged_at}` AND `pr_creator_login.length > 0` |
| **J2** | `isLocalUserPrCreator` truth table | all 12 test cases (matrix in judge.md) hit expected `result` |
| **J3** | `runUpdater` force-installs over snooze | when fetch returns `pr_creator_login=alice` AND identity.ghLogin=`alice` AND state.snooze_until_ts > now+1d AND state.never_prompt=true → `runNpmInstall` is called; resulting state has `pending_banner.pr_creator===true` |
| **J4** | `runUpdater` does NOT force-install for non-creators | same as J3 but identity.ghLogin=`bob` → install NOT called when snooze active; state unchanged or pending_banner.pr_creator falsy |
| **J5** | `maybeShowPendingBanner` renders the distinct template | stderr contains `🎯` AND `PR #` AND `merge` exactly when `pending_banner.pr_creator===true`; legacy template otherwise |
| **J6** | Old state files round-trip without data loss | `parseUpdateState(serialize(default))` is byte-identical; an old fixture lacking new fields parses with new fields absent (NOT `false`) |

**Verdict gate**: all six probes PASS. Any FAIL → block merge; re-loop.

---

## Notes for `/review` reviewers

- Functional-Core-Imperative-Shell: the new helper is pure (no `fs`,
  `child_process`, `os`). All IO is in the new shell wrapper which is small,
  no logic, and catches every error.
- `latest.json` schema is **additive**: missing fields default to undefined.
  Old `teamagent` installs ignore new fields safely.
- `PendingBanner` schema is **additive**: same story.
- `auto-update.disabled` remains a hard kill-switch — no force-update there.
- No new HTTP endpoints, no new env vars, no new flags. (Existing
  `TEAMAGENT_GITHUB_TOKEN` etc. are unchanged.)
- Privacy: only `pr_creator_login` (public GitHub username) is published.
