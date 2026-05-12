```
       ____           __                __                __        
      / ___|___   __| | ___ __  __    / /_   ____  ____ / /_______
     / /   / _ \ / _` |/ _ \\ \/ /   / __ \ / __ \/ __ \/ //_/ ___/
    / /___| (_) | (_| |  __/ >  <   / / / // /_/ / /_/ / ,< (__  ) 
    \____/ \___/ \__,_|\___|/_/\_\ /_/ /_/ \____/\____/_/|_/____/  
                                                                    
        Codex hook surface — registry, events, payloads, parity     
        Sources: research.md (issue #289 + 6 verbatim URLs)         
        Status: research draft for sub-issues #290 / #291 / #293    
```

# Codex hook surface (research draft, issue #289)

This document is the single source of truth for **what Codex CLI's hook surface looks like today** (registry format, supported events, stdin payload shape, output schema, scope, matcher semantics) and **how it lines up with Claude Agent SDK** as already documented in [`docs/features/hooks-status.md`](./hooks-status.md). It is the deliverable for TeamBrain GitHub issue #289 (epic #271; siblings #290, #291, #292, #293).

Raw evidence + verbatim quotes + URLs: [`../plans/2026-05-12-issue-289-codex-hooks-spec/research.md`](../plans/2026-05-12-issue-289-codex-hooks-spec/research.md). Judge harness: [`../plans/2026-05-12-issue-289-codex-hooks-spec/judge.md`](../plans/2026-05-12-issue-289-codex-hooks-spec/judge.md).

> **Scope guardrail.** Per #289 acceptance criterion #3 — *"No claims of parity for events Codex does not actually fire"* — every event row carries an explicit `supported` / `absent` / `unknown` verdict. Anything not on Codex's official docs surface is `absent` or `unknown`, never silently mirrored from Claude.

## Sources (canonical)

| ID | URL |
|----|-----|
| S1 | <https://developers.openai.com/codex/hooks> |
| S2 | <https://developers.openai.com/codex/config-reference> |
| S3 | <https://developers.openai.com/codex/config-advanced> |
| S4 | <https://developers.openai.com/codex/config-sample> |
| S5 | <https://github.com/openai/codex/issues/2109> |
| S6 | <https://github.com/openai/codex/issues/21639> |

All field names, event names, JSON snippets, and TOML snippets in this doc trace back to one of these six URLs (see `research.md` for the verbatim quote + the section). If a row says `unknown`, it means none of S1–S6 documented it as of fetch date 2026-05-12.

## 1. Registry format — where Codex looks for hook configs

Codex loads lifecycle hooks from **two file formats** in **up to four locations**:

| Format | User-level path | Project-level path |
|--------|-----------------|--------------------|
| Inline `[hooks]` table inside `config.toml` | `~/.codex/config.toml` | `<repo>/.codex/config.toml` |
| Standalone JSON | `~/.codex/hooks.json` | `<repo>/.codex/hooks.json` |

Two layer rules from S3:

- **Within a single layer**, if both `hooks.json` and inline `[hooks]` exist, Codex loads both AND emits a startup warning. Pick one representation per layer.
- **Across layers**, higher-precedence layers (project) **do not replace** lower-precedence (user); matching hooks accumulate (additive merge).

Activation flag (per S6 reproducer, consistent with S3) — Codex hooks only run when this is set in `config.toml`:

```toml
[features]
codex_hooks = true
```

Trust gate (verbatim from S2): *"Untrusted projects skip project-scoped `.codex/` layers, including project-local config, hooks, and rules."* Project-level hooks therefore require the project to be marked trusted (mechanism `unknown` from public docs — see §8 Open questions, item #6). User-level hooks load regardless of project trust.

Admin-enforced overlay (referenced in S2 only, schema not documented): a `requirements.toml` exposes `[hooks]` with `managed_dir` / `windows_managed_dir` and per-event arrays. Treat as `unknown` until codex-rs source resolves it.

## 2. Canonical TOML example — verbatim from S4

```toml
[[hooks.PreToolUse]]
matcher = "^Bash$"

[[hooks.PreToolUse.hooks]]
type = "command"
command = 'python3 "/absolute/path/to/pre_tool_use_policy.py"'
timeout = 30
statusMessage = "Checking Bash command"
```

Notes:

- The outer `[[hooks.PreToolUse]]` table-of-arrays carries the **matcher**.
- The inner `[[hooks.PreToolUse.hooks]]` table-of-arrays carries each **handler** (you can register multiple handlers per matcher).
- Handler fields: `type` (only `command` documented in S1; `prompt` and `agent` are `unknown`), `command`, `timeout` (default 600s per S1 — *"If `timeout` is omitted, Codex uses `600` seconds."*), `statusMessage` (UI label).

## 3. Canonical hooks.json example — from S6 reproducer

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "bash '/absolute/path/to/project/.codex/hooks/session_start_hook.sh'",
            "statusMessage": "Session start hook"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "bash '/absolute/path/to/project/.codex/hooks/pre_tool_use_hook.sh'" }
        ]
      }
    ]
  }
}
```

Top-level wrapper is `"hooks"`; each event key holds an array of `{matcher, hooks: [{type, command, ...}]}` blocks. Identical structure to the inline TOML form, just JSON-shaped.

## 4. Events — supported / absent / unknown (one row per event)

The table compares Codex's hook surface against the 8-event Claude inventory documented in [`hooks-status.md`](./hooks-status.md), plus Codex's one extra event (`PermissionRequest`) that has no Claude equivalent.

| # | Event | Codex | Scope (Codex) | Codex matcher channel | Claude analog (per `hooks-status.md`) |
|---|-------|-------|---------------|------------------------|----------------------------------------|
| 1 | `SessionStart` | supported | session | regex on `source` (`startup` \| `resume` \| `clear`) | `bin-session-start.cjs` (user-level only, per `hooks-status.md` §1) |
| 2 | `UserPromptSubmit` | supported | turn | matcher ignored | `bin-user-prompt-submit.cjs` (per `hooks-status.md` §2) |
| 3 | `PreToolUse` | supported | turn | regex on `tool_name` (`Bash`, `apply_patch` aliasing `Edit`/`Write`, MCP names) | `bin-pre-tool-use.cjs` (per `hooks-status.md` §3) |
| 4 | `PermissionRequest` | supported | turn | regex on `tool_name` | **none** — Codex-unique event; Claude expresses permission gating via `permission_mode` field on PreToolUse instead |
| 5 | `PostToolUse` | supported | turn | regex on `tool_name` | `bin-post-tool-use.cjs` (per `hooks-status.md` §4) |
| 6 | `Stop` | supported | turn | matcher ignored | three-handler Stop chain in `hooks-status.md` §5 — `bin-stop.cjs` + `self-report-fused.sh` + `bin-digital-twin-tap.cjs` |
| 7 | `PreCompact` | absent | — | — | `bin-pre-compact.ts` source exists in TeamBrain (per `hooks-status.md` §6) |
| 8 | `SessionEnd` | absent | — | — | `bin-session-end.ts` source exists in TeamBrain (per `hooks-status.md` §7) |
| 9 | `SubagentStop` | absent | — | — | not currently used by TeamBrain (per `hooks-status.md` §8) |
| 10 | `Notification` | absent | — | — | not currently used by TeamBrain (per `hooks-status.md` §8) |

**6 supported · 4 absent · 1 Codex-unique (`PermissionRequest`)**.

`absent` here means **not in S1–S6**. It is **not** "Codex won't fire it" — it is "Codex docs do not promise it." For #290 / #291 wiring, treat `absent` as a hard contract: do not register a Codex hook against `PreCompact` / `SessionEnd` / `SubagentStop` / `Notification`.

## 5. Per-supported-event stdin shape vs Claude

Per #289 acceptance criterion #2 — *"Each `supported` event documents stdin shape vs Claude equivalent"*. Source for Codex fields: S1; source for Claude fields: `packages/types/src/hook-protocol.ts` in this repo.

### 5.1 Common header (every Codex event)

| Field | Type | Claude analog | Note |
|-------|------|---------------|------|
| `session_id` | string | `session_id` | shared |
| `transcript_path` | string \| null | `transcript_path` | Codex allows `null`; Claude usually a path |
| `cwd` | string | `cwd` | shared |
| `hook_event_name` | string | `hook_event_name` | shared (literal event name as table key) |
| `model` | string | **n/a** | Codex-only — active model slug carried into every payload |

Turn-scoped events (`PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`) additionally carry a Codex-only `turn_id: string` field discriminating the turn. `SessionStart` is session-scoped and does NOT carry `turn_id` — the §5.2–§5.7 subsections below restate `turn_id` only on the events that actually carry it, matching S1.

Claude SDK additionally puts `permission_mode` on every payload; Codex does not (Codex models permissions through `PermissionRequest` event).

### 5.2 `SessionStart`

Extra field: `source` — string in `"startup" | "resume" | "clear"`.

Claude analog (`hooks-status.md` §1): triggered by "cold open or new session" — single channel, no `source` discriminator. Codex's `source` is a richer signal that lets the hook react differently to first-open vs resume vs `/clear`.

### 5.3 `UserPromptSubmit`

Extra field: `prompt` — string, the user prompt about to be sent.

Claude analog (`hooks-status.md` §2): same field name, same semantics.

### 5.4 `PreToolUse`

Extra fields:

| Field | Type | Note |
|-------|------|------|
| `turn_id` | string | (already in common header for turn-scoped) |
| `tool_name` | string | `Bash`, `apply_patch` (aliases `Edit`, `Write`), MCP tool names |
| `tool_use_id` | string | unique per call |
| `tool_input` | JSON object | for Bash/apply_patch, `tool_input.command` is the shell command |

Claude analog (`hooks-status.md` §3): identical core fields. Two diffs:

- Claude's `tool_name` set is `Bash` / `Write` / `Edit` / `WebFetch` / `mcp__server__tool`; Codex collapses Write+Edit into the single `apply_patch` tool with aliases. A Codex matcher of `^apply_patch$` covers what Claude needs `Write|Edit` to cover.
- Claude carries optional `agent_id` / `agent_type` for subagent context; Codex docs do not promise either field — treat `unknown`.

### 5.5 `PermissionRequest`

Codex-unique event with no Claude equivalent. Extra fields:

| Field | Type | Note |
|-------|------|------|
| `turn_id` | string | (common header) |
| `tool_name` | string | matcher channel |
| `tool_input` | JSON object | full tool input |
| `tool_input.description` | string \| null | optional human-readable approval reason |

Claude expresses permission gating *inside* `PreToolUse` via the `permission_mode` field on the input (e.g. `"acceptEdits"` / `"plan"`). Codex split this into a separate event so a hook can `allow` / `deny` independently of `PreToolUse`. The Codex hook returns `{hookSpecificOutput.decision: {behavior: "allow" | "deny", message?}}`; the equivalent Claude path is `permissionDecision: "deny"` inside the PreToolUse hook output.

### 5.6 `PostToolUse`

Extra fields: `turn_id`, `tool_name`, `tool_use_id`, `tool_input`, `tool_response` (JSON — MCP result or tool output).

Claude analog (`hooks-status.md` §4): identical fields. The `tool_response` field is the only post-tool signal both surfaces share verbatim.

### 5.7 `Stop`

Extra fields:

| Field | Type | Note |
|-------|------|------|
| `turn_id` | string | (common header) |
| `stop_hook_active` | boolean | whether the hook has already continued the turn (lets the hook avoid infinite continue loops) |
| `last_assistant_message` | string \| null | the assistant's final message before Stop |

Claude analog (`hooks-status.md` §5): Stop fires three concurrent handlers in TeamBrain (`bin-stop.cjs` + `self-report-fused.sh` + `bin-digital-twin-tap.cjs`). Claude's Stop input has no `last_assistant_message` field — a TeamBrain Codex equivalent could pass that field straight to `bin-stop.cjs`'s analyzer for richer context, but the existing `bin-stop.cjs` reads the transcript via `transcript_path` instead, so `last_assistant_message` is a nice-to-have not a requirement.

## 6. Output schema vs Claude

### 6.1 Common output fields (every event)

```json
{
  "continue": true,
  "stopReason": "optional string",
  "systemMessage": "optional string",
  "suppressOutput": false
}
```

Per S1: `suppressOutput` is **parsed today but not yet implemented** (verbatim from the Codex hooks docs page). Treat as a no-op when wiring TeamBrain compatibility shims.

### 6.2 Per-event extra fields

| Event | Codex extra output | Claude analog (`packages/types/src/hook-protocol.ts`) |
|-------|--------------------|--------------------------------------------------------|
| `SessionStart` | `hookSpecificOutput.additionalContext` (string injected as developer message) | same field name in Claude SessionStart output |
| `UserPromptSubmit` | `hookSpecificOutput.additionalContext` | same |
| `PreToolUse` | `hookSpecificOutput.permissionDecision` (`"deny"`) + `permissionDecisionReason`; OR legacy `{decision: "block", reason}` | same shape; Claude additionally supports `updatedInput` to mutate the tool call before it fires — Codex docs do **not** list `updatedInput` (treat as `absent`; do not register an adapter shim that emits it) |
| `PermissionRequest` | `hookSpecificOutput.decision` = `{behavior: "allow"}` or `{behavior: "deny", message}` | n/a — Codex-only event |
| `PostToolUse` | `decision: "block"` + `reason` + `hookSpecificOutput.additionalContext` | same |
| `Stop` | `decision: "block"` + `reason` (continuation prompt text) | Claude Stop output uses `decision: "block"` similarly; TeamBrain's three-handler chain (`hooks-status.md` §5) effectively never blocks but enforces the 12-field self-report block |

### 6.3 Matcher semantics (per S1)

Matcher is a regex string. `"*"`, `""`, or omitted = matches all.

| Codex event | Filters on | Codex example matchers |
|-------------|------------|-------------------------|
| `PreToolUse` | `tool_name` | `Bash`, `^apply_patch$`, `Edit\|Write`, `mcp__filesystem__.*` |
| `PostToolUse` | `tool_name` | same |
| `PermissionRequest` | `tool_name` | same |
| `SessionStart` | `source` | `startup\|resume\|clear` |
| `UserPromptSubmit` | n/a | matcher ignored |
| `Stop` | n/a | matcher ignored |

Note: Claude's PreToolUse matcher in TeamBrain's `installHook()` is the literal string `Bash|Write|Edit|WebFetch` (per `hooks-status.md` §3). The Codex equivalent for the same intent is `Bash|apply_patch|WebFetch` (the `Write`/`Edit` slots collapse into `apply_patch`). The exact matcher TeamBrain registers under `.codex/hooks.json` is out of scope for #289 (sibling #290 owns it).

## 7. Operational caveats

### 7.1 Active regression — Codex Desktop 0.129.0-alpha.15

S6 reports `SessionStart` and `PreToolUse` hooks **silently fail to fire** under Codex Desktop versions running cli_version `0.129.0-alpha.15`. The same configuration works under cli_version `0.128.0-alpha.1`. Issue is **OPEN** as of fetch date 2026-05-12.

Implication for #290 / #291: TeamBrain's `teamagent doctor` should detect this regression and warn the user, not silently assume hooks fire when they don't. Add a doctor probe that runs a no-op SessionStart hook + checks the developer-message log for the expected stdout.

### 7.2 Activation flag is not on by default

Per S6 reproducer, hooks require `[features] codex_hooks = true` in `config.toml`. Whether `~/.codex/config.toml`'s flag covers all projects, or whether each project's `.codex/config.toml` must repeat it, is **unknown** from public docs (see §8 #1).

### 7.3 Trust gate is silent

If the project's `.codex/` is untrusted, project-local hooks silently do not load (per S2). For #290 the installer should detect untrusted state and refuse to install (or at least warn) rather than silently registering hooks the user will think are active.

## 8. Open questions — `unknown` items the public docs do not resolve

1. Does `~/.codex/config.toml` `[features] codex_hooks = true` enable hooks for all projects, or must each project's `.codex/config.toml` also set it? — `unknown`
2. Plugin manifest hook bundling syntax (mentioned by S3 but not schema'd) — `unknown`
3. `requirements.toml` admin enforcement: precedence vs user/project + per-event array shape — `unknown`
4. Handler types `prompt` and `agent` — earlier search snippets mention them, S1 only documents `command`. Treat as `unknown` until codex-rs source resolves.
5. PreToolUse `updatedInput` mutation: Claude has it, Codex docs do not list it. — `unknown`
6. Mechanism by which a project gets marked trusted (S2 names `projects.<path>.trust_level` but the workflow / CLI command to set it is not on the docs page) — `unknown`

#290 / #291 / #293 implementers should resolve these via codex-rs source AND update this spec, not silently invent answers.

## 9. How TeamBrain consumes this spec

Three sibling sub-issues consume this doc as their input contract:

- TeamBrain issue #290 `feat(.codex): commit project-level Codex hook config + adapters` — owns the actual `.codex/config.toml` / `.codex/hooks.json` content + adapter shims that translate Codex stdin payloads into the SDK shape `bin-pre-tool-use.cjs` already expects.
- TeamBrain issue #291 `feat(install-hook): parameterize for Codex target + wire teamagent init --target=codex/both` — extends `installHook()` (`packages/cli/src/commands/init.ts`) so `teamagent init --target=codex/both` writes the project-level `.codex/` files documented here.
- TeamBrain issue #293 `docs(hooks-status): document Claude vs Codex hook parity` — promotes the parity table draft from `hooks-status.md` (added by this PR) into the canonical Claude lifecycle ASCII diagram.

#292 (install-hook idempotency tests) operates on the install pipeline #290/#291 ship; it does not consume this spec directly.

## 10. Don't confuse this spec with `multi-tool.md`

[`docs/features/multi-tool.md`](./multi-tool.md) describes the **knowledge engine's 4 delivery channels** (PreToolUse / UserPromptSubmit / Stop analyze / AttributionBus) and how they get rendered for **each tool target** (Claude / Codex / Cursor). That doc states Codex output is currently delivered **via skills + AGENTS.md symlink only — no Codex-specific hook wiring**. This spec is the **first step** toward closing that gap; #290 will then write the `.codex/config.toml` + `.codex/hooks.json` content this spec describes.

`multi-tool.md` is the *what we ship to which tool* doc. `codex-hooks-spec.md` (this file) is the *what Codex actually accepts as a hook* doc. `hooks-status.md` is the *what TeamBrain currently has installed where* doc. Three related but distinct docs; do not collapse them.
