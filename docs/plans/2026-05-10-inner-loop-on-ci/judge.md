```text
   ┌────────────────────────────────────────────────────────────────────┐
   │   judge.md — toohot session                                        │
   │   3rd-party harness for inner-loop-on-ci plan                      │
   │                                                                    │
   │   J1 CI green       J3 secret OK         J5 toohot regression      │
   │   J2 CI red         J4 local targeted    (HUMAN step)              │
   │                                                                    │
   │   每个 probe → result.json → claudefast -p 终判 PASS/FAIL           │
   │   ❌ 实施 agent 不得自评   ❌ 计划作者不得自评                       │
   │   ❌ 被测代码不得自评     ✅ 只 claudefast -p 读 raw JSON 当裁判     │
   └────────────────────────────────────────────────────────────────────┘
```

---

## 0 Harness 元规则

- 此文件是 MD playbook，**不是 shell script**（项目规则）。主 agent 读它，dispatch subagent 或 `claudefast -p` 按节执行。
- 每个 probe 输出固定字段 JSON 到 `judge/<probe-id>/result.json`，原始 stdout/stderr 落 `judge/<probe-id>/stdout.log`。
- **token 字面值禁止出现在任何 result.json / stdout.log 中**；env dump 一律 `[redacted]`。
- 终判：`claudefast -p "read judge/*/result.json + verdict per probe + overall PASS/FAIL"` → `judge/_overall/verdict.md`。

工作目录（相对仓库根）：`docs/plans/2026-05-10-inner-loop-on-ci/`

---

## J1 — CI green path

**Hypothesis**: `inner-loop.yml` 在 `wip/**` push 时正确触发，且全绿测试 → conclusion=success。

**Steps**:
1. `git checkout -b wip/judge-pass main`（保持代码干净）
2. `git commit --allow-empty -m "judge: J1 CI green"`
3. `git push origin wip/judge-pass`
4. `RUN_ID=$(gh run list --workflow=inner-loop.yml --branch wip/judge-pass -L 1 --json databaseId --jq '.[0].databaseId')`
5. `gh run watch "$RUN_ID" --exit-status` （阻塞至完成）
6. `gh run view "$RUN_ID" --json status,conclusion,createdAt,updatedAt,databaseId,url > judge/J1/result.json`

**JSON schema** `judge/J1/result.json`:
```json
{
  "probe_id": "J1",
  "input_branch": "wip/judge-pass",
  "run_id": <int>,
  "status": "completed",
  "conclusion": "success",
  "duration_sec": <int>,
  "evidence_url": "https://github.com/libz-renlab-ai/TeamBrain/actions/runs/<id>",
  "captured_at": "<iso8601>"
}
```

**Pass criterion**: `conclusion == "success"` ∧ `status == "completed"`.

---

## J2 — CI red path

**Hypothesis**: 故意失败 → conclusion=failure（红绿对称性，证明 inner-loop.yml 没误把红判成绿）。

**Steps**:
1. `git checkout -b wip/judge-fail main`
2. 编辑 `packages/cli/src/__tests__/init.test.ts`，插入 `expect(1).toBe(2)` 让一个测试必然挂
3. `git commit -am "judge: J2 deliberate failure"`
4. `git push origin wip/judge-fail`
5. 等 run 完成（同 J1）
6. 解析失败计数：`gh run view "$RUN_ID" --log-failed | grep -c "FAIL " > /tmp/fail_count`（或从 vitest reporter JSON）
7. 写 `judge/J2/result.json`

**JSON schema**:
```json
{
  "probe_id": "J2",
  "input_branch": "wip/judge-fail",
  "run_id": <int>,
  "conclusion": "failure",
  "failed_test_count": <int>,
  "evidence_url": "...",
  "captured_at": "<iso8601>"
}
```

**Pass criterion**: `conclusion == "failure"` ∧ `failed_test_count >= 1`.

---

## J3 — secret/env injection works

**Hypothesis**: GitHub secret `MINIMAX_API_KEY` 通过 `env: ANTHROPIC_API_KEY: ${{ secrets.MINIMAX_API_KEY }}` 正确注入；非敏感 env (`ANTHROPIC_BASE_URL` 等) 正确填入；token 字面值**绝不**出现在 log。

**Steps**:
1. `git checkout -b wip/judge-secret main`
2. 添加 `packages/cli/src/__tests__/judge-env.test.ts`：
   ```ts
   import { describe, it, expect } from 'vitest'
   describe('J3 env injection', () => {
     it('ANTHROPIC_BASE_URL is MiniMax endpoint', () => {
       expect(process.env.ANTHROPIC_BASE_URL).toBe('https://api.minimaxi.com/anthropic')
     })
     it('ANTHROPIC_API_KEY is non-empty (presence only, never log value)', () => {
       expect(process.env.ANTHROPIC_API_KEY?.length ?? 0).toBeGreaterThan(10)
     })
   })
   ```
3. push / 等 run / 拿 RUN_ID
4. 拉日志验证 token 字面值不出现：`gh run view "$RUN_ID" --log | grep -c "<token-prefix>"` **必须返回 0**（鸭鸭不知道也不写真前缀；裁判 LLM 用 raw JSON 中 `token_in_log_count` 字段判）
5. 写 `judge/J3/result.json`

**JSON schema**:
```json
{
  "probe_id": "J3",
  "input_branch": "wip/judge-secret",
  "run_id": <int>,
  "conclusion": "success",
  "env_assertion": {
    "ANTHROPIC_BASE_URL_match": true,
    "MINIMAX_API_KEY_present": true
  },
  "token_in_log_count": 0,
  "evidence_url": "...",
  "captured_at": "<iso8601>"
}
```

**Pass criterion**: `conclusion == "success"` ∧ `env_assertion.*` 全 true ∧ `token_in_log_count == 0`.

---

## J4 — local single-file targeted exception

**Hypothesis**: 🅱️ 例外条款不破——本地跑单文件 vitest 仍秒级返回 PASS。

**Steps**（在仓库根）:
1. `time pnpm vitest run packages/cli/src/__tests__/init.test.ts > judge/J4/stdout.log 2>&1`
2. 解析退出码 + duration 写 `judge/J4/result.json`

**JSON schema**:
```json
{
  "probe_id": "J4",
  "command": "pnpm vitest run packages/cli/src/__tests__/init.test.ts",
  "exit_code": 0,
  "duration_sec": <float>,
  "ran_files": ["packages/cli/src/__tests__/init.test.ts"],
  "captured_at": "<iso8601>"
}
```

**Pass criterion**: `exit_code == 0` ∧ `duration_sec < 10`.

---

## J5 — toohot regression (HUMAN step)

**Hypothesis**: 改造后 N=4 并行 session 同时**push wip 让 CI 跑**（而**不是**本地 `pnpm test`）→ 本地 loadavg 大幅下降。

**鸭鸭无法纯自动化**——需要用户亲自开 N 个 Claude Code session 多窗口。Playbook 步骤：

1. **Baseline 已知**：plan §0 ASCII 图记录的「改造前 N=4 同时本地 pnpm test → loadavg 274」（来自 toohot 命令实测，2026-05-10）。
2. **N=1 sample**：用户开 1 session，让它在 inner-loop CI 跑测试期间在另一终端跑 `toohot --once`，把输出贴到 `judge/J5/sample-1.txt`，并填字段到 sample 数组。
3. **N=2 / N=3 / N=4**：同上，每加 1 session 同时跑（每 session 各自 push 不同 wip 分支让 CI 各自跑）。
4. 用户合并四份 sample 写 `judge/J5/loadavg-curve.json`。

**JSON schema** `judge/J5/loadavg-curve.json`:
```json
{
  "probe_id": "J5",
  "baseline_pre_change": {
    "n_sessions": 4,
    "loadavg_1m": 274.15,
    "thermal": "normal",
    "method": "all 4 sessions ran `pnpm test` LOCALLY simultaneously",
    "captured_at": "2026-05-10T<approx>"
  },
  "post_change_samples": [
    {"n_sessions": 1, "loadavg_1m": <float>, "thermal": "<string>", "captured_at": "..."},
    {"n_sessions": 2, "loadavg_1m": <float>, ...},
    {"n_sessions": 3, "loadavg_1m": <float>, ...},
    {"n_sessions": 4, "loadavg_1m": <float>, ...}
  ],
  "method": "each session pushed wip/<unique-name>; pnpm test ran on CI not locally"
}
```

**Pass criterion**: `post_change_samples[3].loadavg_1m < 100`（即 N=4 时本地 loadavg < 100，vs baseline 274）。

---

## 终判 — claudefast -p 当裁判

所有 J1-J5 result.json 就绪后跑：

```bash
claudefast -p "$(cat <<'EOF'
You are the third-party judge for the inner-loop-on-ci plan.

Read these five files:
  docs/plans/2026-05-10-inner-loop-on-ci/judge/J1/result.json
  docs/plans/2026-05-10-inner-loop-on-ci/judge/J2/result.json
  docs/plans/2026-05-10-inner-loop-on-ci/judge/J3/result.json
  docs/plans/2026-05-10-inner-loop-on-ci/judge/J4/result.json
  docs/plans/2026-05-10-inner-loop-on-ci/judge/J5/loadavg-curve.json

For each, evaluate against the Pass criterion in judge.md (do not invent criteria).
Then emit overall PASS only if all 5 individually PASS.

Output format (markdown):
  ## J1 ... PASS/FAIL — reasoning ...
  ## J2 ... PASS/FAIL ...
  ## J3 ... PASS/FAIL ...
  ## J4 ... PASS/FAIL ...
  ## J5 ... PASS/FAIL ...
  ## Overall: PASS / FAIL — reasoning
EOF
)" > judge/_overall/verdict.md
```

终判文件：`judge/_overall/verdict.md`。**只有 Overall=PASS 才能开 PR**。

---

## 清理（运行完）

```bash
git push origin --delete wip/judge-pass wip/judge-fail wip/judge-secret
git branch -D wip/judge-pass wip/judge-fail wip/judge-secret
```

J5 数据（loadavg-curve.json）保留在 PR 中作为证据。

---

## 重跑策略

- **CI flake**（runner network、actions cache miss）：同 branch 重 push commit `--allow-empty -m "rerun"`，用新的 RUN_ID。
- **artifact bug**（inner-loop.yml 配错、env 没注入到位）：修 artifact，删 wip 分支重来；旧 result.json 标记 `superseded: true` 移到 `judge/_archive/`。
- **J5 偏差**（某次 sample 异常如有其他高负载进程干扰）：用户标注 `notes: "外部干扰"` 重测。
