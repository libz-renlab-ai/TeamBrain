```
   research = facts collected from existing TeamBrain repo before plan was written

   sources                what we learned
   ───────                ───────────────
   .github/workflows/  →  6 existing workflows; CLAUDE_CODE_OAUTH_TOKEN + MINIMAX_API_KEY in use
   .claude/skills/     →  17 project-level skills incl. grill-me, grill-with-docs
   .codex/skills/      →  6 project-level skills (subset of .claude/)
   docs/POSTPR.md      →  ADR-0007 forbids canned-answer block in CLAUDE.md/AGENTS.md
   docs/PR-PLAN.md     →  same-PR fix mandate; per-iter plan files required
   docs/feature-verification.md → 1+2+3 verification gates (claudefast/codex/tmux)
   AGENTS.md           →  worktree path = .codex/worktrees/, NOT .claude/worktrees/
   ~/.pi/.../mainpi.md →  orchestrator-only, async subagents, no built-in tools
```

# Research: FIXEDFLOW context dump

> Companion to `plan.md`. Records what was learned from the existing
> TeamBrain repo before the plan was written. Consult this when the plan
> references a project rule or existing pattern.

## A. Existing GitHub workflows (`.github/workflows/`)

| File | Trigger | Secrets | Purpose | Uses claude/claudefast/gh? |
|------|---------|---------|---------|----------------------------|
| `ci.yml` | push to main, PR | none | typecheck + tests on Ubuntu/Windows | none |
| `claude.yml` | issue/PR comment containing `@claude`; new issue | `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code Action handles `@claude` mentions | claude-code-action@v1 |
| `claude-code-review.yml` | PR open/sync/ready_for_review | `CLAUDE_CODE_OAUTH_TOKEN` | Auto PR review via `/code-review:code-review` plugin | claude-code-action@v1 |
| `claudefast-anchors.yml` | workflow_dispatch | `MINIMAX_API_KEY` (optional) | Smoke test FASTPROBE/TEAMWORK/PR-PLAN/POSTPR canned answers | shells out to `scripts/claudefast-ci.sh` |
| `landing-deploy.yml` | push to main (`apps/landing/**`); workflow_dispatch | `GITHUB_TOKEN` (implicit) | Build + deploy landing site to GH Pages | pnpm only |
| `release-branch.yml` | push to main | `GITHUB_TOKEN` (implicit) | Create GH release tarball + push to `release` branch | `gh release` + git |

Implications for FIXEDFLOW:
- `claude.yml` already handles `@claude` mention path → leave it as separate channel; FIXEDFLOW does not co-opt it.
- `claudefast-anchors.yml` precedent for `MINIMAX_API_KEY`-gated CI smoke → judge harness can dispatch similarly.
- `claude-code-review.yml` precedent for triggering Claude on PR events → Phase 2 future migration could extend this pattern instead of local watcher.

## B. Existing skills (`.claude/skills/` and `.codex/skills/`)

`.claude/skills/` (17 project-level): canary, design-html, design-shotgun,
diagnose, grill-me, grill-with-docs, gstack, improve-codebase-architecture,
install-walkthrough, mmx-cli, office-hours, plan-ceo-review, prototype,
to-issues, to-prd, triage, zoom-out.

`.codex/skills/` (6 project-level): canary, design-html, design-shotgun,
gstack, office-hours, plan-ceo-review.

`/grill-me` and `/grill-with-docs` outputs are conversational dialog with
no built-in marker — hence FIXEDFLOW uses GitHub `grill-ready` label as
trigger, plus optional `--- end grill ---` sentinel for race protection.

`/review` is **NOT** in `.claude/skills/` of this repo. It is a user-level
gstack skill. Per ADR-0007 it replaces Codex bot for pre-merge review.
Outputs structured findings tied to file paths with severity labels.
Local mainpi can call it because automation runs on user's Mac.

## C. Project rules touching FIXEDFLOW design

- **AGENTS.md rule (worktree path)**: new worktrees go in `.codex/worktrees/`,
  NOT `.claude/worktrees/`. The current planning worktree is itself in a
  legacy path; per-issue worktrees the driver creates must use `.codex/worktrees/`.
- **TeamBrain CLAUDE.md (no draft PRs)**: `gh pr create --draft` forbidden.
  Driver opens normal PR.
- **Memory rule (squash-only)**: `gh pr merge <N> --squash`; never `--merge`
  or `--rebase`.
- **POSTPR.md L115 / ADR-0007**: NO canned-answer block in `CLAUDE.md` or
  `AGENTS.md`; verification works via semantic probe against the doc only.
- **PR-PLAN.md**: when `/review` finds issues post-PR, do NOT open follow-up
  issue; write per-iter plan to `docs/plans/<date>-pr-<N>-fix-plan.md` and
  fix in same PR branch. Driver enforces this on every loop iteration.
- **AGENTS.md rule 11 (Boris workflow)**: research → plan → annotate →
  implement → report. Driver writes `research.md` + `report.md` per
  per-issue plan dir.
- **AGENTS.md rule 21 (TOOLADD)**: any new feature must ship with Product
  Feature + ASCII Art + How-to-Verify sections. FIXEDFLOW.md and plan.md
  satisfy this.

## D. Doc shapes referenced in FIXEDFLOW

- `docs/HOWTO-PLAN-PR.md` — 4-section PR plan: plan / expected outputs /
  how-to-verify / claudefast probes. Driver uses this format for the auto-PR
  description body.
- `docs/PR-PLAN.md` — 3-section per-iter fix plan: task / outputs / judge
  harness. Driver writes/updates one per `/review` iter.
- `docs/POSTPR.md` — POSTPR loop = `/review` until PASS, no defect merge.
  Driver implements the programmatic version of this loop.
- `docs/FASTPROBE.md` — 3-step claudefast probe pattern (orient / parallel /
  audit). Used by judge harness §V1.
- `docs/feature-verification.md` — 1+2+3 verification gates: claudefast probe
  + codex hard-match + tmux interactive `/export`. Judge harness §V1
  dispatches all three.
- `docs/TEAMWORK.md` — N+1+(2N) parallel execution. Not used in driver
  (driver is single-issue serial), but the judge harness dry-run could
  parallelize the 4 probes via this pattern in a future revision.

## E. mainpi pattern

Per `~/.pi/agent/docs/mainpi.md`: mainpi is orchestrator-only with zero
built-in read/write tools. Wrapper: `pi -e <subagents-extension>
--no-builtin-tools`. Spawns N async subagents; total wall-clock = slowest
subagent. Subagent calls return immediately to the orchestrator.

Local watcher invokes mainpi like:

```
mainpi 'use the fixed-flow-driver skill to implement issue #<N>'
```

Driver itself runs as a subagent inside that mainpi session, with
read/write/bash/git/gh tools enabled.

## F. Surveyed by Explore agents

This research dump consolidates outputs from three parallel Explore agent
runs on 2026-05-09:

1. GitHub workflows + auth surface area (sections A, C above).
2. Skill structure + grill output formats + `/review` definition (section B).
3. Doc patterns (HOWTO-PLAN-PR, PR-PLAN, POSTPR, FASTPROBE, feature-
   verification, TEAMWORK, TOOLADD, DUCKPLAN) (section D).

A fourth Plan agent run validated the design against project rules and
caught two violations (canned-answer block, wrong worktree path) plus
recommended bypass mechanism, soft-warn first 7 days, heartbeat Action,
and explicit per-iter PR-PLAN obligation. All recommendations folded into
`plan.md`.
