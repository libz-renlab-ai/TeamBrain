#!/usr/bin/env node
/**
 * Updater 子进程 entry. Detached spawn 后由 SessionStart 调起.
 * 永远不阻塞主进程, 失败静默, 退出码恒为 0.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import {
  parseUpdateState,
  serializeUpdateState,
  defaultUpdateState,
  type UpdateState,
} from "@teamagent/core";
import { runUpdater } from "./updater-logic.js";
import { fetchRemoteSha } from "./github-api.js";

function teamagentHome(): string {
  return process.env["TEAMAGENT_HOME"] ?? path.join(os.homedir(), ".teamagent");
}
function statePath(): string { return path.join(teamagentHome(), "update-state.json"); }
function lockPath(): string { return path.join(teamagentHome(), "update.lock"); }
function logPath(): string { return path.join(teamagentHome(), "update.log"); }
function rollbackDir(): string { return path.join(teamagentHome(), "rollback"); }

const REPO_OWNER = "libz-renlab-ai";
const REPO_NAME = "TeamBrain";
const REPO_BRANCH = "release";
const PACKAGE_SPEC = `github:${REPO_OWNER}/${REPO_NAME}#${REPO_BRANCH}`;
const BACKUP_KEEP = 3;

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function log(msg: string): void {
  ensureDir(teamagentHome());
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logPath(), line, "utf-8"); } catch { /* silent */ }
}

function readState(): UpdateState {
  try {
    if (!fs.existsSync(statePath())) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(statePath(), "utf-8"));
  } catch {
    return defaultUpdateState();
  }
}

function writeState(s: UpdateState): void {
  ensureDir(teamagentHome());
  fs.writeFileSync(statePath(), serializeUpdateState(s), "utf-8");
}

function acquireLock(): boolean {
  ensureDir(teamagentHome());
  try {
    const fd = fs.openSync(lockPath(), "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    // Stale lock detection: if pid not alive, force-take
    try {
      const pid = parseInt(fs.readFileSync(lockPath(), "utf-8"), 10);
      if (pid > 0) {
        try {
          process.kill(pid, 0);  // throws if dead
          return false;          // alive — real concurrent updater
        } catch {
          fs.unlinkSync(lockPath());
          fs.writeFileSync(lockPath(), String(process.pid), "utf-8");
          return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  }
}

function releaseLock(): void {
  try { fs.unlinkSync(lockPath()); } catch { /* silent */ }
}

function findGlobalDistDir(): string | null {
  // bin-updater.cjs lives in the same dist/ as bin.js after install.
  // __dirname at runtime points to the dist dir.
  const candidate = __dirname;
  if (fs.existsSync(path.join(candidate, "bin.js"))) return candidate;
  return null;
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function backupCurrentInstall(oldSha: string): string {
  ensureDir(rollbackDir());
  const dist = findGlobalDistDir();
  if (!dist) return "";
  const tag = oldSha || `pre-${Date.now()}`;
  const dest = path.join(rollbackDir(), tag);
  fs.rmSync(dest, { recursive: true, force: true });
  try {
    copyDirSync(dist, dest);
    return dest;
  } catch (e) {
    log(`backup failed: ${(e as Error).message}`);
    return "";
  }
}

function restoreFromBackup(backupDir: string): void {
  if (!backupDir || !fs.existsSync(backupDir)) return;
  const dist = findGlobalDistDir();
  if (!dist) return;
  try {
    fs.rmSync(dist, { recursive: true, force: true });
    copyDirSync(backupDir, dist);
    log(`restored from ${backupDir}`);
  } catch (e) {
    log(`restore failed: ${(e as Error).message}`);
  }
}

function pruneOldBackups(): void {
  if (!fs.existsSync(rollbackDir())) return;
  try {
    const entries = fs.readdirSync(rollbackDir())
      .map((name) => ({ name, mtime: fs.statSync(path.join(rollbackDir(), name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const entry of entries.slice(BACKUP_KEEP)) {
      fs.rmSync(path.join(rollbackDir(), entry.name), { recursive: true, force: true });
    }
  } catch { /* silent */ }
}

function runNpmInstall(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(npm, ["install", "-g", PACKAGE_SPEC], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TEAMAGENT_SKIP_WARMUP: "1" },
      shell: process.platform === "win32",
    });
    let err = "";
    child.stderr?.on("data", (d) => { err += String(d); });
    child.on("exit", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: err.slice(-500) || `exit ${code}` });
    });
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

function runMigrateAuto(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const dist = findGlobalDistDir();
    if (!dist) return resolve({ ok: true });
    const binJs = path.join(dist, "bin.js");
    if (!fs.existsSync(binJs)) return resolve({ ok: true });
    const child = spawn(process.execPath, [binJs, "migrate-auto"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr?.on("data", (d) => { err += String(d); });
    child.on("exit", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: err.slice(-500) || `exit ${code}` });
    });
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

async function main(): Promise<void> {
  log("updater started");
  await runUpdater({
    fetchRemoteSha: () => fetchRemoteSha({ owner: REPO_OWNER, repo: REPO_NAME, branch: REPO_BRANCH }),
    runNpmInstall,
    runMigrateAuto,
    backupCurrentInstall,
    restoreFromBackup,
    pruneOldBackups,
    readState,
    writeState,
    log,
    now: () => Date.now(),
    acquireLock,
    releaseLock,
  });
  log("updater exit");
}

main().catch((e) => log(`updater crash: ${(e as Error).message}`));
