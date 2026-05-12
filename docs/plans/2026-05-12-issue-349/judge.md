```text
   ┌──────────────────────────────────────────────────────────────────────┐
   │ judge.md — issue #349 third-party verify gate (no in-house judge)    │
   │                                                                      │
   │   V1 RUN  ──▶  V2 DUMP  ──▶  V3 READ                                  │
   │   6 grep    judge.json     claudefast LLM reads JSON only             │
   │   probes    + raw stdout   ⇒ PASS / FAIL                              │
   └──────────────────────────────────────────────────────────────────────┘
```

# judge.md — issue #349

第三方 judge harness。**禁止**让本 PR 的实现 agent 自己宣布 PASS；必须由 maintainer（或 PR reviewer）在 worktree 内手动跑下面的 V1 + V2，再由独立 LLM session 跑 V3 写最终判决。

## V1 RUN（固定工具，6 个 probe，从仓库根跑）

```bash
set -u
mkdir -p docs/plans/2026-05-12-issue-349/evidence
EVID=docs/plans/2026-05-12-issue-349/evidence

# P1 — FIXEDFLOW.md 新段标题命中
grep -c "Taking over someone else's grill-ready issue" docs/FIXEDFLOW.md \
  > "$EVID/P1.txt"; P1=$(cat "$EVID/P1.txt")

# P2 — FIXEDFLOW.md 引用了 grill-working label
grep -c "grill-working" docs/FIXEDFLOW.md > "$EVID/P2.txt"; P2=$(cat "$EVID/P2.txt")

# P3 — FIXEDFLOW.md 含三段 verbatim 中文声明
( grep -Fc -- "我已经开始干了" docs/FIXEDFLOW.md
  grep -Fc -- "我来负责 grill-with-docs / grill-via-web" docs/FIXEDFLOW.md
  grep -Fc -- "我的机器上开始干了" docs/FIXEDFLOW.md
) > "$EVID/P3.txt"
P3_min=$(awk 'BEGIN{m=999} {if($1<m) m=$1} END{print m}' "$EVID/P3.txt")

# P4 — HOW-TO-CLAIM-ISSUE.md 引用新段标题
grep -c "Taking over someone else's grill-ready issue" docs/HOW-TO-CLAIM-ISSUE.md \
  > "$EVID/P4.txt"; P4=$(cat "$EVID/P4.txt")

# P5 — FIXEDFLOW.md 与既有规则的关系表追加了本 plan dir
grep -c "docs/plans/2026-05-12-issue-349" docs/FIXEDFLOW.md \
  > "$EVID/P5.txt"; P5=$(cat "$EVID/P5.txt")

# P6 — 没有新增 GitHub label (baseline 见下方)
gh label list --limit 60 > "$EVID/P6.txt"
P6=$(wc -l < "$EVID/P6.txt")

# baseline 行数：本 PR 开 PR 前 gh label list 共 18 条（见 research.md 表）
P6_baseline=18
```

## V2 DUMP（写 judge.json — raw machine-readable）

```bash
cat > "$EVID/judge.json" <<JSON
{
  "issue": 349,
  "run_id": "$(date -u +%Y%m%dT%H%M%SZ)",
  "probes": [
    {"probe":"P1","tool":"grep -c \"Taking over someone else's grill-ready issue\" docs/FIXEDFLOW.md","expected":">=1","observed":$P1,"exit_code":0,"stdout_path":"evidence/P1.txt"},
    {"probe":"P2","tool":"grep -c \"grill-working\" docs/FIXEDFLOW.md","expected":">=1","observed":$P2,"exit_code":0,"stdout_path":"evidence/P2.txt"},
    {"probe":"P3","tool":"grep -Fc three Chinese phrases in docs/FIXEDFLOW.md","expected":"min>=1","observed":$P3_min,"exit_code":0,"stdout_path":"evidence/P3.txt"},
    {"probe":"P4","tool":"grep -c \"Taking over someone else's grill-ready issue\" docs/HOW-TO-CLAIM-ISSUE.md","expected":">=1","observed":$P4,"exit_code":0,"stdout_path":"evidence/P4.txt"},
    {"probe":"P5","tool":"grep -c \"docs/plans/2026-05-12-issue-349\" docs/FIXEDFLOW.md","expected":">=1","observed":$P5,"exit_code":0,"stdout_path":"evidence/P5.txt"},
    {"probe":"P6","tool":"gh label list --limit 60 | wc -l","expected":"==$P6_baseline","observed":$P6,"exit_code":0,"stdout_path":"evidence/P6.txt"}
  ]
}
JSON
```

## V3 READ（独立 LLM 只读 JSON + raw evidence 写判决）

由 PR reviewer 在 worktree 外（或另一会话）跑：

```bash
claudefast -p "
Read ONLY docs/plans/2026-05-12-issue-349/evidence/judge.json and the six text files under
docs/plans/2026-05-12-issue-349/evidence/. For each probe:
- compare observed vs expected (P1/P2/P4/P5 must be >=1; P3 min must be >=1; P6 observed must equal baseline 18).
- write one line: <probe> PASS|FAIL observed=<n> expected=<e>.
Do NOT read FIXEDFLOW.md / HOW-TO-CLAIM-ISSUE.md / any source file directly — judge by JSON+text evidence only.
End with a single final line: VERDICT: PASS  (if all six PASS) or VERDICT: FAIL  (otherwise).
"
```

PASS 条件：6 行 PASS + 最末 `VERDICT: PASS`。任一 FAIL → block merge，回到 fix-loop。

## Failure escalation

- P1-P5 FAIL → 文档实现没落到位，回写 `docs/plans/2026-05-12-issue-349/2026-05-12-pr-<N>-iter-<i>-fix-plan.md` 三段 fix-plan，按 `docs/PR-PLAN.md` 修。
- P6 FAIL → 误新增了 label，去 `gh label delete <name>` 撤掉。
- V3 LLM 拒绝判分 / 输出格式漂 → 重跑 V1+V2，再 V3；不许人手伪造 VERDICT。

## 为什么不用 unit test / contract test / pipeline test 当 verify gate

按 user-level memory `feedback_verification_only_judge_harness.md`：unit / contract / pipeline / CLI self-report 全都是 code grading itself inside the system's trust boundary；只有 `docs/plans/.../judge.md`（另一只 LLM + raw JSON + pinned 阈值）才算 third-party harness。
