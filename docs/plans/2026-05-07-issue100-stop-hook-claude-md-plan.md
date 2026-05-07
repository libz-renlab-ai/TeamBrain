```text
                    ┌────────────────────────────────────────────┐
                    │  issue #100 — Stop hook 重写 CLAUDE.md     │
                    │  auto-block 修复计划                       │
                    └────────────────────────────────────────────┘

   现象：每次 Stop hook tick → CLAUDE.md TEAMAGENT auto-block 被刷新
         → worktree dirty → git ops 阻塞 → PR merge 冲突

       ┌────────────────┐
       │ 1. 删除 auto-  │
   ┌──►│    block       │── CLAUDE.md 不再含 TEAMAGENT:START/END
   │   └────────────────┘
   │   ┌────────────────┐
   │   │ 2. bin-stop    │
   ├──►│    legacy=false│── Stop hook 永不进 markdown 写入分支
   │   │    显式锁死    │
   │   └────────────────┘
   │   ┌────────────────┐
   │   │ 3. 回归测试    │
   └──►│    byte-equal  │── 跑完 pipeline，CLAUDE.md 字节相等
       └────────────────┘
                │
                ▼
       V1..V4 judge harness（issue #100 锚点）
                │
                ▼
       open normal PR → POSTPR loop until 👍
```

# Plan — issue #100 修复

修 [issue #100](https://github.com/libz-renlab-ai/TeamBrain/issues/100)：
Stop hook 在每次 tick 后改写 `CLAUDE.md` 中 `<!-- TEAMAGENT:START -->...<!-- TEAMAGENT:END -->`
自动管理块，导致 worktree 反复 dirty 与 PR merge 冲突。

研究上下文见同目录 `2026-05-07-issue100-stop-hook-claude-md-research.md`。

## ① Task description（做什么 / 怎么做 / 不做什么）

### 做什么

让 Stop hook（`packages/cli/src/bin-stop.ts` 调用 `executeCompile`）在**任何**默认会话条件下都不再改写
根目录 `CLAUDE.md`，并把已提交在 `CLAUDE.md` 行 320–350 的 TEAMAGENT auto-block 删除。
保留 `pnpm teamagent compile --legacy-claude-md` 这条**显式 CLI opt-in**，让需要老行为
的人手动调出来；除此之外没有任何路径写 CLAUDE.md。

### 怎么做（三个原子 commit，对应 `CLAUDE.md` 项目规则的"原子提交"约束）

1. `docs(claude-md): drop committed TEAMAGENT auto-block (#100)`
   - 编辑 `CLAUDE.md`：删除第 320–350 行整段
     `<!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->...<!-- TEAMAGENT:END -->`
     连同其上一行的空行；不动该 marker 之外的任何内容。
   - 同 commit **不**改 ts/sh 源码，让 diff 只是 docs 类。
2. `fix(stop-hook): never write CLAUDE.md from Stop pipeline (#100)`
   - 修改 `packages/cli/src/bin-stop.ts:246` 那一行：
     ```ts
     await executeCompile({ cwd, legacyClaudeMd: false });
     ```
     显式传 `legacyClaudeMd: false`，覆盖父进程可能泄漏的 `TEAMAGENT_LEGACY_CLAUDE_MD=1` env。
   - 同样模式应用到 `packages/cli/src/commands/calibrate.ts` 内部的 `runCompile` 调用：
     已经不传 `markdownCompiler` / `writeMarkdown`，本身就是 Skills-only，
     **本 PR 不动 calibrate**——它已经满足规范。
   - **不**修改 `executeCompile` 函数本身的 env 读取逻辑——`pnpm teamagent compile`
     的 CLI 行为保持向后兼容；只在 hook 入口处显式覆盖。
3. `test(stop-hook): regression — CLAUDE.md byte-equal across Stop pipeline (#100)`
   - 在 `packages/cli/src/__tests__/bin-stop.test.ts` 加一个 case：
     - 用 `tmp` cwd 准备一个虚拟 `CLAUDE.md`（带任意 prose 内容）。
     - mock `executeAnalyze` / `executeCalibrate` / `executeCompile` 中需要的依赖，
       或直接调 `executeCompile({ cwd, legacyClaudeMd: false })` 后比较字节。
     - 设置 `process.env.TEAMAGENT_LEGACY_CLAUDE_MD = "1"` 模拟 env 泄漏，
       仍然要求 byte-equal——这是 V3 的核心断言。

### 不做什么（anti-goals）

- **不**改 `executeCompile` 的 `--legacy-claude-md` CLI flag 行为或 `MarkdownCompiler` 实现。
  保留它供需要老行为的用户显式 opt-in。
- **不**改 `pnpm teamagent compile`（无 flag）的对外契约——它已经是 Skills-only，本 PR 不动。
- **不**改 `.claude/settings.json` 里 Stop hook 的注册——hook 还要继续跑
  analyze/calibrate/skill compile/scan-errors/narrative scan，只是不再改 `CLAUDE.md`。
- **不**改全局安装的 `$(npm root -g)/teamagent/dist/bin-stop.cjs`——那是用户机器
  上的旧二进制问题，本 PR 修源码 + dist 由 `pnpm build` 重出。
- **不**做 docs/knowledge/INDEX.md 文案改写。它已经写了
  *"Generated rule dumps must not be written back into root CLAUDE.md."*
  本 PR 实现层对齐这条承诺即可。
- **不**重命名/重构其他相关命令（doctor / install-hook / uninstall）——
  它们的 CLAUDE.md 处理路径与本 issue 的 Stop-hook 改写路径无关，
  doctor 的 `stripLegacyTeamagentBlock` 是相反方向（剥离老块），是友好的而非破坏的。

## ② Expected outputs（reviewer 可勾选清单）

### 文件改动

| 文件 | 改动 | 字节级期望 |
|------|------|-----------|
| `CLAUDE.md` | 删除第 320-350 行 TEAMAGENT auto-block | `grep -c "TEAMAGENT:START" CLAUDE.md` 输出 `0` |
| `packages/cli/src/bin-stop.ts` | 第 246 行 `executeCompile({ cwd })` → `executeCompile({ cwd, legacyClaudeMd: false })` | 该 diff 仅一行 |
| `packages/cli/src/__tests__/bin-stop.test.ts` | 新增 1 个 test case `regression: never writes CLAUDE.md even when TEAMAGENT_LEGACY_CLAUDE_MD=1` | `pnpm test --filter @teamagent/cli bin-stop` 全绿 |
| `docs/plans/2026-05-07-issue100-stop-hook-claude-md-plan.md` | 本计划文件 | 已存在 |
| `docs/plans/2026-05-07-issue100-stop-hook-claude-md-research.md` | 研究记录 | 已存在 |
| `docs/plans/2026-05-07-issue100-stop-hook-claude-md-report.md` | PR 完成时写 | PR 提交时存在 |

### CLI / 行为可观测断言

| 断言 | 命令 | 期望 |
|------|------|------|
| `pnpm test` 全绿 | `pnpm test --filter @teamagent/cli` | `exit 0` |
| `pnpm typecheck` 全绿 | `pnpm typecheck` | `exit 0` |
| Stop hook tick 后 CLAUDE.md 字节不变 | 见 § ③.V1 | `git status --porcelain CLAUDE.md` 空输出 |
| `TEAMAGENT_LEGACY_CLAUDE_MD=1` 环境下 Stop hook 仍不写 | 见 § ③.V3 | bin-stop test 用例 PASS |

### PR 产物

- 一个**普通**（非 draft）PR 提到 `main`，commit message 三段：
  - `docs(claude-md): drop committed TEAMAGENT auto-block (#100)`
  - `fix(stop-hook): never write CLAUDE.md from Stop pipeline (#100)`
  - `test(stop-hook): regression — CLAUDE.md byte-equal across Stop pipeline (#100)`
- PR description 引用本 plan 文件 + V1..V4 验证证据。
- 1+2+3 feature-verification 的 `/export` transcript 文件附在 PR description。
- POSTPR loop 跑到 Codex 👍 或 silent。

### Anti-goals（reviewer 用来反查 scope）

- **不**触动以下文件：`packages/core/src/pipeline/compile-pipeline.ts`、
  `packages/cli/src/commands/compile.ts` 的 CLI 解析逻辑、
  `packages/adapters/src/compiler/markdown-compiler.ts`、
  `packages/adapters/src/compiler/rule-compiler-factory.ts`、
  `.claude/settings.json`。
- **不**让 `pnpm teamagent compile --legacy-claude-md` 的行为退化：
  显式 opt-in 仍然要能正常写 CLAUDE.md（向后兼容）。
- **不**新增任何 user-level（`~/.claude/...`）写入或读取。

## ③ How-to-verify（third-party judge harness）

### 3a. 项目级 1+2+3 feature-verification gate（必跑）

按 `docs/feature-verification.md`：

1. `!claudefast -p "what does pnpm teamagent compile --help print today?"` → canonical JSON。
2. `!codex exec --skip-git-repo-check -s read-only "what does pnpm teamagent compile --help print today?"` → canonical JSON。
3. `jq -S` + `diff -u`：两份 JSON 在 anchors `--legacy-claude-md`、`--skills-only`、
   `Skills-only`、`legacy CLAUDE.md` 上 byte-identical。
4. tmux 跑 interactive `claudefast`，最后 `/export <path>` 把 transcript
   存到 `docs/plans/2026-05-07-issue100-stop-hook-claude-md.export.jsonl`，
   作为 PR 附件。

### 3b. issue #100 V1..V4 验证清单

按 [issue #100 修复验证清单](https://github.com/libz-renlab-ai/TeamBrain/issues/100) 原文要求执行：

#### V1：Stop hook tick 后 worktree 保持干净

```bash
cd <fresh checkout of fix branch>
pnpm install
pnpm build
# 启动 claudefast 跑任意 N 次 prompt（fire Stop hook 至少 N 次）
git status --porcelain
```

期望：输出为空。`CLAUDE.md` 不出现在结果中。

#### V2：PR + main 同时有 Stop hook 历史时 merge 不再冲突

```bash
git fetch origin
git merge origin/main --no-edit
```

期望：`CLAUDE.md` 在 `<!-- TEAMAGENT:START -->...<!-- TEAMAGENT:END -->` 区域不再出现冲突标记
（因为该 marker 已被本 PR 删除）。

#### V3：与项目自身承诺一致（byte-equal 默认 + opt-in legacy）

```bash
# 默认行为
sha1=$(shasum CLAUDE.md | awk '{print $1}')
TEAMAGENT_LEGACY_CLAUDE_MD=1 node packages/cli/dist/bin-stop.cjs <<EOF
{"session_id":"v3","transcript_path":"/tmp/empty","cwd":"$PWD","hook_event_name":"Stop"}
EOF
sha2=$(shasum CLAUDE.md | awk '{print $1}')
[ "$sha1" = "$sha2" ]   # 期望：true
```

期望：即使 env `TEAMAGENT_LEGACY_CLAUDE_MD=1` 设置，hash 仍然相等。
显式 `pnpm teamagent compile --legacy-claude-md` 仍能写 CLAUDE.md（向后兼容，回归测试覆盖）。

#### V4：claudefast 探针能力不被破坏

```bash
claudefast -p "what product features are actually needed for this repo ?"
```

期望返回内容包含以下锚点（10/11 命中）：

- `docs/specs/2026-05-07-landing-copy-actually-needed.md`
- `8` 个浮上 landing 的 feature
- `6` 个新 feature（`N1` … `N6`）
- `30 秒` / 30-second hook
- `PreToolUse` / `moment` / `dayjs`

所有锚点的命中证据写到 PR description。

### 3c. Plan-specific judge harness（轻量，optional 但推荐）

把 V1..V4 跑成一个脚本，dump JSON：

```bash
bash scripts/issue100/judge.sh > .judge/issue100/judge.json
# JSON 结构：
# {
#   "exit_code": 0,
#   "metrics": {
#     "v1_worktree_clean": true,
#     "v2_no_merge_conflict": true,
#     "v3_byte_equal_under_legacy_env": true,
#     "v4_anchor_hits": 11
#   },
#   "evidence_dir": ".judge/issue100/",
#   "stdout_path": ".judge/issue100/stdout.log"
# }
```

最后用 `claudefast -p`（独立的 LLM judge，不是写代码的 agent）只读 `judge.json`
+ evidence dir，输出 PASS / FAIL。脚本 + judge prompt 只在本 PR 范围内活，
不进 `scripts/`，避免污染其他 PR。

## ④ Claudefast probes — 实施前跑

按 `docs/FASTPROBE.md` 三步：

### 4.1 Orient

```bash
claudefast -h | head -80
```

确认当前 flag list（`-p`、`--output-format stream-json`、
`--include-partial-messages`、`--debug hooks`、`--debug-file`、
`--permission-mode acceptEdits`、`--verbose`）。

### 4.2 Heavy + needs conclusion（最多 8 路并行）

实际只需 4 路（issue 已经写得清楚）：

1. **当前 CLAUDE.md 块的 git blame 来源** —— 验证 commit 40886a0 是 pickup 的来源，
   排除其他 commit 也写过。
   ```
   claudefast -p "git log -L '/<!-- TEAMAGENT:START/,/<!-- TEAMAGENT:END/:CLAUDE.md' --oneline | head -20，列出所有写过 TEAMAGENT auto-block 的 commit SHA + 标题"
   ```
2. **`packages/cli/dist/bin-stop.cjs` 是否存在 + 内容是否含 LEGACY env 检查** ——
   确认实际跑的二进制版本。
   ```
   claudefast -p "ls packages/cli/dist/bin-stop.cjs; if exists, grep TEAMAGENT_LEGACY_CLAUDE_MD packages/cli/dist/bin-stop.cjs | head -5"
   ```
3. **calibrate.ts / analyze.ts 是否会绕过 bin-stop 直接写 CLAUDE.md** ——
   交叉验证只有 hook 路径需要锁，CLI 路径已经满足。
   ```
   claudefast -p "find all writers of CLAUDE.md across packages/cli/src/commands/*.ts and packages/core/src/**/*.ts. List file:line + the function that triggers the write."
   ```
4. **bin-stop.test.ts 现有结构** —— 看现有 test framework / mock 风格，决定新增 case 怎么写。
   ```
   claudefast -p "read packages/cli/src/__tests__/bin-stop.test.ts and summarize：(a) which mocks already exist for executeAnalyze/executeCalibrate/executeCompile，(b) the test runner pattern (vitest)，(c) where to insert a new 'never writes CLAUDE.md' case."
   ```

### 4.3 Audit-grade evidence（仅 V4 锚点检查需要）

```bash
mkdir -p .fastprobe
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --debug hooks \
  --debug-file .fastprobe/issue100-v4.debug.log \
  --permission-mode acceptEdits \
  "what product features are actually needed for this repo ?" \
  | tee .fastprobe/issue100-v4.stream.json
```

stream-json artefact + hook debug log 附 PR description，让 reviewer / Codex
可以直接 grep / jq 验证 V4。

### Probe 硬规则（来自 `docs/CLAUDEFAST.md` / `docs/FASTPROBE.md`）

- `claudefast -p` 必须带 prompt（不要只 flags）。
- 不要用 `--bare`（跳过 hooks / plugin sync / CLAUDE.md auto-discovery）。
- 引用 wrapper 时 token 写 `[redacted]`。
- 冲突解决遵循 `FASTPROBE about PR+conflict resolve`：merge / Codex-review / rule-doc 三类，
  在 PR branch 本地解，禁 reset --hard、禁 force push、禁丢他人改动。

## 实施顺序（implementation only — 不是计划本身）

1. 跑 § ④ probes（orient + 4 路并行 + V4 stream-json）。
2. Commit 1：删 CLAUDE.md auto-block。
3. Commit 2：bin-stop.ts 显式 `legacyClaudeMd: false`。
4. Commit 3：bin-stop.test.ts 加 regression test。
5. `pnpm test && pnpm typecheck` 全绿。
6. 跑 § ③.3a 1+2+3 gate + § ③.3b V1..V4。
7. 写 `report.md` 同目录。
8. push 到 PR branch（非 main、非 draft），开 PR。
9. POSTPR loop（`docs/POSTPR.md`）：fetch Codex inline comments → triage P1/P2 → fix → loop until silent or 👍。

## 相关

- `docs/HOWTO-PLAN-PR.md` — 本计划遵循的四段结构来源。
- `docs/HOW-TO-ISSUE.md` — issue #100 三段写法的范式说明。
- `docs/POSTPR.md` — PR 后 Codex review loop。
- `docs/FASTPROBE.md` — `claudefast -p` 三步配方。
- `docs/feature-verification.md` — 1+2+3 验证门禁。
- `docs/knowledge/INDEX.md` — 项目 *"Generated rule dumps must not be written back into root CLAUDE.md"* 承诺。
- 相关 commit：`7e044b5`（替换 CLAUDE.md rule dump 为 docs propagation）、
  `6ffaf19`（document compile Skills-default）、`cdebe6e`（drop block 一次）、
  `40886a0`（pickup block 又出现一次）。
