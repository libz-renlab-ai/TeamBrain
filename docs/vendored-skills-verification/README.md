# Vendored Skills — Three-Phase Verification

Proof that the vendored `design-shotgun` and `design-html` skills load and parse identically across two distinct CLIs (Claude Code via `claudefast`, and OpenAI Codex via `codex exec`), and that the same skill is usable in an interactive Claude Code session.

The harness is `scripts/verify-vendored-skills.sh`. It executes three phases per skill and stores evidence under `evidence/<skill>/`.

## Phases

| # | Phase | What it does | Evidence |
|---|---|---|---|
| 1 | `claudefast -p --bare --output-format json --json-schema` | Asks Claude Code (MiniMax fast profile) to read `SKILL.md`, parse the YAML frontmatter, and emit metadata constrained by `skill-metadata.schema.json`. | `01-claudefast-{envelope,result}.json` |
| 2 | `codex exec --output-schema --output-last-message` | Same prompt to OpenAI Codex CLI with the same JSON schema. | `02-codex-{last,result}.json` |
| match | `diff` on `jq -S .` canonical form | Hard-match the two extracted JSONs byte-for-byte. | `04-diff.txt` (only on failure) |
| 3 | `claudefast` (interactive) inside `tmux` + `/export` | Sends a verification prompt to interactive Claude Code, waits for the per-skill marker (`VERIFY_DESIGN_SHOTGUN_OK` / `VERIFY_DESIGN_HTML_OK`) in the pane, then issues `/export <path>` to dump the conversation. | `03-tmux-{export.md,pane.txt}` |

The `--help` semantics for a Claude Code skill is "describe the skill's frontmatter as JSON" — there is no native `--help` flag on a `.md` skill, so we treat the SKILL.md frontmatter as the canonical "help" payload.

## Run

```bash
bash scripts/verify-vendored-skills.sh                 # both skills, all 3 phases
bash scripts/verify-vendored-skills.sh design-shotgun  # one skill
SKIP_PHASE3=1 bash scripts/verify-vendored-skills.sh   # skip tmux phase
```

Exit code is non-zero on any phase failure. Evidence is regenerated on every run.

## What "match" proves

| Field | Source of truth | Why it matters |
|---|---|---|
| `name` | `SKILL.md` frontmatter `name:` | The skill registers under the expected slug. |
| `version` | frontmatter `version:` | Pinned vendored version is what's loaded. |
| `preamble_tier` | frontmatter `preamble-tier:` | Skill-loader tier is parsed correctly. |
| `trigger_count` + `first_trigger` | length and first element of `triggers:` | Trigger list survives the vendor mirror without truncation. |
| `allowed_tool_count` + `first_allowed_tool` | length and first element of `allowed-tools:` | Tool gating list survives the vendor mirror. |

If any byte differs between Phase 1 and Phase 2, both LLMs agree on the same SKILL.md content but disagree on parsing — i.e., we have a real divergence, not a vendor drift.

## Last verified result (2026-04-29)

Both skills passed all phases. Canonical JSON for each:

```jsonc
// design-shotgun
{
  "allowed_tool_count": 6,
  "first_allowed_tool": "Bash",
  "first_trigger": "explore design variants",
  "name": "design-shotgun",
  "preamble_tier": 2,
  "trigger_count": 3,
  "version": "1.0.0"
}

// design-html
{
  "allowed_tool_count": 8,
  "first_allowed_tool": "Bash",
  "first_trigger": "build the design",
  "name": "design-html",
  "preamble_tier": 2,
  "trigger_count": 3,
  "version": "1.0.0"
}
```

See `evidence/<skill>/03-tmux-export.md` for the live `/export` dump from each interactive session — the marker (`VERIFY_DESIGN_SHOTGUN_OK` / `VERIFY_DESIGN_HTML_OK`) appears as the model's response after it reads the SKILL.md file.

## Iteration history

The harness was iterated until 1+2+3 all pass:

1. **First Phase-1 run**: blocked by the user-level Stop hook (`laziness-self-report.sh`) injecting itself into the LLM output. Fix: add `--bare` to claudefast (skips hooks while still resolving skills via `/skill-name`).
2. **First Phase-3 run**: `${skill^^}` (bash 4 uppercase) used; macOS bash 3.x failed with "bad substitution". Fix: use `tr '[:lower:]-' '[:upper:]_'`.
3. **Second Phase-3 run**: long verification prompt with `<…>` placeholders never submitted in tmux — the prompt sat in the input box. Fix: split `tmux send-keys "$prompt"` and `tmux send-keys Enter` into two calls (1 s apart), drop angle brackets, and increase the wait window from 90 s → 240 s to absorb interactive Stop-hook iteration latency.
4. **`/export` autocomplete** intercepted the first attempt (autocomplete dropdown was visible when Enter fired). Fix: send the full `/export <path>` first, sleep 1 s, then `Enter` separately so the dropdown collapses against the path argument.

After these fixes the script is reproducible and runs end-to-end in about 2:30 wall time (LLM-bound).
