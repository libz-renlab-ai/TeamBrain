```
   __                                                
 <(o )___      Third-party judge harness — install-hook-cleanup-v0.11
  ( ._> /                                             
   `---'    md playbook (NOT a .sh script)

 ┌──────────────────────────────────────────────────────────────────┐
 │  §V1 RUN     ─►   §V2 DUMP    ─►   §V3 READ                       │
 │  fixed tools      JSON schema      separate claudefast -p reads   │
 │  capture to       evidence_dir +    ONLY raw JSON + evidence,     │
 │  evidence_dir     stdout_path       grades the run                │
 └──────────────────────────────────────────────────────────────────┘
```

# judge.md — Third-Party Judge Harness

**Hard rule** (`docs/HOWTO-PLAN-PR.md` § 3b + `~/.claude/docs/rules/testing-judge-harness.md`):
**third-party judge harness forbidden fixed scripts; MUST use md playbook.**

This file is the playbook. The MAIN agent dispatches each section through
subagents (TEAMWORK `N+1+(2N)`) or `claudefast -p` probes (FASTPROBE max 8
parallel). No section is a fixed bash script. Failed sections rerun by
re-dispatching `§V<n>`, not by editing scripts.

The PR author, the executing agent, and the code-under-test must never grade
the run themselves — that is what §V3 enforces.

---

## Setup — common to all sections

```
RUN_ID    = $(date -u +%Y%m%d-%H%M%S)-installhook-cleanup-v011
EVIDENCE  = .judge/${RUN_ID}/
```

Each subagent or probe writes its outputs under `${EVIDENCE}` and emits
exactly one JSON file at `${EVIDENCE}/judge.json` matching the §V2 schema.
Stdout / stderr from each tool gets captured to `${EVIDENCE}/<tool>.stdout`
and `${EVIDENCE}/<tool>.stderr`.

---

## §V1 RUN — fixed tools to invoke

Each subitem is a single tool invocation. Each can be dispatched independently.
None of them grade themselves; they are pure capture.

### V1.a — Type-check the monorepo

**Tool**: `pnpm typecheck`
**Capture**:
```
${EVIDENCE}/typecheck.stdout
${EVIDENCE}/typecheck.stderr
${EVIDENCE}/typecheck.exit
```
**Pass signal**: exit code 0, no new errors compared to PR base (`main`).

### V1.b — Run the full test suite

**Tool**: `pnpm test`
**Capture**:
```
${EVIDENCE}/test.stdout
${EVIDENCE}/test.stderr
${EVIDENCE}/test.exit
```
**Pass signal**: exit code 0, vitest reports `Test Files` line ends in `0 failed`. The project pins `fileParallelism: false` (Windows OOM workaround); do not enable parallelism in this run.

### V1.c — Targeted suite: install-hook + install-user-hook

**Tool**: `pnpm --filter @teamagent/cli test -- install-hook install-user-hook`
**Capture**:
```
${EVIDENCE}/test-install.stdout
${EVIDENCE}/test-install.stderr
${EVIDENCE}/test-install.exit
```
**Pass signal**: exit 0; both files' suites green; per-test count in stdout matches or exceeds the count seen on `main` for these files.

### V1.d — Feature-verification gate (canonical-help JSON diff)

**Tool**: dispatch a `claudefast -p` probe that runs `teamagent install-hook --help`, formats output to canonical JSON via `jq -S`, and `diff -u`s against the snapshot. The exact recipe lives in `docs/feature-verification.md`. Probe prompt:

> Run `pnpm teamagent install-hook --help` from the worktree root, capture stdout, parse to canonical JSON (sorted keys, 2-space indent), and write to `${EVIDENCE}/install-hook-help.canonical.json`. Then `diff -u snapshots/install-hook-help.canonical.json ${EVIDENCE}/install-hook-help.canonical.json > ${EVIDENCE}/install-hook-help.diff`. Report the diff line count to stdout. Do not grade — pure capture.

**Pass signal**: diff line count = 0, OR the snapshot is updated in this PR with reviewer-visible explanation in the PR body.

### V1.e — Orphan-scanner self-check after .sh removal

**Tool**: a small JS one-liner inside the test harness or a `claudefast -p` probe that calls `auditOrphanShellHooks(<worktree-root>)` against the post-PR tree.

> Import `auditOrphanShellHooks` from `packages/cli/src/commands/install-hook.ts` (compiled or via tsx) and call it with the worktree root. Print the returned array as JSON to `${EVIDENCE}/orphans.json`. Do not delete or modify anything.

**Pass signal**: `orphans.json` is `[]`. After this PR, the only remaining `.sh` in `.claude/hooks/` is `self-report-fused.sh`, which IS referenced from committed `.claude/settings.json`, so the scanner should report no orphans.

### V1.f — Settings.json structural sanity

**Tool**: a `jq` extraction to confirm the committed `.claude/settings.json` has exactly one Stop HookCommand and that command references `self-report-fused.sh`.

> `jq '.hooks.Stop[0].hooks | length' .claude/settings.json > ${EVIDENCE}/settings-stop-count.txt`
> `jq -r '.hooks.Stop[0].hooks[0].command' .claude/settings.json > ${EVIDENCE}/settings-stop-cmd.txt`

**Pass signal**: count file contains `1`; cmd file contains `self-report-fused.sh` and does NOT contain `digital-twin-tap.sh`.

### V1.g — Postinstall smoke (shim contract)

**Tool**: a temp dir simulation. The probe sets HOME to a tmpdir, runs `node packages/teamagent/bin.js install-user-hook` (or whichever bin entry), captures stderr (deprecation warning) and stdout (success message), and asserts the on-disk effect on the tmpdir's `.claude/settings.json`.

**Probe prompt**:

> Create a temp dir, set HOME to it, `pnpm --filter teamagent build` first if needed, then run `teamagent install-user-hook` once. Capture stderr to `${EVIDENCE}/postinstall-shim.stderr` and stdout to `${EVIDENCE}/postinstall-shim.stdout`. Read `<tmphome>/.claude/settings.json` after the call and copy it to `${EVIDENCE}/postinstall-shim.settings.json`. Do not grade.

**Pass signal**: stderr contains `[deprecation]`; settings.json has exactly one `SessionStart` entry tagged `teamagent-session-start`; no crash.

### V1.h — Lint guard on managed CLAUDE.md / docs

**Tool**: `pnpm teamagent compile --dry-run` (or whichever command verifies the managed-block contract — see `packages/cli/src/__tests__/compile.test.ts`).

**Pass signal**: dry-run reports no unintended block-rewrite, CLAUDE.md untouched (per the project's `compile` default behavior).

---

## §V2 DUMP — canonical JSON schema

After §V1 finishes, write `${EVIDENCE}/judge.json` with this exact shape:

```jsonc
{
  "run_id": "<RUN_ID>",
  "pr_branch": "worktree-shimmering-enchanting-quasar",
  "base_branch": "main",
  "started_at": "<ISO-8601 UTC>",
  "finished_at": "<ISO-8601 UTC>",
  "evidence_dir": ".judge/<RUN_ID>/",
  "exit_code": 0,                              // overall: 0 iff all V1.* pass; 1 otherwise
  "metrics": {
    "typecheck_exit": 0,
    "test_exit": 0,
    "test_failed_count": 0,
    "test_passed_count": <N>,                  // from vitest stdout parse
    "targeted_test_exit": 0,
    "targeted_test_failed_count": 0,
    "feature_verify_diff_lines": 0,            // 0 or snapshot-updated
    "orphan_count": 0,
    "stop_hook_command_count": 1,
    "stop_hook_cmd_basename": "self-report-fused.sh",
    "postinstall_shim_deprecation_seen": true,
    "postinstall_shim_session_start_tag": "teamagent-session-start",
    "compile_dry_run_modified_files": 0
  },
  "evidence": {
    "typecheck_stdout": "${EVIDENCE}/typecheck.stdout",
    "typecheck_stderr": "${EVIDENCE}/typecheck.stderr",
    "test_stdout": "${EVIDENCE}/test.stdout",
    "test_stderr": "${EVIDENCE}/test.stderr",
    "test_install_stdout": "${EVIDENCE}/test-install.stdout",
    "feature_verify_diff": "${EVIDENCE}/install-hook-help.diff",
    "feature_verify_canonical_json": "${EVIDENCE}/install-hook-help.canonical.json",
    "orphans_json": "${EVIDENCE}/orphans.json",
    "settings_stop_count": "${EVIDENCE}/settings-stop-count.txt",
    "settings_stop_cmd": "${EVIDENCE}/settings-stop-cmd.txt",
    "postinstall_shim_stderr": "${EVIDENCE}/postinstall-shim.stderr",
    "postinstall_shim_settings": "${EVIDENCE}/postinstall-shim.settings.json"
  },
  "stdout_path": "${EVIDENCE}/run.stdout",
  "summary": "<one-line factual summary; do NOT grade here>"
}
```

`summary` should be neutral, like: *"All 8 V1 tools ran; targeted install-hook
test passed N cases; orphan scanner reported 0; Stop hook count = 1."* It is
**not** a verdict — it is an inventory of what happened.

---

## §V3 READ — separate claudefast judge

A NEW `claudefast -p` invocation (separate process; never the implementation
agent) reads ONLY:

1. `${EVIDENCE}/judge.json`
2. The files referenced by `evidence` paths
3. The plan + research files (for context on what was supposed to happen)

It does NOT read the diff, the source code, or the implementation agent's
reasoning. This is the "third-party" guarantee.

### Probe prompt skeleton

```
You are an independent judge. Read ONLY:
  - docs/plans/2026-05-09-install-hook-cleanup-v0.11/plan.md
  - docs/plans/2026-05-09-install-hook-cleanup-v0.11/research.md
  - .judge/<RUN_ID>/judge.json
  - any files referenced in judge.json.evidence

Decide whether the run satisfies the plan's expected outputs.

Output STRICTLY this JSON shape and nothing else:
{
  "verdict": "PASS" | "FAIL",
  "confidence": 0..1,
  "expected_outputs_met": [
    { "id": "channelOps_helper_extracted", "status": "yes|no|inconclusive", "evidence_ref": "<path>" },
    { "id": "digital_twin_sh_removed",    "status": "...", "evidence_ref": "..." },
    { "id": "install_user_hook_shim",     "status": "...", "evidence_ref": "..." },
    { "id": "version_bumped_to_0_11_0",   "status": "...", "evidence_ref": "..." },
    { "id": "tests_green",                "status": "...", "evidence_ref": "..." },
    { "id": "typecheck_clean",            "status": "...", "evidence_ref": "..." },
    { "id": "feature_verify_diff_zero",   "status": "...", "evidence_ref": "..." },
    { "id": "orphan_scanner_zero",        "status": "...", "evidence_ref": "..." },
    { "id": "stop_hook_count_one",        "status": "...", "evidence_ref": "..." },
    { "id": "postinstall_shim_works",     "status": "...", "evidence_ref": "..." }
  ],
  "anti_goals_respected": [
    { "id": "command_not_deleted",        "status": "yes|no", "evidence_ref": "..." },
    { "id": "postinstall_mjs_unchanged",  "status": "yes|no", "evidence_ref": "..." },
    { "id": "no_project_level_digital_twin", "status": "yes|no", "evidence_ref": "..." },
    { "id": "statusline_logic_unchanged", "status": "yes|no", "evidence_ref": "..." },
    { "id": "no_tag_constants_changed",   "status": "yes|no", "evidence_ref": "..." }
  ],
  "blocking_findings": [
    { "severity": "P1|P2|P3", "summary": "...", "evidence_ref": "..." }
  ],
  "non_blocking_observations": [ "..." ]
}
```

### Verdict rules (mechanical, judge applies them)

- `verdict = PASS` iff:
  - Every `expected_outputs_met[*].status == "yes"`
  - Every `anti_goals_respected[*].status == "yes"`
  - `blocking_findings` is empty OR all entries are P3
- Otherwise `verdict = FAIL` with `blocking_findings` populated

### Re-dispatch rule

If §V3 returns FAIL, the MAIN agent does NOT edit `judge.md`. Instead:

1. Identify which V1.* sub-tool's evidence drove the FAIL
2. Rerun ONLY that sub-tool (re-dispatch §V1.\<x>)
3. Update `${EVIDENCE}/judge.json` metrics for that tool
4. Re-invoke §V3

This keeps the harness declarative and prevents the "fix the test until it
passes" antipattern.

---

## Where this plugs into the project gate

This md playbook is the **plan-specific** judge harness (`docs/HOWTO-PLAN-PR.md`
§ 3b). The **project-wide** gate (`docs/feature-verification.md` — canonical
JSON diff + tmux `/export`) is invoked from §V1.d above; the playbook does not
replace it, it inlines it as one of the V1 tools.

After PR opens, the local `/review` skill is the authoritative gate per
ADR-0007. POSTPR loop runs until `/review` returns PASS.

---

## See also

- `docs/HOWTO-PLAN-PR.md` § 3b — judge harness contract
- `docs/feature-verification.md` — project-wide gate
- `~/.claude/docs/rules/testing-judge-harness.md` — user-level rule
- `~/.claude/projects/-Users-m1-projects-TeamBrain/memory/feedback_judge_harness_md_playbook.md` — user memory: md playbook only
