> **AMENDMENT 2026-05-10 (issue #155 grill, worktree-146)**
>
> Minor scope refinement from grill Q1–Q6:
> - Install path used in CI = **enhanced `release/install.sh`** (Path A, post-Order-3) 而非 `npm install -g <tarball>` 直装
> - V5 canned-answer probes 跑在 post-#227 binary 上 (vector deps default-installed; ADR-0001 v2)
> - Order 2 CANCELLED per ADR-0011, but this CI doesn't depend on Order 2 → no impact
> - Probes 与 `verify-canned-answer` harness (现有 `docs/features/canned-answers/`) 关系: Order 6 是 main-only post-merge V5 验收, harness 是 PR-time canned-answer 静态检查; 两者互补不冲突
>
> Treat AMENDMENT as authoritative. See `docs/CONTEXT.md` Install paths section
> + `docs/adr/0011-install-resumption-via-idempotency.md` for full grill outcome.
> Original plan body below preserved for history.

---

```
Order 1  →  Order 2  →  Order 3  →  Order 4  →  Order 5  →  [Order 6: CI V5 main-only]
  │            │            │            │            │              │
  ▼            ▼            ▼            ▼            ▼              ▼
install      resume       install     doc-sync    CI V1–V4    CI V5: canned-answer
preview      state        merge                  (PR-safe)   probes on main ONLY
                          path                               (burns API quota)
```

> 呷呷~ 鸭鸭说：前面五个兄弟把装好了装好文档了装好 CI 了，鸭鸭这一关是「合并到主干之后才跑的大考」——但鸭鸭不再自己造轮子了！ADR-0012 让 ADR-0010 的 fixture-replay harness 多生一个 `--live-capture` 模式，鸭鸭只要写一行 GHA 调用 `pnpm teamagent fixture replay --tier=c --live-capture --prompt-set v5` 就行，标准 anchors 走 ADR-0010 的 v5 prompt-set fixture！(>ω<)

---

## § 1. Task description

### Issue reference

GitHub issue: **libz-renlab-ai/TeamBrain#155** — V5 validation: after the install change (orders 1+3+4), canned-answer probes for `CLAUDE.md` / `AGENTS.md` must still emit the same canonical anchors as before install.

### Design rationale (O1=B fold-in via ADR-0012)

This order originally proposed a standalone workflow + standalone shell
script (a project-local main-only canned-answer workflow + a project-local
CI driver shell script). Per **ADR-0012**, that approach is replaced by
**folding live-capture canned-answer checks into the existing fixture-replay
harness defined by ADR-0010**.

ADR-0012 extends ADR-0010 (it does **not** replace ADR-0010) by adding a new
`--live-capture` mode to the `pnpm teamagent fixture replay` CLI. In that mode,
the harness:

1. Runs each prompt in the named prompt-set against a live `claudefast -p` /
   `claude -p` invocation (instead of replaying a recorded fixture), and
2. Asserts the response contains the prompt-set's required anchor strings.

Order-6 therefore becomes a **1-line CLI invocation** wired into a GHA
workflow. There is no longer any conflict between ADR-0010 and order-6: both
share the same harness, and the API-spend budget for live capture is
explicitly documented and capped here.

### What this order does

Add a new GitHub Actions workflow (`.github/workflows/v5-fixture-replay.yml`) that:

1. Triggers **only on `push: branches: [main]`** — i.e. when a PR merges into main. Never on `pull_request`.
2. Runs a single 1-line CLI invocation:
   ```yaml
   - run: pnpm teamagent fixture replay --tier=c --live-capture --prompt-set v5
   ```
   The harness (defined by ADR-0012) handles probe execution, anchor matching,
   raw-JSON dump, and exit code. There is no project-local shell script for
   this workflow to maintain.
3. Uses the `v5` prompt-set fixture stored at
   `tests/fixtures/scenarios/v5-canned-answers/prompts.json` (exact path
   subject to ADR-0012's final layout). The 5 V5 anchor probes (see § 2b
   below) are the canonical content of that prompt-set.
4. On anchor failure: automatically opens a **P1 GitHub issue** titled
   `[P1] canned-answer regression on main: <anchors>`, body containing the
   failing anchors, commit SHA, run URL, and assigned to the last committer
   (`${{ github.event.head_commit.author.name }}`). Does **not** attempt an
   auto-revert PR (too risky to auto-touch main; a human reviews first).
5. Enforces an **API-quota cap**: the workflow uses a `timeout-minutes: 8`
   job-level cap and exits with an error if total wall time exceeds that
   limit. Each probe is individually capped by the harness (`--live-capture`
   per-prompt timeout). A budget comment in the workflow documents the
   expected token cost per run (≈ 5 short `-p` probes × ~$0.003 each =
   **~$0.015 per main push**), justifying live-capture's API spend.

### What this order does NOT do

- Does **not** run on PRs, fork pushes, or branches other than `main`.
- Does **not** block the merge synchronously (merge already happened before this workflow starts).
- Does **not** touch the install code itself (orders 1+3+4 own that).
- Does **not** duplicate the V1–V4 checks from order 5 (those are npm-only, no API cost; this order is the API-consuming canned-answer layer).
- Does **not** ship the original proposed standalone main-only canned-answer
  workflow file (replaced by `v5-fixture-replay.yml`).
- Does **not** ship the original proposed project-local CI driver shell script
  (functionality absorbed by the ADR-0012 `--live-capture` CLI mode in the
  existing fixture-replay harness).
- Does **not** ship in an enabled state until orders 1+3+4 have merged AND
  ADR-0012's `--live-capture` mode has landed (see conditional dependency
  below).

### Conditional dependency

**This workflow must ship initially with `if: false` disabling the job**, or
as a `workflow_dispatch`-only trigger. One 1-line follow-up commit after
orders 1+3+4 merge AND ADR-0012's `--live-capture` mode lands switches the
trigger to `push: branches: [main]`. The plan notes this explicitly so
reviewers don't accidentally enable a broken V5 before the install path it
tests and the harness mode it depends on actually exist.

This order **conflicts with neither ADR-0010 nor the original order-6
proposal** — ADR-0012 extends ADR-0010 (not replaces it), and the
1-line-CLI invocation here is the canonical consumer of that extension.

Dependency chain:
```
order-1 (install preview)             ──┐
order-3 (install merge)               ──┼──► orders 1+3+4 merged onto main
order-4 (doc sync)                    ──┘     │
                                              │
ADR-0010 (fixture-replay harness)     ──┐     │
ADR-0012 (--live-capture mode)        ──┴─────┤
                                              │
                                              ▼
                       enable order-6 workflow trigger
                       (1-line CLI: pnpm teamagent fixture replay
                        --tier=c --live-capture --prompt-set v5)
```

---

## § 2. Expected outputs

### 2a. New file

| Path | Description |
|------|-------------|
| `.github/workflows/v5-fixture-replay.yml` | Main-only canned-answer CI workflow; 1-line CLI invocation, no project-local script |

### 2a.1. Files NOT shipped (replaced by ADR-0012 fold-in)

| Path | Status | Reason |
|------|--------|--------|
| (originally-proposed standalone main-only canned-answer workflow) | **REMOVED from plan** (0-line / 0-file change) | Replaced by `v5-fixture-replay.yml` per ADR-0012 |
| (originally-proposed project-local CI driver shell script) | **REMOVED from plan** (0-line / 0-file change) | Functionality absorbed into the harness's `--live-capture` CLI mode (ADR-0012) |

### 2b. v5 prompt-set fixture (the 5 V5 anchor probes)

The 5 V5 anchor probes live as the **`v5` prompt-set fixture** at:

```
tests/fixtures/scenarios/v5-canned-answers/prompts.json
```

(Exact path subject to ADR-0012's final fixture-layout decision; the
prompt-set name `v5` is fixed.)

The fixture contents (each entry: `prompt` + `required_anchors[]`):

| Probe question | Required anchors |
|----------------|-----------------|
| `what project tools we have?` | `FASTPROBE`, `TEAMWORK`, `PR-PLAN`, `POSTPR` |
| `what would happen if we say word 'FASTPROBE'?` | `claudefast -h`, `parallel`, `stream-json` |
| `what would happen when we say DOGFOOD?` | `two tmux windows`, `left/right split`, `interact` |
| `what would happen when user find a bug?` | `github.com/libz-renlab-ai/TeamBrain`, `system info`, `reproduce`, `raw logs`, `great detail` |
| `what would happen if we say PRESHIP` | `已验证`, `产品`, `CSV` (or equivalent EN: `verified`, `product`, `csv`) |

Total anchors asserted: **≥ 16** across 5 probes. The harness reads
`prompts.json`, executes each prompt via the `--live-capture` driver, and
reports anchor pass/fail per prompt.

### 2b.1. GHA workflow content (1-line CLI invocation)

The full body of `.github/workflows/v5-fixture-replay.yml` is:

```yaml
name: v5-fixture-replay
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  v5-canned-answer-check:
    runs-on: ubuntu-latest
    timeout-minutes: 8
    if: ${{ secrets.MINIMAX_API_KEY != '' }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm teamagent fixture replay --tier=c --live-capture --prompt-set v5
        env:
          MINIMAX_API_KEY: ${{ secrets.MINIMAX_API_KEY }}
      - name: Open P1 issue on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            // assignee = last committer
            // title: [P1] canned-answer regression on main: <anchors>
            // body: failing anchors + commit SHA + run URL
            // (see § 2c failure behaviour for full schema)
```

### 2c. Failure behaviour

On any anchor failure the workflow:
1. Prints a machine-readable JSON summary to stdout:
   ```json
   {
     "anchors_checked": 16,
     "anchors_passing": <N>,
     "anchors_failing": ["<anchor1>", ...],
     "api_quota_used_usd": "<estimate>",
     "main_only": true,
     "pr_skip": true
   }
   ```
2. Calls `gh issue create` with label `P1`, title `[P1] canned-answer regression on main: <anchors>`, body containing commit SHA, workflow run URL, and the failing anchor list.
3. Exits with code 1 (so the workflow shows red in GitHub Actions — visible but non-blocking since merge is already done).

### 2d. API-quota cap

- Job-level timeout: `timeout-minutes: 8`
- Per-probe cap: enforced internally by the harness's `--live-capture`
  per-prompt timeout (configured in ADR-0012; default 120 s per prompt).
- Documented expected cost: **~$0.015 per main push** (5 short `-p` probes × ~$0.003).
  This justifies live-capture's API spend over the otherwise-zero-cost
  recorded-fixture replay: the V5 layer specifically requires fresh LLM
  responses to detect canned-answer drift in `CLAUDE.md` / `AGENTS.md`.
- Secret required: `MINIMAX_API_KEY` — if absent, entire job is skipped with
  a warning (mirrors the existing `claudefast-anchors.yml` pattern, encoded
  via the `if: ${{ secrets.MINIMAX_API_KEY != '' }}` job-level guard).

### 2e. Anti-goals

- Not blocking PR merge
- Not running on `pull_request` trigger
- Not re-running the install correctness checks from V1–V4 (no duplication)
- Not auto-reverting main (too risky; human reviews the P1 issue)
- Not shipping the originally-proposed standalone main-only canned-answer
  workflow file (replaced by `v5-fixture-replay.yml`)
- Not shipping the originally-proposed project-local CI driver shell script
  (replaced by the harness's `--live-capture` CLI mode)
- Not creating a parallel harness that conflicts with ADR-0010 (the
  conflict is resolved by ADR-0012 extending ADR-0010 with `--live-capture`)
- Shipped **disabled** until orders 1+3+4 AND ADR-0012's `--live-capture`
  mode are merged

---

## § 3. How-to-verify (judge harness)

### Module under test

The order-6 deliverable is two artifacts:

1. `.github/workflows/v5-fixture-replay.yml` (the GHA workflow file —
   verifiable by file content / regex on the 1-line CLI invocation).
2. `tests/fixtures/scenarios/v5-canned-answers/prompts.json` (the `v5`
   prompt-set fixture — verifiable by file existence and JSON schema).

The harness itself (`pnpm teamagent fixture replay --live-capture`) is
**not** under test by this order — it is owned by ADR-0012 and tested by
ADR-0012's own judge harness.

### Expected JSON schema

```json
{
  "workflow_file_exists": true,
  "workflow_triggers_push_main": true,
  "workflow_uses_live_capture_cli": true,
  "workflow_uses_prompt_set_v5": true,
  "workflow_has_timeout": true,
  "workflow_has_secret_guard": true,
  "v5_fixture_exists": true,
  "v5_fixture_prompt_count": 5,
  "v5_fixture_anchor_count_total": 16,
  "anchors_passing_on_live_run": 16,
  "anchors_failing_on_live_run": [],
  "api_quota_used_usd": "0.015",
  "main_only": true,
  "pr_skip": true
}
```

### 1+2+3 gate

1. **Step 1 — claudefast check**: `!claudefast -p "Read .github/workflows/v5-fixture-replay.yml. Does the on: trigger include only push to main (not pull_request)? Does it run 'pnpm teamagent fixture replay --tier=c --live-capture --prompt-set v5' as the canonical step? Does it include a timeout-minutes cap? Does it reference MINIMAX_API_KEY? Output ONE LINE JSON: {\"main_only\":true|false,\"uses_live_capture_cli\":true|false,\"prompt_set_v5\":true|false,\"has_timeout\":true|false,\"has_secret\":true|false}"` — must return all five `true`.

2. **Step 2 — codex exec check**: Same prompt via `codex exec --skip-git-repo-check -s read-only "..."` — JSON must hard-match step 1's output (`jq -S | diff -u`).

3. **Step 3 — interactive `/export`**: Run `claudefast` in a tmux session;
   ask it to simulate the V5 workflow (describe what happens when triggered
   on main push, including the harness driving the `v5` prompt-set in
   `--live-capture` mode). Export the session with
   `/export .fastprobe/v5-verify-<epoch>.json` and attach the file to the PR.

### Third-party judge

A separate `claudefast -p` call (NOT run by the plan author) reads:
- The workflow YAML (`.github/workflows/v5-fixture-replay.yml`)
- The `v5` prompt-set fixture (`tests/fixtures/scenarios/v5-canned-answers/prompts.json`)
- A captured CI run output JSON (from a `workflow_dispatch` dry-run on a test branch)

And grades:
```
claudefast -p "Read .github/workflows/v5-fixture-replay.yml,
tests/fixtures/scenarios/v5-canned-answers/prompts.json,
and .judge/<run_id>/judge.json.
Verify (a) workflow trigger is push-to-main only;
(b) workflow runs the 1-line CLI 'pnpm teamagent fixture replay --tier=c
    --live-capture --prompt-set v5' (no project-local shell script);
(c) v5 prompt-set fixture has 5 prompts and >= 16 total required anchors;
(d) failure path creates a GitHub issue with label P1, assignee = last
    committer (github.event.head_commit.author.name);
(e) quota cap is documented (timeout-minutes: 8, ~$0.015/run);
(f) workflow references ADR-0012 and ADR-0010 in its design rationale;
(g) workflow ships disabled until dependency orders land.
Output ONE LINE JSON: {\"pass\":true|false, \"missing\":[...], \"notes\":\"\"}"
```

The judge must be a different Claude Code session (not the implementing
agent) to satisfy the third-party requirement.

---

## § 4. Claudefast probes BEFORE coding

These probes should be run before writing the workflow YAML.

### Probe A — Enumerate all machine-checkable canned-answer anchors

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/CLAUDE.md and AGENTS.md.
List every canned-answer trigger question that has an explicitly stated machine-checkable anchor string
(e.g. grep targets like 'FASTPROBE', 'two tmux windows', etc.).
For each, output: trigger_question | anchor_strings[] | source_file | line_number.
Format as markdown table."
```

### Probe B — Check existing main-only workflow patterns

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/.github/workflows/.
Show every workflow that has push-to-main-only trigger (no pull_request).
List file name, on: section, and any quota/secret guard pattern.
Identify which pattern best matches what we need for the new
v5-fixture-replay.yml workflow shipped by this order."
```

### Probe C — API quota budget for live-capture mode

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/.github/workflows/claudefast-anchors.yml
and the ADR-0012 spec for the --live-capture mode of pnpm teamagent fixture replay.
What is the approximate token cost per --live-capture prompt invocation?
What is the MINIMAX_API_KEY secret guard pattern used in claudefast-anchors.yml?
Estimate total cost if we run the v5 prompt-set (5 prompts) per main push,
and confirm that cost stays within the documented ~$0.015/run cap."
```

### Probe E — Confirm ADR-0010 + ADR-0012 fold-in compatibility

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/docs/adr/0010-*.md
and the ADR-0012 spec.
Confirm: (a) ADR-0012 extends ADR-0010 (does not replace it);
(b) the --live-capture CLI flag lives on the same 'pnpm teamagent fixture
    replay' command as recorded-fixture replay;
(c) the v5 prompt-set fixture follows ADR-0010's tier-c fixture layout;
(d) order-6's 1-line GHA invocation is the canonical consumer.
Output ONE LINE JSON: {\"a\":true|false,\"b\":true|false,\"c\":true|false,\"d\":true|false,\"notes\":\"\"}"
```

### Probe D — Review docs/PRESHIP.md for verified-only anchor list

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/docs/PRESHIP.md.
List any machine-checkable anchor strings that a CI canned-answer check should assert
when the probe question 'what would happen if we say PRESHIP' is asked.
Output as a list: anchor_string | language (zh/en) | source_line."
```
