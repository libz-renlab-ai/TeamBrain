/**
 * Embedder daemon state file (issue #164).
 *
 * Single JSON document at `~/.teamagent/.embedder-state.json` that lets
 * short-lived hooks (PreToolUse/Stop) discover the long-running embedder
 * daemon's HTTP port without socket discovery, and lets sessions track
 * shared ownership via a refcounted members list.
 *
 * Mirrors `warmup-state.ts` patterns:
 *   - tmp + rename for atomic writes
 *   - `process.kill(pid, 0)` for cross-platform liveness probe
 *   - readers tolerate missing/malformed files (return null)
 *
 * Lifecycle (happy path):
 *   SessionStart hook → readEmbedderState → status=running, pid alive →
 *     addMember(session_id) → POST /embed
 *   SessionEnd hook   → removeMember(session_id) → POST /shutdown if last
 *
 * The daemon itself owns `status` transitions; hooks only mutate the
 * `members` array (also via tmp+rename).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type EmbedderStatus = "starting" | "running" | "failed" | "exiting";

export interface EmbedderMember {
  session_id: string;
  joined_at: string;
}

export interface EmbedderState {
  status: EmbedderStatus;
  pid: number;
  /** TCP port the daemon is listening on (127.0.0.1:port). 0 while starting. */
  port: number;
  started_at: string;
  model: string;
  members: EmbedderMember[];
  error?: string;
}

export const EMBEDDER_STATE_FILENAME = ".embedder-state.json";

export function defaultEmbedderStatePath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, ".teamagent", EMBEDDER_STATE_FILENAME);
}

/**
 * Atomically write the state file (tmp + rename).
 * Best-effort — caller must tolerate failures.
 */
export function writeEmbedderState(filePath: string, state: EmbedderState): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

/**
 * Read the state file. Returns `null` if missing or unparseable.
 */
export function readEmbedderState(filePath: string): EmbedderState | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<EmbedderState>;
    if (
      typeof parsed.status !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.port !== "number" ||
      typeof parsed.started_at !== "string" ||
      typeof parsed.model !== "string" ||
      !Array.isArray(parsed.members)
    ) {
      return null;
    }
    return parsed as EmbedderState;
  } catch {
    return null;
  }
}

/**
 * Cross-platform process liveness check.
 * Mirrors warmup-state.ts:isPidAlive — pid=0 is treated as not-alive here
 * (different from warmup state file's "placeholder" semantics).
 */
export function isDaemonPidAlive(pid: number): boolean {
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

export interface DaemonReadiness {
  /** Daemon is running and ready to accept HTTP /embed requests. */
  ready: boolean;
  /** Diagnostic reason for non-ready states. */
  reason:
    | "ready"
    | "missing"
    | "starting"
    | "failed"
    | "exiting"
    | "stale_pid"
    | "no_port"
    | "malformed";
  state: EmbedderState | null;
}

/**
 * Read state file and decide whether the daemon is reachable.
 *
 * Caller behavior:
 *   - ready=true  → POST localhost:state.port/embed
 *   - ready=false → fall back to legacy substring matcher (and optionally
 *                   trigger an async daemon spawn out-of-band)
 */
export function describeDaemonReadiness(filePath: string): DaemonReadiness {
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
  const state = readEmbedderState(filePath);
  if (!state) {
    return { ready: false, reason: "malformed", state: null };
  }
  if (state.status === "failed") {
    return { ready: false, reason: "failed", state };
  }
  if (state.status === "exiting") {
    return { ready: false, reason: "exiting", state };
  }
  if (!isDaemonPidAlive(state.pid)) {
    return { ready: false, reason: "stale_pid", state };
  }
  if (state.status === "starting") {
    return { ready: false, reason: "starting", state };
  }
  // status === "running"
  if (!Number.isInteger(state.port) || state.port <= 0) {
    return { ready: false, reason: "no_port", state };
  }
  return { ready: true, reason: "ready", state };
}

/**
 * Members list mutation helpers. Each operation reads the latest state,
 * appends/removes, and writes atomically. Best-effort — concurrent writers
 * may race; the daemon's idle-exit logic re-reads members on every check.
 *
 * Returns the new member count after mutation, or null if the state file
 * was missing/malformed.
 */
export function addMember(filePath: string, sessionId: string): number | null {
  const state = readEmbedderState(filePath);
  if (!state) return null;
  if (state.members.some((m) => m.session_id === sessionId)) {
    return state.members.length;
  }
  state.members.push({ session_id: sessionId, joined_at: new Date().toISOString() });
  writeEmbedderState(filePath, state);
  return state.members.length;
}

export function removeMember(filePath: string, sessionId: string): number | null {
  const state = readEmbedderState(filePath);
  if (!state) return null;
  const before = state.members.length;
  state.members = state.members.filter((m) => m.session_id !== sessionId);
  if (state.members.length === before) {
    return state.members.length;
  }
  writeEmbedderState(filePath, state);
  return state.members.length;
}
