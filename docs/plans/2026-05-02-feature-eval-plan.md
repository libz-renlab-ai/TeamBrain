```
+----------+   +----------+   +----------+   +-----------+
|  RUN     |-->|  DUMP    |-->|  READ    |-->|  VERDICT  |
| probes   |   | judge.   |   | LLM      |   | report.md |
| fixed    |   | json     |   | judge    |   |           |
+----------+   +----------+   +----------+   +-----------+
   ^                                              |
   | feature                                      v
   +----------- attribution / evidence ----------+
```

# TeamBrain Feature Eval — how-eval (v1)

## 1) Task description（做什么 / 不做什么）

对 12 项 CEO-level 产品力按"存在性 + 正确行为"双重验证。每项功能产出可机器验收的证据，结论由独立 judge LLM 给出。

**做**：对 12 项功能跑固定 probe，落 stream-json artifact，并用第三方 judge LLM 只读 raw JSON 给 PASS/FAIL/PARTIAL。

**不做**：
- 不让被测功能自评
- 不让计划作者下结论
- 不让执行 harness 直接 PASS/FAIL
- 不靠裸眼 review 流式日志

## 2) Expected outputs（可验收交付物）

```
eval/<run_id>/
├── judge.json                     # 每项 feature 的 raw fields
├── streamjson/<feat>.jsonl        # claudefast -p stream-json 全量事件
├── streamjson/<feat>.exit         # exit code
├── dogfood/probe-run/             # dogfood-probe.sh control vs tier-2 vs tier-3
│   ├── control.jsonl
│   ├── dogfood.jsonl
│   └── tier3.jsonl
├── cli/<cmd>.out                  # CLI probe stdout + EXIT=N
├── verdict.json                   # judge LLM 的 PASS/FAIL/PARTIAL + evidence_refs
└── report.md                      # CEO 可读摘要
```

可验收门槛：
- 12 项中 ≥ 11 项 PASS
- ≤ 1 项 PARTIAL
- 0 项 FAIL
- judge LLM 每项必须引用 ≥ 1 条 raw evidence

## 3) Third-party judge harness

### RUN（机械执行，不评判）

每项功能跑 1–2 个 probe：

```bash
# Canned-answer probe (claudefast streamjson)
zsh -ic 'claudefast -p \
  --output-format stream-json \
  ${CLAUDEFAST_STREAM_FLAGS:-"--include-partial-messages --verbose"} \
  --debug hooks --debug-file "eval/<run_id>/streamjson/<feat>.hooks.debug.log" \
  --permission-mode acceptEdits \
  "<probe-input>"' \
  > eval/<run_id>/streamjson/<feat>.jsonl 2>&1

# CLI probe
{ pnpm -s teamagent <cmd> 2>&1; echo "EXIT=$?"; } \
  > eval/<run_id>/cli/<cmd>.out

# DOGFOOD isolation probe
DOGFOOD_PROBE_DIR=eval/<run_id>/dogfood/probe-run \
  bash scripts/dogfood-probe.sh
```

### DUMP（写固定 JSON）

`judge.json` schema：

```json
{
  "run_id": "<id>",
  "features": [
    {
      "id": "F<N>-<slug>",
      "category": "<CEO category>",
      "ceo_pitch": "<one-line value prop>",
      "probe_kind": "claudefast streamjson | CLI | dogfood-probe",
      "probe_input": "<exact prompt or command>",
      "stdout_path": "streamjson/<feat>.jsonl",
      "exit_code": 0,
      "anchors_required": ["<grep-anchor-1>", "..."],
      "anchors_grep_count": <int>,
      "metrics": { "<feature-specific-counters>": "..." },
      "evidence": { "<for isolation-style probes>": "..." }
    }
  ]
}
```

### READ（third-party LLM judge）

```bash
zsh -ic "claudefast -p \
  --output-format stream-json \
  \${CLAUDEFAST_STREAM_FLAGS:-\"--include-partial-messages --verbose\"} \
  --debug hooks --debug-file eval/<run_id>/judge-hooks.debug.log \
  --add-dir eval/<run_id> \
  --permission-mode acceptEdits \
  \"\$(cat eval/<run_id>/judge-prompt.md)\"" \
  > eval/<run_id>/verdict.jsonl
```

`judge-prompt.md` 强约束：

1. 只能 Read judge.json + 引用的 stdout_path / evidence_dir，禁止重跑 / install / 调用 teamagent
2. 输出 schema：`{run_id, verdicts:[{id, verdict: PASS|FAIL|PARTIAL, evidence_refs, reason}], summary:{PASS, PARTIAL, FAIL}}`
3. PASS 判据：
   - exit_code == 0 AND
   - canned-answer probe：`anchors_grep_count >= 3`
   - isolation probe：`control_differs_from_sandbox == true && tier2_differs_from_tier3 == true`
   - CLI probe：metrics 显示真实工作发生（events emitted / rules counted）
4. PARTIAL：feature 实现正确但有 env-dependent caveat（如 `claude` 未在 PATH）
5. FAIL：exit non-zero 且 metrics 为空，或 anchors_grep_count == 0
6. 输出**只能是 JSON**，不许夹杂 prose / markdown 解释

### 三方分离

| 角色 | 可做 | 不可做 |
|------|------|--------|
| 被测功能 | 跑 probe | 自评 |
| RUN harness | 跑工具、dump JSON | 解释结果 |
| judge LLM | 读 raw JSON、给 verdict | 重跑 / install |

## 4) Probe 清单（v1 覆盖 8/12，下一版补齐）

| ID | Feature | Probe kind | Probe input |
|----|---------|------------|-------------|
| F1 | Auto-learning AI | CLI | `pnpm teamagent stats` |
| F2 | Real-time error blocker | CLI | `pnpm teamagent doctor --json` |
| F4 | DOGFOOD canned answer | claudefast streamjson | "what would happen when we say DOGFOOD?" |
| F4b | DOGFOOD actual isolation | dogfood-probe.sh | printenv HOME / CLAUDE_CONFIG_DIR (control vs tier-2 vs tier-3) |
| F5 | FASTPROBE canned answer | claudefast streamjson | "what would happen if we say word FASTPROBE?" |
| F8 | BUGREPORT canned answer | claudefast streamjson | "I found a bug, what should I do?" |
| F-PROJECT-TOOLS | Tool discovery | claudefast streamjson | "what project tools we have?" |
| F-WALKING-SKELETON | M0 vertical slice | CLI | `pnpm teamagent skeleton-demo` |
| F11 | Dashboard health | CLI / HTTP | `pnpm teamagent dashboard --once`; watch-mode `/health.json` must return `service=teamagent-dashboard`, `status=ok`, `stableHealthSignal=teamagent-dashboard-health` |

下一版补：F3 团队共享 / F6 语义匹配 / F7 自动升级 / F9 跨工具 / F10 信心评分 / F12 配对胶囊。

## 5) 复现命令

```bash
RUN_ID="$(date +%Y%m%d-%H%M%S)"
EVAL_DIR="eval/${RUN_ID}"   # 或 /tmp/teambrain-eval-${RUN_ID}
mkdir -p "${EVAL_DIR}"/{streamjson,dogfood,cli}
claudefast -h > "${EVAL_DIR}/claudefast-help.txt" 2>&1 || true
CLAUDEFAST_STREAM_FLAGS="--include-partial-messages --verbose"
export CLAUDEFAST_STREAM_FLAGS

# 跑 RUN 阶段（4 streamjson 并行 + 3 CLI inline + dogfood-probe 后台）
# 见 docs/reports/2026-05-02-feature-eval-report.md 完整脚本

# 跑 judge
claudefast -p --output-format stream-json \
  --include-partial-messages --verbose \
  --debug hooks --debug-file "${EVAL_DIR}/judge-hooks.debug.log" \
  --add-dir "${EVAL_DIR}" \
  "$(cat ${EVAL_DIR}/judge-prompt.md)" \
  > "${EVAL_DIR}/verdict.jsonl"

python3 extract-verdict.py "${EVAL_DIR}/verdict.jsonl" > "${EVAL_DIR}/verdict.json"
```
