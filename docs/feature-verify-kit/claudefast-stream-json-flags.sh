#!/usr/bin/env bash

claudefast_stream_json_flags() {
  local bin="${1:-claudefast}"
  local help_file="${2:-}"
  local debug_file="${3:-}"
  local help_text
  local help_status
  local include_partial_messages_supported=0
  local verbose_supported=0
  local hook_debug_supported=0
  local hook_evidence_mode="unsupported"
  local errexit_was_set=0

  case "$-" in
    *e*) errexit_was_set=1; set +e ;;
  esac
  help_text="$("$bin" -h 2>&1)"
  help_status=$?
  if [ "$errexit_was_set" -eq 1 ]; then
    set -e
  fi
  if [ -n "$help_file" ]; then
    printf '%s\n' "$help_text" > "$help_file"
  fi

  if [ "$help_status" -ne 0 ]; then
    printf 'FATAL: %s -h failed with exit %s\n' "$bin" "$help_status" >&2
    return "$help_status"
  fi
  if ! printf '%s\n' "$help_text" | grep -q -- "--output-format" ||
     ! printf '%s\n' "$help_text" | grep -q -- "stream-json"; then
    printf 'FATAL: %s -h did not advertise --output-format stream-json\n' "$bin" >&2
    return 2
  fi

  if printf '%s\n' "$help_text" | grep -q -- "--include-partial-messages"; then
    include_partial_messages_supported=1
  fi
  if printf '%s\n' "$help_text" | grep -q -- "--verbose"; then
    verbose_supported=1
  fi
  if printf '%s\n' "$help_text" | grep -q -- "--debug" &&
     printf '%s\n' "$help_text" | grep -q -- "--debug-file"; then
    hook_debug_supported=1
  fi

  printf '%s\n' "--output-format"
  printf '%s\n' "stream-json"
  if [ "$include_partial_messages_supported" -eq 1 ]; then
    printf '%s\n' "--include-partial-messages"
  fi
  if [ "$verbose_supported" -eq 1 ]; then
    printf '%s\n' "--verbose"
  fi
  if [ "$hook_debug_supported" -eq 1 ] && [ -n "$debug_file" ]; then
    hook_evidence_mode="debug-file"
    printf '%s\n' "--debug"
    printf '%s\n' "hooks"
    printf '%s\n' "--debug-file"
    printf '%s\n' "$debug_file"
  elif [ -z "$debug_file" ]; then
    hook_evidence_mode="not-requested"
  fi

  if [ -n "$help_file" ]; then
    cat > "${help_file}.capabilities.json" <<JSON
{
  "streamJsonSupported": true,
  "includePartialMessagesSupported": $([ "$include_partial_messages_supported" -eq 1 ] && printf true || printf false),
  "verboseSupported": $([ "$verbose_supported" -eq 1 ] && printf true || printf false),
  "hookDebugSupported": $([ "$hook_debug_supported" -eq 1 ] && printf true || printf false),
  "hookEvidenceMode": "$hook_evidence_mode",
  "hookDebugFile": "$debug_file"
}
JSON
  fi
  if [ -n "$debug_file" ] && [ "$hook_debug_supported" -ne 1 ]; then
    printf 'UNSUPPORTED: %s -h does not advertise --debug/--debug-file; hook evidence is unsupported in this environment\n' "$bin" >&2
    if [ "${CLAUDEFAST_REQUIRE_HOOK_EVIDENCE:-0}" = "1" ]; then
      return 4
    fi
  fi
}
