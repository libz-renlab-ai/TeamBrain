```
                          ┌────────────────────────────────┐
                          │  3rd-party Judge Harness        │
                          │  (issue #160 — graceful skip)   │
                          └────────────────────────────────┘
                                      │
            ┌─────────────┬───────────┼──────────┬─────────────┐
            ▼             ▼           ▼          ▼             ▼
          §V1 RUN       §V2 STATE   §V3 LOG    §V4 PROBE     §V5 READ
          (vitest)      (probe)     (probe)    (claudefast)  (LLM verdict)
            │             │           │          │             │
            └─► dump exit_code, metrics, evidence to .judge/issue-160/<id>/ ─┘
```

# Judge Harness — issue #160

Per `~/.claude/CLAUDE.md` testing-judge-harness rule: **don't let the code grade itself**. RUN fixed tools, DUMP raw JSON + evidence to disk, then have a fresh LLM READ only that raw JSON to make the call. The MAIN agent dispatches each section as a subagent or `claudefast -p` probe.

## Output schema (every section writes one of these)

```json
{
  "section": "V1|V2|V3|V4",
  "ok": true,
  "exit_code": 0,
  "metrics": { "...section-specific..." },
  "evidence_dir": ".judge/issue-160/<run_id>/<section>/",
  "stdout_path": ".judge/issue-160/<run_id>/<section>/stdout.txt",
  "stderr_path": ".judge/issue-160/<run_id>/<section>/stderr.txt"
}
```

`run_id = $(date +%s)`. Evidence files are raw, untruncated.

## §V1 RUN — vitest (existing tools)

```bash
RUN_ID=$(date +%s)
EVIDENCE=".judge/issue-160/$RUN_ID/V1"
mkdir -p "$EVIDENCE"

# Run only the warmup-touched test files. Full suite already proven by `pnpm test`.
pnpm exec vitest run \
  packages/cli/src/__tests__/warmup.test.ts \
  packages/cli/src/__tests__/warmup-state.test.ts \
  packages/cli/src/__tests__/warmup-state-integration.test.ts \
  --reporter=json --outputFile="$EVIDENCE/vitest.json" \
  >"$EVIDENCE/stdout.txt" 2>"$EVIDENCE/stderr.txt"
EC=$?

# Count: warmup.test.ts must have ≥5 tests (2 original + 3 new)
NEW_TESTS=$(jq '[.testResults[] | select(.name | contains("warmup.test.ts")) | .assertionResults[]] | length' "$EVIDENCE/vitest.json" 2>/dev/null || echo 0)
TOTAL=$(jq '.numTotalTests' "$EVIDENCE/vitest.json" 2>/dev/null || echo 0)
PASSED=$(jq '.numPassedTests' "$EVIDENCE/vitest.json" 2>/dev/null || echo 0)

cat > "$EVIDENCE/result.json" <<EOF
{
  "section": "V1",
  "ok": $([[ "$EC" -eq 0 && "$PASSED" -ge 27 && "$NEW_TESTS" -ge 5 ]] && echo true || echo false),
  "exit_code": $EC,
  "metrics": { "total": $TOTAL, "passed": $PASSED, "warmup_test_count": $NEW_TESTS },
  "evidence_dir": "$EVIDENCE",
  "stdout_path": "$EVIDENCE/stdout.txt",
  "stderr_path": "$EVIDENCE/stderr.txt"
}
EOF
cat "$EVIDENCE/result.json"
```

**PASS criteria.** `exit_code=0`, `passed≥27`, `warmup_test_count≥5`.

## §V2 RUN — state-file behavior (Node probe)

This probe loads `runWarmup` directly and inspects the state file it writes.

```bash
RUN_ID=$(date +%s)
EVIDENCE=".judge/issue-160/$RUN_ID/V2"
mkdir -p "$EVIDENCE"

# Compile if needed so the import resolves.
pnpm --filter @teamagent/cli build >/dev/null 2>"$EVIDENCE/build-stderr.txt" || true

cat > "$EVIDENCE/probe.mjs" <<'EOF'
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runWarmup } from "../../../packages/cli/dist/commands/warmup.js";
import { readWarmupState } from "../../../packages/cli/dist/warmup-state.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "judge-v2-"));
const out = { skip_path: null, normal_path: null };

// Skip path
{
  const stateFile = path.join(tmp, "skipped.json");
  const r = await runWarmup({
    stderr: () => {},
    stateFilePath: stateFile,
    haveVectorOptionals: () => false,
  });
  const state = readWarmupState(stateFile);
  out.skip_path = {
    ok: r.ok, skipped: r.skipped, reason: r.reason,
    state_status: state?.status, state_pid: state?.pid,
    completed_at_present: !!state?.completed_at,
  };
}

// Normal path (mock embedder)
{
  const stateFile = path.join(tmp, "ready.json");
  const r = await runWarmup({
    embedder: { embed: async () => [[0, 0]] },
    stderr: () => {},
    stateFilePath: stateFile,
    haveVectorOptionals: () => false, // ignored when embedder injected
  });
  const state = readWarmupState(stateFile);
  out.normal_path = {
    ok: r.ok, skipped: r.skipped ?? null,
    state_status: state?.status,
  };
}

console.log(JSON.stringify(out, null, 2));
EOF

node "$EVIDENCE/probe.mjs" >"$EVIDENCE/stdout.txt" 2>"$EVIDENCE/stderr.txt"
EC=$?

OK=false
if [[ "$EC" -eq 0 ]] && \
   jq -e '.skip_path.ok==true and .skip_path.skipped==true and .skip_path.reason=="optional-deps-missing" and .skip_path.state_status=="skipped"' "$EVIDENCE/stdout.txt" >/dev/null && \
   jq -e '.normal_path.ok==true and .normal_path.state_status=="ready"' "$EVIDENCE/stdout.txt" >/dev/null; then
  OK=true
fi

cat > "$EVIDENCE/result.json" <<EOF
{
  "section": "V2",
  "ok": $OK,
  "exit_code": $EC,
  "metrics": $(cat "$EVIDENCE/stdout.txt" 2>/dev/null || echo '{}'),
  "evidence_dir": "$EVIDENCE",
  "stdout_path": "$EVIDENCE/stdout.txt",
  "stderr_path": "$EVIDENCE/stderr.txt"
}
EOF
cat "$EVIDENCE/result.json"
```

**PASS criteria.** Skip path returns `{ok:true, skipped:true, reason:"optional-deps-missing"}` and writes state `{status:"skipped"}`. Normal path returns `{ok:true, skipped:undefined}` and writes state `{status:"ready"}`.

## §V3 RUN — postinstall.log shape

Hand-craft a postinstall invocation under a sandbox `HOME` so we don't trample real state, then grep the log.

```bash
RUN_ID=$(date +%s)
EVIDENCE=".judge/issue-160/$RUN_ID/V3"
mkdir -p "$EVIDENCE"
SANDBOX="$EVIDENCE/sandbox"
mkdir -p "$SANDBOX"

# Run postinstall.mjs against this worktree's tarball/dist with a fake HOME.
HOME="$SANDBOX" \
TEAMAGENT_SKIP_WARMUP="1" \
node packages/teamagent/postinstall.mjs \
  >"$EVIDENCE/stdout.txt" 2>"$EVIDENCE/stderr.txt" || true

LOG="$SANDBOX/.teamagent/postinstall.log"
SKIP_LINE=$(grep -c "stage=warmup status=skipped" "$LOG" 2>/dev/null || echo 0)
EXIT1_LINE=$(grep -c "stage=warmup exit=1" "$LOG" 2>/dev/null || echo 0)

OK=false
[[ "$SKIP_LINE" -ge 1 && "$EXIT1_LINE" -eq 0 ]] && OK=true

cat > "$EVIDENCE/result.json" <<EOF
{
  "section": "V3",
  "ok": $OK,
  "exit_code": 0,
  "metrics": { "skip_lines": $SKIP_LINE, "exit1_lines": $EXIT1_LINE },
  "evidence_dir": "$EVIDENCE",
  "stdout_path": "$EVIDENCE/stdout.txt",
  "stderr_path": "$EVIDENCE/stderr.txt",
  "log_path": "$LOG"
}
EOF
cp "$LOG" "$EVIDENCE/postinstall.log" 2>/dev/null || true
cat "$EVIDENCE/result.json"
```

**PASS criteria.** ≥1 `stage=warmup status=skipped` line; exactly 0 `stage=warmup exit=1` lines.

## §V4 RUN — claudefast probe (semantic anchor check)

Verifies the implementation diff contains the right symbols, by asking a fresh LLM to read the diff and report what it sees.

```bash
RUN_ID=$(date +%s)
EVIDENCE=".judge/issue-160/$RUN_ID/V4"
mkdir -p "$EVIDENCE"

DIFF=$(git diff origin/main...HEAD --stat -- packages/cli/src/commands/warmup.ts packages/cli/src/warmup-state.ts packages/teamagent/postinstall.mjs packages/cli/src/__tests__/warmup.test.ts)

claudefast -p "Read this diff stat. Answer ONLY: does the change set add (a) a 'skipped' WarmupStatus, (b) a 'haveVectorOptionals' option on runWarmup, (c) a 'recordSetupStatus' helper in postinstall.mjs, (d) ≥3 new test cases for the skip path? Reply with strict JSON: {\"a\":true|false,\"b\":...,\"c\":...,\"d\":...}. No prose. Diff:
$DIFF
" >"$EVIDENCE/stdout.txt" 2>"$EVIDENCE/stderr.txt"
EC=$?

OK=false
if [[ "$EC" -eq 0 ]] && jq -e '.a==true and .b==true and .c==true and .d==true' "$EVIDENCE/stdout.txt" >/dev/null 2>&1; then
  OK=true
fi

cat > "$EVIDENCE/result.json" <<EOF
{
  "section": "V4",
  "ok": $OK,
  "exit_code": $EC,
  "metrics": $(cat "$EVIDENCE/stdout.txt" 2>/dev/null || echo '{}'),
  "evidence_dir": "$EVIDENCE",
  "stdout_path": "$EVIDENCE/stdout.txt",
  "stderr_path": "$EVIDENCE/stderr.txt"
}
EOF
cat "$EVIDENCE/result.json"
```

## §V5 READ — verdict (separate LLM)

A fresh LLM reads ONLY the four `result.json` files and renders one consolidated verdict. It never reads the implementation diff directly. Run via:

```bash
RUN_ID=$(ls .judge/issue-160 | tail -1)  # most recent
claudefast -p "You are a 3rd-party judge. Read these four JSON files and render a single verdict. Do NOT open any other files. PASS only if all four section.ok==true. Reply: {\"verdict\":\"PASS|FAIL\",\"sections\":[...],\"why\":\"...\"}.

$(cat .judge/issue-160/$RUN_ID/V1/result.json)
$(cat .judge/issue-160/$RUN_ID/V2/result.json)
$(cat .judge/issue-160/$RUN_ID/V3/result.json)
$(cat .judge/issue-160/$RUN_ID/V4/result.json)
"
```

**Final PASS.** All four sections report `ok:true`.
