```
   ┌──────────────────────────────────────────────────────────┐
   │  judge.md — 第三方 LLM-as-judge 验收 playbook           │
   │  scope: issue #189 fix verification                     │
   │                                                          │
   │  §V1 RUN  (fixed tool set)                              │
   │  §V2 DUMP (fixed JSON shape -> .judge/<run_id>/)        │
   │  §V3 READ (LLM judge reads raw, gives verdict)          │
   └──────────────────────────────────────────────────────────┘
```

# Judge Harness — issue #189 fix verification

This is the **third-party judge harness** for the issue #189 fix. The MAIN
agent dispatches each `§V<n>` section through subagents or `claudefast -p`
probes. **No fixed bash scripts.** Re-running a section is re-dispatching
this playbook, not editing a `.sh`.

The harness output goes to `.judge/<run_id>/`. After a run, an independent
LLM judge reads `judge.json` + raw evidence (NOT this playbook, NOT the
fix author's commentary) and emits a `PASS|FAIL` verdict.

---

## §V1 RUN — fixed tool set

The MAIN agent dispatches each tool below in parallel where possible. Each
tool's exit code + stdout + stderr is captured to `.judge/<run_id>/`.

### V1.1 Static checks
```bash
pnpm typecheck
```
- Records: exit_code → `judge.json::exit_codes.typecheck`, stdout → `evidence_dir/typecheck.stdout`.

### V1.2 Adapter unit test (P0-A coverage)
```bash
pnpm --filter @teamagent/adapters test -- --reporter=verbose xenova-rule-embedder
```
- Records: exit_code → `judge.json::exit_codes.adapters_test`, stdout → `evidence_dir/adapters-test.stdout`.

### V1.3 CLI unit test (P0-B + P0-C coverage)
```bash
pnpm --filter @teamagent/cli test -- --reporter=verbose bin-stop
```
- Records: exit_code → `judge.json::exit_codes.cli_test`, stdout → `evidence_dir/cli-test.stdout`.

### V1.4 Local reproducer (this machine)
Reproducer probe — block huggingface.co at network layer (via
`HF_ENDPOINT=http://192.0.2.1`, TEST-NET-1 blackhole) and fire a fake Stop
event. Pre-fix behavior: hangs forever, must SIGKILL. Post-fix behavior:
exits cleanly within `2 × TEAMAGENT_EMBEDDER_FETCH_TIMEOUT_MS`.

```bash
# 1. clear any pre-existing orphan
pkill -f 'teamagent/hooks' 2>/dev/null; true
find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'teamagent-stop-*.json' -delete 2>/dev/null; true

# 2. fake stop input
INPUT=$(mktemp -t fake-stop-input.XXXXXX.json)
cat > "$INPUT" <<JSON
{"session_id":"judge-189","cwd":"/tmp","transcript_path":"/tmp/nonexistent.jsonl","hook_event_name":"Stop"}
JSON

# 3. run with blackhole + short timeout
START=$(date +%s)
HF_ENDPOINT=http://192.0.2.1 \
TEAMAGENT_EMBEDDER_FETCH_TIMEOUT_MS=2000 \
TEAMAGENT_STOP_TIMEOUT_MS=20000 \
node ~/.teamagent/hooks/bin-stop.cjs < "$INPUT"
EXIT=$?
END=$(date +%s)
DUR=$(( END - START ))

# 4. check no orphans
sleep 2
ORPHAN=$(pgrep -f 'teamagent/hooks/bin-stop' | wc -l | tr -d ' ')
TMPLEFT=$(find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'teamagent-stop-*.json' 2>/dev/null | wc -l | tr -d ' ')

echo "REPRO_EXIT=$EXIT REPRO_DUR_SEC=$DUR ORPHAN_PROCS=$ORPHAN TMP_LEFT=$TMPLEFT"
```
- Records: `metrics.reproducer_exit_seconds`, `metrics.pgrep_after_repro`, `metrics.tmp_orphan_files`, raw → `evidence_dir/reproducer.stdout`.

### V1.5 PR /review verdict (POSTPR)
```bash
# Run /review skill on the diff
# Verdict captured from /review output
```
- Records: `metrics.review_findings_critical`, raw → `evidence_dir/review.md`.

### V1.6 Diff size sanity
```bash
git diff --stat origin/main...HEAD
```
- Records: `metrics.diff_files_changed`, `metrics.diff_lines_added`, `metrics.diff_lines_removed`.

---

## §V2 DUMP — fixed JSON shape

After all V1 sections complete, write `.judge/<run_id>/judge.json`:

```json
{
  "run_id": "<ISO timestamp + git short SHA>",
  "branch": "worktree-189",
  "commit": "<git rev-parse HEAD>",
  "exit_codes": {
    "typecheck": 0,
    "adapters_test": 0,
    "cli_test": 0,
    "reproducer": 0,
    "review": 0
  },
  "metrics": {
    "reproducer_exit_seconds": 1.7,
    "pgrep_after_repro": 0,
    "tmp_orphan_files": 0,
    "diff_files_changed": 5,
    "diff_lines_added": 80,
    "diff_lines_removed": 6,
    "review_findings_critical": 0,
    "review_findings_total": 0
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/stdout.log",
  "git_diff_path": ".judge/<run_id>/diff.patch"
}
```

Evidence files (raw, never summarized by harness):
- `typecheck.stdout`
- `adapters-test.stdout`
- `cli-test.stdout`
- `reproducer.stdout` (full output of V1.4 incl. timestamps)
- `review.md` (raw /review output)
- `diff.patch` (full diff vs origin/main)

---

## §V3 READ — LLM-as-judge

An independent LLM (not the fix author, not this skill, not the test code)
reads:

1. `.judge/<run_id>/judge.json`
2. ALL files in `evidence_dir/`
3. The original issue body (#189) for symptom shape

Then emits a verdict in this fixed structure:

```
VERDICT: PASS | FAIL | NEEDS_INVESTIGATION
REASON: <one sentence>
EVIDENCE_REF: <which evidence file(s) backed the verdict>
GAPS: <if NEEDS_INVESTIGATION, what's missing>
```

### PASS criteria (all must hold)
- `exit_codes.typecheck == 0`
- `exit_codes.adapters_test == 0`
- `exit_codes.cli_test == 0`
- `exit_codes.reproducer == 0` OR a non-zero exit that proves abort fired (e.g., explicit AbortError stack)
- `metrics.reproducer_exit_seconds < 5`
- `metrics.pgrep_after_repro == 0`
- `metrics.tmp_orphan_files == 0`
- `metrics.review_findings_critical == 0`

### FAIL criteria (any of these flips the verdict)
- Reproducer hangs > 30s (worse than pre-fix? unexpected)
- Tests crash / typecheck errors
- /review surfaces critical-tagged findings
- Orphan processes / tmp files left behind

### Forbidden judge behavior
- ❌ Reading source code to "verify the fix looks right" (judge is behavioral, not code-review)
- ❌ Trusting the fix author's PR description over `judge.json`
- ❌ Inventing metrics not in `judge.json`
- ❌ Letting `BLOCKED` mean PASS

---

## Re-running a section

If V1.4 reproducer fails: re-dispatch §V1.4 verbatim. Don't edit this file
to "make it work" — that's making the harness judge itself.

If V1.5 /review surfaces a critical finding: fix it, re-run §V1.5 (NOT
§V3 first), then re-do §V2 + §V3 with new run_id.

---

## Run history

| run_id | timestamp | verdict | notes |
|--------|-----------|---------|-------|
| (initial) | (pending) | (pending) | first end-to-end run after P0-A/B/C land |
