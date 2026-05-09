import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  defaultUpdateState,
  parseUpdateState,
  serializeUpdateState,
  type UpdateState,
} from "@teamagent/core";
import type { FetchShaFailure } from "../github-api.js";

/**
 * Resolve a GitHub token for authenticated API calls.
 * Strict priority: TEAMAGENT_GITHUB_TOKEN > GITHUB_TOKEN > GH_TOKEN > undefined.
 * Empty string counts as unset.
 */
export function resolveGithubToken(): string | undefined {
  return process.env["TEAMAGENT_GITHUB_TOKEN"]
      || process.env["GITHUB_TOKEN"]
      || process.env["GH_TOKEN"]
      || undefined;
}

function home(): string {
  return process.env["TEAMAGENT_HOME"] ?? path.join(os.homedir(), ".teamagent");
}
function statePath(): string { return path.join(home(), "update-state.json"); }
function disabledPath(): string { return path.join(home(), "auto-update.disabled"); }
function logFilePath(): string { return path.join(home(), "update.log"); }
function rollbackDir(): string { return path.join(home(), "rollback"); }

const REPO_OWNER = "libz-renlab-ai";
const REPO_NAME = "TeamBrain";
const REPO_BRANCH = "release";

export type UpdateSubcommand =
  | "check" | "now" | "status" | "disable" | "enable" | "rollback" | "logs";

export interface UpdateRunResult { ok: boolean; output: string; }

export function readState(): UpdateState {
  try {
    if (!fs.existsSync(statePath())) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(statePath(), "utf-8"));
  } catch { return defaultUpdateState(); }
}

export function writeState(s: UpdateState): void {
  // Atomic write: tmp file + rename. Guards against truncation when checkCmd
  // (foreground) and bin-updater (background) write concurrently — without this,
  // a Windows reader can observe a half-written JSON file and parseUpdateState
  // falls back to defaults, losing last_installed_sha and triggering a spurious
  // reinstall. POSIX rename is atomic; Windows rename over an existing file
  // (since Node 12) uses MoveFileEx with MOVEFILE_REPLACE_EXISTING.
  const dir = home();
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteFile(statePath(), serializeUpdateState(s));
}

/**
 * Write `body` to `target` atomically: write to a per-pid+random tmp path,
 * then rename. The randomness defeats PID-reuse collisions when two writers
 * happen to share a PID. On Windows, rename can transiently fail with
 * EPERM/EBUSY when antivirus scans the tmp file — retry up to 3 times with
 * a 50ms sleep before giving up.
 */
function atomicWriteFile(target: string, body: string): void {
  const tmp = `${target}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
  fs.writeFileSync(tmp, body, "utf-8");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === "EPERM" || code === "EBUSY") && attempt < 2) {
        // Busy-wait briefly; cross-platform sleepSync without async.
        const until = Date.now() + 50;
        while (Date.now() < until) { /* spin */ }
        continue;
      }
      // Best-effort cleanup of the tmp before re-throwing.
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw e;
    }
  }
}

export function findUpdaterBinary(baseUrl = import.meta.url): string | null {
  const here = path.dirname(fileURLToPath(baseUrl));
  // issue #151: published artifacts (npm flat dist, monorepo packages/cli/dist)
  // keep update-*.js and bin-updater.cjs as siblings; the legacy candidates
  // jumped out of dist/ and never matched any real install layout. Prepend the
  // sibling path; keep legacy entries as fallback for unforeseen layouts.
  const candidates = [
    path.resolve(here, "bin-updater.cjs"),
    path.resolve(here, "..", "bin-updater.cjs"),
    path.resolve(here, "..", "..", "dist", "bin-updater.cjs"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export async function runUpdateCommand(sub: UpdateSubcommand, args: string[] = []): Promise<UpdateRunResult> {
  switch (sub) {
    case "status":   return statusCmd();
    case "disable":  return disableCmd();
    case "enable":   return enableCmd();
    case "logs":     return logsCmd();
    case "check":    return checkCmd();
    case "now":      return nowCmd();
    case "rollback": return rollbackCmd(args[0]);
  }
}

function statusCmd(): UpdateRunResult {
  const s = readState();
  const disabled = fs.existsSync(disabledPath());
  const updaterBin = findUpdaterBinary();
  const lines = [
    `auto-update: ${disabled ? "DISABLED (~/.teamagent/auto-update.disabled)" : "enabled"}`,
    `updater_binary: ${updaterBin ?? "missing (build with: pnpm --filter @teamagent/cli build:hook)"}`,
    `interval_hours: ${s.interval_hours}`,
    `last_check: ${s.last_check_ts ? new Date(s.last_check_ts).toISOString() : "never"}`,
    `last_installed_sha: ${s.last_installed_sha || "(unknown)"}`,
    `last_installed_version: ${s.last_installed_version || "(unknown)"}`,
    `consecutive_install_failures: ${s.consecutive_install_failures}`,
    `last_install_error: ${s.last_install_error ?? "none"}`,
    `pending_banner: ${s.pending_banner
      ? `${(s.pending_banner.from || "(none)").slice(0, 7)} -> ${s.pending_banner.to.slice(0, 7)} (shown=${s.pending_banner.shown})`
      : "none"}`,
  ];
  return { ok: true, output: lines.join("\n") + "\n" };
}

function disableCmd(): UpdateRunResult {
  fs.mkdirSync(home(), { recursive: true });
  fs.writeFileSync(disabledPath(), `disabled at ${new Date().toISOString()}\n`, "utf-8");
  return { ok: true, output: `auto-update disabled (${disabledPath()})\n` };
}

function enableCmd(): UpdateRunResult {
  if (fs.existsSync(disabledPath())) fs.unlinkSync(disabledPath());
  return { ok: true, output: "auto-update enabled\n" };
}

function logsCmd(): UpdateRunResult {
  if (!fs.existsSync(logFilePath())) return { ok: true, output: "(empty)\n" };
  const text = fs.readFileSync(logFilePath(), "utf-8");
  const lines = text.split(/\r?\n/);
  const tail = lines.slice(-50).join("\n");
  return { ok: true, output: tail + "\n" };
}

function formatCheckFailure(result: FetchShaFailure): string {
  return result.message;
}

async function checkCmd(): Promise<UpdateRunResult> {
  const { fetchRemoteSha } = await import("../github-api.js");
  const s = readState();

  // Honor the same exponential backoff the auto-updater respects. Without this
  // guard, looping `teamagent update --check` (the exact entry-point that
  // surfaced #159) bypasses backoff and re-exhausts the 60 req/h anonymous
  // quota on every invocation.
  if (s.next_check_after_ts > 0 && Date.now() < s.next_check_after_ts) {
    const until = new Date(s.next_check_after_ts).toISOString();
    return { ok: false, output: `auto-updater backoff active until ${until}; skip\n` };
  }

  const result = await fetchRemoteSha({
    owner: REPO_OWNER, repo: REPO_NAME, branch: REPO_BRANCH,
    token: resolveGithubToken(),
    ifNoneMatch: s.last_branch_etag || undefined,
    cachedSha: s.last_branch_sha || undefined,
  });
  if (!result.ok) {
    // On rate-limit, persist the same backoff fields runUpdater would. Foreground
    // and background share one window; failures from either path advance both.
    if (result.reason === "rate_limit_anonymous" || result.reason === "rate_limit_authed") {
      const next = s.consecutive_rate_limits + 1;
      const delayHours = Math.min(2 ** (next - 1), 24);
      writeState({
        ...s,
        consecutive_rate_limits: next,
        next_check_after_ts: Date.now() + delayHours * 3600 * 1000,
      });
    }
    return { ok: false, output: formatCheckFailure(result) + "\n" };
  }
  // Persist etag/sha for next conditional GET; reset rate-limit counters on success (§ 2.4)
  writeState({
    ...s,
    last_branch_etag: result.etag ?? "",
    last_branch_sha: result.sha,
    consecutive_rate_limits: 0,
    next_check_after_ts: 0,
  });
  const local = s.last_installed_sha;
  if (result.sha === local) return { ok: true, output: `up-to-date (${local.slice(0, 7)})\n` };
  return { ok: true, output: `update available: ${(local || "(none)").slice(0, 7)} -> ${result.sha.slice(0, 7)}\n` };
}

async function nowCmd(): Promise<UpdateRunResult> {
  // Reset throttle so updater proceeds, then run in foreground
  const s = readState();
  s.last_check_ts = 0;
  s.consecutive_install_failures = 0;
  writeState(s);
  return new Promise((resolve) => {
    const updaterBin = findUpdaterBinary();
    if (!updaterBin) {
      resolve({ ok: false, output: "bin-updater.cjs not found; run pnpm --filter @teamagent/cli build:hook first\n" });
      return;
    }
    const child = spawn(process.execPath, [updaterBin], { stdio: "inherit" });
    child.on("exit", (code) => resolve({
      ok: code === 0,
      output: code === 0
        ? "update run finished. teamagent update --status to inspect.\n"
        : `updater exit ${code}\n`,
    }));
  });
}

function rollbackCmd(target?: string): UpdateRunResult {
  if (!fs.existsSync(rollbackDir())) return { ok: false, output: "no backups\n" };
  const entries = fs.readdirSync(rollbackDir()).sort();
  if (entries.length === 0) return { ok: false, output: "no backups\n" };
  if (!target) {
    return {
      ok: true,
      output: "available backups:\n" + entries.map((e) => "  " + e).join("\n") + "\n用 teamagent update --rollback <sha> 恢复\n",
    };
  }
  if (!entries.includes(target)) return { ok: false, output: `backup not found: ${target}\n` };
  const src = path.join(rollbackDir(), target);
  const dist = findGlobalDist();
  if (!dist) return { ok: false, output: "cannot locate global teamagent dist\n" };
  fs.rmSync(dist, { recursive: true, force: true });
  copyDir(src, dist);
  const s = readState();
  s.last_installed_sha = target;
  s.pending_banner = null;
  writeState(s);
  return { ok: true, output: `rolled back to ${target}\n` };
}

function findGlobalDist(): string | null {
  try {
    const root = String(execSync("npm root -g", { stdio: ["ignore", "pipe", "ignore"] })).trim();
    const dist = path.join(root, "teamagent", "dist");
    if (fs.existsSync(path.join(dist, "bin.js"))) return dist;
  } catch { /* ignore */ }
  return null;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function parseUpdateArgs(argv: string[]): { sub: UpdateSubcommand; rest: string[] } {
  for (const a of argv) {
    if (a === "--check") return { sub: "check", rest: [] };
    if (a === "--now") return { sub: "now", rest: [] };
    if (a === "--status") return { sub: "status", rest: [] };
    if (a === "--disable") return { sub: "disable", rest: [] };
    if (a === "--enable") return { sub: "enable", rest: [] };
    if (a === "--logs") return { sub: "logs", rest: [] };
    if (a === "--rollback") {
      const idx = argv.indexOf("--rollback");
      return { sub: "rollback", rest: argv.slice(idx + 1).filter((x) => !x.startsWith("--")) };
    }
  }
  return { sub: "status", rest: [] };
}
