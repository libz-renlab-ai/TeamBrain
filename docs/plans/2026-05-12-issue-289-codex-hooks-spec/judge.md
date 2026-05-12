```
   .__   ._.  ._.  .__   .__         .__  .__   .  .__   .__   ._.
   |__|  |   |__|  |__|  |__         |  | |__]  |  |__]  |__|  |
   |  |  |__ |  |  |     |__         |__| |  \  |  |  |  |  |  |__
                                                                    
       Judge harness — issue #289 Codex hooks spec PR              
       Third-party MD playbook (NOT scripts/*.sh)                  
       MAIN agent dispatches three Explore subagents, then         
       a final LLM judge reads only raw JSON to render PASS/FAIL   
```

# Judge harness — issue #289

This file is a **playbook the MAIN agent reads and dispatches**, per CLAUDE.md memories `feedback_judge_harness_md_playbook.md` and `feedback_verification_only_judge_harness.md`. It does NOT contain bash you `chmod +x` and run. Instead, MAIN spawns Explore subagents per the contracts below, collects their JSON, hands the JSON (and only the JSON) to an LLM-judge subagent, and renders the final PASS / FAIL.

`pnpm test` / `pnpm typecheck` / `pnpm verify` / Stop hook self-report are **NOT** part of this verification — they are inside the same trust boundary as the code being graded.

## Pinned thresholds (single source of truth)

The judge LLM uses ONLY these thresholds. No other criteria, no taste calls.

| ID | Probe | Threshold |
|----|-------|-----------|
| T1 | A.event_table_rows | `>= 10` |
| T2 | A.supported_count | `== 6` |
| T3 | A.absent_count | `== 4` |
| T4 | A.unknown_markers | `>= 3` |
| T5 | A.verbatim_snippets | `>= 2` |
| T6 | A.source_urls_cited | `== 6` |
| T7 | A.ascii_art_header | `== true` |
| T8 | A.links_to_research | `== true` |
| T9 | B.section_added | `== true` |
| T10 | B.draft_marker_present | `== true` |
| T11 | B.parity_table_rows | `>= 6` |
| T12 | B.links_to_spec | `== true` |
| T13 | B.claude_section_unchanged | `== true` |
| T14 | C.all_absent_labeled | `== true` |
| T15 | C.forbidden_events_found entries with `in_table==true` AND `row_status != "absent"` | count `== 0` |

PASS iff **all** thresholds satisfied. Any threshold fails → FAIL with one-line rationale per failed threshold.

---

## Probe A — `codex-hooks-spec.md` structural anchors

### Dispatch contract

MAIN agent spawns:

```
Agent({
  description: "Probe A — codex-hooks-spec structural anchors",
  subagent_type: "Explore",
  prompt: "<<see prompt below>>"
})
```

### Subagent prompt (paste verbatim)

> Read `/Users/m1/projects/TeamBrain/.claude/worktrees/issue-289-codex-hooks-spec/docs/features/codex-hooks-spec.md` (full file) and answer the following purely by counting the file's content. Do not answer from memory or knowledge of Codex; only count what is in the file.
>
> Return EXACTLY one JSON object with the schema:
>
> ```json
> {
>   "event_table_rows": <int>,
>   "supported_count": <int>,
>   "absent_count": <int>,
>   "unknown_markers": <int>,
>   "verbatim_snippets": <int>,
>   "source_urls_cited": <int>,
>   "ascii_art_header": <bool>,
>   "links_to_research": <bool>
> }
> ```
>
> Definitions:
>
> - `event_table_rows` = count of rows in the main events parity table (one row per event name, header row excluded).
> - `supported_count` = number of rows whose Codex column is exactly `supported` (case-sensitive).
> - `absent_count` = number of rows whose Codex column is exactly `absent`.
> - `unknown_markers` = number of literal `unknown` strings appearing anywhere in the file as a status marker (NOT inside a sentence like "is unknown to us").
> - `verbatim_snippets` = number of fenced ```toml or ```json code blocks that contain a top-level `[[hooks.` key (TOML) OR a top-level `"hooks":` key (JSON).
> - `source_urls_cited` = number of distinct URLs matching `https://developers.openai.com/codex/` OR `https://github.com/openai/codex/`.
> - `ascii_art_header` = `true` iff the file's first non-blank line is a fenced code block whose content is multi-line ASCII art (NOT prose).
> - `links_to_research` = `true` iff the file contains a markdown link or relative path reference to either `research.md` or `docs/plans/2026-05-12-issue-289-codex-hooks-spec/research.md`.
>
> Return ONLY the JSON. No prose.

### Persist as

`/tmp/judge-289/probe-a.json` (or any path the MAIN agent passes; use the `$CLAUDE_JOB_DIR` if set).

---

## Probe B — `hooks-status.md` parity-draft anchors

### Dispatch contract

```
Agent({
  description: "Probe B — hooks-status parity-draft anchors",
  subagent_type: "Explore",
  prompt: "<<see prompt below>>"
})
```

### Subagent prompt (paste verbatim)

> Read `/Users/m1/projects/TeamBrain/.claude/worktrees/issue-289-codex-hooks-spec/docs/features/hooks-status.md` AND `git show HEAD~5:docs/features/hooks-status.md` (the version before this PR). Compare and answer:
>
> Return EXACTLY one JSON object with the schema:
>
> ```json
> {
>   "section_added": <bool>,
>   "draft_marker_present": <bool>,
>   "parity_table_rows": <int>,
>   "links_to_spec": <bool>,
>   "claude_section_unchanged": <bool>
> }
> ```
>
> Definitions:
>
> - `section_added` = `true` iff the new file has a section heading whose text contains BOTH `Codex` AND `parity` (case-insensitive) AND that heading does NOT exist in the pre-PR file.
> - `draft_marker_present` = `true` iff that new section contains a literal `DRAFT` token OR `research draft` phrase OR an explicit reference to issue 289 marking the section as not-yet-canonical.
> - `parity_table_rows` = number of rows in any markdown table inside the new section (header row excluded).
> - `links_to_spec` = `true` iff the new section contains a markdown link or relative path to `codex-hooks-spec.md` (or `docs/features/codex-hooks-spec.md`).
> - `claude_section_unchanged` = `true` iff every line of the pre-PR file (verbatim) appears as an unchanged line in the new file. Insertions are allowed (we are appending); deletions and modifications are forbidden.
>
> Return ONLY the JSON. No prose.

### Persist as

`/tmp/judge-289/probe-b.json`.

---

## Probe C — false-parity refusal

### Dispatch contract

```
Agent({
  description: "Probe C — false-parity refusal grep",
  subagent_type: "Explore",
  prompt: "<<see prompt below>>"
})
```

### Subagent prompt (paste verbatim)

> Open `/Users/m1/projects/TeamBrain/.claude/worktrees/issue-289-codex-hooks-spec/docs/features/codex-hooks-spec.md`. Find every line that mentions any of these tokens (case-sensitive, whole word): `PreCompact`, `SessionEnd`, `SubagentStop`, `Notification`. For each match, locate the row of the events parity table that the mention belongs to (or note it is not inside the table).
>
> Return EXACTLY one JSON object with schema:
>
> ```json
> {
>   "forbidden_events_found": [
>     { "event": "<name>", "row_status": "<verbatim Codex column value>", "in_table": <bool> }
>   ],
>   "all_absent_labeled": <bool>
> }
> ```
>
> Definitions:
>
> - `forbidden_events_found` = list of all matches. Each entry includes the Codex-column value verbatim (e.g. `absent`, `supported`, `unknown`) for the row containing that event, OR `"prose"` if the mention is not inside a table.
> - `all_absent_labeled` = `true` iff every entry where `in_table == true` has `row_status == "absent"`. Mentions in prose (`in_table == false`) are allowed and do not affect this flag.
>
> Return ONLY the JSON. No prose.

### Persist as

`/tmp/judge-289/probe-c.json`.

---

## Final verdict — LLM judge

### Dispatch contract

After all three probes return JSON, MAIN spawns:

```
Agent({
  description: "Final verdict — LLM judge for #289",
  subagent_type: "general-purpose",
  prompt: "<<see prompt below — include the three JSON blobs verbatim>>"
})
```

### Judge prompt template

> You are the third-party judge for TeamBrain issue #289 (Codex hooks spec PR). You will see ONLY three JSON blobs. You may NOT read any source file, run any tool, or use any prior knowledge of Codex hooks. Apply the pinned thresholds from `docs/plans/2026-05-12-issue-289-codex-hooks-spec/judge.md` and render PASS or FAIL.
>
> Pinned thresholds (verbatim from judge.md §Pinned thresholds):
>
> - T1 A.event_table_rows >= 10
> - T2 A.supported_count == 6
> - T3 A.absent_count == 4
> - T4 A.unknown_markers >= 3
> - T5 A.verbatim_snippets >= 2
> - T6 A.source_urls_cited == 6
> - T7 A.ascii_art_header == true
> - T8 A.links_to_research == true
> - T9 B.section_added == true
> - T10 B.draft_marker_present == true
> - T11 B.parity_table_rows >= 6
> - T12 B.links_to_spec == true
> - T13 B.claude_section_unchanged == true
> - T14 C.all_absent_labeled == true
> - T15 C.forbidden_events_found.length where in_table==true and row_status!="absent" must be 0
>
> Probe A JSON:
> ```json
> <PASTE PROBE A JSON HERE>
> ```
>
> Probe B JSON:
> ```json
> <PASTE PROBE B JSON HERE>
> ```
>
> Probe C JSON:
> ```json
> <PASTE PROBE C JSON HERE>
> ```
>
> Return EXACTLY one JSON object with schema:
>
> ```json
> {
>   "verdict": "PASS" | "FAIL",
>   "failed_thresholds": [<list of threshold IDs that failed>],
>   "rationale": "<one paragraph, ≤120 words>"
> }
> ```
>
> Return ONLY the JSON. Do NOT add prose before or after.

### Behavior on FAIL

If `verdict == "FAIL"`:
1. Read `failed_thresholds` to determine which deliverable to fix (`A.*` → `codex-hooks-spec.md`; `B.*` → `hooks-status.md`; `C.*` → spec table relabeling).
2. Make atomic commit per fix per `docs/COMMIT-FLOW.md`.
3. Re-dispatch the failing probe(s) only (other probes' JSON can be reused unchanged).
4. Re-dispatch the LLM judge with refreshed JSON.
5. Loop until `verdict == "PASS"`. Then proceed to PR.

### Behavior on PASS

Persist the final judge JSON at `/tmp/judge-289/verdict.json` and quote the `rationale` line in both:
- the PR body (so reviewers see the verdict),
- `report.md` (post-merge).

---

## Why this satisfies the project rules

| Rule | Where it's satisfied |
|------|----------------------|
| `feedback_judge_harness_md_playbook.md` — judge harness is an MD playbook MAIN dispatches via subagents or `claudefast -p`, never `scripts/*.sh` | This file is `judge.md`; no `.sh` is checked in for #289 verification |
| `feedback_verification_only_judge_harness.md` — never list unit/contract/pipeline tests as verification | Pinned thresholds use only Probe A/B/C JSON; no `pnpm test` / `pnpm verify` referenced |
| `docs/PLAN-RESEARCH-REPORT.md` segment (3) — third-party judge harness that outputs a ton of JSON and lets LLM-judge it | Three JSON-emitting probes + one LLM judge that reads only the JSON, no source files |
| #289 acceptance #3 — "No claims of parity for events Codex does not actually fire" | Probe C explicitly checks the four absent events are labeled `absent`, not silently parity-claimed |
| CLAUDE.md `docs/COMMIT-FLOW.md` atomic commits | Each FAIL → fix is one commit per file, then re-dispatch |

---

## Extension hook for a `claudefast -p` future

If MAIN cannot afford three Explore subagent dispatches (e.g. running on a low-budget profile), each probe can degrade to a `claudefast -p` invocation passing the same prompt verbatim and capturing the JSON to `/tmp/judge-289/probe-X.json`. The judge step is identical. This is the **same** harness — only the dispatcher changes.
