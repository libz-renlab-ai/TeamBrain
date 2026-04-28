# Feature #5 非自证 Audit 草案：`teamagent pitfall`

## 目标

验证 `teamagent pitfall --non-interactive` 在真实 CLI、真实 SQLite、真实文件系统下完成一条经验的完整传播，而不是只相信 stdout 或 Vitest：

- CLI 参数被正确解析和校验，缺必填项时早失败且不污染 DB。
- 新知识写入正确 SQLite 层：默认 personal/team 映射到项目 DB，global 写入用户全局 DB。
- 新知识触发 `runCompile()`，同步更新 `CLAUDE.md` 的 `TEAMAGENT` block，并保留用户手写内容。
- 新知识满足 tier/status 条件时写入 Claude Code Skills。
- `TEAMAGENT_VISIBILITY` 控制 stdout 归因输出；stdout 只作辅助证据，最终以 SQLite/文件产物为准。
- 向量同步是 best-effort：成功时填充语义描述/向量，失败时不能阻塞主链路。

本 audit 只把外部可观察产物作为放行证据：`sqlite3` 查询、`grep/diff/find/test` 检查真实文件。源码追踪用于设计命令和判定标准，不替代黑盒验证。

## 源码追踪

调用链：

1. `packages/cli/src/bin.ts:133` 的 `pitfall` 分支先调用 `parsePitfallArgs(rest)`。返回非空则走非交互 `executePitfall()`，否则走交互 `runPitfallInteractive()`。
2. `packages/cli/src/bin.ts:135-143` 捕获 `PitfallValidationError`，向 stderr 写错误并 `process.exit(2)`。这证明缺参验证应看 exit code/stderr，并核查没有新 DB 行。
3. `packages/cli/src/commands/pitfall.ts:331-371` 只支持 `--flag=value` 形态；`--trigger`、`--correct`、`--reason` 必填且 trim 后不能为空，`--wrong` 可空。
4. `packages/cli/src/commands/pitfall.ts:56-65` 默认路径为 `<cwd>/.teamagent/knowledge.db`、`<home>/.teamagent/global.db`、`<cwd>/CLAUDE.md`。
5. `packages/cli/src/commands/pitfall.ts:76-119` 构造 `KnowledgeEntry`：默认 `level=personal`、`category=E`、`nature=subjective`、`confidence=0.7`、`status=active`、`source=accumulated`、`current_tier=canonical`。`team` 在此处先映射为 `personal`，所以不会触发 `DualLayerStore` 的 team 不支持错误。
6. `packages/cli/src/commands/pitfall.ts:138-146` 创建 `DualLayerStore` 并 `store.add(entry)`。
7. `packages/adapters/src/storage/sqlite/dual-layer-store.ts:26-38` 按 `scope.level` 路由：`personal` 写项目 DB，`global` 写全局 DB，`team` 原始写入会抛错。
8. `packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts:175-198` 的 `INSERT_SQL` 写入 `knowledge` 主表；schema 由 `openDb()` 初始化到 v7，见 `packages/adapters/src/storage/sqlite/schema.ts:159`、`:263-288`、`:232-255`。
9. `packages/cli/src/commands/pitfall.ts:148-153` 立刻调用 `runCompile()`，传入真实 `MarkdownCompiler(paths.claudeMdPath)` 和 `makeSkillCompiler()`。
10. `packages/core/src/pipeline/compile-pipeline.ts:31-50` 读取 `store.getAll()`，非 dry-run 时写 `CLAUDE.md`，再编译并写 Skills。
11. `packages/adapters/src/compiler/markdown-compiler.ts:77-112` 读取旧 `CLAUDE.md`，用 `injectBlockIntoDoc()` 注入/替换 block，再通过临时文件 rename 写入。
12. `packages/core/src/compiler/markdown.ts:124-146` 默认只把 `status=active` 且 tier 在 adapter 默认 `canonical/enforced` 中的条目编译进 `CLAUDE.md`；pitfall 新条目是 canonical，所以应出现。
13. `packages/adapters/src/compiler/skill-compiler.ts:16-27` Skills 输出目录默认 `~/.claude/skills/teamagent`，可用 `TEAMAGENT_SKILLS_DIR` 覆盖；编译条件是 `active` 且 tier 为 `stable/canonical/enforced`。pitfall 新条目应写出一个 `<rule-id>/SKILL.md`。
14. `packages/cli/src/commands/pitfall.ts:158-176` 同步 trigger/pattern descriptions 和 vec 表是 best-effort，外层 `try/catch` 会吞掉失败。
15. `packages/cli/src/commands/pitfall.ts:178-179` `tool_context_description` 是 fire-and-forget 异步生成，失败不阻塞。
16. `packages/cli/src/commands/pitfall.ts:181-201` 生成 `source=pitfall` 的归因事件并交给 `StdoutRenderer`；`packages/adapters/src/attribution/stdout-renderer.ts:53-89` 决定 silent/smart/verbose 输出。
17. `packages/types/src/attribution.ts:52-54` 解析 `TEAMAGENT_VISIBILITY`，有效值为 `silent|smart|verbose`，无效/未设回退到默认 `verbose`。

关键非自证点：

- CLI stdout 中的“添加知识条目”“传播到 CLAUDE.md”不能证明 DB 和文件真的写了，必须查 SQLite 和磁盘。
- `runCompile()` 用 `getAll()` 合并两层 DB；验证 personal 与 global 路由时要分别查项目 DB 和全局 DB。
- `makeSkillCompiler()` 默认读进程 HOME；audit 必须设置临时 `HOME` 或 `TEAMAGENT_SKILLS_DIR`，避免写入真实 `~/.claude/skills/teamagent`。
- 向量表依赖 `sqlite-vec`，不能作为主流程硬通过标准；主流程通过标准是 knowledge row、`CLAUDE.md`、Skill 同时存在。

## 外部验证准备

推荐验证打包产物，避免只测源码 tsx 路径：

```bash
REPO="/Users/liushiyu/projects/TeamBrain"
pnpm --dir "$REPO" build:publish
TEAMAGENT_BIN="$REPO/packages/teamagent/dist/bin.js"
test -x "$TEAMAGENT_BIN" || test -f "$TEAMAGENT_BIN"
```

建立隔离工作区：

```bash
ROOT="$(mktemp -d /tmp/teamagent-pitfall-audit.XXXXXX)"
AUDIT_HOME="$ROOT/home"
AUDIT_CWD="$ROOT/project"
AUDIT_SKILLS="$ROOT/skills"
mkdir -p "$AUDIT_HOME" "$AUDIT_CWD" "$AUDIT_SKILLS"

cat > "$AUDIT_CWD/CLAUDE.md" <<'EOF'
# Audit Project

manual sentinel before
EOF
cp "$AUDIT_CWD/CLAUDE.md" "$ROOT/CLAUDE.before.md"
```

所有会写盘的命令都必须在 `$AUDIT_CWD` 中运行，并设置临时 HOME/Skills：

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" \
  TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" \
  TEAMAGENT_VISIBILITY=smart \
  node "$TEAMAGENT_BIN" pitfall --non-interactive \
    --trigger="Audit-F05 trigger: npm install moment in a new dependency task" \
    --wrong="moment" \
    --correct="dayjs" \
    --reason="Moment is deprecated for this project audit; prefer dayjs." \
    --category=E \
    --tags="audit-f05,dependency-choice" \
    --level=personal \
    --nature=objective \
    > "$ROOT/pitfall.smart.out" \
    2> "$ROOT/pitfall.smart.err"
)
echo "exit=$?"
```

预期：

- exit code 为 `0`。
- stderr 为空或不包含 fatal error。
- stdout 可包含归因块，但此处不以 stdout 作为充分证据。

## 核查 1：CLI 参数输入与失败早停

缺少必填项时必须 exit 2，并且不能新增知识行：

```bash
BAD_ROOT="$(mktemp -d /tmp/teamagent-pitfall-bad.XXXXXX)"
mkdir -p "$BAD_ROOT/home" "$BAD_ROOT/project" "$BAD_ROOT/skills"
(
  cd "$BAD_ROOT/project"
  set +e
  HOME="$BAD_ROOT/home" TEAMAGENT_SKILLS_DIR="$BAD_ROOT/skills" \
  node "$TEAMAGENT_BIN" pitfall --non-interactive \
    --trigger="" \
    --correct="x" \
    --reason="r" \
    > "$BAD_ROOT/stdout.txt" 2> "$BAD_ROOT/stderr.txt"
  echo "$?" > "$BAD_ROOT/exit-code.txt"
)
cat "$BAD_ROOT/exit-code.txt"
cat "$BAD_ROOT/stderr.txt"
find "$BAD_ROOT/project" "$BAD_ROOT/home" -maxdepth 3 -type f | sort
```

预期：

- `exit-code.txt` 内容为 `2`。
- stderr 包含 `pitfall --non-interactive 缺少必填字段` 和 `--trigger`。
- 不应出现 `knowledge.db` 或 `global.db` 中的新增 knowledge 行；若 DB 文件因未来实现变化被提前创建，`sqlite3 ... "select count(*) from knowledge"` 必须为 `0`。

## 核查 2：SQLite 输出

查询项目 DB：

```bash
PROJECT_DB="$AUDIT_CWD/.teamagent/knowledge.db"
GLOBAL_DB="$AUDIT_HOME/.teamagent/global.db"

test -f "$PROJECT_DB"
sqlite3 -header -column "$PROJECT_DB" \
  "select id, scope_level, category, tags, type, nature, trigger, wrong_pattern, correct_pattern, confidence, enforcement, status, source, current_tier from knowledge;"

sqlite3 "$PROJECT_DB" \
  "select count(*) from knowledge
   where trigger='Audit-F05 trigger: npm install moment in a new dependency task'
     and wrong_pattern='moment'
     and correct_pattern='dayjs'
     and scope_level='personal'
     and category='E'
     and type='avoidance'
     and nature='objective'
     and confidence=0.7
     and enforcement='warn'
     and status='active'
     and source='accumulated'
     and current_tier='canonical';"

sqlite3 "$PROJECT_DB" "select max(version) from schema_version;"
sqlite3 "$GLOBAL_DB" "select count(*) from knowledge;"
RULE_ID="$(sqlite3 "$PROJECT_DB" "select id from knowledge where trigger='Audit-F05 trigger: npm install moment in a new dependency task';")"
printf 'RULE_ID=%s\n' "$RULE_ID"
```

预期：

- 项目 DB 存在，匹配查询 count 为 `1`。
- `schema_version` 最大值为 `7`。
- `RULE_ID` 形如 `pers-<timestamp>-<random>`。
- 默认 personal 路径下，全局 DB 的 `knowledge` count 为 `0`，但文件可能存在，因为 `DualLayerStore` 会打开两层 DB。

补充验证 `--level=team` 当前映射为 personal：

```bash
TEAM_ROOT="$(mktemp -d /tmp/teamagent-pitfall-team.XXXXXX)"
mkdir -p "$TEAM_ROOT/home" "$TEAM_ROOT/project" "$TEAM_ROOT/skills"
(
  cd "$TEAM_ROOT/project"
  HOME="$TEAM_ROOT/home" TEAMAGENT_SKILLS_DIR="$TEAM_ROOT/skills" TEAMAGENT_VISIBILITY=silent \
  node "$TEAMAGENT_BIN" pitfall --non-interactive \
    --trigger="Audit-F05 team scope mapping" \
    --wrong="team raw scope" \
    --correct="personal project scope" \
    --reason="Current v2 maps team to personal before DualLayerStore.add." \
    --level=team
)
sqlite3 "$TEAM_ROOT/project/.teamagent/knowledge.db" \
  "select scope_level, trigger from knowledge;"
sqlite3 "$TEAM_ROOT/home/.teamagent/global.db" \
  "select count(*) from knowledge;"
```

预期：项目 DB 行的 `scope_level` 是 `personal`，全局 DB count 是 `0`。

补充验证 `--level=global` 路由到全局 DB：

```bash
GLOBAL_ROOT="$(mktemp -d /tmp/teamagent-pitfall-global.XXXXXX)"
mkdir -p "$GLOBAL_ROOT/home" "$GLOBAL_ROOT/project" "$GLOBAL_ROOT/skills"
(
  cd "$GLOBAL_ROOT/project"
  HOME="$GLOBAL_ROOT/home" TEAMAGENT_SKILLS_DIR="$GLOBAL_ROOT/skills" TEAMAGENT_VISIBILITY=silent \
  node "$TEAMAGENT_BIN" pitfall --non-interactive \
    --trigger="Audit-F05 global scope routing" \
    --wrong="project-only write" \
    --correct="global write" \
    --reason="Global scope should route through DualLayerStore to user global DB." \
    --level=global
)
sqlite3 "$GLOBAL_ROOT/project/.teamagent/knowledge.db" \
  "select count(*) from knowledge;"
sqlite3 "$GLOBAL_ROOT/home/.teamagent/global.db" \
  "select scope_level, trigger from knowledge;"
```

预期：项目 DB count 为 `0`，全局 DB 有一行 `scope_level=global`。

## 核查 3：`CLAUDE.md` 输出

```bash
test -f "$AUDIT_CWD/CLAUDE.md"
grep -n "manual sentinel before" "$AUDIT_CWD/CLAUDE.md"
grep -n "TEAMAGENT:START\|TEAMAGENT:END\|TeamAgent 经验\|dayjs\|moment" "$AUDIT_CWD/CLAUDE.md"
test "$(grep -c 'TEAMAGENT:START' "$AUDIT_CWD/CLAUDE.md")" = "1"
test "$(grep -c 'TEAMAGENT:END' "$AUDIT_CWD/CLAUDE.md")" = "1"
grep -q "使用 dayjs 而非 moment" "$AUDIT_CWD/CLAUDE.md"
grep -q "Moment is deprecated for this project audit; prefer dayjs." "$AUDIT_CWD/CLAUDE.md"
diff -u "$ROOT/CLAUDE.before.md" "$AUDIT_CWD/CLAUDE.md" || true
```

预期：

- `manual sentinel before` 仍存在。
- 文件内有且只有一个 `TEAMAGENT:START` 和一个 `TEAMAGENT:END`。
- `TEAMAGENT` block 中包含 `使用 dayjs 而非 moment` 和 reason。
- `diff` 只应显示追加/替换 `TEAMAGENT` 管理区块，不应删除用户手写内容。

## 核查 4：Skills 输出

```bash
test -n "$RULE_ID"
test -f "$AUDIT_SKILLS/$RULE_ID/SKILL.md"
grep -n "name: $RULE_ID\|Rule ID: $RULE_ID\|Audit-F05 trigger\|dayjs\|moment\|Tier: canonical\|Confidence: 0.70\|Source: accumulated" \
  "$AUDIT_SKILLS/$RULE_ID/SKILL.md"
find "$AUDIT_SKILLS" -maxdepth 2 -type f -name SKILL.md | sort
```

预期：

- 有且至少有一个 `$AUDIT_SKILLS/$RULE_ID/SKILL.md`。
- Skill frontmatter/body 包含 rule id、trigger、正确做法、错误做法、canonical tier、0.70 confidence、accumulated source。
- Skill 输出路径必须在 `$AUDIT_SKILLS` 下，不应写入真实 `~/.claude/skills/teamagent`。

## 核查 5：`TEAMAGENT_VISIBILITY` 输出

主流程已用 `smart` 模式保存 stdout：

```bash
grep -n "TeamAgent · 本次操作归因\|添加知识条目\|知识库变化:\|传播到:\|下次体验:" "$ROOT/pitfall.smart.out"
grep -q "CLAUDE.md" "$ROOT/pitfall.smart.out"
grep -q "dayjs" "$ROOT/pitfall.smart.out"
! grep -q "raw events" "$ROOT/pitfall.smart.out"
! grep -q "如果没有 TeamAgent" "$ROOT/pitfall.smart.out"
```

预期：smart 模式显示 highlight 归因块，但不显示 counterfactual 和 raw JSON。

silent 模式：

```bash
SILENT_ROOT="$(mktemp -d /tmp/teamagent-pitfall-silent.XXXXXX)"
mkdir -p "$SILENT_ROOT/home" "$SILENT_ROOT/project" "$SILENT_ROOT/skills"
(
  cd "$SILENT_ROOT/project"
  HOME="$SILENT_ROOT/home" TEAMAGENT_SKILLS_DIR="$SILENT_ROOT/skills" TEAMAGENT_VISIBILITY=silent \
  node "$TEAMAGENT_BIN" pitfall --non-interactive \
    --trigger="Audit-F05 silent visibility" \
    --wrong="visible output" \
    --correct="no output" \
    --reason="silent should suppress attribution stdout." \
    > "$SILENT_ROOT/stdout.txt" 2> "$SILENT_ROOT/stderr.txt"
)
test ! -s "$SILENT_ROOT/stdout.txt"
sqlite3 "$SILENT_ROOT/project/.teamagent/knowledge.db" "select count(*) from knowledge;"
```

预期：stdout 为空，但 SQLite count 为 `1`，证明 silent 只影响可见性，不影响写入。

verbose 模式：

```bash
VERBOSE_ROOT="$(mktemp -d /tmp/teamagent-pitfall-verbose.XXXXXX)"
mkdir -p "$VERBOSE_ROOT/home" "$VERBOSE_ROOT/project" "$VERBOSE_ROOT/skills"
(
  cd "$VERBOSE_ROOT/project"
  HOME="$VERBOSE_ROOT/home" TEAMAGENT_SKILLS_DIR="$VERBOSE_ROOT/skills" TEAMAGENT_VISIBILITY=verbose \
  node "$TEAMAGENT_BIN" pitfall --non-interactive \
    --trigger="Audit-F05 verbose visibility" \
    --wrong="brief output" \
    --correct="raw event output" \
    --reason="verbose should include counterfactual and raw events." \
    > "$VERBOSE_ROOT/stdout.txt" 2> "$VERBOSE_ROOT/stderr.txt"
)
grep -n "如果没有 TeamAgent\|raw events\|\"source\": \"pitfall\"" "$VERBOSE_ROOT/stdout.txt"
```

预期：verbose 包含 counterfactual、`--- raw events ---` 和 JSON 中的 `"source": "pitfall"`。

## 核查 6：向量 best-effort

向量同步不能作为硬通过条件，但要记录其实际状态：

```bash
sqlite3 -header -column "$PROJECT_DB" \
  "select
     id,
     length(coalesce(trigger_description,'')) as trigger_desc_len,
     length(coalesce(pattern_description,'')) as pattern_desc_len,
     coalesce(embedder_model_id,'') as embedder_model_id,
     length(coalesce(tool_context_description,'')) as tool_context_len
   from knowledge
   where id='$RULE_ID';"
```

预期分两类：

- 如果本机 `@xenova/transformers`、`onnxruntime-node`、`sqlite-vec` 可用，`trigger_desc_len` / `pattern_desc_len` 应大于 0，`embedder_model_id` 通常为 `Xenova/multilingual-e5-small`。`tool_context_len` 可能因 fire-and-forget/LLM 环境暂时为 0。
- 如果模型或 sqlite-vec 不可用，上述字段可能为空；只要 CLI exit 0、knowledge row 存在、`CLAUDE.md` 和 Skill 已写出，就不判主流程失败。需要记录为“vector best-effort 未完成/环境不可用”，而不是 Feature #5 主链路失败。

不要用 `sqlite3` 直接硬查 vec0 虚表作为通用通过条件；系统 sqlite3 进程未必加载 `sqlite-vec` 模块，会产生与 TeamAgent 运行时无关的假阴性。

## 判定标准

通过条件：

- 非交互有效输入真实运行 exit 0。
- `sqlite3` 在正确层查到且只查到新增知识：字段包括 trigger/wrong/correct/reason、scope、category、type、nature、confidence、enforcement、status、source、tier 均符合源码预期。
- `CLAUDE.md` 保留用户手写内容，包含唯一 `TEAMAGENT` block，block 内出现新增经验。
- `$TEAMAGENT_SKILLS_DIR/<rule-id>/SKILL.md` 存在，内容与 SQLite rule id 和规则字段对应。
- `TEAMAGENT_VISIBILITY=silent|smart|verbose` 只改变 stdout 归因展示，不改变 DB/Markdown/Skill 写入。
- 缺必填参数 exit 2，stderr 指明缺失字段，且无新增 knowledge 行。
- `--level=team` 映射为项目 personal；`--level=global` 写入全局 DB。

失败条件：

- stdout 说成功但 SQLite 查不到 row。
- SQLite 有 row 但 `CLAUDE.md` 未写入/未包含新增经验。
- SQLite 有 canonical active row 但 Skill 未写入隔离目录。
- valid run 写入真实 HOME 或真实仓库根目录。
- 缺参仍 exit 0 或写入脏数据。
- `TEAMAGENT_VISIBILITY=silent` 抑制了写入，而不只是抑制 stdout。

## 当前草案结论

源码显示 Feature #5 的主链路已经串起：`bin.ts` 参数解析与错误码、`commands/pitfall.ts` 构造 canonical accumulated 知识、`DualLayerStore` 路由 SQLite、`runCompile()` 同步写 `CLAUDE.md` 和 Skills、`TEAMAGENT_VISIBILITY` 控制 stdout、向量同步 best-effort。

最终放行前必须执行本文件的临时 HOME/cwd 外部验证命令。只有 SQLite、`CLAUDE.md`、Skills、visibility、失败早停同时满足，才可判定 `teamagent pitfall --non-interactive` 非自证通过。
