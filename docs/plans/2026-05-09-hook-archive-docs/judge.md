```
        __
      <(o )___
       ( ._> /
        `---'         judge.md : MD playbook for MAIN agent
                                                                          
   MAIN agent  ─►  dispatch 6 probes  ─►  collect JSON  ─►  LLM-judge verdict
```

# Judge Harness MD Playbook

Per memory `feedback_judge_harness_md_playbook`: this is a **playbook** the MAIN agent dispatches via subagents or `claudefast -p` probes — **not** a fixed bash script under `scripts/*.sh`.

Each probe writes its evidence to `.judge/2026-05-09-hook-archive-docs/<probe-id>/` containing:
- `stdout.txt` — raw command stdout
- `stderr.txt` — raw command stderr
- `result.json` — `{exit_code, metrics, evidence_dir}` 收窄结果

Final verdict: MAIN agent or `claudefast -p` reads all 6 `result.json` files + raw evidence and outputs PASS/FAIL with reasoning.

---

## Probe 1 : orphans removed from working tree

**Goal**: confirm both .sh files no longer exist on disk.

**Dispatch**:
```bash
test ! -f .claude/hooks/laziness-self-report.sh && \
test ! -f .claude/hooks/teamagent-stop.sh
```

**Expected metrics**:
- `exit_code: 0`
- `metrics.files_remaining: 0` (count of remaining orphan .sh)

**Failure mode**: either file still on disk → archive incomplete.

---

## Probe 2 : git history still traces deletion

**Goal**: confirm history is preserved (not a force-rewrite that loses provenance).

**Dispatch**:
```bash
git log --diff-filter=D --oneline -- .claude/hooks/laziness-self-report.sh | head -3
git log --diff-filter=D --oneline -- .claude/hooks/teamagent-stop.sh | head -3
```

**Expected metrics**:
- `exit_code: 0`
- `metrics.delete_commits: >= 1` for each file

**Failure mode**: empty output → file may never have been tracked, or history rewritten.

---

## Probe 3 : hooks-status.md is canonical

**Goal**: new doc exists, has ASCII art at top (project rule 10), is < 200 lines.

**Dispatch**:
```bash
test -f docs/features/hooks-status.md
head -10 docs/features/hooks-status.md | grep -E '^```|^[─│┌└├┘┐]' | head -1
wc -l docs/features/hooks-status.md
```

**Expected metrics**:
- `exit_code: 0`
- `metrics.has_ascii_art: true`
- `metrics.line_count: <200`

**Failure mode**: file missing, no ASCII art, or > 200 lines (per project doc-evolution rule).

---

## Probe 4 : STOP-HOOKS.md cleaned of dead references

**Goal**: no remaining references to the deleted files in the canonical Stop hook doc.

**Dispatch**:
```bash
grep -E "laziness-self-report\.sh|teamagent-stop\.sh" docs/STOP-HOOKS.md
```

**Expected metrics**:
- `exit_code: 1` (grep returns 1 when no match)
- `metrics.dead_refs: 0`

**Failure mode**: any match means doc still points to deleted files.

---

## Probe 5 : B-092 marked obsolete in bugs.md

**Goal**: the bug entry tracking the now-deleted file is no longer status `open`.

**Dispatch**:
```bash
grep -E "^\| B-092" bugs.md
```

**Expected metrics**:
- `exit_code: 0`
- `metrics.b092_status_open: false` (line should not end in `open |`)

**Failure mode**: status still `open` despite the file being removed.

---

## Probe 6 : typecheck + test baseline preserved

**Goal**: no regression — tooling state must be at-least-as-good as `main` before this PR.

**Dispatch**:
```bash
pnpm typecheck 2>&1 | tail -5
pnpm test 2>&1 | tail -10
```

**Expected metrics**:
- `exit_code: 0` for both
- `metrics.test_pass_count: >= baseline` (before-PR snapshot)

**Failure mode**: any new failure introduced by the doc/file changes (should be zero — this PR doesn't touch TS/runtime code).

---

## LLM-judge final verdict

After all 6 probes write their `result.json`, dispatch:

```bash
claudefast -p "$(cat <<'EOF'
You are the third-party judge for PR plan 2026-05-09-hook-archive-docs.
Read every .judge/2026-05-09-hook-archive-docs/probe-*/result.json file plus
the corresponding stdout.txt / stderr.txt evidence. Decide PASS or FAIL.

Acceptance criteria:
- All 6 probes report exit_code 0 (probe 4 reports 1 for "no match" which is desired)
- Probe 3 metrics.line_count < 200 AND metrics.has_ascii_art is true
- Probe 6 introduces zero new test failures vs baseline

Output format:
VERDICT: <PASS|FAIL>
REASON: <one paragraph citing specific probe evidence>
EOF
)"
```

The LLM-judge **must not** look at the diff or the implementation reasoning — only at probe evidence. This enforces the "code can't grade itself" rule from user-level CLAUDE.md.
