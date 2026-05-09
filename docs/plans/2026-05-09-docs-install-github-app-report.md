```text
   plan ──► implement ──► judge harness §V1 RUN ──► report
                                  │
                                  ▼
              5/5 local checks PASS, 2 cloud probes deferred
                                  │
                                  ▼
                        push + open PR (no draft)
                                  │
                                  ▼
                        POSTPR loop: local /review +
                        cloud claude-code-review.yml
```

# Report — `/install-github-app` doc-only PR

Companion to `docs/plans/2026-05-09-docs-install-github-app.md`.

## What shipped

7 files changed, all `docs/`. No edits to `.github/workflows/`, no edits
to `docs/adr/0007-*.md`, no source-code or `scripts/*.sh` edits. Branch:
`docs/install-github-app` from `origin/main` (`beecb80`, PR #190
`Add Claude Code GitHub Workflow`).

| File | Change | Lines |
|---|---|---|
| `docs/plans/2026-05-09-docs-install-github-app.md` | added (this PR's plan, 3 sections + harness) | +159 |
| `docs/features/claude-code-action.md` | added (the new feature doc) | +148 |
| `docs/POSTPR.md` | edited (Caveats + Re-trigger bullet) | +2 / -1 |
| `docs/PR-PLAN.md` | edited (What it is preamble) | +6 |
| `docs/HOWTO-PLAN-PR.md` | edited (POSTPR section) | +6 |
| `docs/README.md` | edited (Start Here row) | +1 |
| `docs/features/INDEX.md` | edited (new infra section) | +6 |
| `docs/plans/2026-05-09-docs-install-github-app-report.md` | added (this report) | +(this) |

Commit shape (atomic per concept, per project rule):

1. `docs(install-github-app): plan three sections — task / outputs / md judge`
2. `docs(install-github-app): new feature doc for Claude Code Action workflows`
3. `docs(install-github-app): note dual-signal in POSTPR / PR-PLAN / HOWTO`
4. `docs(install-github-app): cross-link new feature doc from README and features/INDEX`
5. `docs(install-github-app): report` (this file)

## Plan vs reality

| Expected output | Status |
|---|---|
| Plan committed, three sections, ASCII art | ✓ shipped (159 lines, < 200) |
| Feature doc with 5 anchors (`claude.yml`, `claude-code-review.yml`, `CLAUDE_CODE_OAUTH_TOKEN`, `code-review@claude-code-plugins`, `ADR-0007`) | ✓ shipped (148 lines, anchors counted 4/5/5/2/3) |
| `docs/POSTPR.md` Caveats updated | ✓ shipped (one new bullet on cloud signal + Re-trigger bullet extended) |
| `docs/PR-PLAN.md` "What it is" updated | ✓ shipped (cloud GH Action added to review-source list + 1 paragraph reconciling with ADR-0007) |
| `docs/HOWTO-PLAN-PR.md` POSTPR section updated | ✓ shipped (1 paragraph added) |
| `docs/README.md` row added | ✓ shipped |
| `docs/features/INDEX.md` registers new entry | ✓ shipped — placed in a **new** "Repo infrastructure / integrations" mini-section so the product-feature VERIFIED table stays clean (small delta from the original plan, which suggested an inline registration) |
| Report file written | ✓ this file |
| Normal (non-draft) PR | ✓ planned for next step |
| No edits to `.github/workflows/`, ADR-0007, source code, `scripts/*.sh` | ✓ verified by `git diff --stat origin/main..HEAD` |

Single deviation from the plan: `docs/features/INDEX.md` got a separate
"Repo infrastructure / integrations" mini-section instead of an inline
row in the existing VERIFIED table. Reason: the existing INDEX is
organised around *TeamAgent product features*; mixing a GH Actions
infra entry into the VERIFIED table would conflate "shipped TeamAgent
behaviour" with "repo CI integration". The mini-section keeps the
classification honest while still making the doc discoverable from the
features INDEX.

## Judge harness §V1 RUN — local results

Run from the worktree at `2026-05-09T14:32 +08`:

| # | Check | Result |
|---|---|---|
| 1 | Each new/edited `.md` < 200 lines | PASS — plan 159, feature doc 148, edits ≤ 7 lines each |
| 2 | New docs open with ASCII art (per AGENTS.md rule 10) | PASS — 11 and 16 box-drawing chars in first 30 lines |
| 3 | Feature doc names all 5 anchors | PASS — counts 4/5/5/2/3 |
| 4 | No edits to `.github/workflows/*.yml`, `docs/adr/0007-*.md`, or `packages/**` | PASS — `git diff --stat` only shows `docs/` |
| 5 | No new `scripts/*.sh` introduced | PASS — `git diff --name-only -- 'scripts/*.sh'` empty |

## Judge harness §V2 / §V3 / §V6+§V7 — deferred to POSTPR

The two `claudefast -p` probes (§V6 and §V7 in the plan's harness) verify
ADR-0007's "self-discipline-via-matcher" gate is **not** weakened by this
PR, and that the new feature doc is discoverable. They are deferred to
POSTPR (§V6 must pass before merge; §V7 is informational):

- **§V6**: `claudefast -p "what should we do when we make a PR?"` must
  still name `/review`, POSTPR loop, PR-PLAN, TEAMWORK organically (no
  canned-answer block, no hook anchor). This PR does not introduce any
  such block, but the probe is the actual ADR-0007 verification gate.
- **§V7**: `claudefast -p "what GitHub Actions does this repo run on PRs?"`
  should now name both `claude.yml` (mention bot) and
  `claude-code-review.yml` (auto review). Informational — confirms the
  new doc lands in the matcher's retrieval window.

## Risks / follow-ups

- **None blocking merge of this PR.**
- **Plugin pinning** — `claude-code-review.yml` references
  `code-review@claude-code-plugins` without a version pin. Behaviour
  drift is possible. If the cloud signal becomes noisy, follow up with
  a PR-PLAN that pins the version or adds a `paths:` filter (out of
  scope here).
- **Cost / rate-limit watch** — every PR open + every `synchronize`
  fires the auto-review. Long TEAMWORK PRs multiply this. If the
  Anthropic API bill or rate limit becomes an issue, tighten triggers
  (PR-PLAN required).
- **Future ADR-0010?** — if we eventually decide to formalise the cloud
  signal as part of the gate (e.g. "block merge until cloud review
  posts a 👍"), that's a fresh ADR, not an amendment to ADR-0007. Not
  in scope for this PR.

## Verification gate

This PR's verification is the §V1 RUN local checks above (PASS) plus the
POSTPR-time §V6 ADR-0007 probe (must remain PASS post-merge — no canned
answer / hook anchor was introduced, so the probe should still resolve
organically). The cloud `claude-code-review.yml` will fire automatically
when the PR opens and posts a supplementary signal.

## Post-PR observation — fix-cycle 1 (added 2026-05-09)

PR #191 opened. The cloud `claude-review` GH Action fired and **failed**:

```text
App token exchange failed: 401 Unauthorized — Claude Code is not
installed on this repository. Please install the Claude Code GitHub
App at https://github.com/apps/claude
```

This was a useful real-world signal even though the cloud action never
got far enough to post a code review comment: the failure exposed a doc
gap. The original `claude-code-action.md` named the
`CLAUDE_CODE_OAUTH_TOKEN` secret but did not name the second half of the
install — the **GitHub App authorization** at
`https://github.com/apps/claude`. The OAuth token alone fails OIDC →
app-token exchange.

Per `docs/PR-PLAN.md` (no follow-up issues for in-flight PRs), a
fix-cycle ran inside this PR:

- `docs/plans/2026-05-09-pr-191-fix-plan.md` — minimal PR-PLAN.
- `docs/features/claude-code-action.md` — gained a "Prerequisites — both
  halves of the install" section near the top and a "Troubleshooting"
  section with the verbatim 401 error string + remediation.
- `docs/plans/2026-05-09-pr-191-fix-report.md` — companion fix-report.

The cloud action will continue to fail until a human completes the App
authorization at `https://github.com/apps/claude`. That is **not**
blocking for this docs-only PR per ADR-0007 — the **local** `/review`
skill remains the authoritative gate and does not depend on the GitHub
App. The chatgpt-codex-connector[bot] also commented on this PR with
"You have reached your Codex usage limits for code reviews" — the old
Codex bot is still wired up at the org level (separate cleanup) but is
rate-limited and unable to add review pressure here either.
