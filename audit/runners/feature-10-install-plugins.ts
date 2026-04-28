import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

interface ScenarioSpec {
  name: string;
  label: string;
  args: string[];
  expectedExit: number;
  expectedArgv: string[][];
  stdoutIncludes: string[];
  stdoutExcludes?: string[];
}

interface ValidationSummary {
  ok: boolean;
  scenario: string;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  actualArgv: string[][];
}

const FEATURE = "feature-10-install-plugins";

const SCENARIOS: ScenarioSpec[] = [
  {
    name: "default",
    label: "default install",
    args: [],
    expectedExit: 0,
    expectedArgv: [
      ["plugin", "marketplace", "add", "anthropics/claude-plugins-official"],
      ["plugin", "marketplace", "add", "anthropics/knowledge-work-plugins"],
      ["plugin", "marketplace", "add", "JuliusBrussee/caveman"],
      ["plugin", "install", "superpowers@claude-plugins-official"],
      ["plugin", "install", "playground@claude-plugins-official"],
      ["plugin", "install", "sales@knowledge-work-plugins"],
      ["plugin", "install", "caveman@caveman"],
    ],
    stdoutIncludes: ["Marketplaces:", "Plugins:", "7 新装", "重启 Claude Code"],
  },
  {
    name: "dry-run-project-scope",
    label: "dry-run with project scope",
    args: ["--dry-run", "--scope=project"],
    expectedExit: 0,
    expectedArgv: [],
    stdoutIncludes: ["预览模式", "dry-run", "7 将执行"],
  },
  {
    name: "only-caveman-local-scope",
    label: "only caveman with local scope",
    args: ["--only=caveman", "--scope=local"],
    expectedExit: 0,
    expectedArgv: [
      ["plugin", "marketplace", "add", "JuliusBrussee/caveman"],
      ["plugin", "install", "caveman@caveman", "--scope", "local"],
    ],
    stdoutIncludes: ["caveman@caveman", "2 新装"],
    stdoutExcludes: [
      "superpowers@claude-plugins-official",
      "playground@claude-plugins-official",
      "sales@knowledge-work-plugins",
    ],
  },
  {
    name: "unknown-plugin",
    label: "unknown plugin",
    args: ["--only=ghost"],
    expectedExit: 1,
    expectedArgv: [],
    stdoutIncludes: ["unknown plugin", "ghost", "1 失败"],
  },
];

function cliCommand(ctx: AuditContext, args: string[]): string[] {
  return [
    path.join(ctx.repoRoot, "node_modules", ".bin", "tsx"),
    path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"),
    "install-plugins",
    ...args,
  ];
}

function fakeClaudeScript(): string {
  return [
    "#!/usr/bin/env node",
    'const fs = require("node:fs");',
    "",
    "const log = process.env.CLAUDE_FAKE_LOG;",
    "const argv = process.argv.slice(2);",
    "if (!log) {",
    '  console.error("CLAUDE_FAKE_LOG is required");',
    "  process.exit(70);",
    "}",
    "fs.appendFileSync(log, JSON.stringify({",
    "  argv,",
    "  cwd: process.cwd(),",
    '  home: process.env.HOME || "",',
    '  pathHead: (process.env.PATH || "").split(":").slice(0, 3),',
    "  ts: new Date().toISOString(),",
    "}) + \"\\n\");",
    "",
    'if (argv[0] === "plugin" && argv[1] === "marketplace" && argv[2] === "add") {',
    "  console.log(`Successfully added marketplace: ${argv[3]}`);",
    "  process.exit(0);",
    "}",
    "",
    'if (argv[0] === "plugin" && argv[1] === "install") {',
    '  const scopeIdx = argv.indexOf("--scope");',
    '  const scope = scopeIdx >= 0 ? argv[scopeIdx + 1] : "default";',
    "  console.log(`Successfully installed plugin: ${argv[2]} (scope: ${scope})`);",
    "  process.exit(0);",
    "}",
    "",
    "console.log(`Failed: unexpected argv ${argv.join(\" \")}`);",
    "process.exit(0);",
    "",
  ].join("\n");
}

function writeFakeClaude(ctx: AuditContext): string {
  const binDir = path.join(ctx.tmpDir, "bin");
  mkdirSync(binDir, { recursive: true });
  const fakeClaude = path.join(binDir, "claude");
  writeFileSync(fakeClaude, fakeClaudeScript(), "utf-8");
  chmodSync(fakeClaude, 0o755);
  return binDir;
}

function validatorScript(): string {
  return String.raw`
const fs = require("node:fs");

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const [expectedPath, logPath, stdoutPath, stderrPath] = process.argv.slice(2);
const expected = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
const stdout = readText(stdoutPath);
const stderr = readText(stderrPath);
const checks = [];
const actualArgv = [];

function add(name, ok, detail) {
  checks.push({ name, ok, detail });
}

add("exit code matches", expected.actualExit === expected.expectedExit, "expected=" + expected.expectedExit + " actual=" + expected.actualExit);
add("stderr is empty", stderr.length === 0, stderr.length === 0 ? "empty" : String(stderr.length) + " bytes");

if (expected.expectedArgv.length === 0) {
  add("no claude JSONL log", !fs.existsSync(logPath), fs.existsSync(logPath) ? "log unexpectedly exists" : "absent");
} else {
  if (!fs.existsSync(logPath)) {
    add("claude JSONL log exists", false, "missing");
  } else {
    const lines = readText(logPath).trim().split(/\r?\n/).filter(Boolean);
    let rows = [];
    try {
      rows = lines.map((line) => JSON.parse(line));
      add("JSONL parses", true, String(rows.length) + " rows");
    } catch (error) {
      add("JSONL parses", false, error && error.message ? error.message : String(error));
    }
    for (const row of rows) actualArgv.push(row.argv);
    add("argv sequence matches", sameJson(actualArgv, expected.expectedArgv), "expected=" + JSON.stringify(expected.expectedArgv) + " actual=" + JSON.stringify(actualArgv));
    add("HOME is isolated", rows.every((row) => row.home === expected.homeDir), expected.homeDir);
    add("fake claude is first in PATH", rows.every((row) => row.pathHead && row.pathHead[0] === expected.fakeBinDir), expected.fakeBinDir);
    add("marketplace add has no scope", rows.filter((row) => row.argv && row.argv[1] === "marketplace").every((row) => !row.argv.includes("--scope")), "scope belongs only to plugin install");
  }
}

for (const needle of expected.stdoutIncludes) {
  add("stdout includes " + needle, stdout.includes(needle), needle);
}

for (const needle of expected.stdoutExcludes || []) {
  add("stdout excludes " + needle, !stdout.includes(needle), needle);
}

const ok = checks.every((check) => check.ok);
console.log(JSON.stringify({ ok, scenario: expected.name, checks, actualArgv }, null, 2));
if (!ok) process.exit(1);
`;
}

function parseValidation(stdout: string): ValidationSummary | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record["ok"] !== "boolean" || typeof record["scenario"] !== "string") return null;
    if (!Array.isArray(record["checks"]) || !Array.isArray(record["actualArgv"])) return null;
    return parsed as ValidationSummary;
  } catch {
    return null;
  }
}

function runScenario(ctx: AuditContext, fakeBinDir: string, validatorPath: string, spec: ScenarioSpec): AuditCheck[] {
  const logPath = path.join(ctx.outDir, `${spec.name}.claude-commands.jsonl`);
  rmSync(logPath, { force: true });

  const command = runCommand(ctx, `install-plugins-${spec.name}`, cliCommand(ctx, spec.args), {
    cwd: ctx.projectDir,
    env: {
      HOME: ctx.homeDir,
      PATH: `${fakeBinDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
      CLAUDE_FAKE_LOG: logPath,
      NODE_NO_WARNINGS: "1",
    },
    allowFailure: true,
    timeoutMs: 120_000,
  });

  const expectedPath = writeJson(ctx, `${spec.name}.expected.json`, {
    name: spec.name,
    expectedExit: spec.expectedExit,
    actualExit: command.exitCode,
    expectedArgv: spec.expectedArgv,
    homeDir: ctx.homeDir,
    fakeBinDir,
    stdoutIncludes: spec.stdoutIncludes,
    stdoutExcludes: spec.stdoutExcludes ?? [],
  });

  const validation = runCommand(
    ctx,
    `validate-jsonl-${spec.name}`,
    ["node", validatorPath, expectedPath, logPath, command.stdoutPath, command.stderrPath],
    { allowFailure: true, timeoutMs: 30_000 },
  );
  const parsed = parseValidation(readText(validation.stdoutPath));
  const checks: AuditCheck[] = [
    check(
      `${spec.label}: external JSONL validator passed`,
      validation.exitCode === 0 && parsed?.ok === true,
      parsed === null ? readText(validation.stderrPath).trim() || "validator did not return JSON" : `${parsed.checks.filter((c) => c.ok).length}/${parsed.checks.length} checks`,
    ),
  ];

  if (parsed !== null) {
    checks.push(
      ...parsed.checks.map((item) =>
        check(`${spec.label}: ${item.name}`, item.ok, item.detail),
      ),
    );
  }

  return checks;
}

const ctx = createAuditContext("feature-10", "install-plugins");
const checks: AuditCheck[] = [];
const artifacts: Record<string, string> = {};

try {
  const fakeBinDir = writeFakeClaude(ctx);
  const validatorPath = writeArtifact(ctx, "jsonl-validator.cjs", validatorScript());
  artifacts["fake-claude-source"] = rel(ctx, writeArtifact(ctx, "fake-claude.cjs", fakeClaudeScript()));
  artifacts["fake-claude-path"] = path.join(fakeBinDir, "claude");
  artifacts["jsonl-validator"] = rel(ctx, validatorPath);

  for (const scenario of SCENARIOS) {
    checks.push(...runScenario(ctx, fakeBinDir, validatorPath, scenario));
    artifacts[`${scenario.name}-stdout`] = rel(ctx, path.join(ctx.outDir, `install-plugins-${scenario.name}.stdout.txt`));
    artifacts[`${scenario.name}-stderr`] = rel(ctx, path.join(ctx.outDir, `install-plugins-${scenario.name}.stderr.txt`));
    artifacts[`${scenario.name}-expected`] = rel(ctx, path.join(ctx.outDir, `${scenario.name}.expected.json`));
    artifacts[`${scenario.name}-claude-log`] = rel(ctx, path.join(ctx.outDir, `${scenario.name}.claude-commands.jsonl`));
  }

  const status = checks.every((item) => item.ok) ? "passed" : "failed";
  finalize(ctx, {
    feature: FEATURE,
    status,
    summary:
      status === "passed"
        ? "通过：runner 创建临时 PATH fake claude，真实执行源码 CLI install-plugins 的默认、dry-run、only=caveman 和 unknown plugin 场景，并由独立 JSONL validator 校验 marketplace/install argv、HOME/PATH 隔离、scope/only/dry-run 行为和渲染输出。"
        : "失败：至少一个 install-plugins 场景没有通过独立 JSONL validator；stdout/stderr、预期文件和 fake claude command log 已落盘。",
    checks,
    artifacts,
  });
} catch (error) {
  finalize(ctx, {
    feature: FEATURE,
    status: "blocked",
    summary: `blocked before completing runner: ${error instanceof Error ? error.message : String(error)}`,
    checks: [check("runner completed", false)],
    artifacts,
  });
} finally {
  cleanupTemp(ctx);
}
