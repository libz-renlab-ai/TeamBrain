---
Status: accepted
Date: 2026-05-12
Parent: docs/adr/0014-save-grilled-comments-to-adr.md
Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/294
---

```text
   issue #294
   ─────────
   "更新 session start hook，放上用户最感兴趣的几个 feature"
                       │
                       │ (grill on web)
                       ▼
   grill comment lands on issue ── 加 grill-ready label
                       │
                       │ (maintainer 跑 /grill-with-docs)
                       ▼
   docs gate：
   - 把 banner 文案落到 docs/specs/2026-05-11-fixedflow-sessionstart-banner.zh.md
   - 把 docs-grill-ready 新概念落到 docs/FIXEDFLOW.md / HOW-TO-CLAIM-ISSUE.md
   - 把 grill 决策落到本 ADR-0014 sibling
                       │
                       ▼
   docs-grill comment + docs-grill-ready label
```

# ADR-0014 sibling: issue #294 grill log

Per parent ADR `docs/adr/0014-save-grilled-comments-to-adr.md` §"Operational
shape" item 3, large grills land in a per-issue sibling under
`docs/adr/0014/<issue-N>.md` rather than appending to the parent ADR. This is
the sibling file for issue #294.

## Grilled question/answer pairs (crystallized)

### Q1: Should `/grill-with-docs` replace `/grill-via-web`?

**Decision:** No. `/grill-via-web` remains the **only** issue-grill entry
point. `/grill-with-docs` is added as a **mandatory docs gate** after
`/grill-via-web`, not a replacement.

**Rationale:** Web LLMs (ChatGPT, Claude.ai) carry the bulk of the
issue-clarification grill; pulling that into CLI would lose the iterative
question/answer rhythm web UIs do well. CLI `/grill-with-docs` is shaped for
the "check grill output against existing code + ADRs + CONTEXT.md, update
docs" job — a different verb.

### Q2: Should "grill-ready" continue to mean "ready to implement"?

**Decision:** No. After this issue ships, "ready to implement" requires
**both** labels:

- `grill-ready` (set by human after `/grill-via-web` finishes)
- `docs-grill-ready` (set by `/grill-with-docs` after it writes the docs-grill
  comment)

**Rationale:** Without a docs gate, grill terminology and decisions stay
trapped in an ephemeral GitHub comment (per parent ADR-0014). Mandating
`docs-grill-ready` forces the maintainer to land terminology/decision deltas
into `docs/CONTEXT.md` + relevant ADRs before driver dispatch.

### Q3: Should driver dispatch auto-trigger on label combination?

**Decision:** No. Dispatch remains **manual human-driven** via
`/fixed-flow-driver`. Labels are **gates**, not **triggers**. No watcher,
cron, daemon, background dispatcher, or repo-wide scanner is allowed (per
existing `docs/FIXEDFLOW.md` Dispatch policy).

**Rationale:** Auto-dispatch breaks the "human-in-the-loop on dispatch
decisions" invariant; without it, mis-grilled or mis-triaged issues would
silently slide into implementation. Manual dispatch keeps the maintainer
accountable.

### Q4: What does the docs-grill comment contain?

**Decision:** A summary of:

- Which docs got updated (filenames + one-line description each);
- Terminology deltas synced into `docs/CONTEXT.md`, if any;
- ADR updates (new ADRs created / existing ADRs amended);
- Any "no docs update needed" explicit ack if that's the outcome.

Comment ends with `--- end docs grill ---` (mirrors `--- end grill ---`).

### Q5: Where does the Chinese SessionStart banner text live?

**Decision:** `docs/specs/2026-05-11-fixedflow-sessionstart-banner.zh.md`.

That file is the **only** source of truth for the banner copy; SessionStart
hook (`.claude/hooks/newsboard-session-start.sh` + `docs/newsboard.md`) will
reference it without paraphrasing.

**Rationale:** Decoupling copy (docs) from rendering (hook script) lets us
iterate banner text without touching shell code, and lets later releases
ship the banner copy without skill/hook PRs.

### Q6: Is the hook script in scope for this PR?

**Decision:** No. issue #294 is **docs-only** scope. The hook script change
(picking up the new banner text + rendering it more prettily) is a future
PR that consumes this spec.

**Rationale:** Forbidden paths per grill: `.codex/skills/**` and
`.claude/skills/**`. We additionally exclude `.claude/hooks/**` because the
acceptance criteria (#12) and grill body together imply pure docs scope.

### Q7: Should banner promise a fixed issue-to-merged SLA?

**Decision:** No. Banner copy describes "全程不卡人" (no human in the
inner loop) but never names a fixed completion time.

**Rationale:** `/review` fix-loop is **never-ends-until-PASS**; runtime is
data-dependent. Naming a fixed SLA creates a false promise that doesn't
survive a hard fix-loop.

## Terminology crystallized into `docs/CONTEXT.md`

No new terms were introduced. Existing terms (`Author`, `Teammate`, `Scope`,
`Viral sync`) already in CONTEXT.md remain authoritative.

Two operational labels are clarified in `docs/FIXEDFLOW.md` (not glossary
material, since they're workflow state, not domain language):

- `grill-ready` — human grilled on web, comment pasted back, label added.
- `docs-grill-ready` — `/grill-with-docs` finished the docs gate.

## ADR updates

- This sibling file (`docs/adr/0014/issue-294.md`) created.
- Parent ADR-0014 unchanged (its `<!-- /grill-with-docs appends grill logs
  below -->` comment marker stays; we used the sibling path because the
  grill is large enough to warrant its own file per parent §"Operational
  shape" item 3).
- No other ADR amended.

## Docs touched in this PR

- `docs/specs/2026-05-11-fixedflow-sessionstart-banner.zh.md` (new, banner SoT)
- `docs/FIXEDFLOW.md` (step 2.5 docs gate, two-label dispatch, no-scanner)
- `docs/HOW-TO-CLAIM-ISSUE.md` (claim requires both labels)
- `docs/knowledge/INDEX.md` (link to banner spec)
- `docs/adr/0014/issue-294.md` (this file)

## Verification anchors

A future maintainer probing this issue's docs gate can grep:

- `docs-grill-ready` in `docs/FIXEDFLOW.md` → must appear in dispatch policy + gate contract.
- `/grill-via-web` in `docs/FIXEDFLOW.md` → must be described as the only issue-grill entry.
- `Chinese SessionStart banner` in `docs/specs/2026-05-11-fixedflow-sessionstart-banner.zh.md` → must contain Section A (three capabilities).
- `两个 label 都必须存在` (or English equivalent) in `docs/HOW-TO-CLAIM-ISSUE.md`.

All four anchors live in committed docs of this PR.
