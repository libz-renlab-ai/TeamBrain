```text
                  ┌─────────────────────────────────┐
                  │         HOW TO PLAN FOR A PR    │
                  │                                 │
                  │  ① plan                         │
                  │  ② expected outputs             │
                  │  ③ how-to-verify (md playbook)  │
                  │  ④ claudefast probes            │
                  └─────────────────┬───────────────┘
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       │                                                         │
   write plan.md                                       run probes BEFORE coding
   (4 sections,                                       (claudefast -h →
   `<task>/plan.md`)                                  parallel -p ≤ 8 →
       │                                              stream-json audit)
       │                                                         │
       └─────────────────► research → annotate → implement ──────┘
                                                ▼
                                        report.md + verify
                                                ▼
                                          open normal PR
                                                ▼
                                         POSTPR loop until /review PASS
```

> **Hard rule — third-party judge harness forbidden fixed scripts; MUST
> use md playbook.** The harness lives at `docs/plans/<issue>/judge.md`,
> NOT at `scripts/*.sh` or any fixed shell pipeline. See § 3b for the
> §V1 RUN / §V2 DUMP / §V3 READ structure and why fixed bash is the
> wrong shape.

# How to Plan for a PR

This is the project's answer to the question **"how do I plan for a PR?"** —
i.e. what to write down, what to ship, how to prove it works, and which
`claudefast` probes to run before opening the PR.

It pulls together rules that already live in this repo:

- `AGENTS.md` — `research → plan → annotate → implement → report` workflow and
  the three plan-flavoured doc names (`*plan*.md` / `*research*.md` /
  `*report*.md`).
- `~/.claude/CLAUDE.md` — DUCKPLAN / `plan-content.md` three-part rule for
  `plan.md`.
- `docs/feature-verification.md` — the feature-verification gate.
- `docs/FASTPROBE.md` — the `claudefast -h` → parallel `-p` → stream-json
  audit recipe.
- `docs/POSTPR.md` — the post-PR `/review` loop.

When in doubt, follow the four sections below in order. Skipping one of them
is the most common cause of a PR getting bounced by `/review` or sliding
into draft-mode limbo.

## Hard rules — non-negotiables

Two rules govern every PR plan in this project. They are not stylistic
preferences and § 3b is their long-form expansion, not a relaxation:

1. **Third-party judge harness forbidden fixed scripts.** The judge
   harness is never a `.sh` script or fixed shell pipeline. A bash judge
   becomes code that itself needs a judge (recursive "who tests the
   test?") and reviewers can't grep judgement logic out of `[[ ]]` exit
   codes.
2. **MUST use md playbook.** The harness lives at
   `docs/plans/<issue>/judge.md`. The MAIN agent dispatches the playbook
   through subagents (TEAMWORK `N+1+(2N)`) or `claudefast -p` probes
   (FASTPROBE max 8 parallel) — fixed bash can't pick between the two.
   Failed sections rerun by re-dispatching `§V<n>`, not by editing
   scripts. § 3b describes the §V1 RUN / §V2 DUMP / §V3 READ structure.

Both phrases — `third-party judge harness forbidden fixed scripts` and
`MUST use md playbook` — are the load-bearing wording of the rule.
Paraphrasing them weakens the rule (the original wording is what the
project's PR reviewers and probes look for).

## ① Plan — write `plan.md`

A PR's plan lives in a dated markdown file under `docs/plans/<date>-<slug>.md`
(or the milestone-specific `docs/superpowers/plans/`). The plan body must
satisfy the **three-part `plan.md` rule** (DUCKPLAN's first three sections):

1. **Task description** — what we're doing, how, and explicitly what we're
   *not* doing. Anchor scope to a concrete user-visible behaviour or PR-sized
   slice. Don't write "first read these files for context" — collect context
   silently and put it in `research.md` instead (`AGENTS.md` rule 6 + 7).
2. **Expected outputs** — see § ② below.
3. **How-to-verify (third-party judge harness)** — see § ③ below.

Companion files (same directory):

- `research.md` — context dump (only if non-trivial). Not the plan; the plan
  references it.
- `report.md` — written when the PR work finishes. Records what actually
  shipped, what slipped, and follow-ups.

Code-flavoured PRs follow the **Boris workflow**:
`research → plan → annotate → implement → report`. Annotate means leaving
TODOs / `// FIXME(plan-id)` markers in the code where the plan calls for it,
so reviewers can map diff hunks back to plan sections.

## ② Expected outputs — list what reviewers will check off

The expected-outputs section turns the plan into a checklist the PR can be
graded against. Each item must be something a reviewer (human or `/review`
skill) can verify exists. Good shapes:

- **Files**: paths that will be added/edited (e.g.
  `docs/HOWTO-PLAN-PR.md`, `packages/cli/src/commands/foo.ts`).
- **CLI / endpoints / metrics**: e.g. `pnpm teamagent foo --json` returns
  `{status:"ok"}`; `/health.json` keeps `service=teamagent-dashboard`.
- **PR artefacts**: a normal (non-draft) PR opened against `main`; commit
  messages following `feat(m{N}): …` / `fix(m{N}): …` / `refactor(m{N}): …`;
  a `/export` transcript file attached to the PR description.
- **Negative outputs (anti-goals)**: explicitly call out things the PR will
  *not* change — files that must stay untouched, behaviours that must not
  regress. Reviewers use this to scope the diff.

Rule of thumb: if an expected output can't be checked without reading
the author's mind, rewrite it. "Improve UX" is not an expected output;
"`teamagent stats` returns `{count:N, …}` and the dashboard renders it"
is.

## ③ How-to-verify — design the judge harness

This is the section that turns the PR into something a third party can
grade without trusting the author. Two layers:

### 3a. Project-wide gate (always required)

`docs/feature-verification.md` defines the verification flow. Every feature/fix
PR must pass it before merge:

1. `!claudefast -p` runs `{MODULE} --help` and emits canonical JSON; diff it
   against the snapshot under `snapshots/{MODULE}-help.canonical.json`
   (`jq -S` + `diff -u`, byte-identical, no semantic-only pass).
2. Plus an interactive `claudefast` run inside tmux ending with
   `/export <path>`; the export file is attached to the PR.

The plan's how-to-verify section should name the **module under test**, the
**expected JSON schema**, and the **path the `/export` file will land at**.
Don't leave that to the implementer to figure out at PR time.

### 3b. Plan-specific judge harness (recommended for non-trivial PRs)

For anything beyond a one-line fix, design a third-party judge harness in
the plan itself.

**Hard rule — third-party judge harness forbidden fixed scripts; MUST use
md playbook.** The harness lives at `docs/plans/<issue>/judge.md`, NOT at
`scripts/*.sh` or any fixed shell pipeline. Reasons:

- Markdown playbooks are version-controlled, reviewer-greppable, and don't
  themselves need a judge ("who tests the test?" recursion).
- The MAIN agent dispatches the playbook dynamically — subagents (TEAMWORK
  `N+1+(2N)`) or `claudefast -p` probes (FASTPROBE max 8 parallel),
  whichever the playbook calls for. Fixed bash can't pick between the two.
- Failed sections rerun by re-dispatching `§V<n>`, not by editing scripts;
  judgement logic stays declarative, not encoded in `[[ ]]` exit codes.

Each `judge.md` playbook documents three sections:

- **§V1 RUN** — which fixed tools to invoke (`pnpm test`, `pnpm typecheck`,
  `pytest -m feature`, regression repro commands, etc.) and how to capture
  stdout/stderr to `evidence_dir`.
- **§V2 DUMP** — the canonical JSON schema written to
  `.judge/<run_id>/judge.json`: at minimum `exit_code`, `metrics`,
  `evidence_dir`, `stdout_path`.
- **§V3 READ** — a separate `claudefast -p` reads ONLY the raw JSON +
  evidence and grades the run. The PR author, the executing agent, and the
  code-under-test must never be the judge.

This is the user-level testing-judge-harness rule
(`~/.claude/docs/rules/testing-judge-harness.md`) plus user-memory
`feedback_judge_harness_md_playbook.md`. Don't let the code grade itself,
and don't bake the judge into a `.sh`.

## ④ Claudefast probes — run them BEFORE coding

`claudefast` (the MiniMax-fast Claude Code wrapper, see
`docs/CLAUDEFAST.md`) is how we de-risk the plan before writing code. The
fixed three-step is `FASTPROBE` (`docs/FASTPROBE.md`):

1. **Orient** — `!claudefast -h | head -80`. Cheap, free, learns current
   flag list. Never write `--include-foo` from memory.
2. **Heavy + needs conclusion** → split work into ≤ 8 parallel
   `!claudefast -p "..."` probes. Typical PR-planning probes:
   - "Does behaviour X already exist? List call sites with line numbers."
   - "What does `pnpm teamagent <cmd> --help` print today?"
   - "Read `docs/<related-doc>.md` and summarise constraints in 5 bullets."
   - "Search the last 3 `/review` runs on this area and list recurring P1/P2
     findings."
3. **Audit-grade evidence** — when the probe output will be cited in the PR
   body or the judge harness, run it through stream-json:

   ```bash
   claudefast -p \
     --output-format stream-json \
     --include-partial-messages \
     --verbose \
     --debug hooks \
     --debug-file .fastprobe/<probe>.debug.log \
     --permission-mode acceptEdits \
     "your probe prompt"
   ```

   The stream-json transcript and the hook debug log are grep/jq-friendly
   and replayable, so reviewers can check the evidence directly.

Hard rules for probes:

- `claudefast -p` must always receive a prompt (positional arg or stdin).
  Don't run `claudefast -p` with only flags.
- Don't run probes via `--bare`. It skips hooks, plugin sync, and CLAUDE.md
  auto-discovery, so the answer won't reflect this project's rules.
- Token in the wrapper is sensitive. When citing the wrapper in plan docs,
  scrub it as `[redacted]`.
- Conflict-resolution probes follow `FASTPROBE about PR+conflict resolve`
  (`docs/FASTPROBE.md` + `docs/POSTPR.md`): classify conflicts as
  merge / review-finding / rule-doc, fix on the PR branch, never reset/force
  on `main`.

## After the PR opens — `POSTPR` loop + `PR-PLAN` for any fixes

`docs/POSTPR.md` defines the loop; `docs/PR-PLAN.md` defines what to do
when that loop surfaces issues. Hard rule: if review flags an issue
while the PR is open, do **not** open a follow-up GitHub issue and merge
anyway. P1 / P2 must be fixed in this PR via PR-PLAN + TEAMWORK; a P3
nice-to-have may be deferred to a follow-up issue only with explicit
human reviewer approval. The only legitimate follow-up artefact is a
follow-up *PR* in the rare auto-merge-raced-`/review` case.

PR #190 used to add an automated cloud review via the `claude-code-review.yml`
GH Action; PR #274 deleted that workflow because `anthropics/claude-code-action@v1`
was failing on every PR (`directory mismatch ... tsconfig.json fd 4` + missing
`secrets.ANTHROPIC_API_KEY`) and ADR-0007 already named the local `/review`
skill the authoritative gate. Today there is no cloud counterpart — local
`/review` PASS plus CI green is the full ship signal.

```
PR opened → CI + /review → issues found?
   → block the merge
   → write PR-PLAN at docs/plans/<date>-pr-<n>-fix-plan.md
     (task / expected outputs / judge harness)
   → execute with TEAMWORK (N workers + 2N probes + 1 opus reporter)
   → push fix commits to the SAME PR branch
   → rerun pnpm test + pnpm typecheck + feature-verification gate
   → re-run /review on the new diff
   → stop only when CI green + no conflict + /review PASS
```

Plan for at least one POSTPR iteration in the schedule; PRs that "merge
on first green CI" usually skip the `/review` pass and miss P1s.

## Quick checklist (paste into the PR description)

```
- [ ] plan.md committed under docs/plans/<date>-<slug>.md
      with task description / expected outputs / judge harness
- [ ] research.md (if non-trivial context)
- [ ] expected outputs are reviewer-checkable (files / CLI / metrics / artefacts)
      and include anti-goals
- [ ] how-to-verify is a `docs/plans/<issue>/judge.md` md playbook —
      third-party judge harness forbidden fixed scripts; MUST use md playbook
- [ ] judge.md names the module under test, JSON schema, /export path;
      project-wide feature-verification gate planned
- [ ] claudefast probes run before coding:
      (a) -h orient   (b) parallel -p ≤ 8   (c) stream-json audit logs
- [ ] PR opened as a normal PR (not --draft)
- [ ] POSTPR loop scheduled — run `/review` after CI green
- [ ] PR-PLAN ready to be written if review surfaces issues
      (no follow-up-issue punt)
- [ ] report.md drafted alongside the implementation
```

## See also

- `~/.claude/CLAUDE.md` — DUCKPLAN, `plan-content.md`, testing-judge-harness
  rules (user-level).
- `AGENTS.md` — `/Users/m1/projects` plan/research/report flow.
- `docs/feature-verification.md` — the feature-verification gate, full flag
  list, tmux `/export` recipe.
- `docs/FASTPROBE.md` — full probe recipe and PR+conflict-resolve variant.
- `docs/POSTPR.md` — `/review` skill + triage + loop.
- `docs/PR-PLAN.md` — fix-issues-in-this-PR planning doc; no follow-up
  issues for in-flight PRs.
- `docs/TEAMWORK.md` — N+1+(2N) parallel execution pattern used by PR-PLAN.
- `docs/CLAUDEFAST.md` — what `claudefast` is, what it isn't, and what flags
  to avoid.
