#!/usr/bin/env python3
"""Check baseline questionnaire balance between two groups per acceptance §M4 step 3.

Usage:
  python balance-check.py --screening <glob> --groups <groups.json>

Returns exit 0 if all checked questions have p > 0.05 between groups
(balanced); exit 1 if any question fails.
"""
import argparse
import json
import sys
from pathlib import Path
import glob

try:
    from scipy import stats
except ImportError:
    print("scipy required: pip install scipy", file=sys.stderr)
    raise


CHECKED_QUESTIONS = ["q1_hours", "q4_proficiency", "q5_recent_usage", "q6_helps_or_hurts"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--screening", required=True)
    ap.add_argument("--groups", required=True, type=Path)
    args = ap.parse_args()

    groups = json.loads(args.groups.read_text(encoding='utf-8'))
    files = glob.glob(args.screening)
    if not files:
        print(f"no screening files matched: {args.screening}", file=sys.stderr)
        sys.exit(2)

    enabled, disabled = {}, {}
    for q in CHECKED_QUESTIONS:
        enabled[q] = []
        disabled[q] = []

    for f in files:
        s = json.loads(Path(f).read_text(encoding='utf-8'))
        mid = s["member_id"]
        group_entry = groups.get(mid)
        if not isinstance(group_entry, dict):
            continue
        bucket = enabled if group_entry["group"] == "mining-enabled" else disabled
        for q in CHECKED_QUESTIONS:
            v = s["answers"].get(q)
            if isinstance(v, (int, float)):
                bucket[q].append(v)

    any_failed = False
    print(f"{'question':<25} {'p-value':>10} balanced?")
    for q in CHECKED_QUESTIONS:
        a, b = enabled[q], disabled[q]
        if len(a) < 2 or len(b) < 2:
            print(f"{q:<25} {'N/A':>10}    skip (need ≥ 2 per group)")
            continue
        p = float(stats.ttest_ind(a, b, equal_var=False).pvalue)
        ok = p > 0.05
        if not ok:
            any_failed = True
        print(f"{q:<25} {p:>10.4f}    {'yes' if ok else 'NO'}")

    if any_failed:
        print("\nbalance FAILED: at least one question has p ≤ 0.05; reroll seed or recruit more.", file=sys.stderr)
        sys.exit(1)
    print("\nbalance OK: all checked questions p > 0.05.", file=sys.stderr)


if __name__ == "__main__":
    main()
