```text
        ┌─────────────────────────────────────────┐
        │  docs/baselines/ — pre-feature snapshot │
        │  reference data for verification gates  │
        └────────────────┬────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
       capture once on              compared against
       known-good HEAD              new feature output
              │                     │
              ▼                     ▼
       commit alongside          ratio diff in
       the feature PR            judge harness
```

# `docs/baselines/`

Frozen pre-feature snapshots that verification harnesses diff against.
Each file in this directory is the captured stdout of one read-only command
run on a known git HEAD. Files are committed alongside the feature PR that
introduces the harness, so reviewers can re-run the harness deterministically.

## Files

| File | Captured from | Used by |
|------|---------------|---------|
| `stats-engineer-baseline.txt` | `pnpm --silent teamagent stats 2>/dev/null` at branch `worktree-issue116` HEAD `866cb9a` (≡ `main` HEAD at PR-plan time, 2026-05-07) | `docs/feature-verification/duck-mode-judge-harness.md` §V4 — `engineer_view_diff = (engineer_view_lines - baseline_engineer_lines) / (baseline_engineer_lines + 1)`. Threshold ≤ 0.05. |

## Why a sibling README and not inline comments

The baseline files are direct command output. Adding a header comment would
change the line count and make the harness diff brittle. This README records
the capture context out-of-band.

## Regenerating

If the baseline ever needs to be refreshed (e.g. main has materially diverged
from the captured HEAD), check out the new HEAD on a clean branch and re-run
the exact capture command from the table above. Commit the new file in the
same change that bumps the harness reference.

```bash
# example for stats-engineer-baseline.txt
git checkout main
git pull --ff-only
pnpm install
pnpm --silent teamagent stats 2>/dev/null > docs/baselines/stats-engineer-baseline.txt
git add docs/baselines/stats-engineer-baseline.txt
git commit -m "chore(m5): refresh stats engineer baseline at $(git rev-parse --short HEAD)"
```

## Capture-context caveat for `stats-engineer-baseline.txt` (2026-05-07)

The capture run on 2026-05-07 happened inside the same Claude Code session
that produced the surrounding PR plan. TeamAgent's Stop hook auto-extracted
several session-derived rules into the local `knowledge.db` before the
baseline command ran, so the "最近 5 条新增" rows reflect this session rather
than a pristine main state. The line *count* is structural (top-N is bounded
to 5 newest + top-5 confidence movements, totalling a fixed shape regardless
of which rules occupy those slots) so the V4 ±5% threshold is unaffected.
The structural shape — totals header, scope breakdown, category breakdown,
top-5 recent (5 lines), top-5 confidence movements (10 lines) — is what V4
diffs against, not the specific rule contents.
