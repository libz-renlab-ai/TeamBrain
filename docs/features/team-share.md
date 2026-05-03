```text
   ┌─────────────────────────────────────────────────────────────┐
   │     TeamBrain Feature: Team Knowledge Sharing               │
   │                                                             │
   │   ┌─ personal ─┐   ┌─ global ──┐   ╔═ team ═══════╗ NOT YET │
   │   │ project DB │   │  user DB  │   ║ git PR/MDC  ║ Phase 4 │
   │   │ knowledge. │   │ global.db │   ║ (write =>   ║         │
   │   │    db      │   │           │   ║   THROW)    ║         │
   │   └────────────┘   └───────────┘   ╚══════════════╝         │
   │       PreToolUse: Promise.all([personal, team, global])     │
   │              ↑              ↑              ↑                │
   │           project DB    project DB     global DB            │
   │           (returns)    (always [])    (returns)             │
   └─────────────────────────────────────────────────────────────┘
```

# Team Knowledge Sharing

Source index: [../README.md](../README.md) · [../SYSTEM/08-knowledge-store.md](../SYSTEM/08-knowledge-store.md)

## Goal

Let a team share rules / canon / wisdom across machines via a layered knowledge store whose **routing IS the privacy boundary** — personal stays project-local, global stays machine-local, team (Phase 4) is git-synced through MDC files in PRs.

## Status

### IMPLEMENTED (Phase 1–3)

- **Dual physical store**: project-level `<cwd>/.teamagent/knowledge.db` + machine-level `~/.teamagent/global.db`
- **Three-way concurrent retrieval at PreToolUse**: `Promise.all` queries personal + team + global in parallel; team query is wired but always returns empty (see below)
- **Schema reserves `team` slot**: `scope_level CHECK IN ('personal','team','global')` so future writes plug in without migration
- **Read CLI accepts `--scope=team`**: `teamagent review --scope=team` runs (it just maps team → personal in v2)

### NOT YET (Phase 4 — `docs/superpowers/plans/2026-05-01-phase4-team-memory-plan.md`)

- **`scope.level=team` writes throw**: `DualLayerStore.add()` raises `Error("team-scoped entries are not supported until Phase 4")`
- **No git-sync transport**: no `teamagent sync pull/push`, no `.teamagent/rules/*.mdc` codec, no SessionStart auto-pull, no pre-commit PII gate
- **No `teamagent export / import`** commands
- **No PII redactor** for outbound team rules
- **No multi-variant model** (`problem_cluster_id` + `variant_id`) — single-row knowledge entries only
- **No team-scope dedicated DB file**: by design, team's medium is git-tracked MDC, not a third sqlite

## How it works

### Scope routing (truth table)

| `scope.level` | Write path                                                  | Read path                                                | Physical medium                              | Status                |
|---------------|-------------------------------------------------------------|----------------------------------------------------------|----------------------------------------------|-----------------------|
| `personal`    | `DualLayerStore.add → project.add` → project DB             | `findActive()` returns project DB rows first             | `<cwd>/.teamagent/knowledge.db`              | works                 |
| `global`      | `DualLayerStore.add → global.add` → global DB               | `findActive()` returns global DB rows after personal     | `~/.teamagent/global.db`                     | works                 |
| `team`        | **`throw new Error("...not supported until Phase 4")`**     | PreToolUse queries it (always empty); review.ts maps→personal | git-tracked MDC (not yet)              | **THROW today**       |

### Code references (canonical, do not paraphrase)

- Write router: `packages/adapters/src/storage/sqlite/dual-layer-store.ts:26-38` — `switch (entry.scope.level)` with `case "team": throw new Error("team-scoped entries are not supported until Phase 4")`
- PreToolUse three-way query: `packages/cli/src/bin-pre-tool-use.ts:112-140` — `Promise.all([personal, team, global])` against `(projectRetriever, projectRetriever, globalRetriever)`
- Read-side team→personal map: `packages/cli/src/commands/review.ts:44-46` — `// team maps to personal in v2` `const effectiveScope = opts.scope === "team" ? "personal" : opts.scope`
- Schema with all three scopes: `packages/adapters/src/storage/sqlite/schema.ts:24` — `scope_level TEXT NOT NULL CHECK(scope_level IN ('personal','team','global'))` and `:67` `idx_knowledge_scope ON knowledge(scope_level, scope_project)`

### Privacy boundary today

Two real walls (`personal` vs `global`), one placeholder (`team`):

```
   write(personal) ──→ project DB only ──→ never escapes <cwd>/.teamagent/
   write(global)   ──→ global DB only  ──→ never escapes ~/.teamagent/
   write(team)     ──→ THROWS Error    ──→ no medium yet (Phase 4 = git PR)
```

## How to verify

1. **Show the throw**:
   ```bash
   pnpm teamagent learn --scope=team "team rule X"   # expected: Error
   ```
2. **Show the routing source**:
   ```bash
   sed -n '26,38p' packages/adapters/src/storage/sqlite/dual-layer-store.ts
   sed -n '112,140p' packages/cli/src/bin-pre-tool-use.ts
   sed -n '40,50p'  packages/cli/src/commands/review.ts
   ```
3. **FASTPROBE the docs**:
   ```bash
   claudefast -p "what is TeamBrain's team knowledge sharing feature? include dual-layer storage, scope routing (global/project/team), what's IMPLEMENTED and what's NOT YET (Phase 4). reference real file paths."
   ```
   Expect 4 anchors: `~/.teamagent/global.db` + `<cwd>/.teamagent/knowledge.db` + `dual-layer-store.ts` + Phase 4 plan path or `bin-pre-tool-use.ts` / `review.ts` evidence.

## Known limitations

These are the same NOT YET items above, restated as user-visible constraints:

- Calling `learn`/`add` with `--scope=team` aborts with an Error today — use `--scope=personal` (project-local) or `--scope=global` (machine-local) instead.
- There is no shared, machine-crossing memory yet. Two laptops on the same project share NOTHING about TeamAgent learnings until Phase 4 ships git-sync.
- `teamagent review --scope=team` does not show team-only rules; it silently shows personal rules (v2 mapping). After Phase 4 it will show git-synced team MDC.

## Links

- Phase 4 plan (14-day ship plan): `docs/superpowers/plans/2026-05-01-phase4-team-memory-plan.md`
- System knowledge-store doc: `docs/SYSTEM/08-knowledge-store.md`
- System limitations: `docs/SYSTEM/09-limitations.md` (`### Team Scope 未实现`)
- Prior-art research (Cursor / Windsurf / Continue / Copilot memory): `docs/research/2026-04-22-team-memory-prior-art.md`
- Original v5.2 design with `scope.level` field: `docs/specs/2026-04-13-teamagent-design.md`
- Experience-governance redesign (multi-variant model for Phase 4): `docs/specs/2026-04-30-experience-governance-redesign.md`
