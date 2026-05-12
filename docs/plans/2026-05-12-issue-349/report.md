```text
   ┌──────────────────────────────────────────────────────────────────────┐
   │ report.md — issue #349 / PR #353 post-merge execution report         │
   │                                                                      │
   │   plan ──▶ implement ──▶ /review (3 iters) ──▶ rebase 3× ──▶ merge   │
   │           (6 atomic                                                  │
   │            doc-only commits)                                         │
   └──────────────────────────────────────────────────────────────────────┘
```

# report.md — issue #349 / PR #353

## What shipped

PR #353 squash-merged into `main`. Two doc deltas + one new canonical doc + supporting plan/research/judge/evidence:

1. **`docs/FIXEDFLOW.md`** — new section `§ Taking over someone else's grill-ready issue — pre-comment + label contract` slots between `§ Preempted by an existing PR — 2-outcome contract` and `§ 步骤负责人分界`. Scopes takeover strictly to (a) unattended grill-ready and (b) stale in-progress claim — both gated on **≥ 24h ghost-timer OR explicit ack with pasted evidence**. Explicit "not in scope: hand-close non-conforming issues" disclaimer per `docs/POSTMORTEM.md` hard rule #6 (retroactive-labeling ban). Cross-references `docs/PRE-IMPLEMENT-CLAIM.md` and `docs/specs/2026-05-11-fixedflow-sessionstart-banner.zh.md`. Footnote in `§ 与既有规则的关系`.

2. **`docs/HOW-TO-CLAIM-ISSUE.md`** — 4-line pointer after the two-label-gate paragraph, routing non-reporter claimants to the new FIXEDFLOW section + `docs/PRE-IMPLEMENT-CLAIM.md`. Explicit "hand-close not through here" disclaimer.

3. **`docs/PRE-IMPLEMENT-CLAIM.md`** — reconciled with PR #347's upstream driver-mutex contract via add/add merge: kept PR #347's 142-line driver-side content (TL;DR anchor, "为什么", "driver 在哪一步加 / 移除 label", "触发", "验证") and appended a new `§ Human takeover — when the claimant is not the original reporter (issue #349)` section (24h-or-ack gate + three Chinese declarations + `同一 label，两种来源` disambiguation table + Rollback + boundary disclaimers). Final length 209 lines.

4. **GitHub issue #349** tagged with `grill-working` label as the canonical "tracking tag" the user explicitly asked for, plus a takeover-style claim comment with the three Chinese declarations + host/branch annotations. Dogfooded the new rule on the issue that introduced it.

5. **`docs/plans/2026-05-12-issue-349/`** — `research.md` (FIXEDFLOW inventory + label catalog), `plan.md` (3-section task/outputs/judge plan + 5 out-of-scope follow-ups), `judge.md` (third-party verify harness V1/V2/V3, 9 probes), `2026-05-12-pr-353-iter-1-fix-plan.md` (post-iter-1 fix-plan), `evidence/` (raw judge outputs incl. pinned `labels.baseline.txt`).

## Process — `/review` 3 iterations, 3 rebases, 8 commits

`/review` loop ran three substantive rounds (Adversarial subagent per `/review` Step 5.7 found real findings each round). Boris-style atomic commits per `CLAUDE.md` COMMIT-FLOW anchor:

| commit | content |
|---|---|
| 1 | research + plan + judge for pre-comment + label contract |
| 2 | add pre-comment + grill-working label contract in FIXEDFLOW |
| 3 | wire HOW-TO-CLAIM-ISSUE.md to new takeover contract |
| 4 | seed judge.md V1+V2 evidence (6 probes PASS, no new label) |
| 5 | iter-1 — backfill PRE-IMPLEMENT-CLAIM + tighten takeover gate |
| 6 | iter-2 — harden judge harness, 9 probes + observed/expected split |
| 7 | iter-3 — scope P9 to §Taking over + make all V3 tool strings runnable |
| 8 | symmetry — human takeover also --remove-label grill-ready |
| 9 | refresh pinned labels baseline (upstream PR #357 added `grilling`) |

(9 commits squashed into one on merge per `docs/POSTPR.md`.)

### Review findings → fixes

**iter-1 (5 substantive)**:
- F1 HIGH 8/10 griefing vector → added 24h-ghost-timer-or-ack gate + evidence requirement.
- F2 HIGH 8/10 missing PRE-IMPLEMENT-CLAIM.md backfill → created the file (later reconciled with PR #347's parallel version on rebase).
- F3 HIGH 9/10 path (b) retroactive-labeling bypass → dropped hand-close path entirely.
- F4 HIGH 9/10 P6 tautological `wc -l == 18` → replaced with sorted-name diff against pinned baseline.
- F5 MED 7/10 P3 whitespace-fragile → tolerant POSIX-class regex.
- F6 MED 7/10 V3 rubber-stamping V2 → split `observed.json` (no expected fields) + `expected.json` (pinned thresholds), V3 prompt rewritten to require independent re-run of tool strings.
- F9 LOW 5/10 SessionStart banner cross-ref → added.

**iter-2 (4 findings — N1 mooted by upstream)**:
- N1 HIGH 8/10 PRE-IMPLEMENT-CLAIM.md "driver mutex programmatically applied" was fictional — **resolved by rebase**: PR #347 actually shipped the `--add-label grill-working` step in SKILL.md, so the previously-aspirational claim now matches landed code.
- N2 HIGH 7/10 P9 regex unscoped (matched preexisting `24h` mentions in FIXEDFLOW preamble) → P9 awk-scoped to the `§ Taking over` section only.
- N3 MED 6/10 V3 prompt told the LLM to re-run prose tool strings → all 9 `observed.json` `tool` fields rewritten as single runnable shell pipelines (P3 brace-group + awk, P6 process-substitution + diff + wc, P8 conditional file check).
- N4 LOW 4/10 letter-scheme overload — mooted by reconciliation with PR #347's content.

**iter-3 (1 non-blocking)**:
- Asymmetric `--remove-label grill-ready` behavior (driver did it atomically, human takeover didn't mention) → §Takeover 评论格式 now spells out both label edits, matching driver §1.

## Deviations from plan

| plan said | actual | reason |
|---|---|---|
| ≤ 35 line doc-only delta | ~620 line delta (incl. plan + research + judge + evidence + iter-1 fix-plan + reconciled PRE-IMPLEMENT-CLAIM.md merge) | iter-1 surfaced HIGH findings that required backfilling PRE-IMPLEMENT-CLAIM.md as a canonical contract (turned out to be parallel work to PR #347, reconciled on rebase). Plan correctly anticipated only the FIXEDFLOW edit; PRE-IMPLEMENT-CLAIM expansion is the consequence of reviewer-driven rigor, not scope creep. |
| Did not anticipate rebasing | rebased 3 times during the PR's lifetime (PRs #347, #352, #357 landed on main) | TeamBrain main is a fast-moving target; high-frequency rebases are normal under the "non-stacked, squash-only" workflow. Cost = ~10 min of conflict resolution each, value = simple linear history per repo policy. |

## Out-of-scope follow-ups (documented in plan.md §5)

Tagged but not opened as issues yet — left for maintainer to file when motivated:

- F7 — `grill-working` label TTL / auto-remove cron (touches `.github/workflows/issue-conformance.yml`).
- F8 — Trivial-fix (≤ 20 LOC single-file doc) escape hatch design.
- `issue-conformance.yml` strict pre-comment enforcement.
- Make the three Chinese declarations into a GitHub issue-comment template (repo-setting change).

## Verification status

Third-party judge harness `docs/plans/2026-05-12-issue-349/judge.md` produces 9 probes:

| probe | observed | expected | result |
|---|---|---|---|
| P1 | 2 | ≥ 1 | PASS |
| P2 | 8 | ≥ 1 | PASS |
| P3 min | 1 | ≥ 1 | PASS |
| P4 | 1 | ≥ 1 | PASS |
| P5 | 1 | ≥ 1 | PASS |
| P6 (label drift) | 0 | == 0 | PASS |
| P7 | 5 | ≥ 1 | PASS |
| P8 | 209 | ≥ 30 | PASS |
| P9 | 6 | ≥ 1 | PASS |

V3 LLM verdict path retained for post-merge auditor: `claudefast -p` reads `evidence/observed.json` + `evidence/expected.json` + independently re-runs every tool string from repo root, never reads source docs directly.

## Cleanup

- `gh pr merge 353 --squash --delete-branch` (canonical squash-only per `docs/POSTPR.md`).
- `ExitWorktree action="remove"` from this session.
- Back in parent checkout: `git pull --ff-only` to sync local `main`.
- Issue #349 closed automatically by the squash commit's `Closes #349` footer; `grill-working` label removed by maintainer per `docs/PRE-IMPLEMENT-CLAIM.md § Rollback` semantics.
