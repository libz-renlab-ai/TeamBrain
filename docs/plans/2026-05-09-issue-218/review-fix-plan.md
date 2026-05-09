```
   ____   _____  __  __  ____  _____  _    _    _____  _   _
  |  _ \ |  ___|/ /  | || ___||  ___|| |  | |  |  ___|| | | |
  | |_| || |_  / /   | || |_  | |_   | |  | |  | |_   | | | |
  |  _ <|  _| / /    | || ___||  _|  | |__| |  |  _|  | |_| |
  |_| \_|_|  /_/     |_||_____| _|    \____/   |_|     \___/

  Issue #218 review-fix plan — 10 findings → 6 atomic commits → green
  PR-PLAN protocol: same branch, no follow-up issue, /review fix-loop
```

# Issue #218 review fix plan

`/review` 在 `feat/issue-218` (HEAD `c4884d2`) 上跑出 10 findings：0 个 checklist-CRITICAL（SQL/race/LLM-trust/shell/enum 全 N/A），4 个 specialist-domain CRITICAL（test 覆盖 + drift），6 个 INFORMATIONAL（test 与 maintainability polish）。本计划按 [docs/PR-PLAN.md](../../PR-PLAN.md) 在**同一 PR branch** 修复，不开 follow-up issue。

## Findings → 修复顺序（最小 churn 在前）

| 顺序 | Commit | Finding | 文件 | 性质 |
|------|--------|---------|------|------|
| C1 | `refactor(issue-218): extract MIRROR_CLAIM_STEP const` | F9 (INFO 8/10) | init.ts | 6 处 string literal → 1 个 const，typo 一律编译期挂 |
| C2 | `fix(issue-218): mirror failure non-fatal so banner still prints` | F1 (INFO 7/10) | init.ts | failStep → okStep + warning detail；cosmetic copy 失败不再抹掉 ✅ + FIXEDFLOW banner |
| C3 | `refactor(issue-218): factor mirrorProjectSkillToUserLevel helper` | F10 (INFO 7/10) | init.ts | doMirrorClaimToMergeSkill 调用通用 helper；为后续 per-skill mirror 留位 |
| C4 | `refactor(issue-218): extract FIXEDFLOW_BANNER + path-exists test` | F8 (CRITICAL 8/10) | init.ts + init.test.ts | 22 行 lines.push → const + appendFixedflowBanner helper；新加 unit test 让 banner 提到的所有 doc 路径在 fs.existsSync 下都存在，将来 doc 改名 CI 立挂 |
| C5 | `chore(issue-218): mirror verifier covers claim-to-merge` | F7 (CRITICAL 9/10) | scripts/verify-gstack-skill-mirrors.sh | 把 .claude/skills 与 .codex/skills 之下所有 non-gstack project skill 做 byte cmp，drift 立刻 fail |
| C6 | `test(issue-218): F2-F6 cover mirror function + branch + render contracts` | F2/F3/F4/F5/F6 (4 CRITICAL + 2 INFO) | init.test.ts | 加 4 branch test (source-missing / dryRun / success / fs failure) + target conditional + banner edge cases (mirror failed/skipped under ok=true) + stepGroups+stepLabel render assert + seed source in mkTmp 让 happy path 走 success branch |
| 末尾 | regression | — | — | `pnpm vitest run packages/cli/src/__tests__/init.test.ts` 全绿；`pnpm typecheck` 0 错；`bash scripts/verify-gstack-skill-mirrors.sh` exit 0 |

## 决定记录

- **F1 是行为变更**（grill 字面写 failStep；本 PR 改成 okStep+warning detail）。Rationale：grill 同段又写「失败不 fatal」，failStep 会让 result.ok=false 抹掉本 step 想宣传的 banner，与 grill 意图矛盾。
- **F8 + F10** 抽函数；接口对外不变，纯内部重构。
- **F9** 加 const，用 `as const` 保持精确字面量类型。
- **F7** verifier 扩成「检查 .claude/skills 与 .codex/skills 同名 project skill 字节相等」（不再 hardcode skill 名单）。同时保留 gstack-only skill 的兼容性（gstack-only 跳过镜像比对）。

## 不在范围内

- 不修 `bin-stop.test.ts > calls analyze with transcript_path and commit=true`（已在 [research.md](research.md) §「已知 pre-existing failure」记录），属于 worktree 嵌套 walk-up 的 pre-existing 问题，不在 #218 PR scope。
- 不开 follow-up issue（[docs/PR-PLAN.md](../../PR-PLAN.md) 硬约束）。

## 验证

修复完后跑：

```bash
cd /Users/m1/projects/TeamBrain/.codex/worktrees/issue-218
pnpm vitest run packages/cli/src/__tests__/init.test.ts   # 必须全绿；预期 38 + 新增 ~12 = ~50 tests
pnpm typecheck                                              # 0 TS error
bash scripts/verify-gstack-skill-mirrors.sh                 # exit 0；新加的 claim-to-merge cmp 必须 OK
```

完成后更新 [report.md](report.md)（Boris workflow 收尾）记录实际 commits 与差异。
