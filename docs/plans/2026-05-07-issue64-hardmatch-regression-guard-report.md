```text
                ┌────────────────────────────────────────────────┐
                │  issue #64 — hardmatch regression guard report │
                │  TEAMWORK 3+1+6 = 10 agents · VERDICT: PASS    │
                └────────────────────────────────────────────────┘

   N=3 sonnet workers (parallel)        1 opus 1M reporter (consolidate)
   ───────────────────────────────       ─────────────────────────────
   W1 → test-hardmatch-regression.sh     read all 4 changed files
   W2 → README ## Hardmatch contract     verify cross-slice consistency
   W3 → run-all.sh + hardmatch header    sandbox keys-only downgrade simulation
        (each ran 2 claudefast probes)   final independent claudefast verdict

                                        →   VERDICT: PASS
```

# Report — issue #64 hardmatch regression guard

执行 [plan](2026-05-07-issue64-hardmatch-regression-guard-plan.md)（基于 [research](2026-05-07-issue64-hardmatch-regression-guard-research.md)）。TEAMWORK 协议 N+1+(2N)=10 成员模式（3 sonnet workers + 1 opus 1M reporter + 6 自我交叉验证 probes）。

## 实际交付

| 产物 | 状态 | 证据 |
|------|------|------|
| `docs/feature-verify-kit/test-hardmatch-regression.sh` | 新文件 124 行，可执行（`+x`） | W1 TDD `bash test-hardmatch-regression.sh` exit 0；reporter 端到端 exit 0 |
| `docs/feature-verify-kit/README.md` `## Hardmatch contract` 段 | 21 行新增 | W2 `git diff` 单一连续插入；行数预算 ≤ 25 满足 |
| `docs/feature-verify-kit/run-all.sh` 新增 regression test 调用 | +1 EOF | W3 `bash -n` exit 0 |
| `docs/feature-verify-kit/hardmatch-features.sh` 顶部 contract pointer 注释 | +1 行（shebang 后） | W3 `bash -n` exit 0；`bash hardmatch-features.sh` 仍按预期在 `jq` 缺输入处 fail（语义未变） |
| `docs/plans/2026-05-07-issue64-hardmatch-regression-guard-plan.md` | 新文件，4 节结构（task / outputs / judge harness / probes） | 184 行 |
| `docs/plans/2026-05-07-issue64-hardmatch-regression-guard-research.md` | 新文件，commit 时间线 + fixture/canonical 配对 | 128 行 |

## Anti-goal 验证（reporter 核查）

| 文件 | 期望 byte-identical | 实际 |
|------|---------------------|------|
| `fixtures/expected-product-features.json` | yes | yes ✓ |
| `docs/系统展示.md` | yes | yes ✓ |
| `verify-claude-stream-json.sh` | yes | yes ✓ |
| `verify-dashboard-health.sh` | yes | yes ✓ |
| `verify-tmux-interactive.sh` | yes | yes ✓ |
| `claudefast-stream-json-flags.sh` | yes | yes ✓ |

`hardmatch-features.sh` 行 8/9/11/13 的 jq+diff 主逻辑（行号已 +1 偏移）byte-identical；只多一行 contract pointer 注释。

## Cross-slice consistency（reporter 核查）

- `run-all.sh:7` 调用 `"$(dirname "$0")/test-hardmatch-regression.sh"` — 与 W1 创建文件同目录 ✓
- README `## Hardmatch contract` 段提到 `bash docs/feature-verify-kit/test-hardmatch-regression.sh` — 路径与 W1 文件一致 ✓
- `hardmatch-features.sh:2` 注释 `CONTRACT: see README.md ## Hardmatch contract` — section header 与 W2 添加段一致 ✓

## End-to-end integration（reporter 实测）

| 命令 | exit | 备注 |
|------|------|------|
| `bash test-hardmatch-regression.sh` | 0 | 末行 `PASS: hardmatch regression guard intact` |
| `bash -n run-all.sh` | 0 | 无语法错误 |
| `bash -n test-hardmatch-regression.sh` | 0 | 无语法错误 |
| `bash -n hardmatch-features.sh` | 0 | 无语法错误 |

## 关键 acceptance 证据：Sandbox 模拟 keys-only 降级

reporter 在 `/tmp/issue64-downgrade-sim-1778142826/` 创建 `hardmatch-keys-only.sh`（39e81ea pattern：`jq -S 'keys'` 替代 `jq -S .`）+ `test-wrapper.sh`（mirror 真实测试，调用 sandbox hardmatch）。

```text
sandbox hardmatch (keys-only) — POS branch: exit 0  (keys 与未改 fixture 相同)
sandbox hardmatch (keys-only) — NEG branch: exit 0  (mutation 2,432→2,433 keys 不变, keys-only diff 看不到值差异)
wrapper test exit: 1                                 (期望非零，因 NEG 该 fail 却 pass)
wrapper stderr tail:
    [POS] exit=0
    [POS] tail: PASS (downgraded keys-only): feature JSON keys match
    [NEG] exit=0
    [NEG] tail: PASS (downgraded keys-only): feature JSON keys match
    REGRESSION DETECTED: hardmatch may have been downgraded to keys-only
```

**结论**：regression guard 真的能 catch keys-only 降级。这是判定的硬证据，不是 LLM 自评。

## Probe 幻觉处理

W1 probe 1 错误地声称 NEG 分支无法 catch keys-only 降级（"diff at line 14 detects difference regardless"）。reporter 用上面的 sandbox 模拟独立证伪：

- mutation `2,432 → 2,433` 改的是 value，**不动 keys**
- keys-only diff 输入两个相同的 keys 数组 → exit 0
- 真实 hardmatch 在该 mutation 下应 exit 非零；keys-only 降级后 exit 0
- 测试 NEG 分支断言 `NEG_EXIT -ne 0`（line 111）→ 在降级时该断言 fail → 测试 exit 1 报告 "regression detected"

TEAMWORK 设计 2 probes/worker 正是为了 cross-validate single-probe hallucination；本次跨层验证由 reporter 长上下文 + sandbox 实测兜底。

## Follow-ups（非 blocker）

1. （low）W2 probe 2 指出 README 显式禁止把 `diff -u` 改为 keys-only 或 schema，但没显式禁止把 keys-only "文档化为 intentional choice"（issue body option-3）。当前 README "禁止合并的 PR 类型" 段已把 keys-only 列为 regression must-not-merge，**实践上 gap 已闭合**；如需更严格可以追加一行 PR follow-up，本 PR 不必。
2. （info）`CLAUDE.md` 在 `git status` 显示 modified —— 是用户/linter 故意改动，**不在 issue #64 scope**，本 PR 不 stage。
3. （info）`test-hardmatch-regression.sh` 备份并恢复已存在的 `runs/claude-features.json`（lines 55-72），IO-safe。值得在 PR description 注明，避免本地有人有 in-flight `claude-features.json` 时受影响。

## VERDICT: PASS

reporter 给出 PASS。independent claudefast probe 也输出 `VERDICT: PASS`。

下一步：4 个 atomic commit → push → 普通 PR → POSTPR loop。
