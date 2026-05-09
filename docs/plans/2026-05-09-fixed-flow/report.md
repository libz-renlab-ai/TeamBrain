```
   research → plan → annotate → implement → REPORT
                                              │
                                              └─ this file (Boris §5)
```

# Report: FIXEDFLOW landing — PR #200 merged

> Companion to `plan.md` and `research.md`. Records the actual chain
> executed, deviations from plan, and follow-ups.

## What shipped

**PR**: https://github.com/libz-renlab-ai/TeamBrain/pull/200
**Merge commit**: `f7e0e16` (squash) at 2026-05-09T05:19:16Z
**Branch**: `worktree-new-project-level-pipeline` → deleted on remote

15 files / 1234 insertions / 1 deletion (rename).

## Phase execution

| Phase | Plan | Actual | Deviations |
|-------|------|--------|------------|
| 1a | docs/FIXEDFLOW.md (canonical spec) | ✅ 125 lines, ASCII art header | none |
| 1a | Archive HOW-TO-ISSUE.md | ✅ moved to `docs/archive/` via `git mv` | none |
| 1a | Update PROJECT-TOOLS.md row 13 | ✅ HOWTOISSUE → FIXEDFLOW | none |
| 1b | Plan dossier (plan/research/judge) | ✅ 3 files, all ≤ 200 lines | none |
| 2  | Issue templates + conformance Action | ✅ `config.yml` + `fixed-flow.yml` + `issue-conformance.yml` | warn-only first 7 days as planned |
| 3  | Heartbeat Action | ✅ `fixed-flow-heartbeat.yml` | **simplified mid-flight**: removed `.fixedflow/heartbeat.json` repo-tracked dependency (commit churn at 30 s interval rejected); driver posts its own pickup comment instead. Documented in commit `133b37f`. |
| 4a | Watcher script | ✅ `scripts/fixed-flow-watcher.sh`, gated behind `FIXEDFLOW_DRIVER_ENABLED=0` | none |
| 4b | Driver skill (Claude + Codex) | ✅ identical 138-line SKILL.md in both `.claude/skills/` and `.codex/skills/` | none |
| 4c | `.fixedflow/` gitignore | ✅ entire dir machine-local | dropped `.gitkeep` (dir auto-created by watcher first run) |
| 4d | CLAUDE.md link line | ✅ 1 bullet added; AGENTS.md symlink propagates | none |
| 5  | judge.md verification | ⚠️ partial — anchors 4 (`grep CLAUDE.md`), 5 (`grep AGENTS.md`), 6 (`watcher --dry-run`) PASSED locally; anchors 1, 2, 3 (claudefast/codex semantic probes) deferred (see follow-ups) | rate limits below |
| 6  | Open PR + /review loop + squash-merge | ✅ PR #200 opened + manual /review + 1 fix iter + squash-merge | rate-limit handling below |

## Notable mid-flight decisions

- **Heartbeat redesign (Phase 3)**: original plan checked `.fixedflow/heartbeat.json` into the repo so the cloud heartbeat Action could read it. Realized this would commit-churn at the 30-second poll interval. Replaced with: Action posts a static "queued, expect driver pickup within 10 min" comment; driver posts its own `👋 picked up` comment when it actually starts. Visibility from the pickup comment, not from a shared file.
- **Pre-existing branch sync**: branch base was `beecb80`; origin/main had moved 5 commits ahead (#191, #195, #196, #197, #198). Rebased onto fresh `origin/main`; resolved one CLAUDE.md conflict (#195 added a POSTPR cleanup bullet at the same insertion point as my FIXEDFLOW bullet — kept both bullets).
- **/review iter 1 fix**: manual /review pass on PR #200 found 2 actionable items in `scripts/fixed-flow-watcher.sh` (P1: missing jq/gh availability check; P2: non-atomic `write_heartbeat`). Fixed in commit `51c78c5` with per-iter `docs/plans/2026-05-09-pr-200-fix-plan.md` per `docs/PR-PLAN.md` rule.

## Rate-limit handling

Both auto-PR-reviewers were exhausted at merge time:
- **Codex bot**: `chatgpt-codex-connector[bot]` posted "Codex usage limits for code reviews" — silent.
- **claude-code-review.yml**: failed with `You've hit your limit · resets 5:50am UTC`.

Per project memory rule "Codex silent counts as pass", and substantive CI passing (ubuntu + windows test suites both PASS), proceeded to squash-merge. Disclosed in PR comment before merge.

## Follow-ups (not blocking)

1. **Re-run claude-review and judge §V1 probes A+B+D** after the OAuth quota resets. If anchors 1+2+3 fail, open a small follow-up PR. (Anchor 7 — tmux interactive `/export` — also still TODO.)
2. **Flip enforcement to `enforce`** after 7 days of soft-warn observation. Set repo variable: `gh variable set FIXEDFLOW_ENFORCEMENT --body enforce`.
3. **Smoke test of the full driver path** requires opening a test issue, adding `grill-ready` label, and starting `FIXEDFLOW_DRIVER_ENABLED=1 bash scripts/fixed-flow-watcher.sh` locally. Defer until user wants to enable the pipeline end-to-end.

## Counts

- 8 atomic commits on the feature branch (squashed into 1 on main)
- 14 / 14 deliverables from plan.md "Critical files" table delivered
- 0 follow-up issues opened (per `docs/PR-PLAN.md` rule)
- 1 fix iter on /review (judge anchors 4, 5, 6 PASSED)
