# PR-M3B WIP 交接 — 2026-05-14 暂停点

> 临时交接文档。明天恢复开发时读这份；PR-M3B 真正开 PR 前删掉本文件
> （或保留为 M3B 实现注记，二选一由明天的 session 决定）。

## 一句话现状

BPP 里程碑三（挖矿管线接通）开发中。**PR-M3A 已 merge（#487）**；**PR-M3B 的代码已写完并本地提交在分支 `feat/bpp-m3-orchestrator` 上，未 push、未开 PR**。暂停在「跑完整 `packages/digital-twin/src` vitest 套件」这一步——该步被打断，尚未验证。

## 恢复开发的第一件事

```bash
git checkout feat/bpp-m3-orchestrator
npx vitest run packages/digital-twin/src 2>&1 | tail -15
```

这是 judge §V1.H 的 gate。如果绿——PR-M3B 收尾（见下「PR-M3B 收尾步骤」）。如果红——修，修完追加 commit（不要 amend，按项目约定建新 commit）。

## 分支 `feat/bpp-m3-orchestrator` 上 PR-M3B 包含什么

| 文件 | 状态 | 作用 |
|---|---|---|
| `packages/digital-twin/src/bpp/mining/orchestrator.ts` | 新增 | `runMining()` —— 10 步挖矿管线：seed 样本→拉未挖对话→extractMiningInput→3 个 miner 扇出→LLM 规范化（mock）→写挖矿池→Wilson 分级自动推送→写审计日志→写预算账本→推进游标 |
| `packages/digital-twin/src/bpp/mining/__tests__/orchestrator.test.ts` | 新增 | 端到端跑 seed 样本：断言 6 候选 / 3 自动推送 / 3 留池 / 审计日志可溯源 / 预算账本 / 确定性 / 游标推进 |
| `tests/fixtures/m3-mining-sample/` | 新增 18 文件 | 设计样本语料：6 个用户（alice/bob/carol 各 5 场、dave/erin/frank 各 1 场），每场 1 个纠正时刻 |
| `packages/digital-twin/src/bpp/mining/correction-adapter.ts` | 改 | 修了 latent bug：`slugify` 对纯 CJK signal 塌成 `""`（碰撞）+ user_id 含 `@` 会被 `assertSafeId` 拒。新增导出 `correctionCandidateId(user_id, signal)`——sanitize user_id + 空 slug 回退 FNV 哈希 |
| `packages/digital-twin/src/index.ts` | 改 | 导出 `runMining` / `SEED_SAMPLE_DIR` / `correctionCandidateId` / 类型 |
| `packages/cli/src/commands/bpp.ts` | 改 | 新增 `bpp mine` 子命令：`parseBppMineArgs`（支持 `--key=value` 和 `--key value` 两种写法）/ `renderBppMineHelp` / `runBppMine`；接到 dispatcher + namespace help |
| `packages/cli/src/__tests__/bpp.test.ts` | 改 | 新增 `bpp mine` 的 6 个测试 |

## 已验证 / 未验证

**已验证：**
- `npx tsc --noEmit -p tsconfig.base.json --pretty false` → exit 0
- `npx vitest run packages/digital-twin/src/bpp/mining/` → 71 tests 绿（含新增 orchestrator 4 个 + transcript-extractor 9 个）
- `npx vitest run packages/cli/src/__tests__/bpp.test.ts` → 61 tests 绿（含新增 mine 6 个）
- CLI 烟测：`pnpm teamagent bpp mine --help` 命中 `teamagent bpp mine` 锚点；真实 seeded run 产出 pool=6 / inbox bp_id 合计 3 / 审计日志带 `source_sessions`+`miner` / 预算账本带 `spent_usd`

**未验证（明天先做）：**
- `npx vitest run packages/digital-twin/src` 完整套件（被打断）—— judge §V1.H gate

## PR-M3B 收尾步骤（完整套件绿之后）

1. `git add` 全部 + 这份 handoff 已在分支上（见下「本地提交状态」）——如果完整套件红需修，修完追加 commit
2. `git push -u origin feat/bpp-m3-orchestrator`
3. `gh pr create`（普通 PR，英文 title/body，`feat(m3):` 前缀）
4. 后台 watch CI（ubuntu + windows test job 都绿）
5. `gh pr merge <N> --squash --delete-branch`
6. `git checkout main && git pull --ff-only`
7. 更新 `~/.teamagent/teambrain/issue_tracking.html` 加一行 PR
8. TaskUpdate #23 → completed

## PR-M3B 翻哪些 judge 行

`docs/plans/2026-05-14-bpp-m3-acceptance-verify/judge.md` 14 行里，PR-M3B 应翻：
**A1**（mine 命令）/ **A2**（读对话仓库——PR-M3A 已翻，orchestrator 也含 `readdirSync`）/ **A3**（≥5 候选）/ **B1**（≥3 自动推送）/ **B2**（低分留池）/ **C1**（审计日志可溯源）/ **C2**（预算账本）/ **D1**（确定性）。
**G1 / H1** 本来就绿。
剩 **E1 / F1 / F2 / G2** 是 PR-M3C。

## 本地提交状态

PR-M3B 的全部改动 + 这份 handoff 文档已作为一个 WIP commit 提交在 `feat/bpp-m3-orchestrator` 分支上（`feat(m3): mining orchestrator + bpp mine CLI [WIP]`）。**未 push、未开 PR。** 明天如果完整套件需要修东西，按项目约定建**新** commit（不要 amend）。

## 关键设计决策（别丢上下文）

1. **Wilson 分级阈值**（对照 `wilson-tier-gate.ts` 实算，reject_count=0 → p=1.0）：
   - `pattern_count=5` → LB≈0.566 → `canonical`（**PUSHABLE**）
   - `pattern_count=4` → LB≈0.510 → `stable`（不推）
   - `pattern_count≤3` → `stable`/`low`（不推）
   - 即：rule 候选要进高分（自动推送）必须 `pattern_count ≥ 5`。
2. **seed 样本设计**：6 个用户各 1 个独立纠正 signal（不是 3 用户 2 signal）——这样每用户只产 1 个候选，**绕开 correction-adapter 的 id 碰撞**，不依赖「slug 恰好不同」的脆弱假设。alice/bob/carol 各 5 场 → 3 个 canonical 自动推送；dave/erin/frank 各 1 场 → 3 个 low 留池。pool=6 > push=3，A3/B1/B2 都有余量。
3. **correction-adapter slugify 修复**：纯 CJK signal（本项目主场景）原本 slug 塌成 `""` → 同用户多 signal 碰撞 + 空 id；且 `safeUserId` 保留 `@` → id 含 `@` 被 `assertSafeId` 拒。修复 = sanitize user_id 到 `[A-Za-z0-9._-]` + 空 slug 回退 FNV 哈希。只改了 correction-adapter（M3 seed 样本只触发它）；behavior-miner / context-pattern-miner 的同款 latent bug **未碰**（M3 不触发，超范围）。
4. **`git_log: []` 是合法输入（Case 3）**：没有 GitContext 的 producer 代码存在，`extractMiningInput` 永远返回 `git_log: []`，context-pattern-miner 的 atomic-commit 子模式在 seed 样本上不触发——这是设计内的，PR #486 plan 已记录。
5. **自动推送 = 每个高分 BP 推给 1 个确定性接收者**（第一个非作者成员，排序后）——保证 inbox 条目数 = 高分候选数，不会冲掉 `pool > push`。**注意**：seed 样本里 alice 的 inbox 会收到 2 条（bob+carol 的 BP）、bob 收 1 条 → `grep -rhcE '"bp_id"'` 会输出 `2\n1` 两行。**PR-M3D 跑 §V2 runner 时必须 SUM 这两行得 3**，别当成单值。
6. **LLM 规范化（PR-M3B 只用 mock）**：每个 extract-type 出一次 mock 调用，记 `llm_calls`/`cost_usd`（mock 下 = 0）进审计日志 + 预算账本。miner 的计数保持权威（LLM-uncheatable）；mock 输出不回写 miner 的 title/body（mock 的 1-2 个泛化候选不是 N 个具体 miner 候选的有意义增强）。**这个调用点就是 PR-M3C 要升级的 seam**。

## 接下来的 M3 PR（PR-M3C / PR-M3D）

### PR-M3C —— provider 选择 + 坏 key 回退 + 预算 estimate/cap + 持久化账本 + 性能测试
翻 **E1 / F1 / F2 / G2**。advisor 的明确指导：

- **`--mock` vs fallback-to-mock 的预算分立（必须有明确立场，不能含糊）：**
  - `--mock`（显式）：estimate=0，账本 `spent_usd`=0，cap 永不触发 → 干净满足 C2「mock 下为 0」
  - fallback-to-mock（要了真 provider 但 key 坏/缺）：每次调用 estimate>0，账本仍记 actual=0，cap 可触发 → 满足 F1
  - 这意味着 BudgetTracker 的内部数和磁盘账本的 `spent_usd` 是两个不同的数。**给 tracker 的那个改名 `estimated_consumed_usd`，账本上的留 `spent_usd`**，否则调 F1 时会自己绕晕。
- **F1 budget cap**：`--budget-usd 0.01` 时，per-call estimate（有下限，比如 ≥0.02）→ 第一次 `consume(estimate)` 就超 → 抛 `BudgetExhaustedError` → orchestrator catch → 干净停批 + log 一行含 `budget|exhausted|stopped|预算` + `mine_exit=0`。
- **F2 持久化账本**：账本文件 `budget-<team>-<date>.json` 已经在写（PR-M3B 写了）；PR-M3C 把它升级成 load 已有 + 累加 + 跨天自动重置（按 `date` key）。F2 grep `date|team|spent_usd|reset` 已满足。
- **E1 mock fallback**：`ANTHROPIC_API_KEY` 坏/缺且没 `--mock` → `extractCandidates` 用 `anthropic-sdk` provider 抛错 → orchestrator catch → 重试 `mock` provider → log 一行含 `mock|degrad|fallback|降级`。
- **G2 perf**：新增 `packages/digital-twin/src/bpp/mining/__tests__/orchestrator-perf.test.ts`，1500 场 mock run，打印 `mined_1500_wall_ms=<n>`。

### PR-M3D —— M3 verdict run
跑 `judge.md` §V1 全部探针 → §V2 产 `.judge/2026-05-14-bpp-m3/judge.json` → §V3 用 process-isolated `claude -p` 读 judge.json+evidence/ 评级 → 目标 14 行全 PASS → 把 `judge.json` + `judge-v3.json` 拷进 plan dir 作 durable 证据。

## 任务清单状态

- #22 PR-M3A — **completed**（已 merge #487）
- #23 PR-M3B — **in_progress**（代码完成，待完整套件验证 + push + PR + merge）
- #24 PR-M3C — pending
- #25 PR-M3D — pending

## 大局

BPP 5 个里程碑：M1 推送链路 ✅、M2 对话上传通道 ✅、**M3 挖矿管线接通 ← 在这**、M4 挖矿质量验证（BLOCKED-ON-HUMAN，用户没有真实 6-12 人团队）、M5 生产化运维。

用户授权：「全自动运行直到结束」（含 merge 到 main，不用建 GitHub issue 直接做），「中文回答」。
