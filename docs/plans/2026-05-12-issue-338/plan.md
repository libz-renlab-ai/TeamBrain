```
+-------------------------------------------------------------+
| plan.md — issue #338 — ready-for-human never auto-close      |
|                                                              |
|  task ──► outputs ──► judge harness                          |
|  (docs   (FIXEDFLOW   (claudefast semantic probe              |
|   only)   §new sec +   + /review PASS — no code              |
|           cross-link   change so no unit tests)              |
|           backfill)                                          |
+-------------------------------------------------------------+
```

# plan.md — issue #338

三段铁律 per `docs/PLAN-RESEARCH-REPORT.md`。配套 `research.md`（上下文审计）+ `judge.md`（第三方判决 playbook）。

---

## 1. Task description

把 issue #338 的 §落地建议 §1 落地为 `docs/FIXEDFLOW.md` 的一条 canonical section "Human-ready issues — never auto-close"，并把它与既有的 `ready-for-human` 语义 / retroactive ban / dispatch label 互斥 / refusal-layer auto-close whitelist 串成一致网络。

### 要做

1. 在 `docs/FIXEDFLOW.md` 现有 `## refusal layer` 与 `## driver 行为细则` 之间插入一节 `## Human-ready issues — never auto-close`：
   - 正文：带 `ready-for-human` label 的 issue **禁止 agent / bot 调用 `gh issue close`**（包括 `/fixed-flow-driver` / Claude Code / Codex / 任何 watcher / stale-bot）。即使 agent 认为已被 PR 解决、过期、duplicate，只能贴评论，**不许主动 close**。
   - 与 `grill-ready` 互斥（issue #338 body 的 dispatch table 落地）：如果同时挂两个 label，先 remove `grill-ready` 再让 driver 介入。
   - refusal layer / conformance Action whitelist 要求：现有 issue-conformance.yml 的 enforce 期 auto-close 路径必须把 `ready-for-human` 排除（即使 issue 24h 内无 `grill-ready` label）。任何未来的 stale-bot / cleanup watcher 一律 whitelist 此 label。
   - 合法 close 路径：只有真人 maintainer（libz 任一账号 / 其它有 maintain 权限的真人）在浏览器 / CLI 里手动按 close。
   - PR 关键字 auto-close 例外：如果**真人** maintainer 已经手动把 issue 升级为「等 PR fix 即可结案」，可以在 PR body 写 `Closes #N` 让 GitHub auto-close（这是 PR merge 时的副作用，不算 agent 主动 close）。但前提是真人已确认 `ready-for-human` 的 human-judgment gate 已通过。
   - meta-self-test：本 issue (#338) 自身就是它的 test case，**禁止任何 agent close #338**，包括读到本规则的当下。
2. 在 `docs/FIXEDFLOW.md` §与既有规则的关系 段补一条 reference 行，把新 section 锚定到 issue #338 作为 provenance。
3. 在 `docs/HOW-TO-CLAIM-ISSUE.md` §如果 issue 有 `ready-for-human` label 段末尾追加 1 行 cross-link，指向新 FIXEDFLOW section（不复制内容，避免双 SoT）。

### 不做

- 不实装 stale-issue watcher whitelist（issue #338 §落地建议 §2）— code change，超出 docs PR 边界；docs 里写明 "any future watcher must whitelist" 即可。
- 不实装 pre-close hook（issue #338 §落地建议 §3）— 同上。
- 不动 `docs/POSTMORTEM.md` / `docs/TRIAGE-AND-SPLIT.md`：那里只 reference 现有规则，新规则通过 FIXEDFLOW 入口可达即可，避免改无关 SoT。
- **不 close issue #338**：违反 issue 自身规则，且本 PR 不写 PR body `Closes #338`。

### 怎么做（execution order）

1. atomic commit 1 — `docs(issue-338): add "Human-ready issues — never auto-close" section to FIXEDFLOW.md`
2. atomic commit 2 — `docs(issue-338): cross-link from HOW-TO-CLAIM-ISSUE.md`
3. atomic commit 3 — `docs(issue-338): plan.md + research.md + judge.md`
4. push, gh pr create（普通 PR）
5. /review loop until PASS
6. before-merge gh api branch protection probe
7. gh pr merge --squash --delete-branch
8. POSTPR cleanup（ExitWorktree action=remove + git pull --ff-only）
9. **不**写 report.md 在 PR merge 之前；report.md 由 post-merge 单独 follow-up commit 写到 same plan dir（按 `docs/POSTPR.md` 惯例）—— 但因为 issue 不被 agent close，report 也不需要 close-comment 段。

---

## 2. Expected outputs

可验收交付物清单（按 PR diff 与 GitHub 状态）：

### A. Files added / changed

| 路径 | 变更 | 验收锚点 |
|---|---|---|
| `docs/FIXEDFLOW.md` | + 1 节 `## Human-ready issues — never auto-close`（约 25-35 行） + reference 段 + 1 行 | grep `Human-ready issues — never auto-close` 命中一次；grep `禁止 agent` + `ready-for-human` + `gh issue close` 三锚点全命中；§与既有规则的关系 段出现 issue #338 anchor |
| `docs/HOW-TO-CLAIM-ISSUE.md` | + 1 行 cross-link，挂在 §`ready-for-human` 段末 | grep "Human-ready issues — never auto-close" 命中一次（cross-link），且只在该段附近 |
| `docs/plans/2026-05-12-issue-338/plan.md` | new | 文件存在；三段标题 grep 全命中 |
| `docs/plans/2026-05-12-issue-338/research.md` | new | 文件存在；§1-§8 grep 全命中 |
| `docs/plans/2026-05-12-issue-338/judge.md` | new | 文件存在；§V1 RUN / §V2 DUMP / §V3 READ 锚点全命中 |

### B. PR / merge status

- PR 创建：普通 PR（非 draft）；标题格式 `docs(issue-338): codify "ready-for-human never auto-close" rule`；body 引用 issue #338 但 **不写 `Closes #338`**（issue 自身规则禁止）。
- 本地 `/review` 输出 PASS（无 P1 / P2 finding，按 ADR-0007 authoritative gate）。
- branch protection probe：`gh api repos/libz-renlab-ai/TeamBrain/branches/main/protection` 返回 200 + `required_status_checks` / `required_pull_request_reviews` 字段齐全（按 `docs/BEFORE-MERGE.md` 前置门禁）。
- `gh pr merge <PR-N> --squash --delete-branch` 成功；merge commit 出现在 main 历史；feature branch 已删除。
- 本地 `git pull --ff-only` 成功；本地 main 含 squash commit。

### C. Issue status — explicit non-output

- **issue #338 状态 = OPEN（不变）**。任何把 issue close 的行为视为本 PR 验收失败。

---

## 3. How-to-eval — third-party judge harness

判决在 `docs/plans/2026-05-12-issue-338/judge.md`（独立 md playbook，由 MAIN agent 用 subagent / `claudefast -p` 三步分派 — 不是 fixed bash script）。三段铁律：

### V1 — RUN（固定工具集，不让被测代码自评）

主 agent 派 3 个独立 subagent（或起 3 个 `claudefast -p` probe），各自只读、各自只产 JSON：

- **R1 (semantic probe — Claude)** — `claudefast -p "If a Claude Code agent (running /fixed-flow-driver or in any session) sees a GitHub issue with the 'ready-for-human' label and believes it has been resolved by a recent PR, is it allowed to run 'gh issue close' on that issue? Answer YES/NO with citation to docs/FIXEDFLOW.md section name."` — 必须回 NO + 引用新 section 名。
- **R2 (semantic probe — Codex)** — `codex exec --skip-git-repo-check -s read-only "...same question..."` — cross-tool 验证。
- **R3 (diff structural probe)** — `git diff origin/main..HEAD -- docs/FIXEDFLOW.md docs/HOW-TO-CLAIM-ISSUE.md` 跑结构检查：(a) 新 section 标题 grep 命中且只在 FIXEDFLOW 出现一次；(b) HOW-TO-CLAIM-ISSUE 仅追加 cross-link，不改语义；(c) reference 段引 issue #338。

### V2 — DUMP（raw JSON 到 evidence dir）

`docs/plans/2026-05-12-issue-338/.judge/<run_id>/` 下落地：
- `R1.json`、`R1.stdout.txt`、`R1.stderr.txt`
- `R2.json`、`R2.stdout.txt`、`R2.stderr.txt`
- `R3.json`（含 added-lines / removed-lines / anchor-grep-hits）、`R3.diff`
- 总 `judge.json`：`{"R1": pass|fail, "R2": pass|fail, "R3": pass|fail, "verdict": "PASS"|"FAIL", "evidence_dir": "..."}`

### V3 — READ（第三只 LLM 当裁判，只读 raw JSON）

主 agent 不自评。开一只独立 subagent，feed `judge.json` + 三份 stdout：

> 你是 #338 docs PR 的裁判。只读 `judge.json` 与 evidence_dir 下的 stdout；不要去 grep 源 docs。判决规则：R1 + R2 必须都返回 NO，且 R3 三个结构检查必须全 hit。任一 fail → verdict = FAIL；全 pass → verdict = PASS。输出一行 `verdict: PASS|FAIL` + 简短 reasoning。

裁判输出 verdict 写回 `judge.json.verdict`，作为 PR comment 附在 PR 描述底部，供 reviewer 二次审视。

### Why not unit tests / pipeline tests

docs change 无 CLI / code 接口，按 user-level memory `feedback_verification_only_judge_harness.md`：unit / contract / pipeline tests 都是 "code grading itself inside trust boundary"，不算第三方判决。判决只走 md playbook + 独立 LLM 裁判。

---

## 4. Anchors

- 引用 doc / SoT：
  - `docs/PLAN-RESEARCH-REPORT.md` — 三段铁律来源
  - `docs/HOWTO-PLAN-PR.md` — PR 描述四段结构
  - `docs/POSTPR.md` — squash-merge + cleanup 三步
  - `docs/BEFORE-MERGE.md` — branch protection probe 前置
  - `docs/FIXEDFLOW.md` — 现 dispatch / refusal layer 上下文（insertion target）
  - `docs/HOW-TO-CLAIM-ISSUE.md` — `ready-for-human` label 语义现 SoT
  - `docs/POSTMORTEM.md` — hard rule #6（retroactive labeling ban）
  - ADR-0007 — `/review` skill 作为 authoritative review gate
- issue #338 — provenance anchor，**不被 close**。
