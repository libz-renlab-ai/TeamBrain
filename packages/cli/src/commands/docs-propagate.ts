import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DualLayerStore } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

export interface DocsPropagationRunnerContext {
  kind: "update-docs" | "answer" | "judge";
  attempt: number;
  ruleIds: string[];
}

export type DocsPropagationRunner = (
  prompt: string,
  context: DocsPropagationRunnerContext,
) => Promise<string>;

export interface DocsPropagateOptions {
  ruleIds: string[];
  cwd?: string;
  homeDir?: string;
  projectDbPath?: string;
  userGlobalDbPath?: string;
  logDir?: string;
  now?: () => Date;
  maxAttempts?: number;
  env?: Record<string, string | undefined>;
  runner?: DocsPropagationRunner;
}

export interface DocsPropagationAttemptLog {
  attempt: number;
  updateOutput?: string;
  checks: Array<{
    ruleId: string;
    answer?: string;
    pass: boolean;
    reason: string;
  }>;
  error?: string;
}

export interface DocsPropagationResult {
  ok: boolean;
  ruleIds: string[];
  missingRuleIds: string[];
  attempts: DocsPropagationAttemptLog[];
  logPath: string;
}

function resolvePaths(opts: DocsPropagateOptions) {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.homeDir ?? os.homedir();
  return {
    cwd,
    projectDbPath: opts.projectDbPath ?? path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: opts.userGlobalDbPath ?? path.join(home, ".teamagent", "global.db"),
    logDir: opts.logDir ?? path.join(cwd, ".teamagent", "doc-propagation"),
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function defaultRunner(env: Record<string, string | undefined>, cwd: string): DocsPropagationRunner {
  const command = env.TEAMAGENT_DOCS_RUNNER ?? "claudefast -p";
  const timeoutMs = Number.parseInt(env.TEAMAGENT_DOCS_RUNNER_TIMEOUT_MS ?? "", 10) || 180_000;
  return async (prompt) => runPromptCommand(command, prompt, cwd, env, timeoutMs);
}

export function buildDocsRunnerCommand(
  commandTemplate: string,
  prompt: string,
): { command: string; args: string[] } {
  const promptMarker = "__TEAMAGENT_DOCS_PROMPT_ARG__";
  const template = commandTemplate.includes("{prompt}")
    ? commandTemplate.replaceAll("{prompt}", promptMarker)
    : commandTemplate;
  const parsed = parseCommandLine(template);
  if (parsed.length === 0) {
    throw new Error("docs runner command is empty");
  }
  const replaced = parsed.map((part) => part.replaceAll(promptMarker, prompt));
  const command = replaced[0]!;
  const args = replaced.slice(1);
  return {
    command,
    args: commandTemplate.includes("{prompt}") ? args : [...args, prompt],
  };
}

function parseCommandLine(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let tokenStarted = false;
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) {
        quote = undefined;
      } else {
        current += ch;
      }
      tokenStarted = true;
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (tokenStarted) {
        args.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    current += ch;
    tokenStarted = true;
  }
  if (quote) {
    throw new Error("docs runner command has an unterminated quote");
  }
  if (tokenStarted) args.push(current);
  return args;
}

function runPromptCommand(
  commandTemplate: string,
  prompt: string,
  cwd: string,
  env: Record<string, string | undefined>,
  timeoutMs: number,
): Promise<string> {
  const { command, args } = buildDocsRunnerCommand(commandTemplate, prompt);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`docs runner timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`docs runner exited ${code}: ${stderr.trim() || stdout.trim()}`));
      }
    });
  });
}

function ruleUseWhen(entry: KnowledgeEntry): string {
  return entry.trigger.trim();
}

function ruleDoWhenUsed(entry: KnowledgeEntry): string {
  return [entry.correct_pattern.trim(), entry.reasoning.trim()].filter(Boolean).join("；");
}

function buildUpdatePrompt(
  entries: KnowledgeEntry[],
  attempt: number,
  previous?: DocsPropagationAttemptLog,
): string {
  const ruleList = entries.map((e) => [
    `- id: ${e.id}`,
    `  when: ${ruleUseWhen(e)}`,
    `  please: ${ruleDoWhenUsed(e)}`,
  ].join("\n")).join("\n");
  const retryContext = previous
    ? [
        "",
        "Previous verification failed. Fix the documentation gap below:",
        JSON.stringify(previous.checks.map((c) => ({ ruleId: c.ruleId, reason: c.reason })), null, 2),
      ].join("\n")
    : "";
  return [
    "Update this repository's concise project documentation so a future coding agent naturally follows the learned behavior.",
    "",
    "Rules:",
    "- Prefer updating an existing relevant file under docs/ if one clearly applies.",
    "- If no relevant doc exists, create or update docs/knowledge/INDEX.md.",
    "- Only touch root CLAUDE.md for a short index pointer when necessary.",
    "- Never add a TEAMAGENT:START/END managed block, and never dump generated rule bullets into CLAUDE.md.",
    "- Keep wording natural and concise; document the behavior, not the database row.",
    "",
    `Attempt: ${attempt}`,
    "Learned behavior to propagate:",
    ruleList,
    retryContext,
  ].join("\n");
}

function buildJudgePrompt(entry: KnowledgeEntry, answer: string): string {
  return [
    "Judge whether the answer teaches the expected behavior.",
    "Return only JSON: {\"pass\": boolean, \"reason\": string}",
    "",
    `When: ${ruleUseWhen(entry)}`,
    `Expected behavior: ${ruleDoWhenUsed(entry)}`,
    "",
    "Answer:",
    answer,
  ].join("\n");
}

function buildAnswerPrompt(entry: KnowledgeEntry): string {
  return [
    "Answer from this repository's documentation and project instructions.",
    "If the docs do not teach the behavior, say so plainly.",
    "",
    `Question: what should a coding agent do when ${ruleUseWhen(entry)}?`,
  ].join("\n");
}

function parseJudge(raw: string): { pass: boolean; reason: string } {
  const fenced = raw.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const json = start >= 0 && end >= start ? fenced.slice(start, end + 1) : fenced;
  try {
    const parsed = JSON.parse(json) as { pass?: unknown; reason?: unknown };
    return {
      pass: parsed.pass === true,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
    };
  } catch {
    return { pass: false, reason: `judge returned non-JSON: ${raw.slice(0, 160)}` };
  }
}

function writeLog(paths: ReturnType<typeof resolvePaths>, result: DocsPropagationResult): void {
  fs.mkdirSync(paths.logDir, { recursive: true });
  fs.writeFileSync(result.logPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
}

export async function executeDocsPropagate(
  opts: DocsPropagateOptions,
): Promise<DocsPropagationResult> {
  const paths = resolvePaths(opts);
  const now = opts.now ?? (() => new Date());
  const ruleIds = Array.from(new Set(opts.ruleIds.map((id) => id.trim()).filter(Boolean)));
  fs.mkdirSync(path.dirname(paths.projectDbPath), { recursive: true });
  fs.mkdirSync(path.dirname(paths.userGlobalDbPath), { recursive: true });

  const store = new DualLayerStore({
    projectDbPath: paths.projectDbPath,
    userGlobalDbPath: paths.userGlobalDbPath,
  });
  const entries = ruleIds
    .map((id) => store.getById(id))
    .filter((e): e is KnowledgeEntry => e !== undefined);
  store.close();

  const missingRuleIds = ruleIds.filter((id) => !entries.some((e) => e.id === id));
  const safeIds = (ruleIds.length > 0 ? ruleIds : ["none"]).join("_").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 80);
  const logPath = path.join(
    paths.logDir,
    `${now().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${safeIds}.json`,
  );
  const result: DocsPropagationResult = {
    ok: false,
    ruleIds,
    missingRuleIds,
    attempts: [],
    logPath,
  };

  if (entries.length === 0) {
    result.attempts.push({ attempt: 0, checks: [], error: "no matching rules found" });
    writeLog(paths, result);
    return result;
  }

  const env = opts.env ?? process.env;
  const runner = opts.runner ?? defaultRunner(env, paths.cwd);
  const maxAttempts = opts.maxAttempts ?? 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptLog: DocsPropagationAttemptLog = { attempt, checks: [] };
    try {
      attemptLog.updateOutput = await runner(
        buildUpdatePrompt(entries, attempt, result.attempts.at(-1)),
        { kind: "update-docs", attempt, ruleIds },
      );

      for (const entry of entries) {
        const answer = await runner(
          buildAnswerPrompt(entry),
          { kind: "answer", attempt, ruleIds },
        );
        const judgeRaw = await runner(
          buildJudgePrompt(entry, answer),
          { kind: "judge", attempt, ruleIds },
        );
        const judge = parseJudge(judgeRaw);
        attemptLog.checks.push({
          ruleId: entry.id,
          answer,
          pass: judge.pass,
          reason: judge.reason,
        });
      }
    } catch (err) {
      attemptLog.error = String(err).slice(0, 400);
    }
    result.attempts.push(attemptLog);
    if (
      missingRuleIds.length === 0 &&
      attemptLog.checks.length === entries.length &&
      attemptLog.checks.every((c) => c.pass)
    ) {
      result.ok = true;
      break;
    }
  }

  writeLog(paths, result);
  return result;
}

export function renderDocsPropagationResult(result: DocsPropagationResult): string {
  const lines: string[] = [];
  lines.push(result.ok ? "✓ docs propagation verified" : "⚠ docs propagation did not verify");
  lines.push(`rules: ${result.ruleIds.join(", ") || "(none)"}`);
  if (result.missingRuleIds.length > 0) {
    lines.push(`missing: ${result.missingRuleIds.join(", ")}`);
  }
  lines.push(`attempts: ${result.attempts.length}`);
  lines.push(`log: ${result.logPath}`);
  return lines.join("\n") + "\n";
}

export function parseDocsPropagateArgs(argv: string[]): Pick<DocsPropagateOptions, "ruleIds" | "cwd"> {
  const ruleIds: string[] = [];
  let cwd: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--rule-id" && argv[i + 1]) {
      ruleIds.push(argv[++i]!);
    } else if (a.startsWith("--rule-id=")) {
      ruleIds.push(a.slice("--rule-id=".length));
    } else if (a === "--cwd" && argv[i + 1]) {
      cwd = argv[++i]!;
    } else if (a.startsWith("--cwd=")) {
      cwd = a.slice("--cwd=".length);
    } else if (!a.startsWith("--")) {
      ruleIds.push(a);
    }
  }
  return { ruleIds, ...(cwd ? { cwd } : {}) };
}

export function scheduleDocsPropagation(
  ruleIds: string[],
  opts: { cwd?: string; env?: Record<string, string | undefined> } = {},
): void {
  const env = opts.env ?? process.env;
  const ids = Array.from(new Set(ruleIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return;
  if (env.TEAMAGENT_DISABLE_DOCS_PROPAGATION === "1") return;
  if (process.env.VITEST === "true" && env.TEAMAGENT_FORCE_DOCS_PROPAGATION !== "1") return;

  const cwd = opts.cwd ?? process.cwd();
  try {
    if (env.TEAMAGENT_DOCS_PROPAGATE_COMMAND) {
      const quotedIds = ids.map((id) => `--rule-id=${shellQuote(id)}`).join(" ");
      const command = `${env.TEAMAGENT_DOCS_PROPAGATE_COMMAND} ${quotedIds} --cwd=${shellQuote(cwd)}`;
      const child = spawn(command, { cwd, shell: true, stdio: "ignore", detached: true, env: { ...process.env, ...env } });
      child.unref();
      return;
    }

    const bin = process.argv[1];
    if (bin?.endsWith(".ts")) {
      const child = spawn("pnpm", ["teamagent", "docs-propagate", ...ids.map((id) => `--rule-id=${id}`), `--cwd=${cwd}`], {
        cwd,
        stdio: "ignore",
        detached: true,
        env: { ...process.env, ...env },
      });
      child.unref();
    } else if (bin) {
      const child = spawn(process.execPath, [bin, "docs-propagate", ...ids.map((id) => `--rule-id=${id}`), `--cwd=${cwd}`], {
        cwd,
        stdio: "ignore",
        detached: true,
        env: { ...process.env, ...env },
      });
      child.unref();
    }
  } catch {
    // Best-effort scheduling must never block the command that learned the rule.
  }
}
