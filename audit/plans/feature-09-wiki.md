# Feature #9: `teamagent wiki:*` 非自证 audit 草案

审计日期: 2026-04-28
工作目录: `/Users/liushiyu/projects/TeamBrain`

## 目标

验证 `teamagent wiki:*` 的读写行为来自真实 CLI、真实 SQLite 文件和外部查询结果，而不是只靠 Vitest 或源码自证。

本 audit 覆盖:

- `wiki:subscribe`
- `wiki:subscriptions`
- `wiki:list`
- `wiki:stats`
- `wiki:rejected`
- `wiki:dislike`
- `wiki:pull` / `wiki:add` 的隔离 smoke 方案和限制

不在本草案中修改源码，也不把联网源和 LLM 的实时结果作为稳定验收门槛。联网命令只做隔离 smoke, 核心判定来自离线命令和 SQLite 状态交叉核查。

## 源码追踪

CLI 入口:

1. `packages/cli/src/bin.ts:433` 到 `packages/cli/src/bin.ts:489` 分别处理 `wiki:pull/add/list/stats/subscriptions/subscribe/unsubscribe/rejected/dislike`。
2. 每个分支动态导入 `packages/cli/src/commands/wiki.ts`，再调用对应 `executeWiki*()`。
3. `packages/cli/src/commands/wiki.ts:22` 的 `resolveDbPath()` 默认使用 `<cwd>/.teamagent/knowledge.db`。`parseWikiArgs()` 目前不解析 `--db`，所以 audit 必须通过 `cd "$AUDIT_CWD"` 隔离 DB。

命令实现:

1. `wiki:pull`: `packages/cli/src/commands/wiki.ts:42` 构造 `ClaudeCodeLLMClient`、`XenovaEmbedder`、`WikiPipeline`，读取 `.teamagent/config.json` 的 wiki 配置，然后调用 `pipeline.run()`。
2. `wiki:add`: `packages/cli/src/commands/wiki.ts:121` 同样构造 LLM、Embedder、Pipeline，并以 `manualUrl` 运行。当前 `executeWikiAdd()` 不传递 `dryRun`。
3. `wiki:list`: `packages/cli/src/commands/wiki.ts:138` 只打开 DB，调用 `WikiStore.list()`，渲染标题、来源、摘要、关键词、链接。
4. `wiki:stats`: `packages/cli/src/commands/wiki.ts:161` 只打开 DB，调用 `WikiStore.stats()` 和 `WikiSubscriptionStore.list()`。
5. `wiki:subscriptions`: `packages/cli/src/commands/wiki.ts:178` 只打开 DB，调用 `WikiSubscriptionStore.list()`。
6. `wiki:subscribe`: `packages/cli/src/commands/wiki.ts:198` 只写 `wiki_subscriptions`，支持 `--repo`、`--rss`、`--arxiv`。
7. `wiki:rejected`: `packages/cli/src/commands/wiki.ts:236` 只读 `wiki_rejection_log`。
8. `wiki:dislike`: `packages/cli/src/commands/wiki.ts:255` 只更新 `wiki_meta.user_thumbs_down=1`。

Store 和 Pipeline:

1. `WikiStore.save()` 在 `packages/adapters/src/storage/sqlite/wiki-store.ts:22` 先按 `(source_type, source_id)` 查重，再同时写 `knowledge` 和 `wiki_meta`。
2. `WikiStore.list()` 在 `packages/adapters/src/storage/sqlite/wiki-store.ts:132` join `knowledge/wiki_meta`，过滤 `k.status='active'`，按 `wm.published_at DESC` 排序。
3. `WikiStore.stats()` 在 `packages/adapters/src/storage/sqlite/wiki-store.ts:202` 统计 `wiki_meta WHERE user_thumbs_down=0`，不 join `knowledge.status`。
4. `WikiStore.recordRejection()` 和 `listRejections()` 对应 `wiki_rejection_log`，见 `packages/adapters/src/storage/sqlite/wiki-store.ts:98` 和 `packages/adapters/src/storage/sqlite/wiki-store.ts:178`。
5. `WikiSubscriptionStore.add/list/getEnabledConfigs/remove()` 对应 `wiki_subscriptions`，见 `packages/adapters/src/wiki/wiki-subscription-store.ts:52`、`:80`、`:98`、`:70`。
6. `WikiPipeline.run()` 在 `packages/adapters/src/wiki/wiki-pipeline.ts:67` 到 `:171` 执行栈检测、首次自动订阅、fetch、过滤、dry-run 返回、Haiku LLM 判断、validate、save、embedding 写入。

命令分类:

| 命令 | 联网 | LLM | 主要表 | 备注 |
| --- | --- | --- | --- | --- |
| `wiki:subscribe` | 否 | 否 | `wiki_subscriptions` | 但要求 `.teamagent/` 目录已存在，否则 DB 文件无法打开。 |
| `wiki:subscriptions` | 否 | 否 | `wiki_subscriptions` | 只读。 |
| `wiki:list` | 否 | 否 | `knowledge`, `wiki_meta` | 只显示 `knowledge.status='active'`。 |
| `wiki:stats` | 否 | 否 | `wiki_meta`, `wiki_subscriptions` | 排除 thumbs-down, 但不排除 archived knowledge。 |
| `wiki:rejected` | 否 | 否 | `wiki_rejection_log` | 只读。 |
| `wiki:dislike` | 否 | 否 | `wiki_meta` | 更新 thumbs-down。 |
| `wiki:unsubscribe` | 否 | 否 | `wiki_subscriptions` | 入口存在，虽不是本次主核查项。 |
| `wiki:pull` | 是 | 非 dry-run 是 | 以上全部, `knowledge_vec` 可选 | `--dry-run` 仍会 fetch；如果订阅表为空，dry-run 前也可能自动写订阅。 |
| `wiki:add` | 是 | 是 | `knowledge`, `wiki_meta`, `wiki_rejection_log`, `knowledge_vec` 可选 | 入口目前没有 dry-run 保护。 |

## 关键 SQLite 表

Schema 定义在 `packages/adapters/src/storage/sqlite/schema.ts:96` 到 `:132`:

- `knowledge`: 主知识表。wiki 入库时 `type='wiki'`、`nature='wiki'`、`category='W'`、`source='wiki_pipeline'`。
- `wiki_meta`: wiki 专用元数据，包含 `knowledge_id`、`source_url`、`source_type`、`source_id`、`published_at`、`tldr`、`keywords`、`user_thumbs_down`、`inline_injection_count`、`last_injected_at`、`fetch_error`。
- `wiki_subscriptions`: 订阅源，包含 `id`、`source_type`、`config`、`auto_added`、`enabled`、`created_at`。
- `wiki_rejection_log`: 拒绝日志，包含 `id`、`source_type`、`source_id`、`title`、`reason`、`rejected_at`。
- `knowledge_vec`: 可选 sqlite-vec 虚表，`openDb()` 在 `packages/adapters/src/storage/sqlite/schema.ts:283` 尝试创建，失败会吞掉。audit 不把它作为离线必过条件。

## Audit 工作区

必须用临时目录，不能在仓库根直接运行会写 DB 的 wiki 命令。

```bash
REPO=/Users/liushiyu/projects/TeamBrain
TSX="$REPO/node_modules/.bin/tsx"
ROOT="$(mktemp -d /tmp/teamagent-wiki-audit.XXXXXX)"
AUDIT_CWD="$ROOT/project"
AUDIT_HOME="$ROOT/home"

mkdir -p "$AUDIT_CWD/.teamagent" "$AUDIT_HOME"
```

注意:

- `wiki:*` 不解析 `--db`，隔离点是 `cd "$AUDIT_CWD"`。
- 不要在 `$AUDIT_CWD` 中用 `pnpm exec`，因为临时目录不是 workspace package。使用 `$TSX "$REPO/packages/cli/src/bin.ts"`。
- Node 24 会在 stderr 打印 `SQLite is an experimental feature` warning；stdout 判定时忽略 stderr warning。

## 场景 A: CLI subscribe 写入订阅, 外部 SQLite 查询

命令:

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:subscribe --repo=anthropics/claude-code
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:subscribe --rss=https://example.com/feed.xml
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:subscribe --arxiv=cs.SE
)
```

预期 stdout:

```text
✓ 已订阅 github_release anthropics/claude-code
✓ 已订阅 rss https://example.com/feed.xml
✓ 已订阅 arxiv cs.SE
```

外部查询:

```bash
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" ".mode box" \
  "select source_type, config, auto_added, enabled from wiki_subscriptions order by created_at;"
```

预期事实:

- 有 3 行。
- `source_type` 分别为 `github_release`、`rss`、`arxiv`。
- `config` 分别包含 `{"repo":"anthropics/claude-code"}`、`{"url":"https://example.com/feed.xml"}`、`{"category":"cs.SE"}`。
- `auto_added=0`，`enabled=1`。

判定标准:

- stdout 文案证明 CLI 分支被触发。
- `sqlite3` 查询证明数据落在真实 DB，不靠 `WikiSubscriptionStore` 自己读自己。

## 场景 B: 外部 SQL seed wiki entries 和 rejection

这里不 import 本仓库 adapters/store/schema。前一步 `wiki:subscribe` 已通过生产 CLI 初始化 schema，本步只用 `node:sqlite` 原生 SQL 写业务数据。

```bash
AUDIT_DB="$AUDIT_CWD/.teamagent/knowledge.db" node --input-type=module <<'NODE'
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.AUDIT_DB);
const now = '2026-04-28T00:00:00.000Z';

const knowledge = db.prepare(`INSERT INTO knowledge (
  id, scope_level, category, tags, type, nature, trigger, wrong_pattern,
  correct_pattern, correct_pattern_tldr, confidence, current_tier,
  max_tier_ever, tier_entered_at, enforcement, status, hit_count,
  success_count, override_count, resurrect_count, evidence, source,
  conflict_with, created_at, last_validated_at
) VALUES (?, 'global', 'W', ?, 'wiki', 'wiki', ?, '', ?, ?, 0.7,
  'experimental', 'experimental', ?, 'passive', ?, 0, 0, 0, 0, ?,
  'wiki_pipeline', ?, ?, ?)`);

const meta = db.prepare(`INSERT INTO wiki_meta (
  knowledge_id, source_url, source_type, source_id, published_at, tldr,
  keywords, user_thumbs_down, inline_injection_count, fetch_error
) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL)`);

function add(row) {
  knowledge.run(
    row.id,
    JSON.stringify(row.keywords),
    row.title,
    row.tldr,
    row.tldr,
    now,
    row.status ?? 'active',
    JSON.stringify({ success_sessions: 0, success_users: 0, correction_sessions: 0 }),
    JSON.stringify([]),
    now,
    now,
  );
  meta.run(
    row.id,
    row.url,
    row.sourceType,
    row.sourceId,
    row.publishedAt,
    row.tldr,
    JSON.stringify(row.keywords),
  );
}

add({
  id: 'wiki-audit-github-new',
  title: 'Audit GitHub Release',
  sourceType: 'github_release',
  sourceId: 'gh:release:1',
  url: 'https://github.com/anthropics/claude-code/releases/tag/v1.0.0',
  publishedAt: '2026-04-27T09:00:00.000Z',
  tldr: 'GitHub release audit summary.',
  keywords: ['release', 'audit'],
});

add({
  id: 'wiki-audit-manual-old',
  title: 'Audit Manual URL',
  sourceType: 'manual',
  sourceId: 'manual:https://example.com/wiki',
  url: 'https://example.com/wiki',
  publishedAt: '2026-04-26T08:00:00.000Z',
  tldr: 'Manual URL audit summary.',
  keywords: ['manual', 'audit'],
});

add({
  id: 'wiki-audit-rss-dislike',
  title: 'Audit RSS To Dislike',
  sourceType: 'rss',
  sourceId: 'rss:item:1',
  url: 'https://example.com/rss/item-1',
  publishedAt: '2026-04-25T07:00:00.000Z',
  tldr: 'RSS item audit summary.',
  keywords: ['rss', 'audit'],
});

db.prepare(`
  INSERT INTO wiki_rejection_log (id, source_type, source_id, title, reason, rejected_at)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(
  'rej-audit-old',
  'arxiv',
  '2401.00001',
  'Audit Rejected Paper',
  'off-topic for stack',
  '2026-04-24T06:00:00.000Z',
);

db.close();
NODE
```

外部查询:

```bash
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" ".mode box" "
  select k.id, k.status, wm.source_type, wm.source_id, wm.published_at, wm.user_thumbs_down
  from knowledge k
  join wiki_meta wm on wm.knowledge_id = k.id
  order by wm.published_at desc;
"

sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" ".mode box" \
  "select id, source_type, title, reason from wiki_rejection_log;"
```

预期事实:

- `wiki_meta` 有 3 行，均为 `user_thumbs_down=0`。
- `knowledge.status` 均为 `active`。
- `published_at` 顺序从 2026-04-27、2026-04-26 到 2026-04-25。
- `wiki_rejection_log` 有 `rej-audit-old`。

## 场景 C: 真实跑 `wiki:list`

命令:

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:list --limit=2
)
```

预期 stdout 片段:

```text
[wiki-aud] Audit GitHub Release
  来源: github_release | 2026-04-27
  摘要: GitHub release audit summary.
  关键词: release, audit
  链接: https://github.com/anthropics/claude-code/releases/tag/v1.0.0

[wiki-aud] Audit Manual URL
  来源: manual | 2026-04-26
  摘要: Manual URL audit summary.
  关键词: manual, audit
  链接: https://example.com/wiki
```

过滤核查:

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:list --source=manual --limit=10
)
```

预期:

- 只出现 `Audit Manual URL`。
- 不出现 `Audit GitHub Release`。

判定标准:

- 输出顺序必须匹配外部 SQL 的 `published_at DESC`。
- `--limit=2` 只能显示前 2 条。
- `--source=manual` 只显示 `wm.source_type='manual'`。

## 场景 D: 真实跑 `wiki:stats`

命令:

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:stats
)
```

预期 stdout:

```text
总数: 3 | 订阅: 3
按来源: {"github_release":1,"manual":1,"rss":1}
上次拉取: 2026-04-27T09:00:00.000Z
```

外部查询:

```bash
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" ".mode line" "
  select count(*) as non_disliked_total
  from wiki_meta
  where user_thumbs_down = 0;

  select source_type, count(*) as n
  from wiki_meta
  where user_thumbs_down = 0
  group by source_type
  order by source_type;

  select max(published_at) as last_pull
  from wiki_meta;

  select count(*) as subscriptions
  from wiki_subscriptions;
"
```

判定标准:

- CLI `总数` 等于外部 SQL 的 `wiki_meta WHERE user_thumbs_down=0`。
- CLI `订阅` 等于外部 SQL 的 `wiki_subscriptions` 行数。
- CLI `按来源` 等于外部 SQL 分组计数。
- CLI `上次拉取` 等于外部 SQL 的 `max(published_at)`。

## 场景 E: 真实跑 `wiki:subscriptions`

命令:

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:subscriptions
)
```

预期 stdout:

```text
[手动] github_release: {"repo":"anthropics/claude-code"}
[手动] rss: {"url":"https://example.com/feed.xml"}
[手动] arxiv: {"category":"cs.SE"}
```

判定标准:

- 行数等于外部 SQL 查询的 3 行。
- `[手动]` 对应 `auto_added=0`。
- config JSON 与 `wiki_subscriptions.config` 完全一致。

## 场景 F: 真实跑 `wiki:rejected`

命令:

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:rejected --limit=1
)
```

预期 stdout:

```text
[rej-audi] Audit Rejected Paper | 原因: off-topic for stack
```

判定标准:

- id 前缀来自 `rej-audit-old`.slice(0, 8)。
- 标题和原因来自外部 SQL seed。
- `--limit=1` 只显示一条。

## 场景 G: 真实跑 `wiki:dislike` 并复查 stats

命令:

```bash
(
  cd "$AUDIT_CWD"
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:dislike wiki-audit-rss-dislike
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:stats
)
```

预期 stdout:

```text
✓ 已标记 wiki-audit-rss-dislike 为不喜欢，后续注入会跳过
总数: 2 | 订阅: 3
按来源: {"github_release":1,"manual":1}
上次拉取: 2026-04-27T09:00:00.000Z
```

外部查询:

```bash
sqlite3 "$AUDIT_CWD/.teamagent/knowledge.db" ".mode box" \
  "select knowledge_id, user_thumbs_down from wiki_meta order by knowledge_id;"
```

预期事实:

```text
wiki-audit-github-new   0
wiki-audit-manual-old   0
wiki-audit-rss-dislike  1
```

判定标准:

- `wiki:dislike` 必须把目标行更新为 `user_thumbs_down=1`。
- 再跑 `wiki:stats` 时总数从 3 降到 2，`rss` 从按来源 JSON 中消失。
- 对不存在 id 的负例命令:

```bash
(
  cd "$AUDIT_CWD"
  set +e
  HOME="$AUDIT_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:dislike missing-wiki-id
  echo "status=$?"
)
```

当前源码只写 stderr `未找到条目: missing-wiki-id`，没有 `process.exit(1)`。若产品要求失败退出码，这里应判为待修复；若只要求提示，则记录为已知行为。

## 场景 H: `wiki:pull` 隔离 smoke

`wiki:pull` 不是稳定离线验收项，因为它依赖:

- 网络 fetch: GitHub/RSS/npm/arxiv 等源。
- 非 dry-run 时的 Claude LLM: `ClaudeCodeLLMClient`。
- Embedding: `XenovaEmbedder` 可能触发模型加载或本地依赖。

只建议做隔离 smoke:

```bash
PULL_ROOT="$(mktemp -d /tmp/teamagent-wiki-pull-smoke.XXXXXX)"
PULL_CWD="$PULL_ROOT/project"
PULL_HOME="$PULL_ROOT/home"
mkdir -p "$PULL_CWD/.teamagent" "$PULL_HOME"

(
  cd "$PULL_CWD"
  printf '{"dependencies":{"typescript":"latest"}}\n' > package.json
  HOME="$PULL_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:subscribe --rss=https://example.com/feed.xml
  HOME="$PULL_HOME" "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:pull --since=7d --dry-run
)

sqlite3 "$PULL_CWD/.teamagent/knowledge.db" \
  "select count(*) from wiki_meta;"
```

预期:

- stdout 以 `[dry-run] 将拉取 N 条:` 开头。
- `wiki_meta` 仍为 0，因为 dry-run 在 fetch/filter 后返回，不 judge、不 save、不 embed。
- 如果 stderr 有源 fetch 错误，需要记录具体源和错误，不直接等同 CLI 功能失败。

限制:

- `--dry-run` 仍然联网 fetch。
- 如果订阅表为空，`WikiPipeline.run()` 会在 dry-run 前自动订阅并写 `wiki_subscriptions`。上面的 smoke 先手动订阅，是为了避免把自动订阅副作用混进判定。
- dry-run 不覆盖 LLM 判断、保存、embedding。

非 dry-run 只可作为人工 smoke:

```bash
(
  cd "$PULL_CWD"
  TEAMAGENT_LLM_TIMEOUT_MS=15000 HOME="$PULL_HOME" \
    "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:pull --since=1d
)
```

预期只检查形态:

```text
wiki:pull 完成 — 新增: <n>, 跳过: <n>, 拒绝: <n>
```

随后用外部 SQL 查:

```bash
sqlite3 "$PULL_CWD/.teamagent/knowledge.db" ".mode box" "
  select k.id, k.type, k.source, wm.source_type, wm.source_id, wm.user_thumbs_down
  from knowledge k
  join wiki_meta wm on wm.knowledge_id = k.id
  order by k.created_at desc
  limit 20;
"
```

非 dry-run smoke 的限制:

- `新增=0` 可能是正常结果，例如源无新内容、stack filter 过滤、LLM 拒绝或网络错误。
- 有新增时才能继续判断 `knowledge.type='wiki'`、`source='wiki_pipeline'`、`wiki_meta` join 完整。
- LLM 超时、Claude 权限、模型下载失败都应作为环境问题单独记录。

## 场景 I: `wiki:add` 隔离 smoke

`wiki:add` 当前没有 dry-run 路径，会联网读取 URL 并调用 LLM。只在隔离目录做人工 smoke:

```bash
ADD_ROOT="$(mktemp -d /tmp/teamagent-wiki-add-smoke.XXXXXX)"
ADD_CWD="$ADD_ROOT/project"
ADD_HOME="$ADD_ROOT/home"
mkdir -p "$ADD_CWD/.teamagent" "$ADD_HOME"

(
  cd "$ADD_CWD"
  TEAMAGENT_LLM_TIMEOUT_MS=15000 HOME="$ADD_HOME" \
    "$TSX" "$REPO/packages/cli/src/bin.ts" wiki:add https://example.com/
)
```

预期 stdout 形态:

```text
wiki:add — 新增: <n>, 跳过: <n>, 拒绝: <n>
```

外部查询:

```bash
sqlite3 "$ADD_CWD/.teamagent/knowledge.db" ".mode box" "
  select k.id, k.type, k.source, wm.source_type, wm.source_url, wm.source_id
  from knowledge k
  join wiki_meta wm on wm.knowledge_id = k.id;

  select id, source_type, title, reason
  from wiki_rejection_log;
"
```

限制:

- `https://example.com/` 只是 smoke URL，不保证会被 LLM 接受。
- 如果 `新增=1`，必须能在 `knowledge/wiki_meta` join 中看到 `source_type='manual'`。
- 如果 `拒绝=1`，必须能在 `wiki_rejection_log` 看到原因。
- 如果 fetch 或 LLM 环境失败，记录为环境限制，不用于否定离线命令。

## 总体判定标准

通过:

- 所有离线命令在隔离目录运行，不访问真实仓库 `.teamagent/knowledge.db`。
- `subscribe/subscriptions/list/stats/rejected/dislike` 的 stdout 与外部 `sqlite3` 查询一致。
- `wiki:list` 的排序、limit、source filter 与 SQL seed 一致。
- `wiki:stats` 在 dislike 前后分别显示 3 和 2，且外部 SQL 能看到 `user_thumbs_down` 从 0 到 1。
- `wiki:rejected` 输出来自外部 seed 的 `wiki_rejection_log`。
- `pull/add` 只作为 smoke 记录，不把实时网络和 LLM 结果作为稳定通过条件。

失败:

- CLI 输出和外部 SQLite 查询不一致。
- 离线命令尝试联网或实例化 LLM。
- `wiki:*` 在隔离目录外写入真实项目 DB。
- `wiki:pull --dry-run` 写入 `wiki_meta`。
- `wiki:add` smoke 宣称新增成功，但外部 SQL 查不到 `knowledge/wiki_meta` join 行。

已知边界:

- `.teamagent/` 不存在时，`wiki:subscribe` 不能自行创建目录，会报 `unable to open database file`。
- `wiki:stats` 只看 `wiki_meta.user_thumbs_down=0`，不 join `knowledge.status`。
- `wiki:dislike` 找不到 id 时当前不设置非零退出码。
- `wiki:add` 没有真正 dry-run。
