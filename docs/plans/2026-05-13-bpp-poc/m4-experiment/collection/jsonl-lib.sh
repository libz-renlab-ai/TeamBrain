#!/usr/bin/env bash
# Shared helper for the m4-experiment collection scripts.
#
# start-task.sh, end-task.sh and correction-hook.sh all append to the same
# per-member daily JSONL. correction-hook.sh fires from a Claude Code
# UserPromptSubmit hook and can race a manual end-task.sh invocation. Each
# JSON line is well under PIPE_BUF (4 KB on Linux) so a bare `>>` append is
# atomic on local Linux filesystems — but not guaranteed on NFS / SMB / macOS.
# append_jsonl serializes appends behind flock when flock is available, and
# falls back to a bare append (still atomic for sub-PIPE_BUF lines) otherwise.
#
# Source this file, then call:  append_jsonl <file> <single-line-json>

append_jsonl() {
  local file="$1" line="$2"
  local dir
  dir="$(dirname "$file")"
  mkdir -p "$dir"
  if command -v flock >/dev/null 2>&1; then
    # Serialize behind a per-file lock. The subshell holds the lock only for
    # the duration of the append.
    (
      flock 9
      printf '%s\n' "$line" >> "$file"
    ) 9>"$file.lock"
  else
    # No flock (e.g. stock Windows Git Bash): bare append. Lines are
    # sub-PIPE_BUF so this is atomic on local filesystems.
    printf '%s\n' "$line" >> "$file"
  fi
}

# The collection scripts hand-build JSON with printf. To keep that safe, every
# value spliced into a JSON line must be a constrained identifier with no
# quotes / backslashes / newlines. These validators reject anything outside a
# safe charset BEFORE it reaches printf, so the emitted JSONL stays parseable.
require_safe_member() {
  # member id: letters, digits, dot, dash, underscore, @ (for email-style ids)
  [[ "$1" =~ ^[A-Za-z0-9._@-]+$ ]] || {
    echo "member id must match ^[A-Za-z0-9._@-]+\$ (got: '$1')" >&2
    exit 2
  }
}

require_safe_group() {
  # group is a closed enum
  [[ "$1" == "mining-enabled" || "$1" == "mining-disabled" ]] || {
    echo "group must be 'mining-enabled' or 'mining-disabled' (got: '$1')" >&2
    exit 2
  }
}
