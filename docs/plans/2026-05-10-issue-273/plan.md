```text
            __        Plan: issue-273
       ___ ( o)>      Land docs-anchored agentic-coding
       \   <_. )      governance into 3 files (policy +
        `---'         glossary + driver skill). Option α.
                      No FeatureIndex schema in this PR.
```

# Plan: issue-273 — Agentic Coding Blind Verification Policy（in-repo SSOT）

> **本 plan 严格遵守 `docs/PLAN-RESEARCH-REPORT.md` 三段铁律。** 所有上下文在 `research.md`（同目录），所有 judge harness 在 `judge.md`（同目录）。

---

## Task description

把 issue #273 的 grill-with-docs 第 14 节 scope-binding（三件事）落到 `feat/issue-273` 分支：

1. **新建 `docs/AGENTIC-CODING-POLICY.md`（≤200 行）**：in-repo SSOT，把 grill comment §1-13 的 14 个 docs-anchored resolution 一次性写下；policy 角色 → TeamBrain primitive 映射表（grill §12）必含；squash-only merge / `wip/**` push / PR-PLAN 三段铁律 / `/review` skill PASS gate / 12-field `<self-report>` Stop hook 引用全部进文。**Option α**：不引入 `feature_index` schema、不引入 `interface FeatureIndex`；feature lookup 走既有 `docs/features/INDEX.md` + M4-B BM25+dense-RRF matcher + `claudefast -p` 探针。
2. **增补 `docs/CONTEXT.md`**：在 `### Calibration & tier` 节末尾追加 `### Subagents in the verification stack` 节（grill §13 三联表：`Verification subagent` / `/review skill` / `Calibration subagent`，列「调用方 / 输入 / 输出 / 调用时机」四列）；既有词条不动。
3. **增补 `.claude/skills/fixed-flow-driver/SKILL.md`**：在 procedure step 4 `/review loop` 之内（fix commit 之后、`/review` 之前）插入新子段「Verification subagent (per `docs/AGENTIC-CODING-POLICY.md`)」，写明每轮 fix 后 spawn Verification subagent 跑独立攻击 → 结果写 `docs/plans/<date>-pr-<n>-fix-plan.md` 的 §judge harness 段；不动 step 0-3 与 5-8 语义。

**不做**（per grill §14 out-of-scope）：

- `packages/core/src/feature-index/` 模块
- `pnpm teamagent verify-subagent` CLI 命令
- Verification subagent PostToolUse-hook 自动触发
- public API 弃用周期具体落地策略
- 改写 ADR-0007 / ADR-0010 / ADR-0013（policy 仅引用）
- 改写 `.claude/hooks/self-report-fused.sh`（policy 仅引用 12-field）

---

## Expected outputs

- [ ] `docs/AGENTIC-CODING-POLICY.md` 存在，行数 ≤200，包含以下锚点（probe 1+5+6+7）：
  - [ ] 提到 `Verification subagent`（≥1 次）
  - [ ] 提到 `/review skill` 与 `Calibration subagent`
  - [ ] 提到 `ADR-0007`、`ADR-0010`、`ADR-0013`（≥1 次各）
  - [ ] 提到 `tests/fixtures/scenarios`（ADR-0010 fixture 路径）
  - [ ] 提到 `wip/**`（ADR-0013 inner-loop CI 触发分支）
  - [ ] 提到 `gh pr merge` 与 `--squash`（squash-only merge 强制条款）
  - [ ] 提到 `docs/plans/...-pr-...-fix-plan.md`（PR-PLAN 三段铁律强制路径）
  - [ ] 提到 `self-report-fused.sh`（12-field Stop hook 不被 policy 豁免）
- [ ] `docs/CONTEXT.md` 新 `### Subagents in the verification stack` 节存在；包含三联表（`Verification` / `/review` / `Calibration`）；既有词条 git diff 显示 0 行删除 / 0 行修改。
- [ ] `.claude/skills/fixed-flow-driver/SKILL.md` 新子段「Verification subagent」存在；位于原 step 4 `/review loop` 之内；不动 step 0-3, 5-8。
- [ ] `packages/` 全树 grep `"interface FeatureIndex"` 命中 0 次（probe 2）。
- [ ] `packages/core/` 全树 grep `"Verification subagent"` 命中 0 次（probe 3 后半）。
- [ ] PR `feat/issue-273` 普通 PR（**非** `--draft`）；squash-merged via `gh pr merge <N> --squash`；issue #273 关闭并贴 `✅ FIXEDFLOW: merged via PR #<N>` 注释。
- [ ] `docs/plans/2026-05-10-issue-273/{research.md, plan.md, judge.md, report.md}` 四件齐全；report 在 merge 后写。

---

## How to eval (3rd-party judge harness)

- **Harness**：`docs/plans/2026-05-10-issue-273/judge.md` — md playbook（per `docs/PLAN-RESEARCH-REPORT.md` § 1 + `docs/HOWTO-PLAN-PR.md` § 3b；**禁固定 bash 脚本**）。
- **§V1 RUN**：MAIN agent 通过 subagent 或 `claudefast -p` 探针调度，跑以下固定工具集合：
  - probe 1: `test -f docs/AGENTIC-CODING-POLICY.md && wc -l docs/AGENTIC-CODING-POLICY.md`
  - probe 2: `! grep -rn "interface FeatureIndex" packages/`
  - probe 3: `grep -q "Verification subagent" .claude/skills/fixed-flow-driver/SKILL.md && ! grep -rn "Verification subagent" packages/core/`
  - probe 4: `claudefast -p "TeamBrain 的 verification subagent 与 /review skill 与 calibration subagent 各做什么"` （semantic probe；期望 organic 命中三联表分工）
  - probe 5: `grep -q "ADR-0007" docs/AGENTIC-CODING-POLICY.md && grep -q "tests/fixtures/scenarios" docs/AGENTIC-CODING-POLICY.md && grep -q "wip/\*\*" docs/AGENTIC-CODING-POLICY.md`
  - probe 6: `grep -q "gh pr merge.*--squash" docs/AGENTIC-CODING-POLICY.md && grep -q "docs/plans/.*-pr-.*-fix-plan.md" docs/AGENTIC-CODING-POLICY.md`
  - probe 7: `grep -q "self-report-fused.sh" docs/AGENTIC-CODING-POLICY.md`
  - probe 8（额外）：`git diff origin/main -- docs/CONTEXT.md` 不能删任何既有词条
  - probe 9（额外）：`/review` skill PASS（ADR-0007 权威 gate）

- **§V2 DUMP**：每条 probe 写 canonical JSON 到 `.judge/<run_id>/probe-<N>.json`，含 `{tool, exit_code, metrics, evidence_dir, stdout_path}`；最终 aggregate 到 `.judge/<run_id>/judge.json`。
- **§V3 READ**：另一只 `claudefast -p` **只读** raw JSON + 必要 evidence，输出 `pass | fail | uncertain` + 下一步。**不允许** plan 作者、driver 自身、被测代码当裁判。
- 终止 gate（按 ADR-0007）：本地 `/review` skill PASS = POSTPR loop 唯一权威终止 gate；CI green + 无 merge 冲突。

---

## Steps（执行顺序）

1. ✅ 创建 worktree `.codex/worktrees/issue-273` + branch `feat/issue-273`（已完成）
2. ✅ 写 `research.md` + `plan.md`（本文件）
3. 写 `judge.md`（md playbook，定义 §V1 RUN / §V2 DUMP / §V3 READ）
4. 写 `docs/AGENTIC-CODING-POLICY.md`（≤200 行，atomic commit）
5. 增补 `docs/CONTEXT.md`（atomic commit）
6. 增补 `.claude/skills/fixed-flow-driver/SKILL.md`（atomic commit）
7. 跑 `/review` 循环至 PASS（每轮失败写 `docs/plans/2026-05-10-issue-273-iter-K-fix-plan.md`，PR 开后 rename 为 `docs/plans/2026-05-10-pr-N-fix-plan.md`）
8. 推 branch；`gh pr create`（非 draft，4-section body）
9. `gh pr merge <N> --squash --auto`（禁 `--merge` / `--rebase`）
10. cleanup worktree + 写 `report.md` + 关 issue

## Risks

- **policy ≤200 行** 的 hard cap — grill 包含 14 个 resolution + 7 个 probe + 12 个引用，可能溢出；预案：将 7 probe 复刻到 `judge.md`，policy 内只保留 prose+表格摘要。
- **既有 CONTEXT.md 词条被误改** — 用 `Edit` tool insert-only，先 grep 校 anchor。
- **driver SKILL.md 步骤号串位** — 在 step 4 内部加 `### 4.5 Verification subagent` 子标题，不重排原 step 4 的 6 个子项。
- **/review 循环超 50 次** — 加 `needs-human` label 退出（per grill §9）。

## Owner

`/fixed-flow-driver` driver instance（本会话）。
