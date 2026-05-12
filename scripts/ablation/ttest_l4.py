#!/usr/bin/env python3
"""ttest_l4.py — Counterfactual Ablation paired t-test for issue #332.

Reads two JSON observation files (rule-ON, rule-OFF), runs scipy.stats.ttest_rel
paired t-test on matched-pair observations, and emits a single-line JSON verdict
to stdout. Used by the nightly insurance lane (slice 7) to gate m5 rule
propagation L4 end-to-end behavior.

Per docs/verify/E2E-LEARNING.md canonical:
  "Counterfactual Ablation = scipy.stats.ttest_rel paired t-test on rule-ON
   vs rule-OFF runs of the same prompt set, producing numeric Δ + p-value
   + 95% CI."

Usage:
  python scripts/ablation/ttest_l4.py \\
      --rule-on  path/to/rule-on.json \\
      --rule-off path/to/rule-off.json \\
      [--alpha 0.01] [--scenario <slug>]

Input file shape (both --rule-on and --rule-off):
  {
    "scenario":   "m5-rule-propagation-l4-avoidance",
    "condition":  "rule-on" | "rule-off",
    "prompts":    ["...", "..."],
    "observations": [N_block, N_block, ...]   # integers, one per prompt
  }

The two files MUST list prompts in the same order (paired t-test requirement).
Observations are usually integer event counts (PreToolUse blocks, hook fires,
KB hit_count delta) so the test is on count-deltas per prompt pair.

Output (stdout, one line JSON):
  {
    "scenario":     "<slug>",
    "n":            10,
    "mean_on":      9.6,
    "mean_off":     0.0,
    "delta":        9.6,                  # mean_on - mean_off
    "t_statistic":  43.2,
    "p_value":      2.7e-12,
    "ci_low":       9.1,                  # 95% CI on delta
    "ci_high":     10.0,
    "alpha":        0.01,
    "verdict":      "PASS" | "FAIL_INCONCLUSIVE" | "FAIL_DIRECTION"
  }

Verdict logic:
  - PASS:               p < alpha AND delta has correct sign (positive for
                        avoidance/learning/practice — rule-ON > rule-OFF)
  - FAIL_INCONCLUSIVE:  p >= alpha (no statistical significance at threshold)
  - FAIL_DIRECTION:     p < alpha but delta sign is wrong (rule-OFF > rule-ON)

Exit codes:
  0 — verdict==PASS
  1 — verdict==FAIL_INCONCLUSIVE or FAIL_DIRECTION
  2 — input error (missing file, length mismatch, malformed JSON)
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Sequence

try:
    from scipy import stats  # type: ignore[import-untyped]
except ImportError:
    sys.stderr.write(
        "ttest_l4.py: scipy not installed. Run `pip install scipy>=1.11` "
        "or use the nightly workflow which provisions scipy automatically.\n"
    )
    sys.exit(2)


def _load(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _validate(name: str, payload: dict[str, Any], expected_condition: str) -> None:
    for key in ("scenario", "condition", "prompts", "observations"):
        if key not in payload:
            sys.stderr.write(f"{name}: missing '{key}'\n")
            sys.exit(2)
    if payload["condition"] != expected_condition:
        sys.stderr.write(
            f"{name}: condition='{payload['condition']}' but expected '{expected_condition}'\n"
        )
        sys.exit(2)
    if len(payload["prompts"]) != len(payload["observations"]):
        sys.stderr.write(
            f"{name}: prompts (n={len(payload['prompts'])}) and observations "
            f"(n={len(payload['observations'])}) length mismatch\n"
        )
        sys.exit(2)


def _ci_delta(
    on: Sequence[float], off: Sequence[float], alpha: float
) -> tuple[float, float]:
    """95% CI on the paired delta (on - off) using scipy.stats.t."""
    n = len(on)
    diffs = [a - b for a, b in zip(on, off)]
    mean = sum(diffs) / n
    if n < 2:
        return (mean, mean)
    variance = sum((d - mean) ** 2 for d in diffs) / (n - 1)
    se = (variance / n) ** 0.5
    t_crit = stats.t.ppf(1 - alpha / 2, df=n - 1)
    return (mean - t_crit * se, mean + t_crit * se)


def run(rule_on_path: str, rule_off_path: str, alpha: float, scenario_override: str | None) -> int:
    on_payload = _load(rule_on_path)
    off_payload = _load(rule_off_path)
    _validate("--rule-on", on_payload, "rule-on")
    _validate("--rule-off", off_payload, "rule-off")

    if on_payload["scenario"] != off_payload["scenario"]:
        sys.stderr.write(
            f"scenario mismatch: rule-on='{on_payload['scenario']}' "
            f"rule-off='{off_payload['scenario']}'\n"
        )
        return 2

    if len(on_payload["prompts"]) != len(off_payload["prompts"]):
        sys.stderr.write(
            "rule-on and rule-off must have the same prompt count (paired t-test)\n"
        )
        return 2

    on = [float(x) for x in on_payload["observations"]]
    off = [float(x) for x in off_payload["observations"]]

    res = stats.ttest_rel(on, off)
    mean_on = sum(on) / len(on)
    mean_off = sum(off) / len(off)
    delta = mean_on - mean_off
    ci_low, ci_high = _ci_delta(on, off, alpha)

    if res.pvalue >= alpha:
        verdict = "FAIL_INCONCLUSIVE"
    elif delta <= 0:
        verdict = "FAIL_DIRECTION"
    else:
        verdict = "PASS"

    out = {
        "scenario": scenario_override or on_payload["scenario"],
        "n": len(on),
        "mean_on": mean_on,
        "mean_off": mean_off,
        "delta": delta,
        "t_statistic": float(res.statistic),
        "p_value": float(res.pvalue),
        "ci_low": ci_low,
        "ci_high": ci_high,
        "alpha": alpha,
        "verdict": verdict,
    }
    sys.stdout.write(json.dumps(out, separators=(",", ":")) + "\n")
    return 0 if verdict == "PASS" else 1


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rule-on", required=True, help="JSON file with condition=rule-on")
    p.add_argument("--rule-off", required=True, help="JSON file with condition=rule-off")
    p.add_argument("--alpha", type=float, default=0.01, help="significance level (default 0.01 per grill plan)")
    p.add_argument("--scenario", default=None, help="optional scenario slug override")
    args = p.parse_args()
    return run(args.rule_on, args.rule_off, args.alpha, args.scenario)


if __name__ == "__main__":
    sys.exit(main())
