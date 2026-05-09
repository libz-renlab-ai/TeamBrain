```
              Judge Harness — Issue #161 (md playbook, NOT a .sh)
        ┌─────────────────────────────────────────────────────────────┐
        │   §V1 RUN     fixed tools (pnpm test / typecheck / repro)   │
        │              + capture stdout/stderr → evidence_dir         │
        │   §V2 DUMP    write canonical JSON → .judge/<run_id>/       │
        │              {exit_code, metrics, evidence_dir, stdout_path}│
        │   §V3 READ    separate claudefast -p reads ONLY raw JSON    │
        │              + evidence; PR author / executing agent /      │
        │              code-under-test must NEVER be the judge        │
        └─────────────────────────────────────────────────────────────┘
```

# Judge Harness — Issue #161 PR

> **Hard rule — third-party judge harness forbidden fixed scripts; MUST use
> md playbook.** This file is dispatched by the MAIN agent through subagents
> (TEAMWORK `N+1+(2N)`) or `claudefast -p` probes (FASTPROBE max 8 parallel).
> Failed sections rerun by re-dispatching `§V<n>`, not by editing scripts.

`run_id` is `issue161-<unix-timestamp>`. All artefacts land under
`.judge/<run_id>/`. After §V3 the lead reports PASS / FAIL based ONLY on the
verdict line in §V3's claudefast reply.

## §V1 — RUN (fixed tools, capture-everything)

The MAIN agent dispatches §V1 to a subagent (or runs inline). The subagent
must execute each tool, capture the full stdout + stderr to a file under
`.judge/<run_id>/evidence/`, and record the exit code.

### V1.1 — Unit & type checks

```
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Capture per-tool:
- `evidence/typecheck.stdout`
- `evidence/typecheck.stderr`
- `evidence/typecheck.exitcode`
- `evidence/test.stdout`
- `evidence/test.stderr`
- `evidence/test.exitcode`

### V1.2 — Walk-up unit suite (specific test file)

```
pnpm --filter @teamagent/cli test src/lib/__tests__/walk-up.test.ts
```

→ `evidence/walkup-unit.stdout`, `evidence/walkup-unit.exitcode`

### V1.3 — Issue 161 regression integration test

```
pnpm --filter @teamagent/cli test src/__tests__/issue-161-walkup-integration.test.ts
```

→ `evidence/regression.stdout`, `evidence/regression.exitcode`

### V1.4 — End-to-end repro (the one from the issue body)

This step EXACTLY replays liush2yuxjtu's reproducer comment. It is the
load-bearing real-world acceptance check.

```
SANDBOX="$(mktemp -d -t teamagent-issue161-judge.XXXX)"
mkdir -p "$SANDBOX/sub"
( cd "$SANDBOX" && git init -q && echo test > README.md && git add README.md && git commit -qm init )

# install the just-built teamagent so init runs against the PR diff
( cd packages/cli && pnpm build )
node packages/cli/dist/bin.js init --skip-import --cwd "$SANDBOX"

# A: parent
( cd "$SANDBOX" && claudefast -p \
    --output-format stream-json \
    --debug hooks \
    --debug-file ".judge/$RUN_ID/evidence/cc-parent.debug.log" \
    --include-partial-messages \
    --verbose \
    --permission-mode acceptEdits \
    'List the files in the current directory using ls. Reply only "DONE".' \
    > ".judge/$RUN_ID/evidence/cc-parent.jsonl" 2>&1 )

# B: child sub-directory
( cd "$SANDBOX/sub" && claudefast -p \
    --output-format stream-json \
    --debug hooks \
    --debug-file ".judge/$RUN_ID/evidence/cc-sub.debug.log" \
    --include-partial-messages \
    --verbose \
    --permission-mode acceptEdits \
    'List the files in the current directory using ls. Reply only "DONE".' \
    > ".judge/$RUN_ID/evidence/cc-sub.jsonl" 2>&1 )

# Extract metrics
parent_pretool=$(grep -c 'bin-pre-tool-use\.cjs' ".judge/$RUN_ID/evidence/cc-parent.debug.log" || echo 0)
sub_pretool=$(grep -c 'bin-pre-tool-use\.cjs' ".judge/$RUN_ID/evidence/cc-sub.debug.log" || echo 0)
```

Both `parent_pretool` and `sub_pretool` MUST be ≥ 1 after the fix; before
the fix `sub_pretool` is 0.

### V1.5 — Idempotency check (init run twice)

```
node packages/cli/dist/bin.js init --skip-import --cwd "$SANDBOX"
node packages/cli/dist/bin.js init --skip-import --cwd "$SANDBOX"

# Count TeamAgent hook entries in user-level settings
ua_settings="$HOME/.claude/settings.json"
ua_entries=$(jq '[.. | objects | select(.command? // "" | test("teamagent.*bin-pre-tool-use"))] | length' "$ua_settings" 2>/dev/null || echo 0)
```

`ua_entries` MUST equal exactly 1 (idempotent — running init twice does NOT duplicate).

## §V2 — DUMP (canonical JSON)

The MAIN agent dispatches §V2 to a subagent that emits exactly this
JSON to `.judge/<run_id>/judge.json`. No other shape, no extra keys. If a
metric is unobtainable because §V1 errored before it could be measured,
write `null` for that field — never invent.

```json
{
  "run_id": "issue161-<unix-timestamp>",
  "evidence_dir": ".judge/issue161-<unix-timestamp>/evidence/",
  "stdout_path": ".judge/issue161-<unix-timestamp>/evidence/test.stdout",
  "exit_code": 0,
  "metrics": {
    "typecheck_clean": true,
    "tests_passed_total": 1234,
    "tests_failed_total": 0,
    "walkup_unit_passed": 6,
    "walkup_unit_failed": 0,
    "regression_passed": true,
    "cc_parent_pretool_count": 1,
    "cc_sub_pretool_count": 1,
    "user_level_hook_entry_count": 1,
    "user_level_idempotent": true
  }
}
```

## §V3 — READ (LLM judge — never the author / executor / code)

The MAIN agent dispatches §V3 by calling `claudefast -p` (or `codex exec
--skip-git-repo-check -s read-only`) with a prompt that:

1. Reads ONLY `.judge/<run_id>/judge.json` and the evidence files referenced.
2. Does NOT read source code, commits, or PR diff (the judge must not be
   tempted to grade the implementation).
3. Returns a single line `VERDICT: PASS` or `VERDICT: FAIL: <reason>`.

### Suggested prompt for §V3

```
Read .judge/<RUN_ID>/judge.json and the files it references in evidence_dir.

Acceptance criteria for issue #161:
  (a) typecheck_clean == true
  (b) tests_failed_total == 0
  (c) walkup_unit_failed == 0 AND walkup_unit_passed >= 6
  (d) regression_passed == true
  (e) cc_parent_pretool_count >= 1
  (f) cc_sub_pretool_count >= 1   ← THIS is the load-bearing fix; before the fix it was 0
  (g) user_level_hook_entry_count == 1
  (h) user_level_idempotent == true

Reply with EXACTLY one line:
  VERDICT: PASS
or
  VERDICT: FAIL: <one-sentence reason citing which criterion failed>

Do not summarise the run. Do not read source code. Only grade the JSON.
```

### Re-dispatch rules

- If §V3 returns `FAIL: <criterion>`, re-dispatch ONLY the failing §V<n>
  section by spawning a fresh subagent (or claudefast probe) to fix the
  underlying behaviour and re-run.
- Never edit `judge.md` to change the criteria mid-run. If criteria are
  genuinely wrong, raise it as a separate plan-update commit BEFORE the
  next dispatch.
- Never grade based on the lead agent's own opinion. The verdict line in
  §V3 is authoritative.

## See also

- `docs/HOWTO-PLAN-PR.md` § 3b — judge harness section structure.
- `docs/PR-PLAN.md` § ③ — same structure used for post-PR fix harnesses.
- `~/.claude/docs/rules/testing-judge-harness.md` — user-level rule on why
  the harness has to be a third-party md playbook, not a fixed `.sh`.
