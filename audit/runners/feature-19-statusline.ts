import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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

const FEATURE = "Feature #19 statusLine";

function isolatedEnv(ctx: AuditContext, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HOME: ctx.homeDir,
    XDG_CONFIG_HOME: path.join(ctx.homeDir, ".config"),
    ...extra,
  };
}

function tsxCommand(ctx: AuditContext, args: string[]): string[] {
  return [path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"), ...args];
}

function makeStatuslineDbScript(): string {
  return String.raw`
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");

const [dbPath, rowsJson] = process.argv.slice(2);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.rmSync(dbPath, { force: true });

const db = new DatabaseSync(dbPath);
db.exec(
  "CREATE TABLE knowledge (" +
    "status TEXT, " +
    "type TEXT, " +
    "created_at TEXT" +
  ");",
);
const insert = db.prepare("INSERT INTO knowledge (status, type, created_at) VALUES (?, ?, ?)");
for (const row of JSON.parse(rowsJson)) {
  insert.run(row.status, row.type ?? null, row.created_at);
}
db.close();
console.log(JSON.stringify({ dbPath, rows: JSON.parse(rowsJson).length }));
`;
}

function installHookDriverScript(): string {
  return String.raw`
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
const cwd = process.env.INSTALL_PROJECT;
const hookEntry = process.env.FAKE_HOOK;
const statusLineEntry = process.env.STATUSLINE;
const mode = process.argv[2];

if (!repo || !cwd || !hookEntry || !statusLineEntry) {
  throw new Error("REPO, INSTALL_PROJECT, FAKE_HOOK, and STATUSLINE are required");
}

const { installHook } = await import(
  pathToFileURL(path.join(repo, "packages/cli/src/commands/install-hook.ts")).href
);

const settingsPath = path.join(cwd, ".claude", "settings.local.json");
if (mode === "user-statusline") {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        statusLine: { type: "command", command: "node /custom/user/statusline.js" },
      },
      null,
      2,
    ) + "\n",
  );
}
if (mode === "tagged-statusline") {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        statusLine: {
          type: "command",
          command: "node /old/teamagent-statusline.cjs",
          _teamagentTag: "teamagent-statusline",
        },
      },
      null,
      2,
    ) + "\n",
  );
}

const result = installHook({ cwd, hookEntry, statusLineEntry });
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
console.log(JSON.stringify({ result, settings }, null, 2));
`;
}

function installHookValidatorScript(): string {
  return String.raw`
const fs = require("node:fs");
const assert = require("node:assert/strict");

const [file, mode, statusLineEntry] = process.argv.slice(2);
const got = JSON.parse(fs.readFileSync(file, "utf8"));
const settings = got.settings;
const statusLine = settings.statusLine;

function hasTeamAgentPreHook() {
  return Boolean(settings.hooks?.PreToolUse?.some((entry) => entry?._teamagentTag === "teamagent-pre-tool-use"));
}

assert.equal(hasTeamAgentPreHook(), true, "PreToolUse TeamAgent hook missing");

if (mode === "fresh") {
  assert.equal(got.result.statusLineSkipped, false, "statusLineSkipped should be false");
  assert.equal(statusLine?.type, "command", "statusLine.type mismatch");
  assert.equal(statusLine?._teamagentTag, "teamagent-statusline", "statusLine tag mismatch");
  assert.match(String(statusLine?.command ?? ""), /^node /, "statusLine command should invoke node");
  assert.equal(
    String(statusLine?.command ?? "").includes(statusLineEntry.replace(/\\/g, "/")),
    true,
    "statusLine command should include entry",
  );
}

if (mode === "user-statusline") {
  assert.equal(got.result.statusLineSkipped, true, "statusLineSkipped should be true");
  assert.equal(statusLine?.command, "node /custom/user/statusline.js", "user command overwritten");
  assert.equal(statusLine?._teamagentTag, undefined, "user statusLine should not gain TeamAgent tag");
}

if (mode === "tagged-statusline") {
  assert.equal(got.result.statusLineSkipped, false, "tagged TeamAgent statusLine should be updatable");
  assert.equal(statusLine?._teamagentTag, "teamagent-statusline", "TeamAgent tag missing");
  assert.equal(String(statusLine?.command ?? "").includes("/old/teamagent-statusline.cjs"), false, "old command was not replaced");
  assert.equal(
    String(statusLine?.command ?? "").includes(statusLineEntry.replace(/\\/g, "/")),
    true,
    "new command missing",
  );
}

console.log(JSON.stringify({ ok: true, mode, statusLine }, null, 2));
`;
}

function statuslineResultValidatorScript(): string {
  return String.raw`
const fs = require("node:fs");
const assert = require("node:assert/strict");

const [stdoutPath, stderrPath, exitCodePath, expectation] = process.argv.slice(2);
const stdout = fs.readFileSync(stdoutPath, "utf8");
const stderr = fs.readFileSync(stderrPath, "utf8");
const exitCode = fs.readFileSync(exitCodePath, "utf8").trim();

function stderrIsAllowed(text) {
  if (text.trim() === "") return true;
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .every(
      (line) =>
        line.includes("ExperimentalWarning: SQLite is an experimental feature") ||
        line.includes("Use \`node --trace-warnings"),
    );
}

assert.equal(exitCode, "0", "statusline exit code");
assert.equal(stderrIsAllowed(stderr), true, "unexpected stderr: " + stderr);

if (expectation.startsWith("exact:")) {
  assert.equal(stdout, expectation.slice("exact:".length), "stdout mismatch");
} else if (expectation.startsWith("contains:")) {
  assert.equal(stdout.includes(expectation.slice("contains:".length)), true, "stdout missing expected text");
} else {
  throw new Error("unknown expectation: " + expectation);
}

console.log(JSON.stringify({ ok: true, stdout, stderrAllowed: true }, null, 2));
`;
}

function parseJson<T>(file: string): T {
  return JSON.parse(readText(file)) as T;
}

function statuslineCommand(ctx: AuditContext, cwd: string, name: string) {
  const statusline = path.join(ctx.repoRoot, "scripts", "teamagent-statusline.cjs");
  return runCommand(ctx, name, ["node", statusline], {
    cwd,
    env: isolatedEnv(ctx),
    allowFailure: true,
  });
}

async function main(): Promise<void> {
  const ctx = createAuditContext("feature-19", "statusline");
  const checks: AuditCheck[] = [];
  const artifacts: Record<string, string> = {};

  try {
    const statusline = path.join(ctx.repoRoot, "scripts", "teamagent-statusline.cjs");
    const makeDbScript = writeArtifact(ctx, "make-statusline-db.cjs", makeStatuslineDbScript());
    const installDriver = writeArtifact(ctx, "install-hook-driver.mjs", installHookDriverScript());
    const installValidator = writeArtifact(ctx, "install-hook-validator.cjs", installHookValidatorScript());
    const statuslineValidator = writeArtifact(ctx, "statusline-validator.cjs", statuslineResultValidatorScript());
    artifacts["make-db-script"] = rel(ctx, makeDbScript);
    artifacts["install-hook-driver"] = rel(ctx, installDriver);
    artifacts["install-hook-validator"] = rel(ctx, installValidator);
    artifacts["statusline-validator"] = rel(ctx, statuslineValidator);

    const sqlitePreflight = runCommand(
      ctx,
      "node-sqlite-preflight",
      ["node", "-e", "require('node:sqlite'); console.log('node:sqlite available')"],
      { allowFailure: true },
    );
    checks.push(check("node:sqlite 可用", sqlitePreflight.exitCode === 0, readText(sqlitePreflight.stderrPath).trim()));

    const globalDb = path.join(ctx.homeDir, ".teamagent", "global.db");
    const projectDb = path.join(ctx.projectDir, ".teamagent", "knowledge.db");
    const nonProjectDir = path.join(ctx.tmpDir, "non-project");
    const missingProjectDir = path.join(ctx.tmpDir, "project-missing-db");
    const emptyHome = path.join(ctx.tmpDir, "empty-home");
    const emptyDir = path.join(ctx.tmpDir, "empty-non-project");
    mkdirSync(nonProjectDir, { recursive: true });
    mkdirSync(missingProjectDir, { recursive: true });
    mkdirSync(emptyHome, { recursive: true });
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(path.join(ctx.projectDir, "package.json"), "{}\n", "utf-8");
    writeFileSync(path.join(missingProjectDir, "package.json"), "{}\n", "utf-8");

    const projectRows = JSON.stringify([
      { status: "active", type: "avoidance", created_at: "2026-04-20T00:00:00Z" },
      { status: "active", type: "practice", created_at: "2026-04-21T00:00:00Z" },
      { status: "active", type: "wiki", created_at: "2026-04-22T00:00:00Z" },
      { status: "archived", type: "avoidance", created_at: "2026-04-23T00:00:00Z" },
    ]);
    const globalRows = JSON.stringify([
      { status: "active", type: null, created_at: "2026-04-24T00:00:00Z" },
      { status: "active", type: "avoidance", created_at: "2026-04-25T00:00:00Z" },
      { status: "active", type: "practice", created_at: "2026-04-26T00:00:00Z" },
      { status: "active", type: "wiki", created_at: "2026-04-27T00:00:00Z" },
    ]);

    const seedProject = runCommand(ctx, "seed-project-sqlite", ["node", makeDbScript, projectDb, projectRows], {
      allowFailure: true,
    });
    const seedGlobal = runCommand(ctx, "seed-global-sqlite", ["node", makeDbScript, globalDb, globalRows], {
      allowFailure: true,
    });
    checks.push(
      check("外部 seed project SQLite", seedProject.exitCode === 0, projectDb),
      check("外部 seed global SQLite", seedGlobal.exitCode === 0, globalDb),
    );

    const projectAndGlobal = statuslineCommand(ctx, ctx.projectDir, "statusline-project-and-global");
    const projectAndGlobalValidator = runCommand(
      ctx,
      "validate-statusline-project-and-global",
      [
        "node",
        statuslineValidator,
        projectAndGlobal.stdoutPath,
        projectAndGlobal.stderrPath,
        projectAndGlobal.exitCodePath,
        "exact:TeamAgent正在运行 · 规则库：5条",
      ],
      { allowFailure: true },
    );

    const missingProject = statuslineCommand(ctx, missingProjectDir, "statusline-missing-project-db");
    const missingProjectValidator = runCommand(
      ctx,
      "validate-statusline-missing-project-db",
      [
        "node",
        statuslineValidator,
        missingProject.stdoutPath,
        missingProject.stderrPath,
        missingProject.exitCodePath,
        "contains:TeamAgent 未初始化本项目",
      ],
      { allowFailure: true },
    );

    const globalOnly = statuslineCommand(ctx, nonProjectDir, "statusline-global-only");
    const globalOnlyValidator = runCommand(
      ctx,
      "validate-statusline-global-only",
      [
        "node",
        statuslineValidator,
        globalOnly.stdoutPath,
        globalOnly.stderrPath,
        globalOnly.exitCodePath,
        "exact:TeamAgent正在运行 · 规则库：3条",
      ],
      { allowFailure: true },
    );

    const noDb = runCommand(ctx, "statusline-no-db", ["node", statusline], {
      cwd: emptyDir,
      env: isolatedEnv(ctx, { HOME: emptyHome }),
      allowFailure: true,
    });
    const noDbValidator = runCommand(
      ctx,
      "validate-statusline-no-db",
      [
        "node",
        statuslineValidator,
        noDb.stdoutPath,
        noDb.stderrPath,
        noDb.exitCodePath,
        "contains:TeamAgent 未安装",
      ],
      { allowFailure: true },
    );

    checks.push(
      check("真实 statusLine 聚合 project+global active 非 wiki 为 5", projectAndGlobalValidator.exitCode === 0),
      check("project marker 存在但 project DB 缺失时输出初始化提醒", missingProjectValidator.exitCode === 0),
      check("非项目目录只读 global DB active 非 wiki 为 3", globalOnlyValidator.exitCode === 0),
      check("无 project/global DB 时输出安装缺失提示", noDbValidator.exitCode === 0),
    );

    const fakeHook = path.join(ctx.tmpDir, "fake-pre-tool-use.cjs");
    writeFileSync(fakeHook, "process.exit(0);\n", "utf-8");
    const installProjects = {
      fresh: path.join(ctx.tmpDir, "install-project"),
      user: path.join(ctx.tmpDir, "install-project-user-existing"),
      tagged: path.join(ctx.tmpDir, "install-project-tagged-existing"),
    };
    for (const dir of Object.values(installProjects)) mkdirSync(dir, { recursive: true });

    const runInstall = (name: string, cwd: string, mode: string) =>
      runCommand(ctx, `install-hook-${name}`, tsxCommand(ctx, [installDriver, mode]), {
        cwd,
        env: isolatedEnv(ctx, {
          REPO: ctx.repoRoot,
          INSTALL_PROJECT: cwd,
          FAKE_HOOK: fakeHook,
          STATUSLINE: statusline,
        }),
        allowFailure: true,
      });

    const installFresh = runInstall("fresh", installProjects.fresh, "fresh");
    const validateInstallFresh = runCommand(
      ctx,
      "validate-install-hook-fresh",
      ["node", installValidator, installFresh.stdoutPath, "fresh", statusline],
      { allowFailure: true },
    );

    const installUser = runInstall("user-existing", installProjects.user, "user-statusline");
    const validateInstallUser = runCommand(
      ctx,
      "validate-install-hook-user-existing",
      ["node", installValidator, installUser.stdoutPath, "user-statusline", statusline],
      { allowFailure: true },
    );

    const installTagged = runInstall("tagged-existing", installProjects.tagged, "tagged-statusline");
    const validateInstallTagged = runCommand(
      ctx,
      "validate-install-hook-tagged-existing",
      ["node", installValidator, installTagged.stdoutPath, "tagged-statusline", statusline],
      { allowFailure: true },
    );

    const freshJson = parseJson<{ settings?: unknown }>(installFresh.stdoutPath);
    const userJson = parseJson<{ settings?: unknown }>(installUser.stdoutPath);
    const taggedJson = parseJson<{ settings?: unknown }>(installTagged.stdoutPath);
    artifacts["install-fresh-result"] = rel(ctx, writeJson(ctx, "install-fresh-result.json", freshJson));
    artifacts["install-user-existing-result"] = rel(ctx, writeJson(ctx, "install-user-existing-result.json", userJson));
    artifacts["install-tagged-existing-result"] = rel(ctx, writeJson(ctx, "install-tagged-existing-result.json", taggedJson));

    checks.push(
      check("installHook fresh 写入 TeamAgent statusLine", validateInstallFresh.exitCode === 0),
      check("installHook 不覆盖用户非 TeamAgent statusLine", validateInstallUser.exitCode === 0),
      check("installHook 可更新旧 TeamAgent tagged statusLine", validateInstallTagged.exitCode === 0),
      check("runner 只使用真实 statusline 脚本", existsSync(statusline), statusline),
    );

    const failed = checks.filter((c) => !c.ok);
    finalize(ctx, {
      feature: FEATURE,
      status: failed.length === 0 ? "passed" : "failed",
      summary:
        failed.length === 0
          ? "通过：runner 在隔离 cwd/HOME 中外部 seed project/global SQLite，真实执行 node scripts/teamagent-statusline.cjs 验证未初始化、seeded、global-only 和 no-db 输出；随后用 source installHook 写临时 settings.local.json，并由独立 Node JSON 校验器确认 statusLine 写入、用户非 TeamAgent statusLine 不覆盖、旧 TeamAgent tagged statusLine 可更新。"
          : `失败：${failed.length} 个 statusLine audit 检查未通过。`,
      checks,
      artifacts,
    });
  } catch (error) {
    checks.push(check("runner 未捕获异常", false, error instanceof Error ? error.stack ?? error.message : String(error)));
    finalize(ctx, {
      feature: FEATURE,
      status: "failed",
      summary: "失败：statusLine audit runner 执行期间抛出异常。",
      checks,
      artifacts,
    });
  } finally {
    cleanupTemp(ctx);
  }
}

void main();
