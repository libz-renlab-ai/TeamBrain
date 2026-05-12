```text
   ┌──────────────────────────────────────────────────────────────────────┐
   │ iter-1 fix-plan — PR #353, post /review adversarial pass            │
   │                                                                      │
   │   findings ──▶ fixes ──▶ updated judge harness ──▶ re-run /review    │
   │   (5 HIGH    (drop path  (P3 regex, P6 sort-diff,                    │
   │   /MED)      b, 24h-ack,  expected.json split)                       │
   │              PRE-IMPL doc)                                           │
   └──────────────────────────────────────────────────────────────────────┘
```

# iter-1 fix-plan — PR #353

## (1) Task description / 这一轮 fix 要做什么

Adversarial /review subagent surfaced 5 substantive findings (3 HIGH, 2 MED) against the v1 PR. This fix-plan addresses them in-place on the same branch (`worktree-issue-349+pr-1`) per `docs/PR-PLAN.md` (no follow-up PR / no follow-up issue).

### Findings being fixed in this iter

| # | severity | summary | fix |
|---|----------|---------|-----|
| F1 | HIGH 8/10 | Griefing vector — rule lets any maintainer takeover stranger's open in-flight issue with 3 sentences, no ack / no ghost-timer | Tighten path (a): takeover requires **either** previous claimant's explicit ack reply, **or** ≥ 24h since their last comment / commit on the issue. Add evidence requirement: the takeover comment must paste `gh issue view <N> --json updatedAt,comments` proof of the 24h gap. |
| F2 | HIGH 8/10 | `grill-working` label description references `PRE-IMPLEMENT-CLAIM.md` which doesn't exist; new section repurposes label for human takeover (driver mutex collision) | Backfill `docs/PRE-IMPLEMENT-CLAIM.md` as the canonical claim-and-takeover contract (the natural home for the label semantics). Update FIXEDFLOW §`Taking over...` to point at it. Keep one label but document **both** semantics (driver mutex AND human takeover) so future `gh issue list --label grill-working` consumers know to treat both. |
| F3 | HIGH 9/10 | Path (b) of takeover (hand-close non-conforming issue) lets maintainer add `grill-working` to never-grilled issue — collides with POSTMORTEM hard rule #6 (retroactive-labeling ban) | **Drop path (b) entirely** from the takeover section. Hand-close of non-conforming issues stays with the conformance Action (`.github/workflows/issue-conformance.yml`); maintainers who want to close early just `gh issue close --reason "not planned"` without slapping a tag. Path (c) (taking over an in-progress claim) remains; path (a) (taking over an unattended grill-ready issue) tightens per F1. |
| F4 | HIGH 9/10 | judge.md P6 (`gh label list \| wc -l == 18`) breaks if any unrelated org-wide label is added, and doesn't actually prove this PR added no label | Replace P6 with sorted-name diff: dump `gh label list --json name --jq '.[].name' \| sort` to `evidence/labels.observed.txt`, pin a frozen `evidence/labels.baseline.txt`, V3 verdict = empty `diff baseline.txt observed.txt`. |
| F5 | MED 7/10 | judge.md P3 fragile to whitespace (`grep -Fc` exact ASCII) | Replace with tolerant regex: `grep -cE '我来负责\\s*grill-with-docs\\s*/\\s*grill-via-web' docs/FIXEDFLOW.md`. |
| F6 | MED 7/10 | judge.md V3 reads judge.json which already contains expected values → LLM is rubber-stamping V2's arithmetic | Split judge.json into `judge.json` (observed-only) + `expected.json` (pinned thresholds); V3 prompt is rewritten to compare the two and re-run greps itself, not read pre-computed verdict fields. |

### Out of scope (deferred to follow-up issues, **not** this iter)

| # | severity | summary | reason for deferral |
|---|----------|---------|---------------------|
| F7 | MED 6/10 | No TTL on `grill-working` → labels can rot on abandoned issues forever | Requires `.github/workflows/issue-conformance.yml` change (new auto-remove cron); out of doc-only scope per v1 plan. Logged as follow-up in updated plan.md §Out-of-scope. |
| F8 | LOW 6/10 | Missing trivial-fix escape hatch (a 5-line typo fix to a doc still requires 3-sentence ritual) | Design call (carve-out for ≤ 20 LOC trivial fixes vs strict ritual). Logged as follow-up. |
| F9 | LOW 5/10 | SessionStart banner spec not cross-referenced | One-line cross-reference is mechanical; addressed in this iter as a freebie. |

## (2) Expected outputs after iter-1

| # | file | expected state |
|---|------|---------------|
| 1 | `docs/FIXEDFLOW.md` §`Taking over...` | path (b) removed; path (a) tightened with 24h-or-ack + evidence requirement; cross-references to `docs/PRE-IMPLEMENT-CLAIM.md` and `docs/specs/2026-05-11-fixedflow-sessionstart-banner.zh.md` added |
| 2 | `docs/PRE-IMPLEMENT-CLAIM.md` | new file, ≤ 80 lines, canonical claim-and-takeover contract (both driver mutex and human takeover semantics for `grill-working` label) |
| 3 | `docs/HOW-TO-CLAIM-ISSUE.md` | pointer updated to also reference `docs/PRE-IMPLEMENT-CLAIM.md` |
| 4 | `docs/plans/2026-05-12-issue-349/judge.md` | P3 tolerant regex; P6 replaced with sorted-name diff; V3 rewritten to consume separate `expected.json` + re-run greps |
| 5 | `docs/plans/2026-05-12-issue-349/evidence/{judge.json, expected.json, labels.baseline.txt, labels.observed.txt, ...}` | regenerated; old `evidence/P6.txt` raw `gh label list` dump replaced |
| 6 | `docs/plans/2026-05-12-issue-349/plan.md` | Out-of-scope table extended with F7/F8 follow-up items |

## (3) How to verify (judge harness round 2)

After all edits land, the **same** `judge.md` playbook runs but now with stricter probes (V1+V2+V3). Specifically:

- P1, P2, P3, P4, P5 stay grep-style but P3 uses tolerant regex now.
- P6 becomes a `diff` against pinned baseline (empty diff = PASS).
- P7 new: `grep -c "PRE-IMPLEMENT-CLAIM.md" docs/FIXEDFLOW.md` ≥ 1 (path-b removal verified by F3 done correctly).
- P8 new: `[ -f docs/PRE-IMPLEMENT-CLAIM.md ]` exit 0 + `wc -l < docs/PRE-IMPLEMENT-CLAIM.md` ≥ 30.
- P9 new: `grep -cE '24h|ack' docs/FIXEDFLOW.md` ≥ 1 (F1 takeover-gate verified present).

V3 LLM prompt rewritten: only reads `evidence/judge.json` (observed-only) + `evidence/expected.json` (pinned), re-runs the V1 greps as tool calls, writes its own PASS/FAIL per probe.

After re-run, harness must show **all 9 probes PASS**.
