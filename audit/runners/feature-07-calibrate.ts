import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  type AuditDecision,
} from "./lib.js";

const FEATURE = "feature-07-calibrate";
const NOW = "2026-04-28T00:00:00Z";

type Check = AuditDecision["checks"][number];

interface Dirs {
  home: string;
  cwd: string;
  skills: string;
  projectDb: string;
  globalDb: string;
  eventsDb: string;
}

interface KnowledgeSnapshot {
  id: string;
  confidence: number;
  demerit: number;
  currentTier: string;
  maxTierEver: string;
  status: string;
  lastValidatedAt: string;
  tierEnteredAt: string;
}

interface EventRow {
  id: string;
  kind: string;
  knowledgeId: string;
  payload: string;
}

function cliCommand(ctx: AuditContext, args: string[]): string[] {
  return [
    path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"),
    path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"),
    ...args,
  ];
}

function makeDirs(ctx: AuditContext): Dirs {
  const skills = path.join(ctx.tmpDir, "skills");
  const projectDb = path.join(ctx.projectDir, ".teamagent", "knowledge.db");
  const globalDb = path.join(ctx.homeDir, ".teamagent", "global.db");
  const eventsDb = path.join(ctx.homeDir, ".teamagent", "events.db");
  mkdirSync(path.dirname(projectDb), { recursive: true });
  mkdirSync(path.dirname(globalDb), { recursive: true });
  mkdirSync(skills, { recursive: true });
  writeFileSync(
    path.join(ctx.projectDir, "CLAUDE.md"),
    ["# Calibrate audit", "", "user sentinel before", ""].join("\n"),
    "utf-8",
  );
  return { home: ctx.homeDir, cwd: ctx.projectDir, skills, projectDb, globalDb, eventsDb };
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function bootstrapSchema(ctx: AuditContext, dirs: Dirs) {
  const script = `
import path from "node:path";
import { openDb } from "@teamagent/adapters";

for (const dbPath of [
  path.join(process.env.AUDIT_CWD, ".teamagent", "knowledge.db"),
  path.join(process.env.AUDIT_HOME, ".teamagent", "global.db"),
  path.join(process.env.AUDIT_HOME, ".teamagent", "events.db"),
]) {
  const db = openDb(dbPath);
  db.close();
}
`;
  return runCommand(ctx, "schema-bootstrap-production-openDb", [
    "pnpm",
    "--dir",
    ctx.repoRoot,
    "exec",
    "tsx",
    "-e",
    script,
  ], {
    env: { AUDIT_CWD: dirs.cwd, AUDIT_HOME: dirs.home },
    allowFailure: true,
    timeoutMs: 60_000,
  });
}

function knowledgeSeedSql(): string {
  const columns = [
    "id",
    "scope_level",
    "category",
    "tags",
    "type",
    "nature",
    "trigger",
    "wrong_pattern",
    "correct_pattern",
    "reasoning",
    "confidence",
    "demerit",
    "demerit_last_updated",
    "current_tier",
    "max_tier_ever",
    "tier_entered_at",
    "enforcement",
    "status",
    "hit_count",
    "success_count",
    "override_count",
    "resurrect_count",
    "evidence",
    "source",
    "conflict_with",
    "created_at",
    "last_hit_at",
    "last_validated_at",
    "channel",
    "trigger_description",
    "pattern_description",
    "hard_negatives",
    "threshold_alpha",
    "threshold_beta",
    "fire_threshold",
    "observation_window",
    "embedder_model_id",
  ];
  const evidence = '{"success_sessions":0,"success_users":0,"correction_sessions":0}';
  const rows = [
    [
      "rule-promote", "personal", "E", '["audit"]', "avoidance", "objective",
      "promotion audit", "bad promote", "USE_PROMOTED_RULE",
      "success evidence should promote", "0.20", "0", "", "experimental", "experimental",
      "2026-03-01T00:00:00Z", "passive", "active", "0", "0", "0", "0",
      evidence, "accumulated", "[]", "2026-03-01T00:00:00Z", "", "",
      "tool-action", "", "", "NULL", "1", "1", "0.4", "NULL", "",
    ],
    [
      "rule-demote", "personal", "E", '["audit"]', "avoidance", "objective",
      "demotion audit", "bad demote", "USE_DEMOTED_RULE",
      "failure evidence should demote", "0.80", "0", "", "stable", "stable",
      "2026-03-01T00:00:00Z", "warn", "active", "0", "0", "0", "0",
      evidence, "accumulated", "[]", "2026-03-01T00:00:00Z", "", "",
      "tool-action", "", "", "NULL", "1", "1", "0.4", "NULL", "",
    ],
    [
      "rule-dormant", "personal", "E", '["audit"]', "avoidance", "objective",
      "dormant audit", "bad dormant", "USE_DORMANT_RULE",
      "ignored override should add demerit", "0.95", "49", NOW, "canonical", "canonical",
      "2026-03-01T00:00:00Z", "block", "active", "0", "0", "0", "0",
      evidence, "accumulated", "[]", "2026-03-01T00:00:00Z", "", "",
      "tool-action", "", "", "NULL", "1", "1", "0.4", "NULL", "",
    ],
  ];
  const values = rows.map((row) => {
    const rendered = row.map((value, index) => {
      const col = columns[index];
      if (value === "NULL") return "NULL";
      if (
        col === "confidence" ||
        col === "demerit" ||
        col === "hit_count" ||
        col === "success_count" ||
        col === "override_count" ||
        col === "resurrect_count" ||
        col === "threshold_alpha" ||
        col === "threshold_beta" ||
        col === "fire_threshold"
      ) {
        return value;
      }
      return sqlQuote(value);
    });
    return `(${rendered.join(", ")})`;
  });
  return [
    "BEGIN;",
    "DELETE FROM knowledge;",
    `INSERT INTO knowledge (${columns.join(", ")}) VALUES`,
    values.join(",\n"),
    ";",
    "COMMIT;",
    "",
  ].join("\n");
}

function eventsSeedSql(): string {
  const lines = ["BEGIN;", "DELETE FROM events;"];
  for (let i = 1; i <= 20; i++) {
    const n = String(i).padStart(2, "0");
    lines.push(
      `INSERT INTO events(id, kind, knowledge_id, tool_use_id, timestamp, payload) VALUES (${[
        sqlQuote(`e-promote-${n}`),
        sqlQuote("hook-post.result"),
        sqlQuote("rule-promote"),
        sqlQuote(`tu-promote-${n}`),
        sqlQuote(`2026-04-27T00:00:${n}.000Z`),
        sqlQuote('{"payload":{"success":true}}'),
      ].join(", ")});`,
    );
  }
  for (let i = 1; i <= 10; i++) {
    const n = String(i).padStart(2, "0");
    lines.push(
      `INSERT INTO events(id, kind, knowledge_id, tool_use_id, timestamp, payload) VALUES (${[
        sqlQuote(`e-demote-${n}`),
        sqlQuote("hook-post.result"),
        sqlQuote("rule-demote"),
        sqlQuote(`tu-demote-${n}`),
        sqlQuote(`2026-04-27T00:01:${n}.000Z`),
        sqlQuote('{"payload":{"success":false}}'),
      ].join(", ")});`,
    );
  }
  lines.push(
    `INSERT INTO events(id, kind, knowledge_id, tool_use_id, timestamp, payload) VALUES (${[
      sqlQuote("e-dormant-1"),
      sqlQuote("ai.override.ignored"),
      sqlQuote("rule-dormant"),
      sqlQuote("tu-dormant-1"),
      sqlQuote("2026-04-27T00:02:00.000Z"),
      sqlQuote("{}"),
    ].join(", ")});`,
  );
  lines.push("COMMIT;", "");
  return lines.join("\n");
}

function seedSqlite(ctx: AuditContext, dirs: Dirs): Check[] {
  const checks: Check[] = [];
  const knowledgeSql = writeArtifact(ctx, "seed-knowledge.sql", knowledgeSeedSql());
  const eventsSql = writeArtifact(ctx, "seed-events.sql", eventsSeedSql());
  const seedKnowledge = runCommand(ctx, "sqlite-seed-knowledge-external", [
    "sqlite3",
    dirs.projectDb,
    `.read ${knowledgeSql}`,
  ], { allowFailure: true });
  const seedEvents = runCommand(ctx, "sqlite-seed-events-external", [
    "sqlite3",
    dirs.eventsDb,
    `.read ${eventsSql}`,
  ], { allowFailure: true });
  checks.push(check("external sqlite3 seeds project knowledge", seedKnowledge.exitCode === 0));
  checks.push(check("external sqlite3 seeds events.db", seedEvents.exitCode === 0));
  return checks;
}

function sqlite(ctx: AuditContext, name: string, dbPath: string, sql: string, allowFailure = true) {
  return runCommand(ctx, name, ["sqlite3", "-separator", "\t", dbPath, sql], { allowFailure });
}

function sqliteColumn(ctx: AuditContext, name: string, dbPath: string, sql: string) {
  return runCommand(ctx, name, ["sqlite3", "-header", "-column", dbPath, sql], { allowFailure: true });
}

function parseSnapshot(text: string): KnowledgeSnapshot[] {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [id, confidence, demerit, currentTier, maxTierEver, status, lastValidatedAt, tierEnteredAt] = line.split("\t");
    return {
      id: id ?? "",
      confidence: Number(confidence),
      demerit: Number(demerit),
      currentTier: currentTier ?? "",
      maxTierEver: maxTierEver ?? "",
      status: status ?? "",
      lastValidatedAt: lastValidatedAt ?? "",
      tierEnteredAt: tierEnteredAt ?? "",
    };
  });
}

function snapshotById(rows: KnowledgeSnapshot[]): Map<string, KnowledgeSnapshot> {
  return new Map(rows.map((row) => [row.id, row]));
}

function parseEventRows(text: string): EventRow[] {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [id, kind, knowledgeId, payload] = line.split("\t");
    return {
      id: id ?? "",
      kind: kind ?? "",
      knowledgeId: knowledgeId ?? "",
      payload: payload ?? "",
    };
  });
}

function listSkillIds(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(path.join(skillsDir, id, "SKILL.md")))
    .sort((a, b) => a.localeCompare(b));
}

function readAllSkillText(skillsDir: string): string {
  return listSkillIds(skillsDir)
    .map((id) => readFileSync(path.join(skillsDir, id, "SKILL.md"), "utf-8"))
    .join("\n");
}

const SNAPSHOT_SQL = [
  "select id,",
  "printf('%.4f', confidence),",
  "printf('%.2f', demerit),",
  "current_tier,",
  "max_tier_ever,",
  "status,",
  "coalesce(last_validated_at,''),",
  "coalesce(tier_entered_at,'')",
  "from knowledge order by id;",
].join(" ");

function knowledgeStateChecks(before: KnowledgeSnapshot[], after: KnowledgeSnapshot[]): Check[] {
  const b = snapshotById(before);
  const a = snapshotById(after);
  const promote = a.get("rule-promote");
  const demote = a.get("rule-demote");
  const dormant = a.get("rule-dormant");
  return [
    check(
      "before snapshot has expected confidence/tier/demerit/status",
      b.get("rule-promote")?.confidence === 0.2 &&
        b.get("rule-promote")?.currentTier === "experimental" &&
        b.get("rule-demote")?.confidence === 0.8 &&
        b.get("rule-demote")?.currentTier === "stable" &&
        b.get("rule-dormant")?.demerit === 49 &&
        b.get("rule-dormant")?.status === "active",
    ),
    check(
      "v2 after promotes successful rule to canonical active",
      !!promote &&
        promote.confidence > 0.82 &&
        promote.confidence < 0.85 &&
        promote.currentTier === "canonical" &&
        promote.maxTierEver === "canonical" &&
        promote.status === "active" &&
        promote.lastValidatedAt.length > 0,
      promote ? JSON.stringify(promote) : "missing rule-promote",
    ),
    check(
      "v2 after demotes failing rule to experimental active",
      !!demote &&
        demote.confidence === 0 &&
        demote.currentTier === "experimental" &&
        demote.maxTierEver === "stable" &&
        demote.status === "active" &&
        demote.lastValidatedAt.length > 0,
      demote ? JSON.stringify(demote) : "missing rule-demote",
    ),
    check(
      "v2 after moves high-demerit rule to dormant",
      !!dormant &&
        dormant.confidence === 0 &&
        dormant.demerit >= 50 &&
        dormant.currentTier === "dormant" &&
        dormant.maxTierEver === "canonical" &&
        dormant.status === "dormant" &&
        dormant.lastValidatedAt.length > 0,
      dormant ? JSON.stringify(dormant) : "missing rule-dormant",
    ),
  ];
}

function adjustedEventChecks(rows: EventRow[]): Check[] {
  const ids = rows.map((row) => row.knowledgeId).sort((a, b) => a.localeCompare(b));
  const requiredIds = ["rule-demote", "rule-dormant", "rule-promote"];
  const payloadsOk = rows.every((row) => {
    try {
      const payload = JSON.parse(row.payload || "{}") as Record<string, unknown>;
      return (
        typeof payload.confidence_before === "number" &&
        typeof payload.confidence_after === "number" &&
        typeof payload.demerit_after === "number" &&
        typeof payload.tier_after === "string" &&
        typeof payload.status_after === "string"
      );
    } catch {
      return false;
    }
  });
  return [
    check(
      "non-dry-run v2 writes one calibrator.adjusted event per adjustment",
      rows.length === 3 && ids.join(",") === requiredIds.join(","),
      `count=${rows.length}; ids=${ids.join(",") || "(none)"}`,
    ),
    check(
      "calibrator.adjusted payload exposes confidence/tier/demerit/status",
      rows.length === 3 && payloadsOk,
      rows.length === 0 ? "no calibrator.adjusted rows found" : "payloads inspected from events.db",
    ),
  ];
}

async function main(): Promise<void> {
  const ctx = createAuditContext("feature-07", "calibrate");
  const checks: Check[] = [];
  const artifacts: Record<string, string> = {};
  const dirs = makeDirs(ctx);

  try {
    artifacts["project-db-path"] = dirs.projectDb;
    artifacts["events-db-path"] = dirs.eventsDb;
    artifacts["skills-dir"] = dirs.skills;

    const bootstrap = bootstrapSchema(ctx, dirs);
    checks.push(check("production openDb bootstraps isolated project/global/events schema", bootstrap.exitCode === 0));
    checks.push(...seedSqlite(ctx, dirs));

    const projectSchema = sqlite(ctx, "sqlite-project-schema-version", dirs.projectDb, "select max(version) from schema_version;");
    const eventsSchema = sqliteColumn(ctx, "sqlite-events-schema", dirs.eventsDb, "pragma table_info(events);");
    const knowledgeSchema = sqliteColumn(ctx, "sqlite-knowledge-schema", dirs.projectDb, "pragma table_info(knowledge);");
    const schemaVersion = readText(projectSchema.stdoutPath).trim();
    const knowledgeSchemaText = readText(knowledgeSchema.stdoutPath);
    const eventsSchemaText = readText(eventsSchema.stdoutPath);
    checks.push(check("external schema query sees schema_version 7", schemaVersion === "7", `version=${schemaVersion}`));
    checks.push(check(
      "external schema query sees calibration columns",
      ["confidence", "demerit", "current_tier", "max_tier_ever", "status"].every((name) =>
        knowledgeSchemaText.includes(name),
      ),
    ));
    checks.push(check(
      "external schema query sees events columns",
      ["kind", "knowledge_id", "tool_use_id", "timestamp", "payload"].every((name) => eventsSchemaText.includes(name)),
    ));

    const before = sqlite(ctx, "sqlite-before-snapshot", dirs.projectDb, SNAPSHOT_SQL);
    sqliteColumn(ctx, "sqlite-before-snapshot-human", dirs.projectDb, SNAPSHOT_SQL);
    const beforeRows = parseSnapshot(readText(before.stdoutPath));
    artifacts["before-snapshot"] = rel(ctx, before.stdoutPath);

    const eventInput = sqlite(
      ctx,
      "sqlite-event-input-counts",
      dirs.eventsDb,
      "select kind || '|' || knowledge_id || '|' || count(*) from events group by kind, knowledge_id order by knowledge_id, kind;",
    );
    const eventInputText = readText(eventInput.stdoutPath);
    checks.push(check(
      "external event input query confirms expected seed counts",
      eventInputText.includes("hook-post.result|rule-promote|20") &&
        eventInputText.includes("hook-post.result|rule-demote|10") &&
        eventInputText.includes("ai.override.ignored|rule-dormant|1"),
      eventInputText.replace(/\s+/g, " ").trim(),
    ));

    const dryBefore = sqlite(ctx, "sqlite-dry-before", dirs.projectDb, SNAPSHOT_SQL);
    const dryRun = runCommand(ctx, "calibrate-dry-run-default-v2", cliCommand(ctx, ["calibrate", "--dry-run"]), {
      cwd: dirs.cwd,
      env: {
        HOME: dirs.home,
        TEAMAGENT_SKILLS_DIR: dirs.skills,
      },
      allowFailure: true,
      timeoutMs: 60_000,
    });
    const dryAfter = sqlite(ctx, "sqlite-dry-after", dirs.projectDb, SNAPSHOT_SQL);
    const dryAdjusted = sqlite(
      ctx,
      "sqlite-dry-adjusted-events-count",
      dirs.eventsDb,
      "select count(*) from events where kind='calibrator.adjusted';",
    );
    runCommand(ctx, "grep-dry-run-claude-marker", [
      "grep",
      "-n",
      "TEAMAGENT:START",
      path.join(dirs.cwd, "CLAUDE.md"),
    ], { allowFailure: true });
    runCommand(ctx, "find-dry-run-skills", ["find", dirs.skills, "-maxdepth", "2", "-type", "f", "-name", "SKILL.md", "-print"], {
      allowFailure: true,
    });
    const dryStdout = readText(dryRun.stdoutPath);
    checks.push(check("default v2 dry-run exits zero", dryRun.exitCode === 0));
    checks.push(check(
      "default v2 dry-run predicts three adjustments",
      dryStdout.includes("Calibrate (dry-run)") && dryStdout.includes("调整 3"),
      dryStdout.replace(/\s+/g, " ").trim(),
    ));
    checks.push(check(
      "dry-run leaves knowledge DB unchanged",
      readText(dryBefore.stdoutPath) === readText(dryAfter.stdoutPath),
    ));
    checks.push(check(
      "dry-run does not write calibrator.adjusted events",
      readText(dryAdjusted.stdoutPath).trim() === "0",
      `count=${readText(dryAdjusted.stdoutPath).trim()}`,
    ));
    checks.push(check(
      "dry-run does not compile CLAUDE.md or skills",
      !readText(path.join(dirs.cwd, "CLAUDE.md")).includes("TEAMAGENT:START") &&
        listSkillIds(dirs.skills).length === 0,
    ));

    const realRun = runCommand(ctx, "calibrate-real-default-v2", cliCommand(ctx, ["calibrate"]), {
      cwd: dirs.cwd,
      env: {
        HOME: dirs.home,
        TEAMAGENT_SKILLS_DIR: dirs.skills,
      },
      allowFailure: true,
      timeoutMs: 60_000,
    });
    checks.push(check("default v2 real calibrate exits zero", realRun.exitCode === 0));
    checks.push(check(
      "default v2 real calibrate reports three adjustments",
      readText(realRun.stdoutPath).includes("调整 3"),
      readText(realRun.stdoutPath).replace(/\s+/g, " ").trim(),
    ));

    const after = sqlite(ctx, "sqlite-after-snapshot", dirs.projectDb, SNAPSHOT_SQL);
    sqliteColumn(ctx, "sqlite-after-snapshot-human", dirs.projectDb, SNAPSHOT_SQL);
    const afterRows = parseSnapshot(readText(after.stdoutPath));
    artifacts["after-snapshot"] = rel(ctx, after.stdoutPath);
    checks.push(...knowledgeStateChecks(beforeRows, afterRows));

    sqliteColumn(ctx, "sqlite-events-counts-after", dirs.eventsDb, "select kind, count(*) n from events group by kind order by kind;");
    const adjustedRowsRecord = sqlite(
      ctx,
      "sqlite-calibrator-adjusted-rows",
      dirs.eventsDb,
      "select id, kind, knowledge_id, coalesce(payload,'') from events where kind='calibrator.adjusted' order by timestamp;",
    );
    const adjustedRows = parseEventRows(readText(adjustedRowsRecord.stdoutPath));
    writeJson(ctx, "calibrator-adjusted-rows.json", adjustedRows);
    checks.push(...adjustedEventChecks(adjustedRows));

    runCommand(ctx, "grep-claude-after-compile", [
      "grep",
      "-nE",
      "TEAMAGENT:START|TEAMAGENT:END|USE_",
      path.join(dirs.cwd, "CLAUDE.md"),
    ], { allowFailure: true });
    runCommand(ctx, "find-skills-after-compile", ["find", dirs.skills, "-maxdepth", "2", "-type", "f", "-name", "SKILL.md", "-print"], {
      allowFailure: true,
    });
    const claudeMd = readText(path.join(dirs.cwd, "CLAUDE.md"));
    const skillIds = listSkillIds(dirs.skills);
    const skillText = readAllSkillText(dirs.skills);
    artifacts["claude-after"] = rel(ctx, writeArtifact(ctx, "CLAUDE.after.md", claudeMd));
    artifacts["skills-after"] = rel(ctx, writeArtifact(ctx, "skills.after.txt", skillIds.join("\n") + "\n\n" + skillText));
    checks.push(check(
      "real calibrate compiles CLAUDE.md from updated tier/status",
      claudeMd.includes("TEAMAGENT:START") &&
        claudeMd.includes("TEAMAGENT:END") &&
        claudeMd.includes("USE_PROMOTED_RULE") &&
        !claudeMd.includes("USE_DEMOTED_RULE") &&
        !claudeMd.includes("USE_DORMANT_RULE"),
    ));
    checks.push(check(
      "real calibrate compiles skills from updated tier/status",
      existsSync(path.join(dirs.skills, "rule-promote", "SKILL.md")) &&
        !existsSync(path.join(dirs.skills, "rule-demote", "SKILL.md")) &&
        !existsSync(path.join(dirs.skills, "rule-dormant", "SKILL.md")),
      `skills=${skillIds.join(",") || "(none)"}`,
    ));

    try {
      copyFileSync(dirs.projectDb, path.join(ctx.outDir, "knowledge.after.db"));
      copyFileSync(dirs.eventsDb, path.join(ctx.outDir, "events.after.db"));
      artifacts["knowledge-db-after"] = "audit DB copy: knowledge.after.db";
      artifacts["events-db-after"] = "audit DB copy: events.after.db";
    } catch {
      // The textual sqlite3 artifacts above are the primary evidence.
    }

    const setupBlocked = [
      bootstrap,
      projectSchema,
      eventsSchema,
      knowledgeSchema,
      before,
      dryBefore,
      dryAfter,
      dryAdjusted,
      realRun,
      after,
      adjustedRowsRecord,
    ].some((record) => record.exitCode !== 0 || record.exitCode === null);
    const ok = checks.every((item) => item.ok);
    const status = setupBlocked ? "blocked" : ok ? "passed" : "failed";
    const failed = checks.filter((item) => !item.ok);
    finalize(ctx, {
      feature: FEATURE,
      status,
      summary: ok
        ? "Default v2 calibrate passed the non-self-certified audit: external SQLite seed/query, dry-run boundary, DB updates, compile outputs, and calibrator.adjusted event logging all matched."
        : `Calibrate audit exposed ${failed.length} failing check(s): ${failed.map((item) => item.name).join("; ")}.`,
      checks,
      artifacts,
    });
  } catch (error) {
    checks.push(check("runner completed without unexpected exception", false, error instanceof Error ? error.stack ?? error.message : String(error)));
    finalize(ctx, {
      feature: FEATURE,
      status: "blocked",
      summary: "feature-07 calibrate audit runner hit an unexpected exception before completing all checks.",
      checks,
      artifacts,
    });
  } finally {
    cleanupTemp(ctx);
  }
}

await main();
