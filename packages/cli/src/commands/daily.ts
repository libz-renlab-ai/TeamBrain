/**
 * `teamagent daily` — issue #371 daily-summary CLI.
 *
 * Two purposes:
 *   1. Provide a deterministic, snapshot-able `--help` JSON output
 *      (per docs/feature-verification.md).
 *   2. Allow operators (and the verification harness) to call the same
 *      scanner/aggregator/rewriter pipeline the UserPromptSubmit hook uses,
 *      without going through Claude Code.
 *
 * Usage (also kept in sync with bin.ts top-level help):
 *
 *   teamagent daily [--projects-root=PATH] [--cwd=PATH] [--archive]
 *                   [--format=json|context] [--help]
 *
 *   --help              Print JSON help schema and exit.
 *   --projects-root     Override ~/.claude/projects (for tests/fixtures).
 *   --cwd               Override process.cwd() reference (informational).
 *   --archive           Also write ${TEAMAGENT_HOME}/daily/<date>.md.
 *   --format=json       Default. Print machine-readable JSON.
 *   --format=context    Print the additionalContext markdown the hook would
 *                       inject (useful for manual inspection / golden tests).
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  scanTodayActivity,
  digestProjectGroup,
  composeAdditionalContext,
  composeArchiveMarkdown,
  type ScanResult,
  type ProjectDigest,
} from "@teamagent/core";

export interface DailyOptions {
  /** Override `~/.claude/projects`. */
  projectsRoot?: string;
  /** Informational override of cwd; does not affect scanner output. */
  cwd?: string;
  /** Override ${TEAMAGENT_HOME}; for tests. */
  homeDir?: string;
  /** When true, write ${TEAMAGENT_HOME}/daily/<date>.md alongside stdout. */
  archive?: boolean;
  /** Output mode. */
  format?: "json" | "context";
  /** Show help and exit. */
  help?: boolean;
  /**
   * Informational label written into the archive's "Triggered by:" line.
   * Defaults to "cli" when invoked from the CLI; hook callers pass the
   * matcher reason (e.g. "whitelist", "slash") for audit-trail visibility.
   */
  triggeredBy?: string;
}

export interface DailyResult {
  readonly date: string;
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  readonly projects: ReadonlyArray<ProjectDigest>;
  readonly worktreeMergedCount: number;
  readonly skippedSessionCount: number;
  readonly archivedPath?: string;
  /** Always "cli" when invoked from this command; used by the judge harness. */
  readonly triggeredBy: "cli";
}

const HELP_PAYLOAD = {
  command: "teamagent daily",
  summary:
    "Aggregate today's Claude Code activity across all projects on this machine into a per-project digest. LLM-free.",
  usage:
    "teamagent daily [--projects-root=PATH] [--cwd=PATH] [--archive] [--format=json|context] [--help]",
  flags: {
    "--help": "Print this JSON help schema and exit.",
    "--projects-root":
      "Override `~/.claude/projects` (used by tests/fixture scans).",
    "--cwd":
      "Override the operator's cwd reference. Informational only; does not affect which sessions are scanned.",
    "--archive":
      "Also write ${TEAMAGENT_HOME}/daily/<YYYY-MM-DD>.md (overwrite-on-rerun).",
    "--format":
      'Output mode. "json" (default) emits machine-readable JSON; "context" emits the markdown additionalContext the UserPromptSubmit hook would inject.',
  },
  notes: [
    "Source: `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. No network.",
    "Worktrees under `.codex/worktrees/<task>` and `.claude/worktrees/<task>` are merged back to the host repo.",
    "TeamAgent itself never calls an LLM here — the additionalContext form is meant to be consumed by the operator's own Claude Code window.",
    'See `docs/plans/2026-05-13-issue-371-daily-summary/` for the verification playbook.',
  ],
  schema: {
    output: {
      date: "YYYY-MM-DD (local time)",
      windowStartMs: "epoch ms of today's local midnight",
      windowEndMs: "epoch ms when the scan ran",
      projects: "array of ProjectDigest objects (see @teamagent/core)",
      worktreeMergedCount: "how many groups contained at least one worktree session",
      skippedSessionCount: "how many jsonl files failed to parse",
      archivedPath: "path to the written archive markdown when --archive is set",
      triggeredBy: '"cli"',
    },
  },
} as const;

export function parseDailyArgs(argv: readonly string[]): DailyOptions {
  const opts: DailyOptions = { format: "json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      opts.help = true;
    } else if (a === "--archive") {
      opts.archive = true;
    } else if (a.startsWith("--projects-root=")) {
      opts.projectsRoot = a.slice("--projects-root=".length);
    } else if (a === "--projects-root") {
      opts.projectsRoot = argv[++i];
    } else if (a.startsWith("--cwd=")) {
      opts.cwd = a.slice("--cwd=".length);
    } else if (a === "--cwd") {
      opts.cwd = argv[++i];
    } else if (a.startsWith("--format=")) {
      const v = a.slice("--format=".length);
      if (v !== "json" && v !== "context") {
        throw new Error(`Unknown --format value: ${v}. Expected json|context.`);
      }
      opts.format = v;
    } else if (a === "--format") {
      const v = argv[++i];
      if (v !== "json" && v !== "context") {
        throw new Error(`Unknown --format value: ${v}. Expected json|context.`);
      }
      opts.format = v;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return opts;
}

export function renderDailyHelp(): string {
  return JSON.stringify(HELP_PAYLOAD, null, 2) + "\n";
}

/**
 * Compute the daily result without touching the archive on disk.
 */
export function buildDailyResult(opts: DailyOptions = {}): DailyResult {
  const home = opts.homeDir ?? os.homedir();
  const projectsRoot =
    opts.projectsRoot ?? path.join(home, ".claude", "projects");
  const scan: ScanResult = scanTodayActivity({ projectsRoot });
  const digests = scan.groups.map(digestProjectGroup);
  const worktreeMergedCount = digests.filter((d) => d.hadWorktreeSession).length;
  return {
    date: scan.date,
    windowStartMs: scan.windowStartMs,
    windowEndMs: scan.windowEndMs,
    projects: digests,
    worktreeMergedCount,
    skippedSessionCount: scan.skippedCount,
    triggeredBy: "cli",
  };
}

export interface DailyExecOutput {
  readonly result: DailyResult;
  /** Pretty-printed JSON for --format=json. */
  readonly json: string;
  /** Markdown for --format=context. */
  readonly contextMarkdown: string;
  /** Archive markdown body (always computed; written iff --archive). */
  readonly archiveMarkdown: string;
  /** Resolved archive file path even when --archive was not passed. */
  readonly archivePath: string;
}

export function executeDaily(opts: DailyOptions = {}): DailyExecOutput {
  const result = buildDailyResult(opts);
  const json = JSON.stringify(result, null, 2) + "\n";
  const matcherReason = opts.triggeredBy ?? "cli";
  const contextMarkdown = composeAdditionalContext({
    date: result.date,
    digests: result.projects,
    matcherReason,
  });
  const archiveMarkdown = composeArchiveMarkdown({
    date: result.date,
    digests: result.projects,
    matcherReason,
  });
  // Resolve archive root: TEAMAGENT_HOME env wins when set (matches the
  // convention used across the CLI — see install-state-fs-store.ts:62); else
  // <homeDir>/.teamagent (homeDir is operator's $HOME or the test override).
  const homeDir = opts.homeDir ?? os.homedir();
  const teamagentRoot =
    process.env["TEAMAGENT_HOME"] ?? path.join(homeDir, ".teamagent");
  const archivePath = path.join(teamagentRoot, "daily", `${result.date}.md`);

  if (opts.archive) {
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    // Atomic write: tmpfile + rename. Two concurrent operators (or the same
    // operator hitting `/daily` in two terminals at once) writing to the
    // same archive path would otherwise interleave on writeFileSync and
    // leave a half-written file. mkdtemp + rename is safe on the same fs.
    const tmpPath = `${archivePath}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    fs.writeFileSync(tmpPath, archiveMarkdown, "utf-8");
    fs.renameSync(tmpPath, archivePath);
    const out: DailyExecOutput = {
      result: { ...result, archivedPath: archivePath },
      json: JSON.stringify({ ...result, archivedPath: archivePath }, null, 2) + "\n",
      contextMarkdown,
      archiveMarkdown,
      archivePath,
    };
    return out;
  }
  return {
    result,
    json,
    contextMarkdown,
    archiveMarkdown,
    archivePath,
  };
}

export function renderDailyStdout(out: DailyExecOutput, opts: DailyOptions): string {
  const fmt = opts.format ?? "json";
  return fmt === "context" ? out.contextMarkdown + "\n" : out.json;
}
