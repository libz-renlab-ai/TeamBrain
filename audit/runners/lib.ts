import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AuditStatus = "passed" | "failed" | "blocked";

export interface CommandRecord {
  name: string;
  command: string[];
  cwd: string;
  exitCode: number | null;
  stdoutPath: string;
  stderrPath: string;
  exitCodePath: string;
  commandPath: string;
}

export interface AuditContext {
  repoRoot: string;
  featureId: string;
  slug: string;
  runId: string;
  outDir: string;
  tmpDir: string;
  homeDir: string;
  projectDir: string;
  commands: CommandRecord[];
}

export interface AuditDecision {
  feature: string;
  status: AuditStatus;
  summary: string;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  commands: CommandRecord[];
  artifacts?: Record<string, string>;
}

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export function createAuditContext(featureId: string, slug: string): AuditContext {
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(REPO_ROOT, "audit", "out", `${featureId}-${slug}`, runId);
  const tmpDir = path.join(os.tmpdir(), `teamagent-audit-${featureId}-${runId}`);
  const homeDir = path.join(tmpDir, "home");
  const projectDir = path.join(tmpDir, "project");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  return { repoRoot: REPO_ROOT, featureId, slug, runId, outDir, tmpDir, homeDir, projectDir, commands: [] };
}

export function cleanupTemp(ctx: AuditContext): void {
  if (process.env["TEAMAGENT_AUDIT_KEEP_TMP"] === "1") return;
  rmSync(ctx.tmpDir, { recursive: true, force: true });
}

export function rel(ctx: AuditContext, file: string): string {
  return path.relative(ctx.repoRoot, file);
}

export function writeArtifact(ctx: AuditContext, name: string, body: string): string {
  const file = path.join(ctx.outDir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, body, "utf-8");
  return file;
}

export function writeJson(ctx: AuditContext, name: string, value: unknown): string {
  return writeArtifact(ctx, name, JSON.stringify(value, null, 2) + "\n");
}

export function readText(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf-8") : "";
}

export function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

export function runCommand(
  ctx: AuditContext,
  name: string,
  command: string[],
  opts: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
    timeoutMs?: number;
  } = {},
): CommandRecord {
  const base = safeName(name);
  const stdoutPath = path.join(ctx.outDir, `${base}.stdout.txt`);
  const stderrPath = path.join(ctx.outDir, `${base}.stderr.txt`);
  const exitCodePath = path.join(ctx.outDir, `${base}.exit-code.txt`);
  const commandPath = path.join(ctx.outDir, `${base}.command.json`);
  const cwd = opts.cwd ?? ctx.repoRoot;

  writeFileSync(
    commandPath,
    JSON.stringify(
      {
        command,
        cwd,
        env: opts.env ?? {},
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );

  const result = spawnSync(command[0]!, command.slice(1), {
    cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    encoding: "utf-8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: opts.timeoutMs,
  });

  writeFileSync(stdoutPath, result.stdout ?? "", "utf-8");
  writeFileSync(stderrPath, result.stderr ?? "", "utf-8");
  writeFileSync(exitCodePath, `${result.status ?? "null"}\n`, "utf-8");

  const record: CommandRecord = {
    name,
    command,
    cwd,
    exitCode: result.status,
    stdoutPath,
    stderrPath,
    exitCodePath,
    commandPath,
  };
  ctx.commands.push(record);

  if (!opts.allowFailure && result.status !== 0) {
    throw new Error(`${name} failed with exit=${result.status}; stderr=${(result.stderr ?? "").slice(0, 500)}`);
  }

  return record;
}

export function pnpmTeamagentCommand(ctx: AuditContext, args: string[]): string[] {
  return ["pnpm", "--dir", ctx.repoRoot, "teamagent", ...args];
}

export function tsxBinCommand(ctx: AuditContext, args: string[]): string[] {
  return ["pnpm", "--dir", ctx.repoRoot, "exec", "tsx", path.join(ctx.repoRoot, "packages", "cli", "src", "bin.ts"), ...args];
}

export function check(name: string, ok: boolean, detail?: string): { name: string; ok: boolean; detail?: string } {
  return { name, ok, detail };
}

export function finalize(ctx: AuditContext, decision: Omit<AuditDecision, "commands">): AuditDecision {
  const full: AuditDecision = { ...decision, commands: ctx.commands };
  writeJson(ctx, "decision.json", full);
  writeArtifact(
    ctx,
    "summary.md",
    [
      `# ${decision.feature}`,
      "",
      `Status: ${decision.status}`,
      "",
      decision.summary,
      "",
      "## Checks",
      "",
      ...decision.checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? `: ${c.detail}` : ""}`),
      "",
    ].join("\n"),
  );
  process.stdout.write(`${decision.status.toUpperCase()} ${decision.feature}\n`);
  process.stdout.write(`Evidence: ${ctx.outDir}\n`);
  if (decision.status === "failed") process.exitCode = 1;
  return full;
}
