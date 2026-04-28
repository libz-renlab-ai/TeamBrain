# Feature #8 非自证 Audit 草案：`teamagent analyze --commit`

## 目标

验证 `teamagent analyze --commit` 不靠 Vitest 或命令内部 meta 自证，而是在真实 CLI、真实 JSONL、真实 SQLite、真实文件系统下满足预期：

- dry-run 只解析并报告 session，不创建知识库条目，不改 `CLAUDE.md`。
- `--commit` 会从同一 JSONL 识别纠正时刻，调用 LLM extractor，写入项目 SQLite，并触发 `runCompile()` 更新临时项目的 `CLAUDE.md`。
- before/after 结论来自外部 SQLite 查询、`diff`、`grep`，不调用 `executeAnalyze()`、store helper 或测试注入。
- 所有写入限制在临时 `cwd` / `HOME` / skills 目录，不碰真实项目数据库、真实 `CLAUDE.md` 或真实 `~/.teamagent`。

核心 fixture：

- `fixtures/sessions/_manifest.json`
- `fixtures/sessions/correction-denial-01.jsonl`

## 源码追踪

调用链：

1. `packages/cli/src/bin.ts:249` 的 `case "analyze"` 调用 `parseAnalyzeArgs(rest)`，再调用 `executeAnalyze(opts)` 并写 stdout。
2. `packages/cli/src/bin.ts:566` 的 help 声明公开参数形态：`teamagent analyze [--session=<id|path>] [--verbose] [--commit]`。
3. `packages/cli/src/commands/analyze.ts:93` 判断 `--session` 是现存路径时直接 `fs.readFileSync()`，再交给 `parseSessionFile(raw)`。
4. `packages/core/src/session-parser/index.ts:77` 的 `parseSessionFile()` 逐行解析 JSONL，坏行跳过；先收集 `tool_result`，再按真实 user text 分 turn，assistant text 与 `tool_use` 挂在当前 turn。
5. `packages/cli/src/commands/analyze.ts:119` 同时跑 `ruleBasedCorrectionDetector.detect(session)` 与 `ruleBasedSuccessDetector.detect(session)`；dry-run 只把结果交给 `renderReport()`。
6. `packages/core/src/correction-detector/rule-based.ts:59` 对当前 user message 做 explicit denial 检测；`correction-denial-01.jsonl` 的 `不对` 会命中 `explicit_denial`，权重 0.95。
7. `packages/cli/src/commands/analyze.ts:169` 的 `runCommit()` 默认路径为：
   - project DB：`<cwd>/.teamagent/knowledge.db`
   - global DB：`<home>/.teamagent/global.db`
   - events DB：`<home>/.teamagent/events.db`
   - compile 目标：`<cwd>/CLAUDE.md`
8. `packages/cli/src/commands/analyze.ts:183` 默认创建 `ClaudeCodeLLMClient()`，它会 spawn 本机 `claude -p --output-format json --no-session-persistence`；audit 用临时 PATH 中的 fake `claude` 固定返回，仍走真实 spawn 边界。
9. `packages/cli/src/commands/analyze.ts:184` 创建 `DualLayerStore`，但 `packages/cli/src/commands/analyze.ts:186` 明确把 extract pipeline 写入 project store。
10. `packages/cli/src/commands/analyze.ts:197` 定义 `recompile()`，每次 commit 后调用 `runCompile()`，store 是 dual layer，Markdown 输出是临时 `CLAUDE.md`。
11. `packages/cli/src/commands/analyze.ts:216` 调用 `runExtractPipeline()`，传入 correction detector、LLM extractor、`defaultValidator`、`scope: { level: "personal" }`、`source: "accumulated"`。
12. `packages/core/src/pipeline/extract-pipeline.ts:108` 再次由 detector 计算 corrections；每个 moment 通过 extractor 生成 partial entry。
13. `packages/core/src/pipeline/extract-pipeline.ts:152` 组装完整 `KnowledgeEntry`，`confidence` 来自 detector 权重，默认 `current_tier/max_tier_ever = canonical`，`evidence.correction_sessions = 1`，`channel = tool-action`，未显式传 scope range 时补 `paths:["**/*"]` 与默认代码文件类型。
14. `packages/core/src/pipeline/extract-pipeline.ts:155` 运行 L0 validator；通过后 `packages/core/src/pipeline/extract-pipeline.ts:188` 调用 `store.add(entry)`。
15. `packages/adapters/src/storage/sqlite/dual-layer-store.ts:26` 说明 personal scope 会路由到 project DB；global scope 才写 global DB。
16. `packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts:175` 的 `INSERT_SQL` 写入 `knowledge` 主表；`add()` 还 best-effort 同步 FTS。
17. `packages/core/src/pipeline/compile-pipeline.ts:31` 的 `runCompile()` 从 store 取全量 entry，非 dry-run 时调用 Markdown compiler 写文件，并写 stable+ skills。
18. `packages/adapters/src/compiler/markdown-compiler.ts:77` 读旧 `CLAUDE.md`，注入 `TEAMAGENT` block，用临时文件 + rename 原子写。
19. `packages/cli/src/commands/analyze.ts:289` 在 DB close 后 best-effort 向量同步；失败被吞掉，不应作为 Feature #8 通过/失败的主判据。

## 关键 JSON/JSONL 事实

`fixtures/sessions/_manifest.json` 对 `correction-denial-01.jsonl` 的 ground truth：

- `expected_corrections[0].turn_index = 1`
- `expected_corrections[0].signal = explicit_denial`
- `expected_corrections[0].min_weight = 0.9`
- `keyword_hint = 不对`
- `expected_successes = []`

`fixtures/sessions/correction-denial-01.jsonl` 的真实链路：

1. turn 0 user：`帮我写一个获取用户数据的函数`
2. turn 0 assistant：文本说“用 axios”，并 `Write` 了含 `axios.get(...)` 的 `src/api.ts`
3. turn 1 user：`不对，我们项目用 fetch 不用 axios`
4. turn 1 assistant：改成 `fetch`

预期 detector 只识别 1 个 correction：turn 1 / `explicit_denial` / 权重约 0.95；无 success signal。

## Audit 工作区

只用临时目录。下面命令不创建或修改仓库内除本 audit 文档外的文件。

```bash
REPO=/Users/liushiyu/projects/TeamBrain
ROOT="$(mktemp -d /tmp/teamagent-analyze-commit-audit.XXXXXX)"
AUDIT_HOME="$ROOT/home"
AUDIT_CWD="$ROOT/project"
AUDIT_SKILLS="$ROOT/skills"
FAKEBIN="$ROOT/bin"
TEAMAGENT_TSX="$REPO/node_modules/.bin/tsx"
TEAMAGENT_BIN="$REPO/packages/cli/src/bin.ts"
SESSION="$REPO/fixtures/sessions/correction-denial-01.jsonl"

mkdir -p "$AUDIT_HOME" "$AUDIT_CWD" "$AUDIT_SKILLS" "$FAKEBIN"
cat > "$AUDIT_CWD/CLAUDE.md" <<'EOF'
# Audit Project

manual-before

manual-after
EOF
cp "$AUDIT_CWD/CLAUDE.md" "$ROOT/CLAUDE.before.md"
```

fake `claude`：固定返回 extractor JSON，仍通过真实 `ClaudeCodeLLMClient` 的 spawn 路径调用。

```bash
cat > "$FAKEBIN/claude" <<'EOF'
#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { input += c; });
process.stdin.on("end", () => {
  const result = [
    "```json",
    JSON.stringify({
      category: "E",
      tags: ["http-client", "audit"],
      type: "avoidance",
      nature: "objective",
      trigger: "需要获取用户数据或发 HTTP 请求",
      wrong_pattern: "axios",
      correct_pattern: "fetch",
      reasoning: "项目明确要求使用 fetch，不使用 axios"
    }),
    "```"
  ].join("\n");
  process.stdout.write(JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result
  }));
});
EOF
chmod +x "$FAKEBIN/claude"
```

前置确认：

```bash
test -x "$TEAMAGENT_TSX"
test -f "$TEAMAGENT_BIN"
test -f "$SESSION"
PATH="$FAKEBIN:$PATH" command -v claude
```

## 场景 A：dry-run 不写入

命令：

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" PATH="$FAKEBIN:$PATH" \
    "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" analyze --session "$SESSION" --verbose \
    | tee "$ROOT/dry.out"
)
```

外部核查：

```bash
grep -E "dry-run|会话 id: fix-denial-01|回合数: 2|纠正时刻: 1|explicit_denial|成功信号: 0" "$ROOT/dry.out"
diff -u "$ROOT/CLAUDE.before.md" "$AUDIT_CWD/CLAUDE.md"
test ! -e "$AUDIT_CWD/.teamagent/knowledge.db"
test ! -e "$AUDIT_HOME/.teamagent/global.db"
test ! -e "$AUDIT_HOME/.teamagent/events.db"
find "$AUDIT_SKILLS" -maxdepth 2 -type f -print
```

预期：

- stdout 包含 `TeamAgent Session Analyze (dry-run，不写知识库)`。
- stdout 包含 `会话 id: fix-denial-01`、`回合数: 2`、`识别到纠正时刻: 1`、`explicit_denial`、`识别到成功信号: 0`。
- `CLAUDE.md` 与 before 完全一致。
- 不存在 project/global/events DB。
- skills 目录为空。

## 场景 B：`--commit` 写 project SQLite 并编译 `CLAUDE.md`

before 查询：

```bash
find "$AUDIT_CWD" "$AUDIT_HOME" -maxdepth 3 -type f | sort > "$ROOT/files.before"
cp "$AUDIT_CWD/CLAUDE.md" "$ROOT/CLAUDE.precommit.md"
```

commit 命令：

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" PATH="$FAKEBIN:$PATH" \
    "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" analyze --session "$SESSION" --verbose --commit \
    | tee "$ROOT/commit.out"
)
```

外部 SQLite 查询：

```bash
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" \
  "select count(*) from knowledge;"

sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" \
  "select id,scope_level,category,tags,type,nature,trigger,wrong_pattern,correct_pattern,confidence,current_tier,max_tier_ever,enforcement,status,source,channel,scope_paths,scope_file_types,evidence from knowledge;"

sqlite3 "$AUDIT_HOME/.teamagent/global.db" \
  "select count(*) from knowledge;"

sqlite3 "$AUDIT_HOME/.teamagent/events.db" \
  "select count(*) from events;"
```

如果环境没有 `sqlite3` CLI，可用这个只依赖 Node 内置 `node:sqlite` 的外部查询替代，仍不 import TeamAgent：

```bash
AUDIT_CWD="$AUDIT_CWD" AUDIT_HOME="$AUDIT_HOME" node --input-type=module <<'NODE'
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

for (const [label, file, sql] of [
  ["project", path.join(process.env.AUDIT_CWD, ".teamagent/knowledge.db"),
   "select id,scope_level,category,tags,type,nature,trigger,wrong_pattern,correct_pattern,confidence,current_tier,max_tier_ever,enforcement,status,source,channel,scope_paths,scope_file_types,evidence from knowledge"],
  ["global", path.join(process.env.AUDIT_HOME, ".teamagent/global.db"),
   "select count(*) as n from knowledge"],
  ["events", path.join(process.env.AUDIT_HOME, ".teamagent/events.db"),
   "select count(*) as n from events"],
]) {
  const db = new DatabaseSync(file);
  console.log(label, JSON.stringify(db.prepare(sql).all(), null, 2));
  db.close();
}
NODE
```

`CLAUDE.md` diff：

```bash
diff -u "$ROOT/CLAUDE.precommit.md" "$AUDIT_CWD/CLAUDE.md" | tee "$ROOT/claude.diff" || true
grep -n "TEAMAGENT:START\|TEAMAGENT:END\|fetch\|axios\|需要获取用户数据" "$AUDIT_CWD/CLAUDE.md"
grep -n "manual-before\|manual-after" "$AUDIT_CWD/CLAUDE.md"
```

skills 侧核查：

```bash
find "$AUDIT_SKILLS" -maxdepth 3 -type f | sort
```

预期 stdout：

- 包含 `TeamAgent Session Analyze (--commit 模式)`。
- 仍显示 dry-run 部分的 `纠正时刻: 1`、`explicit_denial`、`成功信号: 0`。
- 包含 `--commit 完成`。
- 包含 `识别纠正: 1`。
- 包含 `成功提取: 1  (跳过 0, 失败 0)`。
- 包含 `知识库: 0 → 1`。
- 包含 `CLAUDE.md 已重编译: $AUDIT_CWD/CLAUDE.md`。
- 新增条目摘要包含 `需要获取用户数据或发 HTTP 请求 → fetch`。

预期 SQLite：

- project DB `knowledge` count 为 1。
- global DB `knowledge` count 为 0。
- 写入行满足：
  - `scope_level = personal`
  - `category = E`
  - `tags` JSON 包含 `http-client` 与 `audit`
  - `type = avoidance`
  - `nature = objective`
  - `trigger = 需要获取用户数据或发 HTTP 请求`
  - `wrong_pattern = axios`
  - `correct_pattern = fetch`
  - `confidence = 0.95` 或接近 0.95
  - `current_tier = canonical`
  - `max_tier_ever = canonical`
  - `enforcement = block`
  - `status = active`
  - `source = accumulated`
  - `channel = tool-action`
  - `scope_paths` JSON 包含 `**/*`
  - `scope_file_types` 非空，包含代码文件类型，如 `*.ts`
  - `evidence` JSON 中 `correction_sessions = 1`
- events DB 可以存在但 `events` count 为 0；这是空事件校准阶段的正常结果。

预期 `CLAUDE.md`：

- 保留 `manual-before` 与 `manual-after`。
- 新增一个 `TEAMAGENT:START` / `TEAMAGENT:END` 管理区块。
- 管理区块内包含 `fetch`、`axios`、`需要获取用户数据或发 HTTP 请求` 中的关键内容。
- 与 before 的 diff 只应增加 TeamAgent 管理区块，不应改写用户维护区文本。

预期 skills：

- 因新条目是 canonical，`runCompile()` 的 skill compiler 会在 `TEAMAGENT_SKILLS_DIR` 下写至少一个 `SKILL.md`。
- 该写入发生在临时 `$AUDIT_SKILLS`，不应出现在真实 `~/.claude/skills/teamagent`。

## 场景 C：再次 `--commit` 的边界记录

当前 CLI 的人工 `teamagent analyze --commit --session <path>` 不传 `isMomentSeen/markMomentSeen`，因此再次运行同一 fixture 可能再次提取并插入新 id。这个 audit 不把“重复运行幂等”作为 Feature #8 的通过条件；该能力属于 Stop hook 增量扫描/去重路径。

可选记录命令：

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" PATH="$FAKEBIN:$PATH" \
    "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" analyze --session "$SESSION" --commit \
    | tee "$ROOT/commit-second.out"
)
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" \
  "select count(*), group_concat(correct_pattern, '|') from knowledge;"
```

预期记录：

- 若 count 变为 2，不判失败；说明手动 CLI commit 没有外部去重游标。
- 若未来实现 CLI 层去重，count 保持 1 也可接受，但必须在源码中能追到 `isMomentSeen/markMomentSeen` 或等价机制。

## 判定标准

通过条件：

- dry-run 场景输出符合 manifest ground truth，并且外部文件/DB 检查证明无写入。
- commit 场景输出、project SQLite、global SQLite、events SQLite、`CLAUDE.md` diff、skills 临时目录相互一致。
- 写入内容必须能从 JSONL 事实解释：`axios` 是 wrong pattern，`fetch` 是 correct pattern。
- 所有写入都发生在 `$AUDIT_CWD`、`$AUDIT_HOME`、`$AUDIT_SKILLS`。
- 结论不依赖 Vitest、`executeAnalyze({ onMeta })`、TeamAgent store API 或内部 helper 查询。

失败条件：

- dry-run 创建任意 DB、改写 `CLAUDE.md` 或写 skills。
- commit stdout 声称成功，但 project DB 没有新增 row。
- project DB row 与 fake LLM 返回值、detector 权重、scope/source/tier/channel 默认值不一致。
- global DB 被写入知识条目。
- `CLAUDE.md` 未写入 TeamAgent block，或破坏了 block 外用户内容。
- `correction-denial-01.jsonl` 没有识别为 turn 1 `explicit_denial`。

## 清理

```bash
rm -rf "$ROOT"
```
