/**
 * Batch smoke tests for Claude Code stream-json output through `claudefast`.
 *
 * Usage:
 *   pnpm smoke:claudefast
 *   pnpm smoke:claudefast -- --concurrency=8 --timeout-ms=180000
 *   pnpm smoke:claudefast -- --dry-run
 *
 * The script intentionally starts every run from the repository root so Claude
 * Code loads this project's CLAUDE.md and .claude/settings.local.json hooks.
 * Each case writes only into scripts/out/claudefast-stream-json/<run-id>/.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ExpectationKind =
  | "stream-json"
  | "partial-messages"
  | "final-result"
  | "session-start-hook"
  | "user-prompt-submit-hook"
  | "pre-tool-use-hook"
  | "post-tool-use-hook"
  | "stop-hook"
  | "tool-use"
  | "teamagent-reason"
  | "permission-deny"
  | "claudefast-context"
  | "schema-output";

interface TestCase {
  id: string;
  feature: string;
  prompt: (ctx: CaseContext) => string;
  extraArgs?: string[];
  expectations: ExpectationKind[];
  optionalExpectations?: ExpectationKind[];
}

interface CaseContext {
  runDir: string;
  caseDir: string;
  caseId: string;
}

interface Options {
  bin: string;
  concurrency: number;
  timeoutMs: number;
  outDir: string;
  dryRun: boolean;
  only: Set<string> | null;
  streamJsonArgs: string[];
  hookDebugSupported: boolean;
  hookEvidenceMode: "debug-file" | "unsupported";
  preferLocalBinForBrokenPnpmStub: boolean;
}

interface ParsedStream {
  jsonEvents: unknown[];
  invalidLines: string[];
  rawText: string;
  eventTypes: Record<string, number>;
  hookNames: string[];
  hookResponses: HookResponseSummary[];
}

interface HookResponseSummary {
  hook: string;
  hookName: string;
  outcome: string | null;
  exitCode: number | null;
  stderrFirstLine: string;
}

interface CaseResult {
  id: string;
  feature: string;
  status: "passed" | "failed" | "unsupported";
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  summaryPath: string;
  passed: ExpectationKind[];
  failed: ExpectationKind[];
  unsupported: ExpectationKind[];
  optionalMissing: ExpectationKind[];
  hookCoverage: "stream-json" | "debug-file" | "unsupported";
  hookDebugPath?: string;
  error?: string;
}

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_OUT_ROOT = path.join(REPO_ROOT, "scripts", "out", "claudefast-stream-json");
const PROJECT_DB_PATH = path.join(REPO_ROOT, ".teamagent", "knowledge.db");
const FIXTURE_BLOCK_RULE_ID = "teamagent-test-claudefast-block-deny";
const FIXTURE_BLOCK_MARKER = "claudefast_batch_insert_deny";
const require = createRequire(import.meta.url);

const BASE_ARGS_PREFIX = ["-p"];
const BASE_ARGS_SUFFIX = ["--permission-mode", "acceptEdits", "--no-session-persistence"];

const JSON_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    ok: { type: "boolean" },
    tool: { type: "string" },
  },
  required: ["ok", "tool"],
  additionalProperties: false,
});

const CASES: TestCase[] = [
  {
    id: "context-claudefast-docs",
    feature: "CLAUDE.md / docs context loading",
    prompt: () =>
      "用中文回答：在这个项目里 claudefast 是什么？在这台机器上 claudefast 是什么？不要展示任何 token 片段。",
    expectations: [
      "stream-json",
      "final-result",
      "partial-messages",
      "user-prompt-submit-hook",
      "stop-hook",
      "claudefast-context",
    ],
    optionalExpectations: ["session-start-hook"],
  },
  {
    id: "schema-output",
    feature: "--json-schema structured final output",
    extraArgs: ["--json-schema", JSON_SCHEMA],
    prompt: () => 'Return exactly this JSON meaning, no markdown: {"ok":true,"tool":"claudefast"}',
    expectations: ["stream-json", "final-result", "schema-output", "user-prompt-submit-hook"],
    optionalExpectations: ["stop-hook", "partial-messages"],
  },
  {
    id: "read-tool-events",
    feature: "tool_use / tool_result stream events",
    prompt: () =>
      "Read docs/CLAUDEFAST.md, then summarize the first heading in one Chinese sentence.",
    expectations: ["stream-json", "final-result", "tool-use", "user-prompt-submit-hook"],
    optionalExpectations: ["stop-hook", "partial-messages"],
  },
  {
    id: "bash-pre-post-hooks",
    feature: "Bash PreToolUse + PostToolUse hooks",
    prompt: () =>
      "Run this shell command exactly once, then summarize the output: printf 'teamagent-stream-json-ok\\n'",
    expectations: [
      "stream-json",
      "final-result",
      "tool-use",
      "pre-tool-use-hook",
      "post-tool-use-hook",
      "user-prompt-submit-hook",
    ],
    optionalExpectations: ["stop-hook", "partial-messages"],
  },
  {
    id: "write-axios-warning",
    feature: "PreToolUse rule warning via Write content",
    prompt: ({ caseDir }) => {
      const target = path.join(caseDir, "axios-warning.ts");
      return [
        `Create the file ${target}.`,
        "The file should export a TypeScript async function getJson(url: string).",
        "Use axios in the implementation so TeamAgent can evaluate the project rule.",
      ].join(" ");
    },
    expectations: [
      "stream-json",
      "final-result",
      "tool-use",
      "pre-tool-use-hook",
      "teamagent-reason",
      "user-prompt-submit-hook",
    ],
    optionalExpectations: ["post-tool-use-hook", "stop-hook", "partial-messages"],
  },
  {
    id: "write-console-log-warning",
    feature: "PreToolUse rule warning for hook stdout hazards",
    prompt: ({ caseDir }) => {
      const target = path.join(caseDir, "hook-debug-warning.ts");
      return [
        `Create the file ${target}.`,
        "Pretend it is a Claude Code hook entrypoint.",
        "Include a console.log call for debugging so TeamAgent can evaluate the hook protocol rule.",
      ].join(" ");
    },
    expectations: [
      "stream-json",
      "final-result",
      "tool-use",
      "pre-tool-use-hook",
      "teamagent-reason",
      "user-prompt-submit-hook",
    ],
    optionalExpectations: ["post-tool-use-hook", "stop-hook", "partial-messages"],
  },
  {
    id: "write-batch-insert-deny",
    feature: "PreToolUse block / deny rule",
    prompt: ({ caseDir }) => {
      const target = path.join(caseDir, "batch-insert-deny.ts");
      return [
        `Create the file ${target}.`,
        "It should export async function saveUsers(db: any, users: any[]).",
        "Implement it using a for loop that calls insert once per user inside the loop.",
        `Also include this exact runtime marker as a const inside the file: const ${FIXTURE_BLOCK_MARKER} = true.`,
        "Do not use batch insert.",
      ].join(" ");
    },
    expectations: [
      "stream-json",
      "tool-use",
      "pre-tool-use-hook",
      "teamagent-reason",
      "permission-deny",
      "user-prompt-submit-hook",
    ],
    optionalExpectations: ["final-result", "stop-hook", "partial-messages"],
  },
  {
    id: "webfetch-pre-post-hooks",
    feature: "WebFetch PreToolUse + PostToolUse hooks",
    prompt: () =>
      "Use WebFetch to fetch https://example.com and answer with the page title or a one sentence summary.",
    expectations: ["stream-json", "final-result", "tool-use", "pre-tool-use-hook", "user-prompt-submit-hook"],
    optionalExpectations: ["post-tool-use-hook", "stop-hook", "partial-messages"],
  },
  {
    id: "edit-pre-post-hooks",
    feature: "Edit PreToolUse + PostToolUse hooks",
    prompt: ({ caseDir }) => {
      const target = path.join(caseDir, "edit-target.txt");
      return [
        `First create ${target} with the text "before".`,
        'Then edit that same file so it contains exactly "after".',
      ].join(" ");
    },
    expectations: [
      "stream-json",
      "final-result",
      "tool-use",
      "pre-tool-use-hook",
      "post-tool-use-hook",
      "user-prompt-submit-hook",
    ],
    optionalExpectations: ["stop-hook", "partial-messages"],
  },
];

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    bin: process.env["CLAUDEFAST_BIN"] ?? "claudefast",
    concurrency: 8,
    timeoutMs: 240_000,
    outDir: DEFAULT_OUT_ROOT,
    dryRun: false,
    only: null,
    streamJsonArgs: ["--output-format", "stream-json"],
    hookDebugSupported: false,
    hookEvidenceMode: "unsupported",
    preferLocalBinForBrokenPnpmStub: false,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg.startsWith("--bin=")) {
      opts.bin = arg.slice("--bin=".length);
    } else if (arg.startsWith("--concurrency=")) {
      opts.concurrency = positiveInt(arg, "--concurrency");
    } else if (arg.startsWith("--batch-size=")) {
      opts.concurrency = positiveInt(arg, "--batch-size");
    } else if (arg.startsWith("--timeout-ms=")) {
      opts.timeoutMs = positiveInt(arg, "--timeout-ms");
    } else if (arg.startsWith("--out=")) {
      opts.outDir = path.resolve(arg.slice("--out=".length));
    } else if (arg.startsWith("--case=")) {
      opts.only = new Set(arg.slice("--case=".length).split(",").map((s) => s.trim()).filter(Boolean));
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function positiveInt(arg: string, name: string): number {
  const raw = arg.slice(name.length + 1);
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${raw}`);
  }
  return n;
}

function printHelp(): void {
  console.log([
    "Usage: pnpm smoke:claudefast -- [options]",
    "",
    "Options:",
    "  --concurrency=N     Parallel claudefast processes (default: 8)",
    "  --batch-size=N      Alias for --concurrency",
    "  --timeout-ms=N      Per-case timeout (default: 240000)",
    "  --bin=PATH          claudefast binary/wrapper (default: claudefast)",
    "  --out=DIR           Output directory (default: scripts/out/claudefast-stream-json)",
    "  --case=a,b          Run only selected case ids",
    "  --dry-run           Print commands without running them",
  ].join("\n"));
}

function claudefastEnv(preferLocalBin = false): NodeJS.ProcessEnv {
  const useLocalClaudefast = preferLocalBin && localClaudefastBin() !== null;
  return {
    ...process.env,
    PATH: claudefastPath(process.env.PATH ?? "", osHome(), preferLocalBin, useLocalClaudefast),
  };
}

function claudefastPath(
  originalPath: string,
  home: string,
  preferLocalBin = false,
  omitBrokenClaudePnpmStubs = false,
): string {
  let entries = originalPath.split(path.delimiter).filter(Boolean);
  if (omitBrokenClaudePnpmStubs) {
    entries = entries.filter((entry) => !isClaudeCodePnpmStubEntry(entry));
  }
  const localBin = home ? path.join(home, ".local", "bin") : "";
  if (localBin && preferLocalBin) {
    return [localBin, ...entries.filter((entry) => entry !== localBin)].join(path.delimiter);
  }
  if (localBin && !entries.includes(localBin)) {
    entries.push(localBin);
  }
  return entries.join(path.delimiter);
}

function osHome(): string {
  return process.env.HOME || process.env.USERPROFILE || "";
}

function localClaudefastBin(): string | null {
  const home = osHome();
  if (!home) return null;
  const candidate = path.join(home, ".local", "bin", "claudefast");
  return existsSync(candidate) ? candidate : null;
}

function isClaudeCodePnpmStubEntry(entry: string): boolean {
  const candidate = path.join(entry, "claude");
  if (!existsSync(candidate)) return false;
  try {
    const content = readFileSync(candidate, "utf-8");
    return content.includes("@anthropic-ai/claude-code") && content.includes("bin/claude.exe");
  } catch {
    return false;
  }
}

function runEnvSelfTest(): void {
  const home = path.join(path.sep, "tmp", "teamagent-claudefast-home");
  const projectBin = path.join(REPO_ROOT, "node_modules", ".bin");
  const nestedProjectBin = path.join(REPO_ROOT, "packages", "cli", "node_modules", ".bin");
  const systemBin = path.join(path.sep, "usr", "bin");
  const originalPath = [projectBin, nestedProjectBin, systemBin].join(path.delimiter);
  const actual = claudefastPath(originalPath, home).split(path.delimiter);

  assertEqual(actual[0], projectBin, "keeps leading project node_modules/.bin entry");
  assertEqual(actual[1], nestedProjectBin, "keeps nested node_modules/.bin entry");
  assertEqual(actual[2], systemBin, "keeps original PATH order");
  assertEqual(actual[3], path.join(home, ".local", "bin"), "adds local bin as fallback only");
  assertEqual(actual.length, 4, "does not add extra PATH entries");

  const fallback = claudefastPath(originalPath, home, true).split(path.delimiter);
  assertEqual(fallback[0], path.join(home, ".local", "bin"), "narrow fallback can prefer local bin");
  assertEqual(fallback[1], projectBin, "narrow fallback preserves project node_modules/.bin");
  assertEqual(shouldRetryWithLocalBin("claudefast", "Error: claude native binary not installed."), true, "detects broken pnpm stub");
  assertEqual(shouldRetryWithLocalBin("claude", "Error: claude native binary not installed."), false, "does not retry unrelated bins");

  console.log("claudefast env self-test passed");
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function main(): Promise<number> {
  if (process.argv.slice(2).includes("--self-test-env")) {
    runEnvSelfTest();
    return 0;
  }

  const opts = parseArgs(process.argv.slice(2));
  const selected = opts.only ? CASES.filter((c) => opts.only?.has(c.id)) : CASES;
  if (selected.length === 0) {
    throw new Error("No cases selected");
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(opts.outDir, runId);
  mkdirSync(runDir, { recursive: true });
  const capabilities = await detectClaudefastCapabilities(opts.bin, runDir);
  opts.streamJsonArgs = capabilities.streamJsonArgs;
  opts.hookDebugSupported = capabilities.hookDebugSupported;
  opts.hookEvidenceMode = capabilities.hookEvidenceMode;
  opts.preferLocalBinForBrokenPnpmStub = capabilities.preferLocalBinForBrokenPnpmStub;

  console.log("🧪 TeamAgent claudefast stream-json test pool");
  console.log(`  cases:       ${selected.length}`);
  console.log(`  concurrency: ${opts.concurrency}`);
  console.log(`  bin:         ${opts.bin}`);
  console.log(`  out:         ${runDir}`);
  console.log(`  timeout:     ${opts.timeoutMs}ms`);
  console.log(`  flags:       ${opts.streamJsonArgs.join(" ")}`);
  console.log(`  hook mode:   ${opts.hookEvidenceMode}`);
  console.log("");

  let fixtureInstalled = false;
  try {
    if (!opts.dryRun) {
      installFixtureRules();
      fixtureInstalled = true;
    }

    const results = await runPool(selected, opts, runDir);
    const reportPath = path.join(runDir, "report.json");
    const report = buildReport(results);
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");

    renderReport(results, reportPath);
    return results.every((r) => r.ok) ? 0 : 1;
  } finally {
    if (fixtureInstalled) cleanupFixtureRules();
  }
}

function installFixtureRules(): void {
  if (!existsSync(PROJECT_DB_PATH)) {
    throw new Error(`Missing ${PROJECT_DB_PATH}. Run teamagent init before claudefast hook tests.`);
  }

  const db = openSqlite(PROJECT_DB_PATH);
  const now = new Date().toISOString();
  try {
    deleteFixtureRules(db);
    db.prepare(`
      INSERT INTO knowledge (
        id, scope_level, scope_file_types,
        category, tags, type, nature, trigger, wrong_pattern, correct_pattern,
        reasoning, confidence, current_tier, max_tier_ever, tier_entered_at,
        enforcement, status, hit_count, success_count, override_count,
        evidence, source, conflict_with, created_at, last_validated_at, channel
      ) VALUES (
        @id, 'personal', @scope_file_types,
        'C', @tags, 'avoidance', 'objective', @trigger, @wrong_pattern, @correct_pattern,
        @reasoning, 1.0, 'enforced', 'enforced', @now,
        'block', 'active', 0, 0, 0,
        @evidence, 'accumulated', @conflict_with, @now, @now, 'tool-action'
      )
    `).run({
      id: FIXTURE_BLOCK_RULE_ID,
      scope_file_types: JSON.stringify(["*.ts"]),
      tags: JSON.stringify(["claudefast-test", "block"]),
      trigger: "claudefast stream-json block fixture",
      wrong_pattern: FIXTURE_BLOCK_MARKER,
      correct_pattern: "Remove the fixture marker and use batch insert in real code.",
      reasoning: "This temporary rule verifies that PreToolUse can return permissionDecision=deny in stream-json tests.",
      evidence: JSON.stringify({ success_sessions: 0, success_users: 0, correction_sessions: 1 }),
      conflict_with: JSON.stringify([]),
      now,
    });
  } finally {
    db.close();
  }
}

function cleanupFixtureRules(): void {
  if (!existsSync(PROJECT_DB_PATH)) return;
  const db = openSqlite(PROJECT_DB_PATH);
  try {
    deleteFixtureRules(db);
  } finally {
    db.close();
  }
}

function deleteFixtureRules(db: any): void {
  db.prepare("DELETE FROM knowledge WHERE id = ?").run(FIXTURE_BLOCK_RULE_ID);
  try {
    db.prepare("DELETE FROM knowledge_fts WHERE id = ?").run(FIXTURE_BLOCK_RULE_ID);
  } catch {
    // FTS5 may be unavailable.
  }
}

function openSqlite(dbPath: string): any {
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => any };
  return new DatabaseSync(dbPath);
}

async function runPool(cases: TestCase[], opts: Options, runDir: string): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  let nextIndex = 0;

  async function worker(workerId: number): Promise<void> {
    while (nextIndex < cases.length) {
      const index = nextIndex++;
      const testCase = cases[index];
      if (!testCase) return;
      console.log(`[w${workerId}] start ${testCase.id}`);
      const result = await runCase(testCase, opts, runDir);
      results[index] = result;
      const marker = result.ok ? "PASS" : "FAIL";
      console.log(`[w${workerId}] ${marker} ${testCase.id} (${result.durationMs}ms)`);
    }
  }

  const workerCount = Math.min(opts.concurrency, cases.length);
  await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)));
  return results.filter(Boolean);
}

async function runCase(testCase: TestCase, opts: Options, runDir: string): Promise<CaseResult> {
  const caseDir = path.join(runDir, testCase.id);
  mkdirSync(caseDir, { recursive: true });

  const ctx: CaseContext = { runDir, caseDir, caseId: testCase.id };
  const prompt = testCase.prompt(ctx);
  const sessionId = randomUUID();
  const hookDebugPath = opts.hookDebugSupported ? path.join(caseDir, "hooks.debug.log") : null;
  const hookDebugArgs = hookDebugPath ? ["--debug", "hooks", "--debug-file", hookDebugPath] : [];
  const args = [
    ...BASE_ARGS_PREFIX,
    ...opts.streamJsonArgs,
    ...hookDebugArgs,
    ...BASE_ARGS_SUFFIX,
    "--session-id",
    sessionId,
    ...(testCase.extraArgs ?? []),
    prompt,
  ];

  const stdoutPath = path.join(caseDir, "stdout.jsonl");
  const stderrPath = path.join(caseDir, "stderr.log");
  const commandPath = path.join(caseDir, "command.json");
  const summaryPath = path.join(caseDir, "summary.json");
  writeFileSync(commandPath, JSON.stringify({ bin: opts.bin, args, cwd: REPO_ROOT }, null, 2) + "\n", "utf-8");
  const unsupported = unsupportedHookExpectations(testCase, opts);

  if (unsupported.length > 0) {
    const result: CaseResult = {
      id: testCase.id,
      feature: testCase.feature,
      status: "unsupported",
      ok: false,
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      stdoutPath,
      stderrPath,
      summaryPath,
      passed: [],
      failed: [],
      unsupported,
      optionalMissing: testCase.optionalExpectations ?? [],
      hookCoverage: hookCoverage(opts),
      error: unsupportedHookEvidenceMessage(opts.bin),
    };
    writeFileSync(stdoutPath, "", "utf-8");
    writeFileSync(stderrPath, "", "utf-8");
    writeFileSync(summaryPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
    return result;
  }

  if (opts.dryRun) {
    const passed = testCase.expectations;
    const summary: CaseResult = {
      id: testCase.id,
      feature: testCase.feature,
      status: "passed",
      ok: true,
      exitCode: 0,
      timedOut: false,
      durationMs: 0,
      stdoutPath,
      stderrPath,
      summaryPath,
      passed,
      failed: [],
      unsupported: [],
      optionalMissing: [],
      hookCoverage: hookCoverage(opts),
      ...(hookDebugPath ? { hookDebugPath } : {}),
    };
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf-8");
    return summary;
  }

  const started = Date.now();
  try {
    const proc = await spawnCollect(opts.bin, args, opts.timeoutMs, {
      preferLocalBin: opts.preferLocalBinForBrokenPnpmStub,
    });
    const durationMs = Date.now() - started;
    writeFileSync(stdoutPath, proc.stdout, "utf-8");
    writeFileSync(stderrPath, proc.stderr, "utf-8");

    const parsed = parseStream(proc.stdout);
    const hookDebugText = hookDebugPath && existsSync(hookDebugPath) ? readFileSync(hookDebugPath, "utf-8") : "";
    const passed: ExpectationKind[] = [];
    const failed: ExpectationKind[] = [];
    const optionalMissing: ExpectationKind[] = [];

    const requiredExpectations = effectiveRequiredExpectations(testCase, opts);
    const optionalExpectations = effectiveOptionalExpectations(testCase, opts);

    for (const expectation of requiredExpectations) {
      if (checkExpectation(expectation, parsed, hookDebugText)) {
        passed.push(expectation);
      } else {
        failed.push(expectation);
      }
    }

    for (const expectation of optionalExpectations) {
      if (checkExpectation(expectation, parsed, hookDebugText)) {
        passed.push(expectation);
      } else {
        optionalMissing.push(expectation);
      }
    }

    const result: CaseResult = {
      id: testCase.id,
      feature: testCase.feature,
      status: proc.exitCode === 0 && failed.length === 0 ? "passed" : "failed",
      ok: proc.exitCode === 0 && failed.length === 0,
      exitCode: proc.exitCode,
      timedOut: proc.timedOut,
      durationMs,
      stdoutPath,
      stderrPath,
      summaryPath,
      passed,
      failed,
      unsupported: [],
      optionalMissing,
      hookCoverage: hookCoverage(opts),
      ...(hookDebugPath ? { hookDebugPath } : {}),
      ...(proc.exitCode === 0 ? {} : { error: claudefastFailureMessage(opts.bin, proc.exitCode) }),
    };
    writeFileSync(summaryPath, JSON.stringify({ ...result, parsed: summarizeParsed(parsed) }, null, 2) + "\n", "utf-8");
    return result;
  } catch (err) {
    const durationMs = Date.now() - started;
    const result: CaseResult = {
      id: testCase.id,
      feature: testCase.feature,
      status: "failed",
      ok: false,
      exitCode: null,
      timedOut: String(err).includes("TIMEOUT"),
      durationMs,
      stdoutPath,
      stderrPath,
      summaryPath,
      passed: [],
      failed: effectiveRequiredExpectations(testCase, opts),
      unsupported: [],
      optionalMissing: effectiveOptionalExpectations(testCase, opts),
      hookCoverage: hookCoverage(opts),
      ...(hookDebugPath ? { hookDebugPath } : {}),
      error: `${String(err)}. ${claudefastPromptHint(opts.bin)}`,
    };
    writeFileSync(summaryPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
    return result;
  }
}

async function detectClaudefastCapabilities(bin: string, runDir: string): Promise<{
  streamJsonArgs: string[];
  hookDebugSupported: boolean;
  hookEvidenceMode: "debug-file" | "unsupported";
  preferLocalBinForBrokenPnpmStub: boolean;
}> {
  let preferLocalBinForBrokenPnpmStub = false;
  let proc = await spawnCollect(bin, ["-h"], 30_000);
  if (proc.exitCode !== 0 && shouldRetryWithLocalBin(bin, proc.stderr)) {
    const retry = await spawnCollect(bin, ["-h"], 30_000, { preferLocalBin: true });
    if (retry.exitCode === 0) {
      proc = retry;
      preferLocalBinForBrokenPnpmStub = true;
    }
  }
  writeFileSync(path.join(runDir, "claudefast-help.stdout.log"), proc.stdout, "utf-8");
  writeFileSync(path.join(runDir, "claudefast-help.stderr.log"), proc.stderr, "utf-8");
  if (proc.exitCode !== 0) {
    throw new Error(`${bin} -h exited ${proc.exitCode}`);
  }
  const help = `${proc.stdout}\n${proc.stderr}`;
  if (!help.includes("--output-format") || !help.includes("stream-json")) {
    throw new Error(`${bin} -h did not advertise --output-format stream-json`);
  }
  const streamJsonArgs = ["--output-format", "stream-json"];
  const hookDebugSupported = help.includes("--debug") && help.includes("--debug-file");
  if (help.includes("--include-partial-messages")) streamJsonArgs.push("--include-partial-messages");
  if (help.includes("--verbose")) streamJsonArgs.push("--verbose");
  const hookEvidenceMode = hookDebugSupported ? "debug-file" : "unsupported";
  writeFileSync(path.join(runDir, "claudefast-stream-json-flags.json"), JSON.stringify({
    streamJsonArgs,
    includeHookEventsSkipped: true,
    includeHookEventsUsed: false,
    hookDebugSupported,
    hookEvidenceMode,
    preferLocalBinForBrokenPnpmStub,
  }, null, 2) + "\n", "utf-8");
  return { streamJsonArgs, hookDebugSupported, hookEvidenceMode, preferLocalBinForBrokenPnpmStub };
}

function shouldRetryWithLocalBin(bin: string, stderr: string): boolean {
  return bin === "claudefast" && stderr.includes("claude native binary not installed");
}

function isHookExpectation(expectation: ExpectationKind): boolean {
  return expectation.endsWith("-hook");
}

function hookCoverage(opts: Options): "stream-json" | "debug-file" | "unsupported" {
  return opts.hookEvidenceMode === "debug-file" ? "debug-file" : "unsupported";
}

function unsupportedHookExpectations(testCase: TestCase, opts: Options): ExpectationKind[] {
  if (opts.hookDebugSupported) return [];
  return testCase.expectations.filter(isHookExpectation);
}

function effectiveRequiredExpectations(testCase: TestCase, opts: Options): ExpectationKind[] {
  if (opts.hookDebugSupported) return testCase.expectations;
  return testCase.expectations.filter((expectation) => !isHookExpectation(expectation));
}

function effectiveOptionalExpectations(testCase: TestCase, opts: Options): ExpectationKind[] {
  const optional = [...(testCase.optionalExpectations ?? [])];
  if (!opts.hookDebugSupported) {
    for (const expectation of testCase.expectations) {
      if (isHookExpectation(expectation) && !optional.includes(expectation)) optional.push(expectation);
    }
  }
  return optional;
}

function spawnCollect(
  bin: string,
  args: string[],
  timeoutMs: number,
  opts: { preferLocalBin?: boolean } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const effectiveBin = opts.preferLocalBin && bin === "claudefast" ? (localClaudefastBin() ?? bin) : bin;
    const child = spawn(effectiveBin, args, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: claudefastEnv(opts.preferLocalBin ?? false),
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new Error(`ENOENT: ${bin} not found in PATH`));
      } else {
        reject(err);
      }
    });
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });
  });
}

function parseStream(stdout: string): ParsedStream {
  const jsonEvents: unknown[] = [];
  const invalidLines: string[] = [];
  const eventTypes: Record<string, number> = {};
  const hookNames: string[] = [];
  const hookResponses: HookResponseSummary[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      jsonEvents.push(parsed);
      const eventType = readString(parsed, ["type"]) ?? readString(parsed, ["event", "type"]);
      if (eventType) eventTypes[eventType] = (eventTypes[eventType] ?? 0) + 1;
      const hookResponse = parseHookResponse(parsed);
      if (hookResponse) hookResponses.push(hookResponse);
      for (const hookName of [
        "SessionStart",
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "Stop",
        "SessionEnd",
        "PreCompact",
      ]) {
        if (JSON.stringify(parsed).includes(hookName) && !hookNames.includes(hookName)) {
          hookNames.push(hookName);
        }
      }
    } catch {
      invalidLines.push(trimmed.slice(0, 500));
    }
  }

  return { jsonEvents, invalidLines, rawText: stdout, eventTypes, hookNames, hookResponses };
}

function checkExpectation(expectation: ExpectationKind, parsed: ParsedStream, hookDebugText = ""): boolean {
  const text = parsed.rawText;
  switch (expectation) {
    case "stream-json":
      return parsed.jsonEvents.length > 0 && parsed.invalidLines.length === 0;
    case "partial-messages":
      return includesAny(text, ["content_block_delta", "partial", "delta"]);
    case "final-result":
      return includesAny(text, ['"type":"result"', '"type": "result"', '"subtype":"success"', '"subtype": "success"']);
    case "session-start-hook":
      return hasPassingHook(parsed, "SessionStart", hookDebugText);
    case "user-prompt-submit-hook":
      return hasPassingHook(parsed, "UserPromptSubmit", hookDebugText);
    case "pre-tool-use-hook":
      return hasPassingHook(parsed, "PreToolUse", hookDebugText);
    case "post-tool-use-hook":
      return hasPassingHook(parsed, "PostToolUse", hookDebugText);
    case "stop-hook":
      return hasPassingHook(parsed, "Stop", hookDebugText);
    case "tool-use":
      return includesAny(text, ["tool_use", "tool_result", '"toolUse"', '"toolResult"']);
    case "teamagent-reason":
      return includesAny(text, ["TeamAgent", "teamagent", "permissionDecisionReason", "规则匹配", "hookSpecificOutput"]);
    case "permission-deny":
      return includesAny(text, [
        '"permissionDecision":"deny"',
        '"permissionDecision": "deny"',
        '\\"permissionDecision\\":\\"deny\\"',
        '"permission_denials"',
      ]);
    case "claudefast-context":
      return includesAny(text, ["claudefast", "MiniMax", "stream-json"]);
    case "schema-output":
      return includesAny(text, ['"ok":true', '"ok": true']) && text.includes("claudefast");
  }
}

function parseHookResponse(value: unknown): HookResponseSummary | null {
  if (readString(value, ["type"]) !== "system") return null;
  if (readString(value, ["subtype"]) !== "hook_response") return null;

  const hook =
    readString(value, ["hook_event"]) ??
    normalizeHookName(readString(value, ["hook_name"]) ?? "");
  if (!hook) return null;

  const stderr = readString(value, ["stderr"]) ?? "";
  return {
    hook,
    hookName: readString(value, ["hook_name"]) ?? hook,
    outcome: readString(value, ["outcome"]),
    exitCode: readNumber(value, ["exit_code"]),
    stderrFirstLine: stderr.split(/\r?\n/).find(Boolean) ?? "",
  };
}

function normalizeHookName(hookName: string): string | null {
  const base = hookName.split(":")[0]?.trim();
  return base || null;
}

/**
 * Strong hook evidence comes from the dedicated --debug hooks file, never a
 * casual mention in assistant text.
 */
function hasPassingHook(parsed: ParsedStream, hook: string, hookDebugText = ""): boolean {
  const responses = parsed.hookResponses.filter((r) => r.hook === hook);
  if (responses.length > 0) return responses.every((r) => r.outcome === "success" && r.exitCode === 0);
  return hasHookDebugEvidence(hookDebugText, hook);
}

function hasHookDebugEvidence(hookDebugText: string, hook: string): boolean {
  if (!hookDebugText) return false;
  if (!hookDebugText.includes(hook)) return false;
  return !new RegExp(`${hook}[^\\n]*(failed|error)`, "i").test(hookDebugText);
}

function claudefastPromptHint(bin: string): string {
  return `${bin} -p expects the prompt either as the final argv or on stdin; this harness passes the prompt as the final argv. If a local wrapper consumes argv, pipe the prompt into ${bin} -p or fix the wrapper to preserve argv prompts.`;
}

function unsupportedHookEvidenceMessage(bin: string): string {
  return `${bin} -h did not advertise --debug hooks --debug-file, so required hook evidence is unsupported. This case is non-green instead of treating hook-specific expectations as passed.`;
}

function claudefastFailureMessage(bin: string, code: number | null): string {
  return `${bin} exited ${code}. ${claudefastPromptHint(bin)}`;
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function readString(value: unknown, pathParts: string[]): string | null {
  let cur = value;
  for (const part of pathParts) {
    if (!cur || typeof cur !== "object" || !(part in cur)) return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : null;
}

function readNumber(value: unknown, pathParts: string[]): number | null {
  let cur = value;
  for (const part of pathParts) {
    if (!cur || typeof cur !== "object" || !(part in cur)) return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "number" ? cur : null;
}

function summarizeParsed(parsed: ParsedStream): object {
  return {
    jsonEvents: parsed.jsonEvents.length,
    invalidLines: parsed.invalidLines.length,
    eventTypes: parsed.eventTypes,
    hookNames: parsed.hookNames,
    hookResponses: parsed.hookResponses,
    failedHookResponses: parsed.hookResponses.filter(
      (r) => r.outcome !== "success" || r.exitCode !== 0,
    ),
  };
}

function buildReport(results: CaseResult[]): object {
  const features: Record<string, { passedBy: string[]; failedBy: string[] }> = {};
  for (const result of results) {
    for (const expectation of result.passed) {
      features[expectation] ??= { passedBy: [], failedBy: [] };
      features[expectation].passedBy.push(result.id);
    }
    for (const expectation of result.failed) {
      features[expectation] ??= { passedBy: [], failedBy: [] };
      features[expectation].failedBy.push(result.id);
    }
    for (const expectation of result.unsupported) {
      features[expectation] ??= { passedBy: [], failedBy: [] };
      features[expectation].failedBy.push(result.id);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    unsupported: results.filter((r) => r.status === "unsupported").length,
    features,
    results,
  };
}

function renderReport(results: CaseResult[], reportPath: string): void {
  console.log("");
  console.log("结果:");
  for (const result of results) {
    const marker = result.status === "unsupported" ? "⚠️" : result.ok ? "✅" : "❌";
    console.log(`${marker} ${result.id} — ${result.feature}`);
    if (result.failed.length > 0) {
      console.log(`   missing: ${result.failed.join(", ")}`);
    }
    if (result.unsupported.length > 0) {
      console.log(`   unsupported: ${result.unsupported.join(", ")}`);
    }
    if (result.optionalMissing.length > 0) {
      console.log(`   optional missing: ${result.optionalMissing.join(", ")}`);
    }
    if (result.error) {
      console.log(`   error: ${result.error}`);
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`Report: ${reportPath}`);
  console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`💥 ${String(err)}`);
    process.exit(2);
  });
