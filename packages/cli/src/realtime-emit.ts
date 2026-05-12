/**
 * Feature #2 v3 — env-gated fire-and-forget emitter wired into the
 * SessionStart and UserPromptSubmit hook bundles.
 *
 * PR #401 shipped the receiver-side primitives (`realtime-client.ts` +
 * `realtime-stream.ts` + `bin-realtime-demo.ts`) but never wired any hook to
 * them, so the only thing the boss kanban ever showed was the demo's three
 * synthetic teammates. This helper closes that gap with the smallest possible
 * surface: when `TEAMAGENT_REALTIME_URL` is set, emit one snapshot per hook
 * fire; when it's unset, no-op.
 *
 * Contract (matches plan v2 §1 and the comment block at the top of
 * `realtime-client.ts`):
 *   - Never throws. Every call is wrapped in try/catch; any failure logs at
 *     most one line to stderr (and only if TEAMAGENT_REALTIME_DEBUG=1).
 *   - Never blocks. The fetch is fire-and-forget — we `void` the promise and
 *     return synchronously. The hook lifecycle drains microtasks before
 *     exiting, so the timeout fires inside the same process tick.
 *   - Never retries. Drops on timeout / 5xx / network. M5 git-sync remains
 *     the final-consistency fallback for anything the receiver dropped.
 *
 * Env:
 *   TEAMAGENT_REALTIME_URL    — base URL (e.g. http://127.0.0.1:9787). Unset → no-op.
 *   TEAMAGENT_REALTIME_TOKEN  — optional bearer for the receiver.
 *   TEAMAGENT_REALTIME_DEBUG  — when "1", logs every emit outcome.
 *
 * Usage:
 *   import { emitCcStatus } from "./realtime-emit.js";
 *   emitCcStatus({ event: "session_start", sessionId, cwd });
 */
import { hostname } from "node:os";
import {
  CC_STATUS_SCHEMA_VERSION,
  getMachineId,
  getUserId,
  postCcStatusSnapshot,
  type CcStatusSnapshot,
  type PostCcStatusOutcome,
} from "@teamagent/digital-twin";

export interface EmitInput {
  /** Which hook fired ("session_start" | "user_prompt_submit" | ...). */
  readonly event: string;
  /** Claude Code session id from the hook input. */
  readonly sessionId?: string;
  /** Working directory at hook fire time. */
  readonly cwd?: string;
  /** Optional git branch (caller does the cheap `git rev-parse` if it wants). */
  readonly gitBranch?: string;
  /** Optional model id from the hook payload. */
  readonly model?: string;
  /** Optional context token count from the hook payload. */
  readonly contextTokens?: number;
}

const TIMEOUT_MS = 50;

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function debugLog(line: string): void {
  if (readEnv("TEAMAGENT_REALTIME_DEBUG") === "1") {
    try {
      process.stderr.write(`[realtime-emit] ${line}\n`);
    } catch {
      // best-effort
    }
  }
}

// Cache identity once per process: getUserId() shells out to `git config
// user.email` (typ. 30-60ms on macOS) and getMachineId() touches disk to
// read/write the machine-id sentinel. Both are stable for the process
// lifetime and called per-hook, so caching keeps emitCcStatus well under
// the 50ms hook-critical-path target.
let cachedUserId: string | null = null;
let cachedMachineId: string | null = null;

function buildSnapshot(input: EmitInput): CcStatusSnapshot {
  if (cachedUserId === null) {
    try {
      cachedUserId = getUserId();
    } catch {
      cachedUserId = `unknown@${hostname()}`;
    }
  }
  if (cachedMachineId === null) {
    try {
      cachedMachineId = getMachineId();
    } catch {
      cachedMachineId = hostname();
    }
  }
  const userId = cachedUserId;
  const machineId = cachedMachineId;
  const snap: CcStatusSnapshot = {
    schema_version: CC_STATUS_SCHEMA_VERSION,
    session_id: input.sessionId || `unknown-${Date.now()}`,
    user_id: userId,
    ts: new Date().toISOString(),
    event: input.event,
    display_name: userId.split("@")[0] || userId,
    machine_id: machineId,
  };
  if (input.cwd) snap.cwd = input.cwd;
  if (input.gitBranch) snap.git_branch = input.gitBranch;
  if (input.model) snap.model = input.model;
  if (typeof input.contextTokens === "number") {
    snap.context_tokens = input.contextTokens;
    snap.context_pct = Math.round((input.contextTokens / 200_000) * 100) / 100;
  }
  return snap;
}

/**
 * Synchronous: builds the snapshot, kicks off the POST, returns immediately.
 * The promise is intentionally discarded — there's no caller that can act on
 * the outcome, and the contract is "never block the hook path".
 */
export function emitCcStatus(input: EmitInput): void {
  const baseUrl = readEnv("TEAMAGENT_REALTIME_URL");
  if (!baseUrl) {
    debugLog(`skip (TEAMAGENT_REALTIME_URL unset) event=${input.event}`);
    return;
  }
  let snapshot: CcStatusSnapshot;
  try {
    snapshot = buildSnapshot(input);
  } catch (err) {
    debugLog(`build-failed err=${String(err)}`);
    return;
  }
  const bearerToken = readEnv("TEAMAGENT_REALTIME_TOKEN");
  try {
    void postCcStatusSnapshot(snapshot, {
      baseUrl,
      timeoutMs: TIMEOUT_MS,
      ...(bearerToken ? { bearerToken } : {}),
      onOutcome: (outcome: PostCcStatusOutcome) =>
        debugLog(`event=${input.event} outcome=${outcome}`),
    });
  } catch (err) {
    debugLog(`fire-failed err=${String(err)}`);
  }
}
