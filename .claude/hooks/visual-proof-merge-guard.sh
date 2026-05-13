#!/usr/bin/env bash
# visual-proof-merge-guard.sh — PreToolUse Bash hook
#
# Enforces docs/VISUAL-PROOF-HUMAN-MERGE.md §3 "forbidden merge paths": blocks any
# agent-issued `gh pr merge` command when the target PR's body contains the
# H2 heading `## Visual proof of work` (the §0.5 trigger predicate).
#
# Contract per Claude Code hook spec:
#   stdin  = JSON with .tool_name, .tool_input.command
#   exit 0 = allow tool call
#   exit 2 = block tool call (stderr shown to model + user)
#
# Failure-open by design: jq / gh / network errors fall through to exit 0.
# This is a soft guardrail, not a hard mutex (§7 of docs/VISUAL-PROOF-HUMAN-MERGE.md);
# the GitHub label option (§7 follow-up #2) is the proper mutex implementation.
# Failure-closed would block legitimate non-visual-proof merges whenever the
# network blips, which is worse than the failure-open false-negative.

set -u

# Read hook payload from stdin (Claude Code passes JSON).
payload="$(cat 2>/dev/null || echo '{}')"

# Require jq to parse the payload. Failure-open if missing.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

tool_name="$(jq -r '.tool_name // empty' <<<"$payload" 2>/dev/null)"
[ "$tool_name" = "Bash" ] || exit 0

command_str="$(jq -r '.tool_input.command // empty' <<<"$payload" 2>/dev/null)"

# Match `gh pr merge <N>` with optional flags. Skip if no PR number found.
if ! echo "$command_str" | grep -qE 'gh[[:space:]]+pr[[:space:]]+merge'; then
  exit 0
fi

pr_number="$(echo "$command_str" | grep -oE 'gh[[:space:]]+pr[[:space:]]+merge[[:space:]]+[0-9]+' | grep -oE '[0-9]+$' | head -1)"
if [ -z "$pr_number" ]; then
  # `gh pr merge` without explicit number relies on the current branch's
  # associated PR. Detect via `gh pr view --json number`.
  if command -v gh >/dev/null 2>&1; then
    pr_number="$(gh pr view --json number --jq .number 2>/dev/null || echo '')"
  fi
fi

# Still no PR number → can't query body → failure-open.
if [ -z "$pr_number" ]; then
  exit 0
fi

# Query PR body. Failure-open on gh / network errors.
if ! command -v gh >/dev/null 2>&1; then
  exit 0
fi

pr_body="$(gh pr view "$pr_number" --json body --jq .body 2>/dev/null || echo '')"
if [ -z "$pr_body" ]; then
  exit 0
fi

# §0.5 trigger predicate: PR body contains literal H2 `## Visual proof of work`.
if echo "$pr_body" | grep -qF '## Visual proof of work'; then
  cat >&2 <<MSG
BLOCKED: docs/VISUAL-PROOF-HUMAN-MERGE.md §3 "forbidden merge paths" — agent cannot
\`gh pr merge\` on PR #${pr_number} because the PR body contains a
\`## Visual proof of work\` section (per §0.5 trigger predicate).

Per VISUAL-PROOF-HUMAN-MERGE.md §3, the only allowed merge action for visual-proof
PRs is: a real human clicking \`Squash and merge\` in the GitHub web UI
after manually verifying the §2 solid checklist passes.

If this PR was misclassified (no real visual proof, body header is a
mistake), edit the PR body to remove the H2 and retry — or open the PR
in GitHub UI and merge by hand.

To bypass this hook for emergency hotfix scenarios (use sparingly):
  TEAMAGENT_BYPASS_VISUAL_PROOF_GUARD=1 gh pr merge ${pr_number} --squash --delete-branch
MSG
  # Honor the bypass env var as documented in the error message above.
  if [ "${TEAMAGENT_BYPASS_VISUAL_PROOF_GUARD:-}" = "1" ]; then
    echo "(bypass env var set — allowing)" >&2
    exit 0
  fi
  exit 2
fi

exit 0
