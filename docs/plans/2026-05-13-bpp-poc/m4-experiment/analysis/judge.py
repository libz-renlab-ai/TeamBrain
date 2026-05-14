#!/usr/bin/env python3
"""Compute the 4 quantified gates per acceptance.md §M4.

Usage:
  python judge.py --rollup <rollup.json> --out <verdict.json>

Gates (acceptance.md §M4 质量验收):
  G1 完成率   diff (mining-enabled - mining-disabled) ≥ 10 pp
  G2 AI 纠正次数  reduction (disabled - enabled) / disabled ≥ 30%
  G3 代码质量分  diff (enabled - disabled) ≥ 0.5 (assuming 5-scale, our score is 0-1, so multiplied)
  G4 主观评价分  diff (enabled - disabled) ≥ 0.3 (5-scale)
  All require p < 0.05 via paired or two-sample t-test.

Note on G3: collection/quality-score.sh outputs 0-1, not 0-5. We multiply by 5
internally so the 0.5 threshold remains comparable to acceptance.md's 5-scale
wording. If you change quality-score.sh scaling, update SCALING below.
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


def judge(rollup_path: Path, out_path: Path) -> None:
    rollup = json.loads(rollup_path.read_text(encoding='utf-8'))

    enabled, disabled = [], []  # per-member aggregates

    for member, data in rollup["by_member"].items():
        if not data["group"] or not data["tasks"]:
            continue
        completions = [t.get("completed", 0) for t in data["tasks"].values()]
        ai_corrs = [t.get("ai_corrections", 0) for t in data["tasks"].values()]
        ratings = [t.get("subjective_rating") for t in data["tasks"].values() if t.get("subjective_rating") is not None]
        qualities = [
            (t.get("code_quality_score") or 0.0) * QUALITY_RESCALE
            for t in data["tasks"].values() if t.get("code_quality_score") is not None
        ]
        per_member = {
            "member": member,
            "group": data["group"],
            "completion_rate": (sum(completions) / len(completions)) if completions else 0.0,
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

    g2_e_corr = [m["ai_corrections_per_task"] for m in enabled]
    g2_d_corr = [m["ai_corrections_per_task"] for m in disabled]
    g2 = _two_sample(g2_d_corr, g2_e_corr)  # reduction = disabled - enabled
    mean_d = (sum(g2_d_corr) / len(g2_d_corr)) if g2_d_corr else 0
    reduction_ratio = (g2["delta"] / mean_d) if g2["delta"] is not None and mean_d > 0 else None
    g2["reduction_ratio"] = reduction_ratio
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
        "n_enabled": len(enabled),
        "n_disabled": len(disabled),
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
    args = ap.parse_args()
    judge(args.rollup, args.out)


if __name__ == "__main__":
    main()
