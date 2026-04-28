# Feature #6 非自证 Audit 草案：`teamagent compile` 编译 `CLAUDE.md` / Skills

## 目标

验证 `teamagent compile` 不只是单元测试自证，而是在真实 CLI、真实 SQLite、真实文件系统下满足预期：

- 从 SQLite 读取项目层与全局层知识。
- 编译并注入 `CLAUDE.md` 的 `TEAMAGENT` 管理区块，同时保留区块外用户内容。
- 编译 Claude Code Skills 到目标目录，每条合格规则对应一个 `SKILL.md`。
- `--dry-run`、`--markdown-only`、`--skills-only`、`--preset-only` 的写入边界可被外部工具核查。

本 audit 只面向黑盒/灰盒验证，不把 Vitest 结果当作充分证据。Vitest 可以作为补充，但结论必须来自 `sqlite3`、`find`、`diff`、`grep/sed/awk` 对产物和数据库的外部检查。

## 源码追踪结论

调用链：

1. `packages/cli/src/bin.ts` 的 `compile` 分支解析参数后调用 `executeCompile()`。
2. `packages/cli/src/commands/compile.ts:72` 的 `executeCompile()` 解析路径并创建目录；默认数据库为 `<cwd>/.teamagent/knowledge.db` 与 `<home>/.teamagent/global.db`。
3. `packages/cli/src/commands/compile.ts:78` 创建 `DualLayerStore`；`DualLayerStore.getAll()` 合并项目层和全局层，见 `packages/adapters/src/storage/sqlite/dual-layer-store.ts:49`。
4. `packages/cli/src/commands/compile.ts:83` 创建 `MarkdownCompiler`；`--skills-only` 时替换成 noop。
5. `packages/cli/src/commands/compile.ts:90` 创建 `makeSkillCompiler()`；`--markdown-only` 时替换成 noop。
6. `packages/cli/src/commands/compile.ts:95` 调用 `runCompile()`。
7. `packages/core/src/pipeline/compile-pipeline.ts:31` 的 `runCompile()` 先 `store.getAll()`，再在非 dry-run 时调用 `markdownCompiler.writeToFile(entries)`，之后始终 `skillCompiler.compile(entries)`；dry-run 只返回 would-write skill id，不写文件。
8. `packages/adapters/src/compiler/markdown-compiler.ts:77` 读旧 `CLAUDE.md`、编译 block、调用 `injectBlockIntoDoc()`，再用临时文件 + rename 写入。
9. `packages/core/src/compiler/markdown.ts:124` 的 `compileMarkdownBlock()` 默认只编译 active 且 canonical/enforced 的 Markdown 条目；preset-only 模式只保留 `source='preset'`。
10. `packages/adapters/src/compiler/skill-compiler.ts:20` 的 Skills 编译条件是 `status='active'` 且 tier 属于 stable/canonical/enforced；输出目录默认 `~/.claude/skills/teamagent`，audit 中必须用 `TEAMAGENT_SKILLS_DIR` 或注入 HOME 隔离。

重要差异：

- Markdown 默认比 Skills 更严格：Markdown 默认 canonical/enforced；Skills 是 stable/canonical/enforced。
- `runCompile()` 用 `getAll()`，过滤逻辑由 Markdown/Skill compiler 自己负责。
- CLI 的 `--force` 目前只是预留参数，没有改变写入策略。
- `--dry-run` 不写 `CLAUDE.md`，但会调用 Skill compiler 的纯 `compile()` 生成 would-write id。

## Audit 工作区设计

用临时目录隔离真实用户环境：

```bash
ROOT="$(mktemp -d /tmp/teamagent-compile-audit.XXXXXX)"
AUDIT_HOME="$ROOT/home"
AUDIT_CWD="$ROOT/repo"
AUDIT_SKILLS="$ROOT/skills"
TEAMAGENT_TSX="/Users/liushiyu/projects/TeamBrain/node_modules/.bin/tsx"
TEAMAGENT_BIN="/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts"
mkdir -p "$AUDIT_HOME" "$AUDIT_CWD" "$AUDIT_SKILLS"
```

运行 CLI 时始终显式隔离：

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" compile
)
```

不要在真实仓库根目录直接跑会写文件的 compile；所有写入都限制在 `$AUDIT_CWD` 和 `$AUDIT_SKILLS`。

## SQLite Seed 方案

先 seed SQLite，再 compile。seed 必须通过生产代码 `openDb + SqliteKnowledgeStore.add()` 建 schema 和写入，随后用外部 `sqlite3` 核查数据库内容，避免手写 SQL 漏字段导致测试对象偏离真实路径。

建议写入 7 条规则：

| id | scope | status | tier | source | 预期 Markdown | 预期 Skill | 目的 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `personal-canonical` | personal | active | canonical | accumulated | 有 | 有 | 项目层 canonical 基线 |
| `global-enforced` | global | active | enforced | team-shared | 有 | 有 | 全局层合并 |
| `stable-skill-only` | personal | active | stable | accumulated | 无 | 有 | 证明 Markdown/Skills tier 差异 |
| `probation-hidden` | personal | active | probation | accumulated | 无 | 无 | 低 tier 过滤 |
| `archived-hidden` | personal | archived | enforced | accumulated | 无 | 无 | archived 过滤 |
| `preset-meta` | personal | active | canonical | preset | 默认有；preset-only 有 | 有 | preset-only 行为 |
| `marker-injection` | personal | active | enforced | accumulated | 有且 marker 被破坏 | 有 | 核查 `TEAMAGENT:END` 注入防护 |

Seed 命令草案：

```bash
cd /Users/liushiyu/projects/TeamBrain

ROOT="$(mktemp -d /tmp/teamagent-compile-audit.XXXXXX)"
AUDIT_HOME="$ROOT/home"
AUDIT_CWD="$ROOT/repo"
AUDIT_SKILLS="$ROOT/skills"
TEAMAGENT_TSX="/Users/liushiyu/projects/TeamBrain/node_modules/.bin/tsx"
TEAMAGENT_BIN="/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts"
mkdir -p "$AUDIT_HOME" "$AUDIT_CWD" "$AUDIT_SKILLS"
cat > "$AUDIT_CWD/CLAUDE.md" <<'EOF'
# 用户维护区

before sentinel

<!-- TEAMAGENT:START - old block -->
old managed content
<!-- TEAMAGENT:END -->

after sentinel
EOF

AUDIT_CWD="$AUDIT_CWD" AUDIT_HOME="$AUDIT_HOME" pnpm exec tsx -e '
import path from "node:path";
import { openDb, SqliteKnowledgeStore } from "@teamagent/adapters";

const cwd = process.env.AUDIT_CWD!;
const home = process.env.AUDIT_HOME!;
const now = "2026-04-28T00:00:00Z";
const base = {
  category: "E",
  tags: ["audit"],
  type: "avoidance",
  nature: "objective",
  trigger: "audit trigger",
  wrong_pattern: "WRONG",
  correct_pattern: "RIGHT",
  reasoning: "audit reasoning",
  confidence: 0.95,
  enforcement: "block",
  status: "active",
  hit_count: 5,
  success_count: 5,
  override_count: 0,
  evidence: { success_sessions: 1, success_users: 1, correction_sessions: 1 },
  created_at: now,
  last_hit_at: now,
  last_validated_at: now,
  source: "accumulated",
  conflict_with: [],
  current_tier: "canonical",
  max_tier_ever: "canonical",
  tier_entered_at: now,
  demerit: 0,
  demerit_last_updated: "",
  resurrect_count: 0,
};

function add(dbPath, entry) {
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  store.add(entry);
  store.close();
}

const projectDb = path.join(cwd, ".teamagent", "knowledge.db");
const globalDb = path.join(home, ".teamagent", "global.db");
add(projectDb, { ...base, id: "personal-canonical", scope: { level: "personal" }, correct_pattern: "USE_PERSONAL_CANONICAL" });
add(globalDb, { ...base, id: "global-enforced", scope: { level: "global" }, current_tier: "enforced", max_tier_ever: "enforced", source: "team-shared", correct_pattern: "USE_GLOBAL_ENFORCED" });
add(projectDb, { ...base, id: "stable-skill-only", scope: { level: "personal" }, current_tier: "stable", max_tier_ever: "stable", correct_pattern: "USE_STABLE_SKILL_ONLY" });
add(projectDb, { ...base, id: "probation-hidden", scope: { level: "personal" }, current_tier: "probation", max_tier_ever: "probation", correct_pattern: "DO_NOT_SHOW_PROBATION" });
add(projectDb, { ...base, id: "archived-hidden", scope: { level: "personal" }, status: "archived", current_tier: "enforced", max_tier_ever: "enforced", correct_pattern: "DO_NOT_SHOW_ARCHIVED" });
add(projectDb, { ...base, id: "preset-meta", scope: { level: "personal" }, source: "preset", correct_pattern: "USE_PRESET_META" });
add(projectDb, { ...base, id: "marker-injection", scope: { level: "personal" }, current_tier: "enforced", max_tier_ever: "enforced", correct_pattern: "TEXT_WITH_TEAMAGENT:END_MARKER", reasoning: "must not create a second TEAMAGENT:END marker" });
'
```

Seed 后外部核查：

```bash
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" \
  "select id, scope_level, status, current_tier, source from knowledge order by id;"
sqlite3 "$AUDIT_HOME/.teamagent/global.db" \
  "select id, scope_level, status, current_tier, source from knowledge order by id;"
```

通过标准：

- project DB 有 6 行，global DB 有 1 行。
- `schema_version` 最新值为 7。
- `probation-hidden` 与 `archived-hidden` 确实在 DB 中存在，后续产物不存在才有过滤证明。

## 核查场景

### A. 默认 compile：同时写 `CLAUDE.md` 和 Skills

命令：

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" compile
)
```

外部核查：

```bash
grep -n "TEAMAGENT:START\|TEAMAGENT:END\|USE_" "$AUDIT_CWD/CLAUDE.md"
grep -c "TEAMAGENT:END" "$AUDIT_CWD/CLAUDE.md"
find "$AUDIT_SKILLS" -maxdepth 2 -type f -name SKILL.md | sort
find "$AUDIT_SKILLS" -maxdepth 1 -mindepth 1 -type d -printf "%f\n" 2>/dev/null | sort || find "$AUDIT_SKILLS" -maxdepth 1 -mindepth 1 -type d -exec basename {} \; | sort
```

预期：

- `CLAUDE.md` 仍包含 `before sentinel` 和 `after sentinel`。
- 旧 managed content 被替换。
- Markdown 中包含 `USE_PERSONAL_CANONICAL`、`USE_GLOBAL_ENFORCED`、`USE_PRESET_META`、`TEXT_WITH_TEAMAGENT`。
- Markdown 中不包含 `USE_STABLE_SKILL_ONLY`、`DO_NOT_SHOW_PROBATION`、`DO_NOT_SHOW_ARCHIVED`。
- `grep -c "TEAMAGENT:END"` 结果为 1；`marker-injection` 不能制造第二个真实 END marker。
- Skills 目录包含 `personal-canonical`、`global-enforced`、`stable-skill-only`、`preset-meta`、`marker-injection`。
- Skills 目录不包含 `probation-hidden`、`archived-hidden`。

### B. 产物与 DB 的交叉核对

用 `sqlite3` 生成理论集合，再用 `find` 生成实际集合：

```bash
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" \
  "select id from knowledge where status='active' and current_tier in ('stable','canonical','enforced')" \
  > "$ROOT/project-skill-expected.txt"
sqlite3 "$AUDIT_HOME/.teamagent/global.db" \
  "select id from knowledge where status='active' and current_tier in ('stable','canonical','enforced')" \
  > "$ROOT/global-skill-expected.txt"
cat "$ROOT/project-skill-expected.txt" "$ROOT/global-skill-expected.txt" | sort > "$ROOT/skill-expected.txt"
find "$AUDIT_SKILLS" -maxdepth 2 -type f -name SKILL.md -exec dirname {} \; | xargs -n1 basename | sort > "$ROOT/skill-actual.txt"
diff -u "$ROOT/skill-expected.txt" "$ROOT/skill-actual.txt"
```

Markdown 集合核查：

```bash
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" \
  "select correct_pattern from knowledge where status='active' and current_tier in ('canonical','enforced') and id != 'marker-injection'" \
  > "$ROOT/project-md-expected.txt"
sqlite3 "$AUDIT_HOME/.teamagent/global.db" \
  "select correct_pattern from knowledge where status='active' and current_tier in ('canonical','enforced') and id != 'marker-injection'" \
  > "$ROOT/global-md-expected.txt"
cat "$ROOT/project-md-expected.txt" "$ROOT/global-md-expected.txt" | sort > "$ROOT/md-expected.txt"
grep -o "USE_[A-Z_]*" "$AUDIT_CWD/CLAUDE.md" | sort > "$ROOT/md-actual.txt"
diff -u "$ROOT/md-expected.txt" "$ROOT/md-actual.txt"
grep -q "TEXT_WITH_TEAMAGENT" "$AUDIT_CWD/CLAUDE.md"
test "$(grep -c "TEAMAGENT:END" "$AUDIT_CWD/CLAUDE.md")" = "1"
```

注意：`marker-injection` 的 `correct_pattern` 会被插入零宽字符破坏 marker 序列；如果 diff 因零宽字符不可见而难读，需要额外用：

```bash
python3 - <<'PY'
from pathlib import Path
p = Path(__import__("os").environ["AUDIT_CWD"]) / "CLAUDE.md"
print(repr(p.read_text()))
PY
```

### C. `--dry-run` 不写文件

新建空产物目录并重复 seed，或删除产物后跑：

```bash
rm -rf "$AUDIT_SKILLS"
rm -f "$AUDIT_CWD/CLAUDE.md"
mkdir -p "$AUDIT_SKILLS"
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" compile --dry-run
)
test ! -e "$AUDIT_CWD/CLAUDE.md"
test -z "$(find "$AUDIT_SKILLS" -type f -name SKILL.md -print -quit)"
```

预期 CLI 输出列出 would-write Skills，但文件系统无写入。

### D. `--markdown-only` 和 `--skills-only`

`--markdown-only`：

```bash
rm -rf "$AUDIT_SKILLS"
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" compile --markdown-only
)
test -f "$AUDIT_CWD/CLAUDE.md"
test -z "$(find "$AUDIT_SKILLS" -type f -name SKILL.md -print -quit 2>/dev/null)"
```

`--skills-only`：

```bash
rm -f "$AUDIT_CWD/CLAUDE.md"
rm -rf "$AUDIT_SKILLS"
mkdir -p "$AUDIT_SKILLS"
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" compile --skills-only
)
test ! -e "$AUDIT_CWD/CLAUDE.md"
find "$AUDIT_SKILLS" -maxdepth 2 -type f -name SKILL.md | sort
```

预期：

- `--markdown-only` 只写 Markdown，不写任何 Skill。
- `--skills-only` 只写 Skill，不创建 `CLAUDE.md`。

### E. `--preset-only`

命令：

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" compile --preset-only
)
grep -n "TeamAgent 元原则\|USE_PRESET_META\|USE_PERSONAL_CANONICAL\|USE_GLOBAL_ENFORCED" "$AUDIT_CWD/CLAUDE.md"
```

预期：

- `CLAUDE.md` 标题为 `TeamAgent 元原则`。
- Markdown 只包含 `USE_PRESET_META`。
- Skills 仍按默认 Skill compiler 逻辑生成 stable/canonical/enforced；`--preset-only` 当前只影响 MarkdownCompiler，不影响 Skills。这是源码事实，不应误判为 bug，除非产品定义要求 preset-only 同步限制 Skills。

### F. 二次 compile 幂等性与 replacement

第一次 compile 后保存快照，第二次 compile 后比较：

```bash
cp "$AUDIT_CWD/CLAUDE.md" "$ROOT/claude.after-1.md"
find "$AUDIT_SKILLS" -type f -name SKILL.md -print0 | sort -z | xargs -0 shasum > "$ROOT/skills.after-1.sha"

(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" compile
)

diff -u "$ROOT/claude.after-1.md" "$AUDIT_CWD/CLAUDE.md"
find "$AUDIT_SKILLS" -type f -name SKILL.md -print0 | sort -z | xargs -0 shasum > "$ROOT/skills.after-2.sha"
diff -u "$ROOT/skills.after-1.sha" "$ROOT/skills.after-2.sha"
```

预期：

- 如果 timestamp 不进入产物，diff 应为空。
- 不应追加第二个 TEAMAGENT block。
- 不应残留 `CLAUDE.md.tmp-*` 或 `SKILL.md.tmp-*`：

```bash
find "$AUDIT_CWD" "$AUDIT_SKILLS" -name "*.tmp-*" -print
```

## 风险点与待确认问题

- `runCompile()` 没有把 `skillEvents` 从 CLI 传入，所以普通 `teamagent compile` 不会清理已降级/移除规则对应的旧 Skill 目录。若 Feature #6 的产品承诺包含 cleanup，需要补充从 calibration pipeline 到 CLI compile 的事件路径核查。
- Markdown compiler 默认启用 tokenBudget 和 diversity 过滤；大样本 audit 里可能出现 canonical/enforced 条目理论应出现但被 token 或多样性过滤。当前 seed 要保持短文本且语义差异足够大，避免把预算/多样性行为误判为 compile 漏写。
- `--preset-only` 只影响 Markdown，不影响 Skills。需要产品确认这是预期还是参数语义不完整。
- `formatAsAgentSkill()` 直接把 entry 文本写入 YAML frontmatter 和 Markdown body；本轮 audit 只验证存在性，不覆盖 YAML escaping/特殊字符安全。若后续要审 Skills 可加载性，需要增加 Claude Code skill parser 或 YAML parser 外部验证。
- `DualLayerStore.add()` 不支持 team scope；本 audit 用 personal/global 覆盖当前真实实现。团队层规则如果是 Feature #6 的范围，需要另开审计项。

## 最小验收标准

- 所有写入在临时 `$AUDIT_CWD`、`$AUDIT_HOME`、`$AUDIT_SKILLS` 内完成。
- `sqlite3` 证明 seed 数据确实存在于项目/全局两层 DB。
- `diff` 证明 Skills 实际集合等于 DB 推导集合。
- `grep/diff` 证明 `CLAUDE.md` 只替换管理区块、保留用户区块、按 tier/status/source 过滤。
- `find` 证明 flag 模式没有越界写入，也没有临时文件残留。
- audit 报告需要附上关键命令输出摘要，而不是只写“运行通过”。
