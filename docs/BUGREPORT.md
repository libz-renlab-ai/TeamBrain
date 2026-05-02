```
   ┌─────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
   │  user finds bug │ -> │  collect 3 sections  │ -> │  open GitHub issue   │
   │  in TeamBrain   │    │  system / repro / log│    │  libz-renlab-ai/TB   │
   └─────────────────┘    └──────────────────────┘    └──────────────────────┘
        symptom                evidence pack                report URL
```

# BUGREPORT — How to Report a Bug in TeamBrain

## What it does

When you find a bug, add an issue in TeamBrain GitHub at https://github.com/libz-renlab-ai/TeamBrain that includes system info, how-to-reproduce-the-bugs, and raw logs in great detail.

The point: **make the report self-contained**. The maintainer should be able to triage without bouncing back for "what version are you on?" or "can you paste the actual error?". Three fixed sections cover that 80%.

## 触发

- 用户消息含 `bug`、`报 bug`、`I found a bug`、`how do I report a bug`、`报告 bug`。
- 用户问 `what would happen when user find a bug?`、`how to report a bug?`。
- 任何描述异常 / panic / crash / unexpected behavior 的对话，主 agent 应主动建议走这个流程。

## The three required sections

### 1. System info

What to collect:

```bash
uname -a                        # OS + arch
sw_vers                         # macOS version (if Mac)
zsh --version || bash --version # shell
tmux -V                         # tmux
node --version && npm --version # node / npm
git --version                   # git
docker --version 2>/dev/null    # docker (Tier 4 only)

# Claude / claudefast environment
echo "claudefast model:    ${ANTHROPIC_MODEL:-unset}"
echo "claudefast endpoint: ${ANTHROPIC_BASE_URL:-unset}"
echo "CLAUDE_CONFIG_DIR:   ${CLAUDE_CONFIG_DIR:-unset}"
echo "CODEX_HOME:          ${CODEX_HOME:-unset}"
echo "HOME:                ${HOME:-unset}"
echo "CLAUDE_PROJECT_DIR:  ${CLAUDE_PROJECT_DIR:-unset}"

# Repo state
git rev-parse --abbrev-ref HEAD            # branch
git rev-parse --short HEAD                 # commit SHA
git status --porcelain | wc -l             # uncommitted entries
git remote -v                              # remote URLs
```

Do NOT redact paths, machine names, or non-secret env vars — the maintainer often needs them. Token-shaped values (`sk-`, bearer tokens, API keys) MUST be redacted to `[redacted]`.

### 2. How-to-reproduce-the-bugs

Minimal repro recipe. For every step:

| Step | Command | Expected | Actual |
|------|---------|----------|--------|
| 1 | `bash scripts/dogfood.sh` | tmux session created, two panes | (paste actual) |
| 2 | (right pane) `! printenv HOME` | sandbox path | `/Users/m1` |
| 3 | … | … | … |

Plus, if the bug touches hooks / skills / permission gates, list which ones fired (from stream-json `hook_event` or `tool_result is_error:true` events) — the agent's behavior is opaque without that.

For dogfood / probe / sandbox bugs, **always** attach the output of:

```bash
bash scripts/dogfood-review.sh
```

That dashboard tells the maintainer the active session, sandbox path, drift state, last probe verdict, and tier-2 dir sizes in one paste.

### 3. Raw logs in great detail

**Do not truncate.** Maintainers triage faster from one verbose paste than from "the relevant lines" curated by the reporter.

Sources of raw logs:

- **stream-json artifacts** — `.fastprobe/<run>/probe_*.txt`, `.dogfood/probe-<epoch>/*.jsonl`, `.judge/<run_id>/*`
- **tmux scrollback** — `tmux capture-pane -t <session>:<window>.<pane> -p -S -3000` (last 3000 lines of any pane in any session)
- **hook events** — re-run with `--include-hook-events --include-partial-messages --verbose`
- **process tree** — `pstree -p <claude-pid>` if claude is hung
- **system log slice** — `log show --predicate 'process == "claude"' --last 5m` (macOS) for crashes

Redact only token-shaped strings. Path, hostname, command output otherwise stays as-is.

## How to invoke

```bash
bash scripts/bugreport-collect.sh > /tmp/teambrain-bug-report.md
```

This produces a markdown skeleton with the three sections pre-populated by running the system-info commands and dumping the most recent dogfood-probe / verify outputs. **Review and edit before posting** — at minimum fill in the "How-to-reproduce" table with the specific scenario you hit; auto-collection cannot guess that.

Then paste into a new GitHub issue:

```
https://github.com/libz-renlab-ai/TeamBrain/issues/new
```

## Verification

```bash
bash docs/bugreport/verify-canned-answer.sh
```

The verify script runs `claudefast -p "what would happen when user find a bug"` and greps `tool_result.content` for the canonical anchors:

- `github.com/libz-renlab-ai/TeamBrain`
- `system info`
- `reproduce`
- `raw logs`
- `great detail`

PASS = all five anchors hit. FAIL = at least one missing; iterate the canned-answer wording in `CLAUDE.md` until pass.

## Anti-patterns

- ❌ Reporting a bug as a chat message instead of an issue — it gets lost.
- ❌ "I'll paste logs if you need them" — paste them up front; reporter latency dominates triage time.
- ❌ Truncating stack traces / log output to "the important lines" — context the reporter dropped is often the actual cause.
- ❌ Pasting a token verbatim — always `[redacted]` token-shaped strings before posting.
- ❌ Filing a bug without specifying which `DOGFOOD_TIER` was active — different tiers exercise different code paths.

## Related

- [DOGFOOD.md](DOGFOOD.md) — sandbox setup; many bugs are isolation-related and benefit from a probe attachment.
- [FASTPROBE.md](FASTPROBE.md) — how to capture stream-json evidence for the bug report.
- [feature-verification.md](feature-verification.md) — 1+2+3 verification gate (claudefast / codex / tmux export).
