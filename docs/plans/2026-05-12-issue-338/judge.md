```
+----------------------------------------------------------+
| judge.md — issue #338 — third-party verdict playbook     |
|                                                          |
|  V1 RUN ──► V2 DUMP ──► V3 READ                          |
|  (3 probes) (raw JSON)   (independent LLM judge)         |
+----------------------------------------------------------+
```

# judge.md — issue #338 docs PR verdict harness

按 user-level memory `feedback_judge_harness_md_playbook.md`：判决是一个 **md playbook** — MAIN agent 通过 subagent / `claudefast -p` 分派；**不是** `scripts/*.sh`。按 user-level memory `feedback_verification_only_judge_harness.md`：不接受 unit / pipeline test 作为判决证据。

run_id = `2026-05-12-issue-338-<short-sha>`；evidence_dir = `docs/plans/2026-05-12-issue-338/.judge/<run_id>/`（.judge/ 已加入 .gitignore；若否，evidence 文件单独 commit 时再决定）。

---

## V1 — RUN（固定工具集）

主 agent 顺序（或并行）执行 3 个 probe：

### R1 — Claude semantic probe

```bash
claudefast -p "If a Claude Code agent (e.g. /fixed-flow-driver or any /review skill in a Claude Code session) discovers a GitHub issue carrying the 'ready-for-human' label and concludes the work has been completed by a recent merged PR, may that agent run 'gh issue close' against the issue? Reply with exactly one word YES or NO on the first line, then on subsequent lines cite the section title in docs/FIXEDFLOW.md that controls this policy and the issue number that established the rule." \
  > .judge/<run_id>/R1.stdout.txt 2> .judge/<run_id>/R1.stderr.txt
```

期望：第一行 = `NO`；后续行包含 `Human-ready issues — never auto-close` 与 `#338`。

### R2 — Codex semantic probe

```bash
codex exec --skip-git-repo-check -s read-only "If a Codex CLI agent ... [same question as R1] ..." \
  > .judge/<run_id>/R2.stdout.txt 2> .judge/<run_id>/R2.stderr.txt
```

期望：与 R1 相同（NO + 引用相同 section）。

### R3 — Diff structural probe

不调 LLM，只跑 git + grep。三个子检查（任一 fail 整 R3 fail）：

1. **新 section 命中且仅一次** — `git diff origin/main..HEAD -- docs/FIXEDFLOW.md | grep -c '^+## Human-ready issues — never auto-close'` 必须返回 `1`。
2. **三锚点全在 diff 里** — `git diff origin/main..HEAD -- docs/FIXEDFLOW.md | grep -E '^\+' | grep -i -E '禁止 agent|gh issue close|ready-for-human'` 必须**三个 pattern 都至少各命中 1 次**。
3. **HOW-TO-CLAIM-ISSUE cross-link 落地** — `git diff origin/main..HEAD -- docs/HOW-TO-CLAIM-ISSUE.md | grep -c '^+.*Human-ready issues — never auto-close'` 必须 ≥ 1（cross-link 添加）。
4. **issue #338 anchor 在 reference 段** — `git diff origin/main..HEAD -- docs/FIXEDFLOW.md | grep -i '#338'` 必须命中至少 1 次。

R3 输出写入 `R3.json`：

```json
{
  "section_hit_count": 1,
  "anchor_grep_hits": { "禁止 agent": N1, "gh issue close": N2, "ready-for-human": N3 },
  "cross_link_added": true,
  "issue_338_anchor": true,
  "pass": true
}
```

---

## V2 — DUMP

主 agent 把 R1 / R2 / R3 的产出汇总到 `judge.json`：

```json
{
  "run_id": "...",
  "evidence_dir": ".judge/<run_id>/",
  "R1": { "first_line": "NO", "section_cited": true, "pass": true },
  "R2": { "first_line": "NO", "section_cited": true, "pass": true },
  "R3": { ...如上... },
  "verdict": null
}
```

`verdict` 留空，由 V3 的独立裁判 LLM 填。

---

## V3 — READ（独立 LLM 裁判）

主 agent 派一只**新** subagent（不复用本会话上下文），喂给它：

- `judge.json` 全文
- `R1.stdout.txt` / `R2.stdout.txt` 全文
- `R3.json` 全文

裁判 prompt：

> 你是 issue #338 docs PR 的独立裁判。只允许读已附 JSON / stdout；禁止 grep 源 docs；禁止 git checkout 任何文件。判决规则：
>
> - R1 + R2：第一行必须严格等于 `NO`，且 stdout 必须包含子串 `Human-ready issues — never auto-close` 与 `#338`。
> - R3：`pass=true` 且 4 个子检查全 true。
>
> 任一 fail → `verdict = FAIL` + 列具体 fail 项。
> 全 pass → `verdict = PASS`。
>
> 输出格式：第一行 `verdict: PASS` 或 `verdict: FAIL`；第二行起列原因。

裁判输出回填到 `judge.json.verdict`。verdict = PASS 才进入 squash-merge；FAIL 走 PR-PLAN 循环。

---

## 不接受作为判决证据

按 user-level memory `feedback_verification_only_judge_harness.md`：

- `pnpm test` / vitest 输出 — 是 system 内 self-evaluation
- `pnpm teamagent calibrate` — 同上
- `/review` skill 输出 — 是 review gate（ADR-0007），用于 fix-plan 循环，**不是** judge harness 的 PASS 信号
- 任何 main agent 自己读 docs 文本下结论 — 违反 "判决由第三方读 raw JSON" 原则

`/review` PASS 是 merge **前置**门禁（与 branch protection probe 并列），judge harness PASS 是 docs PR 的 feature-verification 证据，二者并存。
