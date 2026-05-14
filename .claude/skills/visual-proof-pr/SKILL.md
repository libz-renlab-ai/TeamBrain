---
name: visual-proof-pr
preamble-tier: 2
version: 2.0.0-archived
description: |
  [ARCHIVED] The visual-proof-pr local dev-loop skill has been archived to
  docs/legacy/skills/visual-proof-pr/. This stub stays at the original path so
  references to .claude/skills/visual-proof-pr/ do not break. Do NOT trigger this
  skill — it no longer carries an active workflow.
---

# Visual-Proof Guided PR Workflow — ARCHIVED

> This skill is **archived**. It is no longer an active workflow.

## What happened

The original `visual-proof-pr` skill (a local dev loop:
`design-shotgun → design-html → Chrome verify → implement → /review → squash-merge`)
plus its `judge-harness.md` were moved to:

```
docs/legacy/skills/visual-proof-pr/
  ├── SKILL.md          # the original 7-step workflow
  └── judge-harness.md  # the original 4-probe judge harness
```

This stub remains at `.claude/skills/visual-proof-pr/SKILL.md` only so existing
references to the path stay valid.

## Where to read about it now

A walkthrough of the archived skill — the 7 steps, the judge probes, the
"who commits them?" answer, and the name-collision caveat with
`docs/VISUAL-PROOF-PR.md` — was produced via `/talk-html`:

- https://htmlpreview.github.io/?https://gist.githubusercontent.com/LiuShiyuMath/99389ec5f7ca98469dfc988df79f00f3/raw/visual-proof-pr-skill-20260514-143702.html

## Not to be confused with

`docs/VISUAL-PROOF-PR.md` is a **different** thing with the same name: it is the
reviewer-facing evidence workflow (propose an issue → make the PR without asking
→ append an HTML proof comment). That doc is canonical and active. This skill is
not — it was the local design-to-PR dev loop, now archived.
