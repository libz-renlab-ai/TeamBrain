---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

## 0. Pre-grill claim (cross-host mutex, GitHub-issue context only)

Per `docs/PRE-GRILL-CLAIM.md`: if this grill is bound to a **TeamBrain GitHub issue** (the user named an issue number / pasted an issue URL / the conversation context is clearly about an open repo issue), **before** asking the first grill question:

> **make a comment claiming we have started grilling this issue and add tag "grilling"**

Concretely (same order as `/grill-via-web` §0):

1. `gh issue view <N> --json labels -q '.labels[].name' | grep -q '^grilling$' && exit` — defer if already locked.
2. `gh issue view <N> --json labels -q '.labels[].name' | grep -q '^grill-ready$' && exit` — already grilled, route to `/fixed-flow-driver`.
3. `gh issue comment <N> --body "🍳 grill picked up at <ISO timestamp> on <hostname> via /grill-me. Following docs/PRE-GRILL-CLAIM.md."`
4. `gh issue edit <N> --add-label grilling`

Only after the label is on the issue: start asking grill questions.

**Skip §0 entirely** when grilling a non-issue artifact (local plan file, design doc, abstract idea). The `grilling` lock is only for GitHub-issue grills.

When the grill converges, the user (or the agent driving this skill) is responsible for posting the grill transcript back to the issue and running `gh issue edit <N> --remove-label grilling --add-label grill-ready`.

## Grill loop

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.
