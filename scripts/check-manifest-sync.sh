#!/usr/bin/env bash
set -euo pipefail

#
# scripts/check-manifest-sync.sh — lock 5-section manifest sync (issue #155 Q6=B)
# ===============================================================================
#
# Per the issue #155 grill (Q6 option B), `docs/install-manifest.txt` is the
# canonical source of truth for the 5-section install manifest. This file is
# referenced from THREE places:
#
#   1. docs/install-manifest.txt        (canonical source — the file itself)
#   2. release/install.sh               (embeds same content as a heredoc; remote
#                                        curl|bash cannot depend on local file)
#   3. scripts/bootstrap.sh             (runtime `cat docs/install-manifest.txt` —
#                                        no embedded copy, so no drift risk for B)
#
# This script verifies (1) and (2) are byte-identical. Bootstrap.sh's runtime
# output is the file content directly, so it cannot drift.
#
# Run locally:
#   bash scripts/check-manifest-sync.sh
#
# Run from CI:
#   bash scripts/check-manifest-sync.sh || exit 1   (workflow fails the PR)
#

REPO_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
MANIFEST_FILE="$REPO_ROOT/docs/install-manifest.txt"
INSTALL_SCRIPT="$REPO_ROOT/release/install.sh"

if [ ! -f "$MANIFEST_FILE" ]; then
  printf 'error: missing %s\n' "$MANIFEST_FILE" >&2
  exit 1
fi
if [ ! -f "$INSTALL_SCRIPT" ]; then
  printf 'error: missing %s\n' "$INSTALL_SCRIPT" >&2
  exit 1
fi

# Extract heredoc content from install.sh: lines between `<<'MANIFEST_EOF'` and
# the closing `MANIFEST_EOF` line. The closing marker MUST be at the start of a
# line (this is bash heredoc semantics with a quoted opener).
TMP_HEREDOC=$(mktemp)
trap 'rm -f "$TMP_HEREDOC"' EXIT

awk '
  /<<'\''MANIFEST_EOF'\''/ { in_heredoc = 1; next }
  in_heredoc && /^MANIFEST_EOF$/ { in_heredoc = 0; exit }
  in_heredoc { print }
' "$INSTALL_SCRIPT" > "$TMP_HEREDOC"

if [ ! -s "$TMP_HEREDOC" ]; then
  printf 'error: failed to extract MANIFEST_EOF heredoc from %s\n' "$INSTALL_SCRIPT" >&2
  printf 'expected a `cat <<%s` block ending with `%s` on its own line.\n' "'MANIFEST_EOF'" "MANIFEST_EOF" >&2
  exit 1
fi

# Diff the two; exit 0 if identical, 1 if different.
if diff -u "$MANIFEST_FILE" "$TMP_HEREDOC" > /tmp/manifest-diff.txt 2>&1; then
  printf '[manifest-sync] OK: docs/install-manifest.txt == release/install.sh heredoc (%s lines)\n' "$(wc -l < "$MANIFEST_FILE")"
  exit 0
fi

printf '[manifest-sync] FAIL: docs/install-manifest.txt and release/install.sh heredoc have drifted!\n' >&2
printf '\nDiff:\n' >&2
cat /tmp/manifest-diff.txt >&2
printf '\nFix: edit one to match the other; both must be byte-identical.\n' >&2
printf '  - canonical source: docs/install-manifest.txt\n' >&2
printf '  - install.sh heredoc lives between `<<%s` and `%s` markers in release/install.sh\n' "'MANIFEST_EOF'" "MANIFEST_EOF" >&2
exit 1
