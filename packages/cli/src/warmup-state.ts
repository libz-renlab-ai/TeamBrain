/**
 * Warmup state file (issue #91).
 *
 * Single JSON document at `~/.teamagent/.warmup-state.json` that tracks
 * the Xenova vector model download. Enables three things:
 *
 *  1. `teamagent init` can spawn warmup detached and return immediately
 *     — the next process to need the embedder reads this file to decide
 *     whether to use the semantic matcher (status === "ready") or fall
 *     back to the legacy keyword matcher (anything else).
 *  2. `teamagent doctor` can report a `vector_model: <state>` row.
 *  3. Stale-detection: if `status === "downloading"` but `pid` is not
 *     alive, the previous warmup was killed; treat as not-ready.
 *
 * The file is written with `tmp + rename` for atomicity so a half-written
 * JSON never wins a race against `bin-pre-tool-use`'s synchronous read.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type WarmupStatus = "downloading" | "ready" | "failed" | "skipped";

export interface WarmupProgress {
  loaded_bytes: number;
  total_bytes: number;
  files_done: number;
  files_total: number;
}

export interface WarmupState {
  status: WarmupStatus;
  started_at: string;
  completed_at?: string;
  /** Pid of the warmup process; 0 means "no live writer (init wrote a placeholder)". */
  pid: number;
  model: string;
  progress?: WarmupProgress;
  error?: string;
}

export const WARMUP_STATE_FILENAME = ".warmup-state.json";

export function defaultWarmupStatePath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".teamagent", WARMUP_STATE_FILENAME);
}

/**
 * Atomically write the state file (tmp + rename).
 * Best-effort — caller must tolerate failures (disk full, permission, etc.).
 */
export function writeWarmupState(filePath: string, state: WarmupState): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

/**
 * Read the state file. Returns `null` if missing or unparseable; never throws.
 */
export function readWarmupState(filePath: string): WarmupState | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<WarmupState>;
    if (
      typeof parsed.status !== "string" ||
      typeof parsed.started_at !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.model !== "string"
    ) {
      return null;
    }
    return parsed as WarmupState;
  } catch {
    return null;
  }
}

/**
 * Check if a pid is alive on the current host. `0` is treated as a placeholder
 * pid (init wrote it before spawning the real warmup), so it counts as alive.
 *
 * Cross-platform: `process.kill(pid, 0)` is the standard probe. On Windows it
 * is implemented in libuv via OpenProcess; ESRCH means dead, EPERM means
 * "exists but not ours" (still considered alive).
 */
export function isPidAlive(pid: number): boolean {
  if (pid === 0) return true;
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    return false;
  }
}

/**
 * The single decision the rest of the codebase actually needs:
 * "Should this process use the semantic matcher, or fall back to legacy?"
 *
 * Returns `true` (vector ready) only when:
 *   - state file exists AND parses
 *   - status is "ready"
 *
 * Anything else — missing file, "downloading" with stale pid, "failed",
 * malformed JSON — returns `false`, so the caller falls back to legacy
 * keyword matching. Includes a sub-result for diagnostics:
 *
 *   { ready: boolean, reason: "ready" | "missing" | "downloading" | "failed" | "stale_downloading" }
 */
export function describeWarmupReadiness(filePath: string): {
  ready: boolean;
  reason: "ready" | "missing" | "downloading" | "failed" | "skipped" | "stale_downloading" | "malformed";
  state: WarmupState | null;
} {
  const raw = (() => {
    try {
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
    } catch {
      return null;
    }
  })();
  if (raw === null) {
    return { ready: false, reason: "missing", state: null };
  }
  const state = readWarmupState(filePath);
  if (!state) {
    return { ready: false, reason: "malformed", state: null };
  }
  if (state.status === "ready") {
    return { ready: true, reason: "ready", state };
  }
  if (state.status === "failed") {
    return { ready: false, reason: "failed", state };
  }
  if (state.status === "skipped") {
    return { ready: false, reason: "skipped", state };
  }
  // status === "downloading"
  if (!isPidAlive(state.pid)) {
    return { ready: false, reason: "stale_downloading", state };
  }
  return { ready: false, reason: "downloading", state };
}

/**
 * One-shot helper for `teamagent init` to write a placeholder before spawning
 * the detached warmup process. Marks pid=0 so subsequent readers see status
 * "downloading" but treat it as a fresh start, not a stale crash.
 */
export function writeInitialPlaceholder(
  filePath: string,
  model: string,
): void {
  writeWarmupState(filePath, {
    status: "downloading",
    started_at: new Date().toISOString(),
    pid: 0,
    model,
  });
}
