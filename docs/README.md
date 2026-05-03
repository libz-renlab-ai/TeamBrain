# TeamAgent Docs

This directory is a map of TeamAgent's product, architecture, and milestone
history. Most source documents are intentionally kept as dated records; use
the indexes below to choose what to read first.

## Start Here

| Goal | Read |
| --- | --- |
| Understand the product quickly | [系统展示.md](系统展示.md) |
| Understand the architecture shape | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Look up implementation details | [SYSTEM.md](SYSTEM.md) |
| Launch the real-time dashboard | Run `pnpm teamagent dashboard --watch --open` |
| Verify or test a feature/fix, including PR review gates | [feature-verification.md](feature-verification.md) |
| Prepare a verified-only CEO/VC ship-status CSV | [PRESHIP.md](PRESHIP.md) |
| Live-preview / dogfood agent edits in two tmux panes | [DOGFOOD.md](DOGFOOD.md) |
| Report a bug — system info + repro + raw logs to GitHub | [BUGREPORT.md](BUGREPORT.md) |
| Check PR #14 status | [pr-14-status.md](pr-14-status.md) |
| Understand project knowledge propagation | [knowledge/INDEX.md](knowledge/INDEX.md) |
| Find foundational specs | [specs/README.md](specs/README.md) |
| Find later milestone specs and plans | [superpowers/README.md](superpowers/README.md) |
| Review historical Phase 1 and superseded docs | [backup/README.md](backup/README.md) |

## Reading Paths

### Product and Positioning

1. [系统展示.md](系统展示.md) for the user-facing product story.
2. [superpowers/specs/2026-04-22-product-roadmap-v3.md](superpowers/specs/2026-04-22-product-roadmap-v3.md) for the latest roadmap.
3. [archive/conflict-governance/2026-04-21-team-memory-direction.legacy.md](archive/conflict-governance/2026-04-21-team-memory-direction.legacy.md) for the (archived) team-memory direction memo, superseded by [specs/2026-04-30-experience-governance-redesign.md](specs/2026-04-30-experience-governance-redesign.md).

### Architecture and Mechanics

1. [ARCHITECTURE.md](ARCHITECTURE.md) for the conceptual architecture.
2. [SYSTEM.md](SYSTEM.md) for the deeper technical reference.
3. [notes/2026-04-14-hook-protocol-decisions.md](notes/2026-04-14-hook-protocol-decisions.md) for hook protocol decisions.

### Verification

1. [feature-verification.md](feature-verification.md) for the required
   feature/fix verification gate: `claudefast`, `codex`, JSON hard-match, tmux
   `/export`, PR review gate, and commit/PR evidence.
2. [pr-14-status.md](pr-14-status.md) for the current PR #14 local status
   index when GitHub access is blocked.

### Milestone Work

1. [specs/README.md](specs/README.md) for original product and Phase 2 context.
2. [superpowers/specs/README.md](superpowers/specs/README.md) for design documents.
3. [superpowers/plans/README.md](superpowers/plans/README.md) for implementation plans.
4. [dogfood/自举报告.md](dogfood/自举报告.md) for Phase 2 dogfood results.

## Directory Map

| Path | Purpose |
| --- | --- |
| `specs/` | Foundational product specs, backlog, and direction memos. |
| `superpowers/specs/` | Later milestone design specs and roadmaps. |
| `superpowers/plans/` | Task-level implementation plans for later milestones. |
| `gstack/` | Approved `/office-hours` design docs that downstream gstack review skills can discover automatically. |
| `notes/` | Small decision records. |
| `feature-verification.md` | Feature/fix verification gate and evidence requirements. |
| `knowledge/` | Project knowledge index and docs propagation notes. |
| `pr-14-status.md` | PR #14 local status index for restricted verification sessions. |
| `research/` | Research notes that informed roadmap decisions. |
| `dogfood/` | Current dogfood reports. |
| `backup/` | Historical and superseded documents retained for traceability. |

## Conventions

- Dated filenames are chronological records, not automatically current.
- Prefer the newest roadmap or design doc when two documents cover the same
  topic.
- Files under `backup/` are historical unless a current doc explicitly points
  back to them.
