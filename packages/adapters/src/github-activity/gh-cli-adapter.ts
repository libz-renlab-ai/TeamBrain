import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import type {
  GitHubActivityPort,
  GitHubCommit,
  GitHubIssue,
  GitHubPullRequest,
} from "@teamagent/ports";

/**
 * gh-cli backed GitHubActivityPort. Shells out to `gh api` for commits / PRs /
 * issues, falling back to `git log` for commits when `gh` is unavailable.
 * On total failure all three methods return an empty array (contract allowed)
 * — caller's correlate() pass treats absence as "no GitHub activity".
 *
 * Spawner is injected so tests can replay deterministic fixtures without
 * touching the network or filesystem.
 */
export interface GhSpawner {
  (
    command: string,
    args: string[],
    options: { timeoutMs: number }
  ): Promise<GhSpawnResult>;
}

export type GhSpawnResult =
  | { kind: "exit"; code: number; stdout: string; stderr: string }
  | { kind: "timeout" }
  | { kind: "enoent" }
  | { kind: "error"; message: string };

export interface GhCliGitHubActivityAdapterOptions {
  /** Defaults to `"gh"`. */
  ghExecutable?: string;
  /** Defaults to `"git"`. */
  gitExecutable?: string;
  /** Per-call timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** Inject a custom spawner (tests). */
  spawner?: GhSpawner;
  /**
   * When `project` is omitted from a fetch call, the adapter has no canonical
   * way to infer the repo without consulting the working directory's git
   * remote. Set this to a fixed slug to avoid that surface; otherwise the
   * adapter returns [] for omitted-project calls.
   */
  defaultProject?: string;
}

/**
 * Strict allowlists for argv values that flow into `gh api` / `git log`.
 *
 * On Windows the default spawner uses `shell: true` (so cmd.exe honors
 * PATHEXT for finding `gh.cmd` / `git.cmd`); without these guards an
 * attacker-controlled member or project value containing shell metachars
 * (`& | ; < > ( ) \` $ " % ^`) would be interpreted by cmd.exe and could
 * pivot to RCE. The patterns intentionally reject ANY of those bytes.
 *
 * - author: GitHub login or git author name. GitHub logins are
 *   ASCII alphanumeric + dash; git author names may include dots,
 *   underscores, `@`, `+` and spaces. We allow that conservative subset.
 * - project: GitHub repo slug `owner/repo`. Each segment must be
 *   alphanumeric + dot/underscore/dash.
 */
const AUTHOR_PATTERN = /^[A-Za-z0-9._@+ -]+$/;
const PROJECT_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export class GhCliGitHubActivityAdapter implements GitHubActivityPort {
  private readonly ghExecutable: string;
  private readonly gitExecutable: string;
  private readonly timeoutMs: number;
  private readonly spawner: GhSpawner;
  private readonly defaultProject: string | undefined;

  constructor(opts: GhCliGitHubActivityAdapterOptions = {}) {
    this.ghExecutable = opts.ghExecutable ?? "gh";
    this.gitExecutable = opts.gitExecutable ?? "git";
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.spawner = opts.spawner ?? defaultGhSpawner;
    this.defaultProject = opts.defaultProject;
  }

  private isSafeArgv(opts: { author: string; project?: string }): boolean {
    if (!AUTHOR_PATTERN.test(opts.author)) return false;
    if (opts.project !== undefined && !PROJECT_PATTERN.test(opts.project))
      return false;
    return true;
  }

  async fetchCommitsByAuthor(opts: {
    author: string;
    project?: string;
    since: string;
    until: string;
  }): Promise<GitHubCommit[]> {
    if (!this.isSafeArgv(opts)) return [];
    const repo = opts.project ?? this.defaultProject;
    if (!repo) return [];
    if (!PROJECT_PATTERN.test(repo)) return [];
    const ghResult = await this.spawner(
      this.ghExecutable,
      [
        "api",
        `/repos/${repo}/commits?author=${encodeURIComponent(
          opts.author
        )}&since=${encodeURIComponent(opts.since)}&until=${encodeURIComponent(
          opts.until
        )}&per_page=100`,
      ],
      { timeoutMs: this.timeoutMs }
    );

    if (ghResult.kind === "exit" && ghResult.code === 0) {
      return parseCommits(ghResult.stdout, repo).filter((c) =>
        inWindow(c.authoredAt, opts.since, opts.until)
      );
    }
    // Fallback: git log --author=<x>
    return this.gitLogFallback(opts, repo);
  }

  async fetchPullRequestsByAuthor(opts: {
    author: string;
    project?: string;
    since: string;
    until: string;
  }): Promise<GitHubPullRequest[]> {
    if (!this.isSafeArgv(opts)) return [];
    const repo = opts.project ?? this.defaultProject;
    if (!repo) return [];
    if (!PROJECT_PATTERN.test(repo)) return [];
    const ghResult = await this.spawner(
      this.ghExecutable,
      [
        "api",
        `/search/issues?q=${encodeURIComponent(
          `repo:${repo} is:pr author:${opts.author} created:${opts.since}..${opts.until}`
        )}&per_page=100`,
      ],
      { timeoutMs: this.timeoutMs }
    );
    if (ghResult.kind === "exit" && ghResult.code === 0) {
      return parsePullRequests(ghResult.stdout, repo).filter((p) =>
        inWindow(p.createdAt, opts.since, opts.until)
      );
    }
    return [];
  }

  async fetchIssuesByAuthor(opts: {
    author: string;
    project?: string;
    since: string;
    until: string;
  }): Promise<GitHubIssue[]> {
    if (!this.isSafeArgv(opts)) return [];
    const repo = opts.project ?? this.defaultProject;
    if (!repo) return [];
    if (!PROJECT_PATTERN.test(repo)) return [];
    const ghResult = await this.spawner(
      this.ghExecutable,
      [
        "api",
        `/search/issues?q=${encodeURIComponent(
          `repo:${repo} is:issue author:${opts.author} created:${opts.since}..${opts.until}`
        )}&per_page=100`,
      ],
      { timeoutMs: this.timeoutMs }
    );
    if (ghResult.kind === "exit" && ghResult.code === 0) {
      return parseIssues(ghResult.stdout, repo).filter((i) =>
        inWindow(i.createdAt, opts.since, opts.until)
      );
    }
    return [];
  }

  private async gitLogFallback(
    opts: { author: string; since: string; until: string },
    repo: string
  ): Promise<GitHubCommit[]> {
    const sep = "<<<TEAMAGENT-LIVE-INSPECT-FIELD>>>";
    const recSep = "<<<TEAMAGENT-LIVE-INSPECT-REC>>>";
    const fmt = `%H${sep}%aI${sep}%an${sep}%s${recSep}`;
    // Defense in depth: even though isSafeArgv already rejected malicious
    // authors, also pin `--author=` syntax + drop everything after `--`
    // sentinel so an attacker-supplied value beginning with `--upload-pack=`
    // can never be reinterpreted as another git flag.
    const r = await this.spawner(
      this.gitExecutable,
      [
        "log",
        `--author=${opts.author}`,
        `--since=${opts.since}`,
        `--until=${opts.until}`,
        `--pretty=format:${fmt}`,
        "--no-merges",
        "--", // end-of-options sentinel: no more flags are parsed after this
      ],
      { timeoutMs: this.timeoutMs }
    );
    if (r.kind !== "exit" || r.code !== 0) return [];
    const out: GitHubCommit[] = [];
    for (const raw of r.stdout.split(recSep)) {
      const rec = raw.trim();
      if (!rec) continue;
      const [sha, authoredAt, author, message] = rec.split(sep);
      if (!sha || !authoredAt || !author) continue;
      out.push({
        sha,
        authoredAt,
        author,
        message: (message ?? "").trim(),
        repo,
      });
    }
    return out.filter((c) => inWindow(c.authoredAt, opts.since, opts.until));
  }
}

function inWindow(ts: string, since: string, until: string): boolean {
  return ts >= since && ts <= until;
}

function parseCommits(stdout: string, repo: string): GitHubCommit[] {
  let arr: unknown;
  try {
    arr = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: GitHubCommit[] = [];
  for (const raw of arr) {
    const r = raw as Record<string, unknown>;
    const commit = r["commit"] as Record<string, unknown> | undefined;
    const author = commit?.["author"] as Record<string, unknown> | undefined;
    const message = (commit?.["message"] as string | undefined) ?? "";
    const sha = (r["sha"] as string | undefined) ?? "";
    const authoredAt = (author?.["date"] as string | undefined) ?? "";
    const authorName =
      (author?.["name"] as string | undefined) ??
      ((r["author"] as Record<string, unknown> | undefined)?.["login"] as
        | string
        | undefined) ??
      "";
    if (!sha || !authoredAt || !authorName) continue;
    out.push({
      sha,
      message: message.split("\n")[0] ?? "",
      authoredAt,
      author: authorName,
      repo,
    });
  }
  return out;
}

function parsePullRequests(
  stdout: string,
  repo: string
): GitHubPullRequest[] {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return [];
  }
  const items = (payload as Record<string, unknown>)?.["items"];
  if (!Array.isArray(items)) return [];
  const out: GitHubPullRequest[] = [];
  for (const raw of items) {
    const r = raw as Record<string, unknown>;
    const number = r["number"];
    const title = r["title"];
    const state = r["state"];
    const createdAt = r["created_at"];
    const closedAt = (r["closed_at"] as string | null | undefined) ?? undefined;
    const pullRequest = r["pull_request"] as
      | Record<string, unknown>
      | undefined;
    const mergedAt = pullRequest?.["merged_at"] as string | null | undefined;
    const user = r["user"] as Record<string, unknown> | undefined;
    const login = (user?.["login"] as string | undefined) ?? "";
    if (
      typeof number !== "number" ||
      typeof title !== "string" ||
      typeof createdAt !== "string"
    )
      continue;
    let normalized: "open" | "closed" | "merged" = "open";
    if (mergedAt) normalized = "merged";
    else if (state === "closed") normalized = "closed";
    out.push({
      number,
      title,
      state: normalized,
      createdAt,
      closedAt: closedAt ?? undefined,
      mergedAt: mergedAt ?? undefined,
      author: login,
      repo,
    });
  }
  return out;
}

function parseIssues(stdout: string, repo: string): GitHubIssue[] {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return [];
  }
  const items = (payload as Record<string, unknown>)?.["items"];
  if (!Array.isArray(items)) return [];
  const out: GitHubIssue[] = [];
  for (const raw of items) {
    const r = raw as Record<string, unknown>;
    if (r["pull_request"]) continue; // search/issues returns PRs too
    const number = r["number"];
    const title = r["title"];
    const state = r["state"];
    const createdAt = r["created_at"];
    const closedAt = (r["closed_at"] as string | null | undefined) ?? undefined;
    const user = r["user"] as Record<string, unknown> | undefined;
    const login = (user?.["login"] as string | undefined) ?? "";
    const labelsRaw = r["labels"];
    const labels = Array.isArray(labelsRaw)
      ? labelsRaw
          .map((l) =>
            typeof l === "string"
              ? l
              : ((l as Record<string, unknown>)?.["name"] as string | undefined)
          )
          .filter((n): n is string => typeof n === "string")
      : [];
    if (
      typeof number !== "number" ||
      typeof title !== "string" ||
      typeof createdAt !== "string"
    )
      continue;
    out.push({
      number,
      title,
      state: state === "closed" ? "closed" : "open",
      createdAt,
      closedAt: closedAt ?? undefined,
      author: login,
      repo,
      labels,
    });
  }
  return out;
}

const defaultGhSpawner: GhSpawner = (command, args, options) => {
  return new Promise<GhSpawnResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = nodeSpawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        windowsHide: true,
      });
    } catch (err) {
      resolve({ kind: "error", message: String(err) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      resolve({ kind: "timeout" });
    }, options.timeoutMs);
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") resolve({ kind: "enoent" });
      else resolve({ kind: "error", message: err.message });
    });
    child.stdout?.on("data", (c) => {
      stdout += c.toString("utf-8");
    });
    child.stderr?.on("data", (c) => {
      stderr += c.toString("utf-8");
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ kind: "exit", code: code ?? 0, stdout, stderr });
    });
  });
};
