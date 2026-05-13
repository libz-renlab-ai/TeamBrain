/**
 * `teamagent inspect-member <member>` — issue #372 click-time live
 * inspection. Pulls #308 AI events from ~/.teamagent/events.db and recent
 * GitHub activity via the GitHubActivityPort, correlates them, summarizes,
 * detects abnormal patterns, and (when abnormal) freezes an incident record.
 *
 * Per grill verdict §7 option C: this is NOT a daemon. It runs once per
 * leader click and exits.
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { randomBytes } from "node:crypto";
import {
  correlate,
  detectAbnormal,
  freezeIncident,
  summarize,
  type InspectionResult,
} from "@teamagent/core/live-inspection";
import {
  GhCliGitHubActivityAdapter,
  SqliteEventLog,
  openDb,
} from "@teamagent/adapters";
import type {
  GitHubActivityPort,
  GitHubCommit,
  GitHubIssue,
  GitHubPullRequest,
} from "@teamagent/ports";
import { InMemoryGitHubActivityPort } from "@teamagent/ports";
import type { PersistedEvent } from "@teamagent/types";

export interface InspectMemberOptions {
  member: string;
  project?: string;
  /** Window keyword. `session+24h` was removed as a placeholder; add it
   *  back once session-anchoring is wired through to a real anchor time. */
  window: "24h" | "7d" | "since-creation";
  /** ISO 8601; explicit injected "now" for determinism. */
  now: string;
  /** Optional output path for the inspection.json. */
  out?: string;
  /** If true, use the in-memory fake GitHub adapter (testing / judge harness). */
  githubFake?: boolean;
  /** Inject abnormal-path fixture into the fake event log. */
  fakeAbnormal?: "repeated_deny" | "education_loop" | "stuck";
  /** Override TEAMAGENT_HOME for tests / dry runs. */
  teamagentHome?: string;
}

export interface InspectMemberArgError {
  kind: "missing_member" | "bad_flag";
  message: string;
}

export class InspectMemberError extends Error {
  constructor(
    public readonly kind: InspectMemberArgError["kind"],
    message: string
  ) {
    super(message);
  }
}

export interface InspectMemberOutput {
  result: InspectionResult;
  inspectionPath: string;
  incidentPath?: string;
}

export function parseInspectMemberArgs(
  args: readonly string[]
): InspectMemberOptions {
  let member: string | undefined;
  let project: string | undefined;
  let window: InspectMemberOptions["window"] = "24h";
  let now: string | undefined;
  let out: string | undefined;
  let githubFake = false;
  let fakeAbnormal: InspectMemberOptions["fakeAbnormal"] | undefined;
  let teamagentHome: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--project") project = args[++i];
    else if (a?.startsWith("--project="))
      project = a.slice("--project=".length);
    else if (a === "--window") {
      const v = takeValue(args, ++i, "--window");
      if (v !== "24h" && v !== "7d" && v !== "since-creation") {
        throw new InspectMemberError(
          "bad_flag",
          `unknown --window value: ${v}`
        );
      }
      window = v;
    } else if (a === "--now") now = takeValue(args, ++i, "--now");
    else if (a?.startsWith("--now=")) now = a.slice("--now=".length);
    else if (a === "--out") out = takeValue(args, ++i, "--out");
    else if (a?.startsWith("--out=")) out = a.slice("--out=".length);
    else if (a === "--github-fake") githubFake = true;
    else if (a === "--fake-abnormal") {
      const v = takeValue(args, ++i, "--fake-abnormal");
      if (v !== "repeated_deny" && v !== "education_loop" && v !== "stuck") {
        throw new InspectMemberError(
          "bad_flag",
          `unknown --fake-abnormal value: ${v}`
        );
      }
      fakeAbnormal = v;
    } else if (a === "--teamagent-home")
      teamagentHome = takeValue(args, ++i, "--teamagent-home");
    else if (a?.startsWith("--teamagent-home="))
      teamagentHome = a.slice("--teamagent-home=".length);
    else if (a === "--help" || a === "-h") {
      // caller renders help; flag is intentionally a no-op here
    } else if (!a.startsWith("--") && !member) {
      member = a;
    }
  }

  if (!member) {
    throw new InspectMemberError(
      "missing_member",
      "missing member (positional argument)"
    );
  }
  return {
    member,
    project,
    window,
    now: now ?? new Date().toISOString(),
    out,
    githubFake,
    fakeAbnormal,
    teamagentHome,
  };
}

export function renderInspectMemberHelp(): string {
  return [
    "Usage: teamagent inspect-member <member> [options]",
    "",
    "Click-time live inspection of a team member (issue #372). Pulls #308",
    "AI events + recent GitHub activity, summarizes progress, and freezes",
    "an incident if abnormal signals are detected.",
    "",
    "Options:",
    "  --project <owner/repo>     GitHub repo slug (default: omit → fake-only)",
    "  --window <name>            24h | 7d | since-creation",
    "                             (default: 24h)",
    "  --now <ISO8601>            override 'now' (default: real wall clock)",
    "  --out <path>               also write inspection JSON here",
    "  --github-fake              use in-memory fake GitHub adapter",
    "  --fake-abnormal <kind>     inject a fake abnormal-path fixture",
    "                             (repeated_deny | education_loop | stuck)",
    "  --teamagent-home <dir>     override TEAMAGENT_HOME (default: env or",
    "                             ~/.teamagent)",
    "  -h, --help                 show this help",
  ].join("\n");
}

function takeValue(
  args: readonly string[],
  i: number,
  flag: string
): string {
  const v = args[i];
  if (v === undefined) {
    throw new InspectMemberError(
      "bad_flag",
      `${flag} requires a value`
    );
  }
  return v;
}

interface ExecuteDeps {
  eventReader?: (eventsDbPath: string) => readonly PersistedEvent[];
  githubFactory?: () => GitHubActivityPort;
  /** Random suffix generator (injectable for deterministic tests). */
  randomSuffix?: () => string;
  /** Inject fs writer so tests can capture writes without disk. */
  writeFile?: (filePath: string, contents: string) => void;
}

export async function executeInspectMember(
  opts: InspectMemberOptions,
  deps: ExecuteDeps = {}
): Promise<InspectMemberOutput> {
  const writeFile = deps.writeFile ?? defaultWriteFile;
  const randomSuffix = deps.randomSuffix ?? defaultRandomSuffix;
  const home =
    opts.teamagentHome ??
    process.env["TEAMAGENT_HOME"] ??
    path.join(os.homedir(), ".teamagent");

  const window = resolveWindow(opts.window, opts.now);
  const projectSlug = deriveProjectSlug(opts.project);

  // 1) AI events from events.db
  const eventsDbPath = path.join(home, "events.db");
  const events: PersistedEvent[] = opts.fakeAbnormal
    ? fakeAbnormalEvents(opts.fakeAbnormal, opts.now)
    : deps.eventReader
      ? Array.from(deps.eventReader(eventsDbPath))
      : readEventsFromDb(eventsDbPath);

  // 2) GitHub activity
  const ghPort = deps.githubFactory
    ? deps.githubFactory()
    : opts.githubFake
      ? new InMemoryGitHubActivityPort({
          commits: [],
          pullRequests: [],
          issues: [],
        })
      : new GhCliGitHubActivityAdapter({
          defaultProject: opts.project,
        });

  const [commits, prs, issues]: [
    GitHubCommit[],
    GitHubPullRequest[],
    GitHubIssue[],
  ] = await Promise.all([
    ghPort.fetchCommitsByAuthor({
      author: opts.member,
      project: opts.project,
      since: window.since,
      until: window.until,
    }),
    ghPort.fetchPullRequestsByAuthor({
      author: opts.member,
      project: opts.project,
      since: window.since,
      until: window.until,
    }),
    ghPort.fetchIssuesByAuthor({
      author: opts.member,
      project: opts.project,
      since: window.since,
      until: window.until,
    }),
  ]);

  // 3) correlate (pure)
  const { timeline, counts } = correlate({
    events,
    commits,
    pullRequests: prs,
    issues,
    window,
  });

  // 4) detect abnormal (pure)
  const abnormalSignals = detectAbnormal(counts);

  const result: InspectionResult = {
    member: opts.member,
    project: opts.project,
    window,
    generatedAt: opts.now,
    counts,
    timeline,
    abnormalSignals,
  };

  // 5) write inspection.json (always). Sanitize member for filename
  //    component so a malicious value like `../../etc/passwd` can never
  //    escape the inspections dir; project slug is already sanitized.
  const inspectionsDir = path.join(home, projectSlug, "inspections");
  const memberFsSafe = sanitize(opts.member);
  const inspectionFileName = `${tsForFilename(opts.now)}-${memberFsSafe}.json`;
  const inspectionPath = path.join(inspectionsDir, inspectionFileName);
  writeFile(inspectionPath, JSON.stringify(result, null, 2) + "\n");

  // 5b) also write --out if requested
  if (opts.out) writeFile(opts.out, JSON.stringify(result, null, 2) + "\n");

  // 6) freeze incident if abnormal
  let incidentPath: string | undefined;
  if (abnormalSignals.length > 0) {
    const incident = freezeIncident({
      result,
      now: opts.now,
      randomSuffix: randomSuffix(),
    });
    const incidentsDir = path.join(home, projectSlug, "incidents");
    incidentPath = path.join(incidentsDir, `${incident.incidentId}.json`);
    writeFile(incidentPath, JSON.stringify(incident, null, 2) + "\n");
  }

  return { result, inspectionPath, incidentPath };
}

export function renderInspectMemberResult(out: InspectMemberOutput): string {
  const md = summarize(out.result);
  const lines = [md, ""];
  lines.push(`> inspection: ${out.inspectionPath}`);
  if (out.incidentPath) lines.push(`> incident: ${out.incidentPath}`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────

function resolveWindow(
  window: InspectMemberOptions["window"],
  now: string
): { since: string; until: string } {
  // Window comparisons in correlate() use lexicographic ISO compare; both
  // bounds must be normalized to UTC `Z`. We always emit `Z` and (defensively)
  // re-normalize the until bound to canonical form so callers passing offset
  // form ("...+09:00") still compare correctly.
  const nowMs = new Date(now).getTime();
  const until = new Date(nowMs).toISOString();
  let sinceMs = nowMs;
  switch (window) {
    case "24h":
      sinceMs = nowMs - 24 * 3600 * 1000;
      break;
    case "7d":
      sinceMs = nowMs - 7 * 24 * 3600 * 1000;
      break;
    case "since-creation":
      sinceMs = 0; // 1970-01-01 — covers any sane repo lifetime
      break;
  }
  return { since: new Date(sinceMs).toISOString(), until };
}

function deriveProjectSlug(project: string | undefined): string {
  if (!project) {
    const cwd = process.cwd();
    return sanitize(path.basename(cwd));
  }
  // owner/repo → repo
  const parts = project.split("/");
  return sanitize(parts[parts.length - 1] ?? project);
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "-").toLowerCase() || "default";
}

function tsForFilename(now: string): string {
  return now.replace(/[-:]/g, "").replace(/T/, "T").slice(0, 15);
}

function defaultRandomSuffix(): string {
  return randomBytes(2).toString("hex");
}

function defaultWriteFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // mode 0o600 — incident.json + inspection.json contain timeline entries
  // with PersistedEvent payloads (user prompts, hook snippets). On shared
  // hosts the default umask would leave these world-readable.
  fs.writeFileSync(filePath, contents, { encoding: "utf-8", mode: 0o600 });
}

function readEventsFromDb(dbPath: string): PersistedEvent[] {
  if (!fs.existsSync(dbPath)) return [];
  let log: SqliteEventLog | undefined;
  try {
    log = new SqliteEventLog(openDb(dbPath));
    return log.readAll();
  } catch (err) {
    // Don't silently mask DB corruption as "no activity" — that produces
    // a misleading `no_activity` incident. Warn the operator so they can
    // see why the inspection saw no events.
    process.stderr.write(
      `inspect-member: failed to read events.db at ${dbPath}: ${
        err instanceof Error ? err.message : String(err)
      }\n`
    );
    return [];
  } finally {
    log?.close();
  }
}

function fakeAbnormalEvents(
  kind: NonNullable<InspectMemberOptions["fakeAbnormal"]>,
  now: string
): PersistedEvent[] {
  const events: PersistedEvent[] = [];
  const nowMs = new Date(now).getTime();
  const push = (
    eventKind: PersistedEvent["kind"],
    extra: Partial<PersistedEvent> = {}
  ) => {
    events.push({
      id: `fake-${eventKind}-${events.length}`,
      kind: eventKind,
      timestamp: new Date(nowMs - events.length * 60_000).toISOString(),
      schema_version: 1,
      ...extra,
    });
  };
  if (kind === "repeated_deny") {
    for (let i = 0; i < 3; i++) push("hook-pre.blocked");
  } else if (kind === "education_loop") {
    for (let i = 0; i < 3; i++) push("ai.narrative.recurred");
  } else if (kind === "stuck") {
    for (let i = 0; i < 10; i++) push("ai.narrative.injected");
  }
  return events;
}
