```text
                  ┌─────────────────────────────────┐
                  │         HOW TO PLAN FOR A PR    │
                  │                                 │
                  │  ① plan                         │
                  │  ② expected outputs             │
                  │  ③ how-to-verify                │
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
                                         POSTPR loop until 👍
```

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
- `docs/feature-verification.md` — the 1+2+3 feature-verification gate.
- `docs/FASTPROBE.md` — the `claudefast -h` → parallel `-p` → stream-json
  audit recipe.
- `docs/POSTPR.md` — the post-merge Codex review loop.

When in doubt, follow the four sections below in order. Skipping one of them
is the most common cause of a PR getting bounced by Codex review or sliding
into draft-mode limbo.

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

Worktree convention (`CLAUDE.md`): create the working branch in
`.codex/worktrees/<task-name>/` so the parent checkout stays clean. Don't
nest worktrees inside `.claude/worktrees/` or alongside the repo.

## ② Expected outputs — list what reviewers will check off

The expected-outputs section turns the plan into a checklist the PR can be
graded against. Each item must be something a reviewer (human or Codex) can
verify exists. Good shapes:

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

`docs/feature-verification.md` defines the **1+2+3 flow**. Every feature/fix
PR must pass it before merge:

1. `!claudefast -p` runs `{MODULE} --help` and emits canonical JSON.
2. `!codex exec` runs the same `{MODULE} --help` and emits canonical JSON.
3. Hard-match the two JSON files (`jq -S` then `diff -u`) — they must be
   byte-identical, no semantic-only pass.
4. Plus an interactive `claudefast` run inside tmux ending with
   `/export <path>`; the export file is attached to the PR.

The plan's how-to-verify section should name the **module under test**, the
**expected JSON schema**, and the **path the `/export` file will land at**.
Don't leave that to the implementer to figure out at PR time.

### 3b. Plan-specific judge harness (recommended for non-trivial PRs)

For anything beyond a one-line fix, design a third-party judge harness in the
plan itself:

- **RUN**: a fixed shell pipeline (pytest / `pnpm test` / `bash scripts/...`)
  that runs the new behaviour.
- **DUMP**: write the result as JSON (`exit_code`, `metrics`, `evidence_dir`,
  `stdout_path`) to `.judge/<run_id>/judge.json` plus raw stdout/stderr.
- **READ**: a separate `claudefast -p` (or `codex exec`) reads only the raw
  JSON + evidence and grades the run. The PR author / executing agent /
  code-under-test must NOT be the judge.

This is the user-level testing-judge-harness rule
(`~/.claude/docs/rules/testing-judge-harness.md`). Don't let the code grade
itself.

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
   - "Search Codex's last 3 reviews on this area and list recurring P1/P2
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
  merge / Codex-review / rule-doc, fix on the PR branch, never reset/force
  on `main`.

## After the PR opens — `POSTPR` loop

The plan isn't done when the PR opens. `docs/POSTPR.md` defines the loop:

```
PR opened → CI + Codex review → conflict?
   → classify (merge / Codex-review / rule-doc)
   → fix on the PR branch (never main, never --force)
   → rerun pnpm test + pnpm typecheck + verification 1+2+3
   → push same branch (or follow-up PR if already merged)
   → re-fetch Codex review
   → stop only when CI green + no conflict + Codex 👍 or silent
```

Codex reviews follow-up PRs too (#51 → #52 → #53 happened in this repo).
Plan for at least one POSTPR iteration in the schedule; PRs that "merge on
first green CI" usually skip the Codex inline-comment fetch and miss P1s.

## Quick checklist (paste into the PR description)

```
- [ ] plan.md committed under docs/plans/<date>-<slug>.md
      with task description / expected outputs / judge harness
- [ ] research.md (if non-trivial context)
- [ ] expected outputs are reviewer-checkable (files / CLI / metrics / artefacts)
      and include anti-goals
- [ ] how-to-verify names the module under test, JSON schema,
      and /export path; project-wide 1+2+3 gate planned
- [ ] claudefast probes run before coding:
      (a) -h orient   (b) parallel -p ≤ 8   (c) stream-json audit logs
- [ ] PR opened as a normal PR (not --draft)
- [ ] POSTPR loop scheduled — fetch Codex inline comments after CI green
- [ ] report.md drafted alongside the implementation
```

## See also

- `~/.claude/CLAUDE.md` — DUCKPLAN, `plan-content.md`, testing-judge-harness
  rules (user-level).
- `AGENTS.md` — `/Users/m1/projects` plan/research/report flow.
- `docs/feature-verification.md` — the 1+2+3 gate, full flag list, tmux
  `/export` recipe.
- `docs/FASTPROBE.md` — full probe recipe and PR+conflict-resolve variant.
- `docs/POSTPR.md` — Codex review fetch + triage + loop.
- `docs/CLAUDEFAST.md` — what `claudefast` is, what it isn't, and what flags
  to avoid.
