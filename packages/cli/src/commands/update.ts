import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  defaultUpdateState,
  nextSnooze,
  parseUpdateState,
  type UpdateState,
} from "@teamagent/core";
import type { FetchShaFailure } from "../github-api.js";
import { withUpdateStateLock } from "../lib/update-state-lock.js";

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
  | "check" | "now" | "status" | "disable" | "enable" | "rollback" | "logs"
  | "snooze" | "never";

export interface UpdateRunResult { ok: boolean; output: string; }

export function readState(): UpdateState {
  try {
    if (!fs.existsSync(statePath())) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(statePath(), "utf-8"));
  } catch { return defaultUpdateState(); }
}

export function writeState(s: UpdateState): void {
  // Issue #244: route every persist of update-state.json through the file lock
  // helper. Each cmd here (snoozeCmd / neverCmd / enableCmd / nowCmd / checkCmd
  // / rollbackCmd) does a read → mutate → write sequence; without serialization
  // a concurrent SessionStart hook + a foreground update cmd can interleave and
  // silently lose either side's mutation. The helper wraps the persist under an
  // exclusive lock at <home>/update-state.lock and writes atomically (tmp +
  // rename, same primitive that previously lived inline here).
  //
  // Caller still passes a fully-formed `s`, so the mutator is a passthrough —
  // we explicitly want the foreground command's intent to win for the fields
  // it touched, including timestamps. This intentionally does NOT re-merge with
  // a fresh read inside the lock: cmd writers already read state ~1 ms before
  // calling writeState, so the staleness window is microseconds and the
  // simpler passthrough preserves prior caller contracts.
  withUpdateStateLock(home(), () => s);
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
    case "snooze":   return snoozeCmd();
    case "never":    return neverCmd();
  }
}

/**
 * Issue #225 — soft-force upgrade snooze advance.
 *
 * Reads `state.snooze_level`, calls `nextSnooze` to compute the new
 * `snooze_until_ts`, persists. Returns a one-line confirmation telling
 * the user how long the banner will stay silent.
 */
function snoozeCmd(): UpdateRunResult {
  const s = readState();
  const result = nextSnooze(s.snooze_level, Date.now());
  writeState({
    ...s,
    snooze_level: result.snooze_level,
    snooze_until_ts: result.snooze_until_ts,
    // Issue #225 iter-1: dismissing for THIS pending_banner.to so the prompt
    // stops re-firing across SessionStarts (until a new version's banner lands).
    prompt_dismissed_for_to: s.pending_banner?.to ?? "",
  });
  const hours = Math.round((result.snooze_until_ts - Date.now()) / (60 * 60 * 1000));
  const human =
    hours >= 24 ? `${Math.round(hours / 24)} 天` : `${hours} 小时`;
  return {
    ok: true,
    output:
      `升级提示已 snooze 到 ${new Date(result.snooze_until_ts).toLocaleString()}` +
      ` (静音约 ${human}, 当前 snooze 级别 ${result.snooze_level})\n` +
      `撤销: teamagent update --enable\n`,
  };
}

/**
 * Issue #225 — set never_prompt=true (permanent opt-out for the upgrade
 * banner). Does NOT touch the auto-update.disabled marker — auto-update
 * itself stays enabled (user can still run `teamagent update --now`),
 * only the SessionStart prompt is silenced.
 */
function neverCmd(): UpdateRunResult {
  const s = readState();
  writeState({
    ...s,
    never_prompt: true,
    // Issue #225 iter-1: also dismiss the current pending_banner.to so even if
    // the user later un-sets never_prompt via --enable, this version doesn't
    // re-fire (a brand new pending_banner.to will fire fresh).
    prompt_dismissed_for_to: s.pending_banner?.to ?? "",
  });
  return {
    ok: true,
    output:
      `升级提示已永久关闭 (never_prompt=true)。\n` +
      `auto-update 仍开启 — 升级请手动跑 teamagent update --now。\n` +
      `撤销: teamagent update --enable\n`,
  };
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
    // Issue #225: surface soft-force prompt state so support can diagnose
    // "why is the upgrade banner not showing?" without dumping JSON.
    `never_prompt: ${s.never_prompt ? "true (set by --never; clear with --enable)" : "false"}`,
    `snooze_level: ${s.snooze_level}`,
    `snooze_until: ${
      s.snooze_until_ts
        ? new Date(s.snooze_until_ts).toISOString()
        : "(none)"
    }`,
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
  // Issue #225: --enable also clears the soft-force opt-out + snooze so the
  // user can fully reset the prompt state with one command. Without this,
  // a user who set --never would have to hand-edit update-state.json.
  // iter-1: also clears prompt_dismissed_for_to so the user explicitly opting
  // back IN sees the current pending_banner's prompt next SessionStart.
  const s = readState();
  if (
    s.never_prompt ||
    s.snooze_level !== 0 ||
    s.snooze_until_ts !== 0 ||
    s.prompt_dismissed_for_to !== ""
  ) {
    writeState({
      ...s,
      never_prompt: false,
      snooze_level: 0,
      snooze_until_ts: 0,
      prompt_dismissed_for_to: "",
    });
    return {
      ok: true,
      output: "auto-update enabled (升级提示也已恢复: never_prompt=false, snooze 已重置)\n",
    };
  }
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
  // Reset throttle so updater proceeds, then run in foreground.
  // Issue #225: also clear snooze + never_prompt — user just said "yes go",
  // so leaving the prompt silenced afterwards would be confusing.
  // Issue #225 iter-1: also dismiss the current pending_banner.to so the
  // prompt doesn't re-fire on the SessionStart immediately after `--now`
  // (the user just acknowledged this version).
  const s = readState();
  s.last_check_ts = 0;
  s.consecutive_install_failures = 0;
  s.snooze_level = 0;
  s.snooze_until_ts = 0;
  s.never_prompt = false;
  s.prompt_dismissed_for_to = s.pending_banner?.to ?? "";
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
    if (a === "--snooze") return { sub: "snooze", rest: [] };
    if (a === "--never") return { sub: "never", rest: [] };
    if (a === "--rollback") {
      const idx = argv.indexOf("--rollback");
      return { sub: "rollback", rest: argv.slice(idx + 1).filter((x) => !x.startsWith("--")) };
    }
  }
  return { sub: "status", rest: [] };
}
