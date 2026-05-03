# Project Knowledge Index

This index records how TeamAgent project knowledge is stored and propagated.
Root `CLAUDE.md` should stay small and human-maintained; learned behavior should
flow through this docs index and project Skills instead of a generated managed
block.

## New Rule Ingestion

- New rules are saved to the knowledge database with structured fields as soon
  as they are accepted.
- Ingestion also best-effort syncs BM25/FTS and semantic vector indexes so the
  runtime matcher can retrieve the new rule without a separate manual migration.
- Interactive entry points such as `teamagent pitfall` synchronously write
  trigger/pattern vectors when possible.
- Tool-context descriptions and tool vectors may be filled in asynchronously in
  the background; this must not block the user command.

## Docs And Skills Propagation

- Stop hook propagation completes missing vector/index data and refreshes the
  project-facing knowledge surfaces.
- Human-readable project knowledge belongs in `docs/knowledge/INDEX.md` or a
  more specific document linked from this index.
- Agent-facing executable guidance belongs in project Skills under
  `.codex/skills/<name>/SKILL.md`.
- Root `CLAUDE.md` should link to the knowledge index and keep only stable,
  short, human-maintained agreements.
- Generated rule dumps must not be written back into root `CLAUDE.md`.

## Migrations

- `migrate-v6` and `migrate-v7` are backfill commands for old rules or rules
  missing newer structured fields.
- Normal new rule ingestion should not require the user to run `migrate-v6` or
  `migrate-v7` manually.
