# judge.md — issue #343 PR-3 verification playbook

> Docs-only PR. PASS criteria are markdown / link / CI invariants — no Python, no SDK calls, no token burn.

## §V1 RUN

### §V1.1 — markdown files exist and parse

```bash
for f in \
    docs/reports/2026-05-12-issue-343-tb-token-cost-summary.md \
    docs/features/cost-measurement.md \
    docs/plans/2026-05-12-issue-343-pr3/plan.md \
    docs/plans/2026-05-12-issue-343-pr3/judge.md ; do
  [ -f "$f" ] || { echo "MISSING: $f"; exit 1; }
done
```

Expected: all 4 files exist.

### §V1.2 — cross-references resolve

The boss report references:
- `../features/cost-measurement.md` (created in this PR)
- `../plans/2026-05-12-issue-343-pr2/evidence/20260512-1714-d50736b/{bench-report.json, ablation.json}` (created in PR-2, on main)
- `scripts/judge/issue-343-ablation.py` (created in PR-2, on main)

The cost-measurement recipe references:
- `../reports/2026-05-12-issue-343-tb-token-cost-summary.md` (created in this PR)
- `../verify/E2E-LEARNING.md` (pre-existing on main)
- `scripts/ablation/ttest_l4.py` (from #332 slice 5, on main commit `2590c48`)
- `packages/benchmark/fixtures/tasks/008-var-to-const.json` (created in PR-2, on main)

```bash
for ref in \
    docs/features/cost-measurement.md \
    docs/plans/2026-05-12-issue-343-pr2/evidence/20260512-1714-d50736b/bench-report.json \
    docs/plans/2026-05-12-issue-343-pr2/evidence/20260512-1714-d50736b/ablation.json \
    scripts/judge/issue-343-ablation.py \
    docs/verify/E2E-LEARNING.md \
    scripts/ablation/ttest_l4.py \
    packages/benchmark/fixtures/tasks/008-var-to-const.json ; do
  [ -e "$ref" ] || { echo "BROKEN-REF: $ref"; exit 1; }
done
```

Expected: all referenced paths exist on disk after PR-3 docs are checked in.

### §V1.3 — typecheck unchanged

```bash
pnpm -F @teamagent/benchmark typecheck
```

Expected: exit 0 (no code changes; just doc additions).

### §V1.4 — CI must stay green

After push, ubuntu + windows test lanes pass without regression (no source-code changes; tests still pass on PR-2's committed state).

## §V2 DUMP

No evidence JSON for a docs PR. The boss report itself IS the evidence artifact.

## §V3 READ — PASS iff

- §V1.1: 4 new markdown files present
- §V1.2: 7 referenced paths resolve to existing files
- §V1.3: typecheck exit 0
- §V1.4: ubuntu + windows CI green on PR
- PR description explicitly mentions "closes #343"
