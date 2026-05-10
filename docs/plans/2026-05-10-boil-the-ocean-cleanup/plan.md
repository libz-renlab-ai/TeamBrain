```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   plan.md — boil-the-ocean-cleanup session                         │
   │   "ALL post-PR-#270 follow-ups in one PR"                          │
   │                                                                    │
   │   ① task description  ② expected outputs                           │
   │   ③ judge harness (md playbook, NOT scripts)                       │
   └─────────────────────────────────┬──────────────────────────────────┘
                                     │
   ┌─────────────────────────────────┴──────────────────────────────────┐
   │  A) Node 24 actions bump  ─── deadline 2026-09-16 (4 mo)           │
   │     all @v4 → @v5 in 9 active workflows; v5 = min Node 24 compat   │
   │                                                                    │
   │  B) Delete claude-{,code-review}.yml ── ADR-0007 makes /review     │
   │     authoritative; cloud action red-X is pure noise (option A)     │
   │                                                                    │
   │  C) J5 full-curve runner playbook ── md only (no scripts)          │
   │     driver agent cannot spawn user's CC windows; ship procedure    │
   │                                                                    │
   │  Out of scope: P0 MINIMAX token rotate (secret op, not PR-able)    │
   │                J5 actual data collection (manual user step)        │
   └────────────────────────────────────────────────────────────────────┘
```

---

# 1 Task description

## 做什么

把 PR #270 落地后用户列出的 4 项 follow-up 中**所有 PR-able 部分**装进一个 PR：

- **A**. 把 9 个 active workflow 里所有 `@v4` action 升到 `@v5`（Node 24 兼容下限）。覆盖 `actions/checkout`、`actions/setup-node`、`pnpm/action-setup`、`actions/upload-artifact`、`actions/deploy-pages`、`actions/upload-pages-artifact`（`@v3` → `@v5`）、`actions/github-script`（`@v7` → `@v8`，绕开 v9 ESM-only breaking）。
- **B**. 删除 `.github/workflows/claude-code-review.yml` 与 `.github/workflows/claude.yml`。两个文件都引用 `secrets.ANTHROPIC_API_KEY`（仓库该 secret 名下为空）+ `anthropics/claude-code-action@v1`（action 自身 `directory mismatch` bug），每个 PR 红 X 噪音。ADR-0007 已设定本地 `/review` skill 为权威 review gate，cloud Claude review 与之 redundant。用户已推荐 option A（直接删）。
- **C**. 在 `docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/` 新增 `runner.md` —— 一份 md playbook，描述用户后续手动开 1/2/3/4 Claude Code session 各采一次 `toohot --once` 的具体步骤，以及把 4 个 sample 合并写回 `loadavg-curve.json` 的 schema。同步把 `loadavg-curve.json.follow_up_for_full_curve` 字段指向 `runner.md`。

## 怎么做

1. 写本 plan.md / research.md / judge.md。
2. 先跑 FASTPROBE 三步（`-h` orient + parallel `-p` ≤ 8 + 必要时 stream-json audit）。
3. 实施 A → B → C 三段，每段独立 atomic commit。
4. 推到 `wip/boil-the-ocean-cleanup` 触发 `inner-loop.yml`（验证 action bump 不破坏 CI）。
5. CI 全绿后开普通 PR（**不**用 `--draft`）。
6. POSTPR 跑 `/review`，循环直到 PASS（ADR-0007 权威 gate）。
7. `gh pr merge <N> --squash --delete-branch`（squash-only，**禁** `--merge` / `--rebase`）。
8. `ExitWorktree action="remove"`（worktree 是 EnterWorktree 创建的，可直接 remove；如失败 fallback `keep` + 手动 `git worktree remove`）。

## 不做什么（anti-goals）

- **不**把 action 升到 latest major（`@v6` / `@v7` / `@v9`）。`@v5` 是 Node 24 兼容下限，surface area 最小；后续若 v5 EOL 再 bump 一次。
- **不**改 `ci.yml` / `inner-loop.yml` 等 workflow 的语义（job 名、trigger、env 块、step 顺序），**只**改 `uses:` 行的版本 pin。
- **不**碰 `MINIMAX_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` 等 secret（P0 token rotate 是 secret 操作，不在 PR 范围）。
- **不**采 J5 的 n=1/2/3/4 实际 loadavg 数据（driver agent 无法 spawn 用户 Mac 上的额外 Claude Code 窗口）。
- **不**新增 `scripts/*.sh` 充当 judge harness（项目硬规则：judge 必须是 md playbook）。
- **不**改任何 ADR 编号或 ADR 文件。

---

# 2 Expected outputs

## 文件改动清单

| 路径 | 操作 | 内容 |
|---|---|---|
| `.github/workflows/ci.yml` | 改 | `checkout @v4→@v5`、`pnpm/action-setup @v4→@v5`、`setup-node @v4→@v5` |
| `.github/workflows/claudefast-anchors.yml` | 改 | `checkout @v4→@v5`、`setup-node @v4→@v5` |
| `.github/workflows/inner-loop.yml` | 改 | `checkout @v4→@v5`、`pnpm/action-setup @v4→@v5`、`setup-node @v4→@v5` |
| `.github/workflows/install-canned-answer-check.yml` | 改 | `checkout @v4→@v5`、`setup-node @v4→@v5`、`github-script @v7→@v8` |
| `.github/workflows/install-verify.yml` | 改 | `checkout @v4→@v5`（×5）、`pnpm/action-setup @v4→@v5`、`setup-node @v4→@v5`、`upload-artifact @v4→@v5` |
| `.github/workflows/landing-deploy.yml` | 改 | `checkout @v4→@v5`、`setup-node @v4→@v5`、`pnpm/action-setup @v4→@v5`、`upload-pages-artifact @v3→@v5`、`deploy-pages @v4→@v5` |
| `.github/workflows/nightly-llm-smoke.yml` | 改 | `checkout @v4→@v5`、`pnpm/action-setup @v4→@v5`、`setup-node @v4→@v5` |
| `.github/workflows/release-branch.yml` | 改 | `checkout @v4→@v5`、`setup-node @v4→@v5`、`pnpm/action-setup @v4→@v5` |
| `.github/workflows/v5-fixture-replay.yml` | 改 | `checkout @v4→@v5`、`pnpm/action-setup @v4→@v5`、`setup-node @v4→@v5`、`github-script @v7→@v8` |
| `.github/workflows/claude.yml` | **删** | 整个文件移除 |
| `.github/workflows/claude-code-review.yml` | **删** | 整个文件移除 |
| `docs/plans/2026-05-10-boil-the-ocean-cleanup/plan.md` | 新增 | 本文件 |
| `docs/plans/2026-05-10-boil-the-ocean-cleanup/research.md` | 新增 | 上下文 dump（actions tag list、claude-action root cause、J5 limitations） |
| `docs/plans/2026-05-10-boil-the-ocean-cleanup/judge.md` | 新增 | 三段 md playbook §V1 RUN / §V2 DUMP / §V3 READ |
| `docs/plans/2026-05-10-boil-the-ocean-cleanup/report.md` | 新增（last） | merge 后写完成情况、偏差、follow-ups |
| `docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/runner.md` | 新增 | 4-point 手动采集 procedure |
| `docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/loadavg-curve.json` | 改 | `follow_up_for_full_curve` 指向 `runner.md` |

## 可验收 metric

- `grep -rE '@v[34]' .github/workflows/` 在 9 个保留 workflow 里**只能**剩对 `claude-code-action@v1`（已删）以外的零命中（命中即 fail）。
- `gh run list --workflow=inner-loop.yml --branch wip/boil-the-ocean-cleanup -L 1 --json conclusion --jq '.[0].conclusion'` 必须返回 `"success"`。
- `ls .github/workflows/claude*.yml 2>/dev/null` 必须无输出（两个文件都删）。
- `jq '.follow_up_for_full_curve' docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/loadavg-curve.json` 包含字符串 `runner.md`。
- PR 状态：`gh pr view <N> --json isDraft --jq '.isDraft'` 返回 `false`。
- `/review` 在最终 commit 上输出 PASS（无未解决 P1/P2）。

## PR artefacts

- 普通（非 draft）PR 开向 `main`。
- Commit message 形式 `chore(ci): bump GitHub Actions to Node 24-compatible v5` / `chore(ci): drop redundant claude-code-review workflows` / `docs(toohot): J5 full-curve runner playbook`。
- PR body 引用 plan.md / judge.md / research.md。

## Anti-outputs（必须不动）

- 任何 `*.test.ts`、任何 `packages/**` 源码。
- 任何 secret value（`MINIMAX_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN` 不动）。
- `inner-loop.yml` 的 `env:` 块、trigger、concurrency。
- 任何 ADR 文件。
- `docs/feature-verification.md` / `docs/POSTPR.md` / `docs/HOWTO-PLAN-PR.md` 文本。

---

# 3 How-to-verify (third-party judge harness)

完整 md playbook 在同目录 `judge.md`，**禁止固定 shell 脚本**。三个 probe：

- **V1**（Node 24 bump 不破坏 CI）— RUN: `git push origin wip/boil-the-ocean-cleanup`；DUMP: `gh run view --json status,conclusion,databaseId,url > judge/V1/result.json`；READ: `claudefast -p` 读 raw JSON 判 `conclusion == "success"`。
- **V2**（noise workflows 真删干净）— RUN: `ls .github/workflows/claude*.yml` + `find . -name 'claude-code-review.yml' -o -name 'claude.yml'`；DUMP: `judge/V2/result.json` 字段 `claude_yml_exists` / `claude_code_review_yml_exists` 全 false；READ: 第三方 `claudefast -p` 复读 raw JSON 判 PASS。
- **V3**（J5 runner playbook 形式与可读性）— RUN: `cat runner.md` + `jq` loadavg-curve.json；DUMP: `judge/V3/result.json` 字段 `runner_md_exists` / `runner_md_has_n_1_through_4_steps` / `loadavg_curve_follow_up_links_runner` 全 true；READ: `claudefast -p` 读 runner.md raw + json，判 PASS（procedure 完整且不依赖 `.sh`）。

每个 probe 输出落 `docs/plans/2026-05-10-boil-the-ocean-cleanup/judge/V<n>/result.json`，原始 stdout 落 `stdout.log`。终判 `claudefast -p` 综合三个 V 写 `judge/_overall/verdict.md`。

**Hard rule 重申**：实施 agent / plan 作者 / 被改 workflow 自身**不得**做裁判。只 `claudefast -p` 读 raw JSON + evidence 当裁判（`feedback_judge_harness_md_playbook.md` + `~/.claude/docs/rules/testing-judge-harness.md`）。

---

# 4 Claudefast probes（在 implement 之前）

per `docs/FASTPROBE.md` 三步：

1. **Orient**：`claudefast -h | head -80` 确认当前 flag list。
2. **Heavy + needs conclusion**（最多 8 parallel `-p`）：
   - "List all `uses:` lines in `.github/workflows/*.yml` with file:line; group by action name."（已被本会话直接 grep 替代）
   - "What is the latest Node 24-compatible major for actions/checkout?" → `gh api repos/actions/checkout/tags`（已查：v5 stable）
   - "Read `docs/HOWTO-PLAN-PR.md` and list 4 hard rules a plan must satisfy."（已读）
   - "Read previous 3 `/review` results on `.github/workflows/` PRs and list recurring P1/P2 themes."（待 POSTPR 时跑）
3. **Audit-grade**：跑 inner-loop CI 时不需要 stream-json（CI run 本身就是审计证据）；POSTPR `/review` 阶段如有引用证据，再加 `--output-format stream-json` 拉 transcript。

---

# 5 流程切片

```
plan.md ─▶ research.md ─▶ judge.md ─▶ implement (A,B,C) ─▶ wip push CI green
   │                                                              │
   └─────────────────────────▶ open PR ─▶ /review ─▶ PASS ─┐    │
                                                          │    │
                                                          ▼    │
                                            squash-merge ◀─────┘
                                                  │
                                                  ▼
                                         ExitWorktree remove
                                                  │
                                                  ▼
                                          report.md (final)
```

---

# 6 Pending decisions

无。option A（直接删 claude workflows）已由用户在原始消息中明确推荐；其余三段路径在 §1 / §2 / §3 完全确定。
