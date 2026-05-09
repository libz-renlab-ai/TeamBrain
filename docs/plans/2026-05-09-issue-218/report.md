```
   ____   _____  _____  _____  ____  _____
  |  _ \ |  ___||  _  ||  _  ||  _ \|_   _|
  | |_| || |_   | |_| || |_| || |_) | | |
  |  _ < |  _|  |  ___||  ___||  _ <  | |
  |_| \_\|_|    |_|    |_|    |_| \_\ |_|

  Issue #218 report — claim-to-merge skill + FIXEDFLOW init banner
  research → plan → annotate → implement → /review fix-loop → report
```

# Issue #218 report

## 实际交付

13 commits 在 `origin/feat/issue-218` 上，分两阶段：

### 阶段 1：原始实现（grill 评论 → 6 commits）

| commit | 说明 |
|--------|------|
| `a9007cb` | 加 `claim-to-merge` routing skill（`.claude` + `.codex` 双镜像） |
| `8530afc` | init.ts mirror step + FIXEDFLOW banner |
| `e6b0772` | 3 个 renderInitResult test case |
| `2e2b165` | research.md + judge.md（Boris workflow） |
| `f4f6af0` | 标注 pre-existing bin-stop.test.ts failure |
| `c4884d2` | byte-identical mirrors + scope judge metric |

### 阶段 2：`/review` fix-loop（10 findings → 7 commits）

`/review` 跑出 10 findings：0 个 checklist-CRITICAL（SQL/race/LLM-trust/shell/enum 全 N/A），4 个 specialist-domain CRITICAL（test 覆盖 + drift），6 个 INFORMATIONAL（test 与 maintainability polish）。按 [docs/PR-PLAN.md](../../PR-PLAN.md) 在同一 PR branch 全修：

| commit | finding | 说明 |
|--------|---------|------|
| `1b31c8d` | — | review-fix-plan.md（10 findings 与 commit 边界） |
| `e1b4122` | F9 (INFO 8/10) | 抽 `MIRROR_CLAIM_STEP` const，6 站 string literal → 1 个 const ref |
| `df94c48` | F1 (INFO 7/10) | mirror failure 非 fatal：`failStep` → `okStep` + `⚠️` warning detail；cosmetic 复制失败不再抹掉 ✅ + FIXEDFLOW banner |
| `2c4c9e4` | F10 (INFO 7/10) | 抽 `mirrorProjectSkillToUserLevel(skillId, stepKey, paths, dryRun)` 通用 helper |
| `5bf777c` | F8 (CRITICAL 8/10) | 抽 `appendFixedflowBanner` helper + exported `FIXEDFLOW_BANNER_DOC_PATHS` + path-exists unit test（doc 改名 CI 立挂） |
| `7c4516e` | F7 (CRITICAL 9/10) | `verify-gstack-skill-mirrors.sh` 加 `NON_GSTACK_MIRRORED_SKILLS` 数组 + cmp 循环；先于 pre-existing skill-set diff 跑，drift 立刻 fail |
| `5646153` | F2/F3/F4/F5/F6 (4 CRITICAL + 2 INFO) | 9 个新 test case + 1 处 happy-path 断言：mirror 函数 4 branch + target 条件 + banner edge case + stepGroups/stepLabel 渲染 + non-fatal failure 模拟 |

## 验证

| 工具 | 命令 | 结果 |
|------|------|------|
| vitest | `pnpm vitest run packages/cli/src/__tests__/init.test.ts` | **48 PASS**（baseline 38；新增 10） |
| typecheck | `pnpm typecheck` | 0 TS error |
| 镜像 byte-identity | `diff -q .claude/skills/claim-to-merge/SKILL.md .codex/skills/claim-to-merge/SKILL.md` | OK（exit 0） |
| 新加的 verifier 检查 | `bash scripts/verify-gstack-skill-mirrors.sh` 内 `NON_GSTACK_MIRRORED_SKILLS` 循环 | PASS（drift 模拟时正确触发） |

## 与原始 grill 计划的偏差

| 偏差 | 原计划 | 实际 | 理由 |
|------|--------|------|------|
| F1 行为 | grill 写 "通过 `failStep`" 但同段又说 "失败不 fatal" | 改用 `okStep` + `⚠️` warning detail | grill 字面 `failStep` 与 "失败不 fatal" 矛盾；现实现保留 grill 意图（init 继续 + banner 仍打）牺牲字面一致 |
| 新增 helper | grill 未要求 | 加 `mirrorProjectSkillToUserLevel` 通用 helper | 应 maintainability specialist F10 建议；为后续 per-skill mirror 留位 |
| Banner 提取 | grill 写 22 行 inline `lines.push` | 抽到 `appendFixedflowBanner` + `FIXEDFLOW_BANNER_DOC_PATHS` const | 应 maintainability specialist F8 建议；附 path-exists 测试防 doc rename drift |
| Verifier | 未要求 | 加 `NON_GSTACK_MIRRORED_SKILLS` 字节比对 | 应 maintainability specialist F7 建议；防 .claude/.codex 双镜像 silent drift |

## 不在范围内（按计划）

- 不修 `bin-stop.test.ts > calls analyze with transcript_path and commit=true`（pre-existing on `origin/main`，[research.md §「已知 pre-existing failure」](research.md) 详述）
- 不修 verifier 的 pre-existing skill-set diff（11 个 `.claude` skill 缺 `.codex` 镜像；独立清理 PR 处理）
- 不开任何 follow-up issue（[docs/PR-PLAN.md](../../PR-PLAN.md) 硬约束）

## 后续

`/review` PASS 之后按 [docs/POSTPR.md](../../POSTPR.md) 收尾：

1. `gh pr create`（普通 PR，**禁 `--draft`**）
2. `/review` 再跑一遍确认 PASS
3. `gh pr merge <N> --squash --delete-branch`（**仅 squash**）
4. `ExitWorktree action="remove"` （或 fallback `git worktree remove --force` + `git branch -D feat/issue-218` + `git push origin --delete feat/issue-218`）
5. 回父 checkout 跑 `git pull --ff-only`
