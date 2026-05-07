#!/usr/bin/env bash
# =============================================================================
#
#   verify-issue85-pr1.sh  —  third-party judge harness for PR1 of issue #85
#
#   Flow:
#
#     T1: parser contract tests   ──►  .judge/issue85-pr1/<run_id>/T1/
#     T2: happy-path execution    ──►  .judge/issue85-pr1/<run_id>/T2/
#     T3: injected-failure fix    ──►  .judge/issue85-pr1/<run_id>/T3/
#     T4: agent narration         ──►  .judge/issue85-pr1/<run_id>/T4/
#     T5: zshrc/bashrc immutable  ──►  .judge/issue85-pr1/<run_id>/T5/
#          |
#          └──►  final judge      ──►  .judge/issue85-pr1/<run_id>/final/
#                                       verdict.json  (PASS | FAIL)
#
#   Exit code: 0 = PASS, 1 = FAIL.
#   Requires: claudefast (on PATH or via zsh alias), python3 (for JSON).
#   Optional: jq (for prettier intermediate output only — not required).
#
# Usage:
#   bash scripts/verify-issue85-pr1.sh
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo root & cd there
# ---------------------------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Run-id & output directories
# ---------------------------------------------------------------------------
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
BASE_DIR=".judge/issue85-pr1/${RUN_ID}"

for task in T1 T2 T3 T4 T5 final; do
    mkdir -p "${BASE_DIR}/${task}"
done

echo "=== verify-issue85-pr1.sh  run_id=${RUN_ID} ==="
echo "output dir: ${BASE_DIR}"
echo ""

# ---------------------------------------------------------------------------
# Helper: invoke claudefast -p with canonical flags
# Writes raw stream-json to $1/stdout.log and hook debug to $1/hooks.log.
# Usage: run_probe <task_dir> <prompt>
# ---------------------------------------------------------------------------
run_probe() {
    local task_dir="$1"
    local prompt="$2"
    local stdout_log="${task_dir}/stdout.log"
    local hooks_log="${task_dir}/hooks.log"

    if command -v zsh >/dev/null 2>&1; then
        # Use interactive zsh so claudefast alias/function resolves
        zsh -i -c "claudefast -p \
            --output-format stream-json \
            --debug hooks --debug-file $(printf '%q' "$hooks_log") \
            --include-partial-messages \
            --verbose \
            --permission-mode acceptEdits \
            $(printf '%q' "$prompt")" > "$stdout_log" 2>&1
    elif command -v claudefast >/dev/null 2>&1; then
        claudefast -p \
            --output-format stream-json \
            --debug hooks --debug-file "$hooks_log" \
            --include-partial-messages \
            --verbose \
            --permission-mode acceptEdits \
            "$prompt" > "$stdout_log" 2>&1
    else
        echo "ERROR: claudefast not found on PATH and zsh not available" >&2
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Helper: extract the JSON object that the probe was asked to return.
# Parses stream-json stdout.log, extracts text from text_delta events,
# then grabs the last {...} blob from the text.
# Writes parsed JSON to <task_dir>/judge.json.
# On parse failure writes an error judge.json (exit_code=2) and returns 1.
# Usage: extract_json <task_dir> <task_id>
# ---------------------------------------------------------------------------
extract_json() {
    local task_dir="$1"
    local task_id="$2"
    local stdout_log="${task_dir}/stdout.log"
    local judge_json="${task_dir}/judge.json"
    local evidence_dir
    evidence_dir="$(pwd)/${task_dir}"

    # Pull full text from stream-json via python3 (no jq dependency)
    local raw_text
    raw_text="$(python3 - "$stdout_log" <<'PYEOF'
import sys, json

text_parts = []
result_str = ""
path = sys.argv[1]
with open(path, "r", errors="replace") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except Exception:
            continue
        # stream-json: event.event.delta.text
        delta = (ev.get("event") or {}).get("delta") or {}
        if delta.get("type") == "text_delta" and isinstance(delta.get("text"), str):
            text_parts.append(delta["text"])
        # final result field
        if ev.get("type") == "result" and isinstance(ev.get("result"), str):
            result_str = ev["result"]

text = "".join(text_parts).strip() or result_str.strip()
print(text)
PYEOF
)" || true

    if [ -z "$raw_text" ]; then
        python3 -c "
import json, sys
d = {
    'task_id': sys.argv[1],
    'exit_code': 2,
    'error': 'json_parse_failed',
    'metrics': {'raw_excerpt': ''},
    'evidence_dir': sys.argv[2],
    'stdout_path': sys.argv[3]
}
print(json.dumps(d, indent=2))
" "$task_id" "$evidence_dir" "$(pwd)/${stdout_log}" > "$judge_json"
        echo "  [${task_id}] WARNING: no text found in stream-json output" >&2
        return 1
    fi

    # Extract the last JSON object {...} from the text.
    # Uses a real JSON parser (raw_decode walk-back from last '{') instead of
    # a brace-depth scanner, so markdown fences and embedded '"' chars are safe.
    local parsed_json
    parsed_json="$(python3 - "$raw_text" "$task_id" "$evidence_dir" "$(pwd)/${stdout_log}" <<'PYEOF'
import sys, json, re

raw_text = sys.argv[1]
task_id = sys.argv[2]
evidence_dir = sys.argv[3]
stdout_path = sys.argv[4]

def strip_markdown_fences(s):
    """Remove leading/trailing ```json or ``` fences if present."""
    s = re.sub(r'^\s*```(?:json)?\s*\n?', '', s)
    s = re.sub(r'\n?```\s*$', '', s)
    return s

def find_first_json_object(text):
    """Walk left-to-right; return the FIRST position where raw_decode succeeds
    on a top-level dict. This gives the outermost JSON object in the text,
    tolerating leading prose, markdown fences, and trailing prose."""
    decoder = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch != '{':
            continue
        try:
            obj, _ = decoder.raw_decode(text, i)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None

# Strip fences before attempting parse
candidate = strip_markdown_fences(raw_text)
obj = find_first_json_object(candidate)

if obj is not None:
    # Inject harness envelope fields if not present
    obj.setdefault("task_id", task_id)
    obj.setdefault("exit_code", 0)
    obj.setdefault("evidence_dir", evidence_dir)
    obj.setdefault("stdout_path", stdout_path)
    print(json.dumps(obj, indent=2))
else:
    # No JSON object found — write error sentinel with raw_excerpt for debugging
    excerpt = raw_text[:500].replace("\n", " ")
    d = {
        "task_id": task_id,
        "exit_code": 2,
        "error": "json_parse_failed",
        "metrics": {"raw_excerpt": excerpt},
        "evidence_dir": evidence_dir,
        "stdout_path": stdout_path
    }
    print(json.dumps(d, indent=2))
PYEOF
)" || true

    if [ -z "$parsed_json" ]; then
        python3 -c "
import json, sys
excerpt = sys.argv[1][:500]
d = {
    'task_id': sys.argv[2],
    'exit_code': 2,
    'error': 'json_parse_failed',
    'metrics': {'raw_excerpt': excerpt},
    'evidence_dir': sys.argv[3],
    'stdout_path': sys.argv[4]
}
print(json.dumps(d, indent=2))
" "$raw_text" "$task_id" "$evidence_dir" "$(pwd)/${stdout_log}" > "$judge_json"
        echo "  [${task_id}] WARNING: could not parse JSON from model response" >&2
        return 1
    fi

    echo "$parsed_json" > "$judge_json"
    return 0
}

# ===========================================================================
# T1 — Parser schema contract probe
# ===========================================================================
echo "--- T1: parser schema contract ---"
T1_DIR="${BASE_DIR}/T1"

T1_PROMPT="Run 'pnpm vitest run install-md-parser-contract --reporter=json'.
 Read the JSON. Return ONLY bare JSON (no markdown fences, no prose):
 {pass: bool, total: int, failed: int, missing_fields: string[],
  schema_fields_validated: string[], evidence: stdout_path}"

echo "  running probe T1..."
if run_probe "$T1_DIR" "$T1_PROMPT"; then
    extract_json "$T1_DIR" "T1" || true
    echo "  T1 judge.json written: ${T1_DIR}/judge.json"
else
    echo "  T1 probe invocation failed — writing error judge.json"
    python3 -c "
import json
d = {'task_id':'T1','exit_code':1,'error':'probe_failed',
     'evidence_dir':'$(pwd)/${T1_DIR}','stdout_path':'$(pwd)/${T1_DIR}/stdout.log'}
print(json.dumps(d,indent=2))
" > "${T1_DIR}/judge.json"
fi
echo ""

# ===========================================================================
# T2 — Happy-path INSTALL.md execution probe (isolated tmp dir)
# ===========================================================================
echo "--- T2: happy-path INSTALL.md execution ---"
T2_DIR="${BASE_DIR}/T2"

T2_PROMPT="In a fresh tmp dir, run 'bash scripts/install-from-md.ts --dry-run INSTALL.md'.
 Capture exit_code, every step's command, every step's narrated explanation.
 Return ONLY bare JSON (no markdown fences, no prose):
 {exit_code, steps:[{id, command, explanation, exit, stdout_path}],
 any_raw_stack_trace: bool}"

echo "  running probe T2..."
if run_probe "$T2_DIR" "$T2_PROMPT"; then
    extract_json "$T2_DIR" "T2" || true
    echo "  T2 judge.json written: ${T2_DIR}/judge.json"
else
    echo "  T2 probe invocation failed — writing error judge.json"
    python3 -c "
import json
d = {'task_id':'T2','exit_code':1,'error':'probe_failed',
     'evidence_dir':'$(pwd)/${T2_DIR}','stdout_path':'$(pwd)/${T2_DIR}/stdout.log'}
print(json.dumps(d,indent=2))
" > "${T2_DIR}/judge.json"
fi
echo ""

# ===========================================================================
# T3 — Injected-failure fix narration probe
# ===========================================================================
echo "--- T3: injected-failure fix narration ---"
T3_DIR="${BASE_DIR}/T3"

T3_PROMPT="PATH 中移除 pnpm 后跑 'bash scripts/install-from-md.ts INSTALL.md'.
 断言 missing-pnpm fixture 的 common_errors.pattern 命中、对应 fix 被
 stdout 打印、且没有 raw stack trace 泄漏。
 Return ONLY bare JSON (no markdown fences, no prose):
 {pattern_matched: bool, fix_text, fix_is_copy_pasteable: bool,
 raw_stack_trace_leaked: bool, evidence: stderr_path}"

echo "  running probe T3..."
if run_probe "$T3_DIR" "$T3_PROMPT"; then
    extract_json "$T3_DIR" "T3" || true
    echo "  T3 judge.json written: ${T3_DIR}/judge.json"
else
    echo "  T3 probe invocation failed — writing error judge.json"
    python3 -c "
import json
d = {'task_id':'T3','exit_code':1,'error':'probe_failed',
     'evidence_dir':'$(pwd)/${T3_DIR}','stdout_path':'$(pwd)/${T3_DIR}/stdout.log'}
print(json.dumps(d,indent=2))
" > "${T3_DIR}/judge.json"
fi
echo ""

# ===========================================================================
# T4 — Agent narration via install-walkthrough skill
# ===========================================================================
echo "--- T4: agent narration (install-walkthrough skill) ---"
T4_DIR="${BASE_DIR}/T4"

T4_PROMPT="调用 install-walkthrough skill 念 INSTALL.md 第 1/2/3 step。
 每个 explanation 必须 < 200 字、不含 stack trace、不含 raw shell error。
 Return ONLY bare JSON (no markdown fences, no prose):
 {steps:[{id, explanation, len, contains_jargon:[..],
 contains_stack_trace: bool}]}"

echo "  running probe T4..."
if run_probe "$T4_DIR" "$T4_PROMPT"; then
    extract_json "$T4_DIR" "T4" || true
    echo "  T4 judge.json written: ${T4_DIR}/judge.json"
else
    echo "  T4 probe invocation failed — writing error judge.json"
    python3 -c "
import json
d = {'task_id':'T4','exit_code':1,'error':'probe_failed',
     'evidence_dir':'$(pwd)/${T4_DIR}','stdout_path':'$(pwd)/${T4_DIR}/stdout.log'}
print(json.dumps(d,indent=2))
" > "${T4_DIR}/judge.json"
fi
echo ""

# ===========================================================================
# T5 — Zshrc/bashrc immutability probe
# ===========================================================================
echo "--- T5: zshrc/bashrc immutability ---"
T5_DIR="${BASE_DIR}/T5"

T5_PROMPT="Compute sha256 of ~/.zshrc and ~/.bashrc.
 Run 'bash scripts/install-from-md.ts INSTALL.md' end-to-end in tmp HOME.
 Recompute sha256. Return ONLY bare JSON (no markdown fences, no prose):
 {zshrc_before, zshrc_after, zshrc_changed: bool,
  bashrc_before, bashrc_after, bashrc_changed: bool}"

echo "  running probe T5..."
if run_probe "$T5_DIR" "$T5_PROMPT"; then
    extract_json "$T5_DIR" "T5" || true
    echo "  T5 judge.json written: ${T5_DIR}/judge.json"
else
    echo "  T5 probe invocation failed — writing error judge.json"
    python3 -c "
import json
d = {'task_id':'T5','exit_code':1,'error':'probe_failed',
     'evidence_dir':'$(pwd)/${T5_DIR}','stdout_path':'$(pwd)/${T5_DIR}/stdout.log'}
print(json.dumps(d,indent=2))
" > "${T5_DIR}/judge.json"
fi
echo ""

# ===========================================================================
# Final judge — verdict from raw JSON only
# ===========================================================================
echo "--- Final judge: reading T1-T5 judge.json and producing verdict ---"
FINAL_DIR="${BASE_DIR}/final"

# Build the explicit list of judge.json paths for the judge prompt
JUDGE_PATHS="${BASE_DIR}/T1/judge.json, ${BASE_DIR}/T2/judge.json, ${BASE_DIR}/T3/judge.json, ${BASE_DIR}/T4/judge.json, ${BASE_DIR}/T5/judge.json"

FINAL_PROMPT="你只能读 ${JUDGE_PATHS} + linked evidence path。
 不许凭感觉，不许引用 JSON 里没有的事实。

 CRITICAL: Each gate is INDEPENDENT.
 - Derive G_i ONLY from T_i/judge.json fields. Do NOT propagate a failure
   in T_x to G_y where y != x.
 - If T_i/judge.json shows error='json_parse_failed', the gate G_i is
   UNVERIFIED — list it under missing_evidence rather than failed_gates,
   unless the raw_excerpt clearly contradicts the gate criterion.
 - Other gates whose T_j/judge.json is well-formed must be evaluated
   on their own merits, regardless of any sibling parse failure.

 Acceptance gates:
   G1 (T1) parser schema 全字段验证 + tests pass
   G2 (T2) 所有 step 都有非空 explanation；any_raw_stack_trace=false
   G3 (T3) pattern_matched=true && fix_is_copy_pasteable=true && raw_stack_trace_leaked=false
   G4 (T4) 每个 explanation len<200 && contains_stack_trace=false
   G5 (T5) zshrc_changed=false && bashrc_changed=false
 Return ONLY bare JSON, no markdown fences:
 {verdict: 'PASS'|'FAIL', failed_gates: [..],
 missing_evidence: [..], notes: string}"

echo "  running final judge probe..."
FINAL_STDOUT="${FINAL_DIR}/stdout.log"

if command -v zsh >/dev/null 2>&1; then
    zsh -i -c "claudefast -p \
        --output-format stream-json \
        --include-partial-messages \
        --verbose \
        --permission-mode acceptEdits \
        $(printf '%q' "$FINAL_PROMPT")" > "$FINAL_STDOUT" 2>&1 || true
elif command -v claudefast >/dev/null 2>&1; then
    claudefast -p \
        --output-format stream-json \
        --include-partial-messages \
        --verbose \
        --permission-mode acceptEdits \
        "$FINAL_PROMPT" > "$FINAL_STDOUT" 2>&1 || true
else
    echo "ERROR: claudefast not found" >&2
    python3 -c "
import json
d = {'verdict':'FAIL','failed_gates':['final_judge_probe_failed'],
     'missing_evidence':[],'notes':'claudefast not available'}
print(json.dumps(d,indent=2))
" > "${FINAL_DIR}/verdict.json"
fi

# Extract verdict JSON from final probe output
if [ -f "$FINAL_STDOUT" ]; then
    VERDICT_RAW="$(python3 - "$FINAL_STDOUT" <<'PYEOF'
import sys, json, re

path = sys.argv[1]
text_parts = []
result_str = ""
with open(path, "r", errors="replace") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except Exception:
            continue
        delta = (ev.get("event") or {}).get("delta") or {}
        if delta.get("type") == "text_delta" and isinstance(delta.get("text"), str):
            text_parts.append(delta["text"])
        if ev.get("type") == "result" and isinstance(ev.get("result"), str):
            result_str = ev["result"]

text = "".join(text_parts).strip() or result_str.strip()

def strip_markdown_fences(s):
    s = re.sub(r'^\s*```(?:json)?\s*\n?', '', s)
    s = re.sub(r'\n?```\s*$', '', s)
    return s

def find_first_json_object(t):
    decoder = json.JSONDecoder()
    for i, ch in enumerate(t):
        if ch != '{':
            continue
        try:
            obj, _ = decoder.raw_decode(t, i)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None

candidate = strip_markdown_fences(text)
obj = find_first_json_object(candidate)
if obj is not None:
    print(json.dumps(obj, indent=2))
else:
    d = {"verdict":"FAIL","failed_gates":["final_judge_json_parse_failed"],
         "missing_evidence":[],"notes": text[:300]}
    print(json.dumps(d, indent=2))
PYEOF
)" || true

    if [ -n "$VERDICT_RAW" ]; then
        echo "$VERDICT_RAW" > "${FINAL_DIR}/verdict.json"
    else
        python3 -c "
import json
d = {'verdict':'FAIL','failed_gates':['final_judge_empty_response'],
     'missing_evidence':[],'notes':'no text in final judge probe output'}
print(json.dumps(d,indent=2))
" > "${FINAL_DIR}/verdict.json"
    fi
else
    python3 -c "
import json
d = {'verdict':'FAIL','failed_gates':['final_judge_no_stdout'],
     'missing_evidence':[],'notes':'final probe stdout.log not created'}
print(json.dumps(d,indent=2))
" > "${FINAL_DIR}/verdict.json"
fi

echo "  final verdict.json written: ${FINAL_DIR}/verdict.json"
echo ""

# ===========================================================================
# Result reporting
# ===========================================================================
echo "=== VERDICT ==="
cat "${FINAL_DIR}/verdict.json"
echo ""

VERDICT="$(python3 -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('verdict','FAIL'))
except Exception:
    print('FAIL')
" "${FINAL_DIR}/verdict.json")"

FAILED_GATES="$(python3 -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    gates = d.get('failed_gates', [])
    if gates:
        for g in gates:
            print('  - ' + str(g))
except Exception:
    print('  - verdict_json_unreadable')
" "${FINAL_DIR}/verdict.json")"

if [ "$VERDICT" = "PASS" ]; then
    echo "verify-issue85-pr1: PASS  (all gates green)"
    echo "evidence dir: ${BASE_DIR}"
    exit 0
else
    echo "verify-issue85-pr1: FAIL"
    if [ -n "$FAILED_GATES" ]; then
        echo "failed gates:"
        echo "$FAILED_GATES"
    fi
    echo "evidence dir: ${BASE_DIR}"
    exit 1
fi
