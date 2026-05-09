/**
 * Issue #244 — file-locked read-modify-write helper for `update-state.json`.
 *
 * Problem: `update-state.json` is mutated by at least three independent paths
 *   (1) SessionStart hook (`session-start-logic.writeUpdateState`)
 *   (2) the detached background updater (`bin-updater.writeState`)
 *   (3) user CLI commands (`commands/update.{snoozeCmd,neverCmd,enableCmd,checkCmd}`)
 * Each path follows a `read → mutate → write` sequence. Even though writes
 * are atomic (tmp + rename), the *sequence* is not — two callers can read the
 * same baseline, then write back two divergent mutations, and the second
 * write silently overwrites the first ("lost update"). Concrete failure: a
 * user runs `teamagent update --snooze` while a SessionStart in another
 * window is persisting `last_check_ts`; whichever finishes second wins and
 * the snooze (or the timestamp) is lost.
 *
 * Fix: serialize the entire `read → mutate → write` block under an exclusive
 * file lock. We use `fs.openSync(lockPath, "wx")` — the same primitive as
 * `bin-updater.ts:123` `acquireLock` — with a small retry-with-backoff loop
 * for the common contention case. Stale-pid detection mirrors bin-updater so
 * a crashed holder doesn't deadlock the next caller.
 *
 * Design choices:
 * - No npm dep (proper-lockfile / flock). The `wx` create-exclusive primitive
 *   is sufficient for our single-host use case and keeps this layer
 *   dependency-free, matching `bin-updater.ts`'s existing pattern.
 * - Lock file lives at `<home>/update-state.lock`, distinct from the
 *   `bin-updater.ts` `update.lock` (which gates whole-process re-entry).
 *   Using a separate name lets a foreground CLI take the state lock without
 *   blocking the background updater process gate.
 * - Lock is held for the read AND the write — the whole RMW is atomic.
 * - On total failure to acquire (5 retries × ~150ms = ~750ms wall time),
 *   the helper falls back to a non-locked write so the caller still makes
 *   progress. The race window is small and this is the same behavior the
 *   pre-fix code had unconditionally; we never make persistence WORSE than
 *   before, only better when the lock is reachable.
 */

import fs from "node:fs";
import path from "node:path";
import {
  defaultUpdateState,
  parseUpdateState,
  serializeUpdateState,
  type UpdateState,
} from "@teamagent/core";

const LOCK_FILENAME = "update-state.lock";
const STATE_FILENAME = "update-state.json";

/** Max acquire attempts before falling back to non-locked write. */
const MAX_ACQUIRE_ATTEMPTS = 5;

/** Backoff between acquire attempts (ms); doubled per attempt. */
const ACQUIRE_BASE_DELAY_MS = 25;

/**
 * Run `mutator` against the current persisted update state under an exclusive
 * lock and persist the result atomically.
 *
 * Returns the post-mutation state (handy for callers that want to log the new
 * snooze level / next_check_after_ts without re-reading from disk).
 */
export function withUpdateStateLock(
  home: string,
  mutator: (s: UpdateState) => UpdateState
): UpdateState {
  fs.mkdirSync(home, { recursive: true });
  const lockPath = path.join(home, LOCK_FILENAME);
  const statePath = path.join(home, STATE_FILENAME);

  const acquired = acquireLock(lockPath);
  try {
    const current = readState(statePath);
    const next = mutator(current);
    atomicWrite(statePath, serializeUpdateState(next));
    return next;
  } finally {
    if (acquired) releaseLock(lockPath);
  }
}

/**
 * Acquire the lock by creating `lockPath` exclusively (`wx`). On contention
 * we retry with exponential backoff, then check whether the lock holder is
 * still alive (pid in lock file is signalable via `kill(pid, 0)`); if dead
 * we steal the lock. After all attempts fail, return false and let the
 * caller proceed without a lock — losing the lock is rare and we prefer
 * eventual progress over a hard stop.
 */
function acquireLock(lockPath: string): boolean {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      lastErr = e;
      // Lock exists. Check whether holder is alive; if not, steal it.
      if (tryStealStaleLock(lockPath)) return true;
      // Backoff and retry.
      const delay = ACQUIRE_BASE_DELAY_MS * (1 << attempt);
      const until = Date.now() + delay;
      while (Date.now() < until) { /* spin */ }
    }
  }
  // Couldn't get the lock in ~750ms total. Best-effort log to stderr but do
  // NOT throw — caller still needs to write its update.
  void lastErr;
  return false;
}

/**
 * If a lock file exists but the pid inside isn't a live process, remove the
 * lock and create a fresh one for us. Returns true iff we successfully stole
 * the lock. Anything else (read error, alive pid, race with another stealer)
 * returns false and lets the outer retry loop try again.
 */
function tryStealStaleLock(lockPath: string): boolean {
  try {
    const raw = fs.readFileSync(lockPath, "utf-8");
    const pid = parseInt(raw.trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      // Empty / non-numeric content. Almost always a TOCTOU artifact: the
      // current holder is mid-acquireLock — `openSync(path, "wx")` has created
      // the file but `writeSync(fd, pid)` hasn't landed yet. Stealing here
      // would unlink the holder's lock and let two writers proceed
      // concurrently, defeating the whole point of #244.
      // Return false; the outer retry loop will re-read on next attempt, by
      // which point the holder has finished writing pid and stale-detection
      // works correctly. If it's truly garbage (corrupt write), we'll
      // eventually fall through to the non-locked write fallback after
      // MAX_ACQUIRE_ATTEMPTS — same fail-open semantic the helper already
      // uses for any other unrecoverable lock state.
      return false;
    }
    try {
      process.kill(pid, 0); // throws if dead
      return false; // alive — real concurrent caller, must wait
    } catch {
      // Holder is dead. Steal.
      fs.unlinkSync(lockPath);
      return tryCreateLock(lockPath);
    }
  } catch {
    return false;
  }
}

function tryCreateLock(lockPath: string): boolean {
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

function releaseLock(lockPath: string): void {
  try { fs.unlinkSync(lockPath); } catch { /* silent */ }
}

function readState(statePath: string): UpdateState {
  try {
    if (!fs.existsSync(statePath)) return defaultUpdateState();
    return parseUpdateState(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return defaultUpdateState();
  }
}

/**
 * Atomic write: tmp + rename. Same pattern as `bin-updater.ts:95-121` and
 * `commands/update.ts:71-91`, kept private here so this module is the single
 * place callers go for safe state mutation.
 */
function atomicWrite(target: string, body: string): void {
  const tmp = `${target}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
  fs.writeFileSync(tmp, body, "utf-8");
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
