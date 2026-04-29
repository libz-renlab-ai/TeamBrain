```
   L1 jq + bash -n           L2 unit tests              L3a claudefast -p          L3b codex exec             L3c claudefast TUI
   .claude/settings.json     .claude/hooks/             stream-json + Stop         shell-tool exec of         /export captured
   .claude/hooks/script.sh   laziness-self-report.sh    hook event captured        same script                conversation
        |                          |                          |                          |                          |
        v                          v                          v                          v                          v
   ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
   │  EXPECTED  =  L2-A-missing-block.json  (decision:"block", reason:"...", systemMessage:"[laziness-guard] BLOCKED...")  │
   └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
        ‖                          ‖                          ‖                          ‖
        ‖           jq deep-equal slurpfile-pair               ‖           jq deep-equal slurpfile-pair
        ‖                          ‖                          ‖                          ‖
        ===========================  ALL FOUR ARTIFACTS BYTE-EQUIVALENT  ===========================
```

# Verification artifacts for project Stop hook `laziness-self-report.sh`

This directory holds the evidence produced while wiring the hook. Every layer
hard-matches a single canonical expected JSON object — `L2-A-missing-block.json` —
so passing all three independent runtimes proves the hook behaves identically
under direct shell, Claude Code (`claudefast`) and Codex.

## How each layer was run

### L1 — static checks

```
jq . .claude/settings.json   → PASS
bash -n .claude/hooks/laziness-self-report.sh → PASS
```

### L2 — direct shell unit tests (5 cases, paired hard-match)

For each case, feed Claude Code's Stop-hook input shape on stdin, capture
stdout, and `jq -e` deep-equal against the expected shape. Current runtime
paths use `last_assistant_message`; transcript input is only a legacy fallback.

| case | input | expected stdout |
|------|-------|-----------------|
| A    | transcript whose last assistant text has **no `<laziness-self-report>` block** | `{decision:"block", systemMessage:"[laziness-guard] BLOCKED: missing..."}` |
| B    | block present with `permission_seeking: true` | `{decision:"block", systemMessage:"[laziness-guard] BLOCKED: self-confessed..."}` |
| C    | block present, all 6 fields = `false` | `{continue:true, suppressOutput:true}` |
| D    | assistant first quotes the template (`<true\|false>` placeholders), THEN appends a real all-false block at the end | `{continue:true, suppressOutput:true}` (must use the LAST block, not the first) |
| E    | assistant pastes the script source — lines containing the literal tag substring inside awk regex syntax, no real block on its own line | `{decision:"block", systemMessage:"[laziness-guard] BLOCKED: missing..."}` (strict tag-on-own-line regex must reject) |

Artifacts: `L2-{A,B,C,D,E}-*.json`. D and E are regression tests for the
P1 finding raised by Codex on PR #15.

### L3a — `!claudefast -p` (Claude Code non-interactive runtime)

Help recon: `claudefast --help` (capture preserved in commit message).

```
timeout 90 claudefast -p \
  --output-format stream-json --include-hook-events \
  --include-partial-messages --verbose \
  --setting-sources project,local,user \
  --permission-mode acceptEdits \
  "Reply with exactly the single word OK and nothing else." \
  > L3a-stream.jsonl
```

Then extract any Stop hook response whose `output | fromjson` has
`decision=="block" and systemMessage startswith "[laziness-guard] BLOCKED: missing"`
and hard-match it to `L2-A-missing-block.json`:

```
jq -e -n --slurpfile a L2-A-missing-block.json --slurpfile b L3a-block.json '$a[0] == $b[0]'
→ true   ✓ L3a HARD-MATCH PASS
```

Same session also exhibited the approve path — later Stop hooks emitted
`{"continue": true, "suppressOutput": true}` after the model appended an all-false
self-report.

### L3b — `!codex exec` (independent runtime)

Help recon: `codex exec --help` (capture preserved in commit message).

```
codex exec --json --skip-git-repo-check \
  --sandbox workspace-write --add-dir "$PWD" --ignore-rules \
  --output-schema L3b-output-schema.json \
  --output-last-message /tmp/L3b-codex.last \
  -C "$PWD" "$PROMPT" </dev/null
```

The prompt instructs codex to invoke the hook script with synthetic Stop payload
stdin (`last_assistant_message`) and write the script's stdout to
`L3b-hook-stdout.json`. Hook logging is best-effort and writes to the
project-local `.claude/laziness/log.jsonl` path by default, so a read-only
`$HOME` cannot create hook stderr. After the run:

```
jq -e -n --slurpfile a L2-A-missing-block.json --slurpfile b L3b-hook-stdout.json '$a[0] == $b[0]'
→ true   ✓ L3b HARD-MATCH PASS

jq -e -n --slurpfile a L3a-block.json --slurpfile b L3b-hook-stdout.json '$a[0] == $b[0]'
→ true   ✓ L3a ≡ L3b (claudefast ≡ codex)
```

### L3c — `claudefast` interactive in tmux + `/export`

```
tmux new-session -d -s la-l3c -c <repo>
tmux send-keys -t la-l3c 'claudefast' Enter
# wait for REPL via capture-pane polling
tmux send-keys -t la-l3c 'Reply with exactly one word: OK' Enter
# Monitor capture-pane until "premature_stopping: false" lands (= self-report appended)
tmux send-keys -t la-l3c '/export <abs path>' Enter
tmux send-keys -t la-l3c Enter   # /export confirms via second Enter
```

Result: `L3c-export.md` (2.1 KB) — see file. It captures the full block→retry→
approve cycle as Claude Code's TUI rendered it: two `Stop says: [laziness-guard]
BLOCKED` lines, the verbatim block-template error, and the model's final reply
with the all-false self-report inline.

## Reproduction commands

All four layers can be re-run from the worktree root:

```bash
# L1
jq . .claude/settings.json > /dev/null
bash -n .claude/hooks/laziness-self-report.sh

# L2 (5 cases)
bash docs/specs/hook-add-laziness/verify/run-l2.sh

# L3a
timeout 90 claudefast -p --output-format stream-json --include-hook-events \
  --setting-sources project,local,user --permission-mode acceptEdits \
  "Reply with exactly the single word OK and nothing else." \
  > docs/specs/hook-add-laziness/verify/L3a-stream.jsonl

# L3b
codex exec --json --skip-git-repo-check --sandbox workspace-write \
  --add-dir "$PWD" --ignore-rules \
  --output-schema docs/specs/hook-add-laziness/verify/L3b-output-schema.json \
  --output-last-message /tmp/L3b-codex.last \
  -C "$PWD" "$PROMPT" </dev/null \
  > docs/specs/hook-add-laziness/verify/L3b-stream.jsonl

# Final hard-match
jq -e -n --slurpfile a docs/specs/hook-add-laziness/verify/L2-A-missing-block.json \
        --slurpfile b docs/specs/hook-add-laziness/verify/L3a-block.json \
        '$a[0] == $b[0]'
jq -e -n --slurpfile a docs/specs/hook-add-laziness/verify/L2-A-missing-block.json \
        --slurpfile b docs/specs/hook-add-laziness/verify/L3b-hook-stdout.json \
        '$a[0] == $b[0]'
```
