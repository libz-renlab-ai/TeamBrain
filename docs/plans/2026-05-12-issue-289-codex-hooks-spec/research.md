```
   __                __                   _              _
  / /   _____  ___  / /__  __  _   ___  _(_)__ _      __(_)
 / /   / ___/ / _ \/ //_/ \ \//  / _ \/ / / -_) | /| / / /
/_/   /___/  \___/_/|_|   /_\_\/_//_/_/_/\__/|/_/_/_/_/
                                                          
            Issue #289 — Codex Hooks Research Notes        
            Raw findings + URLs (2026-05-12)              
```

# Research — Codex hook registry format + event parity (issue #289)

This file is the **raw evidence** behind `docs/features/codex-hooks-spec.md` and the parity table extension to `docs/features/hooks-status.md`. Direct quotes + URLs only. Conclusions live in those two deliverables.

## Sources (all WebFetched 2026-05-12)

| # | URL | Confidence |
|---|-----|------------|
| S1 | <https://developers.openai.com/codex/hooks> | OpenAI official docs (canonical) |
| S2 | <https://developers.openai.com/codex/config-reference> | OpenAI official docs (canonical) |
| S3 | <https://developers.openai.com/codex/config-advanced> | OpenAI official docs (canonical) |
| S4 | <https://developers.openai.com/codex/config-sample> | OpenAI official docs (canonical) |
| S5 | <https://github.com/openai/codex/issues/2109> | Original "Event Hooks" feature request — CLOSED (shipped) |
| S6 | <https://github.com/openai/codex/issues/21639> | Active regression — Codex Desktop 0.129.0-alpha.15 hooks silently dead — OPEN |

## S1 — `developers.openai.com/codex/hooks` (events + payloads + outputs)

### Six officially documented events

`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`.

The page does NOT mention `PreCompact`, `SessionEnd`, `SubagentStop`, `Notification`. Treat those as **absent** from Codex (Claude has them; Codex does not).

### Common stdin fields (all events)

```
session_id        : string
transcript_path   : string | null
cwd               : string
hook_event_name   : string
model             : string
turn_id           : string  (turn-scoped events only)
```

### Per-event extra stdin fields (verbatim from S1)

- `SessionStart`: `source` (string) — `"startup"` | `"resume"` | `"clear"`
- `UserPromptSubmit`: `turn_id`, `prompt` (string, user prompt about to be sent)
- `PreToolUse`: `turn_id`, `tool_name`, `tool_use_id`, `tool_input` (JSON; `tool_input.command` for Bash/apply_patch)
- `PermissionRequest`: `turn_id`, `tool_name`, `tool_input`, `tool_input.description` (string | null, approval reason)
- `PostToolUse`: `turn_id`, `tool_name`, `tool_use_id`, `tool_input`, `tool_response` (JSON, MCP result or tool output)
- `Stop`: `turn_id`, `stop_hook_active` (bool, whether already continued), `last_assistant_message` (string | null)

### Output schema — common fields

```json
{
  "continue": true,
  "stopReason": "optional string",
  "systemMessage": "optional string",
  "suppressOutput": false
}
```

- `continue: false` — marks hook run as stopped
- `stopReason` — recorded as stop reason
- `systemMessage` — surfaced as UI warning
- `suppressOutput` — **parsed today but not yet implemented** (S1 verbatim)

### Output schema — event-specific (verbatim shapes)

`SessionStart` / `UserPromptSubmit`:
```json
{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "string added as developer context" } }
```

`PreToolUse` (block):
```json
{ "hookSpecificOutput": { "hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "string" } }
```
Or legacy: `{"decision": "block", "reason": "string"}`.

`PermissionRequest` (allow / deny):
```json
{ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": {"behavior": "allow"} } }
{ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": {"behavior": "deny", "message": "string"} } }
```

`PostToolUse`:
```json
{ "decision": "block", "reason": "string", "hookSpecificOutput": { "hookEventName": "PostToolUse", "additionalContext": "string" } }
```

`Stop` (continuation prompt):
```json
{ "decision": "block", "reason": "continuation prompt text" }
```

### Matcher

Regex string filtering when hooks fire. `"*"`, `""`, or omitted = match all.

| Event | Filters on | Notes |
|-------|------------|-------|
| `PreToolUse` | `tool_name` | `Bash`, `apply_patch` (aliases: `Edit`, `Write`), MCP tool names |
| `PostToolUse` | `tool_name` | same |
| `PermissionRequest` | `tool_name` | same |
| `SessionStart` | `source` | `startup` \| `resume` \| `clear` |
| `UserPromptSubmit` | n/a | matcher ignored |
| `Stop` | n/a | matcher ignored |

### Scope

- **Turn-scoped** (carry `turn_id`): `PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`
- **Session-scoped**: `SessionStart`

### Timeout

S1 verbatim: "If `timeout` is omitted, Codex uses `600` seconds." No per-event variation documented.

### Handler types

Only `command` is documented in S1:
```json
{ "type": "command", "command": "string", "statusMessage": "optional", "timeout": 30 }
```

`prompt` and `agent` handler types appeared in earlier search-result snippets but **are NOT in the canonical S1 page as of fetch date** — treat as `unknown` (do not promise parity).

## S2 — `developers.openai.com/codex/config-reference` (file locations + trust)

- User-level inline: `~/.codex/config.toml` with `[hooks]` table
- Project-scoped inline: `<repo>/.codex/config.toml` with `[hooks]` table
- JSON form: `hooks.json` next to active config layers (locations confirmed in S3)
- Admin-enforced: `requirements.toml` with `[hooks]` `managed_dir` / `windows_managed_dir` + per-event arrays

S2 verbatim: *"Untrusted projects skip project-scoped `.codex/` layers, including project-local config, hooks, and rules."*

## S3 — `developers.openai.com/codex/config-advanced` (activation + merge)

- Activation flag (verbatim from S6 reproducer, consistent with S3): `[features]` table with `codex_hooks = true`
- File locations confirmed: `~/.codex/hooks.json`, `<repo>/.codex/hooks.json`
- Trust: project-local hooks load only when project `.codex/` layer is trusted; user-level hooks are independent of project trust
- Conflict in single layer: if `hooks.json` AND inline `[hooks]` co-exist, **both load + warning** (S3 verbatim: *"Codex loads both and warns. Prefer one representation per layer."*)
- Merge across layers: higher-precedence layers do **not replace** lower-precedence; matching hooks accumulate (additive merge)

S3 explicitly **does NOT cover**:
- Plugin manifest hook bundling syntax (mentioned but schema not on the page)
- `requirements.toml` admin enforcement details
- Environment variables like `CODEX_HOOKS_DIR` / `CODEX_CONFIG_DIR`
- The exact mechanism by which a project gets marked trusted

→ For #289 spec we mark these `unknown` rather than guess.

## S4 — `developers.openai.com/codex/config-sample` (canonical TOML snippet)

The only canonical `[hooks]` snippet on the docs site:

```toml
[[hooks.PreToolUse]]
matcher = "^Bash$"

[[hooks.PreToolUse.hooks]]
type = "command"
command = 'python3 "/absolute/path/to/pre_tool_use_policy.py"'
timeout = 30
statusMessage = "Checking Bash command"
```

S4 also notes lifecycle hooks "can be configured here inline or in a sibling hooks.json" but does **not** show the JSON equivalent of the same snippet.

## S5 — `github.com/openai/codex/issues/2109` (origin)

- Title: *Event Hooks*
- State: **CLOSED** (i.e. feature shipped)
- Body verbatim: *"Let us define event hooks with pattern matching, to trigger scripts/commands before/after codex behaviors."*

This is the issue that created the entire hooks subsystem.

## S6 — `github.com/openai/codex/issues/21639` (active regression)

- Title: *Hooks no longer run after Codex Desktop update*
- State: **OPEN**
- Affected version: Codex Desktop 26.506.21252 / cli_version 0.129.0-alpha.15
- Working version: cli_version 0.128.0-alpha.1
- Symptom: SessionStart + PreToolUse hooks both silently fail to fire (no error)
- Reproducer config (verbatim user content) confirms:
  - `.codex/config.toml` activation flag: `[features] codex_hooks = true`
  - `.codex/hooks.json` schema:
    ```json
    {
      "hooks": {
        "SessionStart": [
          {
            "matcher": "startup|resume|clear",
            "hooks": [
              { "type": "command", "command": "bash '/abs/path/.codex/hooks/session_start_hook.sh'", "statusMessage": "Session start hook" }
            ]
          }
        ],
        "PreToolUse": [
          { "matcher": "Bash", "hooks": [ { "type": "command", "command": "bash '/abs/path/.codex/hooks/pre_tool_use_hook.sh'" } ] }
        ]
      }
    }
    ```
  - Stdout of SessionStart hook is "injected into the session as a developer message"

→ This gives us the **canonical hooks.json schema** that the S4 page omits.

## Comparison — Codex stdin payload vs Claude Agent SDK `HookInput`

`packages/types/src/hook-protocol.ts` (this repo) defines Claude `PreToolUseHookInput` as:
```
session_id, hook_event_name, cwd, permission_mode, transcript_path,
tool_name, tool_input, tool_use_id, agent_id?, agent_type?
```

Diff vs Codex `PreToolUse`:

| Field | Claude | Codex | Note |
|-------|--------|-------|------|
| `session_id` | ✅ | ✅ | shared |
| `hook_event_name` | ✅ | ✅ | shared |
| `cwd` | ✅ | ✅ | shared |
| `transcript_path` | ✅ | ✅ | Codex allows `null`; Claude usually a path |
| `tool_name` | ✅ | ✅ | Codex tool names include `Bash`, `apply_patch`, MCP names; Claude uses `Bash`/`Write`/`Edit`/`WebFetch`/MCP `mcp__server__tool` |
| `tool_input` | ✅ | ✅ | shared |
| `tool_use_id` | ✅ | ✅ | shared |
| `permission_mode` | ✅ | ❌ | Codex hook payload has no `permission_mode`; Codex models permissions through `PermissionRequest` event instead |
| `agent_id` / `agent_type` | ✅ (optional, subagent only) | ❌ | Codex has no equivalent — no documented subagent hook context |
| `model` | ❌ | ✅ | Codex carries active model slug into every hook payload; Claude does not |
| `turn_id` | ❌ | ✅ | Codex turn-scoped events all carry `turn_id`; Claude has no documented `turn_id` field |

## Comparison — Codex output vs Claude Agent SDK `HookOutput`

| Output field | Claude | Codex | Note |
|--------------|--------|-------|------|
| `continue` | ✅ | ✅ | shared semantics |
| `systemMessage` | ✅ | ✅ | shared |
| `suppressOutput` | ✅ | parsed-only | Codex docs explicitly say "parsed but not implemented" |
| `stopReason` | n/a | ✅ | Codex-specific |
| `hookSpecificOutput.hookEventName` | ✅ | ✅ | shared |
| `hookSpecificOutput.additionalContext` | ✅ | ✅ | shared (used by SessionStart / UserPromptSubmit / PostToolUse) |
| `hookSpecificOutput.permissionDecision` (`"deny"`) | ✅ (PreToolUse) | ✅ (PreToolUse) | shared |
| `hookSpecificOutput.permissionDecisionReason` | ✅ | ✅ | shared |
| Legacy `{decision: "block", reason}` | ✅ | ✅ | both accept legacy shape |
| `decision: {behavior: "allow"\|"deny"}` (PermissionRequest) | n/a | ✅ | Codex-only (no Claude equivalent event) |
| `updatedInput` (PreToolUse) | ✅ | ❌ documented | Codex docs do not list a way to mutate `tool_input`; treat as `absent` until proved otherwise |

## Open question NOT resolvable from public docs

1. Does `~/.codex/config.toml` `[features] codex_hooks = true` need to also be set per project, or does the user-level flag enable hooks repo-wide?
2. Plugin manifest hook bundling: schema not on docs.
3. `requirements.toml` admin-enforced hooks: precedence vs user/project not on docs.
4. Whether `agent` and `prompt` handler types ever shipped (S1 only documents `command`; older snippets mention agent/prompt — likely `unknown` until codex-rs source is read).
5. Whether `updatedInput` mutation is supported by PreToolUse output (Claude has it; Codex docs do not list it).
6. The Desktop 0.129.0-alpha.15 regression (#21639) is **still OPEN** at fetch time — the spec must mark current Codex hook behavior as "documented but observably broken on latest Desktop pre-release."

## What this research enables

- Fill `docs/features/codex-hooks-spec.md` with one row per event marked `supported` / `absent` / `unknown` plus stdin shape vs Claude.
- Append a parity table draft to `docs/features/hooks-status.md` so #293 can land directly on top of this draft.
- Note `unknown`s honestly; do **not** promise parity for events Codex doesn't actually fire (#289 acceptance criterion 3).
