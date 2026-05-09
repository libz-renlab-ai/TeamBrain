#!/usr/bin/env bash
# verify-newsboard-format.sh — strict format check for docs/newsboard.md.
#
# Locks the .md ↔ .sh contract so .claude/hooks/newsboard-session-start.sh
# never has to change to keep the banner working. Anyone editing the .md
# breaks CI here if they violate any of:
#
#   A. file presence: docs/newsboard.md + the hook script
#   B. four markers on their own line, exactly once each
#   C. marker order: LABELS open<close, BANNER open<close, LABELS<BANNER
#   D. nine required labels with non-empty value
#   E. ${X} placeholders inside specific labels
#   F. label value has no leading whitespace (indent lives in bash, not .md)
#   G. BANNER block contains the four required section placeholders, no others
#   H. end-to-end: hook runs, emits valid JSON, no unsubstituted {{...}} or ${...}
#
# Exit 0 on PASS, 1 on FAIL. No external installs (bash + awk + jq + git).

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

TEMPLATE="docs/newsboard.md"
HOOK=".claude/hooks/newsboard-session-start.sh"

fail() {
  echo "NEWSBOARD-FORMAT: FAIL"
  echo "$1"
  exit 1
}

# --- A. File presence ---
[[ -f "$TEMPLATE" ]] || fail "missing template: $TEMPLATE"
[[ -f "$HOOK"     ]] || fail "missing hook: $HOOK"
[[ -x "$HOOK"     ]] || fail "hook not executable: $HOOK (chmod +x it)"

# --- B. Markers exactly once, each on its own line ---
check_marker_once() {
  local marker="$1"
  local count
  count=$(grep -cE "^${marker}\$" "$TEMPLATE" || true)
  case "$count" in
    1) : ;;
    0) fail "missing marker '$marker' on its own line in $TEMPLATE" ;;
    *) fail "marker '$marker' appears $count times (must be exactly 1) in $TEMPLATE" ;;
  esac
}
check_marker_once "<!-- LABELS -->"
check_marker_once "<!-- /LABELS -->"
check_marker_once "<!-- BANNER-START -->"
check_marker_once "<!-- BANNER-END -->"

# --- C. Marker order ---
line_of() { grep -nE "^${1}\$" "$TEMPLATE" | head -1 | cut -d: -f1; }
L_OPEN=$(line_of "<!-- LABELS -->")
L_CLOSE=$(line_of "<!-- /LABELS -->")
B_OPEN=$(line_of "<!-- BANNER-START -->")
B_CLOSE=$(line_of "<!-- BANNER-END -->")
[[ "$L_OPEN"  -lt "$L_CLOSE" ]] || fail "LABELS open ($L_OPEN) must come before close ($L_CLOSE)"
[[ "$B_OPEN"  -lt "$B_CLOSE" ]] || fail "BANNER-START ($B_OPEN) must come before BANNER-END ($B_CLOSE)"
[[ "$L_CLOSE" -lt "$B_OPEN"  ]] || fail "LABELS block must come before BANNER block (got $L_CLOSE vs $B_OPEN)"

# --- D + E + F. Labels: presence, non-empty, required ${X} placeholders, no leading whitespace ---
REQUIRED_LABELS=(
  INSTALL_CURRENT
  INSTALL_MISMATCH
  INSTALL_UNKNOWN
  COMMIT_LINE
  TRY_LINE
  QUIET_WEEK
  RANDOM_LINE
  RANDOM_MISSING
  RANDOM_EMPTY
)
declare_required_placeholders() {
  case "$1" in
    INSTALL_CURRENT)  echo "V" ;;
    INSTALL_MISMATCH) echo "L P" ;;
    COMMIT_LINE)      echo "C" ;;
    TRY_LINE)         echo "C" ;;
    RANDOM_LINE)      echo "I N F" ;;
    *) ;;
  esac
}

LABELS_RAW=$(awk '
  /^<!-- LABELS -->$/   { in_labels = 1; next }
  /^<!-- \/LABELS -->$/ { in_labels = 0; next }
  in_labels && /^[[:space:]]*-[[:space:]]+[A-Z_]+:/ {
    sub(/\r$/, "")
    raw_after_dash = $0
    sub(/^[[:space:]]*-[[:space:]]+/, "", raw_after_dash)
    k = raw_after_dash; sub(/:.*/, "", k)
    # Whitespace-preserving split on first ":". One space after ":" is the
    # canonical separator; any further whitespace counts as part of value.
    v_with_lead = raw_after_dash; sub(/^[^:]+:/, "", v_with_lead)
    print k "\t" v_with_lead
  }
' "$TEMPLATE")

declare -a SEEN_LABELS=()
while IFS=$'\t' read -r key val; do
  [[ -z "$key" ]] && continue
  SEEN_LABELS+=("$key")
  # F. value must start with " " (one space) followed by NON-space char,
  #    OR be exactly empty after the colon. Reject leading "  " (multiple
  #    leading spaces in value), tabs, or "<space><space>...".
  if [[ -z "$val" ]]; then
    fail "label '$key' has empty value (label line: '- $key:'). All labels must have content."
  fi
  if [[ "${val:0:1}" != " " ]]; then
    fail "label '$key' must have exactly one space after colon. got: '- $key:$val'"
  fi
  if [[ "${val:1:1}" == " " || "${val:1:1}" == $'\t' ]]; then
    fail "label '$key' has multiple leading whitespace chars in its value. \
Indent lives in bash (INDENT var), not in .md. got: '- $key:$val'"
  fi
  # Strip the canonical leading single space for placeholder check.
  body="${val:1}"
  # Reject "- KEY: " (only-whitespace value): body is empty after the canonical
  # leading space, so the rendered banner would silently show indent + nothing.
  if [[ -z "$body" ]]; then
    fail "label '$key' has empty body (only whitespace after colon). \
All labels must have visible text. got: '- $key:$val'"
  fi
  # E. Required placeholders inside specific labels
  for need in $(declare_required_placeholders "$key"); do
    case "$body" in
      *'${'"$need"'}'*) : ;;
      *) fail "label '$key' must contain placeholder \${$need}. got: '$body'" ;;
    esac
  done
done <<< "$LABELS_RAW"

# D. All required labels present
for req in "${REQUIRED_LABELS[@]}"; do
  found=0
  for seen in "${SEEN_LABELS[@]:-}"; do
    [[ "$seen" == "$req" ]] && { found=1; break; }
  done
  [[ "$found" -eq 1 ]] || fail "missing required label: $req"
done

# Reject unknown labels (catch typos)
for seen in "${SEEN_LABELS[@]:-}"; do
  known=0
  for req in "${REQUIRED_LABELS[@]}"; do
    [[ "$seen" == "$req" ]] && { known=1; break; }
  done
  [[ "$known" -eq 1 ]] || fail "unknown label '$seen' in LABELS block (not consumed by hook). \
Known labels: ${REQUIRED_LABELS[*]}"
done

# --- G. BANNER block placeholders ---
REQUIRED_SECTIONS=(INSTALL JUST_SHIPPED NEW_AND_TRY RANDOM)
BANNER_RAW=$(awk '
  /^<!-- BANNER-START -->$/ { in_banner = 1; next }
  /^<!-- BANNER-END -->$/   { in_banner = 0; next }
  in_banner                 { print }
' "$TEMPLATE")

for sec in "${REQUIRED_SECTIONS[@]}"; do
  case "$BANNER_RAW" in
    *"{{${sec}}}"*) : ;;
    *) fail "BANNER block missing placeholder {{${sec}}}" ;;
  esac
done

# Detect any {{UNKNOWN}} placeholders the hook would not substitute.
# Note: loop body must always return 0 (use if/fi, not `&&`), otherwise
# pipefail propagates non-zero from the final iteration when nothing is
# echoed and set -e kills the script.
UNKNOWN_PHS=$(printf '%s\n' "$BANNER_RAW" \
  | grep -oE '\{\{[A-Z_]+\}\}' \
  | sort -u \
  | while read -r ph; do
      bare="${ph#\{\{}"; bare="${bare%\}\}}"
      known=0
      for sec in "${REQUIRED_SECTIONS[@]}"; do
        if [[ "$bare" == "$sec" ]]; then known=1; break; fi
      done
      if [[ "$known" -eq 0 ]]; then echo "$ph"; fi
    done)
if [[ -n "$UNKNOWN_PHS" ]]; then
  fail "BANNER block contains unknown placeholders the hook does NOT substitute:
$UNKNOWN_PHS
Known: {{INSTALL}} {{JUST_SHIPPED}} {{NEW_AND_TRY}} {{RANDOM}}"
fi

# --- H. End-to-end: hook produces valid JSON with no leftover placeholders ---
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/newsboard-verify.XXXXXX")
trap 'rm -rf "$TMP_DIR"' EXIT

CLAUDE_PROJECT_DIR="$ROOT" bash "$HOOK" </dev/null \
  >"$TMP_DIR/hook.stdout" 2>"$TMP_DIR/hook.stderr" || \
    fail "hook exited non-zero. stderr:
$(cat "$TMP_DIR/hook.stderr")"

[[ -s "$TMP_DIR/hook.stderr" ]] && fail "hook wrote to stderr (must be silent on stderr):
$(cat "$TMP_DIR/hook.stderr")"

jq -e '.hookSpecificOutput.hookEventName == "SessionStart"' \
  <"$TMP_DIR/hook.stdout" >/dev/null \
    || fail "hook stdout is not valid JSON or hookEventName != SessionStart"

jq -e '(.systemMessage | type == "string") and (.systemMessage | length > 100)' \
  <"$TMP_DIR/hook.stdout" >/dev/null \
    || fail "systemMessage missing, not a string, or too short"

# Rendered systemMessage must NOT contain unsubstituted placeholders.
SYS_MSG=$(jq -r '.systemMessage' <"$TMP_DIR/hook.stdout")
case "$SYS_MSG" in
  *'{{'*) fail "rendered banner contains unsubstituted {{placeholder}}:
$(printf '%s' "$SYS_MSG" | grep -F '{{' | head -3)" ;;
esac
case "$SYS_MSG" in
  *'${'*) fail "rendered banner contains unsubstituted \${placeholder}:
$(printf '%s' "$SYS_MSG" | grep -F '${' | head -3)" ;;
esac

echo "NEWSBOARD-FORMAT: PASS"
echo "labels=${#REQUIRED_LABELS[@]} sections=${#REQUIRED_SECTIONS[@]} sysmsg_bytes=$(wc -c <<<"$SYS_MSG" | tr -d ' ')"
