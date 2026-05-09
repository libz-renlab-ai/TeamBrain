```
                  plan.md — issue #122 V1 真用户 dogfood
                  ======================================

   ┌─────────────────────────────────────────────────────────────┐
   │  prereq state (from research.md)                             │
   │     PR #115 merged ✅                                        │
   │     Pages site → HTTP/2 404 ❌  (env-policy blocks main)     │
   │     #120 GIF asset missing ❌  (only .gitkeep in public/)    │
   │     branch worktree-122 (not main) ✅                        │
   └────────────────────────────┬────────────────────────────────┘
                                │
       ┌────────────────────────┴────────────────────────┐
       │                                                  │
       ▼                                                  ▼
   PR scope = unblock dogfood                  out-of-scope
   ───────────────────────────                ──────────────
   Slice A: fix Pages env-policy              core packages
   Slice B: re-trigger + verify 200           runtime/hooks code
   Slice C: bundle #120 GIF (close it too)    other workflows
   Slice D: dogfood scaffolding                landing copy/CTA
   Slice E: 1+2+3 feature-verification gate
                                │
                                ▼
                       TEAMWORK N+1+(2N)
                       4 sonnet workers + 8 probes + 1 opus reporter
                                │
                                ▼
                       commit + push + open PR + POSTPR /review loop
                                │
                                ▼
                       (post-merge, manual) recruit ≥1 stranger
                       record .cast → comment on #122 + #84
```

# Plan — Issue #122 V1 真用户 dogfood (TTHW ≤ 5 min)

> Companions in this directory:
> - [`research.md`](./research.md) — context dump (live prereq state).
> - [`judge.md`](./judge.md) — third-party md playbook (§V1 RUN / §V2
>   DUMP / §V3 READ). **Hard rule: third-party judge harness forbidden
>   fixed scripts; MUST use md playbook.**

## ① Task description

**What we're doing.** Unblock the V1 真用户 dogfood (issue #122) by
fixing the two prereq gates that currently make the test impossible to
run (Pages 404, hero GIF missing) and by landing the scaffolding the
dogfood requires (recording protocol, output dir, per-step ledger).
After this PR merges, the dogfood becomes a manual recruitment + record
step that a human leads — no AI agent qualifies as the "stranger user"
per #84 acceptance.

**How.** Five independent slices, executed with TEAMWORK
N+1+(2N) on the existing `worktree-122` branch:

| Slice | Owner | Deliverable | Touches |
|---|---|---|---|
| **A** Fix Pages env-policy | sonnet worker A | Add `main` to `github-pages` env's `custom_branch_policies` via `gh api`. Confirm via `gh api …/deployment-branch-policies`. | GitHub repo settings only — no repo files. Captured in `judge.md §V1.A` evidence. |
| **B** Re-trigger + verify Pages 200 | sonnet worker B | After Slice A lands, `workflow_dispatch` `landing-deploy.yml`; wait for `success`; `curl -sIL` the site → `HTTP/2 200`. Captures run id + headers to evidence. | Triggers workflow only; no file edits. |
| **C** Hero GIF (closes #120 too) | sonnet worker C | Drop `apps/landing/public/double-moment.gif` (use existing recording from #120 work, or re-record via `asciinema` + `agg`). Replace `.gif-placeholder` div in `apps/landing/src/index.html` with `<img src="double-moment.gif" alt="…" loading="eager" fetchpriority="high" />`. **As-built note:** worker chose a relative path (`double-moment.gif`) over an absolute `/TeamBrain/double-moment.gif` so `npx serve dist` local preview also resolves correctly; eager loading + `fetchpriority="high"` because the hero is above the fold. | `apps/landing/public/double-moment.gif`, `apps/landing/src/index.html` (one block swap). |
| **D** Dogfood scaffolding | sonnet worker D | Create `docs/plans/issue-84/v1-dogfood/README.md` (recording protocol, per-step time budget table from #122, recruitment notes), `docs/plans/issue-84/v1-dogfood/.gitkeep`, and `docs/plans/issue-84/v1-dogfood/template-comment.md` (the per-step breakdown the human pastes back into #122). No CLI / runtime code added — keeps PR diff small. | `docs/plans/issue-84/v1-dogfood/**` (new dir). |
| **E** 1+2+3 feature-verification gate | sonnet worker E | Pick `<MODULE>` = `pnpm --filter landing build` (since this PR's only product surface is the landing build). Run `claudefast -p` + `codex exec` with `--help`-equivalent (build dry-run summary), `jq -S` hardmatch, tmux `/export`. Drop artefacts into `.judge/<run_id>/evidence/`. | No source edits; only judge artefacts. |

**What we are NOT doing (anti-goals).**

- Not editing TeamAgent core packages (`packages/core/`, `packages/cli/`,
  hook code). The PR keeps `pnpm test` / `pnpm typecheck` green by
  staying out of those trees.
- Not changing landing copy / CTAs / install one-liner. PR #115 already
  shipped them; touching them now expands scope and invalidates the
  previous TTHW probe at `.fastprobe/issue84/p7.json`.
- Not editing `release-branch.yml`, `nightly-llm-smoke.yml`,
  `claudefast-anchors.yml`, `ci.yml`. Only `landing-deploy.yml` if the
  env-policy fix alone proves insufficient (and only with explicit
  re-approval — first attempt is config-only).
- Not running the dogfood itself with an AI agent as the "stranger"
  user. Acceptance R6 in `judge.md` is intentionally human-gated.
- Not relocating the worktree from `.claude/worktrees/122` to
  `.codex/worktrees/122`. The deviation is documented in PR
  description; cost of relocate > benefit at this stage.
- Not opening follow-up issues for any P1/P2 found by `/review`. Per
  `docs/PR-PLAN.md`, fixes land in **this same PR**; if `/review`
  surfaces issues post-PR, a `2026-05-08-pr-<n>-fix-plan.md` is
  written under `docs/plans/` and TEAMWORK fixes them on this branch.

## ② Expected outputs

Reviewer-checkable list. Every row must be verifiable without trusting
the implementing agent.

**Repository artefacts**

- [ ] `docs/plans/2026-05-08-issue-122/plan.md` (this file)
- [ ] `docs/plans/2026-05-08-issue-122/research.md` (companion)
- [ ] `docs/plans/2026-05-08-issue-122/judge.md` (md playbook)
- [ ] `docs/plans/2026-05-08-issue-122/report.md` (written at PR-close)
- [ ] `apps/landing/public/double-moment.gif` (≥ 1 byte, valid GIF
  per `file(1)`)
- [ ] `apps/landing/src/index.html` swap: `.gif-placeholder` div →
  `<img src="…/double-moment.gif" …>` block
- [ ] `docs/plans/issue-84/v1-dogfood/README.md` — recording protocol
- [ ] `docs/plans/issue-84/v1-dogfood/template-comment.md` — per-step
  ledger template

**External-state artefacts**

- [ ] GitHub repo: `github-pages` environment's
  `custom_branch_policies` includes `main` (verifiable via
  `gh api /repos/libz-renlab-ai/TeamBrain/environments/github-pages/deployment-branch-policies`)
- [ ] `landing-deploy.yml` latest run on `main` → conclusion `success`
- [ ] `https://libz-renlab-ai.github.io/TeamBrain/` → `HTTP/2 200`
  with rendered hero GIF (not placeholder)

**PR artefacts**

- [ ] Normal PR opened against `main` (NOT `--draft`). Title:
  `feat(issue-122): unblock V1 真用户 dogfood — pages-deploy fix + #120 hero GIF + dogfood scaffold`
- [ ] PR description references issue #122, issue #120, parent issue
  #84, and PR #115; lists checkbox progress against this expected-outputs
  section
- [ ] Each commit message follows `feat(m{N}):` / `fix(m{N}):` /
  `docs(m{N}):` pattern (M-number TBD by lead — this PR is dogfood
  enablement so likely `docs(issue-122):` / `fix(landing):`)
- [ ] tmux `/export` transcript file path attached to PR description

**Judge artefacts (attached or referenced from PR)**

- [ ] `.judge/<run_id>/judge.json` per slice (A–E)
- [ ] `.judge/<run_id>/evidence/` per slice
- [ ] §V3 verdict file: separate `claudefast -p` PASS/FAIL JSON for
  rows R1–R5 (R6 deferred to manual post-merge step)

**Anti-goal verification**

- [ ] `git diff main..worktree-122 -- packages/` shows zero changes
  (or only test-data fixtures inside `__tests__/`)
- [ ] `pnpm test` and `pnpm typecheck` exit 0 on this branch and on
  `main` after merge

## ③ How-to-verify — judge harness

The full third-party judge harness is the md playbook at
[`./judge.md`](./judge.md). Summary of how it slots into this plan:

- **§V1 RUN** — fixed `gh api` / `curl` / `pnpm test` / `pnpm typecheck`
  / `claudefast` / `codex exec` invocations, captured to
  `.judge/<run_id>/evidence/`.
- **§V2 DUMP** — one canonical JSON per slice at
  `.judge/<run_id>/judge.json` with `exit_code` / `metrics` /
  `evidence_dir` / `stdout_path`.
- **§V3 READ** — separate read-only LLM judge (`claudefast -p` *or*
  `codex exec -s read-only`) that reads ONLY the JSON + evidence and
  emits `{verdict, rows[]}` JSON. The implementing agents and the
  TEAMWORK reporter never grade their own work.

**Hard rule (load-bearing wording):** *third-party judge harness
forbidden fixed scripts; MUST use md playbook.* This PR follows
both clauses — `judge.md` is the playbook; failed sections rerun by
re-dispatching `§V<n>`, not by editing scripts.

**Project-wide 1+2+3 gate** (per `docs/feature-verification.md`):
slice E in §② handles this. `<MODULE>` = `pnpm --filter landing
build` is the chosen module-under-test for hardmatch since the PR's
only product surface is landing.

**Acceptance rows mapping (full text in `judge.md`):**

| Row | What it grades | Source metric |
|---|---|---|
| R1 | Pages live | `pages_http_code == 200` ∧ `pages_deploy_last_conclusion == "success"` ∧ `branch_policies_includes_main == true` |
| R2 | Hero GIF on page (also closes #120) | `gif_on_disk_bytes > 0` ∧ `gif_referenced_in_html` ∧ `gif_on_live_page` |
| R3 | Dogfood scaffold ready | `dogfood_dir_exists` ∧ `recording_protocol_present` |
| R4 | No regression | `pnpm_test_exit == 0` ∧ `pnpm_typecheck_exit == 0` |
| R5 | 1+2+3 feature gate | `hardmatch_clean == true` ∧ tmux `/export` present |
| R6 | TTHW ≤ 300s with real stranger | **manual, post-merge** — closed by human comment on #122 |

R6 is intentionally not blocking PR merge. The PR ships the
*infrastructure* the dogfood needs; the dogfood itself is a separate
human-led step gated on R1+R2 being green on production Pages.

## ④ Claudefast probes — to run BEFORE any code lands

Per `docs/FASTPROBE.md`, three-step probe flow. Used to de-risk slice
ownership and catch wrong assumptions before the workers spawn.

**P0 (orient)** — cheap, runs first:

```bash
!claudefast -h | head -80
```

**P1 (does the env-policy gh api flag actually exist?)**

```bash
!claudefast -p "Read https://docs.github.com/en/rest/deployments/branch-policies and confirm: (a) the exact gh api POST endpoint to add a custom branch policy named 'main' to the github-pages environment; (b) whether this requires admin scope; (c) whether the request body shape is {name, type:'branch'} or something else. Cite the doc section."
```

**P2 (will the existing TTHW probe at `.fastprobe/issue84/p7.json` still apply after the slice C HTML swap?)**

```bash
!claudefast -p "Read .fastprobe/issue84/p7.json and apps/landing/src/index.html. Does the probe rely on the .gif-placeholder div text content, or only on visual signals? If we swap the placeholder for an <img> tag pointing at /TeamBrain/double-moment.gif (lazy-loaded), does the probe's 'first PreToolUse intercept visible' step still fire? Quote the relevant probe lines."
```

**P3 (is `pnpm --filter landing build` deterministic enough to hardmatch claudefast vs codex output?)**

```bash
!claudefast -p "Read apps/landing/package.json. The build script is 'cp -r src/. dist/ && cp -r public/. dist/'. Two questions: (1) does this produce byte-identical output across two runs on the same input tree (assuming public/ unchanged)? (2) what would a JSON 'help' or 'dry-run' canonicalisation look like for this script — does it have --help, or do we need to wrap it? Suggest the smallest pnpm-script change that gives us a deterministic JSON pull for the 1+2+3 hardmatch."
```

**P4 (audit-grade evidence for PR description)** — only after P1–P3
return clean answers, run with stream-json:

```bash
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --debug hooks \
  --debug-file .fastprobe/issue-122/p4.debug.log \
  --permission-mode acceptEdits \
  "Summarise issue #122's prereq state, this plan's five slices, and the judge harness contract. Return JSON {prereqs:{...}, slices:[...], judge:{playbook_path, sections:[V1,V2,V3]}}."
```

The stream-json transcript + hook debug log become the PR's audit
evidence.

**Hard rules.** `claudefast -p` always carries a prompt (positional
arg or stdin); never `claudefast -p` flags-only. Never `--bare`.
Tokens redacted as `[redacted]` if cited in PR / docs.

## TEAMWORK execution mapping

(Reference `docs/TEAMWORK.md`. Lead orchestrates, lead does not write
code.)

- **Branch guard** — `git branch --show-current` returns
  `worktree-122` (verified before this plan was written).
- **N = 5** sonnet workers (slices A, B, C, D, E above). Each
  receives: absolute paths only, slice scope, prohibition on touching
  files outside its slice, instruction to run **2 claudefast probes**
  after edit and report back with file path / line count / probe
  outputs.
- **2N = 10** claudefast probes (2 per worker). Probe templates per
  slice:
  - Slice A probe-1: `gh api …/deployment-branch-policies` → confirm
    main is listed. Probe-2: rerun the §V1.A capture to JSON; assert
    `branch_policies_includes_main == true`.
  - Slice B probe-1: `gh run list --workflow=landing-deploy.yml`
    latest conclusion. Probe-2: `curl -sIL` site → `HTTP/2 200`.
  - Slice C probe-1: `file apps/landing/public/double-moment.gif` and
    `wc -c`. Probe-2: `grep -c double-moment.gif apps/landing/src/index.html`
    and (post-deploy) the live page.
  - Slice D probe-1: list `docs/plans/issue-84/v1-dogfood/`. Probe-2:
    grep README for "asciinema" + "300s" + recruitment text.
  - Slice E probe-1: `jq -S` diff of claudefast.json vs codex.json.
    Probe-2: confirm tmux `/export` file exists and is non-empty.
- **1 opus 1M reporter** — reads every worker's slice description,
  edited file content, and both probe outputs; runs final acceptance
  probe over the combined diff against this plan's expected-outputs
  list and `judge.md`'s §V3 prompt; issues PASS/FAIL.
- **On PASS** — lead runs `/commit-commands:commit-push-pr` (or
  hand-rolled `gh pr create`), opens **normal** PR (not `--draft`),
  attaches tmux `/export` to PR description.
- **On FAIL** — lead loops back to step 2 of TEAMWORK for failing
  slices only.

## POSTPR loop

After PR opens (per `docs/POSTPR.md` and `docs/PR-PLAN.md`):

1. CI runs (the `landing-deploy.yml` will *not* run on PR — only on
   push to `main` — so Pages 200 verification happens on merge, not
   PR. The §V3 judge accounts for this: pre-merge it grades the
   `gh api` env-policy state and the workflow's last `main` run; the
   live-200 check is a post-merge gate that re-runs §V1.A+§V1.B and,
   if R1 fails, **block close** + write
   `docs/plans/2026-05-08-pr-<n>-fix-plan.md`).
2. Run `/review` skill on the diff.
3. If `/review` surfaces P1/P2 → write `pr-<n>-fix-plan.md` under
   `docs/plans/`, dispatch a smaller TEAMWORK against just the
   findings, push fix commits to **the same PR branch**.
4. Repeat 2–3 until `/review` returns PASS or only P3 remain (P3
   deferral requires explicit human reviewer approval per
   `PR-PLAN.md`).
5. Squash-merge with `gh pr merge <N> --squash`. (User memory:
   squash-only in TeamBrain; never `--merge`, never `--rebase`.)
6. Post-merge: re-run §V1.A + §V1.B; if R1+R2 green, comment on #122
   and #84 stating "infrastructure ready, manual TTHW dogfood next
   step"; recruit ≥1 stranger; record .cast; attach to issue
   #122 + #84; close #122; close #120 (its acceptance is now met by
   slice C's GIF landing).

## Pause-and-approve gate

The plan stops here. The lead **does not** spawn TEAMWORK workers
until the user explicitly approves this plan. On approval the lead
proceeds to:

1. Run claudefast probes P0–P4 above.
2. Spawn the N=5 sonnet workers in parallel via the Agent tool.
3. Spawn the 1 opus 1M reporter once workers report back.
4. On reporter PASS: commit + push + open normal PR + run POSTPR
   loop until `/review` PASS.

If the user wants narrower scope (e.g. drop slice C and leave #120
to its own PR, or skip slice E because the landing build is too
trivial to hardmatch), the lead amends the plan in place and
re-presents before spawning.
