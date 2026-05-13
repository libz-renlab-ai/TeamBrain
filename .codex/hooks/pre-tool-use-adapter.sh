#!/usr/bin/env bash
# pre-tool-use-adapter.sh
# Bridge: Codex PreToolUse stdin → TeamBrain's bin-pre-tool-use.cjs.
#
# Why this adapter exists (issue #290):
#   Codex CLI fires PreToolUse with its own stdin shape (per
#   docs/features/codex-hooks-spec.md §5.4):
#     session_id, transcript_path, cwd, hook_event_name, model, turn_id,
#     tool_name, tool_use_id, tool_input
#   Claude's bin-pre-tool-use.cjs (packages/cli/src/bin-pre-tool-use.ts)
#   accepts the SDK PreToolUseHookInput shape, which only requires
#   tool_name + tool_input as load-bearing fields — Codex's extra
#   fields (model, turn_id) are silently ignored by parseInput.
#
#   The output schema is shared: both Codex and Claude accept
#   { hookSpecificOutput: { hookEventName, permissionDecision,
#   permissionDecisionReason? } }. So a thin passthrough works.
#
# What this script does NOT do:
#   - Does NOT mutate stdin (Codex-specific fields like turn_id pass through).
#   - Does NOT remap tool_name. Codex's apply_patch alias for Edit/Write
#     is handled at the matcher level (Bash|apply_patch|WebFetch in
#     .codex/hooks.json) — keyword rules targeting "Write"/"Edit" still
#     fire if grill content matches, but tool_name semantic match operates
#     on whatever Codex sends.
#   - Does NOT touch the user's Claude config tree (no path under the
#     dotted Claude directory; no settings.json mutation). Issue #290
#     Acceptance line 3.
#
# Failure mode:
#   If bin-pre-tool-use.cjs cannot be located (TeamBrain not installed yet),
#   emit fast-allow envelope and exit 0 — never block a Codex tool call with
#   a cryptic "MODULE_NOT_FOUND".

set -u

locate_cjs() {
  # 1) User-level install (teamagent init --target=codex copies here).
  if [[ -f "$HOME/.teamagent/hooks/bin-pre-tool-use.cjs" ]]; then
    printf '%s' "$HOME/.teamagent/hooks/bin-pre-tool-use.cjs"
    return
  fi
  # 2) Project-local dist (monorepo dev / pnpm workspace).
  local repo="${CODEX_PROJECT_DIR:-$PWD}"
  local root
  root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$repo")
  if [[ -f "$root/packages/cli/dist/bin-pre-tool-use.cjs" ]]; then
    printf '%s' "$root/packages/cli/dist/bin-pre-tool-use.cjs"
    return
  fi
  # 3) Globally-installed npm package (fall back to require.resolve via node).
  local resolved
  resolved=$(node -e "try{console.log(require.resolve('@teamagent/cli/dist/bin-pre-tool-use.cjs'))}catch(_){}" 2>/dev/null)
  if [[ -n "$resolved" && -f "$resolved" ]]; then
    printf '%s' "$resolved"
    return
  fi
  printf ''
}

cjs=$(locate_cjs)
if [[ -z "$cjs" || ! -f "$cjs" ]]; then
  # Fast-allow envelope — match shape from bin-pre-tool-use.ts envelope().
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}\n'
  exit 0
fi

# Pipe stdin through unchanged; bin-pre-tool-use.cjs's parseInput tolerates
# Codex-only fields (model, turn_id) because it only requires tool_name.
exec node "$cjs"
