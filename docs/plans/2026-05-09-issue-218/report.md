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

`origin/feat/issue-218` 的完整 commit 列表以 git 为权威：

```bash
git log origin/main..origin/feat/issue-218 --oneline
```

分两个阶段。

### 阶段 1：原始实现（grill 评论）

按 [grill 评论](https://github.com/libz-renlab-ai/TeamBrain/issues/218#issuecomment-4412373351) 4 段计划实现：`claim-to-merge` routing skill（`.claude` + `.codex` 双镜像，byte-identical），`packages/cli/src/commands/init.ts` 加 `doMirrorClaimToMergeSkill` step + FIXEDFLOW banner，`packages/cli/src/__tests__/init.test.ts` 加 3 个 `renderInitResult` test case，Boris workflow 的 `research.md` + `judge.md`，并标注 [pre-existing bin-stop.test.ts failure](research.md)。

### 阶段 2：`/review` fix-loop（多轮迭代至 PASS）

`/review` iteration 1 出 10 findings：0 个 checklist-CRITICAL（SQL/race/LLM-trust/shell/enum 全 N/A），4 个 specialist-domain CRITICAL（test 覆盖 + drift），6 个 INFORMATIONAL（test 与 maintainability polish）。按 [docs/PR-PLAN.md](../../PR-PLAN.md) 在同一 PR branch 全修，分别覆盖：

| Finding | Fix |
|---------|------|
| F9 (INFO 8/10) | 抽 `MIRROR_CLAIM_STEP` const，6 站 string literal → 1 个 const ref |
| F1 (INFO 7/10) | mirror failure 非 fatal：`failStep` → `okStep` + `⚠️` warning detail；cosmetic 复制失败不再抹掉 ✅ + FIXEDFLOW banner |
| F10 (INFO 7/10) | 抽 `mirrorProjectSkillToUserLevel(skillId, stepKey, paths, dryRun)` 通用 helper |
| F8 (CRITICAL 8/10) | 抽 `appendFixedflowBanner` helper + exported `FIXEDFLOW_BANNER_DOC_PATHS` + path-exists unit test |
| F7 (CRITICAL 9/10) | `verify-gstack-skill-mirrors.sh` 加 `NON_GSTACK_MIRRORED_SKILLS` 字节比对 |
| F2/F3/F4/F5/F6 (4 CRITICAL + 2 INFO) | 10 个新 test case：mirror 函数 4 branch + target 条件 + banner edge case + stepGroups/stepLabel 渲染 + non-fatal failure 模拟 + path-exists |

iteration 2 自我重审 + 二轮 specialist 又发现 6 个 INFO findings：

| Finding | Fix |
|---------|------|
| F11 (INFO 7/10) | F11 自捕：banner 用 indexed access；加 banner-output-references-every-path test |
| F13 (INFO 7/10) | 抽 `CLAIM_TO_MERGE_SKILL_ID` 单一来源；MIRROR_CLAIM_STEP / 调用点 / banner 路径全部派生 |
| F12+F16 (INFO 7-8/10) | 加 labeled-assertion test 锁 [0]→"TL;DR routing"、[1..3]→"canonical"，防 const 重排序静默换标 |
| F15 (INFO 7/10) | `SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/` 守护，拒 `..`、`/`、空、大写、超长 |
| F17 (INFO 7/10) | `vi.restoreAllMocks()` afterEach safety net 防 spy 跨 test 泄漏 |
| F14 (INFO 8/10) | 这个文件本身：drop "13 commits" hardcoded count，改 git-authoritative |

## 验证

| 工具 | 命令 | 结果 |
|------|------|------|
| vitest | `pnpm vitest run packages/cli/src/__tests__/init.test.ts` | 全 PASS（baseline 38；最新 commit 后由 `git log` 与 `pnpm test` 共同回归） |
| typecheck | `pnpm typecheck` | 0 TS error |
| 镜像 byte-identity | `diff -q .claude/skills/claim-to-merge/SKILL.md .codex/skills/claim-to-merge/SKILL.md` | OK（exit 0） |
| 新加的 verifier 检查 | `bash scripts/verify-gstack-skill-mirrors.sh` 内 `NON_GSTACK_MIRRORED_SKILLS` 循环 | PASS（drift 模拟时正确触发） |

## 与原始 grill 计划的偏差

| 偏差 | 原计划 | 实际 | 理由 |
|------|--------|------|------|
| F1 行为 | grill 写 "通过 `failStep`" 但同段又说 "失败不 fatal" | 改用 `okStep` + `⚠️` warning detail | grill 字面 `failStep` 与 "失败不 fatal" 矛盾；现实现保留 grill 意图（init 继续 + banner 仍打）牺牲字面一致 |
| 新增 helper | grill 未要求 | 加 `mirrorProjectSkillToUserLevel` 通用 helper（导出，含 SKILL_ID_PATTERN 守护） | 应 maintainability specialist F10 + F15 建议；为后续 per-skill mirror 留位且防路径穿越 |
| Banner 提取 | grill 写 22 行 inline `lines.push` | 抽到 `appendFixedflowBanner` + `FIXEDFLOW_BANNER_DOC_PATHS` 派生自 `CLAIM_TO_MERGE_SKILL_ID` | 应 maintainability specialist F8 + F13 建议；附 path-exists / labeled-assertion 测试 |
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
