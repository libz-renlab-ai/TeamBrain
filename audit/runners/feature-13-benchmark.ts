import { existsSync, mkdirSync } from "node:fs";
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

const FEATURE = "Feature #13 benchmark";

function schemaCheckScript(repoRoot: string): string {
  return String.raw`
const fs = require("node:fs");
const path = require("node:path");

const repo = ${JSON.stringify(repoRoot)};
const tasksDir = path.join(repo, "packages/benchmark/fixtures/tasks");
const groupsDir = path.join(repo, "packages/benchmark/fixtures/groups");
const errors = [];
const taskIds = new Set();
const taskFiles = fs.existsSync(tasksDir)
  ? fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json")).sort()
  : [];

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

assert(taskFiles.length > 0, "no task JSON fixtures found");

for (const file of taskFiles) {
  const full = path.join(tasksDir, file);
  let task;
  try {
    task = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (e) {
    errors.push(file + ": invalid JSON: " + e.message);
    continue;
  }

  for (const key of ["id", "name", "category", "prompt"]) {
    assert(typeof task[key] === "string" && task[key].trim().length > 0, file + ": " + key + " must be non-empty string");
  }
  assert(typeof task.id === "string" && file.startsWith(task.id), file + ": filename should start with id " + task.id);
  assert(typeof task.id === "string" && !taskIds.has(task.id), file + ": duplicate task id " + task.id);
  if (typeof task.id === "string") taskIds.add(task.id);

  assert(task.evaluator && task.evaluator.type === "pattern", file + ": evaluator.type must be pattern");
  for (const kind of ["wrong_patterns", "correct_patterns"]) {
    const arr = task.evaluator && task.evaluator[kind];
    assert(Array.isArray(arr) && arr.length > 0, file + ": " + kind + " must be non-empty array");
    if (!Array.isArray(arr)) continue;
    for (const [i, pattern] of arr.entries()) {
      assert(typeof pattern === "string" && pattern.length > 0, file + ": " + kind + "[" + i + "] must be non-empty string");
      try {
        new RegExp(pattern);
      } catch (e) {
        errors.push(file + ": " + kind + "[" + i + "] regex compile failed: " + e.message);
      }
    }
  }
}

for (const group of ["baseline", "teamagent"]) {
  const templatePath = path.join(groupsDir, group, "settings.template.json");
  assert(fs.existsSync(templatePath), group + ": missing settings.template.json");
  if (!fs.existsSync(templatePath)) continue;

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(templatePath, "utf8"));
  } catch (e) {
    errors.push(group + ": invalid settings.template.json: " + e.message);
    continue;
  }

  const allow = settings.permissions && settings.permissions.allow;
  assert(Array.isArray(allow), group + ": permissions.allow must be array");
  for (const tool of ["Write", "Edit", "MultiEdit", "Read", "Bash", "Glob", "Grep"]) {
    assert(Array.isArray(allow) && allow.includes(tool), group + ": permissions.allow missing " + tool);
  }

  if (group === "baseline") {
    assert(settings.hooks && typeof settings.hooks === "object" && Object.keys(settings.hooks).length === 0, "baseline: hooks must be empty object");
  } else {
    for (const hook of ["PreToolUse", "PostToolUse", "UserPromptSubmit"]) {
      const command = settings.hooks && settings.hooks[hook] && settings.hooks[hook][0] && settings.hooks[hook][0].hooks && settings.hooks[hook][0].hooks[0] && settings.hooks[hook][0].hooks[0].command;
      assert(typeof command === "string" && command.includes("{{HOOK_DIR}}/bin-") && command.endsWith(".cjs"), "teamagent: " + hook + " command must use {{HOOK_DIR}}/bin-*.cjs");
    }
    assert(fs.existsSync(path.join(groupsDir, group, "seed.sql")), "teamagent: missing seed.sql");
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  taskCount: taskFiles.length,
  taskIds: Array.from(taskIds),
  groups: ["baseline", "teamagent"]
}, null, 2));
`;
}

function evaluatorCheckScript(repoRoot: string): string {
  return String.raw`
const fs = require("node:fs");
const path = require("node:path");

const repo = ${JSON.stringify(repoRoot)};
const tasksDir = path.join(repo, "packages/benchmark/fixtures/tasks");
const checks = [
  ["001-moment-vs-dayjs", "import moment from 'moment'", "wrong"],
  ["001-moment-vs-dayjs", "import dayjs from 'dayjs'", "correct"],
  ["002-axios-cancel", "const source = axios.CancelToken.source()", "wrong"],
  ["002-axios-cancel", "const c = new AbortController(); axios.get(url, { signal: c.signal })", "correct"],
  ["003-react-key", "<li key={index}>{name}</li>", "wrong"],
  ["003-react-key", "<li key={name}>{name}</li>", "correct"],
  ["004-multi-trap-todo", "import moment from 'moment'; axios.CancelToken.source(); key={index}", "wrong"],
  ["004-multi-trap-todo", "import dayjs from 'dayjs'; const c = new AbortController(); key={item.id}", "correct"],
  ["005-xhr-vs-fetch", "const xhr = new XMLHttpRequest(); xhr.open('GET', url); xhr.send();", "wrong"],
  ["005-xhr-vs-fetch", "const response = await fetch(url); return response.json();", "correct"],
  ["006-react-class-component", "class CounterPanel extends React.Component<Props, State> {}", "wrong"],
  ["006-react-class-component", "function CounterPanel(){ const [count,setCount] = useState(0); useEffect(()=>{}, []); }", "correct"],
  ["007-verify-loop", "import moment from 'moment'; key={index}; axios.CancelToken.source();", "wrong"],
  ["007-verify-loop", "import dayjs from 'dayjs'; const c = new AbortController(); key={item.id}", "correct"]
];

function verdict(task, text) {
  for (const p of task.evaluator.wrong_patterns) if (new RegExp(p).test(text)) return "wrong";
  for (const p of task.evaluator.correct_patterns) if (new RegExp(p).test(text)) return "correct";
  return "neither";
}

const byId = new Map();
for (const file of fs.readdirSync(tasksDir).filter((f) => f.endsWith(".json"))) {
  const task = JSON.parse(fs.readFileSync(path.join(tasksDir, file), "utf8"));
  byId.set(task.id, task);
}

const failures = [];
for (const [id, text, expected] of checks) {
  const task = byId.get(id);
  const actual = task ? verdict(task, text) : "missing-task";
  if (actual !== expected) failures.push({ id, expected, actual, text });
}

const both = verdict(byId.get("001-moment-vs-dayjs"), "import moment from 'moment'; import dayjs from 'dayjs';");
if (both !== "wrong") failures.push({ id: "001-moment-vs-dayjs", expected: "wrong priority", actual: both });

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checked: checks.length, wrongPriority: true }, null, 2));
`;
}

function reportCheckerScript(): string {
  return String.raw`
const fs = require("node:fs");
const reportPath = process.argv[1];
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const errors = [];
const verdicts = new Set(["correct", "wrong", "neither", "error"]);

function assert(cond, msg) {
  if (!cond) errors.push(msg);
}

function closeEnough(a, b) {
  return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9;
}

assert(typeof report.generatedAt === "string" && !Number.isNaN(Date.parse(report.generatedAt)), "generatedAt must be ISO-like timestamp");
assert(report.config && Array.isArray(report.config.groups), "config.groups missing");
assert(Array.isArray(report.groups), "groups missing");
assert(report.comparison && typeof report.comparison === "object", "comparison missing");
assert(Array.isArray(report.rawResults), "rawResults missing");

for (const r of report.rawResults || []) {
  assert(typeof r.group === "string" && r.group.length > 0, "rawResults[].group missing");
  assert(typeof r.taskId === "string" && r.taskId.length > 0, "rawResults[].taskId missing");
  assert(Number.isInteger(r.run) && r.run >= 1, "rawResults[].run invalid");
  assert(verdicts.has(r.verdict), "rawResults[].verdict invalid: " + r.verdict);
  for (const k of ["tokensIn", "tokensOut", "cacheReadTokens", "cacheCreationTokens", "durationMs"]) {
    assert(typeof r[k] === "number" && r[k] >= 0, "rawResults[]." + k + " invalid");
  }
  assert(typeof r.output === "string", "rawResults[].output must be string");
}

const recomputed = new Map();
for (const r of report.rawResults || []) {
  const g = recomputed.get(r.group) || {
    group: r.group,
    wrongCount: 0,
    correctCount: 0,
    neitherCount: 0,
    errorCount: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    durationTotal: 0,
    rows: 0
  };
  g[r.verdict + "Count"]++;
  g.totalTokensIn += r.tokensIn;
  g.totalTokensOut += r.tokensOut;
  g.totalCacheReadTokens += r.cacheReadTokens;
  g.totalCacheCreationTokens += r.cacheCreationTokens;
  g.durationTotal += r.durationMs;
  g.rows++;
  recomputed.set(r.group, g);
}

for (const g of report.groups || []) {
  const expected = recomputed.get(g.group);
  assert(Boolean(expected), "group summary has no rawResults: " + g.group);
  if (!expected) continue;
  for (const k of ["wrongCount", "correctCount", "neitherCount", "errorCount", "totalTokensIn", "totalTokensOut", "totalCacheReadTokens", "totalCacheCreationTokens"]) {
    assert(g[k] === expected[k], g.group + "." + k + " mismatch: got " + g[k] + ", expected " + expected[k]);
  }
  const avg = expected.rows ? expected.durationTotal / expected.rows : 0;
  assert(closeEnough(g.avgDurationMs, avg), g.group + ".avgDurationMs mismatch");
}

const baseline = (report.groups || []).find((g) => g.group === "baseline");
const teamagent = (report.groups || []).find((g) => g.group === "teamagent");
if (baseline && teamagent) {
  const expectedPrr = baseline.wrongCount > 0 ? (baseline.wrongCount - teamagent.wrongCount) / baseline.wrongCount : 0;
  assert(closeEnough(report.comparison.prr, expectedPrr), "comparison.prr mismatch");

  const baseTokens = baseline.totalTokensIn + baseline.totalTokensOut + baseline.totalCacheReadTokens + baseline.totalCacheCreationTokens;
  const teamTokens = teamagent.totalTokensIn + teamagent.totalTokensOut + teamagent.totalCacheReadTokens + teamagent.totalCacheCreationTokens;
  const expectedTokenDelta = baseTokens > 0 ? (teamTokens - baseTokens) / baseTokens : 0;
  assert(closeEnough(report.comparison.tokenDeltaPercent, expectedTokenDelta), "comparison.tokenDeltaPercent mismatch");

  const expectedDurationDelta = baseline.avgDurationMs > 0 ? (teamagent.avgDurationMs - baseline.avgDurationMs) / baseline.avgDurationMs : 0;
  assert(closeEnough(report.comparison.durationDeltaPercent, expectedDurationDelta), "comparison.durationDeltaPercent mismatch");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  groups: (report.groups || []).map((g) => g.group),
  rawResults: (report.rawResults || []).length,
  verdicts: Array.from(new Set((report.rawResults || []).map((r) => r.verdict))),
  comparison: report.comparison
}, null, 2));
`;
}

function sourceRouteCheckScript(repoRoot: string): string {
  return String.raw`
const fs = require("node:fs");
const path = require("node:path");
const repo = ${JSON.stringify(repoRoot)};
const errors = [];
function assert(cond, msg) { if (!cond) errors.push(msg); }

const rootPkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
const benchPkg = JSON.parse(fs.readFileSync(path.join(repo, "packages/benchmark/package.json"), "utf8"));
const bin = fs.readFileSync(path.join(repo, "packages/benchmark/src/bin.ts"), "utf8");

assert(rootPkg.scripts && rootPkg.scripts.benchmark === "pnpm --filter @teamagent/benchmark bench", "root package.json benchmark script must route to @teamagent/benchmark bench");
assert(benchPkg.scripts && benchPkg.scripts.bench === "tsx src/bin.ts", "@teamagent/benchmark bench script must execute src/bin.ts");
for (const marker of [
  "loadTasks(tasksGlob)",
  "createGroupWorkdir(groupCfg, hookDir)",
  "new ClaudeSdkRunner()",
  "runTask(task, groupCfg, sdk, workdir, run)",
  "aggregate(allResults, config)",
  "writeJson(report, config.outputJson)",
  "writeMarkdown(report, config.outputMarkdown)"
]) {
  assert(bin.includes(marker), "bin.ts missing expected call-chain marker: " + marker);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, route: rootPkg.scripts.benchmark, bench: benchPkg.scripts.bench }, null, 2));
`;
}

function smokeExpectationScript(mode: "baseline" | "teamagent"): string {
  const expectedGroups = mode === "teamagent" ? ["baseline", "teamagent"] : ["baseline"];
  const expectedRows = expectedGroups.length;
  return String.raw`
const fs = require("node:fs");
const reportPath = process.argv[1];
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const errors = [];
const expectedGroups = ${JSON.stringify(expectedGroups)};
const expectedRows = ${String(expectedRows)};
const verdicts = new Set(["correct", "wrong", "neither", "error"]);
function assert(cond, msg) { if (!cond) errors.push(msg); }
assert(JSON.stringify(report.config.groups) === JSON.stringify(expectedGroups), "config.groups mismatch");
assert(report.config.tasks === "001", "config.tasks mismatch");
assert(report.config.runs === 1, "config.runs mismatch");
assert(Array.isArray(report.rawResults) && report.rawResults.length === expectedRows, "rawResults length mismatch");
for (const r of report.rawResults || []) {
  assert(expectedGroups.includes(r.group), "unexpected group " + r.group);
  assert(r.taskId === "001-moment-vs-dayjs", "unexpected taskId " + r.taskId);
  assert(r.run === 1, "unexpected run " + r.run);
  assert(verdicts.has(r.verdict), "invalid verdict " + r.verdict);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  mode: ${JSON.stringify(mode)},
  verdictByGroup: Object.fromEntries((report.rawResults || []).map((r) => [r.group, r.verdict])),
  comparison: report.comparison
}, null, 2));
`;
}

function syntheticReport(): unknown {
  return {
    generatedAt: "2026-04-28T00:00:00.000Z",
    config: {
      groups: ["baseline", "teamagent"],
      tasks: "001",
      runs: 1,
      outputJson: "bench-report.json",
      outputMarkdown: "bench-report.md",
    },
    groups: [
      {
        group: "baseline",
        wrongCount: 1,
        correctCount: 0,
        neitherCount: 0,
        errorCount: 0,
        totalTokensIn: 10,
        totalTokensOut: 20,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        avgDurationMs: 1000,
      },
      {
        group: "teamagent",
        wrongCount: 0,
        correctCount: 1,
        neitherCount: 0,
        errorCount: 0,
        totalTokensIn: 15,
        totalTokensOut: 25,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        avgDurationMs: 1500,
      },
    ],
    comparison: {
      prr: 1,
      tokenDeltaPercent: 1 / 3,
      durationDeltaPercent: 0.5,
    },
    rawResults: [
      {
        group: "baseline",
        taskId: "001-moment-vs-dayjs",
        run: 1,
        verdict: "wrong",
        tokensIn: 10,
        tokensOut: 20,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs: 1000,
        output: "import moment from 'moment'",
      },
      {
        group: "teamagent",
        taskId: "001-moment-vs-dayjs",
        run: 1,
        verdict: "correct",
        tokensIn: 15,
        tokensOut: 25,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        durationMs: 1500,
        output: "import dayjs from 'dayjs'",
      },
    ],
  };
}

function runOptionalSmoke(ctx: AuditContext, artifacts: Record<string, string>): string {
  const requested = process.env["TEAMAGENT_AUDIT_BENCH_SMOKE"];
  if (!requested) {
    const note = "Skipped by default. Set TEAMAGENT_AUDIT_BENCH_SMOKE=baseline or TEAMAGENT_AUDIT_BENCH_SMOKE=teamagent to run a real Claude SDK smoke.";
    artifacts["optional-smoke-note"] = rel(ctx, writeArtifact(ctx, "optional-smoke-note.txt", note + "\n"));
    return note;
  }

  const mode = requested === "teamagent" ? "teamagent" : "baseline";
  const smokeDir = path.join(ctx.outDir, `smoke-${mode}`);
  mkdirSync(smokeDir, { recursive: true });
  const outputJson = path.join(smokeDir, "bench-report.json");
  const outputMd = path.join(smokeDir, "bench-report.md");
  const groups = mode === "teamagent" ? "baseline,teamagent" : "baseline";

  const command = [
    "pnpm",
    "--dir",
    ctx.repoRoot,
    "benchmark",
    "--",
    `--groups=${groups}`,
    "--tasks=001",
    "--runs=1",
    `--output-json=${outputJson}`,
    `--output-md=${outputMd}`,
  ];

  const smoke = runCommand(ctx, `optional-real-smoke-${mode}`, command, {
    allowFailure: true,
    timeoutMs: 240_000,
    env: {
      BENCH_NO_COLOR: "1",
      BENCH_QUIET: "1",
    },
  });
  artifacts[`optional-smoke-${mode}-stdout`] = rel(ctx, smoke.stdoutPath);
  artifacts[`optional-smoke-${mode}-stderr`] = rel(ctx, smoke.stderrPath);
  artifacts[`optional-smoke-${mode}-json`] = rel(ctx, outputJson);
  artifacts[`optional-smoke-${mode}-markdown`] = rel(ctx, outputMd);

  if (!existsSync(outputJson)) {
    const stderr = readText(smoke.stderrPath).trim();
    return `Optional smoke requested (${mode}) but no report was produced; exit=${String(smoke.exitCode)}; stderr=${stderr.slice(0, 500)}`;
  }

  const shape = runCommand(ctx, `optional-real-smoke-${mode}-shape`, ["node", "-e", smokeExpectationScript(mode), outputJson], {
    allowFailure: true,
    timeoutMs: 30_000,
  });
  const aggregate = runCommand(ctx, `optional-real-smoke-${mode}-external-report-check`, ["node", "-e", reportCheckerScript(), outputJson], {
    allowFailure: true,
    timeoutMs: 30_000,
  });
  artifacts[`optional-smoke-${mode}-shape-stdout`] = rel(ctx, shape.stdoutPath);
  artifacts[`optional-smoke-${mode}-report-check-stdout`] = rel(ctx, aggregate.stdoutPath);
  const reportOk = shape.exitCode === 0 && aggregate.exitCode === 0;
  return `Optional smoke requested (${mode}); command exit=${String(smoke.exitCode)}, report=${reportOk ? "valid" : "invalid"}. This note is not part of the default offline gate.`;
}

const ctx = createAuditContext("feature-13", "benchmark");
const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
const artifacts: Record<string, string> = {};

try {
  const schema = runCommand(ctx, "offline-schema-check-fixtures", ["node", "-e", schemaCheckScript(ctx.repoRoot)], {
    allowFailure: true,
    timeoutMs: 30_000,
  });
  checks.push(check("offline schema-check validates task JSON and group settings templates", schema.exitCode === 0, readText(schema.stdoutPath).trim() || readText(schema.stderrPath).trim()));
  artifacts["schema-check-stdout"] = rel(ctx, schema.stdoutPath);
  artifacts["schema-check-stderr"] = rel(ctx, schema.stderrPath);

  const evaluator = runCommand(ctx, "offline-evaluator-pattern-semantics", ["node", "-e", evaluatorCheckScript(ctx.repoRoot)], {
    allowFailure: true,
    timeoutMs: 30_000,
  });
  checks.push(check("offline evaluator semantics validates wrong/correct patterns and wrong priority", evaluator.exitCode === 0, readText(evaluator.stdoutPath).trim() || readText(evaluator.stderrPath).trim()));
  artifacts["evaluator-check-stdout"] = rel(ctx, evaluator.stdoutPath);
  artifacts["evaluator-check-stderr"] = rel(ctx, evaluator.stderrPath);

  const reportPath = writeJson(ctx, "bench-report.synthetic.json", syntheticReport());
  artifacts["synthetic-report"] = rel(ctx, reportPath);
  const report = runCommand(ctx, "offline-synthetic-report-contract", ["node", "-e", reportCheckerScript(), reportPath], {
    allowFailure: true,
    timeoutMs: 30_000,
  });
  checks.push(check("offline report checker validates groups/comparison/rawResults from synthetic report", report.exitCode === 0, readText(report.stdoutPath).trim() || readText(report.stderrPath).trim()));
  artifacts["synthetic-report-check-stdout"] = rel(ctx, report.stdoutPath);
  artifacts["synthetic-report-check-stderr"] = rel(ctx, report.stderrPath);

  const route = runCommand(ctx, "offline-source-route-check", ["node", "-e", sourceRouteCheckScript(ctx.repoRoot)], {
    allowFailure: true,
    timeoutMs: 30_000,
  });
  checks.push(check("offline source route check sees pnpm benchmark and bin/report call-chain", route.exitCode === 0, readText(route.stdoutPath).trim() || readText(route.stderrPath).trim()));
  artifacts["source-route-check-stdout"] = rel(ctx, route.stdoutPath);
  artifacts["source-route-check-stderr"] = rel(ctx, route.stderrPath);

  const smokeNote = runOptionalSmoke(ctx, artifacts);
  checks.push(check("real Claude SDK benchmark smoke is optional and not run by default", true, smokeNote));

  const hardChecks = checks.filter((item) => !item.name.startsWith("real Claude SDK benchmark smoke"));
  const ok = hardChecks.every((item) => item.ok);
  finalize(ctx, {
    feature: FEATURE,
    status: ok ? "passed" : "failed",
    summary: ok
      ? "通过：默认硬判定完全离线，外部 Node 检查验证了 benchmark task fixtures、group settings templates、wrong/correct pattern 判定语义、synthetic bench-report 的 groups/comparison/rawResults 聚合契约，以及根 benchmark 脚本到 @teamagent/benchmark bin/reporter 的路由。真实 Claude SDK benchmark 仅作为可选 smoke note，默认未运行。"
      : "失败：默认离线硬判定至少一项未通过；真实 Claude SDK benchmark 不参与默认通过判定。详见 audit/out 下 stdout/stderr 与 decision。",
    checks,
    artifacts,
  });
} catch (error) {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  checks.push(check("runner exception", false, detail));
  finalize(ctx, {
    feature: FEATURE,
    status: "failed",
    summary: "失败：benchmark audit runner 执行过程中抛出异常；decision 已记录异常和已产生证据。",
    checks,
    artifacts,
  });
} finally {
  cleanupTemp(ctx);
}
