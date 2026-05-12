# plan.md — issue #343 PR-3: boss A4 report + reproducibility doc

> Docs-only PR. No code changes. Closes issue #343.

## ① Task description

### 做什么

1. **Boss A4 report** at `docs/reports/2026-05-12-issue-343-tb-token-cost-summary.md` — single-page-printable Chinese summary of the ablation result. Headline + numbers + 3 Q&A + 3 takeaways + 5-command reproducibility recipe + caveats.
2. **Reproducibility recipe** at `docs/features/cost-measurement.md` — engineering doc explaining how to re-run the ablation, JSON output shapes, scipy methodology rationale, how to extend the corpus.
3. **Update issue #343 on GitHub** — close the issue with a comment that links to the boss report + PR-1/PR-2/PR-3 trail.

### 为什么

Issue #343 was framed as "需要测量"（need to measure）— measurement framework + numbers landed in PR-1 + PR-2. PR-3 closes the loop with the boss-facing artifact + machine-redux operational doc. Without these, the PR-2 numbers are stranded in `docs/plans/.../evidence/` where the boss won't find them.

### 不在范围（anti-scope）

- ❌ Token-cost overlay UI / statusline component — the boss got their numeric answer; an overlay is product feature creep, not a #343 deliverable. If anyone wants a real-time cost meter they can file a fresh issue.
- ❌ Re-running the ablation with bigger N — burns more API budget for marginal statistical power gain at this stage; documented as known limitation for future ADR.
- ❌ New corpus design — same reason; PR-3 ships the *result*, not corpus v2.
- ❌ Touching any production code — PR-3 is docs only.

## ② Expected outputs

### 文档

- [ ] `docs/reports/2026-05-12-issue-343-tb-token-cost-summary.md` (boss-facing, Chinese, A4 single page)
- [ ] `docs/features/cost-measurement.md` (engineering-facing, reproducibility recipe)
- [ ] `docs/plans/2026-05-12-issue-343-pr3/plan.md` (this file)
- [ ] `docs/plans/2026-05-12-issue-343-pr3/judge.md` (PASS criteria — just markdown invariants)
- [ ] `CHANGELOG.md` `Unreleased > Added` entry referencing the new docs

### GitHub

- [ ] Open PR with title `docs(issue-343): boss A4 report + cost measurement recipe (PR-3/3, closes #343)`
- [ ] PR description: links to boss report + PR-1/PR-2 commits + ablation evidence
- [ ] `/review` PASS → `gh pr merge <N> --squash --delete-branch`
- [ ] Issue #343 auto-closes via "closes #343" in commit message, OR manual close with summary comment

### Negative outputs

- ✋ No `packages/*` changes
- ✋ No `scripts/*` changes
- ✋ No `.github/*` workflow changes
- ✋ Don't re-burn API budget — evidence/<run-id>/ already has the numbers

## ③ How-to-verify

### §V1 RUN

1. `pnpm -F @teamagent/benchmark typecheck` (no changes, should still pass)
2. No new vitest tests — docs only
3. Markdown lint sanity (eyeball or `markdownlint` if installed)
4. Verify cross-references resolve:
   - boss report references `docs/features/cost-measurement.md` (relative)
   - boss report references `docs/plans/2026-05-12-issue-343-pr2/evidence/20260512-1714-d50736b/` (relative)
   - cost-measurement.md references `docs/verify/E2E-LEARNING.md` (already exists)
   - cost-measurement.md references `scripts/ablation/ttest_l4.py` (sibling from #332, already merged)

### §V2 DUMP

No JSON dump — docs PR.

### §V3 READ

PASS iff:
- All 4 new/updated markdown files exist and pass markdown parsing
- No broken relative links in the boss report or cost-measurement.md
- CI green (only typecheck + smoke vitest will run for docs PR)
- PR body explicitly links the boss report + PR-1/PR-2 commits

## ④ claudefast probes

None. Docs-only PR.

## ⑤ 实施顺序

1. `docs(issue-343): boss A4 report + reproducibility recipe (PR-3/3, closes #343)` — single atomic commit (docs are coupled; splitting would just churn the PR).
2. Open PR, `/review` loop, squash-merge.
3. POSTPR cleanup.
4. Verify issue #343 auto-closed (or close manually with link to merged PR-3).
