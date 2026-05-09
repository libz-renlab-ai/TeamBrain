#!/usr/bin/env bash
# newsboard-session-start.sh
# 4-section ASCII duck-themed newsboard. Writes to stderr only.
# Per docs/plans/2026-05-09-newsboard-session-start/plan.md.
# Always exits 0; never blocks; never writes to stdout.

set -u

# Drain stdin (SessionStart payload) without parsing.
cat >/dev/null 2>&1 || true

# Resolve repo root. Prefer CLAUDE_PROJECT_DIR when set by Claude Code;
# fall back to the directory two levels above this script.
REPO_ROOT="${CLAUDE_PROJECT_DIR:-}"
if [[ -z "$REPO_ROOT" ]]; then
  SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)
  REPO_ROOT=$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)
fi
[[ -z "$REPO_ROOT" ]] && REPO_ROOT="$PWD"

emit() { printf '%s\n' "$*" >&2; }

header() {
  emit ""
  emit "             __                                                "
  emit "            /  \\____      呷呷~ welcome back                    "
  emit "           ( o    o )    TEAMBRAIN NEWSBOARD                   "
  emit "            \\______/     (stderr only, not seen by Claude)     "
  emit "               ^^                                              "
  emit "  +--------------------------------------------------------+"
}

footer() {
  emit "  +--------------------------------------------------------+"
  emit "    (this banner is just stderr to you, not Claude context)"
  emit ""
}

# Section 1: Install / Update
section_install() {
  local local_v="" pkg_v=""
  if [[ -f "$REPO_ROOT/VERSION" ]]; then
    local_v=$(tr -d '[:space:]' < "$REPO_ROOT/VERSION" 2>/dev/null || true)
  fi
  if [[ -f "$REPO_ROOT/package.json" ]]; then
    pkg_v=$(grep -E '^[[:space:]]*"version"' "$REPO_ROOT/package.json" 2>/dev/null \
      | head -1 \
      | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)
  fi
  emit "  [1] Install / Update"
  if [[ -n "$local_v" && -n "$pkg_v" && "$local_v" != "$pkg_v" ]]; then
    emit "      VERSION=$local_v   package.json=$pkg_v   -> run: pnpm teamagent update"
  elif [[ -n "$pkg_v" ]]; then
    emit "      current: $pkg_v"
  elif [[ -n "$local_v" ]]; then
    emit "      VERSION: $local_v"
  else
    emit "      version unknown"
  fi
}

# Cached once for sections 2 + 3 (single git log call to stay <500ms).
# -E for ERE alternation (less ambiguous than BRE backslash-pipe).
RECENT_COMMITS=$(
  cd "$REPO_ROOT" 2>/dev/null && \
    git --no-optional-locks log --since="7 days ago" \
      -E --pretty="%h %s" --grep='^(feat|fix)' -3 2>/dev/null
) || RECENT_COMMITS=""

# Section 3: Just shipped
section_just_shipped() {
  emit "  [3] Just shipped (last 7 days)"
  if [[ -z "$RECENT_COMMITS" ]]; then
    emit "      quiet week  no feat/fix commits in last 7 days"
  else
    while IFS= read -r line; do
      [[ -n "$line" ]] && emit "      - $line"
    done <<< "$RECENT_COMMITS"
  fi
}

# Section 2: New + (assumed) unused -- static label, no telemetry
section_new_and_try() {
  emit "  [2] New + haven't tried?"
  local two
  two=$(printf '%s\n' "$RECENT_COMMITS" | head -2)
  if [[ -z "$two" || "$two" == "" ]]; then
    emit "      haven't tried?  quiet week"
  else
    while IFS= read -r line; do
      [[ -n "$line" ]] && emit "      haven't tried?  give it a try: $line"
    done <<< "$two"
  fi
}

# Section 4: today's random feature from PRODUCT-FEATURES.md
section_random() {
  emit "  [4] Today's random feature"
  local catalog="$REPO_ROOT/docs/PRODUCT-FEATURES.md"
  if [[ ! -f "$catalog" ]]; then
    emit "      feature catalog missing"
    return
  fi
  local lines
  # sub(/\r$/,"") strips CRLF from Windows checkouts (core.autocrlf=true).
  lines=$(awk '/^[0-9]+\.[[:space:]]/ { sub(/\r$/, ""); print }' "$catalog" 2>/dev/null) || true
  if [[ -z "$lines" ]]; then
    emit "      feature catalog empty"
    return
  fi
  local count
  count=$(printf '%s\n' "$lines" | wc -l | tr -d ' ')
  [[ -z "$count" || "$count" -eq 0 ]] && { emit "      feature catalog empty"; return; }
  local idx=$(( $(date +%s) % count + 1 ))
  local pick
  pick=$(printf '%s\n' "$lines" | sed -n "${idx}p")
  emit "      pick #$idx of $count: $pick"
}

main() {
  header
  section_install
  emit ""
  section_just_shipped
  emit ""
  section_new_and_try
  emit ""
  section_random
  footer
}

main || true
exit 0
