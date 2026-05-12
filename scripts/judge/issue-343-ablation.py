#!/usr/bin/env python3
"""Issue #343 PR-2 Counterfactual Ablation judge.

Reads a bench-report.json produced by `pnpm -F @teamagent/benchmark bench`
and runs scipy.stats.ttest_rel on the per-task total-token deltas between
the `teamagent` and `teamagent-disabled` groups.

Output ablation.json contains the numerical verdict (mean delta, t-stat,
p-value, 95% CI) that the main agent reads to decide PASS/FAIL per
docs/plans/2026-05-12-issue-343-pr2/judge.md §V3.

Usage:
    python3 scripts/judge/issue-343-ablation.py \\
        <bench-report.json> <out-ablation.json>

Dependencies: scipy, numpy (local dev only; not required in CI).
"""

import json
import sys
from pathlib import Path

import numpy as np
from scipy import stats


def main(report_path: str, out_path: str) -> int:
    with Path(report_path).open(encoding="utf-8") as f:
        report = json.load(f)

    raw_results = report.get("rawResults", [])
    pairs: dict[str, dict[str, int]] = {}
    for r in raw_results:
        group = r["group"]
        if group not in ("teamagent", "teamagent-disabled"):
            continue
        task = r["taskId"]
        total = (
            r.get("tokensIn", 0)
            + r.get("tokensOut", 0)
            + r.get("cacheReadTokens", 0)
            + r.get("cacheCreationTokens", 0)
        )
        # If --runs > 1 we have multiple measurements per (task,group); average
        # them so each task contributes one paired observation.
        bucket = pairs.setdefault(task, {})
        bucket.setdefault(f"_{group}_sum", 0)
        bucket.setdefault(f"_{group}_n", 0)
        bucket[f"_{group}_sum"] += total
        bucket[f"_{group}_n"] += 1

    tb_on: list[float] = []
    tb_off: list[float] = []
    per_task: list[dict] = []
    for task in sorted(pairs.keys()):
        b = pairs[task]
        if b.get("_teamagent_n", 0) == 0 or b.get("_teamagent-disabled_n", 0) == 0:
            # Task ran in only one group — cannot pair. Skip with note.
            per_task.append({"task": task, "tb_on": None, "tb_off": None, "delta": None,
                             "note": "unpaired (missing group)"})
            continue
        on = b["_teamagent_sum"] / b["_teamagent_n"]
        off = b["_teamagent-disabled_sum"] / b["_teamagent-disabled_n"]
        tb_on.append(on)
        tb_off.append(off)
        per_task.append({"task": task, "tb_on": on, "tb_off": off, "delta": on - off})

    if len(tb_on) < 2:
        out = {
            "n_pairs": len(tb_on),
            "groups_compared": ["teamagent", "teamagent-disabled"],
            "metric": "total_tokens (tokensIn + tokensOut + cacheReadTokens + cacheCreationTokens)",
            "verdict": (
                "INSUFFICIENT_DATA — need at least 2 paired tasks for ttest_rel; "
                f"got {len(tb_on)}"
            ),
            "per_task": per_task,
        }
    else:
        on_arr = np.array(tb_on, dtype=float)
        off_arr = np.array(tb_off, dtype=float)
        deltas = on_arr - off_arr
        t, p = stats.ttest_rel(on_arr, off_arr)
        # 95% CI on the mean delta (paired)
        sem = stats.sem(deltas)
        if not np.isfinite(sem) or sem == 0:
            ci = (float(deltas.mean()), float(deltas.mean()))
        else:
            ci = stats.t.interval(0.95, len(deltas) - 1, loc=deltas.mean(), scale=sem)

        if not np.isfinite(p):
            verdict = "INDETERMINATE — p_value is not finite (zero variance?)"
        elif p < 0.05 and deltas.mean() > 0:
            verdict = (
                "REJECT_NULL — TB-ON consumes significantly more tokens than "
                f"TB-OFF (mean Δ=+{deltas.mean():.1f}, p={p:.4g})"
            )
        elif p < 0.05 and deltas.mean() < 0:
            verdict = (
                "REJECT_NULL — TB-ON consumes significantly fewer tokens than "
                f"TB-OFF (mean Δ={deltas.mean():.1f}, p={p:.4g})"
            )
        else:
            verdict = (
                f"FAIL_TO_REJECT — no significant token diff "
                f"(mean Δ={deltas.mean():.1f}, p={p:.4g}, threshold=0.05)"
            )

        out = {
            "n_pairs": len(tb_on),
            "groups_compared": ["teamagent", "teamagent-disabled"],
            "metric": "total_tokens (tokensIn + tokensOut + cacheReadTokens + cacheCreationTokens)",
            "mean_delta": float(deltas.mean()),
            "stddev_delta": float(deltas.std(ddof=1)) if len(deltas) > 1 else 0.0,
            "t_statistic": float(t),
            "p_value": float(p),
            "ci_95": [float(ci[0]), float(ci[1])],
            "verdict": verdict,
            "per_task": per_task,
        }

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with Path(out_path).open("w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)

    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
