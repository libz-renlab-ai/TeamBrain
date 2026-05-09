/**
 * Process management for the digital-twin uploader daemon: PID lock,
 * upload cycle, and main loop with idle self-exit.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { homedir as osHomedir } from 'node:os';
import { digitalTwinPaths } from '../paths.js';
import {
  listPending,
  loadEntry,
  removeEntry,
  moveToDeadLetter,
  enforceCapacity,
  type QueueEntry,
} from './queue.js';
import { uploadCcSession, type UploadOutcome, type FetchLike } from './uploader.js';
import { shouldDeadLetter } from './backoff.js';

export interface DaemonConfig {
  endpoint: string;
  token: string;
  user_id: string;
  machine_id: string;
}

export interface PidFileContent {
  pid: number;
  start_at: string;
}

export type CyclePerEntryOutcome =
  | { id: string; outcome: 'uploaded' }
  | { id: string; outcome: 'transient'; failures: number; status?: number; error?: string }
  | { id: string; outcome: 'dead-letter'; reason: 'permanent-failure' | 'too-many-failures'; failures: number; status?: number }
  | { id: string; outcome: 'auth-failed' }
  | { id: string; outcome: 'invalid-metadata' };

export interface CycleSummary {
  scanned: number;
  outcomes: CyclePerEntryOutcome[];
  authFailed: boolean;
}

/** Returns true if the given pid is alive on this OS. */
export function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    // Sending signal 0 does no work but checks for the existence of the process.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // EPERM means the process exists but we lack signal permission.
    if (code === 'EPERM') return true;
    return false;
  }
}

export function readPidFile(home: string = osHomedir()): PidFileContent | null {
  const paths = digitalTwinPaths(home);
  if (!existsSync(paths.daemonPidFile)) return null;
  try {
    const raw = readFileSync(paths.daemonPidFile, 'utf-8');
    const obj = JSON.parse(raw) as Partial<PidFileContent>;
    if (typeof obj.pid !== 'number' || typeof obj.start_at !== 'string') return null;
    return { pid: obj.pid, start_at: obj.start_at };
  } catch {
    return null;
  }
}

export interface AcquirePidLockDeps {
  pid?: number;
  now?: () => Date;
  isPidAlive?: (pid: number) => boolean;
}

/**
 * Try to acquire the daemon PID lock. Returns true on success (lock acquired),
 * false if another live daemon already owns it. Stale locks (from a dead PID
 * or with a malformed pid file) are forcibly replaced.
 */
export function acquirePidLock(
  home: string = osHomedir(),
  deps: AcquirePidLockDeps = {},
): boolean {
  const paths = digitalTwinPaths(home);
  const myPid = deps.pid ?? process.pid;
  const now = deps.now ?? (() => new Date());
  const aliveCheck = deps.isPidAlive ?? isPidAlive;

  mkdirSync(paths.digitalTwinDir, { recursive: true });

  const existing = readPidFile(home);
  if (existing && existing.pid !== myPid && aliveCheck(existing.pid)) {
    return false;
  }

  const content: PidFileContent = {
    pid: myPid,
    start_at: now().toISOString(),
  };
  writeFileSync(paths.daemonPidFile, JSON.stringify(content), 'utf-8');
  return true;
}

export function releasePidLock(home: string = osHomedir()): void {
  const paths = digitalTwinPaths(home);
  try {
    unlinkSync(paths.daemonPidFile);
  } catch {
    // best-effort
  }
}

export interface RunCycleDeps {
  fetchFn?: FetchLike;
  failures?: Map<string, number>;
  uploader?: typeof uploadCcSession;
}

/**
 * Run one upload cycle: scan pending/, upload each, classify outcomes.
 *
 * `deps.failures` is a per-id failure counter that the caller maintains
 * across cycles. The daemon's main loop owns it (in-memory). On daemon
 * restart the counter resets — note this in PR description as accepted
 * tradeoff for v1.
 */
export async function runUploadCycle(
  config: DaemonConfig,
  home: string = osHomedir(),
  deps: RunCycleDeps = {},
): Promise<CycleSummary> {
  const failures = deps.failures ?? new Map<string, number>();
  const uploader = deps.uploader ?? uploadCcSession;
  const entries = listPending(home);
  const outcomes: CyclePerEntryOutcome[] = [];
  let authFailed = false;

  for (const entry of entries) {
    if (authFailed) break;
    const out = await processEntry(entry, config, failures, uploader, deps.fetchFn, home);
    outcomes.push(out);
    if (out.outcome === 'auth-failed') {
      authFailed = true;
    }
  }

  return { scanned: entries.length, outcomes, authFailed };
}

async function processEntry(
  entry: QueueEntry,
  config: DaemonConfig,
  failures: Map<string, number>,
  uploader: typeof uploadCcSession,
  fetchFn: FetchLike | undefined,
  home: string,
): Promise<CyclePerEntryOutcome> {
  const loaded = loadEntry(entry);
  if (!loaded) {
    // unparseable metadata — move out of pending to avoid infinite churn
    moveToDeadLetter(entry, home);
    return { id: entry.id, outcome: 'invalid-metadata' };
  }

  const result: UploadOutcome = await uploader(
    {
      metadata: loaded.metadata,
      payloadBytes: loaded.payloadBytes,
      endpoint: config.endpoint,
      token: config.token,
      identity: { user_id: config.user_id, machine_id: config.machine_id },
    },
    { fetchFn },
  );

  return classifyAndAct(entry, result, failures, home);
}

function classifyAndAct(
  entry: QueueEntry,
  result: UploadOutcome,
  failures: Map<string, number>,
  home: string,
): CyclePerEntryOutcome {
  switch (result.kind) {
    case 'success': {
      removeEntry(entry);
      failures.delete(entry.id);
      return { id: entry.id, outcome: 'uploaded' };
    }
    case 'auth-failed': {
      return { id: entry.id, outcome: 'auth-failed' };
    }
    case 'permanent-failure': {
      moveToDeadLetter(entry, home);
      const f = (failures.get(entry.id) ?? 0) + 1;
      failures.delete(entry.id);
      return {
        id: entry.id,
        outcome: 'dead-letter',
        reason: 'permanent-failure',
        failures: f,
        status: result.status,
      };
    }
    case 'transient':
    case 'network-error': {
      const f = (failures.get(entry.id) ?? 0) + 1;
      failures.set(entry.id, f);
      if (shouldDeadLetter(f)) {
        moveToDeadLetter(entry, home);
        failures.delete(entry.id);
        return {
          id: entry.id,
          outcome: 'dead-letter',
          reason: 'too-many-failures',
          failures: f,
          status: 'status' in result ? result.status : undefined,
        };
      }
      return {
        id: entry.id,
        outcome: 'transient',
        failures: f,
        status: 'status' in result ? result.status : undefined,
        error: 'error' in result ? result.error : undefined,
      };
    }
  }
}

export const POLL_INTERVAL_MS = 60_000;
export const IDLE_EXIT_MS = 15 * 60_000;

export interface MainLoopDeps {
  /** Test hook: signals the loop should exit. */
  shouldStop?: () => boolean;
  /** Test hook: replace setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Test hook: replace runUploadCycle. */
  runCycle?: typeof runUploadCycle;
  /** Test hook: capture cycle summaries. */
  onCycle?: (summary: CycleSummary) => void;
  fetchFn?: FetchLike;
  pollIntervalMs?: number;
  idleExitMs?: number;
}

export interface MainLoopExit {
  reason: 'idle' | 'auth-failed' | 'stopped';
}

/**
 * The daemon main loop. Returns when the daemon should exit:
 *   - 'idle': pending/ has been empty for >= idleExitMs
 *   - 'auth-failed': uploader saw 401 — caller should exit non-zero
 *   - 'stopped': test hook requested stop
 */
export async function mainLoop(
  config: DaemonConfig,
  home: string = osHomedir(),
  deps: MainLoopDeps = {},
): Promise<MainLoopExit> {
  const sleep = deps.sleep ?? defaultSleep;
  const runCycle = deps.runCycle ?? runUploadCycle;
  const shouldStop = deps.shouldStop ?? (() => false);
  const pollMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;
  const idleMs = deps.idleExitMs ?? IDLE_EXIT_MS;
  const failures = new Map<string, number>();

  let idleAccumulatedMs = 0;

  while (!shouldStop()) {
    enforceCapacity(home);

    const summary = await runCycle(config, home, { fetchFn: deps.fetchFn, failures });
    deps.onCycle?.(summary);

    if (summary.authFailed) {
      return { reason: 'auth-failed' };
    }

    if (summary.scanned === 0) {
      idleAccumulatedMs += pollMs;
      if (idleAccumulatedMs >= idleMs) {
        return { reason: 'idle' };
      }
    } else {
      idleAccumulatedMs = 0;
    }

    if (shouldStop()) break;
    await sleep(pollMs);
  }

  return { reason: 'stopped' };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t === 'object' && t !== null && 'unref' in t) {
      (t as { unref: () => void }).unref();
    }
  });
}
