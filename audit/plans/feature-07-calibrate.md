# Feature #7 非自证 Audit 草案：`teamagent calibrate`

## 目标

验证 `teamagent calibrate` 不只靠单元测试自证，而是在真实 CLI、真实 SQLite、真实文件系统下完成闭环：

- 从 `~/.teamagent/events.db` 读取事件输入，而不是读测试内存对象。
- 根据事件合成 v2 observations，更新 `<repo>/.teamagent/knowledge.db` / `~/.teamagent/global.db` 中的 `confidence`、`demerit`、`current_tier`、`max_tier_ever`、`status`、`last_validated_at`。
- 非 dry-run 且有调整时触发 `runCompile()`，真实改写隔离目录中的 `CLAUDE.md` 与 Skills。
- 外部查询 `events.db` 验证 `calibrator.adjusted` 事件是否落盘。

结论必须来自 `sqlite3`、真实 CLI 输出、`grep/find/diff` 对数据库和产物的外部检查；Vitest 只能作为补充。

## 源码追踪结论

调用链：

1. `packages/cli/src/bin.ts:291` 的 `calibrate` 分支调用 `parseCalibrateArgs()`、`executeCalibrate()`、`renderCalibrateResult()`。
2. `packages/cli/src/commands/calibrate.ts:55` 解析默认路径：项目库 `<cwd>/.teamagent/knowledge.db`、全局库 `<home>/.teamagent/global.db`、事件库 `<home>/.teamagent/events.db`、输出 `CLAUDE.md`。
3. `packages/cli/src/commands/calibrate.ts:147` 如果 `events.db` 存在，用 `SqliteEventLog(openDb(eventsDbPath)).readAll()` 按时间读取全部事件，再按 `--days` 过滤。
4. `packages/adapters/src/storage/sqlite/sqlite-event-log.ts:39` 从 `events` 表读取，`payload` JSON 会被 parse 后展开到事件对象顶层。
5. `packages/cli/src/commands/calibrate.ts:73` 把 `hook-post.result` 事件转成 v2 `Observation`。注意源码检查的是 `event.payload?.success === true`，所以外部 seed 成功事件时，`events.payload` 必须是 `{"payload":{"success":true}}`，不能只写 `{"success":true}`。
6. `packages/cli/src/commands/calibrate.ts:159` 创建 `DualLayerStore`，分别扫描项目层和全局层。
7. 默认分支是 v2：`packages/cli/src/commands/calibrate.ts:262` 调用 `runCalibrationPipelineV2()`；只有传 `--legacy` 才走 v1 `runCalibrationPipeline()`。
8. `packages/core/src/pipeline/calibration-pipeline-v2.ts:55` 还会把 `hook-pre.blocked`、`ai.override.complied`、`ai.narrative.complied` 合成为 success observation，把 `ai.override.ignored`、`ai.override.blocked_circumvented`、`ai.narrative.recurred` 合成为 failure observation。
9. `packages/core/src/calibrator/v2/index.ts:54` 用 observations 计算 Wilson confidence；`packages/core/src/calibrator/v2/index.ts:59` 用 demerit 事件计算扣分；`packages/core/src/calibrator/v2/index.ts:71` 用 confidence + demerit 决定候选 tier；`packages/core/src/calibrator/v2/index.ts:79` 通过 hysteresis 得到最终 tier/status。
10. `packages/core/src/pipeline/calibration-pipeline-v2.ts:212` 非 dry-run 时调用 `store.update()` 写回 DB：`confidence`、`demerit`、`current_tier`、`status`、`demerit_last_updated`、`tier_entered_at`、`max_tier_ever`、`last_validated_at`。
11. `packages/cli/src/commands/calibrate.ts:286` 非 dry-run 且 `totalAdjusted > 0` 时调用 `runCompile()`。
12. `packages/core/src/pipeline/compile-pipeline.ts:31` 的 `runCompile()` 读取更新后的 `store.getAll()`，写 `CLAUDE.md` 并写 Skills。

重要现状：

- v2 默认分支没有写 `calibrator.adjusted` 事件。`recordAdjustment()` 定义在 `packages/cli/src/commands/calibrate.ts:110`，但只在 legacy v1 分支 `packages/cli/src/commands/calibrate.ts:221` 调用。
- 因此，如果 Feature #7 的验收要求包含“v2 调整后写 `calibrator.adjusted`”，下面的 audit 查询应该失败：`calibrator.adjusted` 数量会是 `0`，而 CLI 显示调整数大于 `0`。
- renderer 把 v2 的 `dormantNew` 显示成“归档”，实际 DB `status` 是 `dormant`，不是 `archived`。
- `knowledge` 库里的 `observations` 表存在，但 `executeCalibrate()` 当前不会从该表读取；audit 必须 seed `events.db`。

## 关键 SQLite Schema

核心表来自 `packages/adapters/src/storage/sqlite/schema.ts`：

```sql
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  scope_level TEXT NOT NULL CHECK(scope_level IN ('personal','team','global')),
  category TEXT NOT NULL,
  tags TEXT,
  type TEXT NOT NULL,
  nature TEXT NOT NULL,
  trigger TEXT NOT NULL,
  wrong_pattern TEXT DEFAULT '',
  correct_pattern TEXT NOT NULL,
  reasoning TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  demerit REAL NOT NULL DEFAULT 0,
  demerit_last_updated TEXT,
  current_tier TEXT NOT NULL DEFAULT 'experimental'
    CHECK(current_tier IN ('experimental','probation','stable','canonical','enforced','dormant')),
  max_tier_ever TEXT NOT NULL DEFAULT 'experimental',
  tier_entered_at TEXT NOT NULL,
  enforcement TEXT NOT NULL DEFAULT 'passive',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','conflict','stale','archived','dormant')),
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
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  knowledge_id TEXT,
  tool_use_id TEXT,
  timestamp TEXT NOT NULL,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success','failure')),
  source_event TEXT,
  tool_use_id TEXT
);
```

实际 audit 里先用生产 `openDb()` 只做 schema bootstrap，随后用外部 `sqlite3` 直接 seed `knowledge` 与 `events`，再用真实 CLI 跑 `calibrate`。

## Audit 工作区

所有写入放到 `/tmp`，不要在真实仓库根目录运行会写盘的 calibrate。

```bash
cd /Users/liushiyu/projects/TeamBrain

ROOT="$(mktemp -d /tmp/teamagent-calibrate-audit.XXXXXX)"
AUDIT_HOME="$ROOT/home"
AUDIT_CWD="$ROOT/repo"
AUDIT_SKILLS="$ROOT/skills"
TEAMAGENT_TSX="/Users/liushiyu/projects/TeamBrain/node_modules/.bin/tsx"
TEAMAGENT_BIN="/Users/liushiyu/projects/TeamBrain/packages/cli/src/bin.ts"

mkdir -p "$AUDIT_HOME" "$AUDIT_CWD/.teamagent" "$AUDIT_HOME/.teamagent" "$AUDIT_SKILLS"
cat > "$AUDIT_CWD/CLAUDE.md" <<'EOF'
# Calibrate audit

user sentinel before
EOF
```

隔离规则：

- 跑 CLI 时始终 `cd "$AUDIT_CWD"`。
- 始终设置 `HOME="$AUDIT_HOME"`，避免读写真实 `~/.teamagent/events.db` / `global.db`。
- 始终设置 `TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS"`，避免写真实 Claude Skills。

## Schema Bootstrap

```bash
AUDIT_CWD="$AUDIT_CWD" AUDIT_HOME="$AUDIT_HOME" pnpm exec tsx -e '
import path from "node:path";
import { openDb } from "@teamagent/adapters";

for (const dbPath of [
  path.join(process.env.AUDIT_CWD!, ".teamagent", "knowledge.db"),
  path.join(process.env.AUDIT_HOME!, ".teamagent", "global.db"),
  path.join(process.env.AUDIT_HOME!, ".teamagent", "events.db"),
]) {
  openDb(dbPath).close();
}
'

PROJECT_DB="$AUDIT_CWD/.teamagent/knowledge.db"
GLOBAL_DB="$AUDIT_HOME/.teamagent/global.db"
EVENTS_DB="$AUDIT_HOME/.teamagent/events.db"
```

外部核查 schema：

```bash
sqlite3 "$PROJECT_DB" "select max(version) from schema_version;"
sqlite3 "$PROJECT_DB" "pragma table_info(knowledge);"
sqlite3 "$EVENTS_DB" "pragma table_info(events);"
```

预期：

- `schema_version` 最新值是 `7`。
- `knowledge` 有 `confidence`、`demerit`、`current_tier`、`max_tier_ever`、`status`。
- `events` 有 `kind`、`knowledge_id`、`tool_use_id`、`timestamp`、`payload`。

## Seed Knowledge

三条项目层规则覆盖晋升、降级、dormant：

| id | 初始 confidence | 初始 tier | 初始 demerit | 事件输入 | 预期 |
| --- | ---: | --- | ---: | --- | --- |
| `rule-promote` | 0.20 | experimental | 0 | 20 个成功 `hook-post.result` | confidence 上升到约 0.83，tier 到 canonical，status active |
| `rule-demote` | 0.80 | stable | 0 | 10 个失败 `hook-post.result` | confidence 降到 0，tier 到 experimental，status active |
| `rule-dormant` | 0.95 | canonical | 49 | 1 个 `ai.override.ignored` | demerit 超过 50，tier/status 到 dormant |

```bash
sqlite3 "$PROJECT_DB" <<'SQL'
INSERT INTO knowledge (
  id, scope_level, category, tags, type, nature, trigger, wrong_pattern, correct_pattern,
  reasoning, confidence, demerit, demerit_last_updated, current_tier, max_tier_ever,
  tier_entered_at, enforcement, status, hit_count, success_count, override_count,
  resurrect_count, evidence, source, conflict_with, created_at, last_hit_at,
  last_validated_at, channel, trigger_description, pattern_description, hard_negatives,
  threshold_alpha, threshold_beta, fire_threshold, observation_window, embedder_model_id
) VALUES
('rule-promote','personal','E','["audit"]','avoidance','objective','promotion audit','bad promote','USE_PROMOTED_RULE','success evidence should promote',0.20,0,'','experimental','experimental','2026-03-01T00:00:00Z','passive','active',0,0,0,0,'{"success_sessions":0,"success_users":0,"correction_sessions":0}','accumulated','[]','2026-03-01T00:00:00Z','','','tool-action','','',NULL,1,1,0.4,NULL,''),
('rule-demote','personal','E','["audit"]','avoidance','objective','demotion audit','bad demote','USE_DEMOTED_RULE','failure evidence should demote',0.80,0,'','stable','stable','2026-03-01T00:00:00Z','warn','active',0,0,0,0,'{"success_sessions":0,"success_users":0,"correction_sessions":0}','accumulated','[]','2026-03-01T00:00:00Z','','','tool-action','','',NULL,1,1,0.4,NULL,''),
('rule-dormant','personal','E','["audit"]','avoidance','objective','dormant audit','bad dormant','USE_DORMANT_RULE','ignored override should add demerit',0.95,49,'2026-04-28T00:00:00Z','canonical','canonical','2026-03-01T00:00:00Z','block','active',0,0,0,0,'{"success_sessions":0,"success_users":0,"correction_sessions":0}','accumulated','[]','2026-03-01T00:00:00Z','','','tool-action','','',NULL,1,1,0.4,NULL,'');
SQL
```

Seed 后外部 before snapshot：

```bash
sqlite3 -header -column "$PROJECT_DB" \
  "select id, printf('%.4f', confidence) confidence, printf('%.2f', demerit) demerit, current_tier, max_tier_ever, status, last_validated_at from knowledge order by id;"
```

预期 before：

```text
rule-demote   0.8000  0.00   stable        stable        active
rule-dormant  0.9500  49.00  canonical     canonical     active
rule-promote  0.2000  0.00   experimental  experimental  active
```

## Seed Events

关键点：成功事件的 `payload` 必须嵌套成 `{"payload":{"success":true}}`，因为 `SqliteEventLog.hydrate()` 会展开 JSON，`synthesizeObservations()` 读取的是 `event.payload.success`。

```bash
for i in $(seq -w 1 20); do
  sqlite3 "$EVENTS_DB" \
    "insert into events(id,kind,knowledge_id,tool_use_id,timestamp,payload)
     values('e-promote-$i','hook-post.result','rule-promote','tu-promote-$i','2026-04-27T00:00:$i.000Z','{\"payload\":{\"success\":true}}');"
done

for i in $(seq -w 1 10); do
  sqlite3 "$EVENTS_DB" \
    "insert into events(id,kind,knowledge_id,tool_use_id,timestamp,payload)
     values('e-demote-$i','hook-post.result','rule-demote','tu-demote-$i','2026-04-27T00:01:$i.000Z','{\"payload\":{\"success\":false}}');"
done

sqlite3 "$EVENTS_DB" \
  "insert into events(id,kind,knowledge_id,tool_use_id,timestamp,payload)
   values('e-dormant-1','ai.override.ignored','rule-dormant','tu-dormant-1','2026-04-27T00:02:00.000Z','{}');"
```

外部核查 event input：

```bash
sqlite3 -header -column "$EVENTS_DB" \
  "select kind, knowledge_id, count(*) n from events group by kind, knowledge_id order by knowledge_id, kind;"

sqlite3 -header -column "$EVENTS_DB" \
  "select id, kind, knowledge_id, payload from events where id in ('e-promote-01','e-demote-01','e-dormant-1') order by id;"
```

预期：

```text
hook-post.result     rule-demote   10
ai.override.ignored  rule-dormant  1
hook-post.result     rule-promote  20
```

## Dry-run 边界

先跑 dry-run，证明 CLI 可以计算调整但不写 DB、不 compile。

```bash
sqlite3 "$PROJECT_DB" \
  "select id || '|' || printf('%.4f', confidence) || '|' || printf('%.2f', demerit) || '|' || current_tier || '|' || status from knowledge order by id;" \
  > "$ROOT/before-dry-run.txt"

(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" calibrate --dry-run
) | tee "$ROOT/dry-run.out"

sqlite3 "$PROJECT_DB" \
  "select id || '|' || printf('%.4f', confidence) || '|' || printf('%.2f', demerit) || '|' || current_tier || '|' || status from knowledge order by id;" \
  > "$ROOT/after-dry-run.txt"

diff -u "$ROOT/before-dry-run.txt" "$ROOT/after-dry-run.txt"
sqlite3 "$EVENTS_DB" "select count(*) from events where kind='calibrator.adjusted';"
grep -n "TEAMAGENT:START" "$AUDIT_CWD/CLAUDE.md" || true
find "$AUDIT_SKILLS" -maxdepth 2 -type f -name SKILL.md | sort
```

预期：

- stdout 包含 `TeamAgent Calibrate (dry-run)`、`调整 3`。
- `diff` 无输出。
- `calibrator.adjusted` 仍为 `0`。
- `CLAUDE.md` 没有 `TEAMAGENT:START`。
- Skills 目录为空。

## 真实 CLI 运行

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" calibrate
) | tee "$ROOT/calibrate.out"
```

当前源码实测形态应接近：

```text
TeamAgent Calibrate

  personal 扫描 3, 调整 3 (含归档 1)
    - rule-promote: conf 0.20 → 0.83 (+0.63) [experimental → canonical]
    - rule-demote: conf 0.80 → 0.00 (-0.80) [stable → experimental]
    - rule-dormant: conf 0.95 → 0.00 (-0.95) demerit 49 → 53 [canonical → dormant]
  global   无 store / 跳过

  总计: 3 条调整, 1 条归档
```

这里“含归档 1”实际对应 `status='dormant'`，后续 DB 查询必须以 DB 为准。

## 外部 After 查询

### Knowledge before/after

```bash
sqlite3 -header -column "$PROJECT_DB" \
  "select id, printf('%.4f', confidence) confidence, printf('%.2f', demerit) demerit, current_tier, max_tier_ever, status, tier_entered_at, last_validated_at from knowledge order by id;"
```

预期 after：

- `rule-promote`: `confidence` 约 `0.8344`，`current_tier='canonical'`，`max_tier_ever='canonical'`，`status='active'`。
- `rule-demote`: `confidence='0.0000'`，`current_tier='experimental'`，`max_tier_ever='stable'`，`status='active'`。
- `rule-dormant`: `confidence='0.0000'`，`demerit` 大于 `50`，`current_tier='dormant'`，`max_tier_ever='canonical'`，`status='dormant'`。
- 三条的 `last_validated_at` 不为空，发生 tier transition 的条目 `tier_entered_at` 被更新到本次运行时间。

硬判定 SQL：

```bash
sqlite3 "$PROJECT_DB" "
select
  case when (
    (select current_tier='canonical' and status='active' and confidence > 0.82 and confidence < 0.85 from knowledge where id='rule-promote')
    and
    (select current_tier='experimental' and status='active' and confidence = 0 from knowledge where id='rule-demote')
    and
    (select current_tier='dormant' and status='dormant' and demerit >= 50 from knowledge where id='rule-dormant')
  ) then 'PASS' else 'FAIL' end;
"
```

### calibrator.adjusted events

```bash
sqlite3 -header -column "$EVENTS_DB" \
  "select kind, count(*) n from events group by kind order by kind;"

sqlite3 -header -column "$EVENTS_DB" \
  "select id, kind, knowledge_id, payload from events where kind='calibrator.adjusted' order by timestamp;"
```

Feature 完成标准建议：

- 非 dry-run v2 有 3 条调整时，应有 3 条 `calibrator.adjusted`。
- 每条 `calibrator.adjusted` 至少能关联 `knowledge_id`，并能在 payload 或列中看到 confidence before/after、status/tier/demerit after。

当前源码预期：

- 默认 v2 会显示 `调整 3`，但 `calibrator.adjusted` 查询返回 `0` 行。
- 这是 audit 应捕获的失败项，不应被 CLI stdout 或 DB update 掩盖。

### runCompile 产物

`rule-promote` 被更新到 canonical 后，`runCompile()` 应把它写入 `CLAUDE.md` 和 Skills；`rule-demote` 降到 experimental、`rule-dormant` 变 dormant 后不应进入新产物。

```bash
grep -n "TEAMAGENT:START\|TEAMAGENT:END\|USE_" "$AUDIT_CWD/CLAUDE.md"
find "$AUDIT_SKILLS" -maxdepth 2 -type f -name SKILL.md | sort
```

预期：

- `CLAUDE.md` 包含 `TEAMAGENT:START` / `TEAMAGENT:END`。
- `CLAUDE.md` 包含 `USE_PROMOTED_RULE`。
- `CLAUDE.md` 不包含 `USE_DEMOTED_RULE`、`USE_DORMANT_RULE`。
- Skills 目录包含 `$AUDIT_SKILLS/rule-promote/SKILL.md`。
- Skills 目录不包含 `rule-demote/SKILL.md`、`rule-dormant/SKILL.md`。

硬判定命令：

```bash
grep -q "USE_PROMOTED_RULE" "$AUDIT_CWD/CLAUDE.md"
! grep -q "USE_DEMOTED_RULE" "$AUDIT_CWD/CLAUDE.md"
! grep -q "USE_DORMANT_RULE" "$AUDIT_CWD/CLAUDE.md"
test -f "$AUDIT_SKILLS/rule-promote/SKILL.md"
test ! -e "$AUDIT_SKILLS/rule-demote/SKILL.md"
test ! -e "$AUDIT_SKILLS/rule-dormant/SKILL.md"
```

## `--days` 过滤补充场景

追加一条未来不会被默认排除、但会被 `--days=1` 排除的旧事件，验证 `filterEventsByDays()` 的真实 CLI 行为。建议在独立 fresh ROOT 里跑，避免前一场景已更新 DB 影响结论。

```bash
sqlite3 "$EVENTS_DB" \
  "insert into events(id,kind,knowledge_id,tool_use_id,timestamp,payload)
   values('e-old-success','hook-post.result','rule-promote','tu-old','2020-01-01T00:00:00.000Z','{\"payload\":{\"success\":true}}');"

(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" TEAMAGENT_SKILLS_DIR="$AUDIT_SKILLS" "$TEAMAGENT_TSX" "$TEAMAGENT_BIN" calibrate --dry-run --days=1
) | tee "$ROOT/days-1.out"
```

判定：

- `--days=1` 的调整结果不应由 `2020-01-01` 旧事件决定。
- 若要严格量化，fresh seed 时只放旧事件，`calibrate --dry-run --days=1` 应显示 `无变化`。

## 判定标准

通过：

- 外部 `sqlite3` 能证明 seed 前后 DB 值变化符合预期：confidence、demerit、tier、status 都对。
- `--dry-run` stdout 能预测变化，但 DB、`CLAUDE.md`、Skills、`events.db` 都不变。
- 真实 `calibrate` 后 `CLAUDE.md` 与 Skills 反映更新后的 tier/status，而不是 seed 前状态。
- `events.db` 的事件输入可追溯，且 `hook-post.result` 成功/失败 payload 形状与源码一致。

失败：

- 默认 v2 调整了 DB 但没有写 `calibrator.adjusted`。按当前源码这是预期会失败的项；若 Feature #7 宣称已完成，应修复或明确变更需求。
- 只 seed `knowledge.observations` 表就期待 calibrate 变化；当前 CLI 不读该表，不能作为有效 audit。
- 没有隔离 `HOME` / `TEAMAGENT_SKILLS_DIR`，导致读写真实用户数据。
- 只检查 CLI stdout，不查 SQLite before/after 和文件产物。

## 审计记录建议

执行完后保存这些证据到审计记录或 PR 评论：

```bash
printf 'ROOT=%s\n' "$ROOT"
cat "$ROOT/dry-run.out"
cat "$ROOT/calibrate.out"
sqlite3 -header -column "$PROJECT_DB" \
  "select id, confidence, demerit, current_tier, max_tier_ever, status, last_validated_at from knowledge order by id;"
sqlite3 -header -column "$EVENTS_DB" \
  "select kind, knowledge_id, count(*) n from events group by kind, knowledge_id order by kind, knowledge_id;"
grep -n "TEAMAGENT:START\|TEAMAGENT:END\|USE_" "$AUDIT_CWD/CLAUDE.md"
find "$AUDIT_SKILLS" -maxdepth 2 -type f -name SKILL.md | sort
```
