# judge.md — issue #343 PR-1 verify gate

> **Hard rule（per `docs/HOWTO-PLAN-PR.md`）**：本 judge harness 是 md playbook，main agent dispatch 跑，**禁止**降级为 `scripts/*.sh` 固定 shell pipeline。失败 section 重跑用 re-dispatch `§V<n>`，不是改脚本。

PR-1：`TEAMAGENT_DISABLED=1` env master kill switch。

判 verify-loop PASS 的硬条件（在 §V3 写死）：
- (a) `pnpm vitest run` 三条 targeted 全绿
- (b) Disabled claudefast probe `.debug.log` 完全不含任何 `[teamagent]` / `TeamBrain` / `matcher` / `M5` / `analyze` 字样
- (c) Baseline vs Disabled probe `.debug.log` byte-diff 显示有差异（证明 baseline 状态下 TB 真的在注入；不是两边都静默）
- (d) AttributionBus event count = 0 (disabled run)
- (e) Disabled run 后 `~/.teamagent/` 下任何文件 mtime 不变

任何一条不满足 → FAIL → 修代码 → re-dispatch 失败的 §V<n>。

---

## §V1 RUN — main agent dispatch

跑顺序固定，每步前一步绿才能进下一步。

### §V1.1 Build & install

```
pnpm install
pnpm build
```

期望 exit 0。

### §V1.2 Vitest targeted (4 files)

```
pnpm vitest run packages/cli/src/__tests__/bin-session-start*.test.ts
pnpm vitest run packages/cli/src/__tests__/bin-pre-tool-use*.test.ts
pnpm vitest run packages/cli/src/__tests__/bin-stop*.test.ts
pnpm vitest run packages/cli/src/__tests__/disabled-env.test.ts
```

不跑全量 `pnpm test`（per ADR-0013：本地全量在 Mac 上易 thermal throttling，wip/ 推 CI 跑）。

### §V1.3 Claudefast probe — Disabled

```
mkdir -p .fastprobe/issue-343-pr1
TEAMAGENT_DISABLED=1 claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/issue-343-pr1/disabled.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "echo hello"
```

### §V1.4 Claudefast probe — Baseline (control)

```
claudefast -p \
  --output-format stream-json \
  --debug hooks \
  --debug-file .fastprobe/issue-343-pr1/baseline.debug.log \
  --include-partial-messages \
  --verbose \
  --permission-mode acceptEdits \
  "echo hello"
```

（不设 TEAMAGENT_DISABLED）

### §V1.5 Filesystem snapshot

`Probe 1` 之前与之后各做一次 `~/.teamagent/` 目录 mtime 快照：

```
find ~/.teamagent -type f -printf '%T@ %p\n' | sort > .fastprobe/issue-343-pr1/fs-before.txt
# (run §V1.3)
find ~/.teamagent -type f -printf '%T@ %p\n' | sort > .fastprobe/issue-343-pr1/fs-after.txt
diff .fastprobe/issue-343-pr1/fs-before.txt .fastprobe/issue-343-pr1/fs-after.txt > .fastprobe/issue-343-pr1/fs-diff.txt
```

Windows fallback：用 PowerShell `Get-ChildItem -Recurse | Select-Object FullName, LastWriteTime` 等价命令。

---

## §V2 DUMP — evidence 落地

Main agent 把 §V1 各步骤的原始输出整理成 JSON 文件，落到 `docs/plans/2026-05-12-issue-343/evidence/<run-id>/`：

### §V2.1 `vitest.json`

```json
{
  "bin-session-start": { "passed": <n>, "failed": <n>, "exit_code": <n> },
  "bin-pre-tool-use": { "passed": <n>, "failed": <n>, "exit_code": <n> },
  "bin-stop": { "passed": <n>, "failed": <n>, "exit_code": <n> },
  "disabled-env-integration": { "passed": <n>, "failed": <n>, "exit_code": <n> }
}
```

### §V2.2 `probe-disabled.json`

```json
{
  "exit_code": <n>,
  "log_path": ".fastprobe/issue-343-pr1/disabled.debug.log",
  "log_size_bytes": <n>,
  "teamagent_grep_hits": <n>,
  "matcher_grep_hits": <n>,
  "m5_grep_hits": <n>,
  "attributionbus_event_count": <n>
}
```

### §V2.3 `probe-baseline.json`

同上结构。

### §V2.4 `fs-diff.json`

```json
{
  "before_count": <n>,
  "after_count": <n>,
  "mtime_changed_files": [<paths>],
  "delta_empty": <bool>
}
```

---

## §V3 READ — main agent 读 JSON 判 PASS/FAIL

Main agent 读 `evidence/<run-id>/*.json`，按下列**确定性规则**判（grep / count / hash，不走 LLM judge）：

```
PASS 当且仅当:
  vitest.json all suites: failed == 0 AND exit_code == 0
  probe-disabled.json: exit_code == 0 AND teamagent_grep_hits == 0 AND matcher_grep_hits == 0 AND m5_grep_hits == 0 AND attributionbus_event_count == 0
  probe-baseline.json: exit_code == 0 AND teamagent_grep_hits > 0  (sanity: baseline must show TB injection)
  fs-diff.json: delta_empty == true
```

任一不满足 → FAIL → 把失败原因写到 `evidence/<run-id>/verdict.txt` → re-dispatch 失败的 §V<n>。

---

## Re-dispatch protocol

- §V1.2 (vitest) 任一文件 fail → 改代码 → 单独 re-dispatch 这一文件，不动其它
- §V1.3 (disabled probe) `teamagent_grep_hits > 0` → 说明 early-return 没生效在某个 hook → diff probe log 找具体哪一行漏 → 改 → re-dispatch §V1.3 + §V2.2 + §V3
- §V1.4 (baseline probe) `teamagent_grep_hits == 0` → 说明 baseline 也没注入了，是 TB 已经坏了的回归，**不是本 PR 的事** → block PR，开新 issue 报告 TB 整体回归
- §V1.5 (fs-diff) `delta_empty == false` → 说明 disabled 状态下还有人改了 ~/.teamagent/ → diff fs-diff.txt 找文件 → 看是哪个 path 没 early-return → 改 → re-dispatch

---

## Why no fixed bash script

`docs/HOWTO-PLAN-PR.md` hard rule：

> Third-party judge harness forbidden fixed scripts. ... A bash judge becomes code that itself needs a judge (recursive "who tests the test?") and reviewers can't grep judgement logic out of `[[ ]]` exit codes. ... MUST use md playbook. ... Failed sections rerun by re-dispatching `§V<n>`, not by editing scripts.

本 judge harness 严格按此契约：
- 没有 `scripts/judge-issue-343.sh`
- 没有 `[[ $rc -eq 0 ]]` 这种判决
- 全部判决逻辑在 §V3 READ 段 markdown 里写明，reviewer 一眼可 grep
- 失败重跑用 re-dispatch §V<n>，不是 commit fix-script

---

## 相关

- [`./plan.md`](./plan.md) — 本 PR 的三段铁律
- [`./research.md`](./research.md) — 注入面映射 + 风险表
- `docs/HOWTO-PLAN-PR.md` — judge.md md-playbook 硬规则
- `docs/POSTPR.md` — `/review` PASS 后 squash-merge 三步
- ADR-0010 / ADR-0012 — fixture-replay 契约（本 PR 不动）
