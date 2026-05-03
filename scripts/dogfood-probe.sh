#!/usr/bin/env bash
# dogfood-probe — verify Tier 2 isolation via claudefast -p stream-json.
#
# Runs two probes back-to-back in a controlled environment:
#   1. Control: bare `claudefast -p` — spawned claude inherits CLAUDE_CONFIG_DIR
#      from the wrapper itself ($HOME/.claude-minimax).
#   2. Tier 2: `source dogfood-shim.sh` first, then `claudefast -p` — the
#      shim shadows `claude` in a subshell so the actual binary is exec'd
#      with CLAUDE_CONFIG_DIR overridden to a sandbox-private path.
#
# Each probe asks the agent to invoke `printenv CLAUDE_CONFIG_DIR` via the
# Bash tool. We extract the actual `tool_result.content` from the
# stream-json (NOT the agent's final text — agents can hallucinate; tool
# output is ground truth from a real shell).
#
# Pass = the two reported paths differ AND the tier-2 path matches the
# sandbox dir we set.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Force a SINGLE bash invocation so we get one tool_result with both lines.
# Otherwise the agent splits into two calls and a Fact-Forcing-Gate hook in
# the control session can reorder them.
PROMPT='Use the Bash tool to run THIS EXACT single command (one tool call, copy verbatim):
printenv HOME; printenv CLAUDE_CONFIG_DIR
In your final assistant message, output ONLY the two lines that single command produced, separated by a newline.'

run_in_zsh () {
  # $1 = setup snippet to run before claudefast; $2 = output file
  local setup="$1"; local out="$2"
  zsh -ic '
    repo_root=$1
    setup=$2
    prompt=$3
    shift 3

    cd "$repo_root" || exit
    if [ -n "$setup" ]; then
      eval "$setup"
    fi
    claudefast -p "$@" --permission-mode bypassPermissions "$prompt"
  ' dogfood-probe "$REPO_ROOT" "$setup" "$PROMPT" "${STREAM_JSON_FLAGS[@]}" > "$out" 2>&1
}

self_test_quoting () {
  local tmp_dir fake_bin fake_claudefast out debug_path setup
  tmp_dir="$(mktemp -d /tmp/dogfood-probe-quoting.XXXXXX)"
  fake_bin="$tmp_dir/bin"
  fake_claudefast="$fake_bin/claudefast"
  out="$tmp_dir/argv.txt"
  debug_path="$tmp_dir/path with spaces/hooks debug.log"
  mkdir -p "$fake_bin" "$(dirname "$debug_path")"

  cat > "$fake_claudefast" <<'FAKE_CLAUDEFAST'
#!/usr/bin/env bash
index=0
for arg in "$@"; do
  index=$((index + 1))
  printf 'ARG[%02d]=<%s>\n' "$index" "$arg"
done
FAKE_CLAUDEFAST
  chmod +x "$fake_claudefast"

  STREAM_JSON_FLAGS=(
    "--output-format" "stream-json"
    "--include-partial-messages"
    "--verbose"
    "--debug" "hooks"
    "--debug-file" "$debug_path"
  )
  PROMPT="self-test prompt with spaces"
  setup="unalias claudefast 2>/dev/null || true; unfunction claudefast 2>/dev/null || true; export PATH='$fake_bin':\$PATH"

  run_in_zsh "$setup" "$out"

  if ! grep -Fxq "ARG[09]=<$debug_path>" "$out"; then
    echo "FAIL: --debug-file path with spaces was not preserved as one argv entry" >&2
    cat "$out" >&2
    return 1
  fi
  if ! grep -Fxq "ARG[12]=<$PROMPT>" "$out"; then
    echo "FAIL: prompt with spaces was not preserved as one argv entry" >&2
    cat "$out" >&2
    return 1
  fi

  echo "PASS: claudefast argv quoting preserves --debug-file path with spaces"
}

if [[ "${1:-}" == "--self-test-quoting" ]]; then
  self_test_quoting
  exit
fi

PROBE_RUN_DIR="${DOGFOOD_PROBE_DIR:-.dogfood/probe-$(date +%s)}"
mkdir -p "$PROBE_RUN_DIR"

CONTROL_OUT="$PROBE_RUN_DIR/control.jsonl"
DOGFOOD_OUT="$PROBE_RUN_DIR/dogfood.jsonl"
HELP_OUT="$PROBE_RUN_DIR/claudefast-help.txt"
FLAGS_OUT="$PROBE_RUN_DIR/claudefast-stream-json-flags.txt"
HOOK_DEBUG_OUT="$PROBE_RUN_DIR/claudefast-hooks.debug.log"
SANDBOX_CFG="$PROBE_RUN_DIR/sandbox-cfg"
SANDBOX_CODEX="$PROBE_RUN_DIR/sandbox-codex"
mkdir -p "$SANDBOX_CFG" "$SANDBOX_CODEX"
source "$REPO_ROOT/docs/feature-verify-kit/claudefast-stream-json-flags.sh"
FLAGS_TMP="$PROBE_RUN_DIR/claudefast-stream-json-flags.tmp"
if claudefast_stream_json_flags claudefast "$HELP_OUT" "$HOOK_DEBUG_OUT" > "$FLAGS_TMP"; then
  :
else
  status=$?
  rm -f "$FLAGS_TMP"
  exit "$status"
fi
STREAM_JSON_FLAGS=()
while IFS= read -r flag; do
  STREAM_JSON_FLAGS+=("$flag")
done < "$FLAGS_TMP"
rm -f "$FLAGS_TMP"
printf '%s\n' "${STREAM_JSON_FLAGS[@]}" > "$FLAGS_OUT"

# Prepare paths/state for ALL three probes up front so they can run in
# parallel — each call takes ~30-60s and they're fully independent.
SANDBOX_CFG_ABS="$REPO_ROOT/$SANDBOX_CFG"
SANDBOX_CODEX_ABS="$REPO_ROOT/$SANDBOX_CODEX"
SANDBOX_HOME_T2="$REPO_ROOT/$PROBE_RUN_DIR/sandbox-home-tier2"
TIER3_OUT="$PROBE_RUN_DIR/tier3.jsonl"
TIER3_HOME="$REPO_ROOT/$PROBE_RUN_DIR/sandbox-home"
USER_REAL_ZSHRC="$HOME/.zshrc"
mkdir -p "$SANDBOX_HOME_T2" "$TIER3_HOME"

cat > "$TIER3_HOME/.zshrc" <<TIER3_RC
if [ -f "$USER_REAL_ZSHRC" ]; then
  { setopt no_err_exit 2>/dev/null || true; source "$USER_REAL_ZSHRC"; } 2>/dev/null || true
fi
export DOGFOOD_CLAUDE_CONFIG_DIR="$SANDBOX_CFG_ABS"
export DOGFOOD_CODEX_HOME="$SANDBOX_CODEX_ABS"
export DOGFOOD_TIER=3
export DOGFOOD_SHIM_QUIET=1
[ -f "$REPO_ROOT/scripts/dogfood-shim.sh" ] && source "$REPO_ROOT/scripts/dogfood-shim.sh"
TIER3_RC

echo "[probes 1-3/3] launching control + tier-2 + tier-3 in parallel..."

run_in_zsh "" "$CONTROL_OUT" &
PID_CONTROL=$!

run_in_zsh "
    export DOGFOOD_CLAUDE_CONFIG_DIR='$SANDBOX_CFG_ABS'
    export DOGFOOD_CODEX_HOME='$SANDBOX_CODEX_ABS'
    export DOGFOOD_HOME='$SANDBOX_HOME_T2'
    export DOGFOOD_SHIM_QUIET=1
    source scripts/dogfood-shim.sh
" "$DOGFOOD_OUT" &
PID_DOGFOOD=$!

(
  HOME="$TIER3_HOME" run_in_zsh "" "$TIER3_OUT"
) &
PID_TIER3=$!

wait "$PID_CONTROL" 2>/dev/null || true
wait "$PID_DOGFOOD" 2>/dev/null || true
wait "$PID_TIER3"   2>/dev/null || true

echo "  → $CONTROL_OUT  ($(wc -l < "$CONTROL_OUT") lines)"
echo "  → $DOGFOOD_OUT  ($(wc -l < "$DOGFOOD_OUT") lines)"
echo "  → $TIER3_OUT    ($(wc -l < "$TIER3_OUT") lines)"

# Each prompt asks for printenv HOME then printenv CLAUDE_CONFIG_DIR. The
# tool_result.content has them as a single string with literal `\n` between.
# We extract the first SUCCESSFUL tool_result (is_error:false skips
# hook-denial intercepts like the Fact-Forcing Gate).
extract_first_tool_result () {
  grep -oE '"type":"tool_result","content":"[^"]*","is_error":false' "$1" \
    | head -1 \
    | sed -E 's/^.*"content":"([^"]*)".*/\1/'
}

CONTROL_RAW="$(extract_first_tool_result "$CONTROL_OUT" || true)"
DOGFOOD_RAW="$(extract_first_tool_result "$DOGFOOD_OUT" || true)"
TIER3_RAW="$(extract_first_tool_result "$TIER3_OUT" || true)"

# The raw string contains a literal "\n" (backslash + n) where the shell
# put a real newline. Decode that to a real newline, then take lines 1 and 2.
# Bash 3.2 compatible (no readarray).
decode_escape () { printf '%s' "$1" | sed 's/\\n/\
/g'; }

CONTROL_DECODED="$(decode_escape "$CONTROL_RAW")"
DOGFOOD_DECODED="$(decode_escape "$DOGFOOD_RAW")"
TIER3_DECODED="$(decode_escape "$TIER3_RAW")"

CONTROL_HOME="$(printf '%s\n' "$CONTROL_DECODED" | sed -n '1p')"
CONTROL_CFG="$(printf '%s\n' "$CONTROL_DECODED" | sed -n '2p')"
DOGFOOD_HOME_OBSERVED="$(printf '%s\n' "$DOGFOOD_DECODED" | sed -n '1p')"
DOGFOOD_CFG_OBSERVED="$(printf '%s\n' "$DOGFOOD_DECODED" | sed -n '2p')"
TIER3_HOME_OBSERVED="$(printf '%s\n' "$TIER3_DECODED" | sed -n '1p')"
TIER3_CFG_OBSERVED="$(printf '%s\n' "$TIER3_DECODED" | sed -n '2p')"

# Sanity: scan for token leak (claudefast token starts with sk-cp-)
TOKEN_LEAK=0
if grep -q "sk-cp-" "$CONTROL_OUT" "$DOGFOOD_OUT" "$TIER3_OUT" 2>/dev/null; then
  TOKEN_LEAK=1
fi

cat <<REPORT

============================================================
DOGFOOD Isolation Probe — evidence from stream-json tool_result
============================================================
Tier 1 baseline NOT probed here (it has no isolation to verify).

Tier 2 — CLAUDE_CONFIG_DIR + CODEX_HOME + HOME (claude only):
  Control  (bare claudefast):
    HOME              = $CONTROL_HOME
    CLAUDE_CONFIG_DIR = $CONTROL_CFG
  Dogfood  (Tier 2 shim):
    HOME              = $DOGFOOD_HOME_OBSERVED
    CLAUDE_CONFIG_DIR = $DOGFOOD_CFG_OBSERVED
  Expected dogfood:
    HOME              = $SANDBOX_HOME_T2
    CLAUDE_CONFIG_DIR = $SANDBOX_CFG_ABS

Tier 3 — full shell HOME redirect (right pane shell + spawned claude both see sandbox):
  Observed HOME:                $TIER3_HOME_OBSERVED
  Observed CLAUDE_CONFIG_DIR:   $TIER3_CFG_OBSERVED
  Expected HOME:                $TIER3_HOME
  Expected CLAUDE_CONFIG_DIR:   $SANDBOX_CFG_ABS

Tier 4 — container: $(command -v docker >/dev/null 2>&1 && echo "docker present, probe-via-stream-json TODO (skeleton in scripts/dogfood-tier4.sh)" || echo "SKIPPED — docker not installed")

Token leak (sk-cp-) in jsonl: $([[ $TOKEN_LEAK == 1 ]] && echo "YES — INVESTIGATE" || echo "no")
JSONL artifacts under: $PROBE_RUN_DIR/
============================================================
REPORT

VERDICT_T2="UNKNOWN"
VERDICT_T3="UNKNOWN"
EXIT=0

# Tier 2 verdict — both HOME and CLAUDE_CONFIG_DIR must be the sandbox paths
if [[ -z "$DOGFOOD_HOME_OBSERVED" || -z "$DOGFOOD_CFG_OBSERVED" ]]; then
  VERDICT_T2="FAIL — extract empty"; EXIT=1
elif [[ "$DOGFOOD_HOME_OBSERVED" == "$SANDBOX_HOME_T2" && "$DOGFOOD_CFG_OBSERVED" == "$SANDBOX_CFG_ABS" ]]; then
  VERDICT_T2="PASS — HOME (claude only) and CLAUDE_CONFIG_DIR overridden for spawned claude"
elif [[ "$DOGFOOD_HOME_OBSERVED" == "$CONTROL_HOME" ]]; then
  VERDICT_T2="FAIL — HOME not overridden (still $DOGFOOD_HOME_OBSERVED)"; EXIT=1
elif [[ "$DOGFOOD_CFG_OBSERVED" == "$CONTROL_CFG" ]]; then
  VERDICT_T2="FAIL — CLAUDE_CONFIG_DIR not overridden"; EXIT=1
else
  VERDICT_T2="UNEXPECTED — HOME=$DOGFOOD_HOME_OBSERVED  cfg=$DOGFOOD_CFG_OBSERVED"; EXIT=2
fi

# Tier 3 verdict — both HOME and CLAUDE_CONFIG_DIR must be the sandbox paths
if [[ -z "$TIER3_HOME_OBSERVED" || -z "$TIER3_CFG_OBSERVED" ]]; then
  VERDICT_T3="FAIL — extract empty"; EXIT=$((EXIT == 0 ? 1 : EXIT))
elif [[ "$TIER3_HOME_OBSERVED" == "$TIER3_HOME" && "$TIER3_CFG_OBSERVED" == "$SANDBOX_CFG_ABS" ]]; then
  VERDICT_T3="PASS — HOME redirected AND CLAUDE_CONFIG_DIR overridden"
else
  VERDICT_T3="FAIL — observed HOME=$TIER3_HOME_OBSERVED  cfg=$TIER3_CFG_OBSERVED"
  EXIT=$((EXIT == 0 ? 1 : EXIT))
fi

echo "VERDICT (Tier 2): $VERDICT_T2"
echo "VERDICT (Tier 3): $VERDICT_T3"
echo
[[ $TOKEN_LEAK == 1 ]] && {
  echo "WARNING: potential token leak detected in jsonl. Inspect and scrub."
  EXIT=$(( EXIT == 0 ? 3 : EXIT ))
}

exit $EXIT
