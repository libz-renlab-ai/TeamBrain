```
                  judge.md — third-party judge harness (md playbook)
                  ====================================================

   §V1 RUN ──► fixed tools, captured to evidence_dir
        │
        ▼
   §V2 DUMP ──► canonical JSON at .judge/<run_id>/judge.json
        │       schema: exit_code / metrics / evidence_dir / stdout_path
        ▼
   §V3 READ ──► separate claudefast -p / codex exec reads JSON ONLY
                grades PASS / FAIL — never the agent that wrote the code

   Hard rule (HOWTO-PLAN-PR.md, PR-PLAN.md):
   ┌────────────────────────────────────────────────────────────┐
   │ third-party judge harness forbidden fixed scripts;          │
   │ MUST use md playbook                                        │
   │ Failed sections rerun by re-dispatching §V<n>,              │
   │ NOT by editing scripts.                                     │
   └────────────────────────────────────────────────────────────┘
```

# judge.md — Issue #122 Acceptance Harness

This is the **md playbook** the MAIN agent dispatches via TEAMWORK
sub-agents and / or `claudefast -p` probes. It is intentionally **not**
a `.sh` script — see `docs/PR-PLAN.md` § Hard rules.

`<run_id>` convention: `${ISO_DATE}-${SLICE}` (e.g.
`2026-05-08T1730-pages-200`).

## §V1 RUN — fixed tools

Each verification slice has a fixed command set. Capture stdout and
stderr to `evidence_dir = .judge/<run_id>/evidence/`.

### §V1.A — Pages-deploy gate

```
1.  gh api /repos/libz-renlab-ai/TeamBrain/environments/github-pages \
      > evidence_dir/env.json
2.  gh api /repos/libz-renlab-ai/TeamBrain/environments/github-pages/deployment-branch-policies \
      > evidence_dir/branch-policies.json
3.  gh run list --workflow=landing-deploy.yml --limit 5 --json conclusion,createdAt,headBranch,event,databaseId \
      > evidence_dir/runs.json
4.  curl -sIL https://libz-renlab-ai.github.io/TeamBrain/ \
      > evidence_dir/curl-headers.txt
5.  curl -s -o evidence_dir/index.html \
      -w "%{http_code}\n" https://libz-renlab-ai.github.io/TeamBrain/ \
      > evidence_dir/http-code.txt
```

### §V1.B — GIF / hero-asset gate

```
1.  ls -la apps/landing/public/double-moment.gif > evidence_dir/gif-stat.txt 2>&1
2.  file apps/landing/public/double-moment.gif >> evidence_dir/gif-stat.txt 2>&1
3.  grep -nE 'gif-placeholder|double-moment\.gif' apps/landing/src/index.html \
      > evidence_dir/index-gif-refs.txt
4.  curl -s -o evidence_dir/page-html.txt \
      https://libz-renlab-ai.github.io/TeamBrain/
5.  grep -c 'double-moment.gif' evidence_dir/page-html.txt \
      > evidence_dir/gif-on-page-count.txt
```

### §V1.C — TTHW recording / scaffold gate

```
1.  ls -la docs/plans/issue-84/v1-dogfood/ > evidence_dir/dogfood-dir.txt 2>&1
2.  find docs/plans/issue-84/v1-dogfood -name '*.cast' -o -name '*.md' \
      > evidence_dir/dogfood-files.txt
3.  cat docs/plans/issue-84/v1-dogfood/README.md \
      > evidence_dir/recording-protocol.md 2>&1
4.  ls -la docs/plans/issue-84/v1-dogfood/template-comment.md \
      > evidence_dir/template-ledger.txt 2>&1
    # NOTE: original draft of this step referenced scripts/dogfood/tthw-record.sh,
    # which was never in scope for this PR (docs-only scaffold; the tthw-record.sh
    # script is a future deliverable, not gated by issue #122). Step rewritten to
    # check the actual ledger template that ships with this PR.
```

### §V1.D — Repo green gate (must remain green)

```
1.  pnpm install --frozen-lockfile 2>&1 | tee evidence_dir/install.log
2.  pnpm typecheck 2>&1 | tee evidence_dir/typecheck.log
3.  pnpm test 2>&1 | tee evidence_dir/test.log
```

### §V1.E — Feature-verification 1+2+3 gate (per docs/feature-verification.md)

Per ADR-0007 and the 2026-05-10 user rule "do not use codex anywhere,"
this slice uses ONLY the canonical 2-path verification from
`docs/feature-verification.md` plus a regression hardmatch (re-run path 1
and byte-diff against the first capture). No `codex exec` calls.

```
1.  # Path 1 — claudefast headless JSON capture
    claudefast -p --output-format json "<MODULE> --help" \
      > evidence_dir/claudefast.json
    jq -S . evidence_dir/claudefast.json > evidence_dir/claudefast.sorted.json
2.  # Path 2 — claudefast tmux interactive + /export (canonical, required)
    (interactive tmux) claudefast → same prompt → /export evidence_dir/claudefast-tmux.export
    test -s evidence_dir/claudefast-tmux.export
    # If skipping in a specific run (e.g. docs-only PR), justify the skip
    # in an As-built note below — do not weaken the playbook itself.
3.  # Hardmatch regression — re-run path 1, byte-diff vs first capture
    claudefast -p --output-format json "<MODULE> --help" \
      > evidence_dir/claudefast-rerun.json
    jq -S . evidence_dir/claudefast-rerun.json > evidence_dir/claudefast-rerun.sorted.json
    diff -u evidence_dir/claudefast.sorted.json \
            evidence_dir/claudefast-rerun.sorted.json \
      > evidence_dir/hardmatch.diff
```

`<MODULE>` = `pnpm teamagent skeleton-demo` (if dogfood scaffolds touch
CLI) **or** `pnpm --filter landing build` (if scope stays in
`apps/landing`). The implementing agent picks one and writes it back
into this file before §V2.

**As-built note (PR #177, 2026-05-08):** Slice E originally selected
`pnpm teamagent --help` (resolved to `node_modules/.bin/tsx packages/cli/src/bin.ts --help`)
because the planned `pnpm --filter landing build` script is `cp -r src/. dist/`
with no `--help` to canonicalise. The §V1.E evidence under
`.judge/2026-05-08-issue-122-E/evidence/` reflects this substitution.
Codex was further substituted with direct shell exec because
`OPENAI_API_KEY` was not set in the worker's environment (HTTP 401);
hardmatch on the substituted artefact was byte-clean (0 bytes diff)
but tautological (same source diffed against itself).

**Codex-removal note (PR #269, 2026-05-10):** Per ADR-0007 and the
2026-05-10 user rule "do not use codex anywhere," the codex step has
been removed entirely. The new flow uses claudefast for both the
headless JSON capture and the tmux interactive `/export`, plus a re-run
regression diff to catch tooling/model drift. The `OPENAI_API_KEY`
environment variable is no longer required for §V1.E. PR #269 itself
does not re-execute any of §V1.E (Path 1, Path 2, or the hardmatch
regression) — see "Scope of this PR" below for the full deferral and
the named followup work that flips R5 retroactively.

**Scope of this PR (codex-removal only):** This PR updates the §V1.E
playbook to drop the codex dependency. It does NOT re-execute §V1.E
to produce a fresh `hardmatch_clean=true` artefact, because the
canonical 2-path flow with `<MODULE>` = `pnpm teamagent --help` lacks
a strict JSON Schema (only `teamagent stats --help` has
`docs/feature-verification/stats-help.schema.json`), so two
LLM-transcribed JSON captures cannot be reliably byte-equal across
runs without schema-constrained output. As a proof-of-life for the
new playbook, `.judge/2026-05-10-issue-122-E/evidence/teamagent-stats-help.raw.txt`
captures the deterministic CLI baseline. **Followup work (separate
issue):** define a JSON Schema for `pnpm teamagent --help` (or pick a
sub-command that already has one and update `<MODULE>` here), then
re-execute §V1.E to produce `hardmatch_clean=true` and flip R5 from
⚠️ PARTIAL to ✅ PASS retroactively on issue #122.

## §V2 DUMP — canonical JSON

The runner writes one file per slice:

```
.judge/<run_id>/judge.json
```

Schema (every slice produces this shape):

```json
{
  "slice": "A | B | C | D | E",
  "run_id": "2026-05-08T1730-A",
  "exit_code": 0,
  "metrics": {
    "pages_http_code": 200,
    "pages_deploy_last_conclusion": "success",
    "branch_policies_includes_main": true,
    "gif_on_disk_bytes": 1234567,
    "gif_referenced_in_html": true,
    "gif_on_live_page": true,
    "dogfood_dir_exists": true,
    "recording_protocol_present": true,
    "pnpm_test_exit": 0,
    "pnpm_typecheck_exit": 0,
    "hardmatch_clean": true
  },
  "evidence_dir": ".judge/<run_id>/evidence/",
  "stdout_path": ".judge/<run_id>/evidence/<primary>.txt"
}
```

The runner does **not** decide PASS/FAIL — it only emits exit codes and
metric numbers. Grading happens in §V3.

## §V3 READ — LLM judge (read-only)

A separate `claudefast -p` (or `codex exec -s read-only`) is dispatched
with the prompt below. The judge agent **only** reads the JSON +
evidence; it never re-runs commands and never reads the
implementation.

### Judge prompt template

```text
You are a third-party PR judge. You are NOT the agent that wrote the
code. You may read ONLY:

  .judge/<run_id>/judge.json
  .judge/<run_id>/evidence/**

You may NOT read source files, run tools, or trust the agent's word.

Grade each acceptance row below as PASS or FAIL with one-line reason
citing the evidence file you used.

Acceptance rows (issue #122):

  R1. Pages live              metrics.pages_http_code == 200
                              AND metrics.pages_deploy_last_conclusion == "success"
                              AND metrics.branch_policies_includes_main == true

  R2. Hero GIF on page        metrics.gif_on_disk_bytes > 0
                              AND metrics.gif_referenced_in_html == true
                              AND metrics.gif_on_live_page == true
                              (this also closes issue #120)

  R3. Dogfood scaffold ready  metrics.dogfood_dir_exists == true
                              AND metrics.recording_protocol_present == true

  R4. No regression           metrics.pnpm_test_exit == 0
                              AND metrics.pnpm_typecheck_exit == 0

  R5. 1+2+3 feature gate      metrics.hardmatch_clean == true
                              AND tmux /export file present in evidence_dir

  R6. (manual, post-merge)    ≥ 1 real stranger TTHW ≤ 300s
                              recorded under docs/plans/issue-84/v1-dogfood/
                              — judged separately when human attaches recording

Output JSON only:

{
  "verdict": "PASS" | "FAIL",
  "rows": [
    {"row": "R1", "verdict": "PASS|FAIL", "reason": "...", "evidence": "..."},
    ...
  ]
}
```

### Failure recovery

- A FAIL on R1 → re-dispatch §V1.A after re-running the env-policy fix
  (TEAMWORK Slice A). Do not edit this playbook.
- A FAIL on R2 → re-dispatch §V1.B after Slice C re-records / re-uploads
  the GIF.
- A FAIL on R4 (regression) → re-dispatch §V1.D **and** the slice that
  introduced the regression; do not paper over by skipping tests.
- A FAIL on R5 (1+2+3 hardmatch) → fix the divergent module's `--help`
  output; re-dispatch §V1.E.

R6 is intentionally separate — it requires a human-recorded `.cast`
file that no AI agent can produce honestly per #84 acceptance. The
PR is mergeable with R1–R5 PASS; R6 is closed via a follow-up comment
on the issue (not a follow-up PR).

## What the harness explicitly does NOT do

- Does not run `pnpm test` itself in §V3 — that's §V1's job, captured
  to log files.
- Does not curl the live site in §V3 — §V1 already captured headers.
- Does not "trust the implementing agent" — every metric is derived
  from a tool output, not a self-report.
- Does not produce a numeric score — only PASS / FAIL per row.
