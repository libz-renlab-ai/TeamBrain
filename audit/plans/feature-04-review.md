# Feature #4：`teamagent review` 非自证 audit 草案

## 审计目标

验证 `teamagent review` 从真实 SQLite 文件读取知识条目，并把项目库与用户全局库合并后按 `created_at` 倒序渲染到 stdout。

本 audit 的关键要求是“非自证”：seed 数据必须绕过 `executeReview()`、`DualLayerStore.add()`、`SqliteKnowledgeStore.add()` 和现有 Vitest helper，直接用外部 SQL 写入 SQLite 文件，再通过 CLI 入口 `bin.ts` 调用 `review`。

## 源码追踪

1. CLI 入口：`packages/cli/src/bin.ts`
   - `executeReview` / `parseReviewArgs` 在入口层导入：`packages/cli/src/bin.ts:16`
   - `case "review"` 解析参数后写 stdout：`packages/cli/src/bin.ts:255`

2. Review 命令：`packages/cli/src/commands/review.ts`
   - 默认项目库：`<cwd>/.teamagent/knowledge.db`：`packages/cli/src/commands/review.ts:26`
   - 默认全局库：`<home>/.teamagent/global.db`：`packages/cli/src/commands/review.ts:28`
   - 构造 `DualLayerStore` 并调用 `getAll()`：`packages/cli/src/commands/review.ts:36`
   - `--scope=team` 当前按 v2 映射到 `personal`：`packages/cli/src/commands/review.ts:43`
   - 按 `created_at` 字符串倒序：`packages/cli/src/commands/review.ts:54`
   - 输出字段包含日期、scope/category/tag、confidence、enforcement、trigger、wrong、correct、reason、id：`packages/cli/src/commands/review.ts:73`

3. 双层存储：`packages/adapters/src/storage/sqlite/dual-layer-store.ts`
   - project DB 对应 `scope.level=personal`，global DB 对应 `scope.level=global`：`packages/adapters/src/storage/sqlite/dual-layer-store.ts:10`
   - 构造函数分别 `openDb(projectDbPath)` 和 `openDb(userGlobalDbPath)`：`packages/adapters/src/storage/sqlite/dual-layer-store.ts:21`
   - `getAll()` 返回 `[...project.getAll(), ...global.getAll()]`：`packages/adapters/src/storage/sqlite/dual-layer-store.ts:49`

4. SQLite 层：
   - schema 的 `knowledge` 主表字段定义在 `packages/adapters/src/storage/sqlite/schema.ts:20`
   - `openDb()` 打开 DB、设置 WAL/foreign_keys，并幂等执行 schema/migration：`packages/adapters/src/storage/sqlite/schema.ts:263`
   - `SqliteKnowledgeStore.getAll()` 实际执行 `SELECT * FROM knowledge` 并反序列化：`packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts:200`
   - `deserializeRow()` 把 `tags`、`evidence`、`conflict_with` 从 JSON 字符串恢复：`packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts:112`

## 外部 seed SQLite 方案

在临时目录中创建两个 DB：

- 项目库：`$AUDIT_ROOT/project/.teamagent/knowledge.db`
- 用户全局库：`$AUDIT_ROOT/home/.teamagent/global.db`

注意：seed 脚本只能使用 `node:sqlite` 和原生 SQL，不能 import 本仓库的 adapters、store、schema 或 command。

```bash
REPO=/Users/liushiyu/projects/TeamBrain
AUDIT_ROOT="$(mktemp -d)"
mkdir -p "$AUDIT_ROOT/project/.teamagent" "$AUDIT_ROOT/home/.teamagent"

AUDIT_ROOT="$AUDIT_ROOT" node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.env.AUDIT_ROOT;

const ddl = `CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  scope_level TEXT NOT NULL,
  scope_project TEXT,
  scope_paths TEXT,
  scope_file_types TEXT,
  scope_branches TEXT,
  category TEXT NOT NULL,
  tags TEXT,
  type TEXT NOT NULL,
  nature TEXT NOT NULL,
  trigger TEXT NOT NULL,
  wrong_pattern TEXT DEFAULT '',
  correct_pattern TEXT NOT NULL,
  correct_pattern_code_example TEXT,
  correct_pattern_import_path TEXT,
  correct_pattern_tldr TEXT,
  reasoning TEXT,
  when_expression TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  demerit REAL NOT NULL DEFAULT 0,
  demerit_last_updated TEXT,
  current_tier TEXT NOT NULL DEFAULT 'experimental',
  max_tier_ever TEXT NOT NULL DEFAULT 'experimental',
  tier_entered_at TEXT NOT NULL,
  enforcement TEXT NOT NULL DEFAULT 'passive',
  status TEXT NOT NULL DEFAULT 'active',
  hit_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  override_count INTEGER NOT NULL DEFAULT 0,
  resurrect_count INTEGER NOT NULL DEFAULT 0,
  evidence TEXT,
  source TEXT NOT NULL,
  conflict_with TEXT,
  created_at TEXT NOT NULL,
  last_hit_at TEXT,
  last_validated_at TEXT,
  channel TEXT NOT NULL DEFAULT 'tool-action'
);`;

const insert = `INSERT INTO knowledge (
  id, scope_level, scope_project, category, tags, type, nature,
  trigger, wrong_pattern, correct_pattern, reasoning, confidence,
  current_tier, max_tier_ever, tier_entered_at, enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  evidence, source, conflict_with, created_at, last_hit_at,
  last_validated_at, channel
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function seed(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(ddl);
  const stmt = db.prepare(insert);
  for (const row of rows) stmt.run(...row);
  db.close();
}

const evidence = JSON.stringify({
  success_sessions: 0,
  success_users: 0,
  correction_sessions: 0,
});

seed(path.join(root, "project/.teamagent/knowledge.db"), [
  [
    "audit-p-old", "personal", null, "E", JSON.stringify(["seed-project"]),
    "avoidance", "subjective", "project older trigger", "old wrong",
    "project older correct", "project older reason", 0.71,
    "experimental", "experimental", "2026-04-20T08:00:00Z",
    "warn", "active", 0, 0, 0, 0, evidence, "accumulated",
    JSON.stringify([]), "2026-04-20T08:00:00Z", null,
    "2026-04-20T08:00:00Z", "tool-action",
  ],
  [
    "audit-p-new", "personal", null, "K", JSON.stringify(["seed-project-new"]),
    "preference", "objective", "project newest trigger", "",
    "project newest correct", "project newest reason", 0.88,
    "stable", "stable", "2026-04-22T09:00:00Z",
    "block", "active", 1, 1, 0, 0, evidence, "manual",
    JSON.stringify([]), "2026-04-22T09:00:00Z", null,
    "2026-04-22T09:00:00Z", "user-input",
  ],
]);

seed(path.join(root, "home/.teamagent/global.db"), [
  [
    "audit-g-mid", "global", null, "P", JSON.stringify(["seed-global"]),
    "avoidance", "subjective", "global middle trigger", "global wrong",
    "global middle correct", "global middle reason", 0.66,
    "probation", "probation", "2026-04-21T10:00:00Z",
    "warn", "active", 0, 0, 0, 0, evidence, "accumulated",
    JSON.stringify([]), "2026-04-21T10:00:00Z", null,
    "2026-04-21T10:00:00Z", "tool-action",
  ],
]);
NODE
```

## 外部 DB 查询

先用独立 SQL 查询确认 seed 结果，不通过 TeamAgent store。

```bash
AUDIT_ROOT="$AUDIT_ROOT" node --input-type=module <<'NODE'
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

for (const [name, file] of [
  ["project", path.join(process.env.AUDIT_ROOT, "project/.teamagent/knowledge.db")],
  ["global", path.join(process.env.AUDIT_ROOT, "home/.teamagent/global.db")],
]) {
  const db = new DatabaseSync(file);
  const rows = db.prepare(`
    SELECT id, scope_level, category, tags, confidence, enforcement,
           trigger, wrong_pattern, correct_pattern, reasoning, created_at
    FROM knowledge
    ORDER BY created_at DESC
  `).all();
  console.log(name, JSON.stringify(rows, null, 2));
  db.close();
}
NODE
```

预期查询事实：

- `project` 有 2 条：`audit-p-new` 的 `created_at=2026-04-22T09:00:00Z`，`audit-p-old` 的 `created_at=2026-04-20T08:00:00Z`
- `global` 有 1 条：`audit-g-mid` 的 `created_at=2026-04-21T10:00:00Z`
- 三条记录的 `tags` 都是 JSON 字符串，验证 `review` 确实依赖反序列化后取 `tags[0]`

## CLI 执行

从临时项目目录运行 CLI，让 `process.cwd()` 指向 `$AUDIT_ROOT/project`，同时让 `os.homedir()` 通过 `HOME` 指向 `$AUDIT_ROOT/home`。

```bash
cd "$AUDIT_ROOT/project"
HOME="$AUDIT_ROOT/home" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" review --limit=3
```

如果通过源码运行，stderr 可能出现 Node SQLite experimental warning；它不是 stdout 判定内容。

## 预期 stdout

stdout 必须包含以下完整结构和顺序：

```text
📖 TeamAgent Review — 最近录入的知识条目

共 3 条，展示最近 3

[2026-04-22] personal/K/seed-project-new  conf=0.88 block
  trigger:  project newest trigger
  correct:  project newest correct
  reason:   project newest reason
  id:       audit-p-new

[2026-04-21] global/P/seed-global  conf=0.66 warn
  trigger:  global middle trigger
  wrong:    global wrong
  correct:  global middle correct
  reason:   global middle reason
  id:       audit-g-mid

[2026-04-20] personal/E/seed-project  conf=0.71 warn
  trigger:  project older trigger
  wrong:    old wrong
  correct:  project older correct
  reason:   project older reason
  id:       audit-p-old
```

关键判定点：

- `共 3 条，展示最近 3` 证明 project + global 两个 DB 都被读取。
- 顺序必须是 `audit-p-new`、`audit-g-mid`、`audit-p-old`，证明跨 DB 合并后按 `created_at` 倒序排序，而不是先项目库后全局库。
- `audit-p-new` 没有 `wrong:` 行，证明空 `wrong_pattern` 被条件跳过。
- `seed-project-new`、`seed-global`、`seed-project` 出现在 header 中，证明 `tags` JSON 被 SQLite 层反序列化后使用 `tags[0]`。
- `conf=0.88` / `conf=0.66` / `conf=0.71` 证明 `confidence.toFixed(2)` 的渲染行为。

## Scope 过滤补充核查

```bash
cd "$AUDIT_ROOT/project"
HOME="$AUDIT_ROOT/home" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" review --scope=global
HOME="$AUDIT_ROOT/home" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" review --scope=team
```

预期：

- `--scope=global` 只显示 `audit-g-mid`，且 `共 1 条，展示最近 1`
- `--scope=team` 当前等价于 `personal`，只显示 `audit-p-new` 和 `audit-p-old`，不显示 `audit-g-mid`

## 哪些不是证明

- `packages/cli/src/__tests__/review.test.ts` 不是充分证明。它使用 `executeReview()` 并通过 `DualLayerStore.add()` 写入测试数据，seed 与被测读取路径共享实现。
- 只运行 `pnpm test -- review` 不是充分证明。它能证明当前单元测试通过，但不能排除 `SqliteKnowledgeStore.add()` 和 `getAll()` 在同一错误假设下同时成立。
- 只看 `teamagent review` 打印“知识库为空”不是充分证明。空库路径会被 `catch` 和空数组渲染吞掉，不能证明 DB 合并、排序、字段渲染正确。
- 只查 `.teamagent/knowledge.db` 不是充分证明。`review` 应同时读取 `$HOME/.teamagent/global.db`。
- 只验证有某个 trigger 出现不是充分证明。必须验证跨 DB 顺序、scope/tag/confidence/enforcement、空 `wrong_pattern` 条件渲染。
- 通过 `teamagent pitfall` 或其他 TeamAgent 命令造数不是非自证证明，因为它会复用项目的数据写入路径。

## 结论

如果上述外部 SQL 查询与 stdout 均符合预期，可以判定 Feature #4 的核心路径成立：

`packages/cli/src/bin.ts` 正确路由到 `review`；`packages/cli/src/commands/review.ts` 正确定位项目库和全局库；`DualLayerStore.getAll()` 合并两层 SQLite；`SqliteKnowledgeStore.getAll()` 从 `knowledge` 表读取并反序列化；最终 stdout 按 `created_at` 倒序展示最近知识条目。

剩余风险：该 audit 不覆盖损坏 DB 的容错、真实 npm 包 `dist/bin.js` 打包结果、FTS/vec migration 细节，也不验证 `teamagent pitfall` 写入路径。
