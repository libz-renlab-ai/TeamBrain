# Feature #3 `teamagent stats` 非自证 audit 草案

## 目标

验证 `teamagent stats` 的真实 CLI 行为，不用项目内部 `DualLayerStore.add()`、`SqliteEventLog.append()` 或测试 helper 自证。审计只用外部 SQL 直接 seed 临时项目 DB、临时 global DB、临时 events DB，然后在临时 `HOME` 和临时 cwd 下真实运行 CLI。

重点判定：

- `bin.ts -> commands/stats.ts -> DualLayerStore -> SqliteKnowledgeStore -> SQLite knowledge` 数据流是否按默认路径读取。
- `commands/stats.ts -> SqliteEventLog -> SQLite events` 是否读取 `events.db` 并聚合 confidence movement / override signal。
- `stats` 是否只读 SQLite，不依赖旧 `events.jsonl`。
- 输出里的总数、活跃/归档、scope、category、Top hits、recent、confidence movement、`--explain`、`--stuck-in-promotion`、`--override-signals` 是否和外部 seed 数据一致。

## 源码追踪

入口链路：

- [packages/cli/src/bin.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts): `case "stats"` 解析 `--stuck-in-promotion`、`--stuck-days=N`、`--override-signals`、`--explain[=id]`，然后 `process.stdout.write(executeStats(statsOpts))`。
- [packages/cli/src/commands/stats.ts](/Users/liushiyu/projects/TeamBrain/packages/cli/src/commands/stats.ts): `resolvePaths()` 默认读取：
  - project DB: `${cwd}/.teamagent/knowledge.db`
  - global DB: `${HOME}/.teamagent/global.db`
  - events DB: `${HOME}/.teamagent/events.db`
- `executeStats()` 分支：
  - `--stuck-in-promotion`: 若 project/global DB 任一存在，打开 `DualLayerStore`，`getAll()` 后只渲染 active + `current_tier=probation` + `tier_entered_at` 超阈值的规则。
  - `--override-signals`: 只打开 `events.db`，`SqliteEventLog.readAll()` 后按 `ai.override.ignored` / `ai.override.complied` 聚合。
  - `--explain`: 只从 `DualLayerStore.getById(id)` 查一条规则，打印 tier/confidence/demerit。
  - 默认 stats: 先从 `events.db` 聚合 `calibrator.adjusted`，再从 `DualLayerStore.getAll()` 读取 project/global 知识，按 scope 分桶渲染。
- [packages/adapters/src/storage/sqlite/dual-layer-store.ts](/Users/liushiyu/projects/TeamBrain/packages/adapters/src/storage/sqlite/dual-layer-store.ts): project store 和 global store 合并读取；`getAll()` 是 project rows 在前、global rows 在后。
- [packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts](/Users/liushiyu/projects/TeamBrain/packages/adapters/src/storage/sqlite/sqlite-knowledge-store.ts): `getAll()` 执行 `SELECT * FROM knowledge`，反序列化 JSON 字段：`tags`、`scope_paths`、`scope_file_types`、`scope_branches`、`evidence`、`conflict_with`、`hard_negatives`、`observation_window`。
- [packages/adapters/src/storage/sqlite/sqlite-event-log.ts](/Users/liushiyu/projects/TeamBrain/packages/adapters/src/storage/sqlite/sqlite-event-log.ts): `readAll()` 执行 `SELECT * FROM events ORDER BY timestamp ASC`，再把 `payload` JSON merge 回事件对象；`confidence_before/after/status_after` 必须在 `payload` 内。
- [packages/adapters/src/storage/sqlite/schema.ts](/Users/liushiyu/projects/TeamBrain/packages/adapters/src/storage/sqlite/schema.ts): `openDb()` 会初始化/迁移 schema，但审计 seed 应直接创建核心表，避免通过 store API 写入。

## 关键 JSON / JSONL / SQLite 证据

SQLite evidence：

- `knowledge` 表是 stats 的知识输入。审计需要同时创建：
  - `${TMP}/project/.teamagent/knowledge.db`
  - `${TMP}/home/.teamagent/global.db`
- `events` 表是 confidence movement 和 override signal 的输入。审计创建：
  - `${TMP}/home/.teamagent/events.db`
- 关键 SQLite JSON 字段：
  - `knowledge.tags`: 例如 `["http"]`，影响 recent 行里的 `C/http`。
  - `knowledge.evidence`: 例如 `{"success_sessions":1,"success_users":1,"correction_sessions":0}`，当前 stats 不展示，但证明反序列化兼容真实 schema。
  - `knowledge.conflict_with`: `[]`。
  - `events.payload`: calibrator 字段必须放这里，例如 `{"confidence_before":0.8,"confidence_after":0.86}`。

JSONL negative evidence：

- `stats` 当前不会读取 `${HOME}/.teamagent/events.jsonl`。审计应额外写一个只存在于 `events.jsonl` 的 `calibrator.adjusted` 事件，再确认 stdout 不出现该 rule id。这能防止把旧 JSONL 误认为 stats 输入。

stdout evidence：

- 默认 `stats` stdout 是中文纯文本，不是 JSON。
- CLI 没有 `--json`，所以判定应使用固定片段 + DB 查询交叉验证，而不是 JSON parser。

## 外部 seed 方案

所有命令都在临时目录运行，不写真实 HOME：

```bash
set -euo pipefail
REPO=/Users/liushiyu/projects/TeamBrain
TMP="$(mktemp -d)"
mkdir -p "$TMP/project/.teamagent" "$TMP/home/.teamagent"
```

创建 knowledge schema。该 SQL 是外部 seed 用的最小真实表结构，不调用项目 TS API：

```bash
cat > "$TMP/knowledge-schema.sql" <<'SQL'
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  scope_level TEXT NOT NULL CHECK(scope_level IN ('personal','team','global')),
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
  channel TEXT NOT NULL DEFAULT 'tool-action',
  trigger_description TEXT DEFAULT '',
  pattern_description TEXT DEFAULT '',
  hard_negatives BLOB,
  threshold_alpha REAL DEFAULT 1.0,
  threshold_beta REAL DEFAULT 1.0,
  fire_threshold REAL DEFAULT 0.4,
  observation_window BLOB,
  embedder_model_id TEXT DEFAULT '',
  tool_context_description TEXT DEFAULT ''
);
CREATE INDEX idx_knowledge_tier ON knowledge(current_tier);
CREATE INDEX idx_knowledge_scope ON knowledge(scope_level, scope_project);
CREATE INDEX idx_knowledge_status ON knowledge(status);
SQL

sqlite3 "$TMP/project/.teamagent/knowledge.db" < "$TMP/knowledge-schema.sql"
sqlite3 "$TMP/home/.teamagent/global.db" < "$TMP/knowledge-schema.sql"
```

Seed project DB：包含 personal、team、archived。team 行用外部 SQL 写入，因为 `DualLayerStore.add()` 当前不支持 team，这正好验证 stats 读取层不是写入层自证。

```bash
sqlite3 "$TMP/project/.teamagent/knowledge.db" <<'SQL'
INSERT INTO knowledge
(id,scope_level,category,tags,type,nature,trigger,wrong_pattern,correct_pattern,reasoning,
 confidence,demerit,demerit_last_updated,current_tier,max_tier_ever,tier_entered_at,
 enforcement,status,hit_count,success_count,override_count,resurrect_count,evidence,source,
 conflict_with,created_at,last_hit_at,last_validated_at,channel)
VALUES
('p-new','personal','C','["http"]','avoidance','objective','project newest fetch rule','axios','use native fetch','prefer platform fetch',
 0.86,0.00,NULL,'stable','stable','2026-04-24T00:00:00Z',
 'warn','active',8,3,0,0,'{"success_sessions":3,"success_users":1,"correction_sessions":0}','accumulated',
 '[]','2026-04-25T10:00:00Z',NULL,NULL,'tool-action'),
('p-old','personal','E','["build"]','avoidance','objective','project old build rule','skip tests','run verification before report','avoid unverified report',
 0.72,0.40,'2026-04-10T00:00:00Z','probation','stable','2026-03-20T00:00:00Z',
 'warn','active',2,1,1,0,'{"success_sessions":1,"success_users":1,"correction_sessions":1}','accumulated',
 '[]','2026-04-20T09:00:00Z',NULL,NULL,'tool-action'),
('t-team','team','S','["process"]','practice','subjective','team scoped review rule','skip review','ask reviewer before merge','team process',
 0.64,0.00,NULL,'experimental','experimental','2026-04-24T00:00:00Z',
 'suggest','active',1,0,0,0,'{"success_sessions":0,"success_users":0,"correction_sessions":0}','team-shared',
 '[]','2026-04-24T08:00:00Z',NULL,NULL,'passive-knowledge'),
('p-arch','personal','S','["archive"]','avoidance','objective','archived rule should not be active','old','archived correct','archived row',
 0.20,1.20,'2026-04-01T00:00:00Z','probation','probation','2026-03-01T00:00:00Z',
 'passive','archived',99,0,5,0,'{"success_sessions":0,"success_users":0,"correction_sessions":5}','accumulated',
 '[]','2026-04-26T00:00:00Z',NULL,NULL,'tool-action');
SQL
```

Seed global DB：

```bash
sqlite3 "$TMP/home/.teamagent/global.db" <<'SQL'
INSERT INTO knowledge
(id,scope_level,category,tags,type,nature,trigger,wrong_pattern,correct_pattern,reasoning,
 confidence,demerit,demerit_last_updated,current_tier,max_tier_ever,tier_entered_at,
 enforcement,status,hit_count,success_count,override_count,resurrect_count,evidence,source,
 conflict_with,created_at,last_hit_at,last_validated_at,channel)
VALUES
('g-top','global','K','["strategy"]','practice','subjective','global high impact rule','rush','keep global pattern','global principle',
 0.93,0.10,'2026-04-20T00:00:00Z','canonical','canonical','2026-04-18T00:00:00Z',
 'warn','active',12,8,0,0,'{"success_sessions":8,"success_users":2,"correction_sessions":0}','imported',
 '[]','2026-04-22T12:00:00Z',NULL,NULL,'passive-knowledge'),
('g-nohit','global','C','["lint"]','avoidance','objective','global no hit lint rule','any','lint clean','global lint',
 0.55,0.00,NULL,'experimental','experimental','2026-04-23T00:00:00Z',
 'suggest','active',0,0,0,0,'{"success_sessions":0,"success_users":0,"correction_sessions":0}','imported',
 '[]','2026-04-23T12:00:00Z',NULL,NULL,'tool-action');
SQL
```

Seed events DB。时间戳用远未来值是为了让 `aggregateConfidenceMovements()` 在任何审计日期都落入 7 天窗口判断；该函数只检查 `timestamp >= now - 7d`，不会排除未来时间。

```bash
sqlite3 "$TMP/home/.teamagent/events.db" <<'SQL'
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  knowledge_id TEXT,
  tool_use_id TEXT,
  timestamp TEXT NOT NULL,
  payload TEXT
);
CREATE INDEX idx_events_kind ON events(kind, timestamp DESC);
CREATE INDEX idx_events_knowledge ON events(knowledge_id);

INSERT INTO events VALUES
('m1','calibrator.adjusted','p-new',NULL,'2099-01-01T00:00:01Z','{"confidence_before":0.80,"confidence_after":0.86}'),
('m2','calibrator.adjusted','p-new',NULL,'2099-01-01T00:00:02Z','{"confidence_before":0.86,"confidence_after":0.90}'),
('m3','calibrator.adjusted','g-top',NULL,'2099-01-01T00:00:03Z','{"confidence_before":0.95,"confidence_after":0.70,"status_after":"archived"}'),
('old','calibrator.adjusted','t-team',NULL,'2000-01-01T00:00:00Z','{"confidence_before":0.10,"confidence_after":0.90}'),
('o1','ai.override.ignored','p-new','tool-1','2099-01-01T00:01:01Z',NULL),
('o2','ai.override.ignored','p-new','tool-2','2099-01-01T00:01:02Z',NULL),
('o3','ai.override.complied','p-new','tool-3','2099-01-01T00:01:03Z',NULL),
('o4','ai.override.complied','g-top','tool-4','2099-01-01T00:01:04Z',NULL);
SQL
```

写入 JSONL 反证事件。这个 rule id 不应出现在 `stats` 默认输出：

```bash
cat > "$TMP/home/.teamagent/events.jsonl" <<'JSONL'
{"id":"jsonl-only","kind":"calibrator.adjusted","knowledge_id":"jsonl-only-rule","confidence_before":0.1,"confidence_after":0.9,"timestamp":"2099-01-01T00:00:00Z","schema_version":1}
JSONL
```

## 验证命令

真实跑默认 CLI：

```bash
cd "$TMP/project"
HOME="$TMP/home" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" stats | tee "$TMP/stats.out"
```

验证 DB 行数和分桶：

```bash
sqlite3 "$TMP/project/.teamagent/knowledge.db" \
  "SELECT scope_level,status,COUNT(*) FROM knowledge GROUP BY scope_level,status ORDER BY scope_level,status;"

sqlite3 "$TMP/home/.teamagent/global.db" \
  "SELECT scope_level,status,COUNT(*) FROM knowledge GROUP BY scope_level,status ORDER BY scope_level,status;"

sqlite3 "$TMP/home/.teamagent/events.db" \
  "SELECT kind,knowledge_id,payload FROM events ORDER BY timestamp,id;"
```

验证 `--explain`：

```bash
cd "$TMP/project"
HOME="$TMP/home" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" stats --explain=p-old | tee "$TMP/explain.out"
HOME="$TMP/home" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" stats --explain=no-such-rule | tee "$TMP/explain-missing.out"
```

验证 stuck：

```bash
cd "$TMP/project"
HOME="$TMP/home" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" stats --stuck-in-promotion --stuck-days=14 | tee "$TMP/stuck.out"
```

验证 override signals：

```bash
cd "$TMP/project"
HOME="$TMP/home" "$REPO/node_modules/.bin/tsx" "$REPO/packages/cli/src/bin.ts" stats --override-signals | tee "$TMP/override.out"
```

验证 JSONL 反证：

```bash
! grep -q 'jsonl-only-rule' "$TMP/stats.out"
```

## 预期输出

默认 `stats` 应包含这些片段：

```text
📊 TeamAgent 知识库统计

总数: 6 (活跃 5, 归档 1)

按作用域:
  personal  2
  team      1
  global    2

按分类:
  C 代码层  2
  E 工程层  1
  S 策略层  1
  K 认知层  1

Top 4 高频命中:
  [12次] global high impact rule → keep global pattern (conf=0.93)
  [8次] project newest fetch rule → use native fetch (conf=0.86)
  [2次] project old build rule → run verification before report (conf=0.72)
  [1次] team scoped review rule → ask reviewer before merge (conf=0.64)

最近 5 条新增:
  [2026-04-25] C/http  project newest fetch rule
  [2026-04-24] S/process  team scoped review rule
  [2026-04-23] C/lint  global no hit lint rule
  [2026-04-22] K/strategy  global high impact rule
  [2026-04-20] E/build  project old build rule

本周（7 天）confidence 变化 top 2:
  -0.25  g-top [自动归档]
         global high impact rule
  +0.10  p-new
         project newest fetch rule
```

不应包含：

```text
archived rule should not be active
jsonl-only-rule
```

DB 查询预期：

```text
# project DB
personal|active|2
personal|archived|1
team|active|1

# global DB
global|active|2
```

`events.db` 应能看到 calibrator payload JSON：

```text
calibrator.adjusted|p-new|{"confidence_before":0.80,"confidence_after":0.86}
calibrator.adjusted|p-new|{"confidence_before":0.86,"confidence_after":0.90}
calibrator.adjusted|g-top|{"confidence_before":0.95,"confidence_after":0.70,"status_after":"archived"}
```

`stats --explain=p-old` 预期：

```text
rule p-old
  tier: probation (max ever: stable)
  confidence: 0.720
  demerit: 0.40 (updated 2026-04-10T00:00:00Z)
```

`stats --explain=no-such-rule` 预期：

```text
rule no-such-rule not found
```

`stats --stuck-in-promotion --stuck-days=14` 预期包含：

```text
📌 stuck-in-promotion（probation tier > 14 天，共 1 条）:
p-old
project old build rule
```

在 2026-04-28 执行时，`p-old` 的天数应为 39。后续日期执行时天数会随真实当前日期增加，判定以 rule id 集合为准。`p-arch` 虽然也是 probation 且更旧，但 status 为 archived，不应出现。

`stats --override-signals` 预期包含：

```text
TeamAgent Override Signals
p-new
ignored: 2
complied: 1
g-top
complied: 1
```

## 排序和统计判定标准

- 总数使用 project + global 两个 DB 的全部 row：`6`。
- 活跃数排除 `status='archived'`：`5`；归档数：`1`。
- scope 计数只统计 active：
  - personal: `p-new`, `p-old` => `2`
  - team: `t-team` => `1`
  - global: `g-top`, `g-nohit` => `2`
- category 计数只统计 active：
  - C: `p-new`, `g-nohit` => `2`
  - E: `p-old` => `1`
  - S: `t-team` => `1`
  - K: `g-top` => `1`
- Top hits 只看 active 且 `hit_count > 0`，按 `hit_count DESC`：
  - `g-top` 12
  - `p-new` 8
  - `p-old` 2
  - `t-team` 1
  - `p-arch` 不出现，因为 archived；`g-nohit` 不出现，因为 hit_count 为 0。
- recent 只看 active，按 `created_at` 字符串降序：
  - `p-new`, `t-team`, `g-nohit`, `g-top`, `p-old`
- confidence movement：
  - 只读 `events.db` 的 `calibrator.adjusted`。
  - `p-new`: `(0.86 - 0.80) + (0.90 - 0.86) = +0.10`。
  - `g-top`: `0.70 - 0.95 = -0.25`，且 `payload.status_after='archived'`，输出 `[自动归档]`。
  - `old/t-team` 时间为 2000 年，不在窗口内，不出现。
  - 排序按 `abs(totalDelta) DESC`，所以 `g-top` 在 `p-new` 前。
- JSONL 反证：
  - `events.jsonl` 里的 `jsonl-only-rule` 不应进入 movement 区。
  - 若出现，说明实现读了旧 JSONL 或审计环境混入了其他输入。

## 失败时优先排查

- stdout 完全是 empty state：检查运行 CLI 时的 cwd 是否为 `$TMP/project`，以及 `HOME="$TMP/home"` 是否设置在同一命令前。
- confidence movement 缺失：检查 `events.payload` 是否包含 `confidence_before` / `confidence_after` 数字字段；只放顶层列不会被 `SqliteEventLog.hydrate()` 还原。
- `team` scope 不为 1：检查 team row 是否 seed 到 project DB；`DualLayerStore.add()` 不支持 team，所以必须外部 SQL 写入。
- `p-arch` 出现在 Top/recent/stuck：说明 active 过滤有回归。
- `jsonl-only-rule` 出现：说明 stats 误读 JSONL，或 stdout 文件不是本次临时 HOME 产物。
