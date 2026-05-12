```text
   ┌──────────────────────────────────────────────────────────────────────┐
   │ judge.md — issue #349 third-party verify gate (iter-2 hardened)      │
   │                                                                      │
   │   V1 RUN  ──▶  V2 DUMP  ──▶  V3 READ                                  │
   │   9 probes  judge.json     claudefast LLM reads observed.json +       │
   │   (P3 regex,observed-only  expected.json AND re-runs greps itself     │
   │   P6 diff,  + raw stdout)  ⇒ PASS / FAIL                              │
   │   P7-P9)                                                              │
   └──────────────────────────────────────────────────────────────────────┘
```

# judge.md — issue #349 (iter-2)

第三方 judge harness。**禁止**让本 PR 的实现 agent 自己宣布 PASS；必须由 maintainer（或 PR reviewer）在 worktree 内手动跑下面的 V1 + V2，再由独立 LLM session 跑 V3 写最终判决。

v1 (3 commits) 用了 6 probe；adversarial /review 指出 P3 whitespace-fragile、P6 既非 deterministic 又 tautological、V3 prompt 实际只读取 V2 已经算好的 verdict 字段（rubber-stamping）。iter-2 把 V1 升到 9 probe，V2 拆成 `observed.json` + 独立的 `expected.json`，V3 prompt 必须重新跑 greps 才能写 verdict。

## V1 RUN（固定工具，9 个 probe，从仓库根跑）

```bash
set -u
mkdir -p docs/plans/2026-05-12-issue-349/evidence
EVID=docs/plans/2026-05-12-issue-349/evidence

# P1 — FIXEDFLOW.md 新段标题命中（不变）
grep -c "Taking over someone else's grill-ready issue" docs/FIXEDFLOW.md \
  > "$EVID/P1.txt"; P1=$(cat "$EVID/P1.txt")

# P2 — FIXEDFLOW.md 引用了 grill-working label（不变）
grep -c "grill-working" docs/FIXEDFLOW.md > "$EVID/P2.txt"; P2=$(cat "$EVID/P2.txt")

# P3 — FIXEDFLOW.md 含三段 verbatim 中文声明（tolerant regex，F5 fix）
( grep -Fc -- "我已经开始干了" docs/FIXEDFLOW.md
  grep -cE '我来负责\s*grill-with-docs\s*/\s*grill-via-web' docs/FIXEDFLOW.md
  grep -Fc -- "我的机器上开始干了" docs/FIXEDFLOW.md
) > "$EVID/P3.txt"
P3_min=$(awk 'BEGIN{m=999} {if($1<m) m=$1} END{print m}' "$EVID/P3.txt")

# P4 — HOW-TO-CLAIM-ISSUE.md 引用新段标题（不变）
grep -c "Taking over someone else's grill-ready issue" docs/HOW-TO-CLAIM-ISSUE.md \
  > "$EVID/P4.txt"; P4=$(cat "$EVID/P4.txt")

# P5 — FIXEDFLOW.md 与既有规则的关系表追加了本 plan dir（不变）
grep -c "docs/plans/2026-05-12-issue-349" docs/FIXEDFLOW.md \
  > "$EVID/P5.txt"; P5=$(cat "$EVID/P5.txt")

# P6 — label set 与 pinned baseline 完全一致（F4 fix：用 diff，不再 wc -l）
gh label list --json name --jq '.[].name' 2>/dev/null | sort > "$EVID/labels.observed.txt"
diff -u "$EVID/labels.baseline.txt" "$EVID/labels.observed.txt" > "$EVID/P6.txt" || true
P6_diff_lines=$(wc -l < "$EVID/P6.txt" | tr -d ' ')

# P7 — FIXEDFLOW.md 引用了 PRE-IMPLEMENT-CLAIM.md（F2 backfill 验证）
grep -c "PRE-IMPLEMENT-CLAIM.md" docs/FIXEDFLOW.md \
  > "$EVID/P7.txt"; P7=$(cat "$EVID/P7.txt")

# P8 — PRE-IMPLEMENT-CLAIM.md 存在且 ≥ 30 行（F2 backfill 验证）
if [ -f docs/PRE-IMPLEMENT-CLAIM.md ]; then
  P8=$(wc -l < docs/PRE-IMPLEMENT-CLAIM.md | tr -d ' ')
else
  P8=0
fi
echo "$P8" > "$EVID/P8.txt"

# P9 — FIXEDFLOW.md §Taking over 段内含 ghost-timer / ack 门禁字样（F1 verify）
# 用 awk 把范围限定在 §Taking over 段内（从 "## Taking over" 到下一个 "## "），
# 避免 preamble / refusal-layer 里的不相关 "24h" 文字（iter-2 N2 fix）。
P9=$(awk '/^## Taking over/{flag=1; next} /^## /{flag=0} flag' docs/FIXEDFLOW.md \
       | grep -cE 'Ghost-timer|ghost-timer|Explicit ack|explicit ack|24h')
echo "$P9" > "$EVID/P9.txt"
```

## V2 DUMP — observed-only judge.json + 独立 expected.json

`observed.json`：只记 raw observed + tool string + stdout 路径，**不**包含 expected / pass-fail 字段。

```bash
cat > "$EVID/observed.json" <<JSON
{
  "issue": 349,
  "run_id": "$(date -u +%Y%m%dT%H%M%SZ)",
  "iter": 3,
  "probes": [
    {"probe":"P1","tool":"grep -c \"Taking over someone else's grill-ready issue\" docs/FIXEDFLOW.md","observed":$P1,"stdout_path":"evidence/P1.txt"},
    {"probe":"P2","tool":"grep -c grill-working docs/FIXEDFLOW.md","observed":$P2,"stdout_path":"evidence/P2.txt"},
    {"probe":"P3","tool":"awk 'BEGIN{m=999} END{print m} {if (\$1<m) m=\$1}' < <(grep -Fc -- '我已经开始干了' docs/FIXEDFLOW.md; grep -cE '我来负责[[:space:]]*grill-with-docs[[:space:]]*/[[:space:]]*grill-via-web' docs/FIXEDFLOW.md; grep -Fc -- '我的机器上开始干了' docs/FIXEDFLOW.md)","observed":$P3_min,"stdout_path":"evidence/P3.txt"},
    {"probe":"P4","tool":"grep -c \"Taking over someone else's grill-ready issue\" docs/HOW-TO-CLAIM-ISSUE.md","observed":$P4,"stdout_path":"evidence/P4.txt"},
    {"probe":"P5","tool":"grep -c docs/plans/2026-05-12-issue-349 docs/FIXEDFLOW.md","observed":$P5,"stdout_path":"evidence/P5.txt"},
    {"probe":"P6","tool":"diff -u docs/plans/2026-05-12-issue-349/evidence/labels.baseline.txt <(gh label list --json name --jq '.[].name' | sort) | wc -l | tr -d ' '","observed":$P6_diff_lines,"stdout_path":"evidence/P6.txt"},
    {"probe":"P7","tool":"grep -c PRE-IMPLEMENT-CLAIM.md docs/FIXEDFLOW.md","observed":$P7,"stdout_path":"evidence/P7.txt"},
    {"probe":"P8","tool":"[ -f docs/PRE-IMPLEMENT-CLAIM.md ] && wc -l < docs/PRE-IMPLEMENT-CLAIM.md | tr -d ' ' || echo 0","observed":$P8,"stdout_path":"evidence/P8.txt"},
    {"probe":"P9","tool":"awk '/^## Taking over/{flag=1; next} /^## /{flag=0} flag' docs/FIXEDFLOW.md | grep -cE 'Ghost-timer|ghost-timer|Explicit ack|explicit ack|24h'","observed":$P9,"stdout_path":"evidence/P9.txt"}
  ]
}
JSON

# Symlink-ish: keep judge.json name available for back-compat readers; same content as observed.json.
cp "$EVID/observed.json" "$EVID/judge.json"
```

`expected.json`：**pinned**，与 V2 解耦 —— V3 LLM 拿这个比对 observed，不能读 V2 的 self-graded verdict。

```bash
cat > "$EVID/expected.json" <<'JSON'
{
  "issue": 349,
  "iter": 2,
  "expected": [
    {"probe":"P1","operator":">=","threshold":1,"meaning":"FIXEDFLOW.md mentions the new takeover section title"},
    {"probe":"P2","operator":">=","threshold":1,"meaning":"FIXEDFLOW.md references grill-working label"},
    {"probe":"P3","operator":">=","threshold":1,"meaning":"all three Chinese phrases present in FIXEDFLOW.md (tolerant regex)"},
    {"probe":"P4","operator":">=","threshold":1,"meaning":"HOW-TO-CLAIM-ISSUE.md cross-references the takeover section"},
    {"probe":"P5","operator":">=","threshold":1,"meaning":"FIXEDFLOW.md §与既有规则的关系 has plan-dir footnote"},
    {"probe":"P6","operator":"==","threshold":0,"meaning":"diff between pinned labels.baseline.txt and labels.observed.txt is empty (no label drift)"},
    {"probe":"P7","operator":">=","threshold":1,"meaning":"FIXEDFLOW.md cross-references docs/PRE-IMPLEMENT-CLAIM.md (F2 backfill)"},
    {"probe":"P8","operator":">=","threshold":30,"meaning":"docs/PRE-IMPLEMENT-CLAIM.md exists and is at least 30 lines"},
    {"probe":"P9","operator":">=","threshold":1,"meaning":"FIXEDFLOW.md takeover gate references 24h ghost-timer or explicit ack (F1 fix)"}
  ]
}
JSON
```

`labels.baseline.txt` is pinned at PR open time (committed alongside this file). To regenerate baseline manually: `gh label list --json name --jq '.[].name' | sort > docs/plans/2026-05-12-issue-349/evidence/labels.baseline.txt`. After that, any new label requires a follow-up PR to refresh baseline + the judge — exactly the change-control intent.

## V3 READ — independent LLM, re-runs greps, compares observed to expected

V3 LLM **must** consume `observed.json` + `expected.json` separately. It is **forbidden** to read FIXEDFLOW.md / HOW-TO-CLAIM-ISSUE.md / PRE-IMPLEMENT-CLAIM.md directly — but it **must** re-run the V1 greps as Bash tool calls to confirm V2 didn't lie. This breaks the v1 rubber-stamp loop.

```bash
claudefast -p "
You are the third-party judge for TeamBrain issue #349 (iter-3 hardened).
You will NOT read FIXEDFLOW.md / HOW-TO-CLAIM-ISSUE.md / PRE-IMPLEMENT-CLAIM.md directly.

You WILL:
1. Read docs/plans/2026-05-12-issue-349/evidence/observed.json — raw observed numbers + a runnable 'tool' command per probe (every tool string is a single shell pipeline; no prose).
2. Read docs/plans/2026-05-12-issue-349/evidence/expected.json — pinned thresholds + operator.
3. For each probe entry in observed.json, INDEPENDENTLY execute the exact 'tool' command via a Bash tool call from the repo root, and capture the re-observed integer value (last line of stdout).
4. Compare the re-observed value to the expected operator+threshold. Emit one line per probe:
     <probe> PASS|FAIL  reobserved=<n>  observed_in_json=<n>  expected=<op><threshold>  meaning=<...>
   Mark FAIL if:
     - re-observed disagrees with observed.json 'observed' value (V2 lied), OR
     - re-observed does not satisfy expected operator+threshold.
5. End with exactly one line:  VERDICT: PASS  (only if every probe PASS), otherwise  VERDICT: FAIL.

Constraints (do NOT skip):
- The tool string is the SOURCE OF TRUTH for what to run. Do NOT substitute your own command (no \"I know a better grep\"). If the tool string is malformed, mark that probe FAIL and explain in the line.
- For P6, you MUST regenerate the observed label list yourself via 'gh label list --json name --jq .[].name | sort' inside the pipeline; never reuse a pre-existing labels.observed.txt that V2 wrote.
- Do NOT read FIXEDFLOW.md / HOW-TO-CLAIM-ISSUE.md / PRE-IMPLEMENT-CLAIM.md as files. The greps in the tool strings ARE allowed to read those docs; you, the judge, are not.
"
```

PASS 条件：9 行 PASS + 最末 `VERDICT: PASS`，并且 V3 re-run 出来的 observed 与 V2 dumped 值一致（如果 V2 撒谎，V3 立刻发现）。

## Failure escalation

- P1-P5 / P7-P9 FAIL → 文档实现没落到位，回写 `docs/plans/2026-05-12-issue-349/2026-05-12-pr-<N>-iter-<i>-fix-plan.md` 三段 fix-plan，按 `docs/PR-PLAN.md` 修。
- P6 FAIL → labels.observed.txt 与 pinned labels.baseline.txt 有 diff（任一行）。原因要么 (a) 本 PR 误新增 / 删除了 label —— 立即用 `gh label create/delete` 回滚；(b) 仓库其他人在 PR 期间加了 unrelated label —— 不是本 PR 的问题，但 baseline 需要在 follow-up PR 里 refresh。两种都需要 explain，不能直接 override。
- P8 FAIL → `docs/PRE-IMPLEMENT-CLAIM.md` 缺失或太短，F2 backfill 没做完。
- V3 LLM 输出格式漂 / 不肯 re-grep → 重跑 V1+V2，再 V3；不许人手伪造 VERDICT 或绕过 re-run 要求。

## 为什么 v1 6-probe 不够（adversarial review backfill）

- v1 P6 `wc -l == 18` 既不 deterministic 也不验证「本 PR 没新增 label」的本意 —— iter-2 改成 sorted-name diff against pinned baseline。
- v1 P3 `grep -Fc` exact-match 任何 fullwidth 标点 / 空格变化就 fail —— iter-2 用 `grep -cE` 容忍正则。
- v1 V3 prompt 只读 judge.json，里面已经被 V2 算好 expected vs observed —— LLM 实质上 reformat 而已，不是独立 judge。iter-2 V3 必须自己 re-grep 才有发言权。
- v1 缺 PRE-IMPLEMENT-CLAIM.md backfill probe —— iter-2 新增 P7+P8 把这条契约文件 absent 的 dangling reference 钉牢。
- v1 缺 takeover-gate 文字证据 probe —— iter-2 新增 P9 验证 `24h|ack` 语义没被 dropped 掉。

## 为什么不用 unit test / contract test / pipeline test 当 verify gate

按 user-level memory `feedback_verification_only_judge_harness.md`：unit / contract / pipeline / CLI self-report 全都是 code grading itself inside the system's trust boundary；只有 `docs/plans/.../judge.md`（另一只 LLM + raw JSON + pinned 阈值 + 独立 re-run）才算 third-party harness。
