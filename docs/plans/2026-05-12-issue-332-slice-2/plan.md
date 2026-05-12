```text
   ┌─────────────────────────────────────────────────────────────────────┐
   │  issue #332 slice 2a — Mock LLM responder + L4 fs-copy pipeline     │
   │                                                                     │
   │   A's KB ──m5-share──► .teamagent/team/A/<rid>.json                 │
   │              │                                                      │
   │              ▼                                                      │
   │       ┌─────────────┐                                               │
   │       │ FsCopyBridge│  (slice 1 utility)                            │
   │       └─────┬───────┘                                               │
   │             │                                                       │
   │             ▼                                                       │
   │   B's project/.teamagent/team/A/<rid>.json                          │
   │              │                                                      │
   │              ▼                                                      │
   │       ┌─────────────────────┐                                       │
   │       │ MockLlmResponder    │  ◄── NEW in slice 2a                  │
   │       │ (keyword-rule match)│                                       │
   │       └─────┬───────────────┘                                       │
   │             │                                                       │
   │             ▼                                                       │
   │   {block: true|false, citations: [rule_id...]}  ← observable        │
   └─────────────────────────────────────────────────────────────────────┘
```

# Plan — issue #332 slice 2a: Mock LLM responder + L4 fs-copy pipeline test

> **Parent**: issue [#332](https://github.com/libz-renlab-ai/TeamBrain/issues/332) — Test team-rule propagation between two users (A → B)
> **Grill record**: [`docs/adr/0014/332.md`](../../adr/0014/332.md)
> **Predecessor**: PR [#356](https://github.com/libz-renlab-ai/TeamBrain/pull/356) (slice 1 utilities: `setupDualHomes` / `setupBareGitBridge` / `createFsCopyBridge`)

## Task description

实现 mock LLM responder（keyword-rule signature, ADR open question #4 → 选 keyword-rule）
落到 `@teamagent/adapters` 包（ADR open question #2 → 选 adapters，避免新建 `@teamagent/testing` 包带来的 build graph 调整），
并写一条 **avoidance-only L4 端到端 integration test**：

- A 端 `.teamagent/team/A/<rule_id>.json` 直接构造一条 `TeamRuleFile` avoidance rule（`content` 字段含某 keyword）
- 调用 slice 1 的 `createFsCopyBridge()` 把 A 的规则 copy 到 B 的 project root（`projectB/.teamagent/team/A/<rule_id>.json`）
- 调用 mock LLM responder 模拟 B 端 PreToolUse：
  - rule-OFF 控制组：构造空 B（不 copy）；responder 不阻断
  - rule-ON 实验组：copy 完成后；responder 命中 keyword 阻断、返回 citations 含 `rule_id`
- 用 vitest 断言 rule-ON 与 rule-OFF 的 observable（`block: boolean`, `citations: string[]`）实际不同

**只做 avoidance（不做 practice / learning）**，理由是 avoidance 是 binary observable、最易在 hermetic 测试里证明 "B 的行为真的因为 A 的规则变了"。practice / learning 的 inject / hit_count observable 留 slice 2b。

**只走 fs-copy（不走 bare-git）**，理由是 fs-copy 快、与 ADR 决策 #3 "双轨：fs copy 快道 + bare git 慢道" 中的快道一致；慢道（bare git push/pull）的 integration test 已经在 slice 1 `bare-git-bridge.test.ts` 覆盖了 bridge 本身，slice 2b 再补完整 transit pipeline。

**不做**：
- 3-scenario 全套（avoidance + practice + learning）—— slice 2b
- `pnpm teamagent fixture replay` 扩展或 sibling 命令 —— slice 2b（ADR open question #1）
- Nightly cold-path（真 `claudefast` + `scipy.stats.ttest_rel` ablation） —— slice 3
- Budget guard `TEAMAGENT_NIGHTLY_MAX_USD` —— slice 3
- Windows runner 验证 —— slice 2b（已在 slice 1 `bare-git-bridge.ts` 加了 CRLF + path 处理，slice 2a fs-copy 路径只用 `path.join`、`fs.copyFile`，跨平台已 inherent safe）

## Expected outputs

- [ ] `packages/adapters/src/m5/testing/mock-llm-responder.ts`（新增）
  - 导出 `MockLlmResponder` interface + `createMockLlmResponder()` factory
  - 输入：`{ projectRoot: string, toolName: string, toolInput: Record<string, unknown> }`
  - 输出：`Promise<{ block: boolean, citations: string[] }>`
  - 行为：扫 `projectRoot/.teamagent/team/*/*.json`，对每条 alive rule 把 `content` 字段当 keyword，
    若 keyword 出现在 `JSON.stringify(toolInput)` 中（case-insensitive substring）→ block 且 push rule_id 进 citations；
    所有规则不命中 → `{block: false, citations: []}`
- [ ] `packages/adapters/src/m5/__tests__/mock-llm-responder.test.ts`（新增）
  - 6 个 unit test cases：
    (1) empty project → `{block:false, citations:[]}`
    (2) one matching avoidance rule → `block:true`, citations 含 rule_id
    (3) one non-matching rule → `{block:false, citations:[]}`
    (4) tombstone rule（`deleted:true`）→ 不命中
    (5) two authors each with matching rule → citations 含两个 rule_id（顺序确定）
    (6) malformed JSON → 跳过、不抛、统计跳过数（通过 `onSkip` 回调或返回 `skipped: number`）
- [ ] `packages/adapters/src/m5/__tests__/l4-fs-copy-pipeline.test.ts`（新增）
  - 1 个 end-to-end integration test：
    `setupDualHomes` → A 端 `writeFile` 一条 avoidance rule → `createFsCopyBridge().copyTeamRules(A→B)` →
    rule-OFF 跑（用未 copy 的 fresh B）responder → `block:false` →
    rule-ON 跑（用刚 copy 完的 B）responder → `block:true && citations.length>0` →
    `cleanup()` 幂等执行 →
    断言 `block` 字段在 rule-OFF/ON 两态 strictly different
- [ ] `packages/adapters/src/m5/testing/index.ts` 加一行 `export * from "./mock-llm-responder.js";`
- [ ] `docs/plans/2026-05-12-issue-332-slice-2/{plan,research,judge,report}.md`（本目录四件套；report.md 在 `/review` PASS 之后定稿）
- [ ] 普通 PR 开向 `main`，title `feat(m5): slice 2a — mock LLM responder + L4 fs-copy pipeline (issue #332)`
- [ ] commit message 全部走 `feat(m5): / test(m5): / docs(m5):` 原子格式（CLAUDE.md "make atomic commits everything make file edits"）

**Anti-goals**（reviewer 拿来校验「diff 别越界」）：
- ❌ 不动 `packages/cli/src/commands/fixture-replay.ts`、`m5-share.ts`、`m5-sync.ts`、`packages/core/`、`packages/types/`
- ❌ 不新建 npm package（不动 `pnpm-workspace.yaml`、不动 `package.json` 的 `workspaces` 字段）
- ❌ 不动 root `fixtures/scenarios/index.ts`（slice 2b 才扩 scenarios）
- ❌ 不动 GitHub Actions workflow（slice 3 才加 nightly）
- ❌ 不引入新 deps（不改 `package.json` 的 `dependencies`/`devDependencies`）；只用 Node stdlib + 已有 `@teamagent/types`
- ❌ 不写 `CHANGELOG.md`（slice 集合在 epic merge 时统一更新）

## How to eval (third-party judge harness)

**Hard rule reminder**: third-party judge harness forbidden fixed scripts; MUST use md playbook.

- Harness 位置：[`docs/plans/2026-05-12-issue-332-slice-2/judge.md`](./judge.md)（同目录 md playbook，**不是** `scripts/*.sh`）
- §V1 RUN —— MAIN agent 派 3 个 `claudefast -p` 探针 + 2 个 vitest targeted runs，把每个工具的 stdout/stderr 落 `.judge/<run_id>/evidence/<probe>.log`
- §V2 DUMP —— 写 `.judge/<run_id>/judge.json`：含 `{tool, exit_code, metrics, evidence_dir, stdout_path}`，schema 定义在 `judge.md` §V2
- §V3 READ —— 单独一只 `claudefast -p` 只读 `judge.json` + 必要 evidence，输出 `pass | fail | uncertain` + 下一步建议
- Verdict gate：§V3 必须 `pass`（任何 `fail` 立刻回到 implementation 修；任何 `uncertain` 让 main agent 复审 evidence 再判）

PR 作者 / 执行 agent / 被测代码（mock responder / pipeline test）**均不得当裁判**——这是 `~/.claude/docs/rules/testing-judge-harness.md` 与 user-memory `feedback_judge_harness_md_playbook.md` 与 `feedback_verification_only_judge_harness.md` 三条 user-level 规则的硬约束。

### 项目级 feature-verification gate（也必须过）

`docs/feature-verification.md` 定义的两条路径：
- **路径 1（CLI canonical JSON）**：本 slice 不引入新 CLI command，不适用 `--help` canonical JSON gate（mock responder 是 library API，不是 CLI surface）。
- **路径 2（tmux `/export`）**：在 `judge.md` §V1 里跑一次 `claudefast` interactive session 并 `/export <path>`，把 export 文件作为 evidence 挂到 PR description。

## Steps（高层）

1. 写 `mock-llm-responder.ts` + unit test → 跑 `pnpm vitest run packages/adapters/src/m5/__tests__/mock-llm-responder.test.ts` 绿
2. 写 `l4-fs-copy-pipeline.test.ts` → 跑 `pnpm vitest run packages/adapters/src/m5/__tests__/l4-fs-copy-pipeline.test.ts` 绿
3. 跑 `pnpm typecheck` 全绿
4. 跑 `pnpm vitest run packages/adapters/` 全绿（不破坏 slice 1 + 其它 adapter 测试）
5. 走 `judge.md` §V1-V3 harness 拿 verdict `pass`
6. atomic commits 推 `worktree-issue-332-slice-2` branch，开普通 PR
7. `/review` 循环到 PASS → squash-merge → POSTPR cleanup → 释放 `grill-working` label

## Risks / Rollback

- **风险 1**: mock responder 的 keyword-substring 匹配可能误判（rule content "no rm" 在 tool input "no rmdir" 上误命中）。**缓解**：unit test #5 覆盖典型 false-positive 形态；slice 2b 把 keyword 升级为 word-boundary regex。
- **风险 2**: integration test 在 Windows CI 上 path separator 不一致。**缓解**：mock responder 内部一律用 `path.join`；test fixture path 一律用 `path.join` 不裸字符串拼接。
- **风险 3**: ADR 决策 #9 "hold scope（不拆）"被本 slice 再次拆解。**缓解**：claim comment + 本 plan 都明示「`docs/PR-PLAN.md` post-PR style 拆解，原 grill 决策 trail 不变」；slice 2a/2b/3 共同满足 `docs/adr/0014/332.md` 的 6 项 acceptance criteria。
- **回滚**：PR 被 reject → 关 PR、`gh issue edit 332 --remove-label grill-working --add-label grill-ready`、`ExitWorktree action="remove"`。

## Dependencies

- 上游依赖：PR [#356](https://github.com/libz-renlab-ai/TeamBrain/pull/356) 已 merged（slice 1 utilities 已在 origin/main）
- 下游 unblock：slice 2b（3-scenario 全套 + fixture-replay 扩展）+ slice 3（nightly + ablation + budget guard）

## See also

- ADR sibling: [`docs/adr/0014/332.md`](../../adr/0014/332.md)
- Slice 1 PR: [#356](https://github.com/libz-renlab-ai/TeamBrain/pull/356)
- Cross-host mutex spec: [`docs/PRE-IMPLEMENT-CLAIM.md`](../../PRE-IMPLEMENT-CLAIM.md)
- Project plan rule: [`docs/PLAN-RESEARCH-REPORT.md`](../../PLAN-RESEARCH-REPORT.md)
- PR planning recipe: [`docs/HOWTO-PLAN-PR.md`](../../HOWTO-PLAN-PR.md)
- Judge harness rule: `~/.claude/docs/rules/testing-judge-harness.md`
- Feature verification: [`docs/feature-verification.md`](../../feature-verification.md)
