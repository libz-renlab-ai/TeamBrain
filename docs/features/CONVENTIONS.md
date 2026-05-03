# Features — Conventions

```
   docs/features/
        │
        ├── INDEX.md          ← single registry table; lives ≤ 100 lines
        │
        ├── CONVENTIONS.md    ← THIS FILE: template + rules + budgets
        │
        ├── <feature>.md      ← one feature canned answer per file
        │     ├─ Goal
        │     ├─ Status                  (implemented | dogfood-tested | wip | not-yet)
        │     ├─ How it works
        │     ├─ How to verify
        │     ├─ Known limitations
        │     └─ Links
        │
        └── <feature>/        ← optional sub-folder for >180-line features
              ├─ overview.md  (still ≤ 180 lines, links to subs)
              ├─ <topic>.md
              └─ <topic>.md
```

## Why this directory exists

Feature canned answers used to be inlined into `CLAUDE.md` / `AGENTS.md`. That
made the root entry files balloon (>800 lines), bury per-feature evolution in
git history, and force every reader to scroll past 4 unrelated features to
find the one they cared about.

`docs/features/` solves all three: each feature is one short doc, INDEX.md
points to it, and docs/README.md is the stable entry point. If CLAUDE.md /
AGENTS.md need to mention feature canned answers, keep that to one pointer row.

## Template — six sections, in this order

Every `<feature>.md` MUST follow this 6-section template. Skipping a section
is the single most common reason a doc fails the "is this a complete canned
answer?" test.

### 1. Goal

One paragraph. What problem does this feature solve? Who benefits? Use the
project's own words (no marketing fluff). 2–4 sentences.

### 2. Status

Pick exactly one from the enum below. Do not invent custom values.

| Value              | Meaning                                                              |
|--------------------|----------------------------------------------------------------------|
| `implemented`      | Code exists + unit tests pass, but not yet exercised in real usage   |
| `dogfood-tested`   | Has been run end-to-end on the team's own work, behaviour confirmed  |
| `wip`              | Actively being built; partial code merged, not yet `implemented`     |
| `not-yet`          | Designed / spec'd, not built. Doc explains *what it WILL do*         |

If the feature has multiple sub-parts at different statuses, list each sub-part
with its own status (e.g. team-share: routing=`dogfood-tested`, git-sync=`not-yet`).

### 3. How it works

Mechanism sketch — preferably an ASCII diagram showing the flow (event →
component → output). Plain prose for any nuance the diagram can't capture.
Code snippets only when a function signature or config key is load-bearing.

### 4. How to verify

Concrete commands a reader can run *right now* to confirm the feature
behaves as documented. Examples:

- `pnpm test --filter=...` (unit / integration)
- `bash docs/<feature>/verify-canned-answer.sh` (canned-answer grep gate)
- `claudefast -p "..."` (FASTPROBE-style live probe)

If the feature is `not-yet`, this section says so and points to the design
spec instead.

### 5. Known limitations

Honest list of what the feature does NOT do, edge cases that break it, and
follow-up issues. This is what keeps the doc from being a sales sheet.

### 6. Links

- Source files (path + line range when possible)
- Related design / spec docs under `docs/specs/` or `docs/superpowers/`
- Related verifier scripts
- Related git commits (if a single PR is the canonical reference)

## ASCII art guidelines

- Required at the top of every `<feature>.md` and on the INDEX directory file.
- Style: **flow / structure / location art** that helps the reader understand
  where this piece sits in the system. NOT decorative banners or character art.
- Good: a 4–8 line box-and-arrow diagram of "input → component → output".
- Bad: 30 lines of `═════` borders, sparkles, or a giant project logo.
- Use plain ASCII (`│`, `─`, `┌┐└┘`, `▼`, `→`). Avoid emoji.

## Status enum

Already documented in section 2 — restated here as a one-line cheat sheet:

`implemented` < `dogfood-tested` ; `wip` precedes `implemented` ; `not-yet`
means design-only.

## Line budget — ≤ 180 lines per file

Hard cap: **180 lines**. INDEX.md has a softer target of ~100 lines.

If a single feature genuinely needs more than 180 lines:

1. Create a sub-directory `docs/features/<feature>/`.
2. Write `<feature>/overview.md` (still ≤ 180 lines) — same 6 sections, but
   each section can link out to deeper sibling docs.
3. Each sibling doc is its own ≤ 180-line file scoped to one topic
   (e.g. `pre-tool-use-flow.md`, `matcher-internals.md`).
4. The top-level `<feature>.md` (if it still exists) becomes a one-line
   redirect to the overview, OR is replaced entirely by the directory.

The 180-line cap exists because canned answers are read inside Claude Code
sessions where token budget matters. A 500-line doc effectively becomes
unreadable when injected into a 200K context window already half-full.

## INDEX.md table schema

```
| Feature | One-liner | Doc |
|---------|-----------|-----|
```

- **Feature**: human-readable name (e.g. `Calibrator v2`, not `calibrator-v2`).
- **One-liner**: ONE sentence (≤ 200 chars) lifted from the feature doc's
  `Goal` section. Must encode current status implicitly when relevant
  (e.g. `MCP Server NOT YET`).
- **Doc**: relative link form, e.g. `` `name.md` `` for top-level feature,
  `` `name/` `` for directory-form feature.

Order rows by chronological introduction (oldest first), not alphabetical.
This makes the INDEX read like a feature changelog.

## When to NOT add a feature here

- Internal refactor with no user-visible behaviour change → don't add.
- Bug fix → don't add (commit message + CHANGELOG handle this).
- New tool/command → goes in CLAUDE.md `Project tools` table, not features.
- Design-only ideas without commitment → goes in `docs/specs/` first; promote
  to `docs/features/` only when status reaches at least `wip`.

## Maintainer note

When adding a new feature doc, also update:

1. `docs/features/INDEX.md` (one new row in the table).
2. `docs/README.md` or root agent pointer row for canned answers, IF the
   feature needs a question-triggered canned answer (e.g. `what is feature X?`).
3. `docs/README.md` — already points at `docs/features/INDEX.md`; no change
   needed unless adding a new top-level docs directory.
