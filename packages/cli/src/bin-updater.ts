#!/usr/bin/env node
/**
 * Updater 子进程 entry — HookShell migration (M6 fused PR).
 *
 * 这个 bin 与其它 7 个 hook channel 形态略有不同：
 *
 *   1. **不接收 stdin payload** —— SessionStart 用 `spawn(..., { stdio: "ignore" })`
 *      把它 detached fire-and-forget 出去，子进程的 stdin 是关闭的。
 *      `runHook` 的 `readStdinJson` 对空 stdin 返回 `null`，所以 `parseInput`
 *      必须把 `null` 也转成一个非空 sentinel（这里用 `{}`），否则 shell 会
 *      在调用 handler 之前 fast-exit、永远跑不到 updater 逻辑。
 *
 *   2. **完全静默对外** —— 永不 stderr / stdout，全部细节进 `~/.teamagent/update.log`。
 *      因此 handler 不调用 `ctx.bus.emit` —— `AttributionEvent` 当前没有
 *      `Updater` 相关 kind（commit 4 已冻结），而且 updater 的设计就是不要
 *      打扰用户；要给用户看的 banner（`✨ TeamAgent: 已自动更新 …`）由
 *      `session-start-logic.ts` 的 `maybeShowPendingBanner` 在下一次 SessionStart
 *      读取 `pending_banner` 时打印，这条路径不在本 bin 内。
 *
 *   3. **store / eventLog 完全不开** —— Codex review on PR #152 (P1) 指出：
 *      默认的 `runHook` layer 会无条件 open `DualLayerStore` 和
 *      `SqliteEventLog`，而 `DualLayerStore` 的 ctor 会**创建**
 *      `<cwd>/.teamagent/knowledge.db`（即使无写入）。后果：updater 在后台跑
 *      时会副作用地为当前 cwd 建出 `knowledge.db`，下一次 SessionStart 的
 *      `decideAction` 检测到该文件，直接 `skip-already-initialized`，
 *      把"应该 auto-init 的新项目"误判成"已初始化"。
 *
 *      因此本 bin **必须**走 `runAdvancedHook` + `escape.manualResources: true`
 *      —— shell 只提供 lazy resource getter，handler 不调用 `ctx.store()` /
 *      `ctx.eventLog()`，sqlite 句柄就完全不开、`knowledge.db` 不被创建。
 *      与 bin-session-start 同形（SessionStart 也用 manualResources 处理同样
 *      的 detection-vs-creation 时序问题）。
 *
 *   4. **HTTP / npm install / migrate 子进程逻辑全部留在 handler 内** ——
 *      shell 只管 lifecycle（stdin parse、resource open/close、exit 0），
 *      实际的 fetchRemoteSha / runNpmInstall / runMigrateAuto / backup / lock
 *      原样保留，由 `runUpdater(deps)` 串联。
 *
 *   5. CJS bundle 不支持 top-level await，用 `async main()` + `void main()`，
 *      与 bin-post-tool-use canary 同形。runHook 内部 try/finally 保证不抛
 *      （任何异常都被 logFallback 吞掉再 exit 0），所以 main 不需要 .catch。
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
import { resolveGithubToken } from "./commands/update.js";
import { runAdvancedHook } from "./hook-shell/index.js";

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
// Use the tarball URL instead of the npm `github:` shorthand: the shorthand
// resolves to `git+ssh://git@github.com/...`, which fails on machines without
// an SSH key configured for GitHub. The tarball goes over plain HTTPS and
// avoids the entire git-clone path (faster + works in restricted networks).
const PACKAGE_SPEC = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.tar.gz`;
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
  // Atomic write: tmp file + rename. Same rationale as commands/update.ts —
  // checkCmd and bin-updater both write update-state.json without sharing a
  // lock; non-atomic writes can produce a half-written file that
  // parseUpdateState rejects, falling back to defaults and triggering a
  // spurious reinstall. Tmp filename includes randomness to defeat PID-reuse
  // collisions; rename retries on Windows EPERM/EBUSY (transient AV holds).
  ensureDir(teamagentHome());
  const target = statePath();
  const tmp = `${target}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
  fs.writeFileSync(tmp, serializeUpdateState(s), "utf-8");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === "EPERM" || code === "EBUSY") && attempt < 2) {
        const until = Date.now() + 50;
        while (Date.now() < until) { /* spin */ }
        continue;
      }
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      throw e;
    }
  }
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
      if (code === 0) return resolve({ ok: true });
      // B-151: when the global bin.js is a symlink/pnpm-link back to monorepo
      // source, migrate-v6 / migrate-v7 import chains can hit ERR_UNKNOWN_FILE_EXTENSION
      // on a `.ts` source file (node refusing to load TS without a loader). That
      // is a dev/link installation artifact, not a real migration failure, so
      // we degrade to ok without bumping consecutive_install_failures.
      if (
        err.includes("ERR_UNKNOWN_FILE_EXTENSION") &&
        /\.ts(\b|['"])/.test(err)
      ) {
        return resolve({ ok: true });
      }
      resolve({ ok: false, error: err.slice(-500) || `exit ${code}` });
    });
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

async function main(): Promise<void> {
  // Use `Record<string, never>` for input (no payload) and `undefined` for the
  // stdout return type. `parseInput` ignores stdin entirely and returns `{}` so
  // the shell never fast-exits before invoking the handler — see file header
  // note 1.
  //
  // `escape.manualResources: true` (Codex P1 fix on PR #152): updater is
  // stdout/stderr-silent and does not write sqlite. The default `runHook`
  // layer eagerly opens `DualLayerStore` + `SqliteEventLog` which has the
  // side effect of creating `<cwd>/.teamagent/knowledge.db`, which would
  // flip later `SessionStart.decideAction` to `skip-already-initialized`
  // (because that decision keys off `knowledge.db` existence). With
  // manualResources the shell never opens sqlite handles unless the
  // handler explicitly calls `ctx.store()` / `ctx.eventLog()` — which the
  // updater handler does not. Same shape as bin-session-start.
  await runAdvancedHook<Record<string, never>, undefined, {
    channel: "Updater";
    parseInput: () => Record<string, never>;
    escape: { manualResources: true };
    handler: () => Promise<undefined>;
  }>({
    channel: "Updater",
    parseInput: () => ({}),
    escape: { manualResources: true },
    handler: async () => {
      log("updater started");
      await runUpdater({
        // Closure reads state + token per call so ETag and token are always
        // fresh at call time (§ 2.6). State is read independently here from
        // the state already read inside runUpdater; the extra read is cheap
        // and ensures the latest persisted ETag is sent.
        fetchRemoteSha: () => {
          const s = readState();
          return fetchRemoteSha({
            owner: REPO_OWNER, repo: REPO_NAME, branch: REPO_BRANCH,
            token: resolveGithubToken(),
            ifNoneMatch: s.last_branch_etag || undefined,
            cachedSha: s.last_branch_sha || undefined,
          });
        },
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
      return undefined;
    },
  });
}

void main();
