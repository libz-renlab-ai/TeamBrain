```text
  ADR-0014 main file (≤200 lines)
            |
            v
  this INDEX (table of per-issue siblings)
            |
            v
  per-issue grill logs (verbatim grill comments)
   |       |       |       |       |
   v       v       v       v       v
  155.md  158.md  164.md  218.md  225.md  229.md  233.md  243.md
  250.md  256.md  258.md  261.md  273.md  280.md  283.md  290.md
  291.md  issue-294.md  296.md  297.md  299.md  306.md  308.md  309.md
  310.md  313.md  320.md  326.md  371.md  372.md
  batch-2026-05-13-overview.md  batch-2026-05-13-architecture.md
  batch-2026-05-13-feature-specs.md
```

# ADR-0014 grill log siblings — INDEX

Per ADR-0014 §"Considered Options" option (D), per-issue grill log siblings
live under `docs/adr/0014/<issue-N>.md`. This INDEX is the discoverable
entry point.

**Population mode**: save-mode backfill. All entries below correspond to
issues that already had a `grill-ready` label + grill comment **before**
ADR-0014 was accepted on 2026-05-11; they were saved to this directory on
2026-05-12 from existing GitHub comments — no new grilling was performed.

Going forward (per ADR-0014 §"Operational shape"), each new
`grill-ready` issue gets a fresh sibling here at the moment its grill
comment lands, before `/fixed-flow-driver` dispatch.

## Save-mode additions on 2026-05-13 (batch grill from ChatGPT)

The 12 issues #290, #291, #296, #297, #306, #308, #309, #310, #320, #326, #371, #372
all carried the `grilling` label as of 2026-05-13 and were grilled in a unified
batch via ChatGPT (see Grill-URL in each sibling's frontmatter). Their siblings
were saved together on 2026-05-13 in save-mode per ADR-0014 §"Operational shape"
— this is not a re-grill; it is the canonical save step that comes between the
grill-comment landing and `/fixed-flow-driver` dispatch. After save, each issue's
label is flipped `grilling` → `grill-ready` + `docs-grill-ready` (P4 state per
docs/ISSUE-LIFECYCLE.md).

Cross-cutting sections of the unified grill live in three sibling files:

- [./batch-2026-05-13-overview.md](./batch-2026-05-13-overview.md) — §0 overall
  verdict, §1 foundational product question, §24 phase-1 cutline, §30 grilled
  roadmap, §31 final verdict table, §32 one-sentence version.
- [./batch-2026-05-13-architecture.md](./batch-2026-05-13-architecture.md) — §3
  prompt storage, §5 raw-event deletion strategy, §9 work-item anchor, §16
  plugin architecture, §17 project-config source-of-truth.
- [./batch-2026-05-13-feature-specs.md](./batch-2026-05-13-feature-specs.md) —
  §25 leader homepage, §26 live inspection, §27 daily summary, §28 incident
  workflow, §29 plugin permissions.

**Line-count exemption note**: ADR-0014 sibling files (per-issue + `batch-*.md`)
intentionally hold verbatim grill content and routinely exceed CLAUDE.md's
<200-line guideline for `docs/`. Established baseline shows
`273.md` (355 lines), `233.md` (445 lines), `218.md` (231 lines) etc. — the
sibling pattern itself is the exemption, in the same spirit as `docs/CONTEXT.md`
being exempt for being a glossary. Splitting verbatim grill content further
would damage navigability for marginal compliance benefit.

## Backfilled siblings + 2026-05-13 batch (sorted by issue number)

| Issue | State | Closed at | Closing PRs | Grill log |
| --- | --- | --- | --- | --- |
| [#155](https://github.com/libz-renlab-ai/TeamBrain/issues/155) | CLOSED | 2026-05-10 | #268, #272 | [./155.md](./155.md) |
| [#158](https://github.com/libz-renlab-ai/TeamBrain/issues/158) | CLOSED | 2026-05-09 | #224 | [./158.md](./158.md) |
| [#164](https://github.com/libz-renlab-ai/TeamBrain/issues/164) | CLOSED | 2026-05-09 | — | [./164.md](./164.md) |
| [#218](https://github.com/libz-renlab-ai/TeamBrain/issues/218) | CLOSED | 2026-05-09 | #226 | [./218.md](./218.md) |
| [#225](https://github.com/libz-renlab-ai/TeamBrain/issues/225) | CLOSED | 2026-05-09 | #237 | [./225.md](./225.md) |
| [#229](https://github.com/libz-renlab-ai/TeamBrain/issues/229) | CLOSED | 2026-05-09 | #231, #236 | [./229.md](./229.md) |
| [#233](https://github.com/libz-renlab-ai/TeamBrain/issues/233) | CLOSED | 2026-05-09 | #235 | [./233.md](./233.md) |
| [#243](https://github.com/libz-renlab-ai/TeamBrain/issues/243) | CLOSED | 2026-05-09 | #248 | [./243.md](./243.md) |
| [#250](https://github.com/libz-renlab-ai/TeamBrain/issues/250) | CLOSED | 2026-05-09 | #251 | [./250.md](./250.md) |
| [#256](https://github.com/libz-renlab-ai/TeamBrain/issues/256) | CLOSED | 2026-05-09 | #257 | [./256.md](./256.md) |
| [#258](https://github.com/libz-renlab-ai/TeamBrain/issues/258) | CLOSED | 2026-05-10 | #259 | [./258.md](./258.md) |
| [#261](https://github.com/libz-renlab-ai/TeamBrain/issues/261) | CLOSED | 2026-05-10 | #262 | [./261.md](./261.md) |
| [#273](https://github.com/libz-renlab-ai/TeamBrain/issues/273) | CLOSED | 2026-05-10 | #277 | [./273.md](./273.md) |
| [#280](https://github.com/libz-renlab-ai/TeamBrain/issues/280) | CLOSED | 2026-05-11 | #307 | [./280.md](./280.md) |
| [#283](https://github.com/libz-renlab-ai/TeamBrain/issues/283) | CLOSED | 2026-05-11 | #285 | [./283.md](./283.md) |
| [#290](https://github.com/libz-renlab-ai/TeamBrain/issues/290) | OPEN | — | — | [./290.md](./290.md) |
| [#291](https://github.com/libz-renlab-ai/TeamBrain/issues/291) | OPEN | — | — | [./291.md](./291.md) |
| [#294](https://github.com/libz-renlab-ai/TeamBrain/issues/294) | CLOSED | 2026-05-12 | #339 | [./issue-294.md](./issue-294.md) |
| [#296](https://github.com/libz-renlab-ai/TeamBrain/issues/296) | OPEN | — | — | [./296.md](./296.md) |
| [#297](https://github.com/libz-renlab-ai/TeamBrain/issues/297) | OPEN | — | — | [./297.md](./297.md) |
| [#299](https://github.com/libz-renlab-ai/TeamBrain/issues/299) | OPEN | — | — | [./299.md](./299.md) |
| [#306](https://github.com/libz-renlab-ai/TeamBrain/issues/306) | OPEN | — | — | [./306.md](./306.md) |
| [#308](https://github.com/libz-renlab-ai/TeamBrain/issues/308) | OPEN | — | — | [./308.md](./308.md) |
| [#309](https://github.com/libz-renlab-ai/TeamBrain/issues/309) | OPEN | — | — | [./309.md](./309.md) |
| [#310](https://github.com/libz-renlab-ai/TeamBrain/issues/310) | OPEN | — | — | [./310.md](./310.md) |
| [#313](https://github.com/libz-renlab-ai/TeamBrain/issues/313) | OPEN | — | — | [./313.md](./313.md) |
| [#320](https://github.com/libz-renlab-ai/TeamBrain/issues/320) | OPEN | — | — | [./320.md](./320.md) |
| [#326](https://github.com/libz-renlab-ai/TeamBrain/issues/326) | OPEN | — | — | [./326.md](./326.md) |
| [#371](https://github.com/libz-renlab-ai/TeamBrain/issues/371) | OPEN | — | — | [./371.md](./371.md) |
| [#372](https://github.com/libz-renlab-ai/TeamBrain/issues/372) | OPEN | — | — | [./372.md](./372.md) |

## How siblings are populated

Per ADR-0014, after a `grill-ready` comment lands on a GitHub issue, the
maintainer runs `/grill-with-docs` in **save mode** (not a fresh grill).
The skill (or, as in this backfill PR, a maintainer-driven script)
captures the verbatim grill comment from GitHub and writes it to
`docs/adr/0014/<N>.md` along with the issue metadata + related PR
references.

The format is intentionally minimal so the **GitHub comment** remains the
audit-trail source of truth, and the ADR sibling acts as the
**durable, gbrain-indexable mirror** that survives triage-and-split,
issue close/transfer, and comment edits.

<!-- /grill-with-docs appends new sibling rows above; preserve sort order -->
