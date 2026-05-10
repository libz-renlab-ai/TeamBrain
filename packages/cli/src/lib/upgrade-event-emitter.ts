/**
 * Issue #245 — imperative shell for the 4 upgrade AttributionEvents.
 *
 * Pure factories live in `@teamagent/core/update/upgrade-events.ts`. This
 * module is the IO bridge: it opens (or accepts) the SqliteEventLog at
 * `<home>/.teamagent/events.db` and writes the matching `update-*` row.
 *
 * Why a dedicated emitter rather than just calling `bus.emit`:
 *   - upgrade emit points run in heterogeneous shells. The SessionStart
 *     hook does NOT eagerly open knowledge.db / events.db (manualResources
 *     contract — see bin-session-start.ts). The CLI `update --snooze` /
 *     `--never` commands run in their own short process. The background
 *     `bin-updater.cjs` runs detached.
 *
 *   - Each shell already has a different bus story (the hook-shell wires
 *     a real `InMemoryAttributionBus`; CLI commands often print to stderr
 *     directly). Centralising the persisted-row write here gives all 4
 *     emit points one consistent path that lands in events.db, which is
 *     the durable telemetry source `teamagent stats` aggregates from.
 *
 *   - Swallowing IO failures: telemetry must NEVER break the user-facing
 *     flow. A locked / missing / read-only events.db should not propagate
 *     into the SessionStart banner or the snooze CLI. We log to stderr
 *     and move on (matching the existing `logError` pattern in
 *     session-start-logic.ts).
 */
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  attributionToPersistedRow,
  type UpgradePersistedRow,
} from "@teamagent/core";
import type { AttributionBus } from "@teamagent/ports";
import type {
  UpdatePromptShownEvent,
  UpdateSnoozedEvent,
  UpdateNeverSetEvent,
  UpdateInstalledEvent,
} from "@teamagent/types";

type UpgradeAttributionEvent =
  | UpdatePromptShownEvent
  | UpdateSnoozedEvent
  | UpdateNeverSetEvent
  | UpdateInstalledEvent;

/**
 * Minimal SqliteEventLog shape — duck-typed so callers can inject mocks
 * in unit tests without dragging the real `node:sqlite` adapter in.
 */
export interface UpgradeEventLog {
  append(row: UpgradePersistedRow): void;
  close?(): void;
}

export interface EmitUpgradeOptions {
  /** Override events.db path (test uses a tmp dir). Defaults to ~/.teamagent/events.db. */
  eventsDbPath?: string;
  /** Inject pre-opened bus (hook-shell already has one). Optional — emit-only. */
  bus?: AttributionBus;
  /** Inject pre-opened event log (tests). Skips fs/openDb when provided. */
  eventLog?: UpgradeEventLog;
  /** Override homeDir (tests). Defaults to os.homedir(). */
  homeDir?: string;
  /** Random suffix factory, lets tests pin the row id. Defaults to crypto random. */
  randSuffix?: () => string;
  /** Stderr sink for IO failure logging. Defaults to process.stderr.write. */
  stderr?: (s: string) => void;
}

function defaultEventsDbPath(homeDir: string): string {
  return path.join(homeDir, ".teamagent", "events.db");
}

function defaultRandSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Lazily resolves a real SqliteEventLog by importing @teamagent/adapters.
 * Imported dynamically so this module stays import-cheap when callers only
 * need the bus emit (e.g. inside the SessionStart hook-shell where opening
 * events.db would defeat manualResources).
 *
 * Caller still owns close() — return value is `null` when sqlite isn't
 * available (e.g. node:sqlite extension missing).
 */
async function openRealEventLog(
  eventsDbPath: string,
): Promise<{ log: UpgradeEventLog; close: () => void } | null> {
  try {
    fs.mkdirSync(path.dirname(eventsDbPath), { recursive: true });
    const { SqliteEventLog, openDb } = await import("@teamagent/adapters");
    const db = openDb(eventsDbPath);
    const log = new SqliteEventLog(db);
    // SqliteEventLog.append takes a PersistedEvent shape; UpgradePersistedRow
    // intentionally matches the runtime contract (id/kind/timestamp + payload
    // map). `append` flattens unknown keys into payload; we pass the row as
    // any to bypass the closed PersistedEvent.kind union — the runtime SQL
    // does not care which kind enum you use.
    const wrapped: UpgradeEventLog = {
      append(row: UpgradePersistedRow) {
        // SqliteEventLog appends by spreading top-level fields → events table
        // and JSON-encoding the rest into `payload`. We hand it a shape that
        // already has the canonical `id/kind/timestamp/schema_version` plus
        // a flat `payload` object whose entries become the JSON blob.
        const flattened = {
          id: row.id,
          kind: row.kind,
          timestamp: row.timestamp,
          schema_version: row.schema_version,
          ...row.payload,
        } as unknown as Parameters<typeof log.append>[0];
        log.append(flattened);
      },
      close: () => log.close(),
    };
    return { log: wrapped, close: () => log.close() };
  } catch {
    return null;
  }
}

/**
 * Emit one upgrade AttributionEvent — to bus (if present) and to events.db
 * (always, best-effort).
 *
 * The two channels are independent: a missing events.db must not stop a
 * banner from rendering, and an unwired bus must not stop telemetry. Each
 * side wraps in its own try/catch.
 */
export async function emitUpgradeEvent(
  event: UpgradeAttributionEvent,
  opts: EmitUpgradeOptions = {},
): Promise<void> {
  const stderr = opts.stderr ?? ((s: string) => process.stderr.write(s));

  // Channel 1: in-process bus (synchronous; cheap; never opens fs).
  if (opts.bus) {
    try {
      opts.bus.emit(event);
    } catch (err) {
      stderr(`[teamagent upgrade-emit] bus.emit failed: ${(err as Error).message}\n`);
    }
  }

  // Channel 2: persisted events.db row (durable; IO; best-effort).
  const randSuffix = opts.randSuffix ?? defaultRandSuffix;
  const row = attributionToPersistedRow(event, randSuffix());

  let log = opts.eventLog ?? null;
  let owned = false;
  try {
    if (!log) {
      const homeDir = opts.homeDir ?? os.homedir();
      const eventsDbPath = opts.eventsDbPath ?? defaultEventsDbPath(homeDir);
      const opened = await openRealEventLog(eventsDbPath);
      if (!opened) {
        stderr(`[teamagent upgrade-emit] events.db unavailable; skip persist\n`);
        return;
      }
      log = opened.log;
      owned = true;
    }
    log.append(row);
  } catch (err) {
    stderr(`[teamagent upgrade-emit] eventLog.append failed: ${(err as Error).message}\n`);
  } finally {
    if (owned && log?.close) {
      try {
        log.close();
      } catch {
        /* swallow — already done with the row */
      }
    }
  }
}

/**
 * Sync variant for hot paths that cannot await — used by `update --snooze`
 * / `update --never` where the CLI exits immediately after the state write.
 *
 * If a pre-opened `eventLog` is passed via opts, the persistence is fully
 * synchronous (matches `SqliteEventLog.append`). When no log is injected
 * the helper falls back to fire-and-forget async open (best-effort);
 * failures are logged but do not block the caller.
 */
export function emitUpgradeEventSync(
  event: UpgradeAttributionEvent,
  opts: EmitUpgradeOptions = {},
): void {
  if (opts.bus) {
    try {
      opts.bus.emit(event);
    } catch {
      /* swallow */
    }
  }
  if (opts.eventLog) {
    const randSuffix = opts.randSuffix ?? defaultRandSuffix;
    try {
      opts.eventLog.append(attributionToPersistedRow(event, randSuffix()));
    } catch {
      /* swallow */
    }
    return;
  }
  // No injected log — async fire-and-forget. We do NOT await; CLI exits.
  void emitUpgradeEvent(event, opts).catch(() => { /* swallow */ });
}
