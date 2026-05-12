#!/usr/bin/env bash
# __tests__/multi-user-sandbox.test.sh — smoke test for scripts/multi-user-sandbox.sh
#
# Usage:
#   bash scripts/__tests__/multi-user-sandbox.test.sh
#
# Scope (no network, no pnpm build):
#   - Copies the script into a tempdir so SANDBOX_ROOT lives in $TMP/.sandbox
#   - help exits 0 and mentions every subcommand
#   - list on an empty tree reports "(no users; …)"
#   - add alice bob carol creates the right per-user tree
#   - list filled shows three users
#   - invalid user names (../etc, "a b", "")  are rejected (exit 2)
#   - init / as both fail with exit 2 when the shared teamagent binary is missing
#   - reset removes .sandbox/users/ but keeps .sandbox/
#
# Exit codes:
#   0  — PASS
#   1  — FAIL

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$REPO_ROOT" ]]; then
  echo "SKIP: cannot determine repo root (not inside a git repo)" >&2
  exit 0
fi

SRC="$REPO_ROOT/scripts/multi-user-sandbox.sh"
if [[ ! -f "$SRC" ]]; then
  echo "FAIL: $SRC not found" >&2
  exit 1
fi

TMP="$(mktemp -d -t mu-sandbox-test-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts" "$TMP/packages/teamagent"
cp "$SRC" "$TMP/scripts/multi-user-sandbox.sh"
chmod +x "$TMP/scripts/multi-user-sandbox.sh"
SH="$TMP/scripts/multi-user-sandbox.sh"

fail() { echo "FAIL: $*" >&2; exit 1; }

# ── help ──────────────────────────────────────────────────────────────────────
out="$("$SH" --help 2>&1)"
for sub in setup add init as list reset; do
  echo "$out" | grep -q "^  $sub " || fail "help missing subcommand '$sub'"
done

# ── list empty ────────────────────────────────────────────────────────────────
out="$("$SH" list 2>&1)"
echo "$out" | grep -q "no users" || fail "list-empty should mention 'no users', got: $out"

# ── add three users ──────────────────────────────────────────────────────────
"$SH" add alice bob carol >/dev/null || fail "add alice bob carol exited non-zero"
for u in alice bob carol; do
  for dir in home/.claude home/.teamagent project/.claude project/.codex project/.teamagent; do
    [[ -d "$TMP/.sandbox/users/$u/$dir" ]] || fail "missing $TMP/.sandbox/users/$u/$dir"
  done
  [[ -f "$TMP/.sandbox/users/$u/.sandbox-user" ]] || fail "missing marker file for $u"
done

# ── list filled ──────────────────────────────────────────────────────────────
out="$("$SH" list 2>&1)"
for u in alice bob carol; do
  echo "$out" | grep -q "^$u " || fail "list should mention user '$u', got: $out"
done

# ── idempotency: re-adding alice is a no-op (exit 0, no error) ───────────────
"$SH" add alice >/dev/null || fail "re-add alice should be idempotent"

# ── invalid names rejected ────────────────────────────────────────────────────
# Leading `-` is forbidden to keep argv-injection-shaped names off disk
# (-rf / --help / -n would be flag-injection bait for any downstream tool).
for bad in "../etc" "a b" "" "alice/" "." "-rf" "--help" "-n" "-"; do
  if "$SH" add "$bad" >/dev/null 2>&1; then
    fail "invalid user name '$bad' was accepted (should reject)"
  fi
done

# ── init / as without setup → exit 2 ─────────────────────────────────────────
if "$SH" init alice >/dev/null 2>&1; then
  fail "init without setup should exit non-zero"
fi
if "$SH" as alice doctor >/dev/null 2>&1; then
  fail "as without setup should exit non-zero"
fi

# ── reset removes users/ but keeps .sandbox/ ─────────────────────────────────
"$SH" reset >/dev/null || fail "reset exited non-zero"
[[ -d "$TMP/.sandbox/users" ]] && fail ".sandbox/users still exists after reset"
[[ -d "$TMP/.sandbox" ]]       || fail ".sandbox should still exist after reset"

# ── reset on an already-empty tree is a no-op ────────────────────────────────
"$SH" reset >/dev/null || fail "reset-on-empty should exit zero"

echo "PASS: scripts/multi-user-sandbox.sh smoke test ($(date -u +%FT%TZ))"
