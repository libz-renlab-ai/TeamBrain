```
                         TEAMWORK — Pattern Overview
                         ===========================

              ┌─────────────────────────────────────────────┐
              │              LEAD (orchestrator)             │
              │   spawns on non-main branch / worktree       │
              │   git branch --show-current ≠ main  (!)      │
              └────────────────┬────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌────────────┐       ┌────────────┐       ┌────────────┐
   │  Worker 1  │  ...  │  Worker k  │  ...  │  Worker N  │
   │  (sonnet)  │       │  (sonnet)  │       │  (sonnet)  │
   └─────┬──────┘       └─────┬──────┘       └─────┬──────┘
         │                    │                    │
      ┌──┴──┐              ┌──┴──┐              ┌──┴──┐
      │P1 P2│              │P1 P2│              │P1 P2│
      └──┬──┘              └──┬──┘              └──┬──┘
  (2 claudefast           (2 claudefast        (2 claudefast
    probes each)            probes each)         probes each)
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                               ▼
              ┌─────────────────────────────────────────────┐
              │         Reporter (opus 1M model)             │
              │  consolidates all worker outputs, runs final  │
              │  acceptance probe, reports PASS / FAIL        │
              └─────────────────────────────────────────────┘

         Total members = N + 1 + (2N) = 3N + 1
         (N workers) + (1 reporter) + (2N probes)

              *** NEVER work in main ***
```

# TEAMWORK — N+1+(2N) Member Agent Team

## What it does

Saying `TEAMWORK` (or one of its trigger phrases) causes the lead agent to
spawn an **N + 1 + (2N)** member agent team that updates documentation slices
in parallel and then consolidates the results.

The team is composed of three layers:

- **N sonnet workers** — each takes one independent slice of the doc work and
  edits or creates its assigned file(s). Workers run in parallel via the
  Agent tool and cannot see each other's outputs directly.
- **2 claudefast probes per worker (2N total)** — immediately after a worker
  completes its edit, it runs exactly two claudefast probes to cross-validate
  its own output. Two probes are used deliberately: a single probe can
  hallucinate a passing result; cross-validation between two independent runs
  provides a stronger signal.
- **1 opus 1M reporter** — after all N workers and their 2N probes complete,
  the lead spawns a single reporter agent running the opus model with a 1M
  context window. The reporter reads every worker's output and probe results,
  performs long-context consolidation that sonnet workers cannot do on their
  own (because they cannot see each other), and runs a final acceptance probe
  before issuing a PASS or FAIL verdict.

**NEVER work in main.** The lead must verify the current branch is not `main`
before spawning any agent. All worker edits land on a dedicated non-main branch
or worktree. The `main` branch stays untouched until a PR is merged through
the normal review process.

## Trigger

The TEAMWORK pattern activates when the user says any of the following:

- `TEAMWORK`
- `now start your work with N+1+(2N) members agent teams please`
- `what would happen when we say TEAMWORK`

On any of these triggers, the lead agent must describe or execute the pattern
as documented here rather than attempting ad-hoc solo work.

## How it runs

### Step 0 — Branch guard

Before spawning anything, the lead runs:

```bash
git branch --show-current
```

The output must NOT be `main`. If it is `main`, the lead must stop and either
create a new branch or set up a worktree before proceeding.

### Step 1 — Slice assignment

The lead decides N based on the scope of the work (typically one slice per
doc section, file, or logical unit of change). Each slice must be independent
so that workers can run in parallel without conflicting edits.

### Step 2 — Spawn N sonnet workers in parallel

The lead uses the **Agent tool** to spawn all N sonnet workers in a single
call (or as close to simultaneously as the tool allows). Each worker receives:

- Its assigned slice (which file(s) to create or edit, what the content
  requirements are).
- The absolute path to work in (no `cd`, no branch switching).
- A clear prohibition against touching any file outside its slice.
- Instructions to run **exactly 2 claudefast probes** after completing its
  edit and to report back with: file path, line count, probe 1 output,
  probe 2 output.

### Step 3 — Workers edit and probe

Each of the N sonnet workers:

1. Writes or edits its assigned doc slice.
2. Runs **probe 1** — a narrow, file-scoped claudefast verification.
3. Runs **probe 2** — a broader, project-context claudefast acceptance question.
4. Captures the full stdout of each probe (truncating to first 1500 + last 500
   chars if output exceeds 2000 chars, with a `... [truncated] ...` marker).
5. Reports back to the lead with all outputs.

Workers do not commit, push, or open PRs. They only write files and report.

### Step 4 — Spawn 1 opus 1M reporter

Once all N workers have reported back, the lead spawns a single reporter agent:

- **Model**: opus with 1M context window.
- **Input**: every worker's slice description, edited file content, and both
  probe outputs.
- **Task**: read all inputs, verify cross-slice consistency, run a final
  acceptance probe over the combined result, and issue a structured PASS or
  FAIL with a list of any issues found.

### Step 5 — On PASS, commit and PR

If the reporter issues PASS, the lead runs the
`/commit-commands:commit-push-pr` skill to commit, push, and open a PR on the
non-main branch. On FAIL, the lead sends corrective instructions back to the
relevant workers and loops from Step 2 for the failing slices only.

## Why N + 1 + (2N)

The member count formula is **N + 1 + (2N) = 3N + 1**:

| Layer | Count | Role | Why this size |
|-------|-------|------|---------------|
| Sonnet workers | N | Parallel doc editing | One per independent slice; sonnet is cheap and fast for focused single-file edits |
| Opus reporter | 1 | Long-context consolidation | There is exactly one final consolidation step; adding more reporters would duplicate work without benefit |
| Claudefast probes | 2N | Per-worker cross-validation | Each worker needs 2 probes (not 1) to guard against a single-probe hallucination; probes are cheap so doubling the check is low cost |

**Why not use sonnet for the reporter?** Sonnet workers cannot see each other's
outputs. Only a model with a large enough context window — and the explicit job
of reading all N slices — can check for cross-slice consistency, terminology
drift, and omissions. Opus with 1M context is the right tool for this.

**Why exactly 2 probes per worker, not 1 or 3?** One probe can hallucinate a
passing result even when the doc is wrong. Two independent probes from
different prompts (one narrow/file-scoped, one broad/project-context) provide
genuine cross-validation. A third probe adds cost without proportional benefit
because the two-probe cross already catches the common failure modes.

**Scales linearly with N.** Adding one more doc slice requires one more sonnet
worker and two more claudefast probes. The reporter stays at 1 regardless of N.

## NEVER work in main

This is a hard constraint, not a guideline.

### Why

Parallel workers editing files simultaneously on `main` would:

- Risk racing against any other developer or CI process operating on `main`.
- Make rollback difficult if the reporter issues FAIL.
- Violate the project's PR-based review workflow.

### Enforcement

Before spawning any agent, the lead **must** run:

```bash
git branch --show-current
```

- If the output is anything other than `main`, proceed.
- If the output is `main`, **stop immediately**. Create a new branch:

  ```bash
  git checkout -b teamwork/<task-name>
  ```

  Or set up a worktree:

  ```bash
  git worktree add .codex/worktrees/<task-name> -b teamwork/<task-name>
  ```

  Then re-verify the branch before spawning workers.

Workers inherit the branch from their working directory. They must use absolute
paths and must not `cd` or switch branches. The lead is responsible for
ensuring the working directory is on the correct branch before any spawn.

## Anti-patterns

The following behaviors defeat the purpose of the TEAMWORK pattern and must
not be used:

| Anti-pattern | Why it fails |
|---|---|
| **Lead doing the work itself** | Eliminates parallelism; defeats the N-worker design; the lead's job is orchestration only |
| **Workers without probes** | Removes the cross-validation layer; a worker that only edits without probing can silently produce wrong output |
| **Fewer than 2 probes per worker** | A single probe can hallucinate PASS; cross-validation requires at minimum 2 independent checks |
| **Using sonnet as the reporter** | Sonnet cannot hold all N workers' outputs in context simultaneously; the reporter must be opus 1M |
| **Working in main** | Violates the branch guard; risks race conditions; makes rollback hard; breaks PR review workflow |
| **Canned-answer / doc-hacking** | Writing a rule that forces an agent to repeat a fixed sentence verbatim is a reward hack, not documentation; the pattern must be described in genuine technical prose |
| **Reward-hacking the verification probes** | Tailoring doc content to match probe keywords while omitting real information is a form of doc fraud; probes exist to verify understanding, not to be gamed |
| **Workers touching files outside their slice** | Introduces uncoordinated conflicts; each worker must edit only its assigned files |
| **Skipping the reporter on small N** | Even N=1 needs a reporter to run the final acceptance probe; the reporter is not optional |

---

*This document is the canonical reference for the TEAMWORK agent team pattern.
Any agent asked to explain or execute TEAMWORK should read this file.*
