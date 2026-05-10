```text
            __        Research for issue #273
       ___ ( o)>      grill-with-docs round 2 → docs-anchored
       \   <_. )      mapping of /grill-me policy to TeamBrain
        `---'         primitives. 14 conflict points, 7 probes,
                      Option α (no FeatureIndex schema).
```

# Research: issue-273 — Agentic Coding Blind Verification Policy（docs-anchored 落地）

适用范围：本目录的 `plan.md`，对应 PR `feat/issue-273`。本文件是 **plan 旁边的硬事实清单**，不是说服稿。

---

## Hard facts

### 现有 in-repo SSOT（policy 必须接住，不替换）

| 主题 | 文件 | 关键事实 |
|------|------|----------|
| domain glossary | `docs/CONTEXT.md` (267 行；CLAUDE.md 例外条款豁免 200 行限制) | `Calibration subagent` 已定义 (L93-95)；`/review skill` 已定义 (L160-162)；`Self-discipline-via-matcher` 已定义 (L164-166)；`PR-PLAN` 已定义 (L172-174)；`Scenario fixture` 已定义 (L125-127)；`HookShell` (L111-113)；`Inner-loop testing` (L253-255) |
| FIXEDFLOW spec | `docs/FIXEDFLOW.md` | 5-step issue→merge 工作流；step 3-5 由 maintainer 在 Claude Code 会话**手动**跑 `/fixed-flow-driver`；禁止 watcher / 后台轮询 / 自动 dispatch |
| PR-PLAN 三段铁律 | `docs/PR-PLAN.md` (215 行) + `docs/PLAN-RESEARCH-REPORT.md` | 每轮 `/review` fix 必须更新 `docs/plans/<date>-pr-<n>-fix-plan.md`，三段：task / expected outputs / third-party judge harness |
| POSTPR loop | `docs/POSTPR.md` (183 行) + ADR-0007 | 终止 gate = 本地 `/review` skill PASS + CI green + 无 merge 冲突 |
| HOWTO-PLAN-PR | `docs/HOWTO-PLAN-PR.md` (293 行) | 4-section PR plan：plan / expected outputs / how-to-verify (md playbook) / claudefast probes |
| Stop hook 12-field | `docs/STOP-HOOKS.md` + `.claude/hooks/self-report-fused.sh` | 每条 assistant message 末尾 12-field `<self-report>` block 强制；超过 hook 时 `decision: block` + correction template |
| CLAUDEFAST | `docs/CLAUDEFAST.md` (230 行) | `claudefast -p` 是 canonical 验证 probe；token 永远不暴露；wrapper 走 MiniMax-Anthropic-compatible profile |
| feature-verification gate | `docs/feature-verification.md` (182 行) | 任何 feature/fix 交付前必须做 `--help` canonical JSON 锚点 + 可选 tmux interactive `/export` |
| driver skill | `.claude/skills/fixed-flow-driver/SKILL.md` (138 行) | 当前没有 Verification subagent 段；本 PR 在 step 4 `/review` fix-loop 之后插入新 subsection |

### 关键 ADR（policy 必须 citatation 而非推翻）

| ADR | 状态 | 与本 issue 关系 |
|-----|------|------------------|
| ADR-0004 (`docs/adr/0004-calibration-via-claude-code-subagent.md`) | accepted | TeamBrain core LLM-free；所有 LLM 判断由 Claude Code Agent tool subagent 派生。Verification subagent 走同一个 primitive，不在 `packages/core/` 落地 |
| ADR-0007 (`docs/adr/0007-local-review-skill-as-review-gate.md`) | accepted | `/review` skill = POSTPR loop 唯一权威 gate；不允许 canned-answer / hook anchor 替代 |
| ADR-0008 (`docs/adr/0008-hookshell-imperative-shell.md`) | accepted | 8 hook channel 共享 HookShell；`packages/core/` 走 FCIS（禁 import `fs` / `node:child_process`） |
| ADR-0009 (`docs/adr/0009-attribution-delivery-as-metadata.md`) | accepted | user-visible 副作用 → `bus.emit({...})`；禁止 `process.stderr.write` |
| ADR-0010 (`docs/adr/0010-bottom-level-fixtures.md`) | accepted | scenario fixture 住 `tests/fixtures/scenarios/<feature-slug>--<scenario-name>/`，**就在主 repo**；α-strict 三层 replay tier (a/b/c) |
| ADR-0013 (`docs/adr/0013-inner-loop-on-ci.md`) | accepted (2026-05-10) | full-suite `pnpm test` **本地禁跑**；推到 `wip/**` 触发 `.github/workflows/inner-loop.yml`；单文件 targeted vitest 仍允许本地 |

### 14 个 grill resolution（按 grill comment §1-14）

| § | 争点 | docs-anchored resolution |
|---|------|--------------------------|
| 1 | policy 禁止主 agent 写测试 | 重定义为「contract / fixture / regression（in-repo allowed，TDD red-green）」vs「self-witness ad-hoc（forbidden in repo，落 `/tmp` 或 `.fixedflow/`）」二分；前者**应当**写，后者禁 |
| 2 | "blind verification subagent" 名字与 ADR-0004 撞 | 更名 `Verification subagent`；与 `Calibration subagent`、`/review skill` 同源（host-agent 进程内 Claude Code Agent-tool 派生 subagent）但职责不同 |
| 3 | `claude -p --model haiku` 命令绕过 claudefast 约定 | 改为 `claudefast -p` 走 wrapper；通过判据三段（old API / new API / deprecation warning）保留 |
| 4 | `feature index` 12-字段 schema | **Option α**（推荐）：fold into existing `docs/features/INDEX.md` + M4-B BM25+dense-RRF matcher；不引入新 schema；ADR-0014 reserved for future Option β |
| 5 | "external regression suite" 不进主 repo | 与 ADR-0010 冲突；改 fixture 进主 repo `tests/fixtures/scenarios/` 三层 replay tier |
| 6 | merge gate 12 项无 `/review` skill | 在头部插入 `0. /review skill PASS（ADR-0007 权威 gate；前置）` |
| 7 | squash-only merge 缺席 | 写死 `gh pr merge <N> --squash --delete-branch`；禁 `--merge` / `--rebase` / `--draft` |
| 8 | PR-PLAN 三段铁律缺席 | 引用 `docs/PR-PLAN.md`；每轮 fix 必写 `docs/plans/<date>-pr-<n>-fix-plan.md`；禁 follow-up issue / PR |
| 9 | "无限循环" + ADR-0013 单轮 2-5min CI | 50-iter cap，超即加 `needs-human` label 退出；full-suite 推 `wip/**`；本地仅 single-file targeted vitest |
| 10 | Verification subagent 物理位置 | 落在 `.claude/skills/fixed-flow-driver/SKILL.md` 内部 spawn；不进 `packages/core/`，不进 `packages/cli/`；不直接 `bus.emit` |
| 11 | Stop hook 12-field self-report 与 policy §17.4 audit timeline 关系 | 两层独立；policy §17 头部 disclaimer 写明 `self-report-fused.sh` 12-field 不被本节豁免 |
| 12 | policy 角色 → TeamBrain primitive 映射 | 加映射表：主 coding agent = `/fixed-flow-driver` 实例；Verification subagent = driver 内 subagent；Calibration subagent = ADR-0004；`/review skill` = gstack user-level |
| 13 | 三类 subagent 三联表 | `Verification` / `/review` / `Calibration` 三联表 进 `docs/CONTEXT.md` 新 §「Subagents in the verification stack」 |
| 14 | issue #273 scope 冻结 | 三件事：新建 `docs/AGENTIC-CODING-POLICY.md`（≤200 行）+ 增补 `docs/CONTEXT.md` + 增补 driver SKILL.md；不做 feature_index、PostToolUse hook、`pnpm teamagent verify-subagent`、public API 弃用周期 |

### 7 个验收 probe（grill comment 末尾）

```bash
# probe 1: AGENTIC-CODING-POLICY.md 存在且 ≤200 行
test -f docs/AGENTIC-CODING-POLICY.md && [ "$(wc -l < docs/AGENTIC-CODING-POLICY.md)" -le 200 ]

# probe 2: 不引入 feature_index schema
! grep -rn "interface FeatureIndex" packages/

# probe 3: Verification subagent 写在 driver skill，不在 packages/core/
grep -q "Verification subagent" .claude/skills/fixed-flow-driver/SKILL.md
! grep -rn "Verification subagent" packages/core/

# probe 4: claudefast 语义 probe 命中本 policy
claudefast -p "TeamBrain 的 verification subagent 与 /review skill 与 calibration subagent 各做什么"

# probe 5: ADR-0007 / ADR-0010 / ADR-0013 引用未漂移
grep -q "ADR-0007" docs/AGENTIC-CODING-POLICY.md
grep -q "tests/fixtures/scenarios" docs/AGENTIC-CODING-POLICY.md
grep -q "wip/\*\*" docs/AGENTIC-CODING-POLICY.md

# probe 6: squash-only 与 PR-PLAN 强制条款被 policy 复述
grep -q "gh pr merge.*--squash" docs/AGENTIC-CODING-POLICY.md
grep -q "docs/plans/.*-pr-.*-fix-plan.md" docs/AGENTIC-CODING-POLICY.md

# probe 7: 12-field <self-report> Stop hook 契约未被 policy 豁免
grep -q "self-report-fused.sh" docs/AGENTIC-CODING-POLICY.md
```

---

## Constraints / 不可改的边界

- `docs/CONTEXT.md` 增补：在 `### Calibration & tier` 节后追加 `### Subagents in the verification stack` 节；既有词条 **不动**。
- `docs/AGENTIC-CODING-POLICY.md` ≤200 行（CLAUDE.md inside-project 白名单约束）。
- `.claude/skills/fixed-flow-driver/SKILL.md` 在 step 4 「/review loop」与 step 5 「Open PR」之间插入新 sub-section；**不动** step 0-3, 5-8 的语义。
- 不动 ADR-0007 / ADR-0010 / ADR-0013（policy 引用即可，不重写决策）。
- 不动 `.claude/hooks/self-report-fused.sh`（policy 仅引用、不豁免 12-field）。
- 不引入 `packages/core/src/feature-index/`、`packages/cli/src/commands/verify-subagent.ts`、PostToolUse-spawn-Verification-subagent hook（全部 out-of-scope per §14）。
- 文件 ASCII art 遵循 AGENTS.md 规则 10：服务于阅读理解，优先表现流程或文档定位，而不是装饰。

---

## 引用 / 外部资料

- 上一条 `/grill-me` policy 评论 (issue #273 comment id `4415165285`, 2026-05-10T11:25:26Z) — 政策原意，append-only 保留。
- 本条 `/grill-with-docs` 评论 (issue #273 comment id `4415335628`, 2026-05-10T12:55:13Z) — 实施前对齐结论，逐点 docs-anchored resolution。
- 用户级规则：`~/.claude/CLAUDE.md` plan.md 三段铁律 / DUCKPLAN 四段铁律。
- 父级 `/Users/m1/projects/AGENTS.md` 规则 6/7/8/9/10/11/12/13 — research / plan / report / ASCII art / Boris workflow。
