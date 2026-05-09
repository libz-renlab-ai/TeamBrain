```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  Issue #155 — Strict-permission-mode install: CI auto-verification V1–V4            ║
║                                                                                      ║
║  Order 1  →  Order 2  →  Order 3  →  Order 4  →  [Order 5: CI V1-V4]  →  Order 6   ║
║                                                         ↑ THIS FILE                  ║
║  Depends on: Order 1 (--preview flag) + Order 3 (install command merge)              ║
║  Landing strategy: ships DISABLED (workflow_dispatch only) until Orders 1+3 land.    ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

**鸭语 TL;DR**：呷呷~ 鸭鸭要给 V1-V4 这四道验收题做成 CI 流水线，在隔离容器里自动跑，PR 一开就自动检查，V4 时间部分 CI 管，UX 噪音部分人工管！(>ω<)

---

## § 1. Task description

### What we are doing (anchored to issue #155 sub-order 5)

Add a new GitHub Actions workflow **`.github/workflows/install-verify.yml`** that
runs on every pull request in an isolated Ubuntu container and automatically
validates V1–V4 of the issue #155 acceptance criteria:

- **V1**: Strict-permission-mode install + auto-health-check completes with
  exactly 1 permission prompt total (not 0, not 2+).
- **V2**: Both `--preview` (order 1) and real `install` (order 3) print the
  5-section manifest:
  `[config]` / `[skills]` / `[kb]` / `[download]` / `[refusal]`.
- **V3**: Ctrl-C mid-install → rerun → resume (order 2 state) → all health
  checks pass.
- **V4 (CI-automatable part)**: Wall-clock timing in lenient/permissive mode
  is **≤ +20 %** vs the pre-#155 baseline captured at order-3 merge time.
  This is purely a timing measurement — CI runs it and checks the number.

### How we are doing it

1. Write a container-based GHA job (`ubuntu-latest`) that:
   - Installs the TeamAgent CLI from the worktree's build output (`pnpm build`
     then the npm pack tarball, or `pnpm teamagent` direct from workspace).
   - Injects a **strict-permission shim** (`scripts/ci-strict-permission-shim.sh`)
     that records all permission prompts and auto-answers the first one "yes",
     blocks any second prompt (causing the test to fail with a non-zero exit
     code).
   - Runs each V1–V4 sub-script in sequence and writes
     `.judge/<run_id>/judge.json` with boolean pass fields.
2. Wire the GHA status check name `install-verify (V1-V4)` so it appears in
   the PR required-checks list.
3. V4 UX-noise component (whether the manifest + progress bar is "annoying" to
   a real user) is **explicitly deferred to a human product-owner gate** and
   is not automated. The CI records `v4_ux_noise_deferred: true` in the JSON
   to signal this component is pending manual review.
4. Ship the workflow with trigger `workflow_dispatch` only until orders 1+3
   land, then add `pull_request` via a 1-line follow-up edit.

### What we are NOT doing

- **NOT running V5** — V5 calls live LLM canned-answer probes that burn API
  quota; V5 belongs to order 6 (main-only), which runs on a schedule or is
  manually triggered.
- **NOT replacing the existing `ci.yml`** — the new workflow is additive; it
  does not touch the existing test/typecheck/verify matrix.
- **NOT auto-blocking merge on V4 UX noise** — the timing component CAN block
  merge; the UX-noise component cannot be automated and stays human-gated.
- **NOT running before orders 1+3 exist** — the workflow ships disabled
  (`workflow_dispatch` only). Once orders 1 (preview flag) and 3 (install
  command merge) are merged to `main`, a follow-up 1-line edit to
  `install-verify.yml` adds `pull_request` to the `on:` trigger, enabling
  the check on all subsequent PRs.

### Conditional dependency + landing strategy

This plan explicitly depends on:
- **Order 1** (preview flag) — V2 requires `pnpm teamagent install --preview`
  to exist and print the 5-section manifest.
- **Order 3** (install command with strict-permission mode) — V1, V3, and V4
  all require the final install command to exist.

Landing strategy chosen: **(b) ship disabled** — the workflow YAML is merged
to `main` as part of this order's PR with `on: workflow_dispatch` only. Once
orders 1 and 3 have landed, a 1-line follow-up commit changes:

```yaml
# Before (disabled):
on:
  workflow_dispatch:

# After (enabled, after orders 1+3 land):
on:
  pull_request:
  workflow_dispatch:
```

This avoids a chicken-and-egg problem where CI checks for a command that does
not yet exist and makes every PR red.

---

## § 2. Expected outputs

### Files to be added or changed

| File | Status | Notes |
|------|--------|-------|
| `.github/workflows/install-verify.yml` | NEW | Main workflow; ships with `workflow_dispatch` only trigger until orders 1+3 land |
| `scripts/ci-install-v1.sh` | NEW | V1 script: strict-permission shim + install run + prompt-count assertion |
| `scripts/ci-install-v2.sh` | NEW | V2 script: `--preview` + real install both print 5-section manifest |
| `scripts/ci-install-v3.sh` | NEW | V3 script: install → SIGINT → rerun → resume → all health checks pass |
| `scripts/ci-install-v4-timing.sh` | NEW | V4 timing script: permissive mode timing vs baseline, asserts ≤ +20 % |
| `scripts/ci-strict-permission-shim.sh` | NEW | Intercepts permission prompts, auto-answers first one, blocks second |
| `scripts/ci-install-judge.sh` | NEW | Aggregator: runs V1–V4 scripts, writes `.judge/<run_id>/judge.json` |
| `docs/plans/issue-155/order-5-ci-v1-v4/plan.md` | NEW (this file) | Plan document |

### CI status check

The GHA job registers the status check named **`install-verify (V1-V4)`** on
each PR. This name must be added to the branch-protection required-checks list
as part of the order-5 follow-up (after orders 1+3 land and the `pull_request`
trigger is enabled).

### Judge JSON schema

Each CI run produces `.judge/<run_id>/judge.json` with the following structure:

```json
{
  "run_id": "<timestamp-sha>",
  "v1_pass": true,
  "v2_pass": true,
  "v3_pass": true,
  "v4_timing_pass": true,
  "v4_ux_noise_deferred": true,
  "container_isolated": true,
  "prompt_count_v1": 1,
  "v2_manifest_sections_preview": ["config","skills","kb","download","refusal"],
  "v2_manifest_sections_install": ["config","skills","kb","download","refusal"],
  "v3_resume_health_pass": true,
  "v4_baseline_ms": 12000,
  "v4_measured_ms": 13800,
  "v4_delta_pct": 15.0,
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/stdout.log"
}
```

### Anti-goals (must NOT change)

- `ci.yml` test/typecheck matrix must remain unmodified.
- No API quota consumed in PR CI runs.
- No LLM calls from within the new workflow.
- V5 (canned-answer probes) must not be wired into this workflow.
- Existing `pnpm verify` command must not be replaced or overridden.

---

## § 3. How-to-verify (judge harness)

### Module under test

The module under test is the CI workflow `.github/workflows/install-verify.yml`
and its sub-scripts `scripts/ci-install-v{1,2,3,4-timing}.sh`.

**The CI workflow must NOT grade itself.** The workflow runs the V1–V4 scripts
and writes raw JSON evidence. A separate `claudefast -p` probe acting as
third-party judge reads the raw JSON + stdout logs and grades the run.

### 3a. Project-wide 1+2+3 gate

1. `!claudefast -p "Run bash scripts/ci-install-judge.sh --dry-run and emit canonical JSON with exit_code, manifest"` — records current workflow lint output.
2. `!codex exec --skip-git-repo-check -s read-only "Run bash scripts/ci-install-judge.sh --dry-run and output same JSON"` — reproduces the same output.
3. Hard-match both JSON files with `jq -S . | diff -u` — must be byte-identical.
4. Interactive tmux run with `/export .judge/v1-v4-interactive-export.md` attached to the PR.

### 3b. Third-party judge harness (plan-specific)

**RUN**: CI calls `bash scripts/ci-install-judge.sh` inside the container, which
invokes V1–V4 sub-scripts sequentially and captures stdout to
`.judge/<run_id>/stdout.log`.

**DUMP**: `ci-install-judge.sh` writes `.judge/<run_id>/judge.json` with the
schema above — all boolean pass fields plus timing deltas and evidence paths.

**READ**: A separate `claudefast -p` probe (run by the CI workflow's final step,
or manually post-merge) reads **only** the raw JSON + stdout log and grades the
run:

```bash
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  "Read .judge/<run_id>/judge.json and .judge/<run_id>/stdout.log.
   Grade each of V1-V4 as PASS/FAIL with one-line rationale.
   Output ONE LINE strict JSON:
   {\"v1\":\"PASS|FAIL\",\"v2\":\"PASS|FAIL\",\"v3\":\"PASS|FAIL\",
    \"v4_timing\":\"PASS|FAIL\",\"v4_ux\":\"DEFERRED\",\"notes\":\"<140 chars\"}"
```

**The `claudefast` probe does NOT run inside the install container** — it runs
in the caller's environment post-CI, reading only the evidence files. This
ensures the judge is structurally separate from the code under test.

### V4 split: CI-automatable vs human-gated

| V4 component | Who checks | Mechanism |
|---|---|---|
| Timing ≤ +20 % vs baseline | CI | `ci-install-v4-timing.sh` measures wall-clock ms, asserts `delta_pct <= 20`, writes result to judge.json |
| UX noise ("manifest + progress not annoying") | Product owner (human) | CI writes `v4_ux_noise_deferred: true` in judge.json. A PR checklist item requires product-owner sign-off comment before merge |

### Pass condition

The order-5 PR is ready to merge when:

- `install-verify.yml` workflow YAML passes GitHub Actions lint (yamllint / act dry-run).
- All four sub-scripts (`ci-install-v{1,2,3,4-timing}.sh`) pass shellcheck.
- `claudefast -p` and `codex exec` dry-run outputs hard-match (1+2+3 gate).
- Product owner (or reviewer) confirms they have read the V4 UX-noise deferral
  note and are OK with the plan to manually verify it once orders 1+3 land.
- The workflow is confirmed `workflow_dispatch`-only until orders 1+3 land.

---

## § 4. Claudefast probes BEFORE coding

The following probes should be run before writing any code for this order.
Run probes 1–3 in parallel; run probe 4 after reviewing probe 1 output.

**Probe A** — Existing GHA workflows and reusable patterns:
```
claudefast -p "List every file in /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/.github/workflows/. For each: (a) what trigger it uses; (b) whether it uses Docker containers or bare ubuntu-latest runners; (c) whether it installs pnpm/node and how. Output a markdown table."
```

**Probe B** — Strict-permission mode simulation in existing tests:
```
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/scripts/claudefast-ci.sh and search for any existing strict-permission or permission-shim patterns in scripts/ and packages/. How does TeamBrain currently simulate or test strict permission mode? List file paths and relevant line numbers."
```

**Probe C** — Docker and isolation setup:
```
claudefast -p "Does /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/docker/ contain any Dockerfile or container spec usable for install isolation? Read the docker/ directory listing and relevant files. What is the most reusable container baseline for running install tests in CI?"
```

**Probe D** — Issue #155 V1–V4 acceptance criteria detail (run after reviewing probe outputs):
```
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/docs/plans/issue-155/order-2-resume-state/plan.md and order-1-preview/plan.md. Summarize: (a) which step keys exist in the resume-state module; (b) what the 5-section manifest looks like; (c) what 'auto-health-check' means. This context is needed to write V1–V3 CI sub-scripts."
```

---

## Appendix: Order dependency matrix

```
Order 1 (--preview flag)      ─┐
Order 2 (resume-state module)  ─┤── Order 3 (install command merge)
                                │         │
                                │         └── Order 4 (doc sync)
                                │
                                └── Order 5 (CI V1-V4)  ← THIS FILE
                                    ships DISABLED until 1+3 land
                                              │
                                              └── Order 6 (CI V5, main-only schedule)
```

Orders 1, 2, and 3 can land in any order relative to each other (they are
orthogonal implementations). Order 5 must land AFTER order 3's PR is merged
and the install command actually exists in `main`. Order 6 is independent of
order 5 but is lower priority (manual/scheduled, not PR-gated).
