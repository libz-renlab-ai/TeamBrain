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
  type AuditDecision,
} from "./lib.js";

type Check = AuditDecision["checks"][number];

const expectedOrder = ["audit-p-new", "audit-g-mid", "audit-p-old"];

function nodeScriptCommand(scriptPath: string): string[] {
  return ["node", scriptPath];
}

function repoTsxCommand(ctx: ReturnType<typeof createAuditContext>, args: string[]): string[] {
  return [
    path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"),
    path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"),
    ...args,
  ];
}

function extractIds(stdout: string): string[] {
  return Array.from(stdout.matchAll(/^  id:\s+(.+)$/gm), (match) => match[1] ?? "");
}

function hasInOrder(stdout: string, needles: string[]): boolean {
  let cursor = -1;
  for (const needle of needles) {
    const next = stdout.indexOf(needle, cursor + 1);
    if (next === -1) return false;
    cursor = next;
  }
  return true;
}

function countLine(total: number, shown: number): string {
  return `\u5171 ${total} \u6761\uff0c\u5c55\u793a\u6700\u8fd1 ${shown}`;
}

function makeSeedScript(): string {
  return String.raw`
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.env.AUDIT_ROOT;
if (!root) throw new Error("AUDIT_ROOT is required");

const ddl = ` + "`" + String.raw`
CREATE TABLE knowledge (
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
);
` + "`" + String.raw`;

const insert = ` + "`" + String.raw`
INSERT INTO knowledge (
  id, scope_level, scope_project, category, tags, type, nature,
  trigger, wrong_pattern, correct_pattern, reasoning, confidence,
  current_tier, max_tier_ever, tier_entered_at, enforcement, status,
  hit_count, success_count, override_count, resurrect_count,
  evidence, source, conflict_with, created_at, last_hit_at,
  last_validated_at, channel
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
` + "`" + String.raw`;

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

console.log(JSON.stringify({
  projectDb: path.join(root, "project/.teamagent/knowledge.db"),
  globalDb: path.join(root, "home/.teamagent/global.db"),
}));
`;
}

function makeQueryScript(): string {
  return String.raw`
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.env.AUDIT_ROOT;
if (!root) throw new Error("AUDIT_ROOT is required");

const result = {};
for (const [name, file] of [
  ["project", path.join(root, "project/.teamagent/knowledge.db")],
  ["global", path.join(root, "home/.teamagent/global.db")],
]) {
  const db = new DatabaseSync(file);
  result[name] = db.prepare(
    "SELECT id, scope_level, category, tags, confidence, enforcement, " +
    "trigger, wrong_pattern, correct_pattern, reasoning, created_at " +
    "FROM knowledge ORDER BY created_at DESC"
  ).all();
  db.close();
}

console.log(JSON.stringify(result, null, 2));
`;
}

function queryCheck(stdout: string): Check {
  try {
    const parsed = JSON.parse(stdout) as {
      project?: Array<{ id: string; tags: string; created_at: string }>;
      global?: Array<{ id: string; tags: string; created_at: string }>;
    };
    const projectIds = parsed.project?.map((row) => row.id) ?? [];
    const globalIds = parsed.global?.map((row) => row.id) ?? [];
    const ok =
      projectIds.join(",") === "audit-p-new,audit-p-old" &&
      globalIds.join(",") === "audit-g-mid" &&
      parsed.project?.[0]?.tags === "[\"seed-project-new\"]" &&
      parsed.global?.[0]?.tags === "[\"seed-global\"]";
    return check(
      "external sqlite query confirms seed facts",
      ok,
      `project=${projectIds.join(",")}; global=${globalIds.join(",")}`,
    );
  } catch (error) {
    return check("external sqlite query confirms seed facts", false, String(error));
  }
}

function reviewLimitChecks(stdout: string): Check[] {
  const ids = extractIds(stdout);
  const fieldNeedles = [
    "  trigger:  project newest trigger",
    "  correct:  project newest correct",
    "  reason:   project newest reason",
    "  id:       audit-p-new",
    "  trigger:  global middle trigger",
    "  wrong:    global wrong",
    "  correct:  global middle correct",
    "  reason:   global middle reason",
    "  id:       audit-g-mid",
    "  trigger:  project older trigger",
    "  wrong:    old wrong",
    "  correct:  project older correct",
    "  reason:   project older reason",
    "  id:       audit-p-old",
  ];
  const pNewBlock = stdout.slice(
    stdout.indexOf("[2026-04-22]"),
    stdout.indexOf("[2026-04-21]"),
  );

  return [
    check(
      "review --limit=3 merges project and global rows",
      stdout.includes(countLine(3, 3)),
    ),
    check(
      "review stdout is sorted by created_at desc across both databases",
      ids.join(",") === expectedOrder.join(","),
      `ids=${ids.join(",")}`,
    ),
    check(
      "review renders scope/category/tag and confidence headers",
      hasInOrder(stdout, [
        "[2026-04-22] personal/K/seed-project-new  conf=0.88 block",
        "[2026-04-21] global/P/seed-global  conf=0.66 warn",
        "[2026-04-20] personal/E/seed-project  conf=0.71 warn",
      ]),
    ),
    check(
      "review renders trigger/wrong/correct/reason/id fields",
      fieldNeedles.every((needle) => stdout.includes(needle)),
    ),
    check(
      "review skips empty wrong_pattern",
      pNewBlock.length > 0 && !pNewBlock.includes("  wrong:"),
    ),
  ];
}

function scopeChecks(name: string, stdout: string, expectedIds: string[]): Check[] {
  const ids = extractIds(stdout);
  return [
    check(
      `${name} returns expected ids`,
      ids.join(",") === expectedIds.join(","),
      `ids=${ids.join(",")}`,
    ),
    check(
      `${name} count matches expected ids`,
      stdout.includes(countLine(expectedIds.length, expectedIds.length)),
    ),
  ];
}

async function main(): Promise<void> {
  const ctx = createAuditContext("feature-04", "review");
  const checks: Check[] = [];
  const artifacts: Record<string, string> = {};

  try {
    const seedScript = writeArtifact(ctx, "seed-review.mjs", makeSeedScript());
    const queryScript = writeArtifact(ctx, "query-review-seed.mjs", makeQueryScript());
    artifacts.seedScript = rel(ctx, seedScript);
    artifacts.queryScript = rel(ctx, queryScript);

    const seed = runCommand(ctx, "seed-node-sqlite", nodeScriptCommand(seedScript), {
      env: { AUDIT_ROOT: ctx.tmpDir },
      allowFailure: true,
    });
    checks.push(check("external node:sqlite seed exits zero", seed.exitCode === 0));

    const query = runCommand(ctx, "query-node-sqlite", nodeScriptCommand(queryScript), {
      env: { AUDIT_ROOT: ctx.tmpDir },
      allowFailure: true,
    });
    checks.push(check("external node:sqlite query exits zero", query.exitCode === 0));
    checks.push(queryCheck(readText(query.stdoutPath)));

    const cliEnv = { HOME: ctx.homeDir };
    const reviewLimit = runCommand(ctx, "review-limit-3", repoTsxCommand(ctx, ["review", "--limit=3"]), {
      cwd: ctx.projectDir,
      env: cliEnv,
      allowFailure: true,
    });
    checks.push(check("review --limit=3 exits zero", reviewLimit.exitCode === 0));
    checks.push(...reviewLimitChecks(readText(reviewLimit.stdoutPath)));

    const reviewTeam = runCommand(ctx, "review-scope-team", repoTsxCommand(ctx, ["review", "--scope=team"]), {
      cwd: ctx.projectDir,
      env: cliEnv,
      allowFailure: true,
    });
    checks.push(check("review --scope=team exits zero", reviewTeam.exitCode === 0));
    checks.push(...scopeChecks("review --scope=team", readText(reviewTeam.stdoutPath), ["audit-p-new", "audit-p-old"]));

    const reviewPersonal = runCommand(ctx, "review-scope-personal", repoTsxCommand(ctx, ["review", "--scope=personal"]), {
      cwd: ctx.projectDir,
      env: cliEnv,
      allowFailure: true,
    });
    checks.push(check("review --scope=personal exits zero", reviewPersonal.exitCode === 0));
    checks.push(...scopeChecks("review --scope=personal", readText(reviewPersonal.stdoutPath), ["audit-p-new", "audit-p-old"]));

    const reviewGlobal = runCommand(ctx, "review-scope-global", repoTsxCommand(ctx, ["review", "--scope=global"]), {
      cwd: ctx.projectDir,
      env: cliEnv,
      allowFailure: true,
    });
    checks.push(check("review --scope=global exits zero", reviewGlobal.exitCode === 0));
    checks.push(...scopeChecks("review --scope=global", readText(reviewGlobal.stdoutPath), ["audit-g-mid"]));

    const seedBlocked = seed.exitCode !== 0 || query.exitCode !== 0;
    const status = checks.every((item) => item.ok) ? "passed" : seedBlocked ? "blocked" : "failed";
    finalize(ctx, {
      feature: "feature-04-review",
      status,
      summary:
        status === "passed"
          ? "review reads externally seeded project/global SQLite databases, merges them, sorts by created_at desc, and renders the required fields."
          : "review audit did not satisfy one or more non-self-certified checks.",
      checks,
      artifacts,
    });
  } catch (error) {
    checks.push(check("runner completed without unexpected exception", false, String(error)));
    finalize(ctx, {
      feature: "feature-04-review",
      status: "blocked",
      summary: "Runner hit an unexpected exception before completing the audit.",
      checks,
      artifacts,
    });
  } finally {
    cleanupTemp(ctx);
  }
}

void main();
