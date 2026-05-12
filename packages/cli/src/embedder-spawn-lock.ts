/**
 * Atomic file-based mutex (issue #315).
 *
 * Wraps `fs.openSync(path, "wx")` — POSIX/Windows-portable atomic exclusive
 * create. Only one process can win the open at a time; concurrent losers
 * get `EEXIST` and back off. Used by both `tryDetachedSpawn` (Race α —
 * multiple SessionStart hooks racing to spawn the daemon child) and the
 * daemon's own `tryAcquireLock` / cold-load entry (Race β — multiple
 * daemon children racing to write `state.status=starting`).
 *
 * Staleness defense: if the holder process crashes between create and
 * release, the lock file would otherwise block all future spawners
 * forever. A lock whose mtime is older than `staleMs` is treated as
 * abandoned — the next caller unlinks it and retries the `wx` create.
 *
 * No third-party dependency; stdlib `node:fs` only. Cross-platform.
 */
import fs from "node:fs";

const DEFAULT_STALE_MS = 30_000;

export interface SpawnLockHandle {
  /** Absolute path of the lock file (for diagnostics / tests). */
  readonly path: string;
  /** Release the lock by unlinking the file. Best-effort. */
  release(): void;
}

/**
 * Try to acquire `lockPath` atomically. Returns a handle on success, null
 * if another holder is alive.
 *
 * Staleness: if `lockPath` already exists but its mtime is older than
 * `staleMs`, unlink it and retry once. This bounds recovery time after
 * a crashed holder to `staleMs` instead of forever.
 */
export function tryAcquireSpawnLock(
  lockPath: string,
  staleMs: number = DEFAULT_STALE_MS,
): SpawnLockHandle | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      try {
        fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      } finally {
        fs.closeSync(fd);
      }
      return {
        path: lockPath,
        release: () => {
          try { fs.unlinkSync(lockPath); } catch { /* best-effort */ }
        },
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") return null; // unknown error — give up
      // EEXIST: someone holds the lock. Check staleness once.
      if (attempt === 0) {
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > staleMs) {
            try { fs.unlinkSync(lockPath); } catch { /* may race */ }
            continue; // retry wx create
          }
        } catch { /* stat raced with another release — keep going */ }
      }
      return null;
    }
  }
  return null;
}
