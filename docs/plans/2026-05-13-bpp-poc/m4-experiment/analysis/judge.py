#!/usr/bin/env python3
"""Compute the 4 quantified gates per acceptance.md §M4.

Usage:
  python judge.py --rollup <rollup.json> --out <verdict.json>
      [--expected-tasks N]   denominator for completion rate (default 17,
                             matching acceptance.md §M4's 17-task suite)

Gates (acceptance.md §M4 质量验收):
  G1 完成率   diff (mining-enabled - mining-disabled) ≥ 10 pp
  G2 AI 纠正次数  reduction (disabled - enabled) / disabled ≥ 30%
  G3 代码质量分  diff (enabled - disabled) ≥ 0.5 (assuming 5-scale, our score is 0-1, so multiplied)
  G4 主观评价分  diff (enabled - disabled) ≥ 0.3 (5-scale)
  All require p < 0.05 via Welch's two-sample t-test.

Completion rate is computed over the FULL 17-task suite, not just tasks
present in the rollup. A member who completes 0 tasks (attrition / no-show)
counts as 0% completion, not as absent data — otherwise survivor-only stats
would silently inflate the completion rate of whichever group lost members.

Note on G3: collection/quality-score.sh outputs 0-1, not 0-5. We multiply by 5
internally so the 0.5 threshold remains comparable to acceptance.md's 5-scale
wording. If you change quality-score.sh scaling, update QUALITY_RESCALE below.

Statistical caveat: Welch's t-test + normal-approximation CIs are a reasonable
default but treat bounded completion RATES and integer correction COUNTS as
unconstrained normal data. For a publication-grade verdict, a statistician
should re-run G1 as a two-proportion test and G2 as a Poisson/negative-binomial
comparison. The harness ships the t-test as the automatable baseline; the
acceptance.md §M4 report (analysis/report-template.md §8) flags this limitation.
"""
import argparse
import json
import math
import sys
from pathlib import Path

try:
    from scipy import stats
except ImportError:  # pragma: no cover
    print(
        "scipy required: pip install scipy", file=sys.stderr,
    )
    raise

QUALITY_RESCALE = 5.0  # multiply 0-1 score to 0-5 to match acceptance.md wording


def _two_sample(enabled: list[float], disabled: list[float]) -> dict:
    if len(enabled) < 2 or len(disabled) < 2:
        return {"p_value": None, "delta": None, "ci_low": None, "ci_high": None}
    mean_e = sum(enabled) / len(enabled)
    mean_d = sum(disabled) / len(disabled)
    delta = mean_e - mean_d
    res = stats.ttest_ind(enabled, disabled, equal_var=False)
    p = float(res.pvalue)
    # rough 95% CI via standard error of diff
    var_e = sum((x - mean_e) ** 2 for x in enabled) / max(1, len(enabled) - 1)
    var_d = sum((x - mean_d) ** 2 for x in disabled) / max(1, len(disabled) - 1)
    se = math.sqrt(var_e / len(enabled) + var_d / len(disabled))
    half = 1.96 * se
    return {
        "p_value": p,
        "delta": delta,
        "ci_low": delta - half,
        "ci_high": delta + half,
        "n_enabled": len(enabled),
        "n_disabled": len(disabled),
    }


def judge(rollup_path: Path, out_path: Path, expected_tasks: int) -> None:
    rollup = json.loads(rollup_path.read_text(encoding='utf-8'))

    enabled, disabled = [], []  # per-member aggregates

    for member, data in rollup["by_member"].items():
        # A member with a group but no tasks is a no-show — keep them with
        # 0% completion, NOT dropped. Only members with no group assignment
        # (shouldn't happen post-aggregate.py fix) are skipped.
        if not data["group"]:
            continue
        tasks = data["tasks"]
        # completion rate is over the FULL expected suite, not tasks-present
        completed_count = sum(1 for t in tasks.values() if t.get("completed", 0) == 1)
        completion_rate = completed_count / expected_tasks if expected_tasks > 0 else 0.0
        # corrections / quality / subjective: averaged over tasks the member
        # actually attempted (missing != zero for these dimensions)
        ai_corrs = [t.get("ai_corrections", 0) for t in tasks.values()]
        ratings = [t.get("subjective_rating") for t in tasks.values() if t.get("subjective_rating") is not None]
        qualities = [
            t["code_quality_score"] * QUALITY_RESCALE
            for t in tasks.values() if t.get("code_quality_score") is not None
        ]
        per_member = {
            "member": member,
            "group": data["group"],
            "tasks_attempted": len(tasks),
            "tasks_completed": completed_count,
            "completion_rate": completion_rate,
            "ai_corrections_per_task": (sum(ai_corrs) / len(ai_corrs)) if ai_corrs else 0.0,
            "code_quality_avg": (sum(qualities) / len(qualities)) if qualities else 0.0,
            "subjective_avg": (sum(ratings) / len(ratings)) if ratings else 0.0,
        }
        bucket = enabled if data["group"] == "mining-enabled" else disabled
        bucket.append(per_member)

    # gates
    g1 = _two_sample(
        [m["completion_rate"] for m in enabled],
        [m["completion_rate"] for m in disabled],
    )
    g1["threshold"] = 0.10
    g1["pass"] = (g1["delta"] is not None and g1["delta"] >= 0.10 and (g1["p_value"] is not None and g1["p_value"] < 0.05))

    # G2: AI-correction reduction. We want enabled to have FEWER corrections,
    # so the gate is on the reduction (disabled - enabled). We still call
    # _two_sample(enabled, disabled) so the returned n_enabled / n_disabled /
    # ci_* keys stay correctly labelled; the reported delta there is
    # enabled - disabled, and reduction = -delta.
    g2_e_corr = [m["ai_corrections_per_task"] for m in enabled]
    g2_d_corr = [m["ai_corrections_per_task"] for m in disabled]
    g2 = _two_sample(g2_e_corr, g2_d_corr)
    mean_d = (sum(g2_d_corr) / len(g2_d_corr)) if g2_d_corr else 0.0
    mean_e = (sum(g2_e_corr) / len(g2_e_corr)) if g2_e_corr else 0.0
    if g2["delta"] is None:
        reduction_ratio = None
    elif mean_d > 0:
        # reduction fraction relative to the disabled (baseline) mean
        reduction_ratio = (mean_d - mean_e) / mean_d
    elif mean_e == 0:
        # both groups had zero corrections — no regression, but also no
        # measurable improvement; ratio is 0, not undefined.
        reduction_ratio = 0.0
    else:
        # disabled baseline is 0 but enabled has corrections — that's a
        # regression; ratio is negative and unbounded, clamp-report as -1.
        reduction_ratio = -1.0
    g2["reduction_ratio"] = reduction_ratio
    g2["mean_enabled"] = mean_e
    g2["mean_disabled"] = mean_d
    g2["threshold"] = 0.30
    g2["pass"] = (reduction_ratio is not None and reduction_ratio >= 0.30 and (g2["p_value"] is not None and g2["p_value"] < 0.05))

    g3 = _two_sample(
        [m["code_quality_avg"] for m in enabled],
        [m["code_quality_avg"] for m in disabled],
    )
    g3["threshold"] = 0.5
    g3["pass"] = (g3["delta"] is not None and g3["delta"] >= 0.5 and (g3["p_value"] is not None and g3["p_value"] < 0.05))

    g4 = _two_sample(
        [m["subjective_avg"] for m in enabled],
        [m["subjective_avg"] for m in disabled],
    )
    g4["threshold"] = 0.3
    g4["pass"] = (g4["delta"] is not None and g4["delta"] >= 0.3 and (g4["p_value"] is not None and g4["p_value"] < 0.05))

    verdict = {
        "experiment_id": rollup.get("experiment_id"),
        "expected_tasks": expected_tasks,
        "n_enabled": len(enabled),
        "n_disabled": len(disabled),
        "skipped_lines": rollup.get("skipped_lines", 0),
        "gates": {"G1_completion_rate": g1, "G2_ai_corrections": g2, "G3_code_quality": g3, "G4_subjective": g4},
        "overall_pass": all([g1["pass"], g2["pass"], g3["pass"], g4["pass"]]),
        "per_member": enabled + disabled,
    }
    out_path.write_text(json.dumps(verdict, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"wrote verdict: {out_path}", file=sys.stderr)
    print(f"overall_pass = {verdict['overall_pass']}", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rollup", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--expected-tasks", type=int, default=17,
                    help="task-suite size used as the completion-rate denominator (default 17)")
    args = ap.parse_args()
    judge(args.rollup, args.out, args.expected_tasks)


if __name__ == "__main__":
    main()
