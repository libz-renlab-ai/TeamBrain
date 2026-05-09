import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface BugReportOptions {
  outputPath?: string;
  stdout?: boolean;
  cwd?: string;
  homeDir?: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  runCommand?: (cmd: string, args: string[]) => string;
  teamagentVersion?: string;
}

export interface BugReportResult {
  markdown: string;
  outputPath?: string;
}

const MAX_LOG_BYTES = 128 * 1024;

export function parseBugReportArgs(argv: string[]): Pick<BugReportOptions, "outputPath" | "stdout"> {
  const opts: Pick<BugReportOptions, "outputPath" | "stdout"> = { stdout: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--stdout") {
      opts.stdout = true;
    } else if (a === "--out" && argv[i + 1]) {
      opts.outputPath = argv[++i];
    } else if (a.startsWith("--out=")) {
      opts.outputPath = a.slice("--out=".length);
    }
  }
  return opts;
}

export async function executeBugReport(opts: BugReportOptions = {}): Promise<BugReportResult> {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os.homedir();
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();
  const teamagentHome = env["TEAMAGENT_HOME"] ?? path.join(homeDir, ".teamagent");
  const outputPath = opts.outputPath ?? defaultReportPath(teamagentHome, now);
  const runCommand = opts.runCommand ?? defaultRunCommand;

  const markdown = renderBugReport({
    cwd,
    homeDir,
    teamagentHome,
    now,
    env,
    runCommand,
    teamagentVersion: opts.teamagentVersion,
    stdout: opts.stdout ?? false,
  });

  if (!opts.stdout) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, markdown, "utf-8");
  }

  return {
    markdown,
    outputPath: opts.stdout ? undefined : outputPath,
  };
}

function renderBugReport(args: {
  cwd: string;
  homeDir: string;
  teamagentHome: string;
  now: Date;
  env: NodeJS.ProcessEnv;
  runCommand: (cmd: string, args: string[]) => string;
  teamagentVersion?: string;
  stdout: boolean;
}): string {
  const lines: string[] = [];
  lines.push("# TeamAgent Bug Report");
  lines.push("");
  lines.push(`Generated: ${args.now.toISOString()}`);
  lines.push("");
  if (!args.stdout) {
    lines.push("## Summary");
    lines.push("");
    lines.push("- What happened:");
    lines.push("- What you expected:");
    lines.push("- Steps to reproduce:");
    lines.push("");
  }
  lines.push("## System");
  lines.push("");
  lines.push(`- platform: ${process.platform}`);
  lines.push(`- arch: ${process.arch}`);
  lines.push(`- os: ${os.type()} ${os.release()}`);
  lines.push(`- cpus: ${os.cpus().length}`);
  lines.push(`- total_memory_mb: ${Math.round(os.totalmem() / 1024 / 1024)}`);
  lines.push(`- cwd: ${args.cwd}`);
  lines.push(`- shell: ${args.env["SHELL"] ?? "(unknown)"}`);
  lines.push(`- TEAMAGENT_HOME: ${args.teamagentHome}`);
  lines.push("");
  lines.push("## Tool Versions");
  lines.push("");
  lines.push(`- node: ${process.version} (${process.execPath})`);
  lines.push(`- npm: ${commandOrUnavailable(args.runCommand, "npm", ["--version"])}`);
  lines.push(`- pnpm: ${commandOrUnavailable(args.runCommand, "pnpm", ["--version"])}`);
  lines.push(`- claude: ${commandOrUnavailable(args.runCommand, "claude", ["--version"])}`);
  lines.push(`- teamagent: ${args.teamagentVersion ?? commandOrUnavailable(args.runCommand, "teamagent", ["--version"])}`);
  lines.push("");
  lines.push("## Install State");
  lines.push("");
  lines.push(fileStatus("user Claude settings", path.join(args.homeDir, ".claude", "settings.json")));
  lines.push(fileStatus("project Claude settings", path.join(args.cwd, ".claude", "settings.local.json")));
  lines.push(fileStatus("project knowledge db", path.join(args.cwd, ".teamagent", "knowledge.db")));
  lines.push(fileStatus("update state", path.join(args.teamagentHome, "update-state.json")));
  lines.push(fileStatus("auto-update disabled marker", path.join(args.teamagentHome, "auto-update.disabled")));
  lines.push("");
  lines.push("## Hook Commands");
  lines.push("");
  lines.push(renderHookCommands("user", path.join(args.homeDir, ".claude", "settings.json")));
  lines.push(renderHookCommands("project", path.join(args.cwd, ".claude", "settings.local.json")));
  lines.push("");
  lines.push("## Raw Logs");
  lines.push("");
  for (const log of logFiles(args.cwd, args.teamagentHome)) {
    lines.push(renderFileBlock(log.label, log.file));
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- Secret-looking values are redacted before writing this report.");
  lines.push(`- Log blocks are capped at ${MAX_LOG_BYTES} bytes from the end of each file.`);
  lines.push("");
  if (args.stdout) {
    lines.push("─────────────────────────────────────────────────");
    lines.push("📤 Paste this into a new issue at:");
    lines.push("   https://github.com/libz-renlab-ai/TeamBrain/issues/new");
    lines.push("");
    lines.push("   Tip: 在 Summary 段填上你卡住的具体动作。");
    lines.push("");
  }
  return lines.join("\n");
}

function defaultRunCommand(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
    windowsHide: true,
  }).trim();
}

function commandOrUnavailable(
  runCommand: (cmd: string, args: string[]) => string,
  cmd: string,
  args: string[],
): string {
  try {
    const out = runCommand(cmd, args).trim();
    return out.length > 0 ? firstLine(redactSecrets(out)) : "(empty output)";
  } catch (err) {
    return `(unavailable: ${redactSecrets(String(err)).slice(0, 160)})`;
  }
}

function defaultReportPath(teamagentHome: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return path.join(teamagentHome, "bug-reports", `teamagent-bug-report-${stamp}.md`);
}

function fileStatus(label: string, file: string): string {
  try {
    const stat = fs.statSync(file);
    return `- ${label}: present (${stat.size} bytes) ${file}`;
  } catch {
    return `- ${label}: missing ${file}`;
  }
}

function renderHookCommands(label: string, settingsPath: string): string {
  if (!fs.existsSync(settingsPath)) return `### ${label}\n\n(missing: ${settingsPath})\n`;
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as {
      hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ type?: string; command?: string; timeout?: number }> }>>;
    };
    const hooks = parsed.hooks ?? {};
    const lines: string[] = [`### ${label}`, ""];
    let count = 0;
    for (const [event, entries] of Object.entries(hooks)) {
      for (const entry of entries ?? []) {
        for (const hook of entry.hooks ?? []) {
          count++;
          lines.push(`- ${event}: ${hook.type ?? "command"} timeout=${hook.timeout ?? "(default)"}`);
          lines.push(`  command: ${redactSecrets(hook.command ?? "(missing)")}`);
          if (entry.matcher) lines.push(`  matcher: ${entry.matcher}`);
        }
      }
    }
    if (count === 0) lines.push("(no hooks configured)");
    lines.push("");
    return lines.join("\n");
  } catch (err) {
    return `### ${label}\n\n(settings parse failed: ${redactSecrets(String(err))})\n`;
  }
}

function logFiles(cwd: string, teamagentHome: string): Array<{ label: string; file: string }> {
  return [
    { label: "TEAMAGENT_HOME update.log", file: path.join(teamagentHome, "update.log") },
    { label: "TEAMAGENT_HOME update-state.json", file: path.join(teamagentHome, "update-state.json") },
    { label: "project events.jsonl", file: path.join(cwd, ".teamagent", "events.jsonl") },
    { label: "project config.json", file: path.join(cwd, ".teamagent", "config.json") },
  ];
}

function renderFileBlock(label: string, file: string): string {
  const heading = `### ${label}`;
  if (!fs.existsSync(file)) return `${heading}\n\n(missing: ${file})\n`;
  try {
    const raw = readTail(file, MAX_LOG_BYTES);
    const text = redactSecrets(raw);
    return `${heading}\n\npath: ${file}\n\n\`\`\`text\n${text}\n\`\`\`\n`;
  } catch (err) {
    return `${heading}\n\n(read failed: ${redactSecrets(String(err))})\n`;
  }
}

function readTail(file: string, maxBytes: number): string {
  const stat = fs.statSync(file);
  const fd = fs.openSync(file, "r");
  try {
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead);
    const prefix = stat.size > maxBytes ? `[truncated: showing last ${maxBytes} bytes]\n` : "";
    return prefix + buffer.toString("utf-8");
  } finally {
    fs.closeSync(fd);
  }
}

export function redactSecrets(input: string): string {
  return input
    .replace(/(Authorization:\s*Bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(/\b(sk-ant-[A-Za-z0-9._-]+)/g, "[redacted]")
    .replace(/\b(sk-[A-Za-z0-9]{20,})\b/g, "[redacted]")
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,})\b/g, "[redacted]")
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD)[A-Z0-9_]*=)[^\s]+/gi, "$1[redacted]");
}

function firstLine(text: string): string {
  return text.split(/\r?\n/)[0] ?? text;
}
