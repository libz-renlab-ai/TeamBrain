```
              ┌──────────────────────────────────────────────┐
              │   TeamBrain Multi-User Testing Sandbox       │
              │                                              │
              │   .sandbox/users/                            │
              │   ├── alice/                                 │
              │   │   ├── home/.claude/                      │
              │   │   ├── home/.teamagent/                   │
              │   │   └── project/                           │
              │   ├── bob/                                   │
              │   │   ├── home/.claude/                      │
              │   │   ├── home/.teamagent/                   │
              │   │   └── project/                           │
              │   └── ...                                    │
              │                                              │
              │   All users share one teamagent binary:      │
              │   .sandbox/npm/bin/teamagent                 │
              └──────────────────────────────────────────────┘
```

# Multi-User Testing Sandbox

**Why**: `docs/sandbox.md` describes a *single-user* sandbox (everything under
`.sandbox/home/` and `.sandbox/project/`). That layout cannot model features
that involve **two or more users on one machine** — viral rule sync, init
propagation across users, conflicting hook installs, cross-user collector
visibility, etc.

This doc adds a **second** sandbox layout — `.sandbox/users/<name>/` — without
touching the existing single-user layout. The two coexist.

## Path layout

| Per-user component | Path |
|--------------------|------|
| User root | `.sandbox/users/<name>/` |
| User HOME (`$HOME`) | `.sandbox/users/<name>/home/` |
| User Claude config | `.sandbox/users/<name>/home/.claude/` |
| User teamagent global DB | `.sandbox/users/<name>/home/.teamagent/` |
| User project root | `.sandbox/users/<name>/project/` |
| User project hooks config | `.sandbox/users/<name>/project/.claude/settings.local.json` (populated by `init`) |
| User project knowledge DB | `.sandbox/users/<name>/project/.teamagent/knowledge.db` (populated by `init`) |

| Shared component | Path |
|------------------|------|
| Shared npm prefix | `.sandbox/npm/` |
| Shared `teamagent` binary | `.sandbox/npm/bin/teamagent` |

The `.sandbox/` tree (including `.sandbox/users/`) is already covered by the
existing `.sandbox/` line in `.gitignore`, so nothing extra needs to be ignored.

User names are validated to `^[A-Za-z0-9_][A-Za-z0-9_-]*$` — letters / digits /
underscore / dash, but the **first** character may not be `-`, so names cannot
masquerade as CLI flags (`-rf`, `--help`) to any tool that later ingests them.

## How to spin up users

From the repo root:

```bash
# Build + install teamagent into the shared sandbox npm prefix (once)
bash scripts/multi-user-sandbox.sh setup

# Create per-user homes (idempotent — re-running is safe)
bash scripts/multi-user-sandbox.sh add alice bob carol

# Initialise teamagent for one user
bash scripts/multi-user-sandbox.sh init alice

# Run an arbitrary teamagent subcommand as one user
bash scripts/multi-user-sandbox.sh as alice doctor

# Tear it all down
bash scripts/multi-user-sandbox.sh reset
```

Behind the scenes `as <name>` exports:

```bash
HOME=.sandbox/users/<name>/home
PATH=.sandbox/npm/bin:$PATH
```

and `cd`s into `.sandbox/users/<name>/project/` before exec-ing the subcommand,
so every user sees the **same** binary but a **separate** `~/.claude`,
`~/.teamagent`, and project tree.

## What this is for

* **viral sync dogfood**: after `as alice` writes a rule, run `as bob compile`
  to confirm Bob does *not* see Alice's rule (no cross-leakage), then exercise
  the eventual sync path explicitly.
* **init idempotency**: run `init alice; init alice` and assert no surprise.
* **hook collision tests**: register the same hook from two users; confirm one
  doesn't clobber the other.
* **collector / dashboard E2E**: have N users emit attribution events to the
  same collector and check the dashboard groups them by user.

## What this is **not**

* Not a Docker / VM / namespace isolation — users share the host kernel and
  filesystem. Anything that escapes `$HOME` (e.g. a hook that writes to
  `/tmp`) will still collide. Multi-user *isolation* is left to higher layers
  (containers, fly.io, real boxes).
* Not a replacement for `docs/sandbox.md` — the single-user layout still works
  unchanged. Use whichever fits the scenario.
* Not part of `pnpm test` — the helper is a manual / dogfood tool.

## Cleanup

`bash scripts/multi-user-sandbox.sh reset` removes `.sandbox/users/` only. The
shared `.sandbox/npm/` and the single-user layout under `.sandbox/home/` /
`.sandbox/project/` are untouched.
