import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
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
  type CommandRecord,
} from "./lib.js";

const require = createRequire(import.meta.url);
const { DatabaseSync: DatabaseSyncCtor } = require("node:sqlite") as typeof import("node:sqlite");

const FEATURE = "feature-20-attribution-visibility";
const MODES = ["silent", "smart", "verbose"] as const;
const PITFALL_TIMEOUT_MS = 60_000;

type VisibilityMode = typeof MODES[number];
type AuditCheck = ReturnType<typeof check>;

interface ModeDirs {
  mode: VisibilityMode;
  root: string;
  home: string;
  cwd: string;
  skills: string;
}

interface PitfallRun {
  mode: VisibilityMode;
  dirs: ModeDirs;
  command: CommandRecord;
  stdout: string;
  stderr: string;
  knowledgeDb: string;
  claudeMd: string;
  knowledgeCount: number;
}

function makeModeDirs(ctx: AuditContext, mode: VisibilityMode): ModeDirs {
  const root = path.join(ctx.tmpDir, `pitfall-${mode}`);
  const home = path.join(root, "home");
  const cwd = path.join(root, "repo");
  const skills = path.join(root, "skills");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  mkdirSync(skills, { recursive: true });
  writeFileSync(
    path.join(cwd, "CLAUDE.md"),
    "# Attribution visibility audit\n\nsentinel before\n",
    "utf-8",
  );
  return { mode, root, home, cwd, skills };
}

function writePitfallGreyboxScript(ctx: AuditContext): string {
  return writeArtifact(
    ctx,
    "pitfall-greybox-runner.ts",
    String.raw`
import { pathToFileURL } from "node:url";
import path from "node:path";

const [repoRoot, mode, cwd, homeDir] = process.argv.slice(2);
if (!repoRoot || !mode || !cwd || !homeDir) {
  throw new Error("usage: pitfall-greybox-runner <repoRoot> <mode> <cwd> <homeDir>");
}

process.chdir(cwd);

const mod = await import(pathToFileURL(path.join(repoRoot, "packages", "cli", "src", "commands", "pitfall.ts")).href);
const out = await mod.executePitfall(
  {
    trigger: "audit same trigger",
    wrong: "use moment for tiny formatting",
    correct: "use Intl.DateTimeFormat",
    reason: "project avoids moment bundle cost",
    category: "E",
    tags: ["visibility"],
    level: "personal",
    nature: "subjective",
  },
  {
    cwd,
    homeDir,
    now: () => "2026-04-28T00:00:00.000Z",
    env: { TEAMAGENT_VISIBILITY: mode },
    embedder: { embed: async (texts) => texts.map(() => [0.1, 0.2, 0.3]) },
  },
);

process.stdout.write(out);
if (out) process.stdout.write("\n");

// executePitfall intentionally starts a best-effort background description job.
// The attribution audit is about the synchronous pitfall->renderer output, so
// exit after stdout is captured to avoid making Claude terminal UX a hard gate.
process.exit(0);
`,
  );
}

function envFor(dirs: ModeDirs): NodeJS.ProcessEnv {
  return {
    HOME: dirs.home,
    XDG_CACHE_HOME: path.join(dirs.root, "xdg-cache"),
    TEAMAGENT_SKILLS_DIR: dirs.skills,
    TEAMAGENT_VISIBILITY: dirs.mode,
    TEAMAGENT_LLM_TIMEOUT_MS: "1",
  };
}

function runPitfallMode(ctx: AuditContext, scriptPath: string, mode: VisibilityMode): PitfallRun {
  const dirs = makeModeDirs(ctx, mode);
  const command = runCommand(
    ctx,
    `pitfall-${mode}`,
    [
      "pnpm",
      "--dir",
      ctx.repoRoot,
      "--filter",
      "@teamagent/cli",
      "exec",
      "tsx",
      scriptPath,
      ctx.repoRoot,
      mode,
      dirs.cwd,
      dirs.home,
    ],
    {
      cwd: dirs.cwd,
      env: envFor(dirs),
      allowFailure: true,
      timeoutMs: PITFALL_TIMEOUT_MS,
    },
  );
  const knowledgeDb = path.join(dirs.cwd, ".teamagent", "knowledge.db");
  const claudeMd = path.join(dirs.cwd, "CLAUDE.md");
  return {
    mode,
    dirs,
    command,
    stdout: readText(command.stdoutPath),
    stderr: readText(command.stderrPath),
    knowledgeDb,
    claudeMd,
    knowledgeCount: countKnowledgeRows(knowledgeDb),
  };
}

function countKnowledgeRows(dbPath: string): number {
  if (!existsSync(dbPath)) return 0;
  const db = new DatabaseSyncCtor(dbPath, { readOnly: true });
  try {
    const row = db.prepare("select count(*) as count from knowledge").get() as { count: number } | undefined;
    return row?.count ?? 0;
  } finally {
    db.close();
  }
}

function hasAll(text: string, snippets: string[]): boolean {
  return snippets.every((snippet) => text.includes(snippet));
}

function hasNone(text: string, snippets: string[]): boolean {
  return snippets.every((snippet) => !text.includes(snippet));
}

async function runPreToolUseVisibility(ctx: AuditContext): Promise<{
  checks: AuditCheck[];
  artifact: string;
}> {
  const scriptPath = writeArtifact(
    ctx,
    "pre-tool-use-sdk-visibility.ts",
    String.raw`
import { pathToFileURL } from "node:url";
import path from "node:path";

const [repoRoot] = process.argv.slice(2);
if (!repoRoot) {
  throw new Error("usage: pre-tool-use-sdk-visibility <repoRoot>");
}

const { createPreToolUseHandler } = await import(
  pathToFileURL(path.join(repoRoot, "packages", "adapters", "src", "index.ts")).href
);

const modes = ["silent", "smart", "verbose"];
const results = {};
const appendedEvents = {};

for (const mode of modes) {
  const appended = [];
  const handler = createPreToolUseHandler({
      matcher: {
        match: async () => ({
          matched: [],
          semanticHits: [
            {
              id: "k-visibility",
              trigger: "avoid leaking low-level attribution in smart mode",
              score: 0.91,
            },
          ],
        }),
      },
    eventLog: {
      append: (event) => appended.push(event),
      readLast: () => [],
    },
    visibility: mode,
    ruleCount: 7,
  });

  const result = await handler({
    tool_name: "Bash",
    tool_input: { command: "printf audit" },
    tool_use_id: "tool-" + mode,
  });

  results[mode] = JSON.parse(JSON.stringify(result));
  appendedEvents[mode] = appended;
}

console.log(JSON.stringify({ results, appendedEvents }));
`,
  );

  const command = runCommand(
    ctx,
    "pre-tool-use-sdk-visibility",
    ["pnpm", "--dir", ctx.repoRoot, "--filter", "@teamagent/adapters", "exec", "tsx", scriptPath, ctx.repoRoot],
    { cwd: ctx.repoRoot, allowFailure: true, timeoutMs: 30_000 },
  );
  const stdout = readText(command.stdoutPath);
  let parsed: { results?: Record<string, unknown>; appendedEvents?: Record<string, unknown[]> } = {};
  let parseError = "";
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }
  const parsedResults = parsed.results ?? {};

  const artifact = writeJson(ctx, "pre-tool-use-sdk-results.json", {
    command: {
      stdoutPath: command.stdoutPath,
      stderrPath: command.stderrPath,
      exitCode: command.exitCode,
    },
    parsed,
    parseError,
  });

  const silent = (parsedResults["silent"] ?? {}) as { permissionDecision?: string; systemMessage?: string };
  const smart = (parsedResults["smart"] ?? {}) as { permissionDecision?: string; systemMessage?: string };
  const verbose = (parsedResults["verbose"] ?? {}) as { permissionDecision?: string; systemMessage?: string };

  return {
    artifact,
    checks: [
      check(
        "PreToolUse SDK greybox command exits 0 and emits JSON",
        command.exitCode === 0 && parseError === "",
        `exit=${command.exitCode}, parseError=${parseError}, stderr=${JSON.stringify(readText(command.stderrPath).slice(0, 300))}`,
      ),
      check(
        "PreToolUse clean pass allows all visibility modes",
        silent.permissionDecision === "allow" &&
          smart.permissionDecision === "allow" &&
          verbose.permissionDecision === "allow",
        JSON.stringify({
          silent: silent.permissionDecision,
          smart: smart.permissionDecision,
          verbose: verbose.permissionDecision,
        }),
      ),
      check(
        "PreToolUse silent/smart clean pass has no systemMessage",
        silent.systemMessage === undefined && smart.systemMessage === undefined,
        JSON.stringify({ silent, smart }),
      ),
      check(
        "PreToolUse verbose clean pass exposes high-signal debug JSON difference",
        typeof verbose.systemMessage === "string" &&
          hasAll(verbose.systemMessage, ["TeamAgent", "Bash", "放行", "检查 7 条规则", "语义命中 1 条", "k-visibility"]),
        verbose.systemMessage ?? "missing systemMessage",
      ),
    ],
  };
}

async function runAudit(ctx: AuditContext): Promise<{ checks: AuditCheck[]; artifacts: Record<string, string> }> {
  const artifacts: Record<string, string> = {};
  const checks: AuditCheck[] = [];
  const scriptPath = writePitfallGreyboxScript(ctx);
  artifacts["greybox-script"] = scriptPath;

  const runs = Object.fromEntries(
    MODES.map((mode) => {
      const run = runPitfallMode(ctx, scriptPath, mode);
      artifacts[`pitfall-${mode}-stdout`] = run.command.stdoutPath;
      artifacts[`pitfall-${mode}-stderr`] = run.command.stderrPath;
      return [mode, run];
    }),
  ) as Record<VisibilityMode, PitfallRun>;

  checks.push(
    ...MODES.map((mode) =>
      check(
        `pitfall ${mode} greybox command exits 0`,
        runs[mode].command.exitCode === 0,
        `exit=${runs[mode].command.exitCode}, stderr=${JSON.stringify(runs[mode].stderr.slice(0, 300))}`,
      ),
    ),
  );

  checks.push(
    check(
      "silent stdout empty and attribution-free",
      runs.silent.stdout.trim() === "" &&
        hasNone(runs.silent.stdout, ["TeamAgent", "添加知识条目", "如果没有 TeamAgent", "--- raw events ---", '"source": "pitfall"', '"counterfactual"']),
      `stdout length=${runs.silent.stdout.length}`,
    ),
  );

  checks.push(
    check(
      "smart stdout contains high-level attribution",
      hasAll(runs.smart.stdout, ["TeamAgent", "添加知识条目", "知识库变化: 0 → 1 条", "传播到:", "下次体验:"]),
      runs.smart.stdout.slice(0, 600),
    ),
    check(
      "smart stdout hides counterfactual and raw JSON",
      hasNone(runs.smart.stdout, ["如果没有 TeamAgent", "--- raw events ---", '"source": "pitfall"', '"counterfactual"', '"before"', '"after"', '"target"']),
      runs.smart.stdout,
    ),
  );

  checks.push(
    check(
      "verbose stdout contains counterfactual",
      hasAll(runs.verbose.stdout, ["TeamAgent", "添加知识条目", "如果没有 TeamAgent: 你会看到 AI 第二次再踩同一个坑"]),
      runs.verbose.stdout.slice(0, 800),
    ),
    check(
      "verbose stdout contains raw event JSON/debug details",
      hasAll(runs.verbose.stdout, ["--- raw events ---", '"source": "pitfall"', '"counterfactual"', '"before"', '"after"', '"target"']),
      runs.verbose.stdout.slice(-1200),
    ),
  );

  checks.push(
    ...MODES.map((mode) => {
      const claude = readText(runs[mode].claudeMd);
      return check(
        `pitfall ${mode} writes isolated DB and CLAUDE.md`,
        runs[mode].knowledgeCount === 1 &&
          existsSync(runs[mode].knowledgeDb) &&
          hasAll(claude, ["sentinel before", "TEAMAGENT:START", "use Intl.DateTimeFormat"]),
        JSON.stringify({
          knowledgeCount: runs[mode].knowledgeCount,
          dbExists: existsSync(runs[mode].knowledgeDb),
          claudeHasCorrect: claude.includes("use Intl.DateTimeFormat"),
        }),
      );
    }),
  );

  const preToolUse = await runPreToolUseVisibility(ctx);
  artifacts["pre-tool-use-sdk-results"] = preToolUse.artifact;
  checks.push(...preToolUse.checks);

  checks.push(
    check(
      "real Claude terminal UX is documented as non-default hard gate",
      true,
      "This runner hard-gates executePitfall/StdoutRenderer stdout and PreToolUse SDK JSON in temp HOME/cwd; interactive Claude terminal rendering remains outside default hard判定.",
    ),
  );

  writeJson(
    ctx,
    "pitfall-run-summary.json",
    Object.fromEntries(
      MODES.map((mode) => [
        mode,
        {
          cwd: runs[mode].dirs.cwd,
          home: runs[mode].dirs.home,
          stdoutPath: runs[mode].command.stdoutPath,
          stderrPath: runs[mode].command.stderrPath,
          exitCode: runs[mode].command.exitCode,
          knowledgeDb: runs[mode].knowledgeDb,
          knowledgeCount: runs[mode].knowledgeCount,
        },
      ]),
    ),
  );

  return { checks, artifacts };
}

const ctx = createAuditContext("20", "attribution-visibility");
try {
  const { checks, artifacts } = await runAudit(ctx);
  const passed = checks.every((c) => c.ok);
  finalize(ctx, {
    feature: FEATURE,
    status: passed ? "passed" : "failed",
    summary: passed
      ? "Attribution visibility is observable at the pitfall stdout layer and PreToolUse SDK JSON layer: silent is quiet, smart is high-level, verbose includes counterfactual/raw debug detail."
      : "Attribution visibility audit found at least one failure; inspect decision checks and command artifacts.",
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
