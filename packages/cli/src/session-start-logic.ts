/**
 * SessionStart logic. No top-level side effects — safe to import from tests.
 */
import { spawn } from "node:child_process";
import fs, { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import {
  parseUpdateState,
  serializeUpdateState,
  defaultUpdateState,
  shouldCheckUpdate,
  type UpdateState,
} from "@teamagent/core";

export const DEFAULT_DEBOUNCE_HOURS = 24;

export type Action =
  | "auto-init"
  | "skip-not-a-project"
  | "skip-auto-init-disabled"
  | "skip-already-initialized";

/** Project markers — cwd must have at least one of these to trigger auto-init. */
const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "pnpm-workspace.yaml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
];

function isProjectDir(cwd: string): boolean {
  for (const m of PROJECT_MARKERS) {
    if (existsSync(join(cwd, m))) return true;
  }
  return false;
}

function autoInitDisabled(cwd: string): boolean {
  // User can opt out per-project OR globally
  return (
    existsSync(join(cwd, ".teamagent", "auto-init.disabled")) ||
    existsSync(join(os.homedir(), ".teamagent", "auto-init.disabled"))
  );
}

export function decideAction(cwd: string, _now?: Date, _debounceHours?: number): Action {
  const dbPath = join(cwd, ".teamagent", "knowledge.db");
  if (!existsSync(dbPath)) {
    // New project (no DB yet). Auto-init if it looks like a real project
    // and user hasn't opted out.
    if (autoInitDisabled(cwd)) return "skip-auto-init-disabled";
    if (!isProjectDir(cwd)) return "skip-not-a-project";
    return "auto-init";
  }
  return "skip-already-initialized";
}

export function findMainBin(): string {
  // bin-session-start.cjs sits next to bin.js in dist/
  return join(__dirname, "bin.js");
}

/**
 * Spawn `teamagent init --skip-import --skip-hook=false` asynchronously.
 * Detached so SessionStart hook itself returns fast.
 * Result shown via stderr on next interactive turn; subprocess writes its own
 * progress to a log file under ~/.teamagent/auto-init.log.
 */
export function spawnAutoInit(cwd: string): void {
  const logPath = join(os.homedir(), ".teamagent", "auto-init.log");
  try {
    appendFileSync(
      logPath,
      `[${new Date().toISOString()}] auto-init spawn cwd=${cwd}\n`,
      "utf-8",
    );
  } catch { /* silent */ }
  const child = spawn(
    process.execPath,
    [findMainBin(), "init", "--skip-import"],
    {
      detached: true,
      stdio: "ignore",
      cwd,
      env: { ...process.env, TEAMAGENT_AUTO_INIT: "1" },
      windowsHide: true,
    },
  );
  child.unref();
}

export function logError(kind: string, err: unknown): void {
  try {
    const logPath = join(os.homedir(), ".teamagent", "session-start-errors.log");
    appendFileSync(logPath, `[${new Date().toISOString()}] session-start:${kind} ${String(err)}\n`, "utf-8");
  } catch { /* silent */ }
}

// ─── auto-update integration ─────────────────────────────────────────────

function teamagentHome(): string {
  return process.env["TEAMAGENT_HOME"] ?? join(os.homedir(), ".teamagent");
}
function updateStatePath(): string { return join(teamagentHome(), "update-state.json"); }
function updateDisabledPath(): string { return join(teamagentHome(), "auto-update.disabled"); }

export function readUpdateState(): UpdateState {
  try {
    if (!existsSync(updateStatePath())) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(updateStatePath(), "utf-8"));
  } catch {
    return defaultUpdateState();
  }
}

export function writeUpdateState(s: UpdateState): void {
  try {
    fs.mkdirSync(teamagentHome(), { recursive: true });
    fs.writeFileSync(updateStatePath(), serializeUpdateState(s), "utf-8");
  } catch { /* silent */ }
}

/** Check whether to spawn updater this SessionStart. */
export function shouldSpawnUpdater(now: Date = new Date()): boolean {
  return shouldCheckUpdate({
    now: now.getTime(),
    state: readUpdateState(),
    env: process.env,
    disabledMarkerExists: existsSync(updateDisabledPath()),
  });
}

/** Detached fire-and-forget spawn of bin-updater.cjs. */
export function spawnUpdater(): void {
  const updaterBin = join(__dirname, "bin-updater.cjs");
  if (!existsSync(updaterBin)) {
    logError("updater-bin-missing", new Error(updaterBin));
    return;
  }
  const child = spawn(process.execPath, [updaterBin], {
    detached: true,
    stdio: "ignore",
    env: process.env,
    windowsHide: true,
  });
  child.unref();
}

/**
 * If a pending banner exists and not yet shown, write to stderr (visible on
 * first turn) and mark shown.
 */
export function maybeShowPendingBanner(
  stderr: (s: string) => void = (s) => process.stderr.write(s),
): void {
  const state = readUpdateState();
  if (!state.pending_banner || state.pending_banner.shown) return;
  const { from, to } = state.pending_banner;
  const fromShort = from ? from.slice(0, 7) : "(初装)";
  stderr(`✨ TeamAgent: 已自动更新 ${fromShort} → ${to.slice(0, 7)}\n`);
  stderr(`   本次会话生效。详情: teamagent update --status\n`);
  state.pending_banner.shown = true;
  writeUpdateState(state);
}
