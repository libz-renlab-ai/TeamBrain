#!/usr/bin/env python3
"""bpp-counterfactual-ablation.py — real-scipy tier (b) harness for BPP.

Spec: docs/superpowers/specs/2026-05-13-best-practice-push-design.md §8.1 tier (b).
Verify doc: docs/verify/BPP-VERIFY-V2.md.

Reads scripts/bpp-ablation-data/17-task-corpus.json (17 tasks each with two
binary outcomes: bpp-on and bpp-off, 'avoided' | 'failed'), runs scipy
paired t-test on rule-ON vs rule-OFF avoidance rates, and emits a JSON verdict
to stdout.

This is a PoC. The corpus file ships **synthetic** outcomes that simulate the
expected shape of a real 17-task BPP replay run (12 tasks where BPP helps avoid
a mistake, 5 control tasks where BPP-off serendipitously avoids it). Production
deployment requires replacing the corpus file with results from a real
LLM-driven BPP-on / BPP-off harness — that harness is NOT in this PR's scope
(tracked by issue #343 as part of the larger 17-task corpus + replay work).

Conforms to the canonical recipe from docs/verify/E2E-LEARNING.md:
  "Counterfactual Ablation = scipy.stats.ttest_rel paired t-test on rule-ON
   vs rule-OFF runs of the same prompt set, producing numeric Δ + p-value
   + 95% CI."

Usage:
  python scripts/bpp-counterfactual-ablation.py \\
      [--corpus scripts/bpp-ablation-data/17-task-corpus.json] \\
      [--alpha 0.05]

Output (stdout, single-line JSON):
  {
    "scenario":            "bpp-counterfactual-ablation-17task",
    "n_pairs":             17,
    "mean_on":             0.8235,            # 14/17 bpp-on avoidance rate
    "mean_off":            0.1765,            # 3/17 bpp-off avoidance rate
    "delta":               0.6471,
    "t_stat":              3.39,
    "p_value":             0.0037,
    "effect_size_cohen_d": 0.82,
    "ci_low":              0.243,
    "ci_high":             1.051,
    "alpha":               0.05,
    "conclusion":          "PASS" | "FAIL_INCONCLUSIVE" | "FAIL_DIRECTION"
  }

Exit codes:
  0 — conclusion == PASS
  1 — conclusion is a FAIL_* verdict (statistical) OR scipy missing
  2 — input error (missing corpus file, malformed JSON, count mismatch)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

try:
    from scipy import stats  # type: ignore[import-untyped]
except ImportError:
    sys.stderr.write(
        "bpp-counterfactual-ablation.py: scipy not installed. "
        "Run `pip install scipy>=1.11` (or use the nightly CI workflow which "
        "provisions scipy automatically) and retry.\n"
    )
    sys.exit(1)


def _to_binary(outcome: str) -> int:
    if outcome == "avoided":
        return 1
    if outcome == "failed":
        return 0
    raise ValueError(f"unrecognized outcome value: {outcome!r}")


def _cohen_d_paired(on: list[float], off: list[float]) -> float:
    """Cohen's d for paired samples = mean(diff) / stdev(diff)."""
    n = len(on)
    diffs = [a - b for a, b in zip(on, off)]
    mean = sum(diffs) / n
    if n < 2:
        return 0.0
    variance = sum((d - mean) ** 2 for d in diffs) / (n - 1)
    sd = variance**0.5
    if sd == 0:
        return 0.0
    return mean / sd


def _ci_delta(on: list[float], off: list[float], alpha: float) -> tuple[float, float]:
    n = len(on)
    diffs = [a - b for a, b in zip(on, off)]
    mean = sum(diffs) / n
    if n < 2:
        return (mean, mean)
    variance = sum((d - mean) ** 2 for d in diffs) / (n - 1)
    se = (variance / n) ** 0.5
    t_crit = stats.t.ppf(1 - alpha / 2, df=n - 1)
    return (mean - t_crit * se, mean + t_crit * se)


def run(corpus_path: str, alpha: float) -> int:
    if not os.path.exists(corpus_path):
        sys.stderr.write(f"corpus file not found: {corpus_path}\n")
        return 2
    with open(corpus_path, "r", encoding="utf-8") as fh:
        corpus: dict[str, Any] = json.load(fh)

    tasks = corpus.get("tasks")
    if not isinstance(tasks, list) or len(tasks) == 0:
        sys.stderr.write("corpus has no 'tasks' list\n")
        return 2

    try:
        on = [float(_to_binary(t["bpp_on_outcome"])) for t in tasks]
        off = [float(_to_binary(t["bpp_off_outcome"])) for t in tasks]
    except (KeyError, ValueError) as exc:
        sys.stderr.write(f"malformed task row: {exc}\n")
        return 2

    if len(on) != len(off):
        sys.stderr.write("on/off lengths differ — paired t-test requires matched pairs\n")
        return 2

    n = len(on)
    mean_on = sum(on) / n
    mean_off = sum(off) / n
    delta = mean_on - mean_off

    res = stats.ttest_rel(on, off)
    t_stat = float(res.statistic)
    p_value = float(res.pvalue)
    cohen_d = _cohen_d_paired(on, off)
    ci_low, ci_high = _ci_delta(on, off, alpha)

    if p_value >= alpha:
        conclusion = "FAIL_INCONCLUSIVE"
    elif delta <= 0:
        conclusion = "FAIL_DIRECTION"
    else:
        conclusion = "PASS"

    out = {
        "scenario": corpus.get("scenario", "bpp-counterfactual-ablation"),
        "n_pairs": n,
        "mean_on": round(mean_on, 4),
        "mean_off": round(mean_off, 4),
        "delta": round(delta, 4),
        "t_stat": round(t_stat, 4),
        "p_value": round(p_value, 6),
        "effect_size_cohen_d": round(cohen_d, 4),
        "ci_low": round(ci_low, 4),
        "ci_high": round(ci_high, 4),
        "alpha": alpha,
        "conclusion": conclusion,
        "note": "PoC: synthetic 17-task corpus. Replace with real BPP replay for production p-value.",
    }
    sys.stdout.write(json.dumps(out, separators=(",", ":")) + "\n")
    return 0 if conclusion == "PASS" else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--corpus",
        default="scripts/bpp-ablation-data/17-task-corpus.json",
        help="path to 17-task corpus JSON",
    )
    parser.add_argument(
        "--alpha",
        type=float,
        default=0.05,
        help="significance level (default 0.05 per spec §8)",
    )
    args = parser.parse_args()
    return run(args.corpus, args.alpha)


if __name__ == "__main__":
    sys.exit(main())
