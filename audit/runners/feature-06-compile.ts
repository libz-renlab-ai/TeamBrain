import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  check,
  cleanupTemp,
  createAuditContext,
  finalize,
  readText,
  runCommand,
  writeArtifact,
  type AuditContext,
} from "./lib.js";

const FEATURE = "feature-06-compile";
const NOW = "2026-04-28T00:00:00Z";

type Tier = "experimental" | "probation" | "stable" | "canonical" | "enforced" | "dormant";
type MaxTier = "experimental" | "probation" | "stable" | "canonical" | "enforced";
type Status = "active" | "conflict" | "stale" | "archived" | "dormant";
type Source = "preset" | "imported" | "accumulated" | "ingested" | "team-shared" | "internet";

const EXPECTED_MARKDOWN_PATTERNS = [
  "USE_PERSONAL_CANONICAL",
  "USE_GLOBAL_ENFORCED",
  "USE_PRESET_META",
  "TEXT_WITH_TEAMAGENT",
];

const FORBIDDEN_PATTERNS = [
  "old managed content",
  "USE_STABLE_SKILL_ONLY",
  "DO_NOT_SHOW_PROBATION",
  "DO_NOT_SHOW_ARCHIVED",
];

function cliCommand(ctx: AuditContext, args: string[]): string[] {
  return [
    path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"),
    path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"),
    ...args,
  ];
}

function makeEntry(opts: {
  id: string;
  correctPattern: string;
  scopeLevel?: "personal" | "global";
  tier?: Tier;
  maxTier?: MaxTier;
  status?: Status;
  source?: Source;
  reasoning?: string;
}): Record<string, unknown> {
  const tier = opts.tier ?? "canonical";
  const maxTier = opts.maxTier ?? (tier === "dormant" ? "canonical" : tier);
  return {
    id: opts.id,
    scope: { level: opts.scopeLevel ?? "personal" },
    category: "E",
    tags: ["audit", "feature-06"],
    type: "avoidance",
    nature: "objective",
    trigger: `compile audit trigger ${opts.id}`,
    wrong_pattern: `WRONG_${opts.id.toUpperCase().replace(/-/g, "_")}`,
    correct_pattern: opts.correctPattern,
    reasoning: opts.reasoning ?? `compile audit reasoning ${opts.id}`,
    confidence: 0.95,
    enforcement: "block",
    status: opts.status ?? "active",
    hit_count: 5,
    success_count: 5,
    override_count: 0,
    evidence: {
      success_sessions: 1,
      success_users: 1,
      correction_sessions: 1,
    },
    created_at: NOW,
    last_hit_at: NOW,
    last_validated_at: NOW,
    source: opts.source ?? "accumulated",
    conflict_with: [],
    current_tier: tier,
    max_tier_ever: maxTier,
    tier_entered_at: NOW,
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
    trigger_description: `Distinct trigger description for ${opts.id}`,
    pattern_description: `Distinct pattern description for ${opts.id}`,
    fire_threshold: 0.4,
    threshold_alpha: 1,
    threshold_beta: 1,
    embedder_model_id: "",
    hard_negatives: [],
    observation_window: [],
  };
}

function seedWorkspace(opts: {
  ctx: AuditContext;
  projectDir: string;
  homeDir: string;
  initialClaudeMd?: boolean;
}): { projectDbPath: string; globalDbPath: string } {
  const projectDbPath = path.join(opts.projectDir, ".teamagent", "knowledge.db");
  const globalDbPath = path.join(opts.homeDir, ".teamagent", "global.db");
  mkdirSync(path.dirname(projectDbPath), { recursive: true });
  mkdirSync(path.dirname(globalDbPath), { recursive: true });

  if (opts.initialClaudeMd) {
    writeFileSync(
      path.join(opts.projectDir, "CLAUDE.md"),
      [
        "# 用户维护区",
        "",
        "before sentinel",
        "",
        "<!-- TEAMAGENT:START - old block -->",
        "old managed content",
        "<!-- TEAMAGENT:END -->",
        "",
        "after sentinel",
        "",
      ].join("\n"),
      "utf-8",
    );
  }

  const projectEntries = [
    makeEntry({
      id: "personal-canonical",
      correctPattern: "USE_PERSONAL_CANONICAL",
      tier: "canonical",
    }),
    makeEntry({
      id: "stable-skill-only",
      correctPattern: "USE_STABLE_SKILL_ONLY",
      tier: "stable",
      maxTier: "stable",
    }),
    makeEntry({
      id: "probation-hidden",
      correctPattern: "DO_NOT_SHOW_PROBATION",
      tier: "probation",
      maxTier: "probation",
    }),
    makeEntry({
      id: "archived-hidden",
      correctPattern: "DO_NOT_SHOW_ARCHIVED",
      tier: "enforced",
      maxTier: "enforced",
      status: "archived",
    }),
    makeEntry({
      id: "preset-meta",
      correctPattern: "USE_PRESET_META",
      tier: "canonical",
      source: "preset",
    }),
    makeEntry({
      id: "marker-injection",
      correctPattern: "TEXT_WITH_TEAMAGENT:END_MARKER",
      tier: "enforced",
      maxTier: "enforced",
      reasoning: "must not create a second TEAMAGENT:END marker",
    }),
  ];
  const globalEntries = [
    makeEntry({
      id: "global-enforced",
      correctPattern: "USE_GLOBAL_ENFORCED",
      scopeLevel: "global",
      tier: "enforced",
      maxTier: "enforced",
      source: "team-shared",
    }),
  ];

  const seedScript = `
import { mkdirSync } from "node:fs";
import path from "node:path";
import { openDb, SqliteKnowledgeStore } from "@teamagent/adapters";

const projectDbPath = process.env.AUDIT_PROJECT_DB;
const globalDbPath = process.env.AUDIT_GLOBAL_DB;
if (!projectDbPath || !globalDbPath) throw new Error("missing AUDIT_PROJECT_DB/AUDIT_GLOBAL_DB");
mkdirSync(path.dirname(projectDbPath), { recursive: true });
mkdirSync(path.dirname(globalDbPath), { recursive: true });

function insertAll(dbPath, entries) {
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  try {
    for (const entry of entries) store.add(entry);
  } finally {
    store.close();
  }
}

insertAll(projectDbPath, ${JSON.stringify(projectEntries)});
insertAll(globalDbPath, ${JSON.stringify(globalEntries)});
`;
  runCommand(opts.ctx, `seed-${path.basename(opts.projectDir)}`, [
    "pnpm",
    "--dir",
    path.join(opts.ctx.repoRoot, "packages", "cli"),
    "exec",
    "tsx",
    "-e",
    seedScript,
  ], {
    env: {
      AUDIT_PROJECT_DB: projectDbPath,
      AUDIT_GLOBAL_DB: globalDbPath,
    },
    timeoutMs: 60_000,
  });

  return { projectDbPath, globalDbPath };
}

function parseLines(text: string): string[] {
  const trimmed = text.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\r?\n/).filter(Boolean);
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameList(a: string[], b: string[]): boolean {
  const aa = sorted(a);
  const bb = sorted(b);
  return aa.length === bb.length && aa.every((value, index) => value === bb[index]);
}

function listDiffDetail(expected: string[], actual: string[]): string {
  return `expected=${JSON.stringify(sorted(expected))} actual=${JSON.stringify(sorted(actual))}`;
}

function listSkillIds(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) return [];
  return sorted(
    readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => existsSync(path.join(skillsDir, name, "SKILL.md"))),
  );
}

function readAllSkillText(skillsDir: string): string {
  return listSkillIds(skillsDir)
    .map((id) => readFileSync(path.join(skillsDir, id, "SKILL.md"), "utf-8"))
    .join("\n");
}

function countLiteral(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function queryIds(ctx: AuditContext, name: string, dbPath: string, sql: string): string[] {
  const record = runCommand(ctx, name, ["sqlite3", dbPath, sql]);
  return parseLines(readText(record.stdoutPath));
}

function hasNoTmpFiles(root: string): boolean {
  if (!existsSync(root)) return true;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.name.includes(".tmp-")) return false;
      if (entry.isDirectory()) stack.push(full);
    }
  }
  return true;
}

async function main(): Promise<void> {
  const ctx = createAuditContext("feature-06", "compile");
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const artifacts: Record<string, string> = {};

  try {
    const skillsDir = path.join(ctx.tmpDir, "skills");
    mkdirSync(skillsDir, { recursive: true });
    const { projectDbPath, globalDbPath } = seedWorkspace({
      ctx,
      projectDir: ctx.projectDir,
      homeDir: ctx.homeDir,
      initialClaudeMd: true,
    });

    const projectRows = runCommand(ctx, "sqlite-project-seed", [
      "sqlite3",
      projectDbPath,
      "select id, scope_level, status, current_tier, source from knowledge order by id;",
    ]);
    const globalRows = runCommand(ctx, "sqlite-global-seed", [
      "sqlite3",
      globalDbPath,
      "select id, scope_level, status, current_tier, source from knowledge order by id;",
    ]);
    const projectSchema = runCommand(ctx, "sqlite-project-schema-version", [
      "sqlite3",
      projectDbPath,
      "select max(version) from schema_version;",
    ]);
    const globalSchema = runCommand(ctx, "sqlite-global-schema-version", [
      "sqlite3",
      globalDbPath,
      "select max(version) from schema_version;",
    ]);

    const projectSeedLines = parseLines(readText(projectRows.stdoutPath));
    const globalSeedLines = parseLines(readText(globalRows.stdoutPath));
    checks.push(check(
      "seeded project/global SQLite with production schema",
      projectSeedLines.length === 6 &&
        globalSeedLines.length === 1 &&
        readText(projectSchema.stdoutPath).trim() === "7" &&
        readText(globalSchema.stdoutPath).trim() === "7" &&
        projectSeedLines.some((line) => line.startsWith("probation-hidden|")) &&
        projectSeedLines.some((line) => line.startsWith("archived-hidden|")),
      `projectRows=${projectSeedLines.length} globalRows=${globalSeedLines.length}`,
    ));

    runCommand(ctx, "compile-default", cliCommand(ctx, ["compile"]), {
      cwd: ctx.projectDir,
      env: {
        HOME: ctx.homeDir,
        TEAMAGENT_SKILLS_DIR: skillsDir,
      },
      timeoutMs: 60_000,
    });
    runCommand(ctx, "grep-claude-markers-and-rules", [
      "grep",
      "-nE",
      "TEAMAGENT:START|TEAMAGENT:END|USE_|TEXT_WITH",
      path.join(ctx.projectDir, "CLAUDE.md"),
    ]);
    runCommand(ctx, "find-skills", ["find", skillsDir, "-type", "f", "-name", "SKILL.md", "-print"]);

    const claudeMd = readText(path.join(ctx.projectDir, "CLAUDE.md"));
    const skillText = readAllSkillText(skillsDir);
    artifacts["claude-after-default"] = writeArtifact(ctx, "CLAUDE.after-default.md", claudeMd);
    artifacts["skills-after-default"] = writeArtifact(ctx, "skills.after-default.txt", listSkillIds(skillsDir).join("\n") + "\n");

    checks.push(check(
      "CLAUDE.md preserves user content and replaces old managed block",
      claudeMd.includes("before sentinel") &&
        claudeMd.includes("after sentinel") &&
        !claudeMd.includes("old managed content"),
    ));
    checks.push(check(
      "CLAUDE.md contains one TEAMAGENT managed block",
      countLiteral(claudeMd, "TEAMAGENT:START") === 1 &&
        countLiteral(claudeMd, "TEAMAGENT:END") === 1,
      `start=${countLiteral(claudeMd, "TEAMAGENT:START")} end=${countLiteral(claudeMd, "TEAMAGENT:END")}`,
    ));
    checks.push(check(
      "Markdown includes canonical/enforced entries",
      EXPECTED_MARKDOWN_PATTERNS.every((pattern) => claudeMd.includes(pattern)),
    ));
    checks.push(check(
      "stable tier is skill-only",
      !claudeMd.includes("USE_STABLE_SKILL_ONLY") &&
        existsSync(path.join(skillsDir, "stable-skill-only", "SKILL.md")) &&
        skillText.includes("USE_STABLE_SKILL_ONLY"),
    ));
    checks.push(check(
      "probation and archived entries are absent from markdown and skills",
      !FORBIDDEN_PATTERNS.some((pattern) => claudeMd.includes(pattern)) &&
        !skillText.includes("DO_NOT_SHOW_PROBATION") &&
        !skillText.includes("DO_NOT_SHOW_ARCHIVED") &&
        !existsSync(path.join(skillsDir, "probation-hidden")) &&
        !existsSync(path.join(skillsDir, "archived-hidden")),
    ));
    checks.push(check(
      "TEAMAGENT marker text inside entries is sanitized",
      claudeMd.includes("TEXT_WITH_TEAMAGENT") &&
        !claudeMd.includes("TEXT_WITH_TEAMAGENT:END_MARKER") &&
        countLiteral(claudeMd, "TEAMAGENT:END") === 1,
    ));

    const expectedProjectSkillIds = queryIds(
      ctx,
      "sqlite-project-skill-expected",
      projectDbPath,
      "select id from knowledge where status='active' and current_tier in ('stable','canonical','enforced');",
    );
    const expectedGlobalSkillIds = queryIds(
      ctx,
      "sqlite-global-skill-expected",
      globalDbPath,
      "select id from knowledge where status='active' and current_tier in ('stable','canonical','enforced');",
    );
    const expectedSkillIds = sorted([...expectedProjectSkillIds, ...expectedGlobalSkillIds]);
    const actualSkillIds = listSkillIds(skillsDir);
    artifacts["skill-expected"] = writeArtifact(ctx, "skill-expected.txt", expectedSkillIds.join("\n") + "\n");
    artifacts["skill-actual"] = writeArtifact(ctx, "skill-actual.txt", actualSkillIds.join("\n") + "\n");
    checks.push(check(
      "Skills file set matches DB query",
      sameList(expectedSkillIds, actualSkillIds),
      listDiffDetail(expectedSkillIds, actualSkillIds),
    ));

    const expectedProjectMarkdownPatterns = queryIds(
      ctx,
      "sqlite-project-markdown-expected",
      projectDbPath,
      "select correct_pattern from knowledge where status='active' and current_tier in ('canonical','enforced') and id != 'marker-injection';",
    );
    const expectedGlobalMarkdownPatterns = queryIds(
      ctx,
      "sqlite-global-markdown-expected",
      globalDbPath,
      "select correct_pattern from knowledge where status='active' and current_tier in ('canonical','enforced') and id != 'marker-injection';",
    );
    const expectedMarkdownPatterns = [...expectedProjectMarkdownPatterns, ...expectedGlobalMarkdownPatterns];
    checks.push(check(
      "Markdown pattern set matches canonical/enforced DB query",
      expectedMarkdownPatterns.every((pattern) => claudeMd.includes(pattern)) &&
        !claudeMd.includes("USE_STABLE_SKILL_ONLY"),
      `expected=${JSON.stringify(sorted(expectedMarkdownPatterns))}`,
    ));
    checks.push(check(
      "No atomic temp files remain after default compile",
      hasNoTmpFiles(ctx.projectDir) && hasNoTmpFiles(skillsDir),
    ));

    const dryProjectDir = path.join(ctx.tmpDir, "dry-project");
    const dryHomeDir = path.join(ctx.tmpDir, "dry-home");
    const drySkillsDir = path.join(ctx.tmpDir, "dry-skills");
    mkdirSync(dryProjectDir, { recursive: true });
    mkdirSync(dryHomeDir, { recursive: true });
    mkdirSync(drySkillsDir, { recursive: true });
    seedWorkspace({ ctx, projectDir: dryProjectDir, homeDir: dryHomeDir });

    const dryRun = runCommand(ctx, "compile-dry-run", cliCommand(ctx, ["compile", "--dry-run"]), {
      cwd: dryProjectDir,
      env: {
        HOME: dryHomeDir,
        TEAMAGENT_SKILLS_DIR: drySkillsDir,
      },
      timeoutMs: 60_000,
    });
    runCommand(ctx, "find-dry-run-skills", ["find", drySkillsDir, "-type", "f", "-name", "SKILL.md", "-print"]);
    const dryStdout = readText(dryRun.stdoutPath);
    checks.push(check(
      "--dry-run does not write CLAUDE.md or skills",
      !existsSync(path.join(dryProjectDir, "CLAUDE.md")) && listSkillIds(drySkillsDir).length === 0,
    ));
    checks.push(check(
      "--dry-run reports would-write skills from DB",
      expectedSkillIds.every((id) => dryStdout.includes(id)),
      `stdout=${dryStdout.replace(/\s+/g, " ").trim()}`,
    ));

    const ok = checks.every((item) => item.ok);
    finalize(ctx, {
      feature: FEATURE,
      status: ok ? "passed" : "failed",
      summary: ok
        ? "真实 teamagent compile 在隔离 HOME/cwd/skills 下通过：Markdown 注入、tier/status 过滤、Skill 输出集合和 dry-run 边界均符合预期。"
        : "teamagent compile audit 发现不符合预期的产物或写入边界。",
      checks,
      artifacts,
    });
  } catch (err) {
    checks.push(check("runner completed", false, err instanceof Error ? err.stack ?? err.message : String(err)));
    finalize(ctx, {
      feature: FEATURE,
      status: "failed",
      summary: "feature-06 compile audit runner failed before completing all checks.",
      checks,
      artifacts,
    });
  } finally {
    cleanupTemp(ctx);
  }
}

await main();
