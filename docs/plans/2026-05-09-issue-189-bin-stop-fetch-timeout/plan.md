```
+----------------------------------------------------------------+
|  issue #189 fix plan: bin-stop fetch timeout + concurrency     |
|                                                                |
|  P0-A xenova-rule-embedder loadModel  -> AbortSignal fetch     |
|  P0-B bin-stop semantic-scan          -> Promise.race timeout  |
|  P0-C bin-stop detached spawn         -> single-instance lock  |
|                                                                |
|  Verify: claudefast -p judge.md playbook + /review skill       |
|  Local : rebuild bundle -> ~/.teamagent/hooks -> reproduce hang|
+----------------------------------------------------------------+
```

# Plan: bin-stop fetch timeout + concurrency guard (issue #189)

- **Issue**: <https://github.com/libz-renlab-ai/TeamBrain/issues/189>
- **Branch**: `worktree-189`
- **Worktree**: `.claude/worktrees/189`
- **Date**: 2026-05-09

---

## ① Task description

修复 `bin-stop.cjs` 在 transformers.js 模型下载时永久 hang 导致的 hook 进程指数级泄漏：

**做什么**:
- P0-A: `packages/adapters/src/embedding/xenova-rule-embedder.ts:80–99` `loadModel()` 内对 `globalThis.fetch` 做 AbortSignal-aware 包装（默认 15s/请求），让 transformers.js 内部 fetch 超时后释放 socket。
- P0-B: `packages/cli/src/bin-stop.ts:557–602` 在 `semanticMatch()` 调用外套 `Promise.race(timeout)`（默认 30s），仿 line 441–450 scan-errors 的对称防护。
- P0-C: `packages/cli/src/bin-stop.ts:710–765` 在 detached spawn 之前加 user-level 单例 lock（`~/.teamagent/.stop-pipeline.lock`，存活检查 + 跳过新 spawn）。
- 配套测试: `packages/adapters/src/embedding/__tests__/xenova-rule-embedder-timeout.test.ts` + 扩 `bin-stop.test.ts` 验证 race 与 lock。

**怎么做**:
- 不改 `@xenova/transformers` 依赖版本；只在调用层加 timeout boundary。
- 不改 `tsup.hook.config.ts` 的 noExternal（P1-E 单独 PR）。
- 不动用户 `~/.claude/settings.json` 的 `_teamagentTag` 注册（issue §9 P1）。

**不做什么**:
- ❌ 把 transformers.js 改成 lazy/external（P1，单独 PR）
- ❌ 把 bundle 体积砍到 < 500KB（P2，单独 PR）
- ❌ 改用户 settings.json 删 hook 注册（用户授权范畴）
- ❌ 删除 stop-errors.log 历史日志（保留作证据）

---

## ② Expected outputs

| 类别 | 文件 / 资源 | 验收点 |
|------|------------|--------|
| 源码 patch | `packages/adapters/src/embedding/xenova-rule-embedder.ts` | `loadModel()` 内有 `globalThis.fetch` wrap + `try/finally` 还原 |
| 源码 patch | `packages/cli/src/bin-stop.ts` | semantic-scan 块外有 `Promise.race`；detached spawn 前有 `readPipelineLock` + `isPidAlive` |
| Type | `packages/types/src/attribution.ts` | 新 `HookStopSemanticScanTimeoutEvent` |
| 单测 | `packages/adapters/src/embedding/__tests__/xenova-rule-embedder-timeout.test.ts` | 新文件; mock fetch 永远 pending 但听 AbortSignal; assert embed() 在 < 2× timeout 内 reject |
| 单测扩展 | `packages/cli/src/__tests__/bin-stop.test.ts` 或新 `bin-stop-singleton.test.ts` | 模拟 alive PID; assert spawn 不执行; emit logError("skip-concurrent-stop", ...) |
| Bundle 产物 | `packages/cli/dist/bin-stop.cjs` | `pnpm build:hook` 成功，含新 fetch wrapper bytecode |
| 本机替换 | `~/.teamagent/hooks/bin-stop.cjs` | 旧 7,774,696B 替换为新 build 后的 cjs（体积变化容差 ±5%） |
| Issue comment | issue #189 | 修复完成 + 验证证据链接 |
| PR | normal PR (非 draft, --squash 合并) | `/review` PASS |

---

## ③ Third-party judge harness — md playbook (NOT fixed bash)

Judge harness 走 `docs/plans/2026-05-09-issue-189-bin-stop-fetch-timeout/judge.md`，由 MAIN agent 通过 subagent / `claudefast -p` 派发，输出固定 JSON 到 `.judge/<run_id>/judge.json` + raw evidence。

**§V1 RUN（固定工具集）**:
- `pnpm typecheck` → exit_code, stdout 进 evidence_dir
- `pnpm --filter @teamagent/adapters test xenova-rule-embedder-timeout` → exit_code, stdout
- `pnpm --filter @teamagent/cli test bin-stop` → exit_code, stdout
- 本机 reproducer: `HF_ENDPOINT=http://192.0.2.1 TEAMAGENT_EMBEDDER_FETCH_TIMEOUT_MS=2000 node ~/.teamagent/hooks/bin-stop.cjs <<< '<fake-stop-input>'` → 计时退出 + pgrep 计数
- `gh pr view <N> --json reviews` → /review verdict
- `git diff --stat origin/main...HEAD` → diff size

**§V2 DUMP（fixed JSON shape）**:
```json
{
  "run_id": "...",
  "exit_codes": { "typecheck": 0, "adapters_test": 0, "cli_test": 0, "reproducer": 0, "review": 0 },
  "metrics": {
    "reproducer_exit_seconds": 1.7,
    "pgrep_after_repro": 0,
    "tmp_orphan_files": 0,
    "diff_files_changed": 5,
    "diff_lines_added": 80,
    "diff_lines_removed": 6,
    "review_findings_critical": 0
  },
  "evidence_dir": ".judge/<run_id>/",
  "stdout_path": ".judge/<run_id>/stdout.log"
}
```

**§V3 READ（LLM-as-judge）**:
- 另一只 LLM 只读 `judge.json` + evidence_dir 内的 raw stdout / stderr
- 判定 PASS 条件: 全部 exit_codes == 0 AND reproducer_exit_seconds < 5 AND pgrep_after_repro == 0 AND tmp_orphan_files == 0 AND review_findings_critical == 0
- 判定输出: `verdict: PASS|FAIL|NEEDS_INVESTIGATION` + 一句话理由
- 禁止: 让 fix 作者、被测代码、CI 自身、grep 模式自评

---

## ④ Claudefast probes (BEFORE coding)

为防止 plan 与项目现状脱节，开 patch 前用以下 probes 校准认知（已在 issue 189 第一/二条 comment 完成等价校准；本节作为可重跑契约）:

| Probe | 命令 | 期望命中 |
|-------|------|---------|
| Architecture probe | `claudefast -p "what are the timeout boundaries currently in bin-stop.ts and xenova-rule-embedder?"` | 回答含 "PIPELINE_TIMEOUT_MS=240000 (软超时)" + "loadModel 无 timeout" |
| Bug probe | `claudefast -p "if huggingface.co hangs, what happens to bin-stop.cjs?"` | 回答含 "fetch 永久 pending" + "undici worker thread" + "进程不退出" |
| Fix probe | `claudefast -p "how should the fetch timeout be applied in @xenova/transformers loadModel?"` | 回答含 "wrap globalThis.fetch with AbortSignal.timeout in try/finally" |

Probes 运行结果不作 PR contents 强依赖（仅 calibration）。

---

## Steps

1. ✏️ 写 plan.md + judge.md（本文件）
2. 🔨 P0-A: patch xenova-rule-embedder.ts + add timeout test
3. 🔨 P0-B: patch bin-stop.ts semantic-scan + add type + extend bin-stop.test.ts
4. 🔨 P0-C: patch bin-stop.ts spawn site + lock helpers + add singleton test
5. 🧪 `pnpm typecheck && pnpm test`
6. 🔍 Run `/review` skill, iterate to clean
7. 📦 `pnpm --filter @teamagent/cli build:hook`
8. 🚚 `cp packages/cli/dist/bin-stop.cjs ~/.teamagent/hooks/bin-stop.cjs`
9. 🧪 Local reproducer: HF_ENDPOINT=blackhole + faked stop input → 期望 < 5s exit, no orphan
10. 💬 issue #189 comment + open normal PR
11. ⏳ POSTPR loop: `/review` PASS + Codex bot silent

---

## Risks / rollback

| Risk | 缓解 |
|------|-----|
| globalThis.fetch monkey-patch 影响并发代码 | loadModel 是单线程顺序代码，try/finally 在 await 之后立即还原；并且 _stopEmbedder 是 lazy singleton 不会重入 |
| AbortSignal.timeout(15s) 在慢网络下首次下载超时 | 用户可设 `TEAMAGENT_EMBEDDER_FETCH_TIMEOUT_MS=60000` 覆盖；warmup CLI 路径可单独调大 |
| 单例 lock 误判（PID 复用） | `process.kill(pid, 0)` + `EPERM` / `ESRCH` 双判；lock 文件含 `started_at` 30 分钟过期清除 |
| 测试 mock 与 production transformers.js fetch 路径不一致 | 增本机 reproducer (步骤 9) 作端到端验证 |

回滚: `git revert <merge-sha>` + 重新 `pnpm build:hook` + cp 到 `~/.teamagent/hooks/`。

---

## Dependencies

- `@xenova/transformers` ^2.17.2 (no version bump)
- Node 22.5+ (for `AbortSignal.timeout`)
- pnpm 9.15.9
