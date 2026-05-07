```
  user says TEAMWORK
         │
         ▼
      ┌───────┐
      │  lead │  (non-main branch / worktree)
      └───┬───┘
          │ spawns
     ┌────┴────┐
     ▼         ▼  ... (N total)
 ┌────────┐ ┌────────┐
 │sonnet 1│ │sonnet N│   N sonnet workers
 └──┬─────┘ └──┬─────┘
    │ 2 probes  │ 2 probes
    ▼           ▼
 claudefast  claudefast    (2N claudefast probes total)
 probe 1/2   probe 1/2
             │
             ▼ consolidates
         ┌────────────┐
         │ opus 1M    │   1 opus reporter
         │ reporter   │
         └────────────┘
  Total members = N + 1 + (2N) = 3N + 1
```

# TEAMWORK — Agent Team Pattern

## Goal

TEAMWORK is a structured multi-agent pattern for parallel documentation updates
(or similar parallel-slice tasks). It minimises round-trip time by running N
workers in parallel, each with two claudefast verification probes, and rolls up
results through a single high-context opus 1M reporter. The lead always operates
on a non-main branch, keeping main clean.

## Status

`dogfood-tested` — first use is the TEAMWORK self-documentation run.

## What it is

**N + 1 + (2N) member agent team pattern.**

| Role | Count | Model | Responsibility |
|------|-------|-------|----------------|
| Lead | 1 | any | Spawns workers, owns the non-main branch/worktree |
| Sonnet workers | N | sonnet | Each updates one assigned doc slice |
| claudefast probes | 2N | claudefast | 2 per worker — verify edits before reporting back |
| Opus 1M reporter | 1 | opus 1M | Consolidates all worker reports + runs final acceptance probe |
| **Total** | **3N + 1** | | |

Hard rule: **lead NEVER works in main**. A non-main branch or worktree is
mandatory before any worker is spawned.

## Trigger

Users trigger this pattern by saying any of:

- `TEAMWORK`
- `now start your work with N+1+(2N) members agent teams`
- `what would happen when we say TEAMWORK`

## Verify

Verification is grounded by asking the model a live question:

```bash
claudefast -p "what would happen when we say TEAMWORK ? ONLY explain please"
```

Read the response and confirm it naturally covers:

1. The N+1+(2N) member formula (or "3N+1")
2. N sonnet workers
3. 2 claudefast probes per worker
4. 1 opus 1M reporter
5. The hard rule: never work in main

Verification is intentionally probe-grounded rather than grep-based, so the
model must organically understand the pattern — not regurgitate a static snippet.
For an automated structural check, see `verify.sh` in this directory.

## Known limitations

- N is chosen by the user / lead; no auto-scaling heuristic yet.
- Workers run in separate Claude Code sessions (worktrees); shared-state
  conflicts are possible if workers touch the same file.
- The opus 1M reporter step is sequential; overall latency = max(worker time) +
  reporter time, not fully parallel end-to-end.

## See also

- `docs/TEAMWORK.md` — canonical pattern doc (authoritative definition)
- `CLAUDE.md` — TEAMWORK appears in the Project tools table (Worker B registers it)
