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
  fs.mkdirSync(home(), { recursive: true });
  fs.writeFileSync(statePath(), serializeUpdateState(s), "utf-8");
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
  const lines = [
    `auto-update: ${disabled ? "DISABLED (~/.teamagent/auto-update.disabled)" : "enabled"}`,
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

async function checkCmd(): Promise<UpdateRunResult> {
  const { fetchRemoteSha } = await import("../github-api.js");
  const remote = await fetchRemoteSha({ owner: REPO_OWNER, repo: REPO_NAME, branch: REPO_BRANCH });
  const local = readState().last_installed_sha;
  if (!remote) return { ok: false, output: "fetch failed (network/rate-limit)\n" };
  if (remote === local) return { ok: true, output: `up-to-date (${local.slice(0, 7)})\n` };
  return { ok: true, output: `update available: ${(local || "(none)").slice(0, 7)} -> ${remote.slice(0, 7)}\n` };
}

async function nowCmd(): Promise<UpdateRunResult> {
  // Reset throttle so updater proceeds, then run in foreground
  const s = readState();
  s.last_check_ts = 0;
  s.consecutive_install_failures = 0;
  writeState(s);
  return new Promise((resolve) => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // Find bin-updater.cjs: dev = packages/cli/dist/bin-updater.cjs (not exist if not built),
    // installed = same dir as bin.js
    const candidates = [
      path.resolve(here, "..", "bin-updater.cjs"),
      path.resolve(here, "..", "..", "dist", "bin-updater.cjs"),
    ];
    const updaterBin = candidates.find((p) => fs.existsSync(p));
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
