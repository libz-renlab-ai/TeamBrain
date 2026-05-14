/**
 * Issue #477: honest "can a hook subprocess actually load node:sqlite" probe.
 *
 * `doctor`'s old `checkNodeVersion` only checked `major >= 22` — it reported
 * green while every hook was DOA, because a bare `major` check can't see that
 * a *spawned subprocess* (no inherited `NODE_OPTIONS`) fails to load the
 * experimental builtin. This probe spawns a real child the same way a hook is
 * spawned — `node --experimental-sqlite --no-warnings` — and verifies
 * `require("node:sqlite").DatabaseSync` is actually reachable. `doctor` and
 * `init` both gate on it so neither can report success on a DOA install.
 */
import { spawnSync } from "node:child_process";
import { NODE_SQLITE_FLAGS } from "./node-sqlite-flags.js";

export interface NodeSqliteProbeResult {
  /** True only when a flagged subprocess loaded `node:sqlite.DatabaseSync`. */
  ok: boolean;
  /** `process.version` of the runtime that ran the probe. */
  nodeVersion: string;
  /** Human-readable one-liner — safe to drop straight into a doctor/init detail. */
  detail: string;
}

/** Test seam: doctor/init accept an injected probe in place of the real spawn. */
export type NodeSqliteProbe = () => NodeSqliteProbeResult;

// Loads node:sqlite and asserts the DatabaseSync ctor exists; exit 3 if the
// module loads but is somehow shaped wrong, exit 1 (thrown) if it can't load.
const PROBE_SCRIPT =
  "const s = require('node:sqlite'); " +
  "if (!s || typeof s.DatabaseSync !== 'function') process.exit(3);";

/**
 * Spawn a flagged Node subprocess and check whether it can load `node:sqlite`.
 * Synchronous on purpose — both callers (`doctor`, `init` pre-check) are
 * already synchronous step functions.
 */
export function probeNodeSqlite(
  nodeExecPath: string = process.execPath,
): NodeSqliteProbeResult {
  const nodeVersion = process.version;
  let r;
  try {
    r = spawnSync(
      nodeExecPath,
      [...NODE_SQLITE_FLAGS, "-e", PROBE_SCRIPT],
      { encoding: "utf-8", windowsHide: true, timeout: 10_000 },
    );
  } catch (e) {
    return {
      ok: false,
      nodeVersion,
      detail: `${nodeVersion} — 无法 spawn node 子进程探测 node:sqlite: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
  if (r.error) {
    return {
      ok: false,
      nodeVersion,
      detail: `${nodeVersion} — 无法 spawn node 子进程探测 node:sqlite: ${r.error.message}`,
    };
  }
  if (r.status === 0) {
    return {
      ok: true,
      nodeVersion,
      detail: `${nodeVersion} — hook 子进程可加载 node:sqlite`,
    };
  }
  const firstStderrLine = (r.stderr ?? "").trim().split("\n")[0] ?? "";
  return {
    ok: false,
    nodeVersion,
    detail:
      `${nodeVersion} — hook 子进程无法加载 node:sqlite ` +
      `(${firstStderrLine || `exit ${r.status ?? "null"}`})`,
  };
}

/** Convenience boolean wrapper around {@link probeNodeSqlite}. */
export function canLoadNodeSqlite(): boolean {
  return probeNodeSqlite().ok;
}
