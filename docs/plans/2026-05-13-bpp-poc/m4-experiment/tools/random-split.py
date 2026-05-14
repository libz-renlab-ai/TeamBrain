#!/usr/bin/env python3
"""Deterministic random split per acceptance.md §M4 验证方法 step 2.

Usage:
  python random-split.py --members <roster.json> --seed <YYYYMMDD> --out <groups.json>

The split method is fully deterministic given (roster, seed):
  - For each member in roster (in roster's listed order),
  - compute a SHA256(seed || member_id) hash
  - assign to 'mining-enabled' if hash[0] < 128 else 'mining-disabled'
  - This is functionally equivalent to a coin-flip but reproducible.

Output: groups.json maps member_id -> {"group": "...", "hash_byte0": int}.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path


def split(roster_path: Path, seed: str, out_path: Path) -> None:
    roster = json.loads(roster_path.read_text(encoding='utf-8'))
    members = roster["members"]
    out = {"_experiment_id": roster.get("experiment_id", "m4-unknown"), "_seed": seed}
    for m in members:
        mid = m["id"]
        digest = hashlib.sha256(f"{seed}:{mid}".encode()).digest()
        byte0 = digest[0]
        group = "mining-enabled" if byte0 < 128 else "mining-disabled"
        out[mid] = {"group": group, "hash_byte0": int(byte0)}
    out_path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding='utf-8')
    n_enabled = sum(1 for k, v in out.items() if isinstance(v, dict) and v.get("group") == "mining-enabled")
    n_disabled = sum(1 for k, v in out.items() if isinstance(v, dict) and v.get("group") == "mining-disabled")
    print(f"wrote {out_path}: {n_enabled} enabled, {n_disabled} disabled", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", required=True, type=Path)
    ap.add_argument("--seed", required=True)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    split(args.members, args.seed, args.out)


if __name__ == "__main__":
    main()
