import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

type AuditCheck = AuditDecision["checks"][number];

interface SeedSummary {
  path: string;
  lines: number;
  type: Record<string, number>;
  enforcement: Record<string, number>;
  scope: Record<string, number>;
  source: Record<string, number>;
  channel: Record<string, number>;
  missingRequired: Array<{ line: number; fields: string[] }>;
}

interface DbSummary {
  exists: boolean;
  userVersion: number | null;
  total: number;
  active: number;
  seedPreset: number;
  metaPreset: number;
  presetTotal: number;
  byScopeSource: Array<{ scope_level: string; source: string; n: number }>;
}

interface SqliteSummary {
  project: DbSummary;
  global: DbSummary;
}

const REQUIRED_SEED_FIELDS = [
  "id",
  "scope",
  "category",
  "tags",
  "type",
  "nature",
  "trigger",
  "correct_pattern",
  "reasoning",
  "confidence",
  "enforcement",
  "status",
  "source",
  "current_tier",
  "channel",
] as const;

function bump(map: Record<string, number>, key: unknown): void {
  const normalized = typeof key === "string" && key.length > 0 ? key : "(missing)";
  map[normalized] = (map[normalized] ?? 0) + 1;
}

function parseSeed(ctx: AuditContext): SeedSummary {
  const seedPath = path.join(ctx.repoRoot, "packages", "teamagent", "seed", "rules.jsonl");
  const lines = readFileSync(seedPath, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  const summary: SeedSummary = {
    path: seedPath,
    lines: lines.length,
    type: {},
    enforcement: {},
    scope: {},
    source: {},
    channel: {},
    missingRequired: [],
  };

  lines.forEach((line, index) => {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const missing = REQUIRED_SEED_FIELDS.filter((field) => !(field in parsed));
    if (missing.length > 0) {
      summary.missingRequired.push({ line: index + 1, fields: [...missing] });
    }
    bump(summary.type, parsed["type"]);
    bump(summary.enforcement, parsed["enforcement"]);
    bump(summary.scope, (parsed["scope"] as { level?: unknown } | undefined)?.level);
    bump(summary.source, parsed["source"]);
    bump(summary.channel, parsed["channel"]);
  });

  return summary;
}

function writeInitialClaudeMd(projectDir: string, body: string): void {
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(path.join(projectDir, "CLAUDE.md"), body, "utf-8");
}

function sourceCliCommand(ctx: AuditContext, args: string[]): string[] {
  return [
    path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"),
    path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"),
    ...args,
  ];
}

function listEvidencePaths(ctx: AuditContext, root: string): string[] {
  const script = `
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[1];
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(rel + "/");
    else out.push(rel);
    if (stat.isDirectory()) out.push(...walk(full));
  }
  return out;
}
console.log(JSON.stringify(walk(root), null, 2));
`;
  const command = runCommand(
    ctx,
    `list-${path.basename(root)}`,
    ["node", "--input-type=commonjs", "-e", script, root],
    { cwd: root },
  );
  return JSON.parse(readText(command.stdoutPath)) as string[];
}

function sqliteQueryScript(): string {
  return `
const { existsSync } = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const [projectDb, globalDb] = process.argv.slice(1);
function scalar(db, sql) {
  return db.prepare(sql).get().n;
}
function summarize(file) {
  if (!existsSync(file)) {
    return {
      exists: false,
      userVersion: null,
      total: 0,
      active: 0,
      seedPreset: 0,
      metaPreset: 0,
      presetTotal: 0,
      byScopeSource: [],
    };
  }
  const db = new DatabaseSync(file);
  try {
    return {
      exists: true,
      userVersion: db.prepare("pragma user_version").get().user_version,
      total: scalar(db, "select count(*) as n from knowledge"),
      active: scalar(db, "select count(*) as n from knowledge where status = 'active'"),
      seedPreset: scalar(db, "select count(*) as n from knowledge where source = 'preset' and id like 'seed-%'"),
      metaPreset: scalar(db, "select count(*) as n from knowledge where source = 'preset' and id like 'preset-%'"),
      presetTotal: scalar(db, "select count(*) as n from knowledge where source = 'preset'"),
      byScopeSource: db.prepare("select scope_level, source, count(*) as n from knowledge group by scope_level, source order by scope_level, source").all(),
    };
  } finally {
    db.close();
  }
}
console.log(JSON.stringify({ project: summarize(projectDb), global: summarize(globalDb) }, null, 2));
`;
}

function parseJsonFile<T>(file: string): T {
  return JSON.parse(readText(file)) as T;
}

async function main(): Promise<void> {
  const ctx = createAuditContext("feature-01", "init");
  const checks: AuditCheck[] = [];
  const artifacts: Record<string, string> = {};

  try {
    const seedSummary = parseSeed(ctx);
    artifacts["seed-summary"] = rel(ctx, writeJson(ctx, "seed-summary.json", seedSummary));
    checks.push(
      check("seed/rules.jsonl 可解析", seedSummary.lines > 0, `${seedSummary.lines} 行`),
      check(
        "seed 必要字段完整",
        seedSummary.missingRequired.length === 0,
        seedSummary.missingRequired.length === 0
          ? "全部行字段齐全"
          : `${seedSummary.missingRequired.length} 行缺字段`,
      ),
    );

    const dryHome = path.join(ctx.tmpDir, "dry-home");
    const dryProject = path.join(ctx.tmpDir, "dry-project");
    mkdirSync(dryHome, { recursive: true });
    writeInitialClaudeMd(dryProject, "# Dry run audit\n\nManual notes stay above.\n");
    const dryClaudeBefore = readText(path.join(dryProject, "CLAUDE.md"));

    runCommand(
      ctx,
      "init-dry-run-skip-hook",
      sourceCliCommand(ctx, ["init", "--dry-run", "--skip-hook"]),
      {
        cwd: dryProject,
        env: { HOME: dryHome },
        timeoutMs: 120_000,
      },
    );
    const dryClaudeAfter = readText(path.join(dryProject, "CLAUDE.md"));
    const dryProjectDb = path.join(dryProject, ".teamagent", "knowledge.db");
    const dryGlobalDb = path.join(dryHome, ".teamagent", "global.db");
    const drySettings = path.join(dryProject, ".claude", "settings.local.json");
    const dryFiles = listEvidencePaths(ctx, dryProject);
    artifacts["dry-run-files"] = rel(ctx, writeJson(ctx, "dry-run-files.json", dryFiles));
    checks.push(
      check(
        "dry-run stdout 标明预览模式",
        readText(path.join(ctx.outDir, "init-dry-run-skip-hook.stdout.txt")).includes("--dry-run"),
      ),
      check("dry-run 不写项目 DB", !existsSync(dryProjectDb), dryProjectDb),
      check("dry-run 不写 global DB", !existsSync(dryGlobalDb), dryGlobalDb),
      check("dry-run 不写 Claude settings", !existsSync(drySettings), drySettings),
      check("dry-run 不注入 CLAUDE marker", !dryClaudeAfter.includes("TEAMAGENT:START")),
      check("dry-run 保持 CLAUDE.md 原文", dryClaudeAfter === dryClaudeBefore),
    );

    writeInitialClaudeMd(
      ctx.projectDir,
      "# Init audit\n\nManual notes stay above.\n\nThis paragraph must survive init.\n",
    );
    const realProjectDb = path.join(ctx.projectDir, ".teamagent", "knowledge.db");
    const realGlobalDb = path.join(ctx.homeDir, ".teamagent", "global.db");
    const realClaudeMd = path.join(ctx.projectDir, "CLAUDE.md");
    const realInstallLog = path.join(ctx.homeDir, ".teamagent", ".install-log");
    const realArgs = ["init", "--skip-import", "--skip-hook"];
    artifacts["real-init-decision"] = rel(
      ctx,
      writeJson(ctx, "real-init-decision.json", {
        command: sourceCliCommand(ctx, realArgs),
        cwd: ctx.projectDir,
        env: { HOME: ctx.homeDir },
        reason:
          "使用源码 CLI，并加 --skip-import --skip-hook，避免 LLM 调用和 hook bundle 存在性影响 init 的 DB/CLAUDE 主链路审计。",
      }),
    );

    runCommand(ctx, "init-real-skip-import-skip-hook", sourceCliCommand(ctx, realArgs), {
      cwd: ctx.projectDir,
      env: { HOME: ctx.homeDir },
      timeoutMs: 120_000,
    });

    const sqliteCommand = runCommand(
      ctx,
      "sqlite-counts-node-builtin",
      ["node", "--input-type=commonjs", "-e", sqliteQueryScript(), realProjectDb, realGlobalDb],
      { cwd: ctx.projectDir, env: { HOME: ctx.homeDir }, timeoutMs: 60_000 },
    );
    const sqliteSummary = parseJsonFile<SqliteSummary>(sqliteCommand.stdoutPath);
    artifacts["sqlite-summary"] = rel(ctx, writeJson(ctx, "sqlite-summary.json", sqliteSummary));

    const claudeAfter = readText(realClaudeMd);
    artifacts["claude-after"] = rel(ctx, writeArtifact(ctx, "CLAUDE.after.md", claudeAfter));
    artifacts["install-log"] = rel(ctx, writeArtifact(ctx, "install-log.jsonl", readText(realInstallLog)));

    checks.push(
      check(
        "真实 init stdout 成功",
        readText(path.join(ctx.outDir, "init-real-skip-import-skip-hook.stdout.txt")).includes(
          "TeamAgent 安装成功",
        ),
      ),
      check("真实 init 创建项目 DB", existsSync(realProjectDb), realProjectDb),
      check("真实 init 创建 global DB", existsSync(realGlobalDb), realGlobalDb),
      check("真实 init 写 install log", existsSync(realInstallLog), realInstallLog),
      check("项目 DB schema 可由 node:sqlite 打开", sqliteSummary.project.exists, `${sqliteSummary.project.total} 行`),
      check("global DB schema 可由 node:sqlite 打开", sqliteSummary.global.exists, `${sqliteSummary.global.total} 行`),
      check(
        "global DB seed 数等于 rules.jsonl 行数",
        sqliteSummary.global.seedPreset === seedSummary.lines,
        `db=${sqliteSummary.global.seedPreset}, seed=${seedSummary.lines}`,
      ),
      check(
        "global DB 包含 meta preset",
        sqliteSummary.global.metaPreset >= 8,
        `meta=${sqliteSummary.global.metaPreset}`,
      ),
      check(
        "global DB preset 总数覆盖 seed + meta",
        sqliteSummary.global.presetTotal >= seedSummary.lines + sqliteSummary.global.metaPreset,
        `preset=${sqliteSummary.global.presetTotal}, seed=${seedSummary.lines}, meta=${sqliteSummary.global.metaPreset}`,
      ),
      check("CLAUDE.md 包含 TEAMAGENT:START", claudeAfter.includes("TEAMAGENT:START")),
      check("CLAUDE.md 包含 TEAMAGENT:END", claudeAfter.includes("TEAMAGENT:END")),
      check("CLAUDE.md 保留用户原文", claudeAfter.includes("This paragraph must survive init.")),
    );

    const failed = checks.filter((item) => !item.ok);
    finalize(ctx, {
      feature: "Feature #1 init 初始化完整流程",
      status: failed.length === 0 ? "passed" : "failed",
      summary:
        failed.length === 0
          ? [
              "已在隔离 HOME/cwd 中执行非自证 audit：源码 seed/rules.jsonl 可解析；dry-run 未写项目 DB、global DB、Claude settings 或 CLAUDE marker；真实 init 通过源码 CLI 写入项目 DB、global DB、install log 与 CLAUDE.md TEAMAGENT 区块。",
              `外部 node:sqlite 查询确认 global DB 中 seed preset=${sqliteSummary.global.seedPreset}，meta preset=${sqliteSummary.global.metaPreset}，preset total=${sqliteSummary.global.presetTotal}。`,
            ].join("\n\n")
          : `init audit 失败：${failed.map((item) => item.name).join("；")}。详见 audit/out 下的 stdout/stderr/command/decision 证据。`,
      checks,
      artifacts,
    });
  } catch (err) {
    const errorPath = writeArtifact(
      ctx,
      "runner-error.txt",
      err instanceof Error ? `${err.stack ?? err.message}\n` : `${String(err)}\n`,
    );
    checks.push(check("runner 执行完成", false, rel(ctx, errorPath)));
    finalize(ctx, {
      feature: "Feature #1 init 初始化完整流程",
      status: "failed",
      summary: "runner 执行过程中失败。已把错误、已执行命令的 stdout/stderr/command 写入 audit/out。",
      checks,
      artifacts,
    });
  } finally {
    cleanupTemp(ctx);
  }
}

void main();
