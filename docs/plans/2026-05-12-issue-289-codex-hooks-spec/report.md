```
  ____                          _   ___ ____   ___
 |  _ \ ___ _ __   ___  _ __  _| |_|__ \  _ \ / _ \
 | |_) / _ \ '_ \ / _ \| '__|/ _` |  / / |_) | (_) |
 |  _ <  __/ |_) | (_) | |  | (_| | / /|  _ < \__, |
 |_| \_\___| .__/ \___/|_|   \__,_|/____|_| \_\ /_/
           |_|                                      
   Issue #289 — research(codex-hooks) — completion report
   PR #340 — merged 2026-05-12 (squash)
```

# Report — issue #289 — research(codex-hooks): registry + parity

## What shipped

Five new files / one append-only update, 986 net insertions, 0 deletions against `origin/main`:

1. `docs/features/codex-hooks-spec.md` — 289-line canonical Codex hook surface spec (registry format, 10-event parity table, per-supported-event stdin shape vs Claude, output schema, operational caveats, 6 explicit `unknown` markers).
2. `docs/features/hooks-status.md` — 22-line append-only "## Codex hook parity (research draft, issue #289)" section with 9-row parity table. Pre-PR Claude content unchanged.
3. `docs/plans/2026-05-12-issue-289-codex-hooks-spec/research.md` — raw evidence + 6 source URLs (4 OpenAI docs pages + 2 GitHub issues).
4. `docs/plans/2026-05-12-issue-289-codex-hooks-spec/plan.md` — three-segment plan per `docs/PLAN-RESEARCH-REPORT.md`.
5. `docs/plans/2026-05-12-issue-289-codex-hooks-spec/judge.md` — judge harness MD playbook with 15 pinned thresholds across 3 Explore-subagent probes + 1 final LLM-judge.
6. This `report.md` (you are here).

## Acceptance vs #289 criteria

| Criterion | Status |
|-----------|--------|
| File exists, lists each event with `supported \| absent \| unknown` | ✅ 10-row events table in §4 — 6 supported, 4 absent, 1 Codex-unique |
| Each `supported` event documents stdin shape vs Claude equivalent | ✅ §5.1 common header + §5.2–§5.7 per-event subsections |
| No claims of parity for events Codex does not actually fire | ✅ Probe C verified all 4 absent events (`PreCompact`, `SessionEnd`, `SubagentStop`, `Notification`) are labeled `absent`; trust-gate, plugin manifest, agent/prompt handler types, `updatedInput`, multi-project flag scope, trust-marking CLI all marked `unknown` rather than guessed |
| Parity table draft to be merged into `docs/features/hooks-status.md` | ✅ 22 lines appended, 0 pre-PR lines modified, links forward to spec, marked DRAFT |

## Verification — judge harness (third-party, no LLM-as-judge inside trust boundary)

Per CLAUDE.md memories `feedback_judge_harness_md_playbook.md` + `feedback_verification_only_judge_harness.md`. Three Explore subagent probes (structural anchors, parity-draft anchors, false-parity refusal) emitted JSON; final `general-purpose` LLM judge read ONLY the three JSON blobs.

**Pre-fix verdict** (initial PR push): `PASS — 15/15 thresholds satisfied`.

**Post-fix self-check** (after rebase + /review corrections, via deterministic bash counters): all 15 thresholds still PASS. Detail table in the `/review` resolution comment on PR #340.

## What `/review` caught + how it was resolved

Three CRITICAL findings + five fixable INFORMATIONALs + five deliberately-skipped INFORMATIONALs. Full table in the PR #340 resolution comment. Headlines:

- **C1 (multi-specialist confirmed)** — `hooks-status.md` verdict was "6/9 Claude events have a Codex equivalent" but PermissionRequest is Codex-unique. Fixed to "5/8 Claude events" + total Codex-supported = 6. Would have shipped a wrong canonical figure to #293.
- **C2** — `codex-hooks-spec.md` cross-referenced "§6 Open questions" but Open Questions is §8. One-token fix; would have confused #290 / #291 readers.
- **C3 (adversarial)** — `judge.md` Pinned Threshold T15 contradicted its own judge-prompt verbiage. As written, T15 would FAIL every correctly-authored spec (because the events table legitimately lists the four absent events) — would have blocked the FIXEDFLOW judge loop forever for any future Codex hook PR that touched the spec.

## Stale-base catches (NOT a /review finding, but worth recording)

Two rebase + force-push-with-lease cycles during the PR's lifetime:

1. Initial push from a worktree branched at `36aa2968` showed deletions for PRs `076e37f` (#331 statusline) + `fdcc8a1` (#336 BEFORE-MERGE). Rebased before `/review` ran.
2. Mid-`/review`, two more PRs landed on main (`a0fe5ce5` ADR-0014 backfill, `2bae3a2f` issue-315 spike). Rebased again before the final squash-merge.

Both rebases were conflict-free (zero file overlap between my 5 deliverables and the in-flight PRs).

## Out-of-scope items (sibling-issue contracts unchanged)

- **#290** `feat(.codex): commit project-level Codex hook config + adapters` — owns the actual `.codex/config.toml` + `.codex/hooks.json` content + adapter shims that translate Codex stdin payloads into the Claude SDK shape `bin-pre-tool-use.cjs` expects. Spec §9 names them as the consumer.
- **#291** `feat(install-hook): parameterize for Codex target + wire teamagent init --target=codex/both` — `teamagent init` integration.
- **#292** `test(install-hook): Codex install idempotency + non-destruction`.
- **#293** `docs(hooks-status): document Claude vs Codex hook parity` — promotes the parity table draft from `hooks-status.md` (added by this PR) into the canonical Claude lifecycle ASCII diagram.

Spec §8 lists 6 `unknown` items that #290 / #291 / #293 implementers are contractually required to resolve via `codex-rs` source rather than silently invent.

## Risks + mitigations (post-merge)

| Risk | Mitigation |
|------|------------|
| Codex docs change before #290 lands | `research.md` pins fetch date 2026-05-12 + verbatim snippets — future readers can diff |
| Codex Desktop 0.129.0-alpha.15 regression breaks adopters who follow the spec | Spec §7.1 cites the open upstream issue (#21639) and instructs #290 to add a doctor probe |
| #293 author silently changes "5/8" back to "6/9" | C1 fix above + this report's anchor entry preserve the correct arithmetic; any future regression should re-trigger the same Probe B threshold |

## Follow-up backlog (deliberately deferred from /review)

| Item | Reason for deferral |
|------|---------------------|
| Split spec / research / judge > 200 lines | `docs/plans/` files in this repo routinely exceed 200 (existing max 566); `docs/features/` already has 2 files >200. Splitting would weaken SSOT cohesion. Tracked but not blocked on #289. |
| Tighten trust-gate language in spec §7.3 ("or at least warn" hedge) | This is a #290 implementation concern, not a #289 spec concern. |
| Add top-of-doc danger banner for Codex Desktop 0.129.0-alpha.15 regression | Adopters reading §7.1 are warned; promoting it forces a wider doc re-org. |
| Byte-equality contract for "verbatim" snippets | Judge-design improvement (not spec fix). |
| Expand `requirements.toml` clarification | Public Codex docs don't cover it; expanding invites hallucination — leave as `unknown` for #290. |

## Lessons for future Codex hook PRs

1. **Stale-base after EnterWorktree is real.** Two rebases in one PR is not a sign of churn, it's a sign that other parallel PRs are landing on main. Always `git diff merge-base..HEAD` (not `git diff origin/main`) when measuring "what did I actually change."
2. **Self-judge the judge harness.** The T15 contradiction (Pinned Thresholds vs judge-prompt verbiage) only surfaced under adversarial review. Two different judges reading the same MD playbook would have rendered opposite verdicts. For any future judge.md, dispatch a "judge-self-review" probe that diffs the threshold table against the prompt template.
3. **Multi-specialist agreement = strong signal.** The 6/9 → 5/8 fix was independently flagged by both maintainability AND adversarial subagents. When two fresh-context subagents agree on a finding, treat it as confidence-9+ even if individual confidences are mid-range.
4. **`unknown` is honest.** The spec ships with 6 explicit `unknown` markers (plugin manifest, requirements.toml, agent/prompt handler types, `updatedInput`, multi-project flag scope, trust-marking CLI). Sibling-issue implementers will hate it less than discovering they're wrong post-ship.

## Closes

GitHub issue #289 (TeamBrain repo). Epic #271 unchanged; siblings #290 / #291 / #292 / #293 unchanged and unblocked.
