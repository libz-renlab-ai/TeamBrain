/**
 * Focused claudefast smoke for TeamAgent rule-card rendering.
 *
 * This is separate from the broad `smoke:claudefast` batch because it needs a
 * deterministic PreToolUse hook. The script creates isolated temporary
 * workspaces and a temporary Claude settings file that points the hook at this
 * checkout's TypeScript source.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DualLayerStore } from "../packages/adapters/src/index";
import type { KnowledgeEntry } from "../packages/types/src/index";

type JsonObject = Record<string, unknown>;

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface ScenarioResult {
  name: string;
  command: string[];
  stdoutPath: string;
  stderrPath: string;
  summaryPath: string;
  jsonEvents: number;
  hookResponses: JsonObject[];
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outRoot = path.join(repoRoot, "scripts", "out", "claudefast-rule-card", timestamp());
let streamJsonArgs = ["--output-format", "stream-json"];
let hookDebugSupported = false;
let hookEvidenceMode: "debug-file" | "unsupported" = "unsupported";

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function rmRetry(p: string): void {
  for (let i = 0; i < 8; i++) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
      return;
    } catch (err: any) {
      if ((err.code === "EBUSY" || err.code === "EPERM") && i < 7) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        continue;
      }
      throw err;
    }
  }
}

function claudefastEnv(): NodeJS.ProcessEnv {
  const originalPath = process.env.PATH ?? "";
  const entries = originalPath
    .split(path.delimiter)
    .filter((entry) => !entry.includes(`${path.sep}node_modules${path.sep}.bin`));
  const localBin = path.join(process.env.HOME || "", ".local", "bin");
  return {
    ...process.env,
    PATH: [localBin, ...entries].filter(Boolean).join(path.delimiter),
  };
}

function runCommand(bin: string, args: string[], opts: {
  cwd?: string;
  timeoutMs?: number;
  stdoutPath?: string;
  stderrPath?: string;
} = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd ?? repoRoot,
      shell: false,
      env: claudefastEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeoutMs = opts.timeoutMs ?? 120_000;
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      reject(new Error(`${bin} ${args.join(" ")} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (opts.stdoutPath) fs.appendFileSync(opts.stdoutPath, text);
    });
    child.stderr?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (opts.stderrPath) fs.appendFileSync(opts.stderrPath, text);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function makeRule(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  const now = "2026-04-28T00:00:00.000Z";
  return {
    id: "rule",
    scope: { level: "personal" },
    category: "E",
    tags: ["claudefast"],
    type: "avoidance",
    nature: "objective",
    trigger: "test trigger",
    wrong_pattern: "test wrong",
    correct_pattern: "test correct",
    reasoning: "test reasoning",
    confidence: 0.8,
    enforcement: "warn",
    status: "active",
    hit_count: 0,
    success_count: 0,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: now,
    last_hit_at: "",
    last_validated_at: now,
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical",
    max_tier_ever: "canonical",
    tier_entered_at: now,
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    channel: "tool-action",
    ...overrides,
  };
}

function seedRules(cwd: string, rules: KnowledgeEntry[]): void {
  const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const globalDbPath = path.join(cwd, ".teamagent-home", "global.db");
  ensureDir(path.dirname(projectDbPath));
  ensureDir(path.dirname(globalDbPath));
  const store = new DualLayerStore({ projectDbPath, userGlobalDbPath: globalDbPath });
  try {
    for (const rule of rules) store.add(rule);
  } finally {
    store.close();
  }
}

function writeSettingsFile(workDir: string): string {
  const settingsPath = path.join(workDir, "claudefast-settings.json");
  const hookHome = path.join(workDir, "home");
  ensureDir(hookHome);
  const hookCommand = [
    `cd ${JSON.stringify(repoRoot)}`,
    `HOME=${JSON.stringify(hookHome)} ./node_modules/.bin/tsx packages/cli/src/bin-pre-tool-use.ts`,
  ].join(" && ");

  fs.writeFileSync(settingsPath, JSON.stringify({
    env: {
      TEAMAGENT_VISIBILITY: "verbose",
      TEAMAGENT_MATCHER: "legacy",
    },
    hooks: {
      PreToolUse: [
        {
          matcher: "Write|Edit|Bash",
          hooks: [
            {
              type: "command",
              command: hookCommand,
              timeout: 30,
            },
          ],
        },
      ],
    },
  }, null, 2));
  return settingsPath;
}

function parseJsonLines(raw: string): JsonObject[] {
  const out: JsonObject[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed && typeof parsed === "object") out.push(parsed as JsonObject);
    } catch {
      // Stream output can include provider/debug noise; only JSONL events matter.
    }
  }
  return out;
}

function hookResponses(events: JsonObject[], hookName: string): JsonObject[] {
  return events.filter((event) =>
    event.type === "system" &&
    event.subtype === "hook_response" &&
    event.hook_name === hookName
  );
}

function eventText(event: JsonObject): string {
  return [event.output, event.stdout, event.stderr]
    .filter((v): v is string => typeof v === "string")
    .join("\n");
}

function addCheck(
  checks: ScenarioResult["checks"],
  name: string,
  passed: boolean,
  detail?: string,
): void {
  checks.push({ name, passed, ...(detail ? { detail } : {}) });
}

async function runScenario(args: {
  name: string;
  cwd: string;
  settingsPath: string;
  prompt: string;
  checks: (events: JsonObject[], hookDebugText: string) => ScenarioResult["checks"];
}): Promise<ScenarioResult> {
  const dir = path.join(outRoot, args.name);
  ensureDir(dir);
  const stdoutPath = path.join(dir, "stdout.jsonl");
  const stderrPath = path.join(dir, "stderr.log");
  const hookDebugPath = path.join(dir, "hooks.debug.log");
  const summaryPath = path.join(dir, "summary.json");
  fs.writeFileSync(stdoutPath, "");
  fs.writeFileSync(stderrPath, "");
  if (hookDebugSupported) fs.writeFileSync(hookDebugPath, "");

  const command = [
    "claudefast",
    "-p",
    ...streamJsonArgs,
    ...(hookDebugSupported ? ["--debug", "hooks", "--debug-file", hookDebugPath] : []),
    "--permission-mode", "acceptEdits",
    "--setting-sources", "user",
    "--settings", args.settingsPath,
    "--allowedTools=Write",
    args.prompt,
  ];

  const res = await runCommand(command[0]!, command.slice(1), {
    cwd: args.cwd,
    timeoutMs: 180_000,
    stdoutPath,
    stderrPath,
  });
  const events = parseJsonLines(res.stdout);
  const hookDebugText = hookDebugSupported && fs.existsSync(hookDebugPath) ? fs.readFileSync(hookDebugPath, "utf8") : "";
  const checks = args.checks(events, hookDebugText);
  addCheck(checks, "claudefast exited 0", res.code === 0, `exit=${res.code}`);
  if (hookDebugSupported) {
    addCheck(checks, "hook debug evidence written", hookDebugText.includes("hook"), hookDebugPath);
  }

  const scenario: ScenarioResult = {
    name: args.name,
    command,
    stdoutPath,
    stderrPath,
    summaryPath,
    jsonEvents: events.length,
    hookResponses: hookResponses(events, "PreToolUse:Write"),
    passed: checks.every((c) => c.passed),
    checks,
  };
  fs.writeFileSync(summaryPath, JSON.stringify(scenario, null, 2));
  return scenario;
}

async function main(): Promise<number> {
  ensureDir(outRoot);
  console.log("TeamAgent claudefast rule-card smoke");
  console.log(`out: ${outRoot}`);

  const help = await runCommand("claudefast", ["-h"], { cwd: repoRoot, timeoutMs: 30_000 });
  fs.writeFileSync(path.join(outRoot, "claudefast-help.stdout.log"), help.stdout);
  fs.writeFileSync(path.join(outRoot, "claudefast-help.stderr.log"), help.stderr);
  const helpText = `${help.stdout}\n${help.stderr}`;
  fs.writeFileSync(path.join(outRoot, "claudefast-help.combined.log"), helpText);
  if (help.code !== 0) {
    console.error(`claudefast -h failed with exit ${help.code}`);
    return 2;
  }
  if (!helpText.includes("--output-format") || !helpText.includes("stream-json")) {
    console.error("claudefast -h did not advertise --output-format stream-json");
    return 2;
  }
  streamJsonArgs = ["--output-format", "stream-json"];
  hookDebugSupported = helpText.includes("--debug") && helpText.includes("--debug-file");
  if (helpText.includes("--include-partial-messages")) streamJsonArgs.push("--include-partial-messages");
  if (helpText.includes("--verbose")) streamJsonArgs.push("--verbose");
  hookEvidenceMode = hookDebugSupported ? "debug-file" : "unsupported";
  fs.writeFileSync(path.join(outRoot, "claudefast-stream-json-flags.json"), JSON.stringify({
    streamJsonArgs,
    includeHookEventsSkipped: true,
    includeHookEventsUsed: false,
    hookDebugSupported,
    hookEvidenceMode,
  }, null, 2));
  if (hookEvidenceMode === "unsupported") {
    const report = {
      generated_at: new Date().toISOString(),
      outRoot,
      status: "unsupported",
      passed: false,
      skipped: true,
      includeHookEventsSkipped: true,
      includeHookEventsUsed: false,
      hookDebugSupported,
      hookEvidenceMode,
      streamJsonArgs,
      reason: "claudefast -h does not advertise --debug hooks --debug-file, so hook evidence is unsupported",
    };
    fs.writeFileSync(path.join(outRoot, "report.json"), JSON.stringify(report, null, 2));
    console.error(`  unsupported rule-card smoke: no supported hook evidence flags; base stream-json flags: ${streamJsonArgs.join(" ")}`);
    return 4;
  }
  console.log(`  ok claudefast hook evidence mode: ${hookEvidenceMode}; stream flags: ${streamJsonArgs.join(" ")}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-claudefast-"));
  try {
    const settingsPath = writeSettingsFile(tempRoot);

    const warnCwd = path.join(tempRoot, "warn-workspace");
    ensureDir(path.join(warnCwd, "src"));
    seedRules(warnCwd, [
      makeRule({
        id: "warn-axios",
        trigger: "writing HTTP client code",
        wrong_pattern: "axios",
        correct_pattern: "use fetch",
        reasoning: "project standard avoids the axios dependency",
        confidence: 0.82,
        enforcement: "warn",
        scope: { level: "personal", file_types: ["*.ts"] },
      }),
    ]);
    const warnFile = path.join(warnCwd, "src", "axios-warning.ts");
    const warnScenario = await runScenario({
      name: "write-axios-warning",
      cwd: warnCwd,
      settingsPath,
      prompt: `Use the Write tool to create ${warnFile}. The exact file content must be: import axios from 'axios';\\n\\nexport const getJson = () => axios.get('/api/test');\\n`,
      checks: (events, hookDebugText) => {
        const checks: ScenarioResult["checks"] = [];
        const responses = hookResponses(events, "PreToolUse:Write");
        const combined = [responses.map(eventText).join("\n"), hookDebugText].filter(Boolean).join("\n");
        addCheck(checks, "PreToolUse Write hook responded", responses.length > 0 || hookDebugText.includes("PreToolUse"));
        addCheck(checks, "warn card rendered as ASCII", combined.includes("+-- TeamAgent 经验提醒"));
        addCheck(checks, "warn card kept allow decision", combined.includes('"permissionDecision":"allow"'));
        addCheck(checks, "warn file was created", fs.existsSync(warnFile), warnFile);
        addCheck(
          checks,
          "warn file contains requested axios code",
          fs.existsSync(warnFile) && fs.readFileSync(warnFile, "utf8").includes("axios.get('/api/test')"),
        );
        return checks;
      },
    });

    const hardCwd = path.join(tempRoot, "hard-rule-workspace");
    ensureDir(path.join(hardCwd, "config"));
    const hardFile = path.join(hardCwd, "config", "policy.json");
    const originalJson = `${JSON.stringify({ hardRule: false, mode: "safe" }, null, 2)}\n`;
    fs.writeFileSync(hardFile, originalJson);
    seedRules(hardCwd, [
      makeRule({
        id: "block-hard-rule-json",
        trigger: "turning on hardRule in JSON config",
        wrong_pattern: "\"hardRule\": true",
        correct_pattern: "leave hardRule false unless an owner approves the policy change",
        reasoning: "hard-rule JSON changes alter enforcement behavior and must be reviewed",
        confidence: 0.95,
        enforcement: "block",
        hit_count: 4,
        scope: { level: "personal", file_types: ["*.json"] },
      }),
    ]);
    const blockedJson = `${JSON.stringify({ hardRule: true, mode: "unsafe" }, null, 2)}\n`;
    const hardScenario = await runScenario({
      name: "json-hard-rule-block",
      cwd: hardCwd,
      settingsPath,
      prompt: `Use the Write tool to replace ${hardFile}. The exact new JSON content must be:\\n${blockedJson}`,
      checks: (events, hookDebugText) => {
        const checks: ScenarioResult["checks"] = [];
        const responses = hookResponses(events, "PreToolUse:Write");
        const combined = [responses.map(eventText).join("\n"), hookDebugText].filter(Boolean).join("\n");
        const current = fs.readFileSync(hardFile, "utf8");
        addCheck(checks, "PreToolUse Write hook responded", responses.length > 0 || hookDebugText.includes("PreToolUse"));
        addCheck(checks, "block card rendered as ASCII", combined.includes("+-- TeamAgent 阻止操作"));
        addCheck(checks, "hard-rule returned deny decision", combined.includes('"permissionDecision":"deny"'));
        addCheck(checks, "JSON file stayed unchanged after denied write", current === originalJson, current);
        addCheck(checks, "blocked JSON was not written", !current.includes('"hardRule": true'), current);
        return checks;
      },
    });

    const report = {
      generated_at: new Date().toISOString(),
      outRoot,
      hookEvidenceMode,
      includeHookEventsSkipped: true,
      includeHookEventsUsed: false,
      scenarios: [warnScenario, hardScenario],
      passed: warnScenario.passed && hardScenario.passed,
    };
    fs.writeFileSync(path.join(outRoot, "report.json"), JSON.stringify(report, null, 2));

    for (const scenario of report.scenarios) {
      console.log(`\n${scenario.passed ? "PASS" : "FAIL"} ${scenario.name}`);
      for (const check of scenario.checks) {
        console.log(`  ${check.passed ? "ok" : "not ok"} - ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
      }
      console.log(`  stdout: ${scenario.stdoutPath}`);
      console.log(`  summary: ${scenario.summaryPath}`);
    }

    return report.passed ? 0 : 1;
  } finally {
    if (process.env.TEAMAGENT_KEEP_CLAUDEFAST_TMP !== "1") {
      rmRetry(tempRoot);
    } else {
      console.log(`kept temp root: ${tempRoot}`);
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
