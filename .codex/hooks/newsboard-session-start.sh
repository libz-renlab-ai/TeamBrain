#!/usr/bin/env bash
# newsboard-session-start.sh
# 4-section ASCII duck-themed newsboard. Renders to user via Claude Code
# SessionStart `systemMessage` channel: visible in TUI, NOT in Claude context.
#
# All Chinese copy + banner template + section labels live in
# `docs/newsboard.md` (between LABELS and BANNER markers). This script only
# computes runtime data (version / commits / random feature pick) and
# substitutes tokens into the template. Edit `docs/newsboard.md` to change
# any text without touching bash.
#
# Always exits 0; never blocks.

set -u
cat >/dev/null 2>&1 || true

REPO_ROOT="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$REPO_ROOT" ]]; then
  SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)
  REPO_ROOT=$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)
fi
[[ -z "$REPO_ROOT" ]] && REPO_ROOT="$PWD"

TEMPLATE="$REPO_ROOT/docs/newsboard.md"

emit_json_msg() {
  local text="$1"
  if command -v jq >/dev/null 2>&1; then
    local j
    j=$(printf '%s' "$text" | jq -Rsa .)
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart"},"systemMessage":%s}' "$j"
  else
    local esc=${text//\\/\\\\}
    esc=${esc//\"/\\\"}
    esc=${esc//$'\n'/\\n}
    esc=${esc//$'\r'/\\r}
    esc=${esc//$'\t'/\\t}
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart"},"systemMessage":"%s"}' "$esc"
  fi
}

if [[ ! -f "$TEMPLATE" ]]; then
  emit_json_msg "newsboard: template missing — docs/newsboard.md"
  exit 0
fi

# --- Initialize all expected labels (defensive: set -u + missing labels) ---
LABEL_INSTALL_CURRENT=""
LABEL_INSTALL_MISMATCH=""
LABEL_INSTALL_UNKNOWN=""
LABEL_COMMIT_LINE=""
LABEL_TRY_LINE=""
LABEL_QUIET_WEEK=""
LABEL_RANDOM_LINE=""
LABEL_RANDOM_MISSING=""
LABEL_RANDOM_EMPTY=""

# --- Read LABELS into prefix-named vars. Markers anchored with ^...$ so prose
#     mentions of `<!-- LABELS -->` (in backticks) don't trigger marker logic. ---
while IFS=$'\t' read -r key val; do
  [[ -z "$key" ]] && continue
  printf -v "LABEL_${key}" '%s' "$val"
done < <(awk '
  /^<!-- LABELS -->$/   { in_labels = 1; next }
  /^<!-- \/LABELS -->$/ { in_labels = 0; next }
  in_labels && /^[[:space:]]*-[[:space:]]+[A-Z_]+:/ {
    sub(/\r$/, "")
    sub(/^[[:space:]]*-[[:space:]]+/, "")
    k = $0; sub(/:.*/, "", k)
    v = $0; sub(/^[^:]+:[[:space:]]/, "", v)
    print k "\t" v
  }
' "$TEMPLATE")

# Helper: substitute ${V} / ${L} / ${P} / ${C} / ${I} / ${N} / ${F} placeholders
# in a label string. Args: tmpl, then KEY=VALUE pairs.
sub_vars() {
  local s="$1"; shift
  local kv k v
  for kv in "$@"; do
    k="${kv%%=*}"
    v="${kv#*=}"
    s=${s//\$\{$k\}/$v}
  done
  printf '%s' "$s"
}

# Layout indent applied to every multi-line section. Pure formatting (not
# user-facing copy), so it lives in bash, not the .md template.
INDENT='    '

# --- Section [1]: Install ---
local_v=""; pkg_v=""
if [[ -f "$REPO_ROOT/VERSION" ]]; then
  local_v=$(tr -d '[:space:]' < "$REPO_ROOT/VERSION" 2>/dev/null || true)
fi
if [[ -f "$REPO_ROOT/package.json" ]]; then
  pkg_v=$(grep -E '^[[:space:]]*"version"' "$REPO_ROOT/package.json" 2>/dev/null \
    | head -1 \
    | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)
fi
if [[ -n "$local_v" && -n "$pkg_v" && "$local_v" != "$pkg_v" ]]; then
  INSTALL_VAL=$(sub_vars "$LABEL_INSTALL_MISMATCH" "L=$local_v" "P=$pkg_v")
elif [[ -n "$pkg_v" ]]; then
  INSTALL_VAL=$(sub_vars "$LABEL_INSTALL_CURRENT" "V=$pkg_v")
elif [[ -n "$local_v" ]]; then
  INSTALL_VAL=$(sub_vars "$LABEL_INSTALL_CURRENT" "V=$local_v")
else
  INSTALL_VAL="$LABEL_INSTALL_UNKNOWN"
fi
INSTALL="${INDENT}${INSTALL_VAL}"

# --- Sections [2] + [3]: Recent commits ---
RECENT=$(
  cd "$REPO_ROOT" 2>/dev/null && \
    git --no-optional-locks log --since="7 days ago" \
      -E --pretty="%h %s" --grep='^(feat|fix)' -3 2>/dev/null
) || RECENT=""

build_lines() {
  local label="$1" data="$2" out=""
  if [[ -z "$data" ]]; then
    printf '%s%s' "$INDENT" "$LABEL_QUIET_WEEK"
    return
  fi
  local line rendered
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    rendered=$(sub_vars "$label" "C=$line")
    out+="${INDENT}${rendered}"$'\n'
  done <<< "$data"
  printf '%s' "${out%$'\n'}"
}

JUST_SHIPPED=$(build_lines "$LABEL_COMMIT_LINE" "$RECENT")
TWO=$(printf '%s\n' "$RECENT" | head -2)
NEW_AND_TRY=$(build_lines "$LABEL_TRY_LINE" "$TWO")

# --- Section [4]: Random feature ---
CATALOG="$REPO_ROOT/docs/PRODUCT-FEATURES.md"
if [[ ! -f "$CATALOG" ]]; then
  RAND_LINE="${INDENT}${LABEL_RANDOM_MISSING}"
else
  feats=$(awk '/^[0-9]+\.[[:space:]]/ { sub(/\r$/, ""); print }' "$CATALOG" 2>/dev/null) || feats=""
  if [[ -z "$feats" ]]; then
    RAND_LINE="${INDENT}${LABEL_RANDOM_EMPTY}"
  else
    count=$(printf '%s\n' "$feats" | wc -l | tr -d ' ')
    if [[ -z "$count" || "$count" -eq 0 ]]; then
      RAND_LINE="${INDENT}${LABEL_RANDOM_EMPTY}"
    else
      idx=$(( $(date +%s) % count + 1 ))
      pick=$(printf '%s\n' "$feats" | sed -n "${idx}p")
      rendered=$(sub_vars "$LABEL_RANDOM_LINE" "I=$idx" "N=$count" "F=$pick")
      RAND_LINE="${INDENT}${rendered}"
    fi
  fi
fi

# --- Read BANNER template + substitute section placeholders ---
# Markers anchored with ^...$ to avoid matching prose backtick references.
BANNER=$(awk '
  /^<!-- BANNER-START -->$/ { in_banner = 1; next }
  /^<!-- BANNER-END -->$/   { in_banner = 0; next }
  in_banner                 { print }
' "$TEMPLATE")

# Replace {{KEY}} (multi-line value-safe via env vars).
substitute_section() {
  local key="$1" val="$2" tmpl="$3"
  TPL_KEY="$key" TPL_VAL="$val" awk '
    BEGIN {
      key = ENVIRON["TPL_KEY"]; val = ENVIRON["TPL_VAL"]
      ph = "{{" key "}}"
      pl = length(ph)
    }
    {
      line = $0
      while ((p = index(line, ph)) > 0) {
        line = substr(line, 1, p - 1) val substr(line, p + pl)
      }
      print line
    }
  ' <<< "$tmpl"
}

OUT="$BANNER"
OUT=$(substitute_section "INSTALL"      "$INSTALL"      "$OUT")
OUT=$(substitute_section "JUST_SHIPPED" "$JUST_SHIPPED" "$OUT")
OUT=$(substitute_section "NEW_AND_TRY"  "$NEW_AND_TRY"  "$OUT")
OUT=$(substitute_section "RANDOM"       "$RAND_LINE"    "$OUT")

emit_json_msg "$OUT"
exit 0
