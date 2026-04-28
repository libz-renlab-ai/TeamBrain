import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  check,
  cleanupTemp,
  createAuditContext,
  finalize,
  readText,
  runCommand,
  writeArtifact,
  writeJson,
  type AuditContext,
} from "./lib.js";

const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = require("node:sqlite") as typeof import("node:sqlite");

type AuditCheck = ReturnType<typeof check>;
type SqlParam = string | number | bigint | null | Uint8Array;

interface CaseDirs {
  root: string;
  home: string;
  cwd: string;
  skills: string;
}

interface KnowledgeAuditRow {
  id: string;
  scope_level: string;
  category: string;
  tags: string;
  type: string;
  nature: string;
  trigger: string;
  wrong_pattern: string;
  correct_pattern: string;
  reasoning: string;
  confidence: number;
  enforcement: string;
  status: string;
  source: string;
  current_tier: string;
}

const FEATURE = "feature-05-pitfall";
const SUCCESS_TIMEOUT_MS = 180_000;
const FAST_TIMEOUT_MS = 30_000;

const mainTrigger = "Audit F05 personal pitfall: npm install moment in a new dependency task";
const mainWrong = "moment";
const mainCorrect = "dayjs";
const mainReason = "Moment is deprecated for this project audit; prefer dayjs.";

function makeCase(ctx: AuditContext, name: string): CaseDirs {
  const root = path.join(ctx.tmpDir, name);
  const home = path.join(root, "home");
  const cwd = path.join(root, "project");
  const skills = path.join(root, "skills");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  mkdirSync(skills, { recursive: true });
  writeFileSync(
    path.join(cwd, "CLAUDE.md"),
    "# Audit Project\n\nmanual sentinel before\n",
    "utf-8",
  );
  return { root, home, cwd, skills };
}

function writeTransformersShim(ctx: AuditContext): string {
  const shimPath = path.join(ctx.tmpDir, "disable-remote-transformers.mjs");
  const packageJsonUrl = pathToFileURL(path.join(ctx.repoRoot, "package.json")).href;
  writeFileSync(
    shimPath,
    [
      'import { createRequire } from "node:module";',
      'import { pathToFileURL } from "node:url";',
      `const require = createRequire(${JSON.stringify(packageJsonUrl)});`,
      "try {",
      '  const mod = await import(pathToFileURL(require.resolve("@xenova/transformers")).href);',
      "  mod.env.allowRemoteModels = false;",
      "  if (process.env.TEAMAGENT_AUDIT_TRANSFORMERS_CACHE) {",
      "    mod.env.cacheDir = process.env.TEAMAGENT_AUDIT_TRANSFORMERS_CACHE;",
      "  }",
      "} catch {",
      "  // The pitfall command treats embedding as best-effort; the audit shim should too.",
      "}",
      "",
    ].join("\n"),
    "utf-8",
  );
  return shimPath;
}

function cliCommand(ctx: AuditContext, args: string[]): string[] {
  return [
    path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"),
    path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"),
    ...args,
  ];
}

function envFor(ctx: AuditContext, dirs: CaseDirs, visibility: "silent" | "smart" | "verbose", shimPath: string): NodeJS.ProcessEnv {
  const importOpt = `--import=${pathToFileURL(shimPath).href}`;
  return {
    HOME: dirs.home,
    TEAMAGENT_SKILLS_DIR: dirs.skills,
    TEAMAGENT_VISIBILITY: visibility,
    TEAMAGENT_LLM_TIMEOUT_MS: "1000",
    TEAMAGENT_AUDIT_TRANSFORMERS_CACHE: path.join(dirs.root, "transformers-cache"),
    XDG_CACHE_HOME: path.join(dirs.root, "xdg-cache"),
    NODE_OPTIONS: [process.env.NODE_OPTIONS, importOpt].filter(Boolean).join(" "),
  };
}

function pitfallArgs(input: {
  trigger: string;
  wrong?: string;
  correct: string;
  reason: string;
  level?: "personal" | "team" | "global";
  category?: "C" | "E" | "S" | "K";
  tags?: string;
  nature?: "objective" | "subjective";
}): string[] {
  return [
    "pitfall",
    "--non-interactive",
    `--trigger=${input.trigger}`,
    `--wrong=${input.wrong ?? ""}`,
    `--correct=${input.correct}`,
    `--reason=${input.reason}`,
    `--category=${input.category ?? "E"}`,
    `--tags=${input.tags ?? "audit-f05,dependency-choice"}`,
    `--level=${input.level ?? "personal"}`,
    `--nature=${input.nature ?? "objective"}`,
  ];
}

function queryOne<T extends object>(dbPath: string, sql: string, params: SqlParam[] = []): T | undefined {
  if (!existsSync(dbPath)) return undefined;
  const db = new DatabaseSyncCtor(dbPath, { readOnly: true });
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } finally {
    db.close();
  }
}

function queryAll<T extends object>(dbPath: string, sql: string, params: SqlParam[] = []): T[] {
  if (!existsSync(dbPath)) return [];
  const db = new DatabaseSyncCtor(dbPath, { readOnly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

function knowledgeCount(dbPath: string): number {
  const row = queryOne<{ count: number }>(dbPath, "select count(*) as count from knowledge");
  return row?.count ?? 0;
}

function schemaVersion(dbPath: string): number | undefined {
  return queryOne<{ version: number }>(
    dbPath,
    "select max(version) as version from schema_version",
  )?.version;
}

function rowForTrigger(dbPath: string, trigger: string): KnowledgeAuditRow | undefined {
  return queryOne<KnowledgeAuditRow>(
    dbPath,
    [
      "select id, scope_level, category, tags, type, nature, trigger, wrong_pattern,",
      "correct_pattern, reasoning, confidence, enforcement, status, source, current_tier",
      "from knowledge where trigger = ?",
    ].join(" "),
    [trigger],
  );
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function collectFiles(root: string, predicate: (file: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function validateSkills(ctx: AuditContext, dirs: CaseDirs, ruleId: string | undefined): AuditCheck {
  if (!ruleId) {
    return check("skills warning", true, "WARNING: skipped because no rule id was found in SQLite");
  }

  const expected = path.join(dirs.skills, ruleId, "SKILL.md");
  const skillFiles = collectFiles(dirs.skills, (file) => path.basename(file) === "SKILL.md").sort();
  writeArtifact(ctx, "skills-files.txt", skillFiles.join("\n") + (skillFiles.length ? "\n" : ""));

  if (!existsSync(expected)) {
    return check(
      "skills warning",
      true,
      `WARNING: expected ${expected}, found ${skillFiles.length} SKILL.md file(s) under temp skills dir`,
    );
  }

  const skillMd = readText(expected);
  writeArtifact(ctx, "main-skill.md", skillMd);
  const expectedSnippets = [
    `name: ${ruleId}`,
    `Rule ID: ${ruleId}`,
    mainTrigger,
    mainCorrect,
    mainWrong,
    "Tier: canonical",
    "Confidence: 0.70",
    "Source: accumulated",
  ];
  const missing = expectedSnippets.filter((snippet) => !skillMd.includes(snippet));
  if (missing.length > 0) {
    return check("skills warning", true, `WARNING: SKILL.md missing snippets: ${missing.join(", ")}`);
  }
  return check("skills output", true, `wrote ${expected}`);
}

function runAudit(ctx: AuditContext): { checks: AuditCheck[]; artifacts: Record<string, string> } {
  const checks: AuditCheck[] = [];
  const artifacts: Record<string, string> = {};
  const shimPath = writeTransformersShim(ctx);

  const bad = makeCase(ctx, "bad-input");
  const badCommand = runCommand(
    ctx,
    "bad-missing-trigger",
    cliCommand(ctx, pitfallArgs({ trigger: "", correct: "x", reason: "r" })),
    {
      cwd: bad.cwd,
      env: envFor(ctx, bad, "silent", shimPath),
      allowFailure: true,
      timeoutMs: FAST_TIMEOUT_MS,
    },
  );
  const badStderr = readText(badCommand.stderrPath);
  checks.push(check(
    "missing required args exit 2",
    badCommand.exitCode === 2,
    `exit=${badCommand.exitCode}, stderr=${JSON.stringify(badStderr.slice(0, 200))}`,
  ));
  checks.push(check(
    "missing required args do not add knowledge",
    knowledgeCount(path.join(bad.cwd, ".teamagent", "knowledge.db")) === 0 &&
      knowledgeCount(path.join(bad.home, ".teamagent", "global.db")) === 0,
    `project=${knowledgeCount(path.join(bad.cwd, ".teamagent", "knowledge.db"))}, global=${knowledgeCount(path.join(bad.home, ".teamagent", "global.db"))}`,
  ));
  checks.push(check(
    "missing required args mention trigger",
    badStderr.includes("pitfall --non-interactive") && badStderr.includes("--trigger"),
    badStderr.trim().slice(0, 240),
  ));

  const main = makeCase(ctx, "personal-silent");
  const mainCommand = runCommand(
    ctx,
    "pitfall-personal-silent",
    cliCommand(ctx, pitfallArgs({
      trigger: mainTrigger,
      wrong: mainWrong,
      correct: mainCorrect,
      reason: mainReason,
      level: "personal",
    })),
    {
      cwd: main.cwd,
      env: envFor(ctx, main, "silent", shimPath),
      allowFailure: true,
      timeoutMs: SUCCESS_TIMEOUT_MS,
    },
  );
  checks.push(check("personal pitfall command exits 0", mainCommand.exitCode === 0, `exit=${mainCommand.exitCode}`));

  const projectDb = path.join(main.cwd, ".teamagent", "knowledge.db");
  const globalDb = path.join(main.home, ".teamagent", "global.db");
  const row = rowForTrigger(projectDb, mainTrigger);
  artifacts["main-row"] = writeJson(ctx, "main-row.json", row ?? null);
  const dbRows = queryAll<KnowledgeAuditRow>(
    projectDb,
    "select id, scope_level, category, tags, type, nature, trigger, wrong_pattern, correct_pattern, reasoning, confidence, enforcement, status, source, current_tier from knowledge order by id",
  );
  artifacts["main-db-rows"] = writeJson(ctx, "main-db-rows.json", dbRows);

  checks.push(check(
    "node:sqlite finds new knowledge trigger/wrong/correct/source/scope",
    row?.trigger === mainTrigger &&
      row.wrong_pattern === mainWrong &&
      row.correct_pattern === mainCorrect &&
      row.reasoning === mainReason &&
      row.source === "accumulated" &&
      row.scope_level === "personal",
    row ? JSON.stringify({
      id: row.id,
      scope: row.scope_level,
      source: row.source,
      trigger: row.trigger,
      wrong: row.wrong_pattern,
      correct: row.correct_pattern,
    }) : "row not found",
  ));
  checks.push(check(
    "personal row has expected tier/status/defaults",
    row?.category === "E" &&
      row.type === "avoidance" &&
      row.nature === "objective" &&
      row.confidence === 0.7 &&
      row.enforcement === "warn" &&
      row.status === "active" &&
      row.current_tier === "canonical",
    row ? JSON.stringify({
      category: row.category,
      type: row.type,
      nature: row.nature,
      confidence: row.confidence,
      enforcement: row.enforcement,
      status: row.status,
      tier: row.current_tier,
    }) : "row not found",
  ));
  checks.push(check(
    "project schema version is current",
    schemaVersion(projectDb) === 7,
    `version=${schemaVersion(projectDb) ?? "missing"}`,
  ));
  checks.push(check(
    "personal scope does not add global knowledge",
    knowledgeCount(globalDb) === 0,
    `global knowledge count=${knowledgeCount(globalDb)}`,
  ));

  const grepCommand = runCommand(
    ctx,
    "grep-claude-teamagent-block",
    [
      "grep",
      "-nE",
      "manual sentinel before|TEAMAGENT:START|TEAMAGENT:END|TeamAgent|dayjs|moment|Moment is deprecated",
      path.join(main.cwd, "CLAUDE.md"),
    ],
    { cwd: main.cwd, allowFailure: true, timeoutMs: FAST_TIMEOUT_MS },
  );
  artifacts["claude-grep"] = grepCommand.stdoutPath;
  const claudeMd = readText(path.join(main.cwd, "CLAUDE.md"));
  artifacts["claude-md"] = writeArtifact(ctx, "main-CLAUDE.md", claudeMd);
  checks.push(check(
    "grep CLAUDE.md TEAMAGENT block",
    grepCommand.exitCode === 0 &&
      claudeMd.includes("manual sentinel before") &&
      countOccurrences(claudeMd, "TEAMAGENT:START") === 1 &&
      countOccurrences(claudeMd, "TEAMAGENT:END") === 1 &&
      claudeMd.includes(`使用 ${mainCorrect} 而非 ${mainWrong}`) &&
      claudeMd.includes(mainReason),
    `grep exit=${grepCommand.exitCode}, starts=${countOccurrences(claudeMd, "TEAMAGENT:START")}, ends=${countOccurrences(claudeMd, "TEAMAGENT:END")}`,
  ));

  checks.push(validateSkills(ctx, main, row?.id));

  const silentStdout = readText(mainCommand.stdoutPath);
  checks.push(check(
    "visibility silent stdout empty or very small",
    silentStdout.trim().length <= 20,
    `trimmed stdout length=${silentStdout.trim().length}`,
  ));

  const verbose = makeCase(ctx, "verbose");
  const verboseCommand = runCommand(
    ctx,
    "pitfall-verbose",
    cliCommand(ctx, pitfallArgs({
      trigger: "Audit F05 verbose visibility: date formatting helper choice",
      wrong: "manual date string concatenation",
      correct: "Intl.DateTimeFormat",
      reason: "Verbose audit needs raw attribution details from the real pitfall CLI.",
      level: "personal",
      tags: "audit-f05,visibility",
    })),
    {
      cwd: verbose.cwd,
      env: envFor(ctx, verbose, "verbose", shimPath),
      allowFailure: true,
      timeoutMs: SUCCESS_TIMEOUT_MS,
    },
  );
  const verboseStdout = readText(verboseCommand.stdoutPath);
  artifacts["verbose-stdout"] = verboseCommand.stdoutPath;
  checks.push(check("verbose pitfall command exits 0", verboseCommand.exitCode === 0, `exit=${verboseCommand.exitCode}`));
  checks.push(check(
    "visibility verbose includes counterfactual and raw JSON",
    verboseStdout.includes("counterfactual") &&
      verboseStdout.includes("--- raw events ---") &&
      verboseStdout.includes('"source": "pitfall"'),
    `containsCounterfactual=${verboseStdout.includes("counterfactual")}, containsRaw=${verboseStdout.includes("--- raw events ---")}, length=${verboseStdout.length}`,
  ));

  const global = makeCase(ctx, "global-silent");
  const globalTrigger = "Audit F05 global scope routing";
  const globalCommand = runCommand(
    ctx,
    "pitfall-global-silent",
    cliCommand(ctx, pitfallArgs({
      trigger: globalTrigger,
      wrong: "project-only write",
      correct: "global write",
      reason: "Global scope should route to the user global database.",
      level: "global",
      tags: "audit-f05,scope",
    })),
    {
      cwd: global.cwd,
      env: envFor(ctx, global, "silent", shimPath),
      allowFailure: true,
      timeoutMs: SUCCESS_TIMEOUT_MS,
    },
  );
  const globalProjectDb = path.join(global.cwd, ".teamagent", "knowledge.db");
  const globalUserDb = path.join(global.home, ".teamagent", "global.db");
  const globalRow = rowForTrigger(globalUserDb, globalTrigger);
  artifacts["global-row"] = writeJson(ctx, "global-row.json", globalRow ?? null);
  checks.push(check("global pitfall command exits 0", globalCommand.exitCode === 0, `exit=${globalCommand.exitCode}`));
  checks.push(check(
    "global scope routes to global DB",
    knowledgeCount(globalProjectDb) === 0 && globalRow?.scope_level === "global",
    `project count=${knowledgeCount(globalProjectDb)}, global scope=${globalRow?.scope_level ?? "missing"}`,
  ));

  return { checks, artifacts };
}

const ctx = createAuditContext("05", "pitfall");
try {
  const { checks, artifacts } = runAudit(ctx);
  const hardChecks = checks.filter((c) => c.name !== "skills warning");
  const passed = hardChecks.every((c) => c.ok);
  finalize(ctx, {
    feature: FEATURE,
    status: passed ? "passed" : "failed",
    summary: passed
      ? "pitfall --non-interactive propagated a real entry through CLI, SQLite, CLAUDE.md, scoped storage, and visibility controls."
      : "pitfall audit found at least one hard failure; inspect command artifacts and decision checks.",
    checks,
    artifacts,
  });
} catch (err) {
  finalize(ctx, {
    feature: FEATURE,
    status: "failed",
    summary: `Audit runner crashed before completing: ${err instanceof Error ? err.message : String(err)}`,
    checks: [check("runner completed", false, err instanceof Error ? err.stack : String(err))],
  });
} finally {
  cleanupTemp(ctx);
}
