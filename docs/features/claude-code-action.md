> **DEPRECATED — both workflows removed in PR #274 (2026-05-10).**
>
> `anthropics/claude-code-action@v1` failed on every PR with
> `Internal error: directory mismatch for directory ... tsconfig.json, fd 4`
> and the workflow files referenced `secrets.ANTHROPIC_API_KEY` which the
> repo did not define. Per ADR-0007 the local `/review` skill is the
> authoritative POSTPR gate, so the cloud workflows were redundant
> supplementary noise.
>
> The page below is preserved for historical reference only — describing
> what `/install-github-app` used to install before deletion. To re-enable
> a cloud review path, restore both `.github/workflows/{claude.yml,claude-code-review.yml}`
> and configure a real `ANTHROPIC_API_KEY` secret (the action does not
> accept the MiniMax base URL the repo uses elsewhere). See PR #274
> `docs/plans/2026-05-10-boil-the-ocean-cleanup/research.md` §2 for the
> full root-cause writeup.

```text
                ┌─────────────────────────────────────────────────┐
                │   [HISTORICAL] Claude Code GH Action workflows   │
                │   removed in PR #274 — kept here for reference   │
                └─────────────────────────────────────────────────┘

   PR opened / synchronized              issue / PR comment / review
   /reopened / ready_for_review          body or title contains "@claude"
            │                                       │
            ▼                                       ▼
   ┌──────────────────────────┐        ┌────────────────────────────┐
   │ claude-code-review.yml   │        │ claude.yml                 │
   │  auto, no opt-in needed  │        │  on-demand mention bot     │
   │  runs /code-review:      │        │  follows the @claude       │
   │  code-review plugin      │        │  comment as the prompt     │
   └────────────┬─────────────┘        └─────────────┬──────────────┘
                │                                    │
                ▼                                    ▼
        anthropics/claude-code-action@v1   uses CLAUDE_CODE_OAUTH_TOKEN secret
                │                                    │
                └─────────────┬──────────────────────┘
                              ▼
              POSTPR loop — local /review skill stays
              the authoritative gate (ADR-0007); the
              cloud signal above WAS supplementary.
```

# Claude Code GitHub Action — `/install-github-app` outputs (HISTORICAL)

This page documents the two GitHub Actions workflows that `/install-github-app`
(invoked locally inside Claude Code) used to install into the repo via PR #190
`Add Claude Code GitHub Workflow`. Both workflows lived under
`.github/workflows/` and ran on Anthropic's `anthropics/claude-code-action@v1`.
**They were removed in PR #274 (2026-05-10).**

## What gets installed

| File | Trigger | Purpose |
|---|---|---|
| `.github/workflows/claude.yml` | `issue_comment` / `pull_request_review_comment` / `pull_request_review` / `issues` (open or assigned) where the body or title contains literal `@claude` | On-demand mention bot. Claude reads the surrounding context (issue body, comment, review) and acts on whatever the comment asks for. |
| `.github/workflows/claude-code-review.yml` | `pull_request: [opened, synchronize, ready_for_review, reopened]` | Automated PR review. Runs every time a PR opens or gets new commits. Uses the `code-review@claude-code-plugins` plugin from the upstream `https://github.com/anthropics/claude-code.git` plugin marketplace and prompts Claude with `/code-review:code-review <repo>/pull/<n>`. |

Both jobs run on `ubuntu-latest`, check the repo out at depth 1, and authenticate
to Anthropic via the `CLAUDE_CODE_OAUTH_TOKEN` repo secret. Permissions granted:
`contents: read`, `pull-requests: read`, `issues: read`, `id-token: write`
(plus `actions: read` on the mention bot so Claude can read CI results when
asked).

## Prerequisites — both halves of the install

`/install-github-app` is **two-sided**, and only the local half writes files
into the repo. Both halves must complete or the action 401s at runtime:

1. **Workflow YAML + repo secret** (local half, what `/install-github-app`
   does on your machine): writes `.github/workflows/claude.yml` +
   `claude-code-review.yml` and stores `CLAUDE_CODE_OAUTH_TOKEN` as a repo
   secret. PR #190 already shipped the YAML; the secret may or may not be
   set depending on whether the install flow's GitHub-side OAuth was
   completed.
2. **Claude Code GitHub App install on the repo** (remote half, browser
   flow at `https://github.com/apps/claude`): the App must be granted
   access to this repository. Without it, the action's OIDC →
   app-token-exchange step returns `401 Unauthorized — Claude Code is
   not installed on this repository. Please install the Claude Code
   GitHub App at https://github.com/apps/claude`. Re-running
   `/install-github-app` is the supported way to re-trigger the OAuth
   flow if it was cancelled.

The OAuth token alone is **not** sufficient. The token authenticates the
action to Anthropic API, but the App install is what authorises Anthropic
to mint a per-PR app token via OIDC exchange.

## Required secret

`CLAUDE_CODE_OAUTH_TOKEN` — a Claude Code OAuth token, set as a **repo secret**
(not org secret unless you want it visible to siblings). The `/install-github-app`
flow walks you through generating and pasting the token. It must be set; both
workflows reference it directly via `${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`.
Don't put the token value in commit messages, PR bodies, or doc snippets — when
quoting the wrapper or workflow, write the value as `[redacted]`, same convention
as `claudefast` (see `docs/CLAUDEFAST.md`).

## How to invoke the mention bot

`@claude` is a literal string match against the comment / review / issue body
or the issue title. Examples that fire the workflow:

- New issue body: `@claude please draft a fix plan for this regression.`
- PR review: leave a top-level review with body `@claude can you re-check this hunk?`
- PR review comment: inline `@claude what's wrong with this assertion?`
- Issue comment: `@claude follow PR-PLAN.md and propose patches.`

Examples that do **not** fire it:

- Issue *title* without `@claude`. (Title match is checked, but only via
  `github.event.issue.title` — the body is also checked, so put `@claude`
  in either place.)
- A comment containing `claude` without the leading `@`.
- A PR description body. (Use a comment instead.)

## How the auto-review used to fire (pre-PR #274)

`claude-code-review.yml` fired on every relevant `pull_request` event. The
optional path filter and PR-author allowlist were commented out by default,
so the job ran on every PR regardless of who opened it or which paths
changed. Scoping would have required editing the `paths:` and `if:` blocks
inside that workflow file (PR-PLAN required). The workflow was deleted
in PR #274; this section is historical narrative only.

The job's prompt is hard-coded to:

```text
/code-review:code-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}
```

The `code-review` plugin lives at the upstream marketplace
`https://github.com/anthropics/claude-code.git` (declared via
`plugin_marketplaces:`). Output appears as a normal PR review / comment.

## How this sits with ADR-0007

`docs/adr/0007-local-review-skill-as-review-gate.md` declares the **local**
gstack `/review` skill the canonical post-PR review gate (replacing the
old cloud `chatgpt-codex-connector[bot]` flow). That ADR is **not** rewritten
by `/install-github-app`. The dual-signal reality after this install:

| Signal | Location | Authority for POSTPR loop |
|---|---|---|
| **Local `/review` skill** | gstack user-level skill, run by the agent or by a human typing `/review` in Claude Code | **Authoritative gate.** ADR-0007 names this as the only blocking signal; `claudefast -p "what should we do when we make a PR?"` must still return a `/review`-anchored answer. |
| **Cloud `claude-code-review.yml` job** [REMOVED PR #274] | Used to auto-run on every `pull_request` open/sync; posted as a PR review/comment | **WAS** a supplementary signal, non-blocking. Removed because the underlying action chronically failed; ADR-0007's local gate was already authoritative. |
| **`@claude` mention bot** (`claude.yml`) [REMOVED PR #274] | Used to fire on explicit `@claude` mention in issue/PR comments | Was never a review gate — utility for ad-hoc help. Removed alongside the auto-review workflow for the same reason. |

After PR #274 the only signal in this table is the local `/review` skill;
there is no cloud counterpart to reconcile against. The historical
disagreement-resolution rule (local wins) is moot.

## Caveats

- **PR #190 is the install record.** If you ever need to remove the
  workflows, revert PR #190 (or delete the two `.github/workflows/*.yml`
  files in a fresh PR) — the secret can stay set; the workflows simply stop
  triggering once the YAML is gone.
- **Plugin pinning.** The auto-review uses `plugins: 'code-review@claude-code-plugins'`
  without a version pin. Behaviour can drift as the upstream plugin updates;
  if the cloud signal becomes noisy, pin a version or add a `paths:` filter
  in the YAML — both edits go through PR-PLAN.
- **Cost / rate limits.** Every PR open and every `synchronize` push fires
  the auto-review. For long-running TEAMWORK PRs with many fix-pushes this
  multiplies. Monitor in repo billing; consider tightening triggers if the
  bill or rate limit becomes an issue.
- **No `--draft` opt-out.** The auto-review fires on `opened` regardless of
  draft status. Project rule still says "no draft PRs" (`CLAUDE.md`), so
  this matches our convention; don't try to dodge the cloud review by
  toggling draft.
- **Token scope.** `CLAUDE_CODE_OAUTH_TOKEN` grants the action Anthropic API
  access. It's **not** a GitHub PAT; it doesn't read code outside the PR
  diff that Claude already has via the checkout. Rotate via
  `/install-github-app` if compromised.

## Troubleshooting

**`App token exchange failed: 401 Unauthorized — Claude Code is not
installed on this repository. Please install the Claude Code GitHub App
at https://github.com/apps/claude`** (verbatim error from the cloud
`claude-review` job).

Means the OAuth token half is set but the GitHub App half isn't. The
`anthropics/claude-code-action@v1` step exchanges its OIDC token for a
per-PR app token via Anthropic's token-exchange endpoint, which checks
that the App is installed on the calling repository. If the install
flow's browser-side authorization was cancelled or never completed, the
exchange returns 401 and the action fails before any review runs. Fix:
re-run `/install-github-app` and complete the GitHub App authorization
when redirected to `https://github.com/apps/claude`. The local `/review`
skill is unaffected by this failure mode (it doesn't touch GitHub Apps).

**Workflow runs but never posts a comment, no error.** Check the run logs
for `INPUT_PLUGINS` / `INPUT_PLUGIN_MARKETPLACES` lines — both must be
non-empty for the auto-review job to load `code-review@claude-code-plugins`.

**Cloud review disagrees with local `/review`.** Per ADR-0007 the local
finding wins by default. Triage via `docs/POSTPR.md`'s
review-finding-vs-implementation row.

## See also

- `docs/POSTPR.md` — POSTPR loop; the local `/review` skill stays the
  authoritative gate.
- `docs/PR-PLAN.md` — what to write when review (cloud or local) flags
  issues on an open PR.
- `docs/HOWTO-PLAN-PR.md` — pre-PR plan structure.
- `docs/adr/0007-local-review-skill-as-review-gate.md` — the ADR this
  install sits beside, not on top of.
- `.github/workflows/claude.yml`, `.github/workflows/claude-code-review.yml`
  — the YAML the install actually wrote.
- Upstream: `anthropics/claude-code-action`
  (`https://github.com/anthropics/claude-code-action`) and the plugin
  marketplace at `https://github.com/anthropics/claude-code.git`.
