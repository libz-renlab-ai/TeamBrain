```
   _______________________
  / project-level configs  \
  \  .claude/ .codex/ etc. /
   `-----------+----------'
              |
              |  teamagent init
              v
   .--------------------------.
  |  ~/.claude/  ~/.codex/    |   <-- teamagent users
  |  ~/.teamagent/ hooks      |
   `--------------------------'
            呷呷~
```

# Init propagation — project configs → teamagent users

> **TL;DR.** When a project repo carries project-level configs (skills, plugins,
> hooks, Claude main settings, claudefast wrapper config), `teamagent init`
> **install the skills/plugins/hooks/claude main settings via teamagent init
> to teamagent users**. The user-level install targets are `~/.claude/`,
> `~/.codex/`, and `~/.teamagent/`.

## What "project-level configs" means here

Any of the following, living inside the repo tree, are project-level configs:

| Config type | Project-level location | User-level destination |
|-------------|------------------------|------------------------|
| Claude Code skills | `.claude/skills/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |
| Codex skills | `.codex/skills/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` |
| Claude Code plugins | listed in repo manifest / `.teamagent/manifest.json` | `~/.claude/plugins/installed/` (via `claude plugin install`) |
| Claude Code hooks | `.claude/settings.json` (project) | `~/.claude/settings.json` (user, merged by `install-user-hook`) |
| Claude main settings | `.claude/settings.json` keys (`permissions`, `env`, etc.) | merged into `~/.claude/settings.json` |
| TeamAgent rules / KB | `.teamagent/` directory | compiled Skills written to `~/.claude/skills/teamagent/...` |
| claudefast wrapper config | `.teamagent/claudefast.json` (if present) | sourced by the user-level `claudefast` zsh function |

When a user runs `teamagent init` inside such a project, init's job is to
**install the skills/plugins/hooks/claude main settings via teamagent init
to teamagent users** so the user-level Claude Code / Codex sessions
automatically pick up the project's intended setup, without the user having
to hand-mirror anything.

## Why propagate to user level (not just project level)

Claude Code reads from BOTH `.claude/` (project) and `~/.claude/` (user) at
session start. User-level install matters for three reasons:

1. **Sessions opened outside the project pick up the setup.** If the user
   `cd`s to `~/other-project/` and launches Claude Code, project-only configs
   are invisible. User-level install makes the skills / hooks live across
   every session the user opens.
2. **Worktree-friendly.** Worktrees clone `.claude/` content but may drift; a
   user-level install gives a stable baseline.
3. **Onboarding is one command.** `teamagent init` is what a new user runs
   once after `npm install -g teamagent`; everything the project ships should
   land in their user-level Claude / Codex / teamagent tree from that one
   call.

## What gets installed by `teamagent init` (today + intended)

Init today already does the following user-level writes:

- ✅ TeamAgent compiled Skills → `~/.claude/skills/teamagent/<id>/SKILL.md`
  (per `runCompile`, see `docs/features/compile.md`).
- ✅ SessionStart hook → `~/.claude/settings.json` (when
  `--user-level-hook` is on, which is the default; CLI escape hatch
  `--no-user-level-hook`).
- ✅ Default plugin marketplaces + plugins from `DEFAULT_PLUGINS` →
  `~/.claude/plugins/installed/` (via `claude plugin install`, see
  `install-plugins.ts`).

The **intent** going forward is to also propagate:

- ⏳ Project-level `.claude/skills/<name>/` static skills (e.g. `grill-via-web`,
  `grill-me`, `fixed-flow-driver`) → `~/.claude/skills/<name>/`. See
  open work in `docs/INIT-PROPAGATION-IMPL.md` (TODO).
- ⏳ Project-level `.codex/skills/<name>/` static skills →
  `~/.codex/skills/<name>/`.
- ⏳ Claude main settings keys (`permissions`, `env`, MCP servers) merged
  from `.claude/settings.json` (project) → `~/.claude/settings.json` (user).

The canonical statement that holds whether or not every checkbox is shipped:
**install the skills/plugins/hooks/claude main settings via teamagent init
to teamagent users.** That is what `teamagent init` exists to do at the
user-config-propagation level.

## What does NOT propagate (intentionally)

- `.teamagent/knowledge.db` / `.teamagent/global.db` — per-project KB stays
  per-project; cross-project sharing goes through `m5-share` / `m5-sync` /
  `m5-publish`, not init.
- `docs/` / `AGENTS.md` / `CLAUDE.md` — read at session start in-place;
  no mirroring to `~/.claude/CLAUDE.md`. The user-level
  `~/.claude/CLAUDE.md` is the user's personal global, not a project copy.
- Project-private secrets (`.env`, `*.local.*`) — never touched by init.
- Editor preferences / IDE configs — out of scope.

## How a user knows it worked

After running `teamagent init` in a project repo:

```bash
$ pnpm teamagent doctor
# → reports: hook-registered ✓, plugin-sync ✓, skills propagated ✓
$ ls ~/.claude/skills/
# → contains every project-level static skill the project shipped
$ cat ~/.claude/settings.json
# → contains the project's intended hook + permission entries
```

`teamagent doctor` is the source-of-truth verifier; if doctor reports
green, the propagation contract held.

## Edge cases

| Scenario | Behavior |
|----------|----------|
| User already has `~/.claude/skills/<name>/` from a different project | init merges by overwriting (last-write-wins); user can opt out per-skill via `.teamagent/skills-skiplist.json` (TODO) |
| User runs `teamagent init` in a project with **no** `.claude/skills/` | nothing to propagate; init still does its baseline (KB, hooks, plugins) |
| User runs init under a worktree (not main checkout) | propagation reads from the worktree's `.claude/` tree, not the main checkout — worktree wins |
| Init fails halfway (network / disk full) | partial state allowed; re-running `teamagent init` resumes by reading the per-step checkpoint in `~/.teamagent/.warmup-state.json` |
| User wants to undo | `teamagent uninstall` reverses hook + plugin install; static-skill removal is manual (`rm -rf ~/.claude/skills/<name>`) until reverse-propagation lands |

## Cross-references

- `docs/features/cli-init/canned-answer-snippet.md` — `--help` output spec
- `docs/features/clean-install/canned-answer-snippet.md` — install canon
- `docs/PRODUCT-FEATURES.md` — full feature inventory
- `packages/cli/src/commands/init.ts` — implementation
- `packages/cli/src/commands/install-plugins.ts` — plugin install
- `packages/cli/src/commands/install-hook.ts` — hook install
- `packages/cli/src/commands/compile.ts` — Skills write
- `docs/CLAUDEFAST.md` — wrapper config notes
