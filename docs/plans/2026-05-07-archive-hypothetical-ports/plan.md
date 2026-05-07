```text
   ┌─────────────────────────────────────────────────┐
   │  packages/ports/src/                            │
   │  ┌─────────────────────────────────────────┐    │
   │  │  active ports (19)                      │    │
   │  └─────────────────────────────────────────┘    │
   │                                                 │
   │  packages/ports/src/_archived/   ← 抽屉         │
   │  ┌─────────────────────────────────────────┐    │
   │  │ correction-detector.ts                  │    │
   │  │ success-detector.ts                     │    │
   │  │ candidate-queue.ts                      │    │
   │  │ error-signal-collector.ts               │    │
   │  │ bootstrap-port.ts                       │    │
   │  │ team-rule-store-port.ts                 │    │
   │  │ + 各自 contract test                    │    │
   │  │ + README.md (复活说明)                  │    │
   │  └─────────────────────────────────────────┘    │
   │                                                 │
   │  callers (cli/, core/, adapters/)               │
   │      └─ 直接 import impl，不再走 port           │
   └─────────────────────────────────────────────────┘
```

# Plan: Archive 6 hypothetical port seams

**Date:** 2026-05-07
**Source:** `/improve-codebase-architecture` grilling loop, candidate 1
**Authority:** CEO-duck approved 🍤 极简 + (a) M5 一并 archive + ADR=写
**Related ADR:** `docs/adr/0005-archive-hypothetical-port-seams.md` (renamed from 0004 due to collision with existing `0004-calibration-via-claude-code-subagent.md`)
**CONTEXT.md update:** 加 "Archived port" 词条到 Module structure 段

---

## CHANGELOG

- v1 (2026-05-07): 初稿

---

## 1. Task description

### 做什么

把以下 6 个 single-adapter port 从 `packages/ports/src/` 移到 `packages/ports/src/_archived/` 抽屉，并把所有调用方改为直接 import 唯一 adapter / 唯一 impl，不再经过 port type。原文件内容**不变**——只是位置变 + 不再 export from `index.ts`。

| Port (current path) | Adapter / Impl (kept) | Contract test |
|---|---|---|
| `correction-detector.ts` | `packages/core/src/correction-detector/rule-based.ts` | 无 (新建归档说明) |
| `success-detector.ts` | `packages/core/src/success-detector/rule-based.ts` | 无 (新建归档说明) |
| `candidate-queue.ts` | `packages/adapters/src/storage/sqlite/sqlite-candidate-queue.ts` | `__tests__/candidate-queue-contract.ts` (一并 archive) |
| `error-signal-collector.ts` | `packages/adapters/src/error-collector/composite-error-signal-collector.ts` | `__tests__/error-signal-collector-contract.ts` (一并 archive) |
| `bootstrap-port.ts` | `packages/adapters/src/m5/fs-bootstrap.ts` | `__tests__/bootstrap-port-contract.ts` (一并 archive) |
| `team-rule-store-port.ts` | `packages/adapters/src/m5/fs-team-rule-store.ts` | `__tests__/team-rule-store-port-contract.ts` (一并 archive) |

### 怎么做（按 commit 分）

1. **commit 1: `refactor(arch): create _archived drawer + README`**
   - 建 `packages/ports/src/_archived/` 子目录
   - 建 `_archived/README.md` 写明：(a) 这里的 port 已经 deletion-test 失败被下线；(b) 复活步骤；(c) 移入条件（≥2 真实 adapter）
   - 该 commit 不动 active 代码

2. **commit 2: `refactor(arch): archive correction-detector + success-detector ports`**
   - 移动 2 个 port 文件 + (无 contract test 可移)
   - 改 `packages/ports/src/index.ts`：删除 `export type { CorrectionDetector, ... }` 等 5 行
   - 改 `extract-pipeline.ts:4,38` / `scenario/runner.ts:2,26` / `composite-error-signal-collector.ts:3` / `cli/commands/analyze.ts` / `cli/commands/verify.ts` / `success-detector/rule-based.ts:6` 中所有 `import type { CorrectionDetector }` → 改为 `import type { ReturnType<typeof ruleBasedCorrectionDetector.detect> }` 或直接用 `typeof ruleBasedCorrectionDetector` 给 DI slot 类型
   - `pnpm test` + `pnpm typecheck` 全绿
   - 提交

3. **commit 3: `refactor(arch): archive candidate-queue port + contract test`**
   - 移动 `candidate-queue.ts` + `__tests__/candidate-queue-contract.ts` 到 `_archived/`
   - 改 `packages/ports/src/index.ts`：删除 `export type { CandidateQueue, RuleCandidate }`
   - 改 `cli/commands/{review-candidates,scan-errors}.ts` + `cli/scripts/batch-review-candidates.ts` 中所有 `import { CandidateQueue }` → 改为直接用 `SqliteCandidateQueue` 类型
   - 改 `sqlite-candidate-queue.ts:5`：`import type { CandidateQueue, RuleCandidate } from "@teamagent/ports"` → 改为内联类型 / 移到 adapters 自己的类型文件
   - `pnpm test` + `pnpm typecheck` 全绿
   - 提交

4. **commit 4: `refactor(arch): archive error-signal-collector port + contract test`**
   - 同样 pattern；唯一 caller 是 `composite-error-signal-collector.ts` 自己 + `bin-stop.ts`

5. **commit 5: `refactor(arch): archive bootstrap-port + team-rule-store-port (M5)`**
   - 移动 2 个 port 文件 + 2 个 contract test
   - 改 `packages/ports/src/index.ts`：删除 4 行 export
   - 改 M5 adapter (`fs-bootstrap.ts` / `fs-team-rule-store.ts`) 中 port import → 内联类型
   - 改 M5 callers（CLI m5 sync 命令）→ 直接用 adapter 类型
   - `pnpm test` + `pnpm typecheck` + 跑一遍 m5 viral sync e2e（如果有）
   - 提交

6. **commit 6: `docs(arch): add ADR-0005 + CONTEXT.md "Archived port" term`**
   - 新增 `docs/adr/0005-archive-hypothetical-port-seams.md`
   - 改 `docs/CONTEXT.md`：在 Calibration & tier 段后新增 "Module structure" 子段，定义 "Archived port"
   - 提交

### 不做什么

- ❌ 不删任何 impl / adapter — 只删 port type 和它的 export
- ❌ 不改 ADR-0001/0002/0003
- ❌ 不动其他 19 个 port — 候选 2/3/4 在另外的 grilling 里处理
- ❌ 不动 M5 viral sync 的 prod transport — git-backed transport 仍是唯一通道（与 CONTEXT.md 一致）
- ❌ 不解禁 CLAUDE.md 元约束「Port 接口冻结于 M0」 — 该约束适用于 active port；archived port 不在约束范围内（ADR-0005 会写明这一点）
- ❌ 不改 user-level 文档 / settings

---

## 2. Expected outputs

发版前可验收的交付物清单：

| # | 交付物 | 路径 / 标识 | 验收方式 |
|---|---|---|---|
| 1 | `_archived/` 抽屉 + README | `packages/ports/src/_archived/README.md` | `cat` 文件存在并描述复活步骤 |
| 2 | 6 个 port 文件已搬到 `_archived/` | `packages/ports/src/_archived/{correction-detector,success-detector,candidate-queue,error-signal-collector,bootstrap-port,team-rule-store-port}.ts` | `ls` 6 个文件均在 `_archived/` 下 |
| 3 | 4 个 contract test 一并搬到 `_archived/__tests__/` | `packages/ports/src/_archived/__tests__/*.ts` | `ls` 4 个 contract test 在抽屉子目录 |
| 4 | `packages/ports/src/index.ts` 不再 export 这 6 个 port | `git diff packages/ports/src/index.ts` | `grep -c "CorrectionDetector\|CandidateQueue\|BootstrapPort\|TeamRuleStorePort\|ErrorSignalCollector\|SuccessDetector" packages/ports/src/index.ts` 输出 `0` |
| 5 | 所有 callers 不再 import 这 6 个 port type | repo-wide grep | `grep -rn "@teamagent/ports.*\b\(CorrectionDetector\|SuccessDetector\|CandidateQueue\|ErrorSignalCollector\|BootstrapPort\|TeamRuleStorePort\)\b" packages/ --include='*.ts' \| grep -v _archived` 输出空 |
| 6 | `pnpm test` 全绿 | CI + 本地 | exit code 0，新增/删除测试数 ≤ contract test 移动数（4） |
| 7 | `pnpm typecheck` 全绿 | CI + 本地 | exit code 0 |
| 8 | `pnpm teamagent skeleton-demo` 跑通 | M0 walking skeleton 不断裂 | exit code 0，stderr 无 type error |
| 9 | M5 viral sync e2e 跑通 | `bash scripts/m5-sync-e2e.sh`（如存在）或手测 `pnpm teamagent m5-sync --apply` | exit code 0 |
| 10 | ADR-0005 已合并 | `docs/adr/0005-archive-hypothetical-port-seams.md` | 文件存在 + Status: proposed/accepted |
| 11 | CONTEXT.md 加 "Archived port" 词条 | `docs/CONTEXT.md` | `grep -n "Archived port" docs/CONTEXT.md` 命中 |
| 12 | PR 描述包含 deletion-test 证据表 | GitHub PR body | 表格列出每个 archived port 的 caller 数变化（before vs after） |

---

## 3. How-to-eval-from-3rd-party-harness that outputs JSON and let LLM-judge it

**核心铁律：不让代码自己评。** 第三方 judge harness 跑固定工具、dump JSON、另一只 LLM 只读 raw JSON 当裁判。

### Judge harness 路径

`docs/plans/2026-05-07-archive-hypothetical-ports/judge.md` —— MAIN agent dispatch playbook（不是 fixed bash），按 `feedback_judge_harness_md_playbook.md` 规则。

### RUN 阶段（固定工具）

每条产生 `.judge/<run_id>/<probe>/{exit_code, stdout, stderr, evidence/}`：

```bash
# Probe 1: vitest 全量
pnpm test --reporter=json > .judge/<run_id>/vitest/output.json 2>&1
echo $? > .judge/<run_id>/vitest/exit_code

# Probe 2: tsc 全量
pnpm typecheck > .judge/<run_id>/typecheck/stdout 2>&1
echo $? > .judge/<run_id>/typecheck/exit_code

# Probe 3: skeleton demo
pnpm teamagent skeleton-demo > .judge/<run_id>/skeleton/stdout 2>&1
echo $? > .judge/<run_id>/skeleton/exit_code

# Probe 4: deletion-test grep — 期望全部输出空
grep -rn "@teamagent/ports.*\b\(CorrectionDetector\|SuccessDetector\|CandidateQueue\|ErrorSignalCollector\|BootstrapPort\|TeamRuleStorePort\)\b" packages/ --include='*.ts' \
  | grep -v _archived > .judge/<run_id>/grep/leaked_imports.txt
wc -l .judge/<run_id>/grep/leaked_imports.txt > .judge/<run_id>/grep/count

# Probe 5: index.ts 不再 export 6 个 port
grep -cE "CorrectionDetector|CandidateQueue|BootstrapPort|TeamRuleStorePort|ErrorSignalCollector|SuccessDetector" \
  packages/ports/src/index.ts > .judge/<run_id>/index/leak_count

# Probe 6: file existence — 6 port + 4 contract test 必须在 _archived/
ls packages/ports/src/_archived/{correction-detector,success-detector,candidate-queue,error-signal-collector,bootstrap-port,team-rule-store-port}.ts \
   packages/ports/src/_archived/__tests__/{candidate-queue,error-signal-collector,bootstrap-port,team-rule-store-port}-contract.ts \
   2> .judge/<run_id>/files/missing.txt > .judge/<run_id>/files/found.txt
wc -l .judge/<run_id>/files/{found,missing}.txt > .judge/<run_id>/files/counts

# Probe 7: feature-verification 1+2+3 (CLAUDE.md 项目门禁)
claudefast -p "pnpm teamagent stats --help" --output-format stream-json --include-partial-messages \
  > .judge/<run_id>/help-claudefast/stream.json
codex exec --skip-git-repo-check -s read-only "pnpm teamagent stats --help" \
  > .judge/<run_id>/help-codex/stdout
diff .judge/<run_id>/help-claudefast/canonical.json .judge/<run_id>/help-codex/canonical.json \
  > .judge/<run_id>/help-diff/output 2>&1
echo $? > .judge/<run_id>/help-diff/exit_code

# Probe 8: m5 viral sync 仍工作（M5 是 risky 区，必须 e2e）
pnpm teamagent m5-sync --dry-run > .judge/<run_id>/m5-sync/stdout 2>&1
echo $? > .judge/<run_id>/m5-sync/exit_code
```

### DUMP 阶段

写 `.judge/<run_id>/judge.json`：

```json
{
  "run_id": "<unix epoch>",
  "plan": "2026-05-07-archive-hypothetical-ports",
  "probes": {
    "vitest": { "exit_code": 0, "evidence": ".judge/<id>/vitest/output.json" },
    "typecheck": { "exit_code": 0, "evidence": ".judge/<id>/typecheck/stdout" },
    "skeleton": { "exit_code": 0, "evidence": ".judge/<id>/skeleton/stdout" },
    "grep_leaked_imports": { "metric": "<wc -l>", "expected": 0, "evidence": "..." },
    "index_leak_count": { "metric": "<grep -c>", "expected": 0, "evidence": "..." },
    "files_found": { "metric": "<wc -l>", "expected": 10, "evidence": "..." },
    "files_missing": { "metric": "<wc -l>", "expected": 0, "evidence": "..." },
    "help_diff": { "exit_code": 0, "evidence": "..." },
    "m5_sync": { "exit_code": 0, "evidence": "..." }
  }
}
```

### READ 阶段（LLM judge）

派一个独立 sub-agent（**不**是 implementer，**不**是规划者），prompt 严格：

```
你是第三方 judge。只读 .judge/<run_id>/judge.json 和它指向的 evidence 文件。
不读源码、不跑命令、不看 PR description。

判断标准：
- 任一 probe.exit_code != 0 → FAIL
- grep_leaked_imports.metric != 0 → FAIL（仍有 caller import 已 archive 的 port）
- index_leak_count.metric != 0 → FAIL（index.ts 仍 export）
- files_found.metric < 10 → FAIL（缺 port 文件 / contract test 没搬）
- files_missing.metric > 0 → FAIL
- m5_sync.exit_code != 0 → FAIL（M5 viral sync 被 archive 影响 → 必须回滚 M5 那 2 个 port）

输出 JSON：
{ "verdict": "PASS|FAIL", "failures": [...], "evidence_quoted": [...] }
```

### Judge 不允许做的事

- ❌ 不允许读 plan.md 自评
- ❌ 不允许跑 `pnpm test` 自己复现
- ❌ 不允许信任 PR description 的 "I tested it works"
- ❌ 不允许 skip 任何 probe

---

## 4. 风险 & 回滚

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| M5 viral sync 依赖 BootstrapPort / TeamRuleStorePort 跨进程契约 | 低 | 高（破坏 viral sync） | commit 5 单独 e2e；PASS 才合 PR |
| Caller 漏改导致 build broken | 中 | 中（CI 拦） | typecheck + grep probe 双重门禁 |
| 第二只 adapter 真的来了（比如 LLM correction detector） | 中 | 低（再写新 port 即可，原 port 在 `_archived/` 可参考） | ADR-0005 明确"复活流程" |
| 删除 contract test 后 lone adapter 退化测试覆盖 | 低 | 低（adapter 自己有 unit test） | commit 3/4/5 前 review adapter 自带 unit test 是否覆盖原 contract test 用例；不足则把 contract test case 移到 adapter 自己的 unit test |

回滚：每个 commit 都是独立 archive 一个 port，`git revert <sha>` 即可分粒度回滚。

---

## 5. 依赖

- 无外部依赖
- 无新 npm package
- 无新环境变量
- 不需要 user permission（仅源码 refactor）

但需要：
- 鸭总确认 ADR-0005 文案
- 鸭总确认 CONTEXT.md 加词位置（Calibration & tier 段后新增 Module structure 子段 OK 还是别的）

---

## 6. 与现有 ADR-0004 (calibration) 的边界

`docs/adr/0004-calibration-via-claude-code-subagent.md` 处理 calibrator v1/v2 收敛问题（即原 grilling 候选 4 "Dual calibrators 没有迁移合约"）。**该候选已被 ADR-0004 接管，本 plan 不再涉及。** ADR-0004 的方案是「删 v2 整套、保留 v1 RuleBasedCalibrator 仅算 confidence、tier 由外部 subagent 写」，与本 plan 的 archive 6 个 port 互不冲突——本 plan 不动 calibrator port，ADR-0004 不动其余 6 个 hypothetical port。

如果 ADR-0004 实施 PR 合并后 `calibrator-v2.ts` 被 `git rm`，本 plan 不需要改动；如果 ADR-0004 决定把 v2 也搬到 `_archived/`，则本 plan 与之合并为一个 PR 更经济，需要鸭总裁决。
