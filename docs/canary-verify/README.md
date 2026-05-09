# canary skill verification

Verification that the `canary` skill (copied verbatim from
`https://github.com/garrytan/gstack/blob/main/canary/`) is correctly
installed and discoverable by the project-level Claude Code skill loader.

```
                +-------------------------+
                |  .claude/skills/canary/ |
                +-----------+-------------+
                            |
                +-----------+-----------+
                |                       |
                v                       v
        [1] verify-              [2] tmux-export.sh
        claudefast.sh            (claudefast TUI -> /export)
                |                       |
                v                       v
        runs/claudefast.json     exports/canary-session.txt
                                 (full transcript)
                |                       |
                +-----------+-----------+
                            |
                            v
                       PASS / FAIL
```

The Codex hardmatch leg of this harness was retired in the 2026-05-09
codex review-stage cleanup; only the project-level Claude Code path is
verified here now.

## Layout

| File | Purpose |
| ---- | ------- |
| `schema.json` | JSON Schema the verifier must produce. |
| `prompt.tmpl` | Registry-only prompt sent to claudefast. |
| `verify-claudefast.sh` | Verifier 1: `claude --help`, then `claudefast -p --output-format json --json-schema ...`. |
| `tmux-export.sh` | Verifier 2: launches `claudefast` in tmux, asks about canary, runs `/export`. |
| `runs/` | Help dumps, verifier JSON outputs, and selected raw logs. |
| `exports/` | `/export` transcript + tmux pane snapshot. |

## How to re-run

These scripts are archived at `docs/legacy/judge-scripts/docs/canary-verify/`.
Use the corresponding md playbooks via subagent or `claudefast -p` probe:

| Step | md playbook |
|------|-------------|
| verify-claudefast | `docs/plans/docs--canary-verify--verify-claudefast/judge.md` |
| tmux-export | `docs/plans/docs--canary-verify--tmux-export/judge.md` |

Historical command reference (archived; no longer at these paths):

```text
zsh   docs/canary-verify/verify-claudefast.sh   # -> docs/legacy/judge-scripts/...
bash  docs/canary-verify/tmux-export.sh
```

The verifier first runs `claude --help`, so the harness proves the binary
is reachable before any model call.

## Pass criteria (both MUST pass)

1. `runs/claudefast.json` validates against `schema.json`.
2. `tmux-export.sh` produces `exports/canary-session.txt` containing
   registry-only JSON from `claudefast` interactively.

## Current canonical JSON (last run)

```json
{
  "name": "canary",
  "registered": true,
  "status": "found"
}
```

## Notes

- The model prompt deliberately forbids reading files and asks only about the
  in-memory registered skill list. The JSON contract avoids description text,
  because Claude Code may summarize registered descriptions differently
  across versions even when the skill is loaded.
- `verify-claudefast.sh` also writes `runs/claudefast.debug.log` and asserts
  the debug line `Loading skills from:` contains this repo's
  `.claude/skills` directory. That proves Claude Code's project skill loader
  looked at the project-level skill directory before the model answered. It
  also asserts the debug log mentions projectSettings skill `canary`, proving
  the specific project-level skill was registered.
- `claudefast` is a zsh function (defined in `~/.zshrc`) wrapping `claude`
  with a MiniMax-Anthropic-compatible profile. Verifier 1 uses
  `zsh -ic 'claudefast ...'` to load it. The wrapper's API token must
  never be written to disk; treat it as `[redacted]`.
- `verify-claudefast.sh` uses `python3` `JSONDecoder.raw_decode` to
  consume only the first JSON object from `.result`, ignoring any
  trailing noise from Claude Code stop hooks (e.g. a
  `<laziness-self-report>` block).
- `tmux-export.sh` acks `Enter to confirm` dialogs (workspace trust,
  external CLAUDE.md imports), waits for the model to return to idle
  (`? for shortcuts` and no `esc to interrupt`), then sends `/export`
  with an explicit destination path. Avoid `tmux send-keys -l` when
  typing into Claude Code TUI — bracketed paste makes Enter behave
  as newline rather than submit.
