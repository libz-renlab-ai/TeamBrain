```text
  judge.md — PR #178 lighthouserc fix harness (MD playbook, NOT bash)

  main agent
      │
      ├─► sub-agent 1: categories-prefix-applied  (grep, sed-y diff)
      ├─► sub-agent 2: lcp-gate-added             (grep)
      ├─► sub-agent 3: gitignore-updated          (grep)
      ├─► sub-agent 4: lhci-autorun-green         (lhci autorun + JSON parse)
      └─► main agent aggregate verdict.json
```

# Judge harness — PR #178 lighthouserc fix

This is the **MD playbook** dispatched by the main agent (subagents OR `claudefast -p` probes) to verify the lighthouserc.json fix in PR #178. **No fixed `.sh` script.** Sub-agents run fixed tools, write `step-<N>/raw.json` + evidence; main agent reads only raw JSON to issue `verdict.json`.

---

## Inputs

| Artifact | Notes |
|---|---|
| `apps/landing/lighthouserc.json` | Must contain `categories:` prefix + LCP gate post-fix |
| `.gitignore` | Must contain `apps/landing/.lighthouseci/` line post-fix |
| `apps/landing/package.json` | Must expose `verify` script (unchanged from PR #178) |
| Local Chrome / `@lhci/cli` | Already verified available on this machine (PR #179 prep) |

## Outputs

```
docs/plans/2026-05-09-pr-178/judge-output/<run-id>/
  verdict.json
  step-1/  raw.json + evidence/  (grep stdout)
  step-2/  raw.json + evidence/
  step-3/  raw.json + evidence/
  step-4/  raw.json + evidence/  (full lhci stdout, lhr-*.json, assertion-results.json)
```

`<run-id>` is an ISO-8601 timestamp.

## verdict.json schema

```json
{
  "run_id": "2026-05-09T00:30:00Z",
  "pr": 178,
  "fix_target": "apps/landing/lighthouserc.json + .gitignore",
  "steps": [
    { "id": 1, "name": "categories-prefix-applied", "exit_code": 0,
      "metrics": { "categories_count": 3, "bare_name_count": 0 } },
    { "id": 2, "name": "lcp-gate-added", "exit_code": 0,
      "metrics": { "lcp_present": true, "lcp_threshold_ms": 2500 } },
    { "id": 3, "name": "gitignore-updated", "exit_code": 0,
      "metrics": { "lighthouseci_ignored": true } },
    { "id": 4, "name": "lhci-autorun-green", "exit_code": 0,
      "metrics": { "exit_code": 0, "assertions_passed": 6, "assertions_failed": 0,
                   "perf_score": 0.98, "lcp_ms": 1366, "cls": 0 } }
  ],
  "verdict": "pass",
  "verdict_reason": "all 4 steps green; categories: prefix applied, LCP gate added, .gitignore updated, lhci autorun returns exit 0 with 6/6 assertions pass"
}
```

---

## Per-step playbook

### Step 1 — categories-prefix-applied

**Persona**: grep probe (read-only).

**Tools**:
- `grep -c '"categories:performance"' apps/landing/lighthouserc.json` — must return `1`
- `grep -c '"categories:accessibility"' apps/landing/lighthouserc.json` — must return `1`
- `grep -c '"categories:seo"' apps/landing/lighthouserc.json` — must return `1`
- `grep -E '"(performance|accessibility|seo)":' apps/landing/lighthouserc.json | grep -v 'categories:' | wc -l` — must return `0` (no bare-name leftover)

**Pass condition**: `categories_count == 3` AND `bare_name_count == 0`.

**Failure-mode evidence**: full `grep -n` stdout, `cat lighthouserc.json` output.

**raw.json shape**: `{"categories_count": 3, "bare_name_count": 0, "pass": true}`

### Step 2 — lcp-gate-added

**Persona**: grep probe.

**Tools**:
- `grep -c 'largest-contentful-paint' apps/landing/lighthouserc.json` — must return `1`
- Extract the `maxNumericValue` from the LCP line; must equal `2500`.

**Pass condition**: `lcp_present == true` AND `lcp_threshold_ms == 2500`.

**Failure-mode evidence**: grep -n stdout, the matching JSON line.

**raw.json shape**: `{"lcp_present": true, "lcp_threshold_ms": 2500, "pass": true}`

### Step 3 — gitignore-updated

**Persona**: grep probe.

**Tools**:
- `grep -c '^apps/landing/\.lighthouseci/$' .gitignore` — must return `1`.

**Pass condition**: `lighthouseci_ignored == true`.

**Failure-mode evidence**: tail of .gitignore showing context lines.

**raw.json shape**: `{"lighthouseci_ignored": true, "pass": true}`

### Step 4 — lhci-autorun-green

**Persona**: workspace agent with Chrome + lhci binary.

**Tools**:
- From `apps/landing/`: `CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" /Users/m1/projects/TeamBrain/node_modules/.pnpm/node_modules/.bin/lhci autorun --config=./lighthouserc.json` (or equivalent on the runner).
- Capture full stdout to `evidence/lhci-stdout.log`; capture `.lighthouseci/lhr-*.json` and `.lighthouseci/assertion-results.json` to `evidence/`.
- Parse `lhr-*.json` for `categories.performance.score`, `audits.largest-contentful-paint.numericValue`, `audits.cumulative-layout-shift.numericValue`.
- Parse `assertion-results.json` for any assertion with `passed: false`.

**Pass condition**: `exit_code == 0` AND `assertions_failed == 0` AND `perf_score >= 0.85` AND `lcp_ms <= 2500` AND `cls <= 0.1`.

**Failure-mode evidence**: full `evidence/lhci-stdout.log`, `evidence/lhr-*.json`, `evidence/assertion-results.json`.

**raw.json shape**: `{"exit_code": 0, "assertions_passed": 6, "assertions_failed": 0, "perf_score": 0.98, "lcp_ms": 1366, "cls": 0, "pass": true}`

---

## Aggregate verdict rule

```
verdict = "pass"
  iff  step-1.exit_code == 0  AND  step-1.metrics.categories_count == 3
                               AND  step-1.metrics.bare_name_count == 0
  AND  step-2.exit_code == 0  AND  step-2.metrics.lcp_present == true
                               AND  step-2.metrics.lcp_threshold_ms == 2500
  AND  step-3.exit_code == 0  AND  step-3.metrics.lighthouseci_ignored == true
  AND  step-4.exit_code == 0  AND  step-4.metrics.assertions_failed == 0
                               AND  step-4.metrics.perf_score >= 0.85
                               AND  step-4.metrics.lcp_ms <= 2500
                               AND  step-4.metrics.cls <= 0.1

Otherwise: verdict = "fail", verdict_reason lists failing step ids and missed thresholds.
```

All 4 steps are hard blocks. None are soft / warning-only.

---

## How to dispatch

Main agent reads this playbook, spawns one Agent-tool sub-agent per step (or runs the equivalent `claudefast -p` probe for steps 1–3 — they're pure grep). Sub-agents write to `judge-output/<run-id>/step-<id>/raw.json` and dump tool output into `step-<id>/evidence/`. After all sub-agents complete, the main agent reads ONLY the `raw.json` files + evidence it needs for tiebreaking and writes the final `verdict.json`. **No editorializing**: the main agent may summarize which steps passed/failed but must not substitute its own tool-run for a sub-agent's result.
