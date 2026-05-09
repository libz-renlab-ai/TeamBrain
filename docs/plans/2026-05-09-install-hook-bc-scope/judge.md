```
        __
      <(o )___       judge.md : MD playbook for B+C scope
       ( ._> /                                              
        `---'    8 probes → JSON evidence → LLM-judge verdict
```

# Judge Harness — install-hook B+C scope

Per memory `feedback_judge_harness_md_playbook`: this is an MD playbook the MAIN agent dispatches via subagents or `claudefast -p`. **Not** a fixed bash script.

Each probe writes evidence to `.judge/2026-05-09-install-hook-bc-scope/<probe-id>/`:
- `stdout.txt` — raw stdout
- `stderr.txt` — raw stderr
- `result.json` — `{exit_code, metrics, evidence_dir}`

Final verdict: `claudefast -p` reads all 8 results + evidence and outputs PASS/FAIL.

---

## Probe 1 — typecheck

```bash
pnpm typecheck
```

Expected: `exit_code: 0`. Failure means new code didn't compile.

## Probe 2 — install-hook test suite

```bash
pnpm vitest run packages/cli/src/__tests__/install-hook.test.ts --reporter=json > result.json
```

Expected: `metrics.failed: 0`, `metrics.passed: >= 24` (existing) + `>= 5` new tests.

## Probe 3 — project-level channels (settings.local.json)

```bash
TMPDIR=$(mktemp -d)
HOME=$TMPDIR pnpm teamagent init --skip-import --skip-warmup --skip-seed --no-user-level-hook
jq '[.hooks | to_entries[] | .value[]?._teamagentTag] | unique | length' "$TMPDIR/.claude/settings.local.json"
```

Expected: `metrics.tag_count: 6` (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionEnd, PreCompact). Note: digital-twin-tap and SessionStart are user-level only; statusLine is single-slot.

## Probe 4 — user-level channels (~/.claude/settings.json mock)

```bash
TMPDIR=$(mktemp -d)
HOME=$TMPDIR pnpm teamagent init --skip-import --skip-warmup --skip-seed
jq '[.hooks | to_entries[] | .value[]?._teamagentTag] | unique | length' "$TMPDIR/.claude/settings.json"
```

Expected: `metrics.tag_count: 8` (the 6 above + SessionStart + DigitalTwinTap).

## Probe 5 — install-user-hook deprecation

```bash
pnpm teamagent install-user-hook 2>&1 | head -10
```

Expected: stderr or stdout contains `"deprecat"` (case-insensitive) and exit_code 0 (still functional).

## Probe 6 — orphan .sh scanner

```bash
TMPDIR=$(mktemp -d)
mkdir -p "$TMPDIR/.claude/hooks"
touch "$TMPDIR/.claude/hooks/some-orphan.sh"
HOME=$TMPDIR pnpm teamagent init --skip-import --skip-warmup --skip-seed 2>&1 | tee out.txt
grep "some-orphan.sh" out.txt
```

Expected: stderr (or stdout step output) names `some-orphan.sh` as orphan; exit_code 0 (warning, not error).

## Probe 7 — full pnpm verify (no regression)

```bash
pnpm verify 2>&1 | tail -20
```

Expected: `exit_code: 0`. Captures regressions in any other test suite that might depend on installHook.

## Probe 8 — LLM-judge final verdict

```bash
claudefast -p "$(cat <<'EOF'
You are the third-party judge for PR plan 2026-05-09-install-hook-bc-scope.
Read every .judge/2026-05-09-install-hook-bc-scope/probe-*/result.json plus
the corresponding stdout.txt/stderr.txt evidence. Decide PASS or FAIL.

Acceptance criteria:
- probes 1, 2, 7 exit 0
- probe 3 metrics.tag_count == 6
- probe 4 metrics.tag_count == 8
- probe 5 stdout/stderr contains "deprecat" (case insensitive)
- probe 6 stdout names the orphan .sh file
- probe 7 introduces zero new test failures vs baseline

Output:
VERDICT: <PASS|FAIL>
REASON: <one paragraph citing specific probe evidence>
EOF
)"
```

The judge **must not** see the diff or implementation reasoning — only probe evidence. Enforces the user-level CLAUDE.md "code can't grade itself" rule.
