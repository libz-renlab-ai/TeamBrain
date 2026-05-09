```text
  judge.md — issue #120 double-moment GIF swap harness playbook
  (MD playbook, NOT a fixed bash script)

  main agent
      │
      ├─► sub-agent 1: gif-artifact-exists-and-size   (stat, wc -c)
      ├─► sub-agent 2: placeholder-removed             (grep -F, grep -E)
      ├─► sub-agent 3: landing-build-green             (pnpm --filter build)
      ├─► sub-agent 4: lighthouse-perf                 (pnpm --filter verify)
      ├─► sub-agent 5: pr-and-review                   (gh pr view --json)
      └─► sub-agent 6: gif-content-spot-check (optional / human-loop)
              │
              └─► main agent aggregates → verdict.json
```

# Judge harness — issue #120

This is the **MD playbook** for verifying that issue #120 has shipped the
double-moment demo GIF swap: `<div class="gif-placeholder">` replaced with
a real `<img>` tag, a `double-moment.gif` (or `.png` mosaic fallback) asset
under 2 MB, a green landing build, passing Lighthouse thresholds, and an
open non-draft PR that has received a `/review` PASS verdict.

The main agent dispatches one sub-agent per step. Each sub-agent runs its
fixed tools, writes `step-<N>/raw.json` + evidence files, and exits. The
main agent then reads all raw JSON files and issues a final `verdict.json`.
**No editorializing**: the main agent may only read raw JSON; it must not
re-run tools or inject subjective reasoning into the verdict.

---

## Inputs

Artifacts that must exist before the harness runs:

| Artifact | Notes |
|---|---|
| `apps/landing/public/double-moment.gif` | Primary asset; `.png` mosaic fallback also accepted |
| `apps/landing/src/index.html` | Must contain `<img>` swap; must NOT contain `<div class="gif-placeholder">` |
| `apps/landing/package.json` | Must expose `build` and `verify` (Lighthouse) scripts |
| PR number | Passed to the harness at runtime as `PR_NUMBER` env var or CLI arg |

---

## Outputs

The harness writes to a timestamped run directory:

```
docs/plans/issue-120/judge-output/<run-id>/
  verdict.json
  step-1/
    raw.json
    evidence/          # stat output, file listings
  step-2/
    raw.json
    evidence/          # grep stdout
  step-3/
    raw.json
    evidence/          # build log (stdout + stderr)
  step-4/
    raw.json
    evidence/          # lighthouse JSON report, full stdout
  step-5/
    raw.json
    evidence/          # gh pr view JSON, gh pr checks JSON
  step-6/
    raw.json           # manual check or automated frame scan result
    evidence/          # any extracted frames or notes
```

`<run-id>` is an ISO-8601 timestamp string (e.g. `2026-05-08T14:22:00Z`).

---

## verdict.json schema

Concrete example showing all steps green:

```json
{
  "run_id": "2026-05-08T14:22:00Z",
  "issue": 120,
  "steps": [
    {
      "id": 1,
      "name": "gif-artifact-exists-and-size",
      "exit_code": 0,
      "metrics": {
        "path": "apps/landing/public/double-moment.gif",
        "size_bytes": 1523456,
        "format": "gif"
      }
    },
    {
      "id": 2,
      "name": "placeholder-removed",
      "exit_code": 0,
      "metrics": {
        "placeholder_count": 0,
        "img_count": 1,
        "img_src": "double-moment.gif"
      }
    },
    {
      "id": 3,
      "name": "landing-build-green",
      "exit_code": 0,
      "metrics": {
        "exit_code": 0,
        "duration_ms": 4821,
        "stdout_tail": "... dist/index.html generated successfully ..."
      }
    },
    {
      "id": 4,
      "name": "lighthouse-perf",
      "exit_code": 0,
      "metrics": {
        "perf_score": 91,
        "lcp_ms": 1840,
        "cls": 0.02,
        "report_path": "docs/plans/issue-120/judge-output/2026-05-08T14:22:00Z/step-4/evidence/lh-report.json"
      }
    },
    {
      "id": 5,
      "name": "pr-and-review",
      "exit_code": 0,
      "metrics": {
        "pr_number": 164,
        "pr_state": "OPEN",
        "is_draft": false,
        "ci_status": "success",
        "review_verdict": "PASS"
      }
    },
    {
      "id": 6,
      "name": "gif-content-spot-check",
      "exit_code": 0,
      "metrics": {
        "gif_visible_check": "manual",
        "notes": "operator confirmed both moments visible with /clear cut"
      }
    }
  ],
  "verdict": "pass",
  "verdict_reason": "all 6 steps green; gif < 2 MB, placeholder removed, build clean, lighthouse perf=91 LCP=1840ms CLS=0.02, PR open non-draft CI green review PASS"
}
```

---

## Per-step playbook

### Step 1 — gif-artifact-exists-and-size

**Sub-agent persona**: file-stat probe (read-only filesystem agent)

**Tools invoked**:
- `stat -f "%z" apps/landing/public/double-moment.gif` — returns size in bytes (macOS); Linux fallback: `stat -c "%s" ...`
- If `.gif` not found: retry with `apps/landing/public/double-moment.png`
- Record `format` as `"gif"` or `"png"` accordingly

**Pass condition**: file exists AND `size_bytes < 2_097_152` (i.e. < 2 MB; the byte gate is technically 2 MiB, but the user-facing budget is "2 MB" per issue #120)

**Failure-mode evidence to keep**: raw `stat` stdout, directory listing of `apps/landing/public/`, `ls -lh apps/landing/public/double-moment.*`

**raw.json shape**:
```json
{"path": "apps/landing/public/double-moment.gif", "size_bytes": 1523456, "format": "gif", "pass": true}
```

---

### Step 2 — placeholder-removed

**Sub-agent persona**: grep probe (read-only text scanner)

**Tools invoked**:
- `grep -Fc 'class="gif-placeholder"' apps/landing/src/index.html` — must return `0`
- `grep -Ec '<img[^>]+src="[^"]*double-moment\.(gif|png)[^"]*"' apps/landing/src/index.html` — must return ≥ `1`
- Capture the matching `<img>` line for `img_src` field

**Pass condition**: `placeholder_count == 0` AND `img_count >= 1`

**Failure-mode evidence to keep**: full `grep` stdout with line numbers (`grep -n`), raw `index.html` snippet around the replaced section (lines ±5 of the old placeholder position)

**raw.json shape**:
```json
{"placeholder_count": 0, "img_count": 1, "img_src": "double-moment.gif", "pass": true}
```

---

### Step 3 — landing-build-green

**Sub-agent persona**: build runner (workspace agent with pnpm access)

**Tools invoked**:
- `pnpm --filter @teamagent/landing build` — time the invocation; capture full stdout + stderr to `evidence/build.log`
- Parse exit code; capture last 400 chars of stdout as `stdout_tail`

**Pass condition**: `exit_code == 0`

**Failure-mode evidence to keep**: full `evidence/build.log`, TypeScript error lines (grep `error TS`), any missing asset warnings

**raw.json shape**:
```json
{"exit_code": 0, "duration_ms": 4821, "stdout_tail": "...", "pass": true}
```

---

### Step 4 — lighthouse-perf

**Sub-agent persona**: Lighthouse runner (workspace agent with pnpm + headless browser)

**Tools invoked**:
- `pnpm --filter @teamagent/landing verify` — assumed to produce a Lighthouse JSON report
- Parse the JSON report for `categories.performance.score` (multiply by 100 for integer score), `audits.largest-contentful-paint.numericValue` (ms), `audits.cumulative-layout-shift.numericValue`
- Save full Lighthouse JSON to `evidence/lh-report.json`

**Pass condition**:
- `perf_score >= 85`
- `lcp_ms <= 2500`
- `cls <= 0.1`

**Failure-mode evidence to keep**: full `evidence/lh-report.json`, stdout from the verify command, filmstrip screenshots if available

**raw.json shape**:
```json
{"perf_score": 91, "lcp_ms": 1840, "cls": 0.02, "report_path": "...", "pass": true}
```

---

### Step 5 — pr-and-review

**Sub-agent persona**: GitHub CLI probe (read-only gh access)

**Tools invoked**:
- `gh pr view $PR_NUMBER --json number,state,isDraft,statusCheckRollup` — parse `state`, `isDraft`, and aggregate CI status from `statusCheckRollup`
- `gh pr reviews $PR_NUMBER --json state,body` (or `gh api /repos/{owner}/{repo}/pulls/$PR_NUMBER/reviews`) — scan for a review comment body containing `PASS` (case-insensitive) from the `/review` skill or a reviewer
- Save raw `gh pr view` JSON to `evidence/pr-view.json`; save reviews JSON to `evidence/pr-reviews.json`

**Pass condition**:
- `pr_state == "OPEN"`
- `is_draft == false` (project rule: no draft PRs)
- `ci_status == "success"` (all checks green)
- `review_verdict == "PASS"` (at least one review comment or check-run body contains `PASS`)

**Failure-mode evidence to keep**: full `evidence/pr-view.json`, `evidence/pr-reviews.json`, raw CI check statuses

**raw.json shape**:
```json
{"pr_number": 164, "pr_state": "OPEN", "is_draft": false, "ci_status": "success", "review_verdict": "PASS", "pass": true}
```

---

### Step 6 — gif-content-spot-check (optional / human-loop)

**Sub-agent persona**: visual verifier (may be human-in-the-loop or an image-frame tool)

**Tools invoked** (automated path, if tooling available):
- Extract first and last frame of `apps/landing/public/double-moment.gif` using `convert` (ImageMagick) or equivalent: `convert 'double-moment.gif[0]' /tmp/frame-first.png` and `convert 'double-moment.gif[-1]' /tmp/frame-last.png`
- Confirm frames differ (not a static duplicate)

**Manual path** (fallback):
- Sub-agent emits `gif_visible_check: "manual"` and records operator note confirming both moments are visible with a visible `/clear` cut between them

**Pass condition**: either automated diff confirms frames are distinct, OR human operator has confirmed content and recorded note

**Failure-mode evidence to keep**: extracted frames, diff output, operator notes

**raw.json shape**:
```json
{"gif_visible_check": "automated", "frames_extracted": 24, "first_last_identical": false, "pass": true}
```
or
```json
{"gif_visible_check": "manual", "notes": "operator confirmed both moments visible with /clear cut", "pass": true}
```

---

## Aggregate verdict rule

```
verdict = "pass"
  iff  step-1.exit_code == 0  AND  step-1.metrics.size_bytes < 2097152
  AND  step-2.exit_code == 0  AND  step-2.metrics.placeholder_count == 0  AND  step-2.metrics.img_count >= 1
  AND  step-3.exit_code == 0
  AND  step-4.exit_code == 0  AND  step-4.metrics.perf_score >= 85
                               AND  step-4.metrics.lcp_ms <= 2500
                               AND  step-4.metrics.cls <= 0.1
  AND  step-5.exit_code == 0  AND  step-5.metrics.pr_state == "OPEN"
                               AND  step-5.metrics.is_draft == false
                               AND  step-5.metrics.ci_status == "success"
                               AND  step-5.metrics.review_verdict == "PASS"
  AND  step-6.exit_code == 0  (step-6 is soft: failure adds warning but does not block verdict)

Otherwise: verdict = "fail",  verdict_reason lists the failing step ids and
           the specific metric that did not meet threshold.
```

Steps 1–5 are hard blocks. Step 6 failure downgrades to a warning annotation
on the verdict but does not flip it to `"fail"`.

---

## How to dispatch

Main agent reads this playbook, then spawns one Agent-tool sub-agent per step
(or runs the equivalent `claudefast -p` probe for lightweight steps). Each
sub-agent receives only: the step's section from this playbook, the repo root
path, and the `PR_NUMBER` env variable. Sub-agents write their output to
`docs/plans/issue-120/judge-output/<run-id>/step-<id>/raw.json` and dump all
raw tool output (build logs, Lighthouse JSON, gh CLI responses) into
`step-<id>/evidence/`. Once all sub-agents complete, the main agent reads
**only** the `raw.json` files and the evidence it needs for tiebreaking, then
writes the final `verdict.json`. The main agent reports raw JSON only — no
editorializing: it may summarize which step ids failed and which metric
threshold was missed, but it must not substitute its own tool-run for a
sub-agent's result.
