```text
   ┌─────────────────────────────────────────────────────────────┐
   │     TeamBrain Feature: Team Knowledge Sharing               │
   │                                                             │
   │   ┌─ personal ─┐   ┌─ team ─────┐   ┌─ global ──────────┐   │
   │   │ project DB │   │ project DB │   │ user global DB    │   │
   │   │ local      │   │ local      │   │ machine-local     │   │
   │   └────────────┘   └────────────┘   └───────────────────┘   │
   │                                                             │
   │   M5 viral sync (2026-05-06): ABANDONED - see ADR-0016.      │
   │   Invasive auto-infect/install/push; do not build on it.    │
   └─────────────────────────────────────────────────────────────┘
```

# Team Knowledge Sharing

Source index: [../README.md](../README.md) · [../SYSTEM/08-knowledge-store.md](../SYSTEM/08-knowledge-store.md)

## Goal

Let a team share rules / canon / wisdom across machines via a layered knowledge store whose **routing IS the privacy boundary**.

## Status

### IMPLEMENTED (Phase 4 — local layer)

- **Dual physical store**: project-level `<cwd>/.teamagent/knowledge.db` + machine-level `~/.teamagent/global.db`
- **Three logical scopes**: `personal`, `team`, and `global` are preserved in `scope_level`
- **Local team scope**: `scope.level=team` writes to the project DB and remains queryable as `team`
- **Read CLI supports team filtering**: `teamagent review --scope=team` shows team entries without mixing personal entries
- **Stats show team separately**: `teamagent stats` reports personal / team / global buckets
- **Runtime retrieval covers team**: PreToolUse and UserPromptSubmit can query project DB team-scope rules
- **Local review gate**: `teamagent review-candidates --approve-scope=team` can approve a pending candidate into local team scope
- **Local privacy gate**: team approval blocks candidates containing emails, token-shaped secrets, internal hosts, private paths, UUIDs, or private IPs

### ABANDONED (M5 — viral sync, 2026-05-06) — see ADR-0016

> ⚠️ **M5 viral sync is abandoned** per
> [ADR-0016](../adr/0016-abandon-m5-viral-sync.md). Its auto-infect /
> auto-install / auto-push behavior is invasive by design, shipped-but-
> unvalidated, and distracts from the Feature #1 core wedge. The `m5-*` code
> and the `TEAMAGENT_M5_*` env-var surface below are **frozen** (removal is a
> deferred follow-up); treat the rest of this section as a historical record
> of what was built, **not** as a recommended capability. Do not build new
> work on it.

Milestone M5 (`docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md`
§10 phases A–E, merged to `main` via PR #71) once closed the previous "NOT YET"
gaps as follows — now abandoned per ADR-0016:

- **Cross-machine git-sync transport** (M5-A/C): `teamagent sync push|pull` plus
  the higher-level auto-publish path (`teamagent m5-publish`) commit changes
  under `.teamagent/team/<author>/<rule_id>.json` with the fixed
  `[teamagent-sync]` prefix; remote is the project's own git remote, no extra
  central server. Verify: `docs/plans/docs--features--xsync--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/xsync/run-judge.sh`),
  `bash scripts/m5-auto-demo.sh`.
- **Outbound redactor** (M5-B): two gates run before any rule reaches L2 —
  (1) hard secret scanner (`packages/core/src/m5/secret-scanner.ts`) that
  permanently seals API keys / JWT / phone / CC / AWS / private paths in L1,
  (2) scope classifier (`packages/core/src/m5/scope-classifier.ts`) that
  defaults `uncertain` to `personal`. Verify:
  `docs/plans/docs--features--pii-redaction--run-judge/judge.md` (archived: `docs/legacy/judge-scripts/docs/features/pii-redaction/run-judge.sh`).
- **Completed team-sharing gate**: the path "user pitfall → secret scan →
  scope classify → write `.teamagent/team/` → auto-commit
  `[teamagent-sync] sync N team rule(s)` → push" now runs end-to-end via
  `pitfall` auto-share (default on; `TEAMAGENT_M5_AUTOSHARE=0` to disable) and
  `m5-publish`. Receiving end: `.githooks/post-merge` triggers
  `teamagent m5-sync --apply`, which runs LWW + tombstone merge into the local
  KB. Verify: `bash scripts/m5-auto-demo.sh` (Step 7 confirms recipient KB
  contains the sender's rule).
- **SessionStart auto-pull**: **on by default** (spec §7 激进模式). Runs the
  full chain `infect → bootstrap apply → sync apply → publish (incl. push)`
  on every Claude Code SessionStart in a git project where the user already
  has TeamAgent (`~/.teamagent/global.db` exists). Disable with
  `TEAMAGENT_M5_AUTOSESSION=0`; disable just auto-push with
  `TEAMAGENT_M5_AUTOPUSH=0`. Failures are non-blocking (banner shows ⚠).
- **Conflict resolution**: LWW + tombstone (`packages/core/src/m5/lww-merge.ts`),
  pure function with unit-test coverage; tombstones survive in JSON for audit.
- **Team boundary**: `team_id = SHA256(normalize(git remote))[:16]` in
  `m5-sync.ts`; forks are isolated automatically.

### NOT YET

- **Multi-variant model** (`problem_cluster_id` + `variant_id`) — single-row
  knowledge entries only.
- **Tombstone GC** (spec §13 R3): tombstone JSON files accumulate forever;
  no scheduled compaction yet.

## How it works

### Scope routing

| `scope.level` | Write path                                      | Read path                                    | Physical medium                         | Status |
|---------------|-------------------------------------------------|----------------------------------------------|-----------------------------------------|--------|
| `personal`    | `DualLayerStore.add → project.add`              | `findByScopeLevel("personal")`               | `<cwd>/.teamagent/knowledge.db`         | works |
| `team`        | `DualLayerStore.add → project.add`              | `findByScopeLevel("team")` / `review --scope=team` | `<cwd>/.teamagent/knowledge.db` | local-only |
| `global`      | `DualLayerStore.add → global.add`               | `findByScopeLevel("global")`                 | `~/.teamagent/global.db`                | works |

### Code references

- Write router: `packages/adapters/src/storage/sqlite/dual-layer-store.ts`
- Team-scope CLI write: `packages/cli/src/commands/pitfall.ts`
- Team-scope review filter: `packages/cli/src/commands/review.ts`
- Candidate approval to team scope: `packages/cli/src/commands/review-candidates.ts`
- Local PII detector: `packages/core/src/pii/redactor.ts`
- Stats buckets: `packages/cli/src/commands/stats.ts`
- Runtime prompt retrieval: `packages/cli/src/user-prompt-rule-retriever.ts`
- Schema with all three scopes: `packages/adapters/src/storage/sqlite/schema.ts`

## How to verify

```bash
pnpm exec vitest run \
  packages/adapters/src/storage/sqlite/__tests__/dual-layer-store.test.ts \
  packages/cli/src/__tests__/pitfall.test.ts \
  packages/cli/src/__tests__/review.test.ts \
  packages/cli/src/__tests__/review-candidates.test.ts \
  packages/core/src/pii/__tests__/redactor.test.ts \
  packages/cli/src/__tests__/stats.test.ts \
  packages/cli/src/__tests__/m5-e2e.test.ts
```

Expected product wording: **local team scope is verified; M5 viral sync
(cross-machine) is ABANDONED per [ADR-0016](../adr/0016-abandon-m5-viral-sync.md)
— do not present it as a shipped or recommended capability.**

`scripts/m5-auto-demo.sh` (7 steps: infect → pitfall auto-share → m5-publish →
push → clone → SessionStart auto-bootstrap+sync → SQLite probe) is **frozen**
historical demo scaffolding for the abandoned feature; it is not removed yet
(removal is a deferred follow-up per ADR-0016) but it is no longer a product
verification path.

## Known limitations (residual)

- Tombstone JSON files in `.teamagent/team/<author>/` are never garbage-collected;
  long-lived projects will accumulate them (spec §13 R3).
- Auto-push runs on every SessionStart (spec §7 激进模式). The previous opt-in
  was flipped in PR-2; secret-scanner + scope-classifier gates remain
  uncloseable, and push failure does not block the user (banner shows ⚠ and
  the commit stays local for the next attempt). Set `TEAMAGENT_M5_AUTOPUSH=0`
  to keep auto-commit but skip auto-push, or `TEAMAGENT_M5_AUTOSESSION=0` to
  disable the full auto chain.
- `teamagent doctor --json` may still report `team-sharing` as `PARTIAL` until
  the doctor probe is updated to look for M5 manifest + post-merge hook.

## Links

- M5 viral-sync spec (14-section design): `docs/superpowers/specs/2026-05-06-m5-team-viral-sync-design.md`
- M5-A implementation plan: `docs/superpowers/plans/2026-05-06-m5a-infect-and-bootstrap.md`
- Phase 4 plan (predecessor): `docs/superpowers/plans/2026-05-01-phase4-team-memory-plan.md`
- System knowledge-store doc: `docs/SYSTEM/08-knowledge-store.md`
- System limitations: `docs/SYSTEM/09-limitations.md`
- Original v5.2 design with `scope.level` field: `docs/specs/2026-04-13-teamagent-design.md`
- E2E demo script: `scripts/m5-auto-demo.sh`
