```text
                    Issue #90 — Pack CLI Research
                    ─────────────────────────────────
   spec / ADR ──► sibling issues ──► repo prior art ──► implementation pivots
       │                │                    │                       │
       ▼                ▼                    ▼                       ▼
   2026-05-07     #88 #89 #91          init.ts / seed/        scaffold-only
   landing copy   #92 #93 (N1-N6)      resolveSeedPath        registry +
   ADR 0002                            run-judge.sh tmpl      contract
```

# Issue #90 — Pack CLI Research

## 来源

- Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/90
- Spec: `docs/specs/2026-05-07-landing-copy-actually-needed.md` (决策 6 + N3)
- ADR: `docs/adr/0002-stack-detection-via-coding-agent.md`

## ADR 0002 关键 contract（必须落地）

1. **不要硬编码 stack detection**——agent 自己读项目结构、按 pack metadata 决定。
2. `teamagent init` stdout 打印的 markdown prompt 是 **API contract**：
   - 一旦发布，外部 Claude Code / Codex 会按字段 parse；
   - 字段重命名 / 结构变更 = breaking change，必须 `prompt_version` versioned。
3. Pack registry 必须含 machine-readable metadata：`tags`、`description`、`file_hints`。
4. 非 agent 路径必须保留：`--pack all`、`--pack X,Y`。

## Sibling issue 切分（N1–N6）

| Issue | N# | 范围 | 与 #90 关系 |
|---|---|---|---|
| #88 | N1 | `seed/packs/universal.jsonl` ~15 条跨语言 avoidance 规则 | #90 提供机制，#88 填内容；#90 测试用 fixture，**不**在 `seed/packs/` commit 真规则 |
| #89 | N2 | `seed/packs/{frontend-js,python-data,ops-safety,golang,rust}.jsonl` | 同上 |
| **#90** | **N3** | **CLI 子命令 + init stdout prompt** | **本 issue** |
| #91 | N4 | 两阶段 init（substring → 后台 vector 升级） | 不在 #90 范围；#90 init 仍走单阶段 |
| #92 | N5 | `release/install.sh` | 不在 #90 范围 |
| #93 | N6 | `teamagent demo` 命令 | 不在 #90 范围 |

**关键决策**：#90 只造机制 + 占位骨架。`seed/packs/` 在 #90 着陆时为空（或仅 `.gitkeep`）。Init stdout 在空 registry 下要打印 honest fallback `"(no packs shipped in this version)"` 而不是假装有 packs。`pack add X` 在 X 不存在时清晰报错。

## 现有代码 surveys

### `packages/cli/src/commands/init.ts` (940 行)

- `executeInit(opts)` 返回 `InitResult { ok, dryRun, steps[], summary }`。
- 已有 `doDetectStack(cwd)` 调用 `detectStack` (from `@teamagent/core`)，输出形如 `lang=ts+rust  fw=react`——这是被 ADR 0002 拒绝的硬编码逻辑，但**目前仍在 init result 的 `summary.stack` 字段里**用作日志摘要，#90 不动它。
- 新 prompt 必须用**原始文件存在性**（不是 `detectStack` 的推断结果），符合"observe, don't infer"原则。
- `cwdFilePresence(cwd)` 已封装 `exists/read`——可复用作 file_hints 观察源。
- `renderInitResult(result)` 末尾"下一步"段是注入 pack prompt 的合适位置（单独段，icon `📦`）。
- Init 已有 `--codex` / `--claude` / `--both` flag-parsing 模式（`parseInitArgs` 手写循环）——`--pack all|X,Y` 跟随同样模式。

### Seed 文件解析（`resolveSeedPath` 第 361 行）

- 现有逻辑沿 `import.meta.url` 向上查找 `dist/seed/rules.jsonl`（bundled）或 `packages/teamagent/seed/rules.jsonl`（dev）。
- `resolvePacksDir()` 必须沿同样逻辑找 `dist/seed/packs/` 或 `packages/teamagent/seed/packs/`。

### Knowledge entry / store 形状

- `packages/teamagent/seed/rules.jsonl` 每行一个 `KnowledgeEntry`（含 id / scope / category / tags / type / trigger / wrong_pattern / correct_pattern / reasoning / confidence / current_tier 等）。
- `SqliteKnowledgeStore.add(entry)`：重 id 抛错，单条失败不阻断整批（`init.ts` 的 `doLoadSeed` 模板）。
- Pack 规则同样写入 user-global db (`~/.teamagent/global.db`)，与 seed 走同一通道，区别只是规则来源标 tag（如 `pack:frontend-js`）。

### 类似 CLI 命令

- `packages/cli/src/commands/skeleton-demo.ts` (170 行) — 单文件 export 模式：`executeXxx` + `parseXxxArgs` + `renderXxxResult`。
- `packages/cli/src/commands/m5-status.ts` 等 m5-* 命令 — JSON 输出 (`--json`) 模板。
- 新 `pack.ts` 需支持子命令（`list` / `add` / `remove`）——参考更接近的：`config.ts` / `recent-entries.ts` 看是否已有 subcommand 解析模式（写实现时再 grep）。

### Tests 模板

- `packages/cli/src/__tests__/first-run.test.ts` — 注入 cwd / homeDir / dryRun，按步骤断言行为。
- `packages/cli/src/__tests__/m4a-e2e.test.ts` — 端到端断言 init+compile 链路。
- 单测必须覆盖：`pack list`（空 registry / 有 fixture）、`pack list --json` shape、`pack add a,b`（成功 / 不存在的 pack 名 / 部分成功）、`pack remove a`、`init --pack all`、`init --pack X,Y`、`init` 默认（prompt 出现）。

### `run-judge.sh` 模板

参考 `docs/features/canned-answers/run-judge.sh`：

- `set -euo pipefail`
- `RUN_ID=$(date -u +%Y%m%dT%H%M%SZ)-$$`
- `EVIDENCE_DIR=.judge/<feature>/${RUN_ID}`
- 跑 `claudefast -p "..."` 多次，输出落 `${EVIDENCE_DIR}/probe-*.txt`
- 机械 grep 检查 anchors → 写 `judge.json { exit_code, ..., overall_pass, evidence_dir, stdout_path }`
- 写 `verdict.txt` PASS/FAIL，按 `OVERALL_PASS` 决定 exit code

## PRODUCT-FEATURES.md 编号

- 当前最大 ID = 59（"首次运行向导"）。
- #90 着陆时取下一个可用 ID（落地顺序未知，#88/#89/#91 也在排队），plan 内不锁死编号；commit/PR 时再确定。
- 落地区段：新增二级标题 `### Pack management (N3)` 或并入 `### CLI commands`，根据写时上下文。

## 现有 PRODUCT-FEATURES 同款产品功能行格式

```markdown
| <id> | <feature 一句话> | <evidence 路径，e.g. `docs/features/<dir>/run-judge.sh` 或 `packages/.../foo.test.ts`> |
```

新 row 形如：

```markdown
| 60 | `teamagent pack list/add/remove` + `init` agent-driven prompt | `docs/features/pack-cli/run-judge.sh` |
```

## Pack 文件格式决策

**选 Option B：metadata 与 rules 分离**

- `seed/packs/<name>.jsonl` — 每行一个 `KnowledgeEntry`（与 `seed/rules.jsonl` 同 schema）
- `seed/packs/<name>.meta.json` — `{ name, description, tags[], file_hints[], prompt_version: 1 }`

**理由**：

1. JSONL 格式与现有 `seed/rules.jsonl` 一致，复用 entry parser；测试简单。
2. metadata 与 rules 分离让 #88/#89 可以**只**改 jsonl 不动 meta，#90 落地后 schema 稳定。
3. `pack list`（不读 jsonl）只读 `*.meta.json`——`O(packs)` 而不是 `O(rules)`，cheap。
4. Option A（meta 在 jsonl 第一行）需要每次 list 都打开整个 jsonl，浪费 IO。
5. Option C（中央 `index.json`）写 conflict 风险高（多 PR 并发改同一文件）。

## Init stdout prompt format（v1）

```markdown
<!-- teamagent-pack-prompt v1 -->
## TeamAgent: select stack packs

Observed in your project (file presence only — TeamAgent does not infer stack):

- ✓ `package.json`
- ✗ `pyproject.toml`
- ✗ `Cargo.toml`
- ✓ `Dockerfile`
- ✗ `requirements.txt`
- ✗ `go.mod`

Available packs (no packs are currently active):

- **frontend-js** [tags: web, react, javascript, typescript] — frontend JS/TS avoidance rules.
  file_hints: `package.json`, `tsconfig.json`
- **ops-safety** [tags: ops, deploy, secrets] — production / deploy safety rules.
  file_hints: `Dockerfile`, `.env`

**Recommended action** (read by your coding agent): if any of the
file_hints above match observed files, pick the relevant pack(s) and run, e.g.
`teamagent pack add frontend-js,ops-safety`.

Power-user paths (skip this prompt next time):
- `teamagent init --pack all` — install every available pack
- `teamagent init --pack frontend-js,ops-safety` — explicit comma-separated list

<!-- /teamagent-pack-prompt v1 -->
```

**契约要点**：

- 起止 marker `<!-- teamagent-pack-prompt v1 -->` / `<!-- /teamagent-pack-prompt v1 -->`：让 agent 可机器定位段落。
- v1 字段：`Observed`（按固定顺序的 file_hints 列表 ✓/✗）、`Available packs` 每条 `name [tags] — description / file_hints`、`Recommended action` 一行 CTA、`Power-user paths`。
- 空 registry 时 `Available packs` 段写 `(no packs shipped in this version)`，CTA 提示 `teamagent doctor` 以排查。
- 改字段名 / 改 marker / 改顺序 = **breaking change**，必须 bump `v2`。

## 集成点

- `init.ts` 在 `executeInit` 末尾 `summary` 之后，新增 `pack-prompt` step（dryRun 时 dry-print）。
- `init.ts` 增加 `parseInitArgs` 支持 `--pack <value>`（value `all` / `X,Y`）。当 `--pack` 给定时跳过 prompt 段，直接走 `executePackAdd(...)`，按 step 落到 `result.steps`。
- `pack.ts` 单独 export `executePackList` / `executePackAdd` / `executePackRemove`，让 init 复用 add 路径，不重复实现。

## 锁定 anti-goals

| 不做 | 原因 |
|---|---|
| 在 #90 commit 真实 universal / frontend-js / ops-safety 规则内容 | 是 #88 / #89 的范围；混进 #90 增加 review 难度 |
| 在 init 内根据 file presence 推断 stack | ADR 0002 否定硬编码 detection |
| 改 `detectStack` / `summary.stack` | 现有日志逻辑保留；新 prompt 用原始 file presence |
| 实现 `pack search` / `pack create` | issue 只要求 list / add / remove |
| 两阶段 init / 后台 vector 升级 | issue #91 |
| `release/install.sh` / `teamagent demo` | issues #92 / #93 |
| 用 commander.js 引入新依赖 | 现有 init.ts 手写循环 parser，沿用 |

## 风险 & 注意

1. **v1 contract 一旦着陆即冻结**：marker / 字段顺序由本 PR 锁定；改 v1 = breaking。考虑在 plan 评审时把 prompt 文本贴给 reviewer 确认后再码。
2. **`pack remove` 语义**：从 store 真删（不留 tombstone）。**source 不能用 `pack:<name>`**——`packages/types/src/knowledge-entry.ts:103` 的 `source` 是 fixed Zod enum (`preset/imported/accumulated/ingested/team-shared/internet`)，新值会通不过 schema 校验。改方案：pack 入库 entry 用 `source: "imported"` + `tags: ["pack:<name>"]`（free-form string array），`pack remove <name>` 按 `tags.includes("pack:<name>")` 过滤删条目。schema 零改动，向前兼容。
3. **测试 user-global db 隔离**：单测必须用 `homeDir` 注入到 tmp dir，避免污染 `~/.teamagent`。
4. **PR 着陆后 #88 / #89 才有意义**：plan 完成不代表 landing 文案 30 秒承诺兑现；#90 只做 enabler。POSTPR 阶段需 cross-link 到 #88/#89 进度。

## 参考

- `docs/HOWTO-PLAN-PR.md` — 4 段 PR plan 结构
- `docs/feature-verification.md` — 1+2+3 验证 gate
- `docs/FASTPROBE.md` — claudefast 探针 recipe
- `docs/POSTPR.md` — Codex review 循环
- `~/.claude/CLAUDE.md` — testing-judge-harness 三段铁律
