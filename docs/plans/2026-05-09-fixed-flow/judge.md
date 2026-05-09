```
   judge harness — third-party evaluator, MAIN agent dispatches, LLM-as-judge reads JSON

   §V1 RUN ──→ 4 probes               §V2 DUMP ──→ judge.json (7 booleans)   §V3 READ ──→ PASS/FAIL/SKIP
   ─────────                          ───────────                            ──────────
   probe A: claudefast probe          metrics.claudefast_5_steps_present     7-anchor gate
   probe B: codex probe               metrics.codex_5_steps_present
   probe C: watcher --dry-run         metrics.claudefast_codex_hardmatch
   probe D: tmux /export              metrics.no_canned_answer_in_claude_md
                                      metrics.no_canned_answer_in_agents_md
                                      metrics.watcher_dry_run_ok
                                      metrics.tmux_export_present
```

# Judge Playbook: FIXEDFLOW Verification

> Md playbook (NOT a fixed bash script) per `docs/HOWTO-PLAN-PR.md` § 3b
> and PR-PLAN.md § ③ rule: "third-party judge harness forbidden fixed
> scripts; MUST use md playbook."

## Origin

- Plan slug: `2026-05-09-fixed-flow`
- Target feature: `docs/FIXEDFLOW.md` workflow lockdown
- Status: **ACTIVE** — runnable from clean main worktree once Phase 1b lands

## §V1 RUN

MAIN agent dispatches the following commands; capture output to
`evidence_dir = .judge/<run_id>/` (run_id = ISO date + short hash, e.g.
`.judge/2026-05-09-abc123/`).

### Probe A — claudefast semantic probe

Prompt:

```
Read docs/FIXEDFLOW.md (full content) and explain the TeamBrain FIXEDFLOW
workflow. Your answer MUST contain:
- All 5 step labels: (1) <50 word issue, (2) grill paste + grill-ready label,
  (3) worktree implement, (4) /review loop, (5) PR + squash-merge
- Manual-vs-auto split: steps 1+2 manual; steps 3-5 auto
- The refusal mechanism: non-conformant issues are auto-closed
- The bypass mechanism: bypass-fixed-flow admin label
```

Command:

```
claudefast -p "$(printf '%s\n\n%s' "$(cat <<'PROMPT'
Read docs/FIXEDFLOW.md (full content) and explain the TeamBrain FIXEDFLOW
workflow. Your answer MUST contain:
- All 5 step labels: (1) <50 word issue, (2) grill paste + grill-ready label,
  (3) worktree implement, (4) /review loop, (5) PR + squash-merge
- Manual-vs-auto split: steps 1+2 manual; steps 3-5 auto
- The refusal mechanism: non-conformant issues are auto-closed
- The bypass mechanism: bypass-fixed-flow admin label
PROMPT
)" "$(cat docs/FIXEDFLOW.md)")" \
  > .judge/<run_id>/probe-claudefast.txt 2>&1
```

Allow up to 3 retries if output lacks any of the 5 step labels.

### Probe B — codex hard-match probe

```
codex exec --skip-git-repo-check -s read-only "$(printf '%s\n\n%s' \
  "Read the following docs/FIXEDFLOW.md and explain the TeamBrain FIXEDFLOW
   workflow with all 5 step labels and manual-vs-auto split:" \
  "$(cat docs/FIXEDFLOW.md)")" \
  > .judge/<run_id>/probe-codex.txt 2>&1
```

### Probe C — watcher dry-run (only after Phase 4a lands)

```
bash scripts/fixed-flow-watcher.sh --dry-run --issue 999 \
  > .judge/<run_id>/dry-run.txt 2>&1
```

Expected stdout contains: `[DRY] would invoke mainpi for issue 999`.

If Phase 4a has NOT yet landed, mark this probe SKIP in §V2 metrics and
record the gating reason in `evidence_dir/notes.txt`.

### Probe D — tmux interactive /export (only after Phase 4d lands)

In tmux session:

```
claudefast
> Read docs/FIXEDFLOW.md and explain FIXEDFLOW.
> /export .judge/<run_id>/tmux-export.jsonl
> /quit
```

Expected: `tmux-export.jsonl` exists and contains a `prompt` event with the
FIXEDFLOW question and a `response` event referencing the doc.

If Phase 4d has NOT yet landed, mark this probe SKIP in §V2 metrics with
gating reason.

### Probe E (negative anchors) — grep CLAUDE.md and AGENTS.md

```
grep -c "FIXEDFLOW" CLAUDE.md > .judge/<run_id>/claude-md-fixedflow-count.txt
grep -c "FIXEDFLOW" AGENTS.md > .judge/<run_id>/agents-md-fixedflow-count.txt 2>/dev/null || echo 0 > .judge/<run_id>/agents-md-fixedflow-count.txt
grep -i "canned.answer\|TEAMAGENT:START\|FIXEDFLOW:START" CLAUDE.md AGENTS.md > .judge/<run_id>/no-canned-block.txt 2>&1 || true
```

CLAUDE.md should have ≤ 2 references (link line only). AGENTS.md (project
root) should have ≤ 2 (or 0 if project AGENTS.md is purely a `@AGENTS.md`
shim). User-level `~/.claude/CLAUDE.md` and `/Users/m1/projects/AGENTS.md`
must NOT contain the literal `FIXEDFLOW` token (negative-touch rule).

## §V2 DUMP

Write `.judge/<run_id>/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "claudefast_5_steps_present": true,
    "codex_5_steps_present": true,
    "claudefast_codex_hardmatch": true,
    "no_canned_answer_in_claude_md": true,
    "no_canned_answer_in_agents_md": true,
    "watcher_dry_run_ok": true,
    "tmux_export_present": true
  },
  "evidence_dir": ".judge/<run_id>",
  "stdout_path": ".judge/<run_id>/probe-claudefast.txt",
  "feature_status": "active",
  "phase_gates_skipped": []
}
```

If a phase gate (Phase 4a or 4d) hasn't landed yet, set the corresponding
metric to `null` (NOT `false`) and add the probe name to
`phase_gates_skipped`.

## §V3 READ

Dispatch judge LLM:

```
claudefast -p "$(cat <<'PROMPT'
You are a third-party judge for the FIXEDFLOW verification harness. Read
ONLY the files at .judge/<run_id>/judge.json plus the evidence files it
references. Do NOT read any other source code or docs.

Emit one of: PASS / FAIL / SKIP.

PASS criteria — all 7 anchors must be true (or null + phase_gates_skipped
notes):
1. claudefast_5_steps_present: probe-claudefast.txt mentions all 5 step
   labels (issue / grill / worktree / review / merge).
2. codex_5_steps_present: probe-codex.txt mentions the same 5 step labels.
3. claudefast_codex_hardmatch: both probes produce semantically equivalent
   step descriptions; minor wording diffs allowed, but step COUNT and
   step ORDER must match.
4. no_canned_answer_in_claude_md: claude-md-fixedflow-count.txt is ≤ 2
   (link reference only) AND no-canned-block.txt does NOT show a
   FIXEDFLOW:START marker block.
5. no_canned_answer_in_agents_md: agents-md-fixedflow-count.txt is 0 OR
   ≤ 2 (only if a project-local rule line exists; user-level files must
   show 0).
6. watcher_dry_run_ok: dry-run.txt contains `[DRY] would invoke mainpi
   for issue 999`. (SKIP if Phase 4a not landed.)
7. tmux_export_present: tmux-export.jsonl exists and contains a prompt
   event mentioning FIXEDFLOW. (SKIP if Phase 4d not landed.)

FAIL criteria: any of the 7 anchors above is false (not null).
SKIP criteria: feature deleted (docs/FIXEDFLOW.md removed) OR all 4 active
probes returned null due to phase gates.
PROMPT
)" \
  > .judge/<run_id>/verdict.txt
```

## Notes

- This playbook is dispatched by the MAIN agent (not by a CI runner), but
  could be migrated to `.github/workflows/fixedflow-verify.yml` in Phase
  2 future. Keep the §V1/V2/V3 structure stable so the migration is a
  shell-shape swap rather than a logic rewrite.
- Probe A and B intentionally embed the FULL `docs/FIXEDFLOW.md` content
  in the prompt rather than relying on the model's training-data memory
  or its tools to read the file. This keeps the harness deterministic.
- The negative anchors (4, 5) protect ADR-0007's no-canned-answer-block
  invariant. Adding a FIXEDFLOW canned block to CLAUDE.md or AGENTS.md
  in the future will fail this judge — by design.
- This file is ≤ 200 lines per project rule.
