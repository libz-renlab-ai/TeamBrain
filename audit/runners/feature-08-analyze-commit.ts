import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const FEATURE = "feature-08-analyze-commit";

type Check = AuditDecision["checks"][number];

interface Manifest {
  fixtures: Array<{
    file: string;
    expected_corrections?: Array<{
      turn_index?: number;
      signal?: string;
      min_weight?: number;
      keyword_hint?: string;
    }>;
    expected_successes?: unknown[];
  }>;
}

interface DbSummary {
  exists: boolean;
  count: number;
  rows: Array<Record<string, unknown>>;
  error?: string;
}

interface DbSnapshot {
  project: DbSummary;
  global: DbSummary;
  events: DbSummary;
}

function cliCommand(ctx: AuditContext, args: string[]): string[] {
  return [
    path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"),
    path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"),
    ...args,
  ];
}

function parseJson<T>(file: string): T {
  return JSON.parse(readText(file)) as T;
}

function makeFakeClaudeScript(): string {
  return `#!/usr/bin/env node
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const extraction = {
    category: "E",
    tags: ["http-client", "audit"],
    type: "avoidance",
    nature: "objective",
    trigger: "需要获取用户数据或发 HTTP 请求",
    wrong_pattern: "axios",
    correct_pattern: "fetch",
    reasoning: "项目明确要求使用 fetch，不使用 axios"
  };
  const result = [
    "\`\`\`json",
    JSON.stringify(extraction),
    "\`\`\`"
  ].join("\\n");
  process.stdout.write(JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result
  }));
});
`;
}

function makeSqliteSnapshotScript(): string {
  return String.raw`
const { existsSync } = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const [projectDb, globalDb, eventsDb] = process.argv.slice(2);

function inspect(file, table, sql) {
  if (!existsSync(file)) return { exists: false, count: 0, rows: [] };
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const count = db.prepare("select count(*) as n from " + table).get().n;
    const rows = db.prepare(sql).all();
    return { exists: true, count, rows };
  } catch (error) {
    return { exists: true, count: -1, rows: [], error: String(error) };
  } finally {
    if (db) db.close();
  }
}

const projectSql = [
  "select id, scope_level, category, tags, type, nature, trigger,",
  "wrong_pattern, correct_pattern, confidence, current_tier, max_tier_ever,",
  "enforcement, status, source, channel, scope_paths, scope_file_types, evidence",
  "from knowledge order by created_at, id"
].join(" ");

console.log(JSON.stringify({
  project: inspect(projectDb, "knowledge", projectSql),
  global: inspect(globalDb, "knowledge", "select id, scope_level, source, trigger, correct_pattern from knowledge order by id"),
  events: inspect(eventsDb, "events", "select id, kind, knowledge_id, timestamp from events order by timestamp, id")
}, null, 2));
`;
}

function parseSnapshot(ctx: AuditContext, recordName: string): DbSnapshot {
  return parseJson<DbSnapshot>(path.join(ctx.outDir, `${recordName}.stdout.txt`));
}

function includesAll(haystack: string, needles: string[]): boolean {
  return needles.every((needle) => haystack.includes(needle));
}

function manifestChecks(ctx: AuditContext, checks: Check[]): { manifestPath: string; sessionPath: string } {
  const manifestPath = path.join(ctx.repoRoot, "fixtures", "sessions", "_manifest.json");
  const sessionPath = path.join(ctx.repoRoot, "fixtures", "sessions", "correction-denial-01.jsonl");
  const manifest = parseJson<Manifest>(manifestPath);
  const fixture = manifest.fixtures.find((item) => item.file === "correction-denial-01.jsonl");
  const expected = fixture?.expected_corrections?.[0];
  const sessionText = readFileSync(sessionPath, "utf-8");

  checks.push(
    check("manifest fixture correction-denial-01.jsonl exists", fixture !== undefined),
    check(
      "manifest expects explicit_denial turn 1",
      expected?.turn_index === 1 &&
        expected.signal === "explicit_denial" &&
        (expected.min_weight ?? 0) >= 0.9 &&
        expected.keyword_hint === "不对" &&
        (fixture?.expected_successes?.length ?? -1) === 0,
      JSON.stringify(expected),
    ),
    check(
      "session JSONL contains denial fixture facts",
      sessionText.includes("fix-denial-01") &&
        sessionText.includes("不对，我们项目用 fetch 不用 axios") &&
        sessionText.includes("axios.get") &&
        sessionText.includes("await fetch"),
    ),
  );

  return { manifestPath, sessionPath };
}

async function main(): Promise<void> {
  const ctx = createAuditContext("feature-08", "analyze-commit");
  const checks: Check[] = [];
  const artifacts: Record<string, string> = {};

  try {
    const { manifestPath, sessionPath } = manifestChecks(ctx, checks);
    artifacts.manifest = rel(ctx, manifestPath);
    artifacts.session = rel(ctx, sessionPath);

    const fakeBin = path.join(ctx.tmpDir, "bin");
    const skillsDir = path.join(ctx.tmpDir, "skills");
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(skillsDir, { recursive: true });

    const fakeClaude = path.join(fakeBin, "claude");
    writeFileSync(fakeClaude, makeFakeClaudeScript(), "utf-8");
    chmodSync(fakeClaude, 0o755);
    artifacts.fakeClaude = rel(ctx, writeArtifact(ctx, "fake-claude.js", makeFakeClaudeScript()));

    const claudeMdPath = path.join(ctx.projectDir, "CLAUDE.md");
    const initialClaude = ["# Audit Project", "", "manual-before", "", "manual-after", ""].join("\n");
    writeFileSync(claudeMdPath, initialClaude, "utf-8");
    const beforeClaudePath = writeArtifact(ctx, "CLAUDE.before.md", initialClaude);
    artifacts.claudeBefore = rel(ctx, beforeClaudePath);

    const env = {
      HOME: ctx.homeDir,
      TEAMAGENT_SKILLS_DIR: skillsDir,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    };
    const projectDbPath = path.join(ctx.projectDir, ".teamagent", "knowledge.db");
    const globalDbPath = path.join(ctx.homeDir, ".teamagent", "global.db");
    const eventsDbPath = path.join(ctx.homeDir, ".teamagent", "events.db");

    const dry = runCommand(
      ctx,
      "analyze-dry-verbose",
      cliCommand(ctx, ["analyze", "--session", sessionPath, "--verbose"]),
      { cwd: ctx.projectDir, env, allowFailure: true, timeoutMs: 120_000 },
    );
    const dryStdout = readText(dry.stdoutPath);
    checks.push(
      check("analyze dry-run exits zero", dry.exitCode === 0),
      check(
        "dry-run stdout reports explicit denial fixture",
        includesAll(dryStdout, [
          "TeamAgent Session Analyze (dry-run，不写知识库)",
          "会话 id: fix-denial-01",
          "回合数: 2",
          "识别到纠正时刻: 1",
          "explicit_denial",
          "识别到成功信号: 0",
          "不对，我们项目用 fetch 不用 axios",
        ]),
      ),
    );

    const dryGrep = runCommand(
      ctx,
      "grep-dry-explicit-denial",
      [
        "grep",
        "-nE",
        "dry-run|会话 id: fix-denial-01|回合数: 2|纠正时刻: 1|explicit_denial|成功信号: 0",
        dry.stdoutPath,
      ],
      { allowFailure: true },
    );
    checks.push(check("external grep confirms dry-run signal output", dryGrep.exitCode === 0));

    const dryDiff = runCommand(
      ctx,
      "diff-dry-claude",
      ["diff", "-u", beforeClaudePath, claudeMdPath],
      { allowFailure: true },
    );
    checks.push(
      check("dry-run leaves CLAUDE.md unchanged", dryDiff.exitCode === 0),
      check("dry-run does not create project DB", !existsSync(projectDbPath), projectDbPath),
      check("dry-run does not create global DB", !existsSync(globalDbPath), globalDbPath),
      check("dry-run does not create events DB", !existsSync(eventsDbPath), eventsDbPath),
    );

    const drySkills = runCommand(
      ctx,
      "find-dry-skills",
      ["find", skillsDir, "-maxdepth", "2", "-type", "f", "-print"],
      { allowFailure: true },
    );
    checks.push(
      check(
        "dry-run leaves skills directory empty",
        drySkills.exitCode === 0 && readText(drySkills.stdoutPath).trim() === "",
      ),
    );

    const sqliteScript = writeArtifact(ctx, "sqlite-snapshot.cjs", makeSqliteSnapshotScript());
    artifacts.sqliteSnapshotScript = rel(ctx, sqliteScript);
    const beforeQuery = runCommand(
      ctx,
      "sqlite-before-commit",
      ["node", sqliteScript, projectDbPath, globalDbPath, eventsDbPath],
      { allowFailure: true },
    );
    checks.push(check("external sqlite before-query exits zero", beforeQuery.exitCode === 0));
    let beforeSnapshot: DbSnapshot | undefined;
    if (beforeQuery.exitCode === 0) {
      beforeSnapshot = parseSnapshot(ctx, "sqlite-before-commit");
      artifacts.sqliteBefore = rel(ctx, beforeQuery.stdoutPath);
      checks.push(
        check(
          "before commit has no DB rows",
          !beforeSnapshot.project.exists &&
            !beforeSnapshot.global.exists &&
            !beforeSnapshot.events.exists,
          JSON.stringify(beforeSnapshot),
        ),
      );
    }

    const precommitClaudePath = writeArtifact(ctx, "CLAUDE.precommit.md", readText(claudeMdPath));
    const commit = runCommand(
      ctx,
      "analyze-commit-verbose",
      cliCommand(ctx, ["analyze", "--session", sessionPath, "--verbose", "--commit"]),
      { cwd: ctx.projectDir, env, allowFailure: true, timeoutMs: 180_000 },
    );
    const commitStdout = readText(commit.stdoutPath);
    const llmBlocked =
      commit.exitCode !== 0 &&
      /未找到 'claude'|not-installed|Claude CLI|LLM|extractor/i.test(
        commitStdout + readText(commit.stderrPath),
      );
    checks.push(
      check("analyze --commit exits zero", commit.exitCode === 0, `exit=${commit.exitCode}`),
      check(
        "commit stdout reports same dry-run signals and commit summary",
        includesAll(commitStdout, [
          "TeamAgent Session Analyze (--commit 模式)",
          "识别到纠正时刻: 1",
          "explicit_denial",
          "识别到成功信号: 0",
          "--commit 完成",
          "识别纠正: 1",
          "成功提取: 1",
          "知识库: 0 → 1",
          "fetch",
        ]),
      ),
    );

    const afterQuery = runCommand(
      ctx,
      "sqlite-after-commit",
      ["node", sqliteScript, projectDbPath, globalDbPath, eventsDbPath],
      { allowFailure: true },
    );
    checks.push(check("external sqlite after-query exits zero", afterQuery.exitCode === 0));

    let afterSnapshot: DbSnapshot | undefined;
    if (afterQuery.exitCode === 0) {
      afterSnapshot = parseSnapshot(ctx, "sqlite-after-commit");
      artifacts.sqliteAfter = rel(ctx, afterQuery.stdoutPath);
      const row = afterSnapshot.project.rows[0];
      checks.push(
        check(
          "commit writes exactly one project SQLite knowledge row",
          afterSnapshot.project.exists &&
            afterSnapshot.project.count === 1 &&
            afterSnapshot.project.rows.length === 1,
          JSON.stringify(afterSnapshot.project),
        ),
        check(
          "project row contains fake extractor fields and detector confidence",
          row?.scope_level === "personal" &&
            row.category === "E" &&
            row.type === "avoidance" &&
            row.nature === "objective" &&
            String(row.tags).includes("http-client") &&
            row.trigger === "需要获取用户数据或发 HTTP 请求" &&
            row.wrong_pattern === "axios" &&
            row.correct_pattern === "fetch" &&
            Number(row.confidence) >= 0.9 &&
            row.current_tier === "canonical" &&
            row.max_tier_ever === "canonical" &&
            row.source === "accumulated" &&
            row.channel === "tool-action" &&
            String(row.scope_paths).includes("**/*") &&
            String(row.evidence).includes("correction_sessions"),
          JSON.stringify(row),
        ),
        check(
          "commit does not write knowledge to global DB",
          afterSnapshot.global.exists && afterSnapshot.global.count === 0,
          JSON.stringify(afterSnapshot.global),
        ),
        check(
          "commit creates queryable events DB without requiring events",
          afterSnapshot.events.exists && afterSnapshot.events.count >= 0,
          JSON.stringify(afterSnapshot.events),
        ),
      );
    }

    const claudeDiff = runCommand(
      ctx,
      "diff-claude-precommit-after",
      ["diff", "-u", precommitClaudePath, claudeMdPath],
      { allowFailure: true },
    );
    artifacts.claudeDiff = rel(ctx, claudeDiff.stdoutPath);
    artifacts.claudeAfter = rel(ctx, writeArtifact(ctx, "CLAUDE.after.md", readText(claudeMdPath)));
    checks.push(
      check("commit changes CLAUDE.md", claudeDiff.exitCode === 1),
      check(
        "CLAUDE.md preserves manual content and includes TeamAgent rule",
        includesAll(readText(claudeMdPath), [
          "manual-before",
          "manual-after",
          "TEAMAGENT:START",
          "TEAMAGENT:END",
          "axios",
          "fetch",
        ]),
      ),
    );

    const claudeGrep = runCommand(
      ctx,
      "grep-claude-markers-and-rule",
      [
        "grep",
        "-nE",
        "TEAMAGENT:START|TEAMAGENT:END|fetch|axios|需要获取用户数据|manual-before|manual-after",
        claudeMdPath,
      ],
      { allowFailure: true },
    );
    checks.push(check("external grep confirms CLAUDE.md managed block and sentinels", claudeGrep.exitCode === 0));

    const skillsFind = runCommand(
      ctx,
      "find-commit-skills",
      ["find", skillsDir, "-maxdepth", "3", "-type", "f", "-print"],
      { allowFailure: true },
    );
    artifacts.skillsFiles = rel(ctx, skillsFind.stdoutPath);
    checks.push(check("external find checks skills side effects", skillsFind.exitCode === 0));

    const sqliteBlocked = beforeQuery.exitCode !== 0 || afterQuery.exitCode !== 0;
    const status = checks.every((item) => item.ok)
      ? "passed"
      : llmBlocked || sqliteBlocked
        ? "blocked"
        : "failed";

    finalize(ctx, {
      feature: FEATURE,
      status,
      summary: status === "passed"
        ? "真实 analyze CLI 在隔离 HOME/cwd 下完成 dry-run 与 --commit：dry-run 无写入，commit 经 fake Claude spawn 提取后写 project SQLite 并重编译 CLAUDE.md。"
        : "analyze --commit audit 未满足一个或多个外部证据检查；详见 artifacts 和 command 输出。",
      checks,
      artifacts,
    });
  } catch (error) {
    checks.push(check("runner completed without unexpected exception", false, error instanceof Error ? error.stack ?? error.message : String(error)));
    finalize(ctx, {
      feature: FEATURE,
      status: "blocked",
      summary: "Runner hit an unexpected exception before completing the analyze --commit audit.",
      checks,
      artifacts,
    });
  } finally {
    cleanupTemp(ctx);
  }
}

void main();
