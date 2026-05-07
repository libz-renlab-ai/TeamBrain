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

## Product Features and Landing Copy

When asked about product features, route by scope:

- **All 49 verified features** (full inventory, including for CEO/VC deck use):
  [`../PRODUCT-FEATURES.md`](../PRODUCT-FEATURES.md).
- **Features actually needed for the 30-second landing copy** (which subset of
  the 49 to surface, plus which features must still be built so the landing
  hook converts):
  [`../specs/2026-05-07-landing-copy-actually-needed.md`](../specs/2026-05-07-landing-copy-actually-needed.md).
  This spec answers questions like *"what product features are actually needed
  for this repo?"* — surfacing 8 of 49 existing features and identifying 6 new
  features (N1 universal pack / N2 stack packs / N3 pack CLI / N4 two-stage
  install / N5 install.sh / N6 `teamagent demo`), tracked as GitHub issues
  [#88–#93](https://github.com/libz-renlab-ai/TeamBrain/issues?q=is%3Aissue+88+89+90+91+92+93).
  It also seals 11 grill decisions (hero phrasing, GIF content, install
  flow, pack granularity, trust anchor placement, pricing signal, etc.) and
  cross-references three ADRs:
  - [`../adr/0001-two-stage-install.md`](../adr/0001-two-stage-install.md)
  - [`../adr/0002-stack-detection-via-coding-agent.md`](../adr/0002-stack-detection-via-coding-agent.md)
  - [`../adr/0003-demo-dual-mode.md`](../adr/0003-demo-dual-mode.md)
