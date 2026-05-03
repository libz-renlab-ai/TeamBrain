# Feature: Real-time Intercept (PreToolUse Hook)

```
        Claude Code
            │
            ▼  stdin JSON  { tool_name, tool_input, cwd, ... }
   ┌──────────────────────┐
   │ bin-pre-tool-use.cjs │  packages/cli/src/bin-pre-tool-use.ts
   └─────────┬────────────┘
             ▼
   ┌──────────────────────┐
   │   Matcher (port)     │  packages/ports/src/matcher.ts
   │  semantic ──┐        │
   │   BM25 + dense       │
   │   RRF(k=60)          │
   │   soft-AND  ─┐       │
   │  legacy substring    │  fallback when TEAMAGENT_MATCHER=legacy
   └─────────┬────────────┘
             ▼
   ┌──────────────────────┐
   │ pre-tool-use-sdk.ts  │  → enforcement → stdout JSON
   └─────────┬────────────┘
             ▼
   block (deny) | warn (allow + systemMessage) | suggest | passive (allow)
```

## Goal

在 AI 真正动手前一拍拦下来：把工具调用送进规则匹配器，命中高置信度的 avoidance 规则就直接 `deny`，命中 practice/低置信度就发 warn/suggest，落地到 Claude Code 的 PreToolUse permission decision。

## Status

| 里程碑 | 状态 | 说明 |
|--------|------|------|
| M2 | ✅ shipped | 真实 Claude Code PreToolUse 拦截通路打通 |
| M3 | ✅ shipped | rule-based detector，matcher 检查 `wrong_pattern` 而非 `type`（避免漏掉 34 条 practice 规则） |
| M4-A | ✅ shipped | 输出层拦截 + 通道分类（`ai-narrative` 退出 PreToolUse） |
| M4-B | ✅ shipped (≥0.9.4) | matcher 升级 BM25 FTS5 + dense vec0 双 kNN → RRF(k=60) → soft-AND 打分 |
| Feature eval (2026-05-02) | ✅ 8/8 PASS | 第三方 judge harness 验证 doctor / DOGFOOD / FASTPROBE / BUGREPORT canned answers |

默认 matcher = semantic (BM25+dense RRF + soft-AND)。Legacy substring 仍保留，可通过 `TEAMAGENT_MATCHER=legacy` 强制开启。

## How it works

```
PreToolUse hook fires
   │
   ▼ stdin JSON: { tool_name, tool_input, cwd, transcript_path, ... }
bin-pre-tool-use.ts                                packages/cli/src/bin-pre-tool-use.ts:43
   │ readStdinJson + skip when no tool_name
   ▼
buildToolActionSummary(tool_name, tool_input)      packages/cli/src/pre-tool-use-context.ts:5
   │ Bash/Edit/Write/Read/Grep/Glob → 中文动作摘要
   ▼
TEAMAGENT_MATCHER=legacy ?                         packages/cli/src/bin-pre-tool-use.ts:80
   │   ├─ yes: keywordMatch (substring)            packages/core/src/matcher/legacy/keyword-matcher.ts:38
   │   └─ no : semanticMatch
   ▼
SqliteSemanticRetriever.retrieve()                 packages/adapters/src/retriever/sqlite-semantic-retriever.ts
   │ BM25 FTS5  + dense_trigger vec0  + dense_pattern vec0
   │ → RRF(k=60) 融合 top-20 候选
   ▼
soft-and-scorer.scoreSoftAnd()                     packages/core/src/matcher/soft-and-scorer.ts
   │ score = w1·trigSim + w2·pattSim
   │       − w3·max(0, τ_floor − min(trigSim, pattSim))
   │       − w4·max(hardNegativeSims)
   │ DEFAULT_SOFTAND: w1=0.4, w2=0.4, w3=0.3, w4=0.5, τ_floor=0.50, fire>0.55
   ▼
mergeSemanticAndLegacyMatches(...)                 packages/cli/src/pre-tool-use-merge.ts:8
   │ 排序 + 去重 → KnowledgeEntry[]
   ▼
createPreToolUseHandler(deps)                      packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts:44
   │ enforcement = computeEnforcement(confidence, nature)
   │   confidence ≥ 0.9 + objective + enforcement=block → block
   │   confidence ≥ 0.7 OR subjective                  → warn   (subjective 永远封顶 warn)
   │   confidence ≥ 0.5                                → suggest
   │   confidence <  0.5                                → passive
   ▼ stdout JSON
{ hookSpecificOutput: { hookEventName: "PreToolUse",
                        permissionDecision: "deny"|"allow",
                        permissionDecisionReason?: "...",
                        systemMessage?: "..." } }
```

**Schema**：`packages/types/src/knowledge-entry.ts:69` — `type ∈ {avoidance, practice}`。
**M3 关键修复**：matcher 不再按 `type` 过滤，而是检查 `wrong_pattern` 是否非空 — 让 34 条带 wrong_pattern 的 practice 规则也进入运行时拦截（其中 11 条 `enforcement=block`）。

**异常退化**：bin-pre-tool-use.ts 任何错误都 `exit 0` 不阻断 Claude Code 工作流；缺 `tool_name` 的 hook 调用静默放行。

## How to verify

非交互一句话：

```bash
claudefast -p "what is TeamBrain's real-time interception (PreToolUse Hook) feature? \
include implementation status, matcher details (BM25+dense RRF + soft-AND), \
practice vs avoidance, known limits"
```

合格锚点（grep 命中）：`PreToolUse` `BM25` `RRF` `soft-AND` `avoidance` `practice` `block` `warn` `TEAMAGENT_MATCHER=legacy`。

单元覆盖：`packages/adapters/src/hook/claude-agent-sdk/__tests__/pre-tool-use-sdk.test.ts`（20+ cases：allow / deny / warn / comply / verbose / smart / silent）。
端到端：`packages/cli/src/__tests__/install-hook.test.ts` + `e2e-evaluate.test.ts`。

Hook 协议参考：`docs/SYSTEM/07-hooks.md`（stdin JSON 示例 + HookOutput）。

## Known limitations

- **Subjective 永远封顶 warn**：`computeEnforcement` 即使 confidence ≥ 0.9，只要 `nature=subjective` 也只能 warn，不能 block。意图：避免主观偏好直接挡 AI。
- **Substring 回滚开关**：matcher 出问题可一键回退 — 设 `TEAMAGENT_MATCHER=legacy` 走老 substring 路径，不加载 embedder（`packages/cli/src/bin-pre-tool-use.ts:80`）。
- **Embedder 懒加载 + 进程内单例**：`XenovaRuleEmbedder` 在 process 内复用；hook 进程长生命周期才能摊薄首次加载延迟。
- **Hook 延迟硬约束 <5ms**：matcher port 注释要求 100 条规则上 <5ms 命中；超出会拖慢 Claude Code 每一次工具调用。
- **sqlite-vec native binding 缺失时静默降级**：vec0 不可用时 dense 路径关闭，只剩 BM25 + legacy fallback；不报错但召回会下降。
- **Windows vitest 并发 OOM**：`fileParallelism: false`，测试顺序跑（不影响生产 hook，影响开发 e2e）。
- **AI message 上下文为空**：PreToolUse stdin 不带历史 narrative，`contextText = actionText`，对话语境缺失影响语义召回准确度。

## Links

- Hook 入口 (CLI bin)：`packages/cli/src/bin-pre-tool-use.ts`
- Handler (allow/deny/warn 决策)：`packages/adapters/src/hook/claude-agent-sdk/pre-tool-use-sdk.ts`
- Matcher port：`packages/ports/src/matcher.ts`
- Semantic retriever (BM25+dense RRF)：`packages/adapters/src/retriever/sqlite-semantic-retriever.ts`
- Soft-AND scorer：`packages/core/src/matcher/soft-and-scorer.ts`
- Legacy keyword matcher：`packages/core/src/matcher/legacy/keyword-matcher.ts`
- Schema (`type`/`wrong_pattern`/`enforcement`)：`packages/types/src/knowledge-entry.ts`
- Action 摘要构造：`packages/cli/src/pre-tool-use-context.ts`
- 语义/legacy 合并：`packages/cli/src/pre-tool-use-merge.ts`
- Hook 协议 + stdin/stdout 示例：`docs/SYSTEM/07-hooks.md`
- M4-B 完整 spec：`docs/superpowers/specs/2026-04-24-m4b-semantic-matcher-design.md`
- M3 block-circumvention 设计：`docs/superpowers/specs/2026-04-22-m3-block-circumvention.md`
- M4-A 输出层拦截设计：`docs/superpowers/specs/2026-04-23-m4a-output-layer-interception-design.md`
- 系统层架构：`docs/SYSTEM/03-architecture.md`
- 当前 limitations 汇总：`docs/SYSTEM/09-limitations.md`
