# Auto-capture Correction Moments

```
   ┌────────────┐
   │ Claude     │  user: "no, use dayjs not moment"  (correction moment)
   │ Code chat  │
   └─────┬──────┘
         │ Stop event (session end)
         ▼
   ┌────────────────────────────────────────────────────────────┐
   │ bin-stop.ts  →  runStopPipeline()  (async, never blocks)    │
   ├────────────────────────────────────────────────────────────┤
   │ 1 analyze       transcript → 5-signal detector → LLM extract│
   │ 2 calibrate     Wilson score + demerit + tier hysteresis    │
   │ 3 compile       canonical+ → CLAUDE.md   stable+ → SKILL.md │
   │ 4 harvest       append .teamagent/last-harvest.md           │
   │ 4b catch-up     fire-and-forget vectorize backlog (≤15)     │
   │ 5 scan-errors   tool failures → candidates.db               │
   │ 6 narrative     last-AI-turn substring + M4-B BM25/RRF      │
   └─────┬──────────────────────────────────────────────────────┘
         │ writes
         ▼
   knowledge.db ─┐
   events.db    ─┤→ next session: PreToolUse hook reads → block / warn
   pending_warn ─┘   "same person never has to correct twice"
```

## Goal

每次 Claude Code 会话 `Stop` 时，自动从 transcript 中识别用户对 AI 的纠正信号（"correction moment"），把弱信号提取为结构化 `KnowledgeEntry` 入库，供下次 PreToolUse / UserPromptSubmit 复用——**同一个人不需要纠正第二次**。

## Status

| 维度 | 现状 |
|------|------|
| 6 步流水线 | ✅ 已 ship（M2.10 + M4-A/B），见 `runStopPipeline` |
| 5 种 correction 信号 | ✅ explicit_denial / multi_failure / suggestion_override / code_edit / error_in_context |
| 生产证据 | ✅ **199** 条知识条目（95 active）、**748** 次 hook-pre.passed 拦截，来自真实 user session（不是 fixture），见 `docs/dogfood/自举报告.md` |
| P0/P1 bug | ✅ 全部 fixed（B-026/030/031/045/051/064/065/066/068/069/070/086 …） |
| Calibrate | ⚠️ **从未运行**（`自举报告.md` 显示 0 次 adjust），confidence 全程默认 0.7 |
| analyze 实质提取效率 | ⚠️ **~10%**：约 90% Stop 事件因 transcript 不存在（subagent / vitest）或向量缺失走 fallback |
| MCP Server / Team scope / Session Monitor | ❌ Phase 2/3 roadmap，未实现 |

## How it works

### Stop hook 注册与 transcript 传递

- 注册：`packages/cli/src/commands/install-hook.ts:204-220` — tag `teamagent-stop`，写入 `~/.claude/settings.local.json`，`command: node <stopEntry>`，`timeout: 60`
- 入口：`packages/cli/src/bin-stop.ts` — 从 stdin 或 detached `argv[2]` tmp 文件读 `StopHookInput { session_id, transcript_path, cwd, hook_event_name }`
- transcript 不内嵌，给一个 `transcript_path` 指向 `~/.claude/projects/.../session-xxx.jsonl`，hook 自己读
- 主进程 `exit 0` 立即返回；async 模式 spawn detached 子进程跑 pipeline，永不 block 会话关闭

### 6 步 pipeline（`runStopPipeline`）

| Step | 文件 | 输入 → 输出 |
|------|------|------------|
| 1 analyze | `packages/cli/src/commands/analyze.ts` + `packages/core/src/pipeline/extract-pipeline.ts` | transcript → CorrectionMoment[] → LLM `extract()` → L0 gate → `store.add()` |
| 2 calibrate | `packages/cli/src/commands/calibrate.ts` + `packages/core/src/calibrator/v2/` | events.db → Wilson score + demerit + 5-tier (experimental→probation→stable→canonical→enforced) + hysteresis → `knowledge.db` |
| 3 compile | `packages/cli/src/commands/compile.ts` + `packages/core/src/scorer.ts` | active rules → `score = conf×0.4 + hits×0.3 + recency×0.2 + enforce×0.1` → CLAUDE.md (canonical+, ≤3000 tok) + `~/.claude/skills/teamagent/<id>/SKILL.md` (stable+) |
| 4 harvest | `packages/cli/src/harvest-writer.ts` | new entries → append `.teamagent/last-harvest.md` |
| 4b catch-up | `packages/cli/src/bin-stop.ts` (`catchUpVectorization`) | rules without embedding → vectorize ≤15/run, fire-and-forget |
| 5 scan-errors | `packages/cli/src/bin-stop.ts` + `packages/cli/src/commands/scan-errors.ts` + `packages/ports/src/error-signal-collector.ts` | tool failures (A/B/C/D/G/H 六类) → `candidates.db` |
| 6 narrative-scan | `packages/core/src/narrative-scanner/scan.ts` + `packages/cli/src/stop-narrative-scan.ts` | last AI assistant turn → substring + M4-B BM25/dense RRF → `pending_warnings.json` → next-turn UserPromptSubmit 注入 |

### 5 种 correction 信号（rule-based detector）

| Signal | 触发 | 权重 |
|--------|------|------|
| `explicit_denial` | 用户消息含显式否定（中：不对/错了/别这样/不要；英：no/wrong/don't/shouldn't） | 0.80–0.95 |
| `multi_failure` | 上一 turn tool call `succeeded=false`，无论用户是否介入 | 0.70–0.85 |
| `suggestion_override` | AI 推 X，用户说"用 Y 吧"且 Y 不在 AI 原文里 | 0.80 |
| `code_edit` | 用户说"我改了" 或 当前 AI 的 `Edit` 工具 new_string 远长于 old_string | 0.80 |
| `error_in_context` | 用户贴错误栈/报错信息，且上一 turn 有 AI tool call | 0.80 |

防噪声（B-064 fix）：`<system-reminder>` / `<local-command-caveat>` / `<command-*>` tag 包裹的 turn 整段跳过；礼貌请求（"能…吗？" / "可以…吗？" ≤80字以问号结尾）不触发 explicit_denial。

文件：`packages/core/src/correction-detector/rule-based.ts` 实现 `CorrectionDetector` Port (`packages/ports/src/correction-detector.ts`)。

### 增量 vs 全量扫描

- 增量（Stop 时）：`packages/cli/src/scan-cursor.ts` 维护 `.teamagent/scan-cursor.json`，只扫新 turn
- 全量（SessionEnd / PreCompact）：`runFullRescanPipeline` 清 cursor 重新扫
- 去重：`momentSignature = sha256(turnIndex|signal|correctionText[:200]|previousAssistantText[:200])` → 同 moment 不重复发给 LLM

## How to verify

在 sandbox（不要在 main repo）跑 FASTPROBE：

```bash
SANDBOX=$(cat /tmp/dogfood-sandbox-feature-1-capture.path)
REPO_ROOT=$(git rev-parse --show-toplevel)
bash "$REPO_ROOT/scripts/dogfood-sync.sh" --sandbox "$SANDBOX" -q
cd "$SANDBOX" && claudefast -p "what is TeamBrain's auto-capture-correction-moments feature? include implementation status, file paths, pipeline stages, known limits"
```

合格 grep 锚点（必须全部命中）：

- 字面词：`auto-capture` / `correction moment`
- 入口：`Stop Hook` 与 `bin-stop.ts`
- 三阶段：`analyze` / `calibrate` / `compile`
- 生产数字：`199`（知识条目）或 `748`（hook 拦截）任一
- 已知限制：`B-064` 或 `Calibrate 从未运行` 任一

## Known limitations

| ID / 项 | 严重 | 状态 |
|---------|------|------|
| B-064 — `analyze` 把 QA 测试请求和 skill 系统消息识别为 explicit_denial 污染规则库 | P1 | fixed (wave9) |
| B-065 — pitfall 归因显示 "传播到 CLAUDE.md 第 0 行" 实际写入 SKILL.md | P2 | fixed (wave9) |
| B-066 — `demo hook` 写入事件被 calibrate 当真 → 置信度 0.70→0.83 | P2 | fixed (wave9) |
| B-051 — `scan-cursor` `writeSeen` 并发竞态可重置 `last_scanned_turn=-1` | P2 | fixed |
| B-086 — `install-user-hook` 未按 command path 去重，旧 untagged 条目无法 uninstall | P1 | fixed |
| LLM 提取超时 ≥30s — Stop hook 嵌套超时风险（55s 总） | — | mitigation: `teamagent config stop-mode async` |
| Token 开销 +52% 每会话 | — | roadmap: tier 分层注入、更精准 hook trigger |
| Windows vitest OOM | — | `fileParallelism: false`，stable workaround |
| sqlite-vec 平台缺 native binding | — | 向量功能静默降级，其他正常 |
| **Calibrate 从未运行** — 生产 `自举报告.md` 显示 0 次 adjust，confidence 全程 0.7 | active | feature-3-calibrate 处理 |
| **analyze 实质提取效率 ~10%** — 90% Stop 因 transcript 不存在或向量缺失走 fallback | active | tracked |
| MCP Server / Team scope / Session Monitor | — | Phase 2/3 roadmap |

完整收敛状态见 `bugs.md`：B-001~B-090 共 75 fixed / 8 withdrawn / 1 wontfix-merged / 0 open，P0/P1 全部清零。

## Links

- 数据流权威源：`docs/SYSTEM/04-data-flow.md`
- 生产 dogfood 报告：`docs/dogfood/自举报告.md`
- Hook 总览：`docs/SYSTEM/07-hooks.md`
- 限制清单：`docs/SYSTEM/09-limitations.md`
- M2.10 设计 spec：`docs/superpowers/specs/2026-04-17-m2.10-close-the-loop-design.md`
- Bug history：`docs/SYSTEM/10-bug-history.md` + `bugs.md`
