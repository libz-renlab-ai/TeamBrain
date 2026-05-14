#!/usr/bin/env python3
"""Deterministic balanced random split per acceptance.md §M4 验证方法 step 2.

Usage:
  python random-split.py --members <roster.json> --seed <YYYYMMDD> --out <groups.json>
      [--max-skew N]   max allowed |n_enabled - n_disabled| (default 2)
      [--max-reroll N] max deterministic rerolls before giving up (default 64)

The split method is fully deterministic given (roster, seed):
  - For each member in roster (in roster's listed order),
  - compute SHA256("<seed>#<reroll>:<member_id>")
  - assign to 'mining-enabled' if hash[0] < 128 else 'mining-disabled'.

A pure independent coin-flip can produce a degenerate split (e.g. 7-1 or 8-0
with 8 members), which makes the downstream t-test in judge.py undefined for
the < 2-member group and silently forces overall_pass=False — masking a
DEGENERATE-SPLIT cause as a FAILED-EXPERIMENT result. To prevent that, this
script rerolls deterministically (reroll counter 0, 1, 2, ...) until the
group-size skew is within --max-skew, and records the accepted reroll in the
output so the split stays reproducible.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path


def _assign(seed: str, reroll: int, mid: str) -> int:
    """Return hash byte 0 for (seed, reroll, member)."""
    digest = hashlib.sha256(f"{seed}#{reroll}:{mid}".encode()).digest()
    return digest[0]


def split(roster_path: Path, seed: str, out_path: Path, max_skew: int, max_reroll: int) -> None:
    roster = json.loads(roster_path.read_text(encoding='utf-8'))
    members = roster["members"]
    n = len(members)
    if n < 2:
        print(f"roster has {n} member(s); need ≥ 2 to split", file=sys.stderr)
        sys.exit(2)

    accepted_reroll = None
    accepted = None
    for reroll in range(max_reroll + 1):
        assignment = {}
        for m in members:
            mid = m["id"]
            byte0 = _assign(seed, reroll, mid)
            group = "mining-enabled" if byte0 < 128 else "mining-disabled"
            assignment[mid] = {"group": group, "hash_byte0": int(byte0)}
        n_enabled = sum(1 for v in assignment.values() if v["group"] == "mining-enabled")
        n_disabled = n - n_enabled
        # Both groups must be non-empty AND skew within bound.
        if n_enabled >= 1 and n_disabled >= 1 and abs(n_enabled - n_disabled) <= max_skew:
            accepted_reroll = reroll
            accepted = assignment
            break

    if accepted is None:
        print(
            f"no balanced split within {max_reroll} rerolls (max_skew={max_skew}); "
            f"recruit more members or raise --max-skew",
            file=sys.stderr,
        )
        sys.exit(1)

    out = {
        "_experiment_id": roster.get("experiment_id", "m4-unknown"),
        "_seed": seed,
        "_reroll": accepted_reroll,
        "_max_skew": max_skew,
    }
    out.update(accepted)
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
    n_enabled = sum(1 for v in accepted.values() if v["group"] == "mining-enabled")
    n_disabled = n - n_enabled
    print(
        f"wrote {out_path}: {n_enabled} enabled, {n_disabled} disabled "
        f"(reroll={accepted_reroll}, skew={abs(n_enabled - n_disabled)})",
        file=sys.stderr,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", required=True, type=Path)
    ap.add_argument("--seed", required=True)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--max-skew", type=int, default=2,
                    help="max allowed |n_enabled - n_disabled| (default 2)")
    ap.add_argument("--max-reroll", type=int, default=64,
                    help="max deterministic rerolls before giving up (default 64)")
    args = ap.parse_args()
    split(args.members, args.seed, args.out, args.max_skew, args.max_reroll)


if __name__ == "__main__":
    main()
