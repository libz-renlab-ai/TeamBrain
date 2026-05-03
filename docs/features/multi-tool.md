```
   ┌──────────── MULTI-TOOL ADAPTATION ────────────┐
   │                                               │
   │  AI tool  ─── (one of) ─►  Claude Code        │
   │                            Codex              │
   │                            Cursor (read-only) │
   │                            Trae / Copilot ✗   │
   │                                               │
   │  knowledge engine  ──►  4 delivery channels   │
   │                         1. PreToolUse         │
   │                         2. UserPromptSubmit   │
   │                         3. Stop analyze       │
   │                         4. AttributionBus     │
   │                                               │
   │  ─── (Phase 2) ─►  MCP Server   ❌ NOT YET    │
   │                                               │
   │  compile output:                              │
   │    Claude  →  CLAUDE.md + ~/.claude/skills/   │
   │    Codex   →  AGENTS.md (symlink) + .codex/   │
   │    Cursor  →  ❌ NOT YET (compiler missing)   │
   └───────────────────────────────────────────────┘
```

# Multi-tool adaptation

## Goal

Let one TeamAgent knowledge engine serve every common AI coding tool — Claude Code, Codex, Cursor, future Trae / Copilot — by writing tool-specific output formats and exposing four uniform knowledge-delivery channels, so a developer's hard-won corrections in one tool show up as guard rails in another.

## Status

**partially implemented** as of 2026-05-03. Be honest about what's missing.

- 4 delivery channels: ✅ all live
  - `PreToolUse` (M2.7) — `packages/cli/src/bin-pre-tool-use.ts` + `packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts`
  - `UserPromptSubmit` (M2.7) — `packages/cli/src/bin-user-prompt-submit.ts`
  - `Stop analyze` (M2.10) — `packages/cli/src/bin-stop.ts` (analyze + calibrate + compile + scan-errors + harvest)
  - `AttributionBus` (M0+) — port `packages/ports/src/attribution-bus.ts`, adapter `packages/adapters/src/attribution/in-memory-bus.ts`
- AI tool support:
  - **Claude Code** — ✅ full (importer + compiler + hooks)
  - **Codex** — ✅ output via `pnpm teamagent compile --target=codex/both` → `AGENTS.md` symlink to `CLAUDE.md`, `.codex/skills/` symlink to `~/.claude/skills/teamagent/`
  - **Cursor** — ⚠️ importer only (`packages/core/src/importer/cursor-rules-parser.ts` reads `.cursor/rules/`); ❌ no compiler (NOT YET)
  - **Trae / VSCode Copilot** — ❌ NOT YET (Phase 4 remote item)
- MCP Server — ❌ NOT YET (Phase 2 plan, see `docs/specs/2026-04-15-phase2-backlog.md` F1)

**Dogfood status (2026-05-03)**: this feature doc itself was written via the dogfood sandbox at `.codex/worktrees/dogfood-feature-5-multi-tool-*`; verify script at `docs/features/multi-tool/verify-canned-answer.sh` exits 0 on PASS and gates 7 grep anchors.

## How it works

### The 4 channels (uniform across tools)

| # | Channel | When it fires | What it does |
|---|---------|---------------|--------------|
| 1 | `PreToolUse` | AI is about to call a tool (Bash, Edit, Write, …) | match knowledge entries against tool inputs; `avoidance` rules can block, `practice` rules warn |
| 2 | `UserPromptSubmit` | user just submitted a prompt | extract keywords, embed, query SQLite-vec, inject relevant rules into prompt context |
| 3 | `Stop analyze` | session stops | incremental scan of transcript → detect correction moments → extract → calibrate → compile |
| 4 | `AttributionBus` | any component wants to tell the user "I just did X" | `bus.emit(event)` → Renderer / persistence; **no direct `console.log` allowed** in core |

### Tool adaptation = importer (input) + compiler (output)

- Importers (read existing project rules into the knowledge store): `ClaudeMdRuleImporter`, `cursor-rules-parser.ts`
- Compiler (`packages/cli/src/commands/compile.ts:21`) writes to:
  - **Claude Code**: `CLAUDE.md` markdown block + `~/.claude/skills/teamagent/` (skill files) + `~/.claude/teamagent/rules/` (nested rule store)
  - **Codex**: `AGENTS.md` (symlink to `CLAUDE.md`) + `.codex/skills/` (symlink to `~/.claude/skills/teamagent/`)
  - **Cursor**: not implemented (would need `CursorRulesCompiler` writing `.cursorrules`)

### MCP Server (planned, Phase 2)

Per `docs/specs/2026-04-13-teamagent-design.md:570-622`, the MCP Server will expose `check_pitfall` / `get_best_practice` / `report_correction` / `get_stats` so AI can actively query knowledge during reasoning. Today's `PreToolUse` injection is a Phase-1 substitute, not equivalent.

## How to verify

```bash
SANDBOX=$(cat /tmp/dogfood-sandbox-feature-5-multi-tool.path 2>/dev/null) || SANDBOX=.
cd "$SANDBOX"
bash docs/features/multi-tool/verify-canned-answer.sh
echo "exit=$?  # 0 = PASS"
```

The script runs `claudefast -p` with the canonical multi-tool prompt and greps the output for 7 anchors:

| Anchor | Pattern |
|--------|---------|
| PreToolUse channel | `PreToolUse` |
| UserPromptSubmit channel | `UserPromptSubmit` |
| Stop channel | `Stop( analyze\| hook)` |
| AttributionBus channel | `[Aa]ttribution[Bb]us` |
| MCP NOT YET (rejects unrelated `NOT YET`) | `MCP` within 4 lines of `NOT YET\|未实现\|Phase 2` |
| Cursor NOT YET (rejects "fully supported") | `Cursor` within 4 lines of `NOT YET\|未实现\|importer only\|no compiler` |
| concrete file path | `packages/(cli\|adapters\|ports\|core)/` |

Missing any anchor → exit 1 with `[FAIL] <name>` printed.

## Known limitations

- **MCP Server**: NOT YET. Today AI cannot actively call `check_pitfall` from inside its reasoning loop; we only push knowledge through the 4 channels. Long sessions still degrade once the injected context falls out of the window.
- **Cursor compiler**: NOT YET. Cursor users can `init` (their `.cursor/rules/` is parsed in) but TeamAgent corrections do not flow back to `.cursorrules`. Backlog F2 in `docs/specs/2026-04-15-phase2-backlog.md`.
- **Codex output is symlinked, not copied**: `AGENTS.md → CLAUDE.md`, `.codex/skills → ~/.claude/skills/teamagent`. If the user breaks the symlink (e.g. on Windows without dev-mode), Codex will not see TeamAgent rules.
- **No Trae / VSCode Copilot adapters**: explicitly Phase 4 / far-future. Don't promise these exist.
- **PreToolUse hook never blocks on its own errors**: any exception → exit 0. Silent failure is by design (we won't break the user's flow), but it means a buggy matcher can leave bad rules unenforced without alarm.

## Links

- Design authority: `docs/specs/2026-04-13-teamagent-design.md` (v5.2; multi-tool sections at 21 / 32 / 40 / 350-351 / 450 / 570-622 / 727-731 / 794-799)
- Phase 2 backlog: `docs/specs/2026-04-15-phase2-backlog.md` (F1 MCP, F2 Cursor compiler, F3 Codex AGENTS.md)
- Phase 2 design v2: `docs/superpowers/specs/2026-04-15-phase2-design-v2.md`
- Compile entry: `packages/cli/src/commands/compile.ts:21`
- Verify script: `docs/features/multi-tool/verify-canned-answer.sh`
- Features index: `docs/features/INDEX.md`
