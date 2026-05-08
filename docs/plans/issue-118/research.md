```text
       ┌──────────────────────────────────────────────────────────────┐
       │  issue #118 — auto-update audit research (research only)     │
       │                                                              │
       │   7 triggers silently mutate user files / config / runtime:  │
       │                                                              │
       │   ┌─ Stop hook → CLAUDE.md auto-block      (issue #100)      │
       │   ├─ pnpm teamagent compile dual-mode      (compile.ts)      │
       │   ├─ Auto-memory writes ~/.claude/projects (HARNESS, not us) │
       │   ├─ Statusline register/upgrade           (issue #104)      │
       │   ├─ Matcher legacy↔BM25+RRF + migrate-v6  (matcher swap)    │
       │   ├─ Two-stage init vector warmup          (issue #91)       │
       │   └─ Auto-upgrade SessionStart npm i -g    (HIGHEST RISK)    │
       └──────────────────────────────────────────────────────────────┘
```

# Issue #118 Research — TeamBrain 自动更新行为审计

## 范围说明

本文是**事实清单**，**不**包含修复方案。每条触发点列 5 字段 + 源码 file:line + grep 锚点；判定 / 风险 / 修复留给 `plan.md`。两个已存在的 sibling research（#100、#104）只摘其结论与文件链接，不复制内容。

## 1. Stop hook → CLAUDE.md auto-block

| 字段 | 内容 |
|------|------|
| trigger condition | 每条 Stop hook tick；当 caller env 含 `TEAMAGENT_LEGACY_CLAUDE_MD=1` 时进入 legacy 分支 |
| impact scope | `<repo>/CLAUDE.md` 中 `<!-- TEAMAGENT:START -->` / `<!-- TEAMAGENT:END -->` 之间的 managed block |
| audit trail | stdout summary；可选 AttributionBus event；**无持久日志** |
| opt-out | 不要 export `TEAMAGENT_LEGACY_CLAUDE_MD`；或使用 PR #100 修复后的 `executeCompile` 显式传 `legacyClaudeMd:false` |
| 关联 issue | **#100**（修复：`bin-stop.ts:246` 显式传 false） |

源码：`packages/cli/src/bin-stop.ts:246`；`packages/cli/src/commands/compile.ts:80-85` (`resolveLegacyFlag`)；`packages/core/src/compiler/markdown.ts:233-258` (`injectBlockIntoDoc`)。已存 research：`docs/plans/2026-05-07-issue100-stop-hook-claude-md-research.md`。

## 2. `pnpm teamagent compile` 双模式

| 字段 | 内容 |
|------|------|
| trigger condition | 显式 CLI 调用，**或** 7 个内部 caller 自动调用：`bin-stop.ts:246` / `analyze.ts:240` / `calibrate.ts:326` / `pitfall.ts:169` / `review-candidates.ts:187` / `ingest.ts:254` / `init.ts:907` |
| impact scope | 默认：`~/.claude/skills/teamagent/<id>/SKILL.md`（`TEAMAGENT_SKILLS_DIR` 可覆盖）<br>legacy：再写 `<repo>/CLAUDE.md` managed block + `<repo>/AGENTS.md` symlink |
| audit trail | stdout `renderCompileResult()`；可选 AttributionBus event `skills_compiled`；无 file log |
| opt-out | 不传 `--legacy-claude-md`、不设 `TEAMAGENT_LEGACY_CLAUDE_MD`；CLI 还有 `--no-legacy-claude-md` 显式关 |
| 关联 issue | #100（Stop hook 子集） |

源码：`packages/cli/src/commands/compile.ts:106-164` (executeCompile)、`194-220` (parseCompileArgs)；`packages/adapters/src/compiler/skill-compiler.ts:16-70`；`packages/adapters/src/compiler/markdown-compiler.ts:77-112`。测试：`packages/cli/src/__tests__/compile.test.ts`。

## 3. Auto-memory 写 `~/.claude/projects/<slug>/memory/`

| 字段 | 内容 |
|------|------|
| trigger condition | **Claude Code harness 行为**——TeamBrain 代码**不写**，是 user-level CLAUDE.md 指令驱动 harness 自己写 |
| impact scope | `~/.claude/projects/-Users-m1-projects-TeamBrain/memory/*.md` + `MEMORY.md` 索引（当前 7 个文件） |
| audit trail | 由 harness 决定；本仓库无 log；只能 `git status`-style 之外查 file mtime |
| opt-out | DOGFOOD Tier 2/3 redirect `HOME` 到 sandbox（`scripts/dogfood-shim.sh`）；TeamBrain 内**无**全局开关 |
| 关联 issue | 无（DOGFOOD Tier 1 已知 leak） |

源码：codebase grep 命中**零**写入；只有 `claude-session-source.ts` 读取 `.jsonl` transcript。文档：`docs/DOGFOOD.md:56,68,97,99,141,155,217`。**结论：本 issue 真实范围之外的 harness 行为，要在 audit 文档里列入但标 "out-of-tree, harness-driven"。**

## 4. Statusline 注册 / 升级

| 字段 | 内容 |
|------|------|
| trigger condition | `pnpm teamagent init`（调用 `installHook()`）；`statusLine` 不存在或带 `_teamagentTag` 时注册 / 幂等更新 |
| impact scope | `<cwd>/.claude/settings.local.json` `statusLine` 字段；**从不**写 user-level `~/.claude/settings.json` |
| audit trail | init 命令 stdout；无 file log |
| opt-out | `pnpm teamagent uninstall` 删带 `_teamagentTag` 项；按 `_teamagentOriginalScope` (project/user) 还原备份的用户原 cmd |
| 关联 issue | **#104 已修复**（PR #124 merged 2026-05-07）：`install-hook.ts` 现在用 `bash -c '<user_cmd>; echo; <teamagent_cmd>'` chain wrap，备份字段 `_teamagentOriginalCommand` / `_teamagentOriginalType` / `_teamagentOriginalScope` 落 project-level；从不写 user-level `~/.claude/settings.json`。详见 `docs/STATUSLINE.md` |

源码：`packages/cli/src/commands/install-hook.ts:222-244`（注册）/ `316-320`（uninstall）；`packages/cli/src/commands/init.ts:582-604`（init 调用点）。测试：`packages/cli/src/__tests__/install-hook.test.ts:182-262`。已存 research：`docs/plans/2026-05-07-issue104-statusline-research.md`。

## 5. Matcher legacy ↔ BM25+RRF 切换 + migrate-v6

| 字段 | 内容 |
|------|------|
| trigger condition | **5a runtime fallback**：每次 PreToolUse hook 调用；warmup state 不为 `ready` 时静默退到 legacy<br>**5b migrate-v6**：用户显式跑 `pnpm teamagent migrate-v6`，**非自动** |
| impact scope | 5a：runtime only，无 file 改动<br>5b：global SQLite `knowledge.db`（写 `trigger_description` / `pattern_description` / `embedder_model_id` 到 `knowledge` 表；插 / 更 `knowledge_rule_vec` / `knowledge_pattern_vec`；FTS5 同步）；hit_count≥3 的 dormant 规则 status 改 active |
| audit trail | 5a：**默认 silent**——只有 `TEAMAGENT_HOOK_STDERR !== "0"` 时 stderr 才写（`bin-pre-tool-use.ts:206,249`）<br>5b：stdout `migrated=N resurrected=N skipped=N`；stderr per-rule error |
| opt-out | `TEAMAGENT_MATCHER=legacy` 永久走 legacy keyword matcher；migrate-v6 本来就是 user-invoked |
| 关联 issue | M4-B / 0.9.4 release notes（CLAUDE.md 行 184-188） |

源码：`packages/cli/src/bin-pre-tool-use.ts:8-12,89-95,206,249`；`packages/cli/src/commands/migrate-v6.ts:51-165`；`packages/cli/src/bin.ts:716-728`。测试：`packages/cli/src/__tests__/migrate-v6.test.ts`。

## 6. 两阶段 init vector warmup

| 字段 | 内容 |
|------|------|
| trigger condition | 每次 `pnpm teamagent init`，默认 detached spawn；`TEAMAGENT_FOREGROUND_WARMUP=1` 强制同步前台 |
| impact scope | `~/.teamagent/.warmup-state.json`（atomic tmp+rename）；`~/.teamagent/warmup.log`（背景 child 输出） |
| audit trail | init.ts:631 stdout 报 `detached pid=... state=... log=...`；state file JSON 可读；warmup.log 追加 |
| opt-out | `TEAMAGENT_SKIP_WARMUP=1` 跳过；`TEAMAGENT_FOREGROUND_WARMUP=1` 改前台同步可见 |
| 关联 issue | #91 reference（CLAUDE.md 文档） |

源码：`packages/cli/src/commands/init.ts:211-255,589-638` (`spawnDetachedWarmup`)；`packages/cli/src/warmup-state.ts:44-164`；`packages/cli/src/commands/warmup.ts:107-200+`。测试：`packages/cli/src/__tests__/warmup-state.test.ts`、`warmup-state-integration.test.ts`。

## 7. Auto-upgrade（**最高风险**）

| 字段 | 内容 |
|------|------|
| trigger condition | 每次 SessionStart；`shouldCheckUpdate()` 通过（默认 1h debounce、`interval_hours` 字段可调；连续失败 ≥ 3 次时 24h backoff）；`shouldSpawnUpdater()` 通过 → detached spawn |
| impact scope | (a) `npm install -g <tarball>`（**改 global node_modules**）<br>(b) `~/.teamagent/update-state.json`（last_installed_sha / installed_at / consecutive_install_failures / pending_banner）<br>(c) `~/.teamagent/rollback/<sha>/` 备份旧版<br>(d) `~/.teamagent/update.log` append<br>(e) 升级后 spawn `migrate-auto` → `migrate-v6` + `migrate-v7` 改 SQLite |
| audit trail | check 阶段 silent；updater 进程 `stdio='ignore'`；**全部** log 进 `~/.teamagent/update.log`；成功后 `pending_banner` 在下次 SessionStart 由 stderr 显示；失败 24h 节流 alert |
| opt-out | (a) 创建空文件 `~/.teamagent/auto-update.disabled`<br>(b) env `TEAMAGENT_AUTO_UPDATE=0`（注意：env 变量是 `TEAMAGENT_AUTO_UPDATE`，值为 `"0"`，不是 `_DISABLED`） |
| 关联 issue | 无；本 audit 首次系统化记录 |

源码：`packages/cli/src/bin-updater.ts:34,41-45,109-123,187-206`（`PACKAGE_SPEC` HTTPS tarball）；`packages/cli/src/updater-logic.ts:22-86,150-166`；`packages/core/src/update/should-check.ts:14,25`（env / interval_hours）；`packages/core/src/update/update-state.ts:30`（`interval_hours: 1` 默认）；`packages/cli/src/session-start-logic.ts:17,116,134-158,164-175,202-221`；`packages/teamagent/postinstall.mjs:186-212`；`packages/cli/src/commands/migrate-auto.ts:16-29`。测试：`packages/cli/src/__tests__/updater-logic.test.ts`（7 case）+ `session-start-update.test.ts` + `session-start-logic.test.ts` + `packages/core/src/update/__tests__/should-check.test.ts`（核心节流逻辑）。

## 横向汇总（7 + 1 sub-trigger）

| # | 名称 | 自动？ | silent？ | opt-out 类型 | 关联 issue |
|---|------|:------:|:--------:|--------------|-----------|
| 1 | Stop hook → CLAUDE.md | ✅ | 部分（stdout） | env 撤销 | #100 |
| 2 | `compile` 双模式 | ✅ (×7 callers) | 否（stdout） | flag / env | #100 |
| 3 | Auto-memory writes | ✅（**harness**） | 是 | DOGFOOD HOME redirect | — |
| 4 | Statusline 注册 | ✅（init） | 否（stdout） | uninstall / 手动 | #104 |
| 5a | Matcher runtime fallback | ✅（每次 PreToolUse） | **是** | `TEAMAGENT_MATCHER=legacy` | — |
| 5b | migrate-v6 SQLite | ❌（user-invoked） | 否 | 不跑就行 | — |
| 6 | Vector warmup | ✅（init detached） | 部分 | `TEAMAGENT_SKIP_WARMUP` | #91 |
| 7 | Auto-upgrade | ✅（每次 SessionStart） | **是** | disabled 文件 / env | — |

## V2 字段完备性的 grep 锚点（写 audit doc 时供 mechanical check）

每条触发点段落必须含以下 5 类关键字才算 V2 PASS：

- `trigger`（条件）
- `scope` 或 `impact`（影响范围）
- `audit` 或 `log`（trail 位置）
- `opt-out` 或 `disable`（关闭方式）
- `issue`（关联翻车 issue 链接，无关联可写 "no prior issue"）

## 已知 V3 audit-CLI 设计选项（先列、不决策）

- A. 复用 `~/.teamagent/update.log` + `~/.teamagent/warmup.log` + AttributionBus 持久化，新建 `pnpm teamagent audit-auto-updates --since` 聚合查询。
- B. 起 unified event journal（新文件 `~/.teamagent/auto-update-events.jsonl`），每个触发点 emit JSON line。
- C. 纯 `git status --porcelain` + file mtime 解析 + harness 透明性，不引入新存储。

## 开放问题（plan.md 阶段决）

1. trigger 3（auto-memory）是否真的要进 audit doc？属于 harness 行为而非本 repo 代码。建议**列入但标 out-of-tree**，给读者完整图景。
2. trigger 5a 默认 silent fallback 是否要加 banner？涉及性能折衷。
3. trigger 7 是否补 unit test 入 fix scope，还是单独开 issue？
4. V3 选 A / B / C 哪条路？影响 fix patch 大小。
5. audit doc 落到 `docs/auto-update-audit.md` 还是 `docs/knowledge/auto-update-audit.md`？

## 参考

- 本 issue：https://github.com/libz-renlab-ai/TeamBrain/issues/118
- 相关已立 issue：#100（Stop hook → CLAUDE.md）、#104（statusline）、#91（vector warmup）
- 项目规则：`docs/HOW-TO-ISSUE.md`、`docs/HOWTO-PLAN-PR.md`
- 既有 sibling research：
  - `docs/plans/2026-05-07-issue100-stop-hook-claude-md-research.md`
  - `docs/plans/2026-05-07-issue104-statusline-research.md`
