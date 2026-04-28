import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  check,
  cleanupTemp,
  createAuditContext,
  finalize,
  readText,
  runCommand,
  writeArtifact,
  writeJson,
  type AuditDecision,
} from "./lib.js";

const require = createRequire(import.meta.url);

type DatabaseSyncCtor = new (filename: string) => {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  };
  close(): void;
};

const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

const KNOWLEDGE_SCHEMA = `
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
`;

const PROJECT_SEED = `
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
`;

const GLOBAL_SEED = `
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
`;

const EVENTS_SCHEMA_AND_SEED = `
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
`;

function withDb<T>(file: string, fn: (db: InstanceType<DatabaseSyncCtor>) => T): T {
  const db = new DatabaseSync(file) as InstanceType<DatabaseSyncCtor>;
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function seedSqlite(file: string, sql: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  withDb(file, (db) => db.exec(sql));
}

function queryLines(file: string, sql: string): string[] {
  return withDb(file, (db) =>
    db.prepare(sql).all().map((row) => Object.values(row as Record<string, unknown>).join("|")),
  );
}

function containsAll(text: string, needles: string[]): { ok: boolean; missing: string[] } {
  const missing = needles.filter((needle) => !text.includes(needle));
  return { ok: missing.length === 0, missing };
}

function notContainsAny(text: string, needles: string[]): { ok: boolean; present: string[] } {
  const present = needles.filter((needle) => text.includes(needle));
  return { ok: present.length === 0, present };
}

function detailForMissing(result: { ok: boolean; missing: string[] }): string | undefined {
  return result.ok ? undefined : `missing: ${result.missing.join(", ")}`;
}

function detailForPresent(result: { ok: boolean; present: string[] }): string | undefined {
  return result.ok ? undefined : `unexpected: ${result.present.join(", ")}`;
}

function realCliCommand(repoRoot: string, args: string[]): string[] {
  return [
    path.join(repoRoot, "node_modules", ".bin", "tsx"),
    path.join(repoRoot, "packages", "cli", "src", "bin.ts"),
    ...args,
  ];
}

function main(): AuditDecision {
  const ctx = createAuditContext("feature-03", "stats");
  const projectDb = path.join(ctx.projectDir, ".teamagent", "knowledge.db");
  const globalDb = path.join(ctx.homeDir, ".teamagent", "global.db");
  const eventsDb = path.join(ctx.homeDir, ".teamagent", "events.db");
  const eventsJsonl = path.join(ctx.homeDir, ".teamagent", "events.jsonl");

  try {
    seedSqlite(projectDb, KNOWLEDGE_SCHEMA + PROJECT_SEED);
    seedSqlite(globalDb, KNOWLEDGE_SCHEMA + GLOBAL_SEED);
    seedSqlite(eventsDb, EVENTS_SCHEMA_AND_SEED);
    mkdirSync(path.dirname(eventsJsonl), { recursive: true });
    writeFileSync(
      eventsJsonl,
      '{"id":"jsonl-only","kind":"calibrator.adjusted","knowledge_id":"jsonl-only-rule","confidence_before":0.1,"confidence_after":0.9,"timestamp":"2099-01-01T00:00:00Z","schema_version":1}\n',
      "utf-8",
    );

    const env = { HOME: ctx.homeDir };
    const stats = runCommand(ctx, "stats-default", realCliCommand(ctx.repoRoot, ["stats"]), {
      cwd: ctx.projectDir,
      env,
      timeoutMs: 60_000,
    });
    const explain = runCommand(ctx, "stats-explain-p-old", realCliCommand(ctx.repoRoot, ["stats", "--explain=p-old"]), {
      cwd: ctx.projectDir,
      env,
      timeoutMs: 60_000,
    });
    const explainMissing = runCommand(
      ctx,
      "stats-explain-missing",
      realCliCommand(ctx.repoRoot, ["stats", "--explain=no-such-rule"]),
      { cwd: ctx.projectDir, env, timeoutMs: 60_000 },
    );
    const stuck = runCommand(
      ctx,
      "stats-stuck-in-promotion",
      realCliCommand(ctx.repoRoot, ["stats", "--stuck-in-promotion", "--stuck-days=14"]),
      { cwd: ctx.projectDir, env, timeoutMs: 60_000 },
    );
    const override = runCommand(
      ctx,
      "stats-override-signals",
      realCliCommand(ctx.repoRoot, ["stats", "--override-signals"]),
      { cwd: ctx.projectDir, env, timeoutMs: 60_000 },
    );

    const statsOut = readText(stats.stdoutPath);
    const explainOut = readText(explain.stdoutPath);
    const explainMissingOut = readText(explainMissing.stdoutPath);
    const stuckOut = readText(stuck.stdoutPath);
    const overrideOut = readText(override.stdoutPath);

    const projectScopeStatus = queryLines(
      projectDb,
      "SELECT scope_level, status, COUNT(*) AS count FROM knowledge GROUP BY scope_level, status ORDER BY scope_level, status",
    );
    const globalScopeStatus = queryLines(
      globalDb,
      "SELECT scope_level, status, COUNT(*) AS count FROM knowledge GROUP BY scope_level, status ORDER BY scope_level, status",
    );
    const eventRows = queryLines(
      eventsDb,
      "SELECT kind, knowledge_id, COALESCE(payload, '') AS payload FROM events ORDER BY timestamp, id",
    );

    writeJson(ctx, "db-summary.json", {
      projectScopeStatus,
      globalScopeStatus,
      eventRows,
      eventsJsonlExists: existsSync(eventsJsonl),
      projectDb,
      globalDb,
      eventsDb,
      eventsJsonl,
    });
    writeArtifact(ctx, "seed-sql.sql", [
      "-- project/global knowledge schema",
      KNOWLEDGE_SCHEMA,
      "-- project seed",
      PROJECT_SEED,
      "-- global seed",
      GLOBAL_SEED,
      "-- events seed",
      EVENTS_SCHEMA_AND_SEED,
    ].join("\n"));

    const defaultTotals = containsAll(statsOut, [
      "📊 TeamAgent 知识库统计",
      "总数: 6 (活跃 5, 归档 1)",
    ]);
    const defaultScopeCategory = containsAll(statsOut, [
      "按作用域:",
      "  personal  2",
      "  team      1",
      "  global    2",
      "按分类:",
      "  C 代码层  2",
      "  E 工程层  1",
      "  S 策略层  1",
      "  K 认知层  1",
    ]);
    const defaultTopHits = containsAll(statsOut, [
      "Top 4 高频命中:",
      "[12次] global high impact rule → keep global pattern (conf=0.93)",
      "[8次] project newest fetch rule → use native fetch (conf=0.86)",
      "[2次] project old build rule → run verification before report (conf=0.72)",
      "[1次] team scoped review rule → ask reviewer before merge (conf=0.64)",
    ]);
    const defaultRecent = containsAll(statsOut, [
      "最近 5 条新增:",
      "[2026-04-25] C/http  project newest fetch rule",
      "[2026-04-24] S/process  team scoped review rule",
      "[2026-04-23] C/lint  global no hit lint rule",
      "[2026-04-22] K/strategy  global high impact rule",
      "[2026-04-20] E/build  project old build rule",
    ]);
    const defaultMovement = containsAll(statsOut, [
      "本周（7 天）confidence 变化 top 2:",
      "-0.25  g-top [自动归档]",
      "global high impact rule",
      "+0.10  p-new",
      "project newest fetch rule",
    ]);
    const negativeDefault = notContainsAny(statsOut, [
      "archived rule should not be active",
      "jsonl-only-rule",
    ]);
    const explainCheck = containsAll(explainOut, [
      "rule p-old",
      "tier: probation (max ever: stable)",
      "confidence: 0.720",
      "demerit: 0.40 (updated 2026-04-10T00:00:00Z)",
    ]);
    const explainMissingCheck = containsAll(explainMissingOut, ["rule no-such-rule not found"]);
    const stuckCheck = containsAll(stuckOut, [
      "stuck-in-promotion（probation tier > 14 天，共 1 条）",
      "p-old",
      "project old build rule",
    ]);
    const stuckNegative = notContainsAny(stuckOut, ["p-arch", "archived rule should not be active"]);
    const overrideCheck = containsAll(overrideOut, [
      "TeamAgent Override Signals",
      "p-new",
      "ignored: 2",
      "complied: 1",
      "g-top",
      "ignored: 0",
      "complied: 1",
    ]);
    const dbProjectCheck = projectScopeStatus.join("\n") === [
      "personal|active|2",
      "personal|archived|1",
      "team|active|1",
    ].join("\n");
    const dbGlobalCheck = globalScopeStatus.join("\n") === "global|active|2";
    const dbEventCheck = containsAll(eventRows.join("\n"), [
      'calibrator.adjusted|p-new|{"confidence_before":0.80,"confidence_after":0.86}',
      'calibrator.adjusted|p-new|{"confidence_before":0.86,"confidence_after":0.90}',
      'calibrator.adjusted|g-top|{"confidence_before":0.95,"confidence_after":0.70,"status_after":"archived"}',
      "ai.override.ignored|p-new|",
      "ai.override.complied|g-top|",
    ]);

    const checks = [
      check("default stats shows total and active/archive counts", defaultTotals.ok, detailForMissing(defaultTotals)),
      check("default stats shows scope and category buckets", defaultScopeCategory.ok, detailForMissing(defaultScopeCategory)),
      check("default stats shows active top hits", defaultTopHits.ok, detailForMissing(defaultTopHits)),
      check("default stats shows recent active entries", defaultRecent.ok, detailForMissing(defaultRecent)),
      check("default stats shows SQLite confidence movement", defaultMovement.ok, detailForMissing(defaultMovement)),
      check("default stats ignores archived rows and events.jsonl-only movement", negativeDefault.ok, detailForPresent(negativeDefault)),
      check("stats --explain prints seeded rule tier/confidence/demerit", explainCheck.ok, detailForMissing(explainCheck)),
      check("stats --explain reports missing rule", explainMissingCheck.ok, detailForMissing(explainMissingCheck)),
      check("stats --stuck-in-promotion reports only active probation rule", stuckCheck.ok, detailForMissing(stuckCheck)),
      check("stats --stuck-in-promotion excludes archived probation rule", stuckNegative.ok, detailForPresent(stuckNegative)),
      check("stats --override-signals aggregates ignored/complied counts", overrideCheck.ok, detailForMissing(overrideCheck)),
      check("external SQL project DB counts match seed", dbProjectCheck, projectScopeStatus.join("\\n")),
      check("external SQL global DB counts match seed", dbGlobalCheck, globalScopeStatus.join("\\n")),
      check("external SQL events DB contains calibrator and override rows", dbEventCheck.ok, detailForMissing(dbEventCheck)),
      check("events.jsonl negative fixture was written", existsSync(eventsJsonl), eventsJsonl),
    ];
    const status = checks.every((c) => c.ok) ? "passed" : "failed";

    return finalize(ctx, {
      feature: "feature-03-stats",
      status,
      summary:
        "Seeded project/global/events SQLite databases with node:sqlite SQL, ran the real stats CLI modes, and verified stdout plus external DB queries. A fake events.jsonl-only calibrator event was present but absent from stats output.",
      checks,
      artifacts: {
        statsStdout: stats.stdoutPath,
        explainStdout: explain.stdoutPath,
        explainMissingStdout: explainMissing.stdoutPath,
        stuckStdout: stuck.stdoutPath,
        overrideStdout: override.stdoutPath,
        dbSummary: path.join(ctx.outDir, "db-summary.json"),
        seedSql: path.join(ctx.outDir, "seed-sql.sql"),
      },
    });
  } catch (err) {
    return finalize(ctx, {
      feature: "feature-03-stats",
      status: "blocked",
      summary: err instanceof Error ? err.message : String(err),
      checks: [check("runner completed", false, err instanceof Error ? err.stack : String(err))],
    });
  } finally {
    cleanupTemp(ctx);
  }
}

main();
