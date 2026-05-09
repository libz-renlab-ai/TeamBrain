import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Issue #158 — install-time safety net.
 *
 * Background: `npm i -g github:libz-renlab-ai/TeamBrain#release` fails on
 * Windows because npm reify removes the user's existing global teamagent dir
 * BEFORE the new tree-sitter native deps fail to compile, leaving the user
 * with no working install. The MAIN fix removes those tree-sitter deps from
 * package.json. THIS module is the defense-in-depth so future analogous
 * failures (any cause) cannot destroy the user's existing install.
 *
 * Architecture: this is the testable spec. install.sh implements the same
 * policy in pure shell because install.sh ships standalone (no Node TS
 * available at the time it runs from a curl pipe). The two implementations
 * MUST agree on:
 *   - backup file naming: `<ISO-with-colons-replaced-by-dashes>.tgz`
 *   - backup root: `<homeDir>/.teamagent/backups/`
 *   - retention: keep last 3 by mtime, FIFO eviction
 *   - log file: `<homeDir>/.teamagent/postinstall.log`
 *   - log line shape: `[<ISO-ts>] stage=install status=rolled-back source=<backup-path>`
 *
 * Tar format: shell out to system `tar` via execFileSync. Windows 10 (build
 * 17063+) ships `tar.exe` in System32 (bsdtar from libarchive); macOS ships
 * bsdtar; Linux distros ship GNU tar. All support `-czf` (gzip create) and
 * `-xzf` (gzip extract). Avoids pulling a userland tar npm dep that itself
 * could fail to install on the broken environments we are defending against.
 *
 * Cross-platform path handling: GNU tar interprets absolute Windows paths
 * like `C:\foo` as `host:file` (rsync-style remote spec) → fails with
 * "Cannot connect to C: resolve failed". On Windows we add `--force-local`
 * (GNU-tar-only flag, ignored or rejected by bsdtar) and pass the working
 * directory via `cwd:` so the archive-target name can stay as a relative
 * basename. On macOS / Linux we just use `cwd:` + relative target.
 *
 * Even on Windows, the System32 bsdtar would handle `C:\` paths fine, but
 * Git-for-Windows installs put GNU tar earlier on PATH; we cannot assume
 * which `tar.exe` resolves first, so the safe play is the GNU-compatible
 * code path on Windows.
 *
 * IO contract: all functions take an explicit `homeDir` so tests can sandbox
 * inside `os.tmpdir()` without touching the real `~/.teamagent/`. Same
 * pattern as `findTeamagentRoot(start, opts?: { homeDir?: string })`.
 */

export interface BackupOptions {
  homeDir: string;
  installDir: string;
  /** override for deterministic timestamps in tests */
  now?: Date;
}

export interface BackupResult {
  status: "ok" | "skipped" | "error";
  /** absolute path to the .tgz when status === "ok" */
  backupPath?: string;
  /** machine-readable reason when status !== "ok" */
  reason?: string;
}

export interface RollbackOptions {
  homeDir: string;
  installDir: string;
  backupPath: string;
}

export interface RollbackResult {
  status: "ok" | "error";
  reason?: string;
}

export interface PruneOptions {
  homeDir: string;
  /** number of newest backups to retain; older ones deleted */
  keep: number;
}

const DEFAULT_KEEP = 3;

const IS_WINDOWS = process.platform === "win32";

/**
 * Build tar argv with platform-correct flags.
 *   Windows: prepend `--force-local` so GNU tar (often Git-for-Windows's, on
 *            PATH ahead of System32 bsdtar) does not interpret `C:\` as a
 *            remote host spec.
 *   Other:   pass straight through.
 */
function tarArgs(...flags: string[]): string[] {
  return IS_WINDOWS ? ["--force-local", ...flags] : flags;
}

function backupRoot(homeDir: string): string {
  return path.join(homeDir, ".teamagent", "backups");
}

function logPath(homeDir: string): string {
  return path.join(homeDir, ".teamagent", "postinstall.log");
}

function isoStampForFilename(now: Date): string {
  // 2026-05-09T10:00:00.000Z → 2026-05-09T10-00-00-000Z
  return now.toISOString().replace(/[:.]/g, "-");
}

function appendLog(homeDir: string, line: string): void {
  try {
    const file = logPath(homeDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, line.endsWith("\n") ? line : `${line}\n`, "utf-8");
  } catch {
    // best-effort; never block install on log write failure
  }
}

function dirHasContent(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/**
 * Snapshot the existing install directory into a `.tgz` under
 * `<homeDir>/.teamagent/backups/`. No-op (status="skipped") when the install
 * directory is absent or empty — there is nothing to lose, so don't waste
 * disk on an empty archive.
 *
 * After a successful backup, prunes older backups so at most 3 remain.
 */
export function backupExistingInstall(opts: BackupOptions): BackupResult {
  const now = opts.now ?? new Date();
  if (!fs.existsSync(opts.installDir)) {
    return { status: "skipped", reason: "no-existing-install" };
  }
  if (!dirHasContent(opts.installDir)) {
    return { status: "skipped", reason: "empty-install" };
  }

  const root = backupRoot(opts.homeDir);
  try {
    fs.mkdirSync(root, { recursive: true });
  } catch (err) {
    return {
      status: "error",
      reason: `mkdir-backup-root-failed: ${String((err as Error).message ?? err).slice(0, 120)}`,
    };
  }

  const stamp = isoStampForFilename(now);
  const backupPath = path.join(root, `${stamp}.tgz`);

  // tar -czf <backup.tgz> <basename-of-installDir>   (cwd = parent)
  // Using cwd + basename keeps archive paths relative (restores cleanly into
  // a newly-created INSTALL_DIR regardless of where it lived originally) and
  // sidesteps the "GNU tar interprets `C:\…` as host:file" trap.
  const parent = path.dirname(opts.installDir);
  const base = path.basename(opts.installDir);
  try {
    execFileSync("tar", tarArgs("-czf", backupPath, base), {
      cwd: parent,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      timeout: 60_000,
    });
  } catch (err) {
    // best-effort cleanup of partial archive
    try { fs.rmSync(backupPath, { force: true }); } catch { /* ignore */ }
    const msg = String((err as Error).message ?? err);
    appendLog(opts.homeDir, `[${now.toISOString()}] stage=backup status=failed reason=${msg.slice(0, 200)}`);
    return { status: "error", reason: `tar-create-failed: ${msg.slice(0, 200)}` };
  }

  appendLog(
    opts.homeDir,
    `[${now.toISOString()}] stage=backup status=ok target=${backupPath}`,
  );

  // best-effort retention
  try { pruneOldBackups({ homeDir: opts.homeDir, keep: DEFAULT_KEEP }); } catch { /* ignore */ }

  return { status: "ok", backupPath };
}

/**
 * Restore `installDir` from the given `.tgz`. Wipes the (likely half-broken)
 * post-failure state of `installDir` first, then extracts the archive.
 *
 * On success, logs:
 *   [<iso-ts>] stage=install status=rolled-back source=<backup-path>
 */
export function rollbackFromBackup(opts: RollbackOptions): RollbackResult {
  // Normalize backslashes → forward slashes for tar (works on all platforms;
  // Windows tar.exe accepts both, but path.normalize round-trips cleanly).
  const backupPath = path.resolve(opts.backupPath);

  if (!fs.existsSync(backupPath)) {
    const reason = `backup-file-missing: ${backupPath}`;
    appendLog(
      opts.homeDir,
      `[${new Date().toISOString()}] stage=install status=rollback-failed reason=${reason}`,
    );
    return { status: "error", reason };
  }
  try {
    const stat = fs.statSync(backupPath);
    if (!stat.isFile() || stat.size === 0) {
      const reason = `backup-file-corrupt: not a regular non-empty file (${backupPath})`;
      appendLog(
        opts.homeDir,
        `[${new Date().toISOString()}] stage=install status=rollback-failed reason=${reason}`,
      );
      return { status: "error", reason };
    }
  } catch (err) {
    const reason = `backup-file-stat-failed: ${String((err as Error).message ?? err).slice(0, 120)}`;
    return { status: "error", reason };
  }

  // /review iter-1 hardening: validate the tarball BEFORE the destructive
  // rmSync. existsSync + size>0 only catches missing/empty files; a truncated
  // gzip stream or a tarball with a corrupt header still passes. `tar -tzf`
  // lists contents without extracting — any corrupt-header / truncation /
  // gzip-checksum failure returns non-zero and we leave installDir alone.
  // Without this gate, a corrupt backup + rmSync = empty installDir, which
  // is exactly the partial-install corruption #158 set out to prevent.
  try {
    execFileSync("tar", tarArgs("-tzf", backupPath), {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      timeout: 30_000,
    });
  } catch (err) {
    const reason = `backup-validation-failed: ${String((err as Error).message ?? err).slice(0, 200)}`;
    appendLog(
      opts.homeDir,
      `[${new Date().toISOString()}] stage=install status=rollback-skipped reason=${reason}`,
    );
    return { status: "error", reason };
  }

  // Re-create installDir empty so tar extracts into a clean shell.
  try {
    fs.rmSync(opts.installDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(opts.installDir), { recursive: true });
  } catch (err) {
    const reason = `prepare-install-dir-failed: ${String((err as Error).message ?? err).slice(0, 120)}`;
    return { status: "error", reason };
  }

  // tar -xzf <backup.tgz>   (cwd = parent of installDir)
  // The archive was created with cwd=parent + relative basename, so
  // extracting from parent recreates `<parent>/<base>` (which IS installDir).
  const parent = path.dirname(opts.installDir);
  try {
    fs.mkdirSync(parent, { recursive: true });
    execFileSync("tar", tarArgs("-xzf", backupPath), {
      cwd: parent,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      timeout: 60_000,
    });
  } catch (err) {
    const msg = String((err as Error).message ?? err).slice(0, 200);
    const reason = `tar-extract-failed: ${msg}`;
    appendLog(
      opts.homeDir,
      `[${new Date().toISOString()}] stage=install status=rollback-failed reason=${reason}`,
    );
    return { status: "error", reason };
  }

  appendLog(
    opts.homeDir,
    `[${new Date().toISOString()}] stage=install status=rolled-back source=${backupPath}`,
  );
  return { status: "ok" };
}

/**
 * Keep the `keep` most-recent `.tgz` backups under
 * `<homeDir>/.teamagent/backups/`; delete the rest. FIFO eviction by mtime.
 *
 * No-op when the backup root does not exist. Non-`.tgz` entries are
 * preserved (e.g. a stray README or a future metadata file).
 */
export function pruneOldBackups(opts: PruneOptions): void {
  const root = backupRoot(opts.homeDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return; // dir absent — nothing to prune
  }
  const tgzs = entries
    .filter((e) => e.isFile() && e.name.endsWith(".tgz"))
    .map((e) => {
      const full = path.join(root, e.name);
      let mtime = 0;
      try { mtime = fs.statSync(full).mtimeMs; } catch { /* skip */ }
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime); // newest first

  for (const f of tgzs.slice(opts.keep)) {
    try { fs.rmSync(f.full, { force: true }); } catch { /* best-effort */ }
  }
}
