```
   .__   ._.  ._.   .  .__   .  .  .__         .__   ._.  .__   .  .
   |__]  |   |__|   |\ |__]  |  |  |__|        |__]  |   |__|   |\ |
   |     |__ |  |   | \|     `--`  |  |        |     |__ |  |   | \|
                                                                    
       Issue #289 plan — research(codex-hooks): registry + parity   
       Three-segment plan per docs/PLAN-RESEARCH-REPORT.md          
       (1) task description (2) expected outputs (3) judge harness  
```

# Plan — issue #289 — research(codex-hooks): map Codex hook registry format + event parity

Project rule: this file follows the **three-segment铁律** from `docs/PLAN-RESEARCH-REPORT.md` and CLAUDE.md (`task description` / `expected outputs` / `how-to-eval-from-3rd-party-harness that outputs a ton of JSON and let LLM-judge it`). It is **not** a context-fetch script.

Research evidence: `./research.md` (committed in the same PR).
Judge harness playbook: `./judge.md` (committed in the same PR).
Closes: GitHub issue #289 (sub-issue of epic #271).

---

## (1) Task description

### What we are doing

Author a single feature spec doc — `docs/features/codex-hooks-spec.md` — that documents Codex CLI's lifecycle hook surface (registry format, supported events, payload diffs vs Claude Agent SDK), and append a parity table draft to `docs/features/hooks-status.md` (the existing project-level Claude hook canonical reference) so issue #293's docs-only follow-up can land directly on top of it.

This is a **pure research + documentation** task. Zero TypeScript / no installer wiring / no test wiring / no Codex hook actually executes inside this repo as a result of this PR.

### How we are doing it

- Use only **OpenAI official sources** plus the live regression issue from `openai/codex` GitHub. No paraphrasing event names from training memory; every event name + field name + key is traceable to a verbatim quote in `./research.md`.
- For everything Codex docs do **not** cover (plugin manifest hook bundling, requirements.toml admin enforcement, agent/prompt handler types, `updatedInput` mutation, etc.) we mark `unknown` rather than guess. This is acceptance criterion 3 of #289 (*"No claims of parity for events Codex does not actually fire"*).
- Each Claude event from `docs/features/hooks-status.md` § "Channel-by-channel" gets one row in the parity table; events Codex lacks (`PreCompact`, `SessionEnd`, `SubagentStop`, `Notification`) are marked `absent` with no fake symmetry.
- Atomic commits per file edit per CLAUDE.md `docs/COMMIT-FLOW.md`.
- Normal PR (not draft) targeting `main`. `/review` loop until PASS per ADR-0007. Squash-merge per CLAUDE.md memory `feedback_squash_only_merge.md`. POSTPR cleanup per `docs/POSTPR.md`.

### What we are explicitly NOT doing

- Not implementing `.codex/config.toml` or `.codex/hooks.json` for this repo (that is sub-issue **#290** `feat(.codex): commit project-level Codex hook config + adapters`).
- Not changing `teamagent init` or `installHook()` (sub-issue **#291**).
- Not adding install idempotency tests (sub-issue **#292**).
- Not extending the Claude parity table beyond the **draft** added to `hooks-status.md`; final integration of the parity table into the canonical Claude lifecycle ASCII diagram is sub-issue **#293**.
- Not reading `codex-rs/` source on github.com/openai/codex — for #289 we constrain to the public docs surface, then mark anything missing as `unknown`. The next sub-issue (#290) can read source to resolve `unknown`s when actually wiring.
- Not regrilling issue #289. Per FIXEDFLOW the issue lacks `grill-ready` label and is 134 words (>50), but its acceptance criteria (3 bullets, 2 expected output files, 1 source-of-truth doc) are crisp enough that a maintainer judgment call is to proceed manually rather than burn a `/grill-with-docs` cycle on what is already a well-scoped research stub.

---

## (2) Expected outputs

| # | Path | Kind | Acceptance |
|---|------|------|------------|
| 1 | `docs/features/codex-hooks-spec.md` | NEW file | Lists 10 events = 8 Claude events from `hooks-status.md` (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`, `SessionEnd`, `SubagentStop`/`Notification` split into two rows) + Codex's `PermissionRequest`. Each row has `supported \| absent \| unknown` verdict for Codex; each `supported` row documents stdin shape vs Claude. ASCII art header. ≥1 verbatim TOML snippet from S4 + ≥1 from-S6 hooks.json snippet. Cites all 6 research URLs. |
| 2 | `docs/features/hooks-status.md` | UPDATE (append section) | A new "## Codex hook parity (research draft, issue #289)" section appended to the existing file, with a parity table whose schema mirrors the existing "Channel-by-channel" structure. Marked DRAFT. Links back to `docs/features/codex-hooks-spec.md`. Does NOT touch any existing Claude content. |
| 3 | `docs/plans/2026-05-12-issue-289-codex-hooks-spec/research.md` | NEW file | Already committed (raw evidence). |
| 4 | `docs/plans/2026-05-12-issue-289-codex-hooks-spec/plan.md` | NEW file | This file. |
| 5 | `docs/plans/2026-05-12-issue-289-codex-hooks-spec/judge.md` | NEW file | Third-party judge harness playbook (next section). |
| 6 | `docs/plans/2026-05-12-issue-289-codex-hooks-spec/report.md` | NEW file (after merge) | Completion report per project rule §9. |
| 7 | Normal PR titled `research(codex-hooks): document Codex hook registry + Claude parity (#289)` | GitHub PR | Closes #289. Body links to plan + judge + research. NOT draft. |
| 8 | `/review` PASS verdict on the PR branch | gate | Per ADR-0007. |
| 9 | `gh pr merge <N> --squash --delete-branch` success | merge | Per memory `feedback_squash_only_merge.md`. |

**Counts (deterministic) the judge will measure**:

- Codex-supported event rows in `codex-hooks-spec.md`: **6** (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`)
- Codex-absent event rows: **4** (`PreCompact`, `SessionEnd`, `SubagentStop`, `Notification`)
- Codex-unique events with no Claude analog: **1** (`PermissionRequest`)
- Verbatim source snippets: **≥2** (S4 TOML + S6 hooks.json)
- Source URLs cited: **6** (matches research.md S1–S6)
- "unknown" markers honestly placed: **≥3** (plugin manifest, admin requirements.toml, agent/prompt handler types) — justifies acceptance criterion #3

---

## (3) How-to-eval from 3rd-party harness that outputs a ton of JSON and let LLM-judge it

Per CLAUDE.md memory `feedback_judge_harness_md_playbook.md`: the judge harness is a `judge.md` playbook the MAIN agent dispatches via subagents or `claudefast -p` probes — NOT a `scripts/*.sh` file. Per memory `feedback_verification_only_judge_harness.md`: do not list unit / contract / pipeline tests as verification.

Full playbook: `./judge.md` (next commit).

In summary, judge dispatches three independent probes, each returning structured JSON, and a final LLM-judge reads only the raw JSON to render PASS / FAIL:

### Probe A — `codex-hooks-spec.md` structural anchors

- Subagent (Explore type) reads `docs/features/codex-hooks-spec.md`
- Outputs `{event_table_rows: int, supported_count: int, absent_count: int, unknown_markers: int, verbatim_snippets: int, source_urls_cited: int, ascii_art_header: bool, links_to_research: bool}`
- Threshold: `event_table_rows>=10 && supported_count==6 && absent_count==4 && unknown_markers>=3 && verbatim_snippets>=2 && source_urls_cited==6 && ascii_art_header && links_to_research`

### Probe B — `hooks-status.md` parity-draft anchors

- Subagent reads `docs/features/hooks-status.md`
- Outputs `{section_added: bool, draft_marker_present: bool, parity_table_rows: int, links_to_spec: bool, claude_section_unchanged: bool}`
- Threshold: `section_added && draft_marker_present && parity_table_rows>=6 && links_to_spec && claude_section_unchanged`

### Probe C — false-parity refusal

- Subagent does targeted grep: `grep -nE 'PreCompact|SessionEnd|SubagentStop|Notification' docs/features/codex-hooks-spec.md` and verifies each occurrence is on a row labeled `absent`, NOT a row labeled `supported` or `parity` or `equivalent`.
- Outputs `{forbidden_events_found: [str], all_absent_labeled: bool}`
- Threshold: `all_absent_labeled == true`

### Final verdict

A separate LLM judge (subagent type `general-purpose`) reads ONLY the three probe JSON blobs (no source files, no spec content) and renders PASS / FAIL with a one-paragraph rationale. The judge is forbidden from running the probes itself. This satisfies the rule's "third-party" + "LLM only reads raw JSON" constraints.

If any probe FAIL → the spec / parity-draft is rewritten and the judge re-dispatched. Loop until PASS before opening the PR.

---

## Out-of-scope items + sibling issues

- `#290` — `feat(.codex): commit project-level Codex hook config + adapters` — the actual implementation that wires this spec into TeamAgent's project-level `.codex/`.
- `#291` — `feat(install-hook): parameterize for Codex target + wire teamagent init --target=codex/both` — `teamagent init` integration.
- `#292` — `test(install-hook): Codex install idempotency + non-destruction` — installer test coverage.
- `#293` — `docs(hooks-status): document Claude vs Codex hook parity` — final integration of the parity table into the canonical Claude diagram.
- `#271` — parent epic.

The spec under #289 is intentionally a **standalone research artifact**. None of the sibling sub-issues should block #289's merge; #289 unblocks the rest by giving them a single source of truth to reference.

---

## Risks + mitigations

| Risk | Mitigation |
|------|------------|
| Codex docs diverge between fetch date and merge date | Each fetch URL + a fetch date stamp baked into `research.md`; spec sources both URL + the verbatim snippet so future readers can compare |
| Issue #21639 regression invalidates the spec | Spec explicitly cites #21639 and notes "documented behavior; observably broken on Codex Desktop 0.129.0-alpha.15" — readers will not assume hooks "just work" |
| Claude protocol drift makes parity table stale | Parity rows reference both `packages/types/src/hook-protocol.ts` symbol names AND the official Claude docs surface — drift in either direction triggers a doc update via `docs/features/hooks-status.md` |
| Sibling issue authors invent fields not in spec | The spec has explicit `unknown` markers; the rule for #290–#293 authors is "if it's `unknown` here, resolve via codex-rs source AND update this spec, do not silently invent" |

---

## Done definition

1. All 6 expected output files present (research / plan / judge already committed; spec + hooks-status update + report still to come).
2. Judge harness PASSes (3 probes + LLM verdict).
3. `/review` PASSes per ADR-0007.
4. Normal PR opened (not draft), squash-merged with `--delete-branch`, branch removed both locally and on remote.
5. POSTPR cleanup per `docs/POSTPR.md`: ExitWorktree(remove), git pull --ff-only on parent.
6. `report.md` written and committed in the same merge OR as a separate atomic follow-up commit before merge.
