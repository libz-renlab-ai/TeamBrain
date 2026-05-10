```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   judge.md — boil-the-ocean-cleanup                                │
   │   3rd-party harness (md playbook, NOT scripts)                     │
   │                                                                    │
   │   V1 actions bump → CI green                                       │
   │   V2 claude workflows deleted clean                                │
   │   V3 J5 runner playbook well-formed                                │
   │                                                                    │
   │   每个 probe → result.json → claudefast -p 终判 PASS/FAIL           │
   │   ❌ implement agent 不得自评    ❌ plan 作者不得自评                │
   │   ❌ workflow 自己不得自评       ✅ claudefast -p 读 raw JSON 当裁判 │
   └────────────────────────────────────────────────────────────────────┘
```

---

## 0 Harness 元规则

- **本文件是 MD playbook，不是 shell script。** 项目硬规则（`feedback_judge_harness_md_playbook.md` + `~/.claude/docs/rules/testing-judge-harness.md`）：judge 由 main agent 读 markdown，dispatch subagent 或 `claudefast -p` 按节执行；禁 `scripts/*.sh` / 固定 bash pipeline。
- 每节 §V<n> 三步：**§V<n>.RUN**（执行命令）→ **§V<n>.DUMP**（落 `judge/V<n>/result.json` + `stdout.log`）→ **§V<n>.READ**（独立 `claudefast -p` 读 raw JSON 判 PASS/FAIL）。
- token 字面值禁止落 result.json / stdout.log；必要时 `[redacted]`。
- 终判：`claudefast -p` 读 `judge/V*/result.json` 综合写 `judge/_overall/verdict.md`。
- 工作目录（相对仓库根）：`docs/plans/2026-05-10-boil-the-ocean-cleanup/`。

---

## V1 — Node 24 actions bump 不破坏 CI

**Hypothesis**：把 9 个 active workflow 的 `@v4`/`@v3`/`@v7` 升到 `@v5`/`@v5`/`@v8` 后，`inner-loop.yml` 在 wip 分支 push 时仍跑通（`conclusion=success`），且没有 deprecation warning 升为 error。

### §V1.RUN

1. 实施完成（commit 落地）后 `git push origin HEAD:wip/boil-the-ocean-cleanup`。
2. `RUN_ID=$(gh run list --workflow=inner-loop.yml --branch wip/boil-the-ocean-cleanup -L 1 --json databaseId --jq '.[0].databaseId')`
3. `gh run watch "$RUN_ID" --exit-status` 阻塞至完成。
4. （静态校验）`grep -nE '@v[34]([^0-9]|$)' .github/workflows/*.yml` 必须**只**剩 `@v3` / `@v4` 在 `claude-code-action`（已删）以外**零命中**——任何剩余 `@v3` `@v4` 都要在 stdout 里出现，进 `judge/V1/stdout.log`。

### §V1.DUMP

写 `judge/V1/result.json`：

```json
{
  "probe_id": "V1",
  "ci_run": {
    "input_branch": "wip/boil-the-ocean-cleanup",
    "run_id": <int>,
    "status": "completed",
    "conclusion": "success",
    "duration_sec": <int>,
    "evidence_url": "https://github.com/libz-renlab-ai/TeamBrain/actions/runs/<id>"
  },
  "static_check": {
    "remaining_v4_or_v3_pins": [
      // 命中行；deleted file 不该出现；v5/v8 的不出现；无命中即 []
    ],
    "expected_remaining": []
  },
  "captured_at": "<iso8601>"
}
```

原始 stdout 落 `judge/V1/stdout.log`（gh CLI 输出 + grep 输出）。

### §V1.READ

独立 `claudefast -p` 提示词（new session、不读其它文件、只读 raw JSON + stdout.log）：

> Read `docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V1/result.json` and `judge/V1/stdout.log`. Apply pass criterion: `ci_run.conclusion == "success"` AND `ci_run.status == "completed"` AND `static_check.remaining_v4_or_v3_pins == []`. Output a single line `V1: PASS|FAIL — <one-sentence reason>`.

**Pass criterion**：`conclusion=="success"` ∧ `status=="completed"` ∧ 静态 grep 零命中。

---

## V2 — claude.yml + claude-code-review.yml 真删干净

**Hypothesis**：两个 workflow 文件物理移除；新 PR 不再触发 `Claude Code Review` / `Claude Code` workflow run。

### §V2.RUN

1. `ls .github/workflows/claude*.yml 2>&1 | tee judge/V2/stdout.log`（期望 stderr `No such file`）。
2. `find .github -name 'claude.yml' -o -name 'claude-code-review.yml' 2>&1 | tee -a judge/V2/stdout.log`（期望空输出）。
3. PR 开了之后：`gh run list --workflow='Claude Code Review' --json status,databaseId --jq 'length' >> judge/V2/stdout.log`（期望 0 或 only legacy runs from before deletion）。
4. PR 开了之后：`gh run list --workflow='Claude Code' --json status,databaseId --jq 'length' >> judge/V2/stdout.log`（同上）。

### §V2.DUMP

写 `judge/V2/result.json`：

```json
{
  "probe_id": "V2",
  "claude_yml_exists": false,
  "claude_code_review_yml_exists": false,
  "find_returned_paths": [],
  "post_pr_claude_review_runs_count": 0,
  "post_pr_claude_runs_count": 0,
  "captured_at": "<iso8601>"
}
```

### §V2.READ

独立 `claudefast -p` 提示词：

> Read `docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V2/result.json`. Apply pass criterion: ALL of `claude_yml_exists==false`, `claude_code_review_yml_exists==false`, `find_returned_paths==[]`, `post_pr_claude_review_runs_count==0`, `post_pr_claude_runs_count==0`. Output `V2: PASS|FAIL — <one-sentence reason>`.

**Pass criterion**：5 个字段全等于期望。

---

## V3 — J5 full-curve runner playbook 完备性

**Hypothesis**：`docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md` 是 md playbook（不是 shell 脚本），描述了 4 个 N 档（n=1/2/3/4）的手动采集步骤、合并 schema、与现有 `loadavg-curve.json` 的衔接路径；同时 `loadavg-curve.json.follow_up_for_full_curve` 指回 `runner.md`。

### §V3.RUN

V3 区分两类 `.sh` 引用：(a) **anti-statement** (§0/§1 prose 里说 "NOT a .sh"、"禁 scripts/*.sh" — 这些是**遵守**规则的证据)；(b) **procedural step** (§2-§5 step body 让用户跑 `.sh` — 违规)。grep 必须只命中 (b)。

1. `test -f docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md && echo "exists" > judge/V3/stdout.log || echo "missing" > judge/V3/stdout.log`
2. `grep -cE '^## [0-9]+ N=[1-4]\b' docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md >> judge/V3/stdout.log`（期望 ≥ 4，每档一节；runner.md section 头格式是 `## <num> N=<n> ...`）
3. `grep -c 'toohot' docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md >> judge/V3/stdout.log`（期望 ≥ 4，每档至少一次提到）
4. **总 `.sh` mentions（含 anti-statements）** — 用作 forensic 上下文，不是 pass 判据：`grep -cE '\.sh\b|bash -c' docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md >> judge/V3/stdout.log`
5. **procedural-step `.sh` mentions** — 这才是 pass 判据。awk 切出 §2..§5 段（`/^## [2-5] /` 起到下个 `^## ` 止），在切片里 grep `.sh` / `bash -c`：
   ```
   awk '/^## [2-5] /,/^## [^2-5]/' docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md \
     | grep -cE '\.sh\b|bash -c' >> judge/V3/stdout.log
   ```
   期望 0（procedure 不让用户跑 fixed bash）。
6. `jq -r '.follow_up_for_full_curve' docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/loadavg-curve.json >> judge/V3/stdout.log`（期望含 `runner.md` 字符串）

### §V3.DUMP

写 `judge/V3/result.json`：

```json
{
  "probe_id": "V3",
  "runner_md_exists": true,
  "runner_md_section_count_for_n_1_to_4": 4,
  "runner_md_toohot_mention_count": <int>,
  "runner_md_total_sh_mention_count": <int>,
  "runner_md_procedural_step_sh_mention_count": 0,
  "runner_md_sh_mention_lines_with_classification": [
    /* 每一处 .sh 的 line# + 文本 + classification (anti-statement | procedural-step) */
  ],
  "loadavg_curve_follow_up_links_runner": true,
  "captured_at": "<iso8601>"
}
```

### §V3.READ

独立 `claudefast -p` 提示词：

> Read `docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V3/result.json` AND `docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md`. Apply pass criterion: `runner_md_exists==true`, `runner_md_section_count_for_n_1_to_4>=4`, `runner_md_toohot_mention_count>=4`, `runner_md_procedural_step_sh_mention_count==0`, `loadavg_curve_follow_up_links_runner==true`. Then **read every line in `sh_mention_lines_with_classification` from runner.md directly** and confirm each is correctly classified as anti-statement (§0/§1 prose proving the rule) vs procedural-step (§2-§5 step body asking user to run a script). If any `.sh` appears in §2-§5 procedure, V3 FAILs regardless of total count. Output `V3: PASS|FAIL — <one-sentence reason>`.

**Pass criterion**：5 个 JSON 字段满足 + claudefast 人工读 markdown 后确认每条 `.sh` 引用分类正确（§0/§1 anti-statement 不计违规；§2-§5 procedural-step 计违规）。

---

## _overall — 终判

§V1 / §V2 / §V3 三条 result.json 就绪后跑：

```bash
# 第三方 claudefast，新会话，不读源代码，只读 raw JSON + stdout.log + 必要 markdown
claudefast -p "$(cat <<'PROMPT'
Read these three files and decide overall PASS/FAIL:
- docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V1/result.json
- docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V2/result.json
- docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V3/result.json

Plus stdout logs:
- docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V1/stdout.log
- docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V2/stdout.log
- docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V3/stdout.log

For each probe, restate the pass criterion verbatim from judge.md and verify field-by-field. Then output a markdown verdict with one section per probe + one overall section. Path: docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/_overall/verdict.md.
PROMPT
)"
```

写 `judge/_overall/verdict.md`，格式与 `2026-05-10-inner-loop-on-ci/judge/_overall/verdict.md` 一致：

```
## V1 — PASS — <reason>
## V2 — PASS — <reason>
## V3 — PASS — <reason>
## Overall: PASS — All 3 probes individually satisfy their criteria.
```

---

## 失败处理（POSTPR loop）

- **V1 FAIL（CI 红）**：可能 v5 引入 breaking。读 `gh run view <id> --log-failed`，找具体 step 报错；多半是 `setup-node@v5` 的 cache key 或 `pnpm/action-setup@v5` 的 `version` input 改字段名。在本 PR branch 修；不开 follow-up issue（`docs/PR-PLAN.md` 硬规则）。
- **V2 FAIL（文件没删干净 / 历史 run 仍计数）**：检查 git status 是否漏 `git rm`；historical runs 不算（pass criterion 说的是 *新* PR 触发的 run，需要在 V2.RUN 里加 `--created '>=<pr-open-time>'` 过滤）。
- **V3 FAIL（playbook 不完整）**：补 runner.md；不要降低 pass criterion；`fixed_script_mention_count > 0` 说明误写了 `.sh`，删掉改为 markdown 步骤。

任何 V<n> FAIL 都进 PR-PLAN 流程（`docs/plans/2026-05-10-boil-the-ocean-cleanup/pr-plan.md` 现写现用），不 punt 到新 issue。
