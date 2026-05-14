# judge.md — CLI surface triage 第三方验证 harness

```
   RUN 固定工具 ──▶ DUMP raw JSON ──▶ READ (另一只 LLM 只读 JSON 判决)
```

被测代码不评价自己。MAIN agent 派 subagent 或 `claudefast -p` 跑下列固定探针，把 raw
stdout / exit code dump 到 `.judge/<run_id>/`，最后由独立 LLM judge **只读 raw JSON** 归纳 PASS/FAIL。

## RUN — 固定探针（cwd = repo root）

```bash
RID=$(date +%s); D=.judge/$RID; mkdir -p "$D"

# P1 — 单元测试（含 drift guard）
npx vitest run packages/cli/src/__tests__/bin-help-triage.test.ts --reporter=json \
  > "$D/p1-vitest.json" 2> "$D/p1.stderr"; echo $? > "$D/p1.exit"

# P2 — typecheck
( cd packages/cli && npx tsc --noEmit --project tsconfig.json ) \
  > "$D/p2-tsc.stdout" 2>&1; echo $? > "$D/p2.exit"

# P3 — storefront 默认视图
npx tsx packages/cli/src/bin.ts --help > "$D/p3-storefront.txt" 2>/dev/null; echo $? > "$D/p3.exit"

# P4 — full --all 视图
npx tsx packages/cli/src/bin.ts help --all > "$D/p4-all.txt" 2>/dev/null; echo $? > "$D/p4.exit"
```

## DUMP — 汇总 judge.json

```bash
python3 - "$D" > "$D/judge.json" <<'PY'
import json,sys,re
d=sys.argv[1]
def rd(f):
    try: return open(f"{d}/{f}",encoding="utf8").read()
    except: return ""
v=json.loads(rd("p1-vitest.json") or "{}")
sf=rd("p3-storefront.txt"); al=rd("p4-all.txt")
store=["init","analyze","doctor","dashboard","presence","daily","record","video"]
out={
 "run_id":d,
 "p1_tests":{"passed":v.get("numPassedTests"),"failed":v.get("numFailedTests")},
 "p2_typecheck_exit":int(rd("p2.exit") or 1),
 "p3_storefront_has_all_8":all(f"teamagent {c}" in sf for c in store),
 "p3_has_all_hint":"teamagent help --all" in sf,
 "p3_leaks_background":"teamagent m5-infect" in sf or "teamagent skeleton-demo" in sf,
 "p4_all_linecount":al.count(chr(10))+1 if al else 0,
 "p4_all_has_m5_infect":"m5-infect" in al,
 "evidence_dir":d,
}
print(json.dumps(out,ensure_ascii=False,indent=2))
PY
cat "$D/judge.json"
```

## READ — LLM judge 判决（只读 `judge.json`）

PASS 当且仅当全部成立：

- `p1_tests.passed == 6` 且 `p1_tests.failed == 0`
- `p2_typecheck_exit == 0`
- `p3_storefront_has_all_8 == true` 且 `p3_has_all_hint == true` 且 `p3_leaks_background == false`
- `p4_all_linecount >= 140`（实测基线 144）且 `p4_all_has_m5_infect == true`

任一不成立 → FAIL，附 `evidence_dir` 下对应 raw 文件路径。LLM judge 不得凭感觉，只读 JSON。
