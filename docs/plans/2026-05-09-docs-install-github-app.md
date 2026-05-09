```text
   /install-github-app  ──►  PR #190 landed two workflows on origin/main
                                   │
                                   ▼
   .github/workflows/claude.yml              .github/workflows/claude-code-review.yml
       (@claude mention bot)                      (auto PR review on open/sync/reopen)
                                   │
                                   ▼
              docs were silent about both ──► this plan documents them
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
   new feature doc              edit POSTPR /            update README +
   docs/features/               PR-PLAN / HOWTO          features/INDEX
   claude-code-action.md        (dual-signal note)
                                   │
                                   ▼
                     POSTPR loop — local /review still authoritative,
                     cloud GH Action review is a secondary signal
```

# Plan — document `/install-github-app` outputs

`/install-github-app` (Claude Code's GitHub App / Action installer) was run in
the project session on 2026-05-09. The actual artefacts had already landed on
`origin/main` via PR #190 `Add Claude Code GitHub Workflow`:

- `.github/workflows/claude.yml` — `@claude` mention bot triggered by
  `issue_comment`, `pull_request_review_comment`, `pull_request_review`, and
  `issues` events whose body/title contains `@claude`.
- `.github/workflows/claude-code-review.yml` — automated PR review fired on
  `pull_request: [opened, synchronize, ready_for_review, reopened]` that runs
  the `code-review@claude-code-plugins` plugin via `anthropics/claude-code-action@v1`.

Both workflows authenticate with the `CLAUDE_CODE_OAUTH_TOKEN` repo secret. No
project doc currently explains either workflow, and the existing POSTPR /
PR-PLAN / HOWTO-PLAN-PR doc set still anchors the whole post-PR review
narrative on the **local** `/review` skill (per ADR-0007). This plan
documents the workflows, names the secret + plugin, and reconciles the
dual-signal reality without rewriting ADR-0007.

## ① Task description

Make the install reproducible and the dual-signal post-PR review situation
honest.

Doing:

- Add `docs/features/claude-code-action.md` (new) — what each workflow does,
  triggers, permissions, the `CLAUDE_CODE_OAUTH_TOKEN` secret, the
  `code-review@claude-code-plugins` plugin, and a "How this sits with
  ADR-0007" section.
- Patch `docs/POSTPR.md` — add a Caveat that the GH Action `claude-code-review`
  job posts a separate review comment on every PR; the **local** `/review`
  skill remains the authoritative POSTPR gate.
- Patch `docs/PR-PLAN.md` — add the same dual-signal note in the "What it is"
  preamble.
- Patch `docs/HOWTO-PLAN-PR.md` — extend the POSTPR mini-section with the
  cloud-signal mention.
- Patch `docs/README.md` "Start Here" + "Directory Map" — link the new
  feature doc.
- Patch `docs/features/INDEX.md` — register the new entry.

Not doing (out of scope, deferred):

- Rewriting ADR-0007. The local `/review` skill is still the canonical
  blocking gate; ADR-0007 stays as written. If we later choose to formalise
  the cloud signal as part of the gate, that's a fresh ADR-0010, not a
  rewrite.
- Editing the `.github/workflows/*.yml` files themselves — they shipped via
  PR #190 and are already correct.
- Wiring `claude-code-action` into existing TEAMWORK / FASTPROBE flows. This
  PR documents what exists, not new automation.
- Adding a new ADR or amending ADR-0007. (Same reason as above.)

## ② Expected outputs

A reviewer-checkable list:

- [ ] `docs/plans/2026-05-09-docs-install-github-app.md` — this plan, committed.
- [ ] `docs/features/claude-code-action.md` — new file, < 200 lines, with
      ASCII art at top, names both workflows, the secret, the plugin, and the
      ADR-0007 reconciliation.
- [ ] `docs/POSTPR.md` — Caveats section gains a bullet for "Automated
      `claude-code-review` GH Action vs local `/review` divergence" pointing
      at the new feature doc.
- [ ] `docs/PR-PLAN.md` — "What it is" preamble or a new "See also" entry
      points at the new feature doc and notes the cloud signal is non-blocking.
- [ ] `docs/HOWTO-PLAN-PR.md` — POSTPR mini-section mentions both signals
      and links the new feature doc.
- [ ] `docs/README.md` — "Start Here" or "Directory Map" gains a row for
      the new feature doc.
- [ ] `docs/features/INDEX.md` — new entry registered.
- [ ] `docs/plans/2026-05-09-docs-install-github-app-report.md` — written at
      the end of this PR's iteration with what shipped vs the plan.
- [ ] One normal (non-draft) PR opened against `main` from branch
      `docs/install-github-app` with `Co-Authored-By` lines as appropriate.
- [ ] No edits to `.github/workflows/*.yml`, `ADR-0007`, or any source code.
- [ ] No new `scripts/*.sh`. Verification stays a md playbook.

Negative outputs (anti-goals):

- Do **not** introduce a new canned-answer block in `CLAUDE.md` /
  `AGENTS.md` to gate the cloud-signal mention. ADR-0007's "self-discipline-via-matcher"
  approach stays.
- Do **not** add `--draft` to the PR.
- Do **not** add hook anchors / grep gates to back the new doc.
- Do **not** delete any existing doc.

## ③ Judge harness — md playbook

Per `docs/PR-PLAN.md` § ③ and user-level
`~/.claude/docs/rules/testing-judge-harness.md`, the harness is a md
playbook the MAIN agent dispatches via subagents or `claudefast -p` probes.
For this docs-only PR the playbook lives **inline below** (not at
`docs/plans/<...>/judge.md`) because the work is small enough that one §V
section per check is over-engineering — but the principle (no `.sh`, no
fixed pipeline, third-party JSON judge) still applies.

### §V1 RUN — checks the lead dispatches

| # | Check | How to dispatch | Expected |
|---|---|---|---|
| 1 | Each new/edited `.md` < 200 lines | `wc -l` via Bash | All under 200 |
| 2 | Each new/edited `.md` opens with ASCII art (per AGENTS.md rule 10) | grep first 30 lines for ` ` block + `─` / `│` chars | All have one |
| 3 | New feature doc names `claude.yml`, `claude-code-review.yml`, `CLAUDE_CODE_OAUTH_TOKEN`, `code-review@claude-code-plugins`, ADR-0007 | grep | All five anchors present |
| 4 | No edits to `.github/workflows/*.yml`, `docs/adr/0007-*.md`, or any `packages/**` source | `git diff --stat origin/main..HEAD -- ...` | Only docs/ + AGENTS.md? + plan/report changed |
| 5 | No new `scripts/*.sh` introduced | `git diff --name-only origin/main..HEAD -- 'scripts/*.sh'` | Empty |
| 6 | `claudefast -p "what should we do when we make a PR?"` still names `/review`, POSTPR, PR-PLAN, TEAMWORK as canonical (ADR-0007 verification gate, not weakened) | A `claudefast -p` probe | Answer mentions `/review` skill, POSTPR loop, PR-PLAN, TEAMWORK |
| 7 | `claudefast -p "what GitHub Actions does this repo run on PRs?"` names both `claude.yml` (mention bot) and `claude-code-review.yml` (auto review) | A `claudefast -p` probe | Answer names both workflows + the secret |

### §V2 DUMP

For § ③.6 and § ③.7, the probe writer should pipe stream-json into
`.fastprobe/install-github-app-<n>.jsonl` and write a one-line summary into
`.fastprobe/install-github-app-<n>.summary.json` of the shape
`{"probe": "<name>", "found_anchors": [...], "missing": [...]}`. Checks 1-5
are short enough that their stdout is the dump.

### §V3 READ

A separate `claudefast -p "read .fastprobe/install-github-app-*.summary.json
and rule PASS / FAIL based on whether all anchors are present and no banned
file changed"` reads the JSON + raw stream-json and grades the run. The PR
author and the executing agent are not the judge; § ③ stays third-party.

## ④ Claudefast probes — already partially run during context-collection

Pre-coding probes for this plan were satisfied by the context survey above
(the doc inventory + workflow file inspection), so § ④ is light. Probe § ③.6
and § ③.7 run **after** the docs land, as part of POSTPR.

## See also

- `docs/HOWTO-PLAN-PR.md` — full plan-content schema this plan follows.
- `docs/PR-PLAN.md` — what to do if `/review` flags issues on this PR.
- `docs/POSTPR.md` — the loop this PR feeds into.
- `docs/adr/0007-local-review-skill-as-review-gate.md` — the ADR this plan
  consciously does **not** rewrite.
