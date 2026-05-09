```
Order 1  →  Order 2  →  Order 3  →  Order 4  →  Order 5  →  [Order 6: CI V5 main-only]
  │            │            │            │            │              │
  ▼            ▼            ▼            ▼            ▼              ▼
install      resume       install     doc-sync    CI V1–V4    CI V5: canned-answer
preview      state        merge                  (PR-safe)   probes on main ONLY
                          path                               (burns API quota)
```

> 呷呷~ 鸭鸭说：前面五个兄弟把装好了装好文档了装好 CI 了，鸭鸭这一关是「合并到主干之后才跑的大考」——用真实 claudefast 问问题，验证所有 canned answer 锚点还在，要烧 API 额度，所以 PR 阶段鸭鸭睡觉不管，等合并了才跳出来开始验收！(>ω<)

---

## § 1. Task description

### Issue reference

GitHub issue: **libz-renlab-ai/TeamBrain#155** — V5 validation: after the install change (orders 1+3+4), canned-answer probes for `CLAUDE.md` / `AGENTS.md` must still emit the same canonical anchors as before install.

### What this order does

Add a new GitHub Actions workflow (`.github/workflows/install-canned-answer-check.yml`) that:

1. Triggers **only on `push` to `main`** — i.e. when a PR merges into main. Never on `pull_request`.
2. Installs TeamAgent from the freshly-merged commit on main using the path from orders 1+3+4 (`npm install -g ...tarball...`).
3. Runs a fixed set of `claudefast -p` probes (via `scripts/claudefast-ci.sh`) against the freshly-installed binary, asserting that every required canned-answer anchor is still present in the output.
4. On anchor failure: automatically opens a **P1 GitHub issue** titled `[P1] canned-answer regression on main: <anchors>`, body containing the failing anchors, commit SHA, run URL, and assigned to the last committer (`${{ github.event.head_commit.author.name }}`). Does **not** attempt an auto-revert PR (too risky to auto-touch main; a human reviews first).
5. Enforces an **API-quota cap**: the workflow uses a `timeout-minutes: 8` job-level cap and exits with an error if total wall time exceeds that limit. Each probe is individually capped at 120 s. A budget comment in the workflow documents the expected token cost per run (≈ 5 short `-p` probes × ~$0.003 each = **~$0.015 per main push**).

### What this order does NOT do

- Does **not** run on PRs, fork pushes, or branches other than `main`.
- Does **not** block the merge synchronously (merge already happened before this workflow starts).
- Does **not** touch the install code itself (orders 1+3+4 own that).
- Does **not** duplicate the V1–V4 checks from order 5 (those are npm-only, no API cost; this order is the API-consuming canned-answer layer).
- Does **not** ship in an enabled state until orders 1+3+4 have merged (see conditional dependency below).

### Conditional dependency

**This workflow must ship initially with `if: false` disabling the job**, or as a `workflow_dispatch`-only trigger. One 1-line follow-up commit after orders 1+3+4 merge switches the trigger to `push: branches: [main]`. The plan notes this explicitly so reviewers don't accidentally enable a broken V5 before the install path it tests actually exists.

Dependency chain:
```
order-1 (install preview)  ──┐
order-3 (install merge)    ──┼──► orders 1+3+4 merged onto main
order-4 (doc sync)         ──┘
                                   │
                                   ▼
                           enable order-6 workflow trigger
```

---

## § 2. Expected outputs

### 2a. New file

| Path | Description |
|------|-------------|
| `.github/workflows/install-canned-answer-check.yml` | Main-only canned-answer CI workflow |

### 2b. Canned-answer anchors checked by V5

The workflow asserts each of the following anchor strings in the `claudefast -p` output for the corresponding probe question:

| Probe question | Required anchors |
|----------------|-----------------|
| `what project tools we have?` | `FASTPROBE`, `TEAMWORK`, `PR-PLAN`, `POSTPR` |
| `what would happen if we say word 'FASTPROBE'?` | `claudefast -h`, `parallel`, `stream-json` |
| `what would happen when we say DOGFOOD?` | `two tmux windows`, `left/right split`, `interact` |
| `what would happen when user find a bug?` | `github.com/libz-renlab-ai/TeamBrain`, `system info`, `reproduce`, `raw logs`, `great detail` |
| `what would happen if we say PRESHIP` | `已验证`, `产品`, `CSV` (or equivalent EN: `verified`, `product`, `csv`) |

Total anchors asserted: **≥ 16** across 5 probes.

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
- Per-probe cap: `timeout 120 bash scripts/claudefast-ci.sh -p "..."` (wraps each call)
- Documented expected cost: **~$0.015 per main push** (5 short `-p` probes × ~$0.003)
- Secret required: `MINIMAX_API_KEY` — if absent, entire job is skipped with a warning (mirrors the existing `claudefast-anchors.yml` pattern)

### 2e. Anti-goals

- Not blocking PR merge
- Not running on `pull_request` trigger
- Not re-running the install correctness checks from V1–V4 (no duplication)
- Not auto-reverting main (too risky; human reviews the P1 issue)
- Shipped **disabled** until orders 1+3+4 are merged

---

## § 3. How-to-verify (judge harness)

### Module under test

`.github/workflows/install-canned-answer-check.yml` + `scripts/claudefast-ci.sh` (unchanged from existing)

### Expected JSON schema

```json
{
  "anchors_checked": 16,
  "anchors_passing": 16,
  "anchors_failing": [],
  "api_quota_used_usd": "0.015",
  "main_only": true,
  "pr_skip": true
}
```

### 1+2+3 gate

1. **Step 1 — claudefast check**: `!claudefast -p "Read .github/workflows/install-canned-answer-check.yml. Does the on: trigger include only push to main (not pull_request)? Does it include a timeout-minutes cap? Does it reference MINIMAX_API_KEY? Output ONE LINE JSON: {\"main_only\":true|false,\"has_timeout\":true|false,\"has_secret\":true|false}"` — must return all three `true`.

2. **Step 2 — codex exec check**: Same prompt via `codex exec --skip-git-repo-check -s read-only "..."` — JSON must hard-match step 1's output (`jq -S | diff -u`).

3. **Step 3 — interactive `/export`**: Run `claudefast` in a tmux session; ask it to simulate the V5 workflow (describe what happens when triggered on main push). Export the session with `/export .fastprobe/v5-verify-<epoch>.json` and attach the file to the PR.

### Third-party judge

A separate `claudefast -p` call (NOT run by the plan author) reads:
- The workflow YAML
- A captured CI run output JSON (from a `workflow_dispatch` dry-run on a test branch)

And grades:
```
claudefast -p "Read .github/workflows/install-canned-answer-check.yml and
.judge/<run_id>/judge.json. Verify (a) trigger is push-to-main only;
(b) at least 5 probe questions are run; (c) failure path creates a GitHub
issue with label P1; (d) quota cap is documented; (e) workflow ships
disabled until dependency orders land.
Output ONE LINE JSON: {\"pass\":true|false, \"missing\":[...], \"notes\":\"\"}"
```

The judge must be a different Claude Code session (not the implementing agent) to satisfy the third-party requirement.

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
Identify which pattern best matches what we need for install-canned-answer-check.yml."
```

### Probe C — API quota budget

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/scripts/claudefast-ci.sh
and .github/workflows/claudefast-anchors.yml.
What is the approximate token cost per claudefast -p probe call in the CI?
What is the MINIMAX_API_KEY secret guard pattern used?
Estimate total cost if we run 5 short probes per main push."
```

### Probe D — Review docs/PRESHIP.md for verified-only anchor list

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/docs/PRESHIP.md.
List any machine-checkable anchor strings that a CI canned-answer check should assert
when the probe question 'what would happen if we say PRESHIP' is asked.
Output as a list: anchor_string | language (zh/en) | source_line."
```
