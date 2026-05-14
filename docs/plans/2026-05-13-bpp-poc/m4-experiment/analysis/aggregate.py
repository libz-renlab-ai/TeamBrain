#!/usr/bin/env python3
"""Roll up 28-day collection JSONL into one rollup.json fit for judge.py.

Usage:
  python aggregate.py --input <collection/daily/> --groups <groups.json> --out <rollup.json>

Inputs:
  --input  directory containing <YYYY-MM-DD>/<member-id>.jsonl files
  --groups output of tools/random-split.py, mapping member-id -> group
  --out    where to write rollup JSON

Output schema:
  {
    "experiment_id": "...",
    "n_members": N,
    "n_days": 28,
    "by_member": {
      "P-001": {
        "group": "mining-enabled",
        "tasks": {
          "01-parse-duration": {
            "completed": 1, "duration_ms": 3343580,
            "subjective_rating": 4, "code_quality_score": 0.87,
            "ai_corrections": 2
          },
          ...
        }
      },
      ...
    }
  }
"""
import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path


def aggregate(input_dir: Path, groups_path: Path, out_path: Path) -> None:
    groups = json.loads(groups_path.read_text(encoding='utf-8'))
    # groups maps member_id -> {"group": "mining-enabled"|"mining-disabled"}
    # plus _experiment_id and _seed metadata keys we ignore.
    member_to_group = {
        m: g["group"] for m, g in groups.items()
        if isinstance(g, dict) and "group" in g
    }

    by_member: dict = defaultdict(lambda: {"group": None, "tasks": defaultdict(dict)})
    correction_count: dict = defaultdict(lambda: defaultdict(int))

    for day_dir in sorted(input_dir.iterdir()):
        if not day_dir.is_dir():
            continue
        for jsonl in sorted(day_dir.glob("*.jsonl")):
            member = jsonl.stem
            for raw in jsonl.read_text(encoding='utf-8').splitlines():
                if not raw.strip():
                    continue
                ev = json.loads(raw)
                task = ev.get("task_slug")
                if ev["type"] == "ai-correction" and task:
                    correction_count[member][task] += 1
                elif ev["type"] == "task-end" and task:
                    # groups.json is authoritative; task-end's "group" is informational only
                    by_member[member]["group"] = member_to_group.get(member, ev.get("group"))
                    by_member[member]["tasks"][task] = {
                        "completed": 1 if ev["result"] == "pass" else 0,
                        "duration_ms": ev.get("duration_ms"),
                        "subjective_rating": ev.get("subjective_rating"),
                        "code_quality_score": ev.get("code_quality_score"),
                    }

    for member, tasks in correction_count.items():
        if member not in by_member:
            by_member[member]["group"] = member_to_group.get(member)
        for task, count in tasks.items():
            by_member[member]["tasks"].setdefault(task, {})["ai_corrections"] = count

    rollup = {
        "experiment_id": groups.get("_experiment_id", "unknown"),
        "n_members": len(by_member),
        "n_days": sum(1 for d in input_dir.iterdir() if d.is_dir()),
        "by_member": {
            m: {"group": v["group"], "tasks": dict(v["tasks"])} for m, v in by_member.items()
        },
    }
    out_path.write_text(json.dumps(rollup, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"wrote rollup: {out_path}", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--groups", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    aggregate(args.input, args.groups, args.out)


if __name__ == "__main__":
    main()
