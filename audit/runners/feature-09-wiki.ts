import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  check,
  cleanupTemp,
  createAuditContext,
  finalize,
  readText,
  rel,
  runCommand,
  writeArtifact,
  writeJson,
  type AuditContext,
} from "./lib.js";

const FEATURE = "feature-09-wiki";
const FAST_TIMEOUT_MS = 30_000;
const DB_TIMEOUT_MS = 60_000;

type AuditCheck = ReturnType<typeof check>;

interface FileFingerprint {
  exists: boolean;
  size?: number;
  mtimeMs?: number;
}

interface SubscriptionRow {
  source_type: string;
  config: string;
  auto_added: number;
  enabled: number;
}

interface WikiRow {
  id: string;
  status: string;
  source_type: string;
  source_id: string;
  published_at: string;
  user_thumbs_down: number;
}

interface RejectionRow {
  id: string;
  source_type: string | null;
  title: string | null;
  reason: string;
}

interface CountRow {
  n: number;
}

interface LastPullRow {
  last_pull: string | null;
}

interface SourceCountRow {
  source_type: string;
  n: number;
}

function cliCommand(ctx: AuditContext, args: string[]): string[] {
  return [
    path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"),
    path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"),
    ...args,
  ];
}

function cliEnv(ctx: AuditContext): NodeJS.ProcessEnv {
  return {
    HOME: ctx.homeDir,
    XDG_CACHE_HOME: path.join(ctx.tmpDir, "xdg-cache"),
  };
}

function runWiki(ctx: AuditContext, name: string, args: string[]): ReturnType<typeof runCommand> {
  return runCommand(ctx, name, cliCommand(ctx, args), {
    cwd: ctx.projectDir,
    env: cliEnv(ctx),
    allowFailure: true,
    timeoutMs: FAST_TIMEOUT_MS,
  });
}

function sqliteJson<T>(ctx: AuditContext, name: string, dbPath: string, sql: string): T[] {
  const record = runCommand(ctx, name, ["sqlite3", "-json", dbPath, sql], {
    cwd: ctx.projectDir,
    timeoutMs: DB_TIMEOUT_MS,
  });
  const body = readText(record.stdoutPath).trim();
  return body.length === 0 ? [] : (JSON.parse(body) as T[]);
}

function fingerprint(file: string): FileFingerprint {
  if (!existsSync(file)) return { exists: false };
  const stat = statSync(file);
  return { exists: true, size: stat.size, mtimeMs: stat.mtimeMs };
}

function sameFingerprint(a: FileFingerprint, b: FileFingerprint): boolean {
  return a.exists === b.exists && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

function parseLines(text: string): string[] {
  return text.trim().length === 0 ? [] : text.trim().split(/\r?\n/);
}

function stdout(record: ReturnType<typeof runCommand>): string {
  return readText(record.stdoutPath);
}

function stderr(record: ReturnType<typeof runCommand>): string {
  return readText(record.stderrPath);
}

function bySourceFromRows(rows: SourceCountRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[row.source_type] = row.n;
  return out;
}

function parseStatsOutput(text: string): { total?: number; subscriptions?: number; bySource?: Record<string, number>; lastPull?: string } {
  const header = text.match(/总数:\s*(\d+)\s*\|\s*订阅:\s*(\d+)/);
  const bySource = text.match(/按来源:\s*(\{[^\n]*\})/);
  const lastPull = text.match(/上次拉取:\s*([^\n]+)/);
  return {
    total: header ? Number(header[1]) : undefined,
    subscriptions: header ? Number(header[2]) : undefined,
    bySource: bySource ? (JSON.parse(bySource[1]!) as Record<string, number>) : undefined,
    lastPull: lastPull?.[1]?.trim(),
  };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ordered(text: string, snippets: string[]): boolean {
  let last = -1;
  for (const snippet of snippets) {
    const index = text.indexOf(snippet);
    if (index <= last) return false;
    last = index;
  }
  return true;
}

function seedScript(): string {
  return `
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.AUDIT_DB;
if (!dbPath) throw new Error("missing AUDIT_DB");
const db = new DatabaseSync(dbPath);
const now = "2026-04-28T00:00:00.000Z";

const knowledge = db.prepare(\`INSERT INTO knowledge (
  id, scope_level, category, tags, type, nature, trigger, wrong_pattern,
  correct_pattern, correct_pattern_tldr, confidence, current_tier,
  max_tier_ever, tier_entered_at, enforcement, status, hit_count,
  success_count, override_count, resurrect_count, evidence, source,
  conflict_with, created_at, last_validated_at
) VALUES (?, 'global', 'W', ?, 'wiki', 'wiki', ?, '', ?, ?, 0.7,
  'experimental', 'experimental', ?, 'passive', ?, 0, 0, 0, 0, ?,
  'wiki_pipeline', ?, ?, ?)\`);

const meta = db.prepare(\`INSERT INTO wiki_meta (
  knowledge_id, source_url, source_type, source_id, published_at, tldr,
  keywords, user_thumbs_down, inline_injection_count, fetch_error
) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NULL)\`);

function add(row) {
  knowledge.run(
    row.id,
    JSON.stringify(row.keywords),
    row.title,
    row.tldr,
    row.tldr,
    now,
    row.status ?? "active",
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
  id: "wiki-audit-github-new",
  title: "Audit GitHub Release",
  sourceType: "github_release",
  sourceId: "gh:release:1",
  url: "https://github.com/anthropics/claude-code/releases/tag/v1.0.0",
  publishedAt: "2026-04-27T09:00:00.000Z",
  tldr: "GitHub release audit summary.",
  keywords: ["release", "audit"],
});

add({
  id: "wiki-audit-manual-old",
  title: "Audit Manual URL",
  sourceType: "manual",
  sourceId: "manual:https://example.com/wiki",
  url: "https://example.com/wiki",
  publishedAt: "2026-04-26T08:00:00.000Z",
  tldr: "Manual URL audit summary.",
  keywords: ["manual", "audit"],
});

add({
  id: "wiki-audit-rss-dislike",
  title: "Audit RSS To Dislike",
  sourceType: "rss",
  sourceId: "rss:item:1",
  url: "https://example.com/rss/item-1",
  publishedAt: "2026-04-25T07:00:00.000Z",
  tldr: "RSS item audit summary.",
  keywords: ["rss", "audit"],
});

db.prepare(\`
  INSERT INTO wiki_rejection_log (id, source_type, source_id, title, reason, rejected_at)
  VALUES (?, ?, ?, ?, ?, ?)
\`).run(
  "rej-audit-old",
  "arxiv",
  "2401.00001",
  "Audit Rejected Paper",
  "off-topic for stack",
  "2026-04-24T06:00:00.000Z",
);

db.close();
`;
}

function runAudit(ctx: AuditContext): { checks: AuditCheck[]; artifacts: Record<string, string> } {
  const checks: AuditCheck[] = [];
  const artifacts: Record<string, string> = {};
  const projectTeamagent = path.join(ctx.projectDir, ".teamagent");
  const auditDb = path.join(projectTeamagent, "knowledge.db");
  const repoDb = path.join(ctx.repoRoot, ".teamagent", "knowledge.db");
  const repoDbBefore = fingerprint(repoDb);

  mkdirSync(projectTeamagent, { recursive: true });

  const subRepo = runWiki(ctx, "wiki-subscribe-github", [
    "wiki:subscribe",
    "--repo=anthropics/claude-code",
  ]);
  const subRss = runWiki(ctx, "wiki-subscribe-rss", [
    "wiki:subscribe",
    "--rss=https://example.com/feed.xml",
  ]);
  const subArxiv = runWiki(ctx, "wiki-subscribe-arxiv", [
    "wiki:subscribe",
    "--arxiv=cs.SE",
  ]);

  checks.push(
    check("wiki:subscribe github exits 0", subRepo.exitCode === 0, `exit=${subRepo.exitCode} stderr=${stderr(subRepo).trim()}`),
    check("wiki:subscribe rss exits 0", subRss.exitCode === 0, `exit=${subRss.exitCode} stderr=${stderr(subRss).trim()}`),
    check("wiki:subscribe arxiv exits 0", subArxiv.exitCode === 0, `exit=${subArxiv.exitCode} stderr=${stderr(subArxiv).trim()}`),
    check(
      "wiki:subscribe stdout proves CLI branches",
      stdout(subRepo).includes("✓ 已订阅 github_release anthropics/claude-code") &&
        stdout(subRss).includes("✓ 已订阅 rss https://example.com/feed.xml") &&
        stdout(subArxiv).includes("✓ 已订阅 arxiv cs.SE"),
    ),
  );

  const subscriptionRows = sqliteJson<SubscriptionRow>(
    ctx,
    "sqlite-subscriptions-after-cli",
    auditDb,
    "select source_type, config, auto_added, enabled from wiki_subscriptions order by created_at;",
  );
  artifacts["subscriptions-after-cli"] = rel(ctx, writeJson(ctx, "subscriptions-after-cli.json", subscriptionRows));
  const expectedSubscriptions: SubscriptionRow[] = [
    { source_type: "github_release", config: "{\"repo\":\"anthropics/claude-code\"}", auto_added: 0, enabled: 1 },
    { source_type: "rss", config: "{\"url\":\"https://example.com/feed.xml\"}", auto_added: 0, enabled: 1 },
    { source_type: "arxiv", config: "{\"category\":\"cs.SE\"}", auto_added: 0, enabled: 1 },
  ];
  checks.push(check(
    "external sqlite sees 3 manual enabled subscriptions",
    sameJson(subscriptionRows, expectedSubscriptions),
    JSON.stringify(subscriptionRows),
  ));

  runCommand(ctx, "seed-wiki-rows-node-sqlite", ["node", "--input-type=module", "-e", seedScript()], {
    cwd: ctx.projectDir,
    env: { AUDIT_DB: auditDb },
    timeoutMs: DB_TIMEOUT_MS,
  });

  const wikiRows = sqliteJson<WikiRow>(
    ctx,
    "sqlite-wiki-rows-after-seed",
    auditDb,
    [
      "select k.id, k.status, wm.source_type, wm.source_id, wm.published_at, wm.user_thumbs_down",
      "from knowledge k",
      "join wiki_meta wm on wm.knowledge_id = k.id",
      "order by wm.published_at desc;",
    ].join(" "),
  );
  const rejectionRows = sqliteJson<RejectionRow>(
    ctx,
    "sqlite-rejections-after-seed",
    auditDb,
    "select id, source_type, title, reason from wiki_rejection_log;",
  );
  artifacts["wiki-rows-after-seed"] = rel(ctx, writeJson(ctx, "wiki-rows-after-seed.json", wikiRows));
  artifacts["rejections-after-seed"] = rel(ctx, writeJson(ctx, "rejections-after-seed.json", rejectionRows));
  checks.push(check(
    "external SQL seed created three active non-disliked wiki rows in published order",
    wikiRows.length === 3 &&
      wikiRows.every((row) => row.status === "active" && row.user_thumbs_down === 0) &&
      wikiRows.map((row) => row.id).join(",") === "wiki-audit-github-new,wiki-audit-manual-old,wiki-audit-rss-dislike",
    JSON.stringify(wikiRows),
  ));
  checks.push(check(
    "external SQL seed created rejection log row",
    rejectionRows.length === 1 &&
      rejectionRows[0]?.id === "rej-audit-old" &&
      rejectionRows[0]?.title === "Audit Rejected Paper" &&
      rejectionRows[0]?.reason === "off-topic for stack",
    JSON.stringify(rejectionRows),
  ));

  const listLimit = runWiki(ctx, "wiki-list-limit-2", ["wiki:list", "--limit=2"]);
  const listLimitOut = stdout(listLimit);
  artifacts["wiki-list-limit-2"] = rel(ctx, listLimit.stdoutPath);
  checks.push(check("wiki:list --limit=2 exits 0", listLimit.exitCode === 0, `exit=${listLimit.exitCode}`));
  checks.push(check(
    "wiki:list --limit=2 follows SQL published_at desc and limit",
    ordered(listLimitOut, [
      "[wiki-aud] Audit GitHub Release",
      "来源: github_release | 2026-04-27",
      "摘要: GitHub release audit summary.",
      "关键词: release, audit",
      "链接: https://github.com/anthropics/claude-code/releases/tag/v1.0.0",
      "[wiki-aud] Audit Manual URL",
      "来源: manual | 2026-04-26",
      "摘要: Manual URL audit summary.",
      "关键词: manual, audit",
      "链接: https://example.com/wiki",
    ]) && !listLimitOut.includes("Audit RSS To Dislike"),
    listLimitOut.replace(/\s+/g, " ").trim(),
  ));

  const listManual = runWiki(ctx, "wiki-list-source-manual", ["wiki:list", "--source=manual", "--limit=10"]);
  const listManualOut = stdout(listManual);
  artifacts["wiki-list-source-manual"] = rel(ctx, listManual.stdoutPath);
  checks.push(check("wiki:list --source=manual exits 0", listManual.exitCode === 0, `exit=${listManual.exitCode}`));
  checks.push(check(
    "wiki:list --source=manual filters source_type",
    listManualOut.includes("Audit Manual URL") &&
      !listManualOut.includes("Audit GitHub Release") &&
      !listManualOut.includes("Audit RSS To Dislike"),
    listManualOut.replace(/\s+/g, " ").trim(),
  ));

  const statsBefore = runWiki(ctx, "wiki-stats-before-dislike", ["wiki:stats"]);
  const statsBeforeParsed = parseStatsOutput(stdout(statsBefore));
  const sqlNonDislikedBefore = sqliteJson<CountRow>(
    ctx,
    "sqlite-stats-before-total",
    auditDb,
    "select count(*) as n from wiki_meta where user_thumbs_down = 0;",
  )[0]?.n;
  const sqlBySourceBefore = bySourceFromRows(sqliteJson<SourceCountRow>(
    ctx,
    "sqlite-stats-before-by-source",
    auditDb,
    "select source_type, count(*) as n from wiki_meta where user_thumbs_down = 0 group by source_type order by source_type;",
  ));
  const sqlLastPullBefore = sqliteJson<LastPullRow>(
    ctx,
    "sqlite-stats-before-last-pull",
    auditDb,
    "select max(published_at) as last_pull from wiki_meta;",
  )[0]?.last_pull;
  const sqlSubscriptionCount = sqliteJson<CountRow>(
    ctx,
    "sqlite-stats-subscription-count",
    auditDb,
    "select count(*) as n from wiki_subscriptions;",
  )[0]?.n;
  artifacts["stats-before"] = rel(ctx, statsBefore.stdoutPath);
  checks.push(check("wiki:stats before dislike exits 0", statsBefore.exitCode === 0, `exit=${statsBefore.exitCode}`));
  checks.push(check(
    "wiki:stats before dislike matches external sqlite",
    statsBeforeParsed.total === sqlNonDislikedBefore &&
      statsBeforeParsed.subscriptions === sqlSubscriptionCount &&
      sameJson(statsBeforeParsed.bySource, sqlBySourceBefore) &&
      statsBeforeParsed.lastPull === sqlLastPullBefore,
    `cli=${JSON.stringify(statsBeforeParsed)} sql=${JSON.stringify({ total: sqlNonDislikedBefore, subscriptions: sqlSubscriptionCount, bySource: sqlBySourceBefore, lastPull: sqlLastPullBefore })}`,
  ));

  const subscriptions = runWiki(ctx, "wiki-subscriptions", ["wiki:subscriptions"]);
  const subscriptionOutLines = parseLines(stdout(subscriptions));
  const expectedSubscriptionLines = expectedSubscriptions.map(
    (row) => `[手动] ${row.source_type}: ${row.config}`,
  );
  artifacts["wiki-subscriptions"] = rel(ctx, subscriptions.stdoutPath);
  checks.push(check("wiki:subscriptions exits 0", subscriptions.exitCode === 0, `exit=${subscriptions.exitCode}`));
  checks.push(check(
    "wiki:subscriptions stdout matches external sqlite rows",
    sameJson(subscriptionOutLines, expectedSubscriptionLines),
    JSON.stringify(subscriptionOutLines),
  ));

  const rejected = runWiki(ctx, "wiki-rejected-limit-1", ["wiki:rejected", "--limit=1"]);
  const rejectedOut = stdout(rejected);
  artifacts["wiki-rejected-limit-1"] = rel(ctx, rejected.stdoutPath);
  checks.push(check("wiki:rejected exits 0", rejected.exitCode === 0, `exit=${rejected.exitCode}`));
  checks.push(check(
    "wiki:rejected --limit=1 prints seeded rejection",
    rejectedOut.trim() === "[rej-audi] Audit Rejected Paper | 原因: off-topic for stack",
    rejectedOut.trim(),
  ));

  const dislike = runWiki(ctx, "wiki-dislike-rss", ["wiki:dislike", "wiki-audit-rss-dislike"]);
  const statsAfter = runWiki(ctx, "wiki-stats-after-dislike", ["wiki:stats"]);
  const statsAfterParsed = parseStatsOutput(stdout(statsAfter));
  const thumbsRows = sqliteJson<{ knowledge_id: string; user_thumbs_down: number }>(
    ctx,
    "sqlite-thumbs-after-dislike",
    auditDb,
    "select knowledge_id, user_thumbs_down from wiki_meta order by knowledge_id;",
  );
  const sqlNonDislikedAfter = sqliteJson<CountRow>(
    ctx,
    "sqlite-stats-after-total",
    auditDb,
    "select count(*) as n from wiki_meta where user_thumbs_down = 0;",
  )[0]?.n;
  const sqlBySourceAfter = bySourceFromRows(sqliteJson<SourceCountRow>(
    ctx,
    "sqlite-stats-after-by-source",
    auditDb,
    "select source_type, count(*) as n from wiki_meta where user_thumbs_down = 0 group by source_type order by source_type;",
  ));
  artifacts["wiki-dislike"] = rel(ctx, dislike.stdoutPath);
  artifacts["stats-after"] = rel(ctx, statsAfter.stdoutPath);
  artifacts["thumbs-after-dislike"] = rel(ctx, writeJson(ctx, "thumbs-after-dislike.json", thumbsRows));
  checks.push(check("wiki:dislike exits 0", dislike.exitCode === 0, `exit=${dislike.exitCode}`));
  checks.push(check(
    "wiki:dislike updates target user_thumbs_down via real DB",
    stdout(dislike).includes("✓ 已标记 wiki-audit-rss-dislike 为不喜欢，后续注入会跳过") &&
      sameJson(thumbsRows, [
        { knowledge_id: "wiki-audit-github-new", user_thumbs_down: 0 },
        { knowledge_id: "wiki-audit-manual-old", user_thumbs_down: 0 },
        { knowledge_id: "wiki-audit-rss-dislike", user_thumbs_down: 1 },
      ]),
    JSON.stringify(thumbsRows),
  ));
  checks.push(check("wiki:stats after dislike exits 0", statsAfter.exitCode === 0, `exit=${statsAfter.exitCode}`));
  checks.push(check(
    "wiki:stats after dislike drops total to 2 and removes rss",
    statsAfterParsed.total === sqlNonDislikedAfter &&
      statsAfterParsed.subscriptions === sqlSubscriptionCount &&
      sameJson(statsAfterParsed.bySource, sqlBySourceAfter) &&
      sameJson(statsAfterParsed.bySource, { github_release: 1, manual: 1 }) &&
      statsAfterParsed.lastPull === sqlLastPullBefore,
    `cli=${JSON.stringify(statsAfterParsed)} sql=${JSON.stringify({ total: sqlNonDislikedAfter, subscriptions: sqlSubscriptionCount, bySource: sqlBySourceAfter, lastPull: sqlLastPullBefore })}`,
  ));

  const repoDbAfter = fingerprint(repoDb);
  checks.push(check(
    "wiki audit kept writes inside temp cwd",
    auditDb.startsWith(ctx.tmpDir) && sameFingerprint(repoDbBefore, repoDbAfter),
    `auditDb=${auditDb} repoDbBefore=${JSON.stringify(repoDbBefore)} repoDbAfter=${JSON.stringify(repoDbAfter)}`,
  ));

  artifacts["network-llm-smoke-note"] = rel(ctx, writeArtifact(
    ctx,
    "network-llm-smoke-note.md",
    [
      "# wiki:pull/wiki:add smoke note",
      "",
      "`wiki:pull` and `wiki:add` are intentionally not default hard checks in this runner.",
      "They depend on live network fetches, Claude/LLM availability, and embedding/model environment.",
      "",
      "Offline hard coverage in this run covers `wiki:subscribe`, `wiki:subscriptions`,",
      "`wiki:list`, `wiki:stats`, `wiki:rejected`, and `wiki:dislike` against a real",
      "temporary SQLite database cross-checked with external `sqlite3` queries.",
      "",
    ].join("\n"),
  ));
  checks.push(check(
    "wiki:pull/wiki:add recorded as blocked smoke, not hard offline gates",
    true,
    "network + LLM dependent; see network-llm-smoke-note.md",
  ));

  return { checks, artifacts };
}

const ctx = createAuditContext("09", "wiki");
try {
  const { checks, artifacts } = runAudit(ctx);
  const ok = checks.every((item) => item.ok);
  finalize(ctx, {
    feature: FEATURE,
    status: ok ? "passed" : "failed",
    summary: ok
      ? "真实 wiki CLI 在临时 HOME/cwd 下通过离线审计：订阅、列表、统计、拒绝日志和 dislike 均与外部 sqlite 查询一致；pull/add 记录为联网/LLM smoke 边界。"
      : "wiki audit 发现 CLI stdout 与外部 SQLite 事实不一致，或写入隔离边界不符合预期。",
    checks,
    artifacts,
  });
} catch (err) {
  finalize(ctx, {
    feature: FEATURE,
    status: "failed",
    summary: `feature-09 wiki audit runner crashed before completing: ${err instanceof Error ? err.message : String(err)}`,
    checks: [check("runner completed", false, err instanceof Error ? err.stack ?? err.message : String(err))],
  });
} finally {
  cleanupTemp(ctx);
}
