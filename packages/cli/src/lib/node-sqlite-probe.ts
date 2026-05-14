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
 *
 * The probe resolves `node` from PATH (not `process.execPath`) on purpose: the
 * registered hook command is the literal string `node --experimental-sqlite …`,
 * so Claude Code runs whatever `node` is on PATH at hook-spawn time. With
 * nvm / Volta / asdf the PATH `node` can differ from the `node` running
 * `doctor` / `init` — probing `process.execPath` would report green while the
 * hooks' actual `node` is still DOA, recreating the exact false-green this
 * issue is about. The probe script prints the *spawned* node's version so the
 * detail message names the runtime hooks actually use.
 */
import { spawnSync } from "node:child_process";
import { NODE_SQLITE_FLAGS } from "./node-sqlite-flags.js";

export interface NodeSqliteProbeResult {
  /** True only when a flagged subprocess loaded `node:sqlite.DatabaseSync`. */
  ok: boolean;
  /** Version of the *spawned* node (the runtime hooks use), or "unknown" if it never started. */
  nodeVersion: string;
  /** Human-readable one-liner — safe to drop straight into a doctor/init detail. */
  detail: string;
}

/** Test seam: doctor/init accept an injected probe in place of the real spawn. */
export type NodeSqliteProbe = () => NodeSqliteProbeResult;

// Prints the spawned node's version FIRST (so we capture it even when the
// require below throws), then loads node:sqlite and asserts the DatabaseSync
// ctor exists: exit 3 if the module loads but is shaped wrong, exit 1 (thrown)
// if it can't load at all.
const PROBE_SCRIPT =
  "process.stdout.write(process.version);" +
  "const s = require('node:sqlite');" +
  "if (!s || typeof s.DatabaseSync !== 'function') process.exit(3);";

/**
 * Spawn a flagged Node subprocess and check whether it can load `node:sqlite`.
 * Synchronous on purpose — both callers (`doctor`, `init` pre-check) are
 * already synchronous step functions. `nodeBin` defaults to PATH-resolved
 * `node` (see module doc); tests inject a different value.
 */
export function probeNodeSqlite(
  nodeBin: string = "node",
): NodeSqliteProbeResult {
  let r;
  try {
    r = spawnSync(
      nodeBin,
      [...NODE_SQLITE_FLAGS, "-e", PROBE_SCRIPT],
      { encoding: "utf-8", windowsHide: true, timeout: 10_000 },
    );
  } catch (e) {
    return {
      ok: false,
      nodeVersion: "unknown",
      detail: `无法 spawn \`${nodeBin}\` 探测 node:sqlite: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }
  // The probe script prints the spawned node's version before the require, so
  // stdout carries it even on the require-throw path.
  const spawnedVersion = (r.stdout ?? "").trim() || "unknown";
  if (r.error) {
    return {
      ok: false,
      nodeVersion: spawnedVersion,
      detail: `无法 spawn \`${nodeBin}\` 探测 node:sqlite: ${r.error.message}`,
    };
  }
  if (r.status === 0) {
    return {
      ok: true,
      nodeVersion: spawnedVersion,
      detail: `${spawnedVersion} (PATH \`${nodeBin}\`) — hook 子进程可加载 node:sqlite`,
    };
  }
  const firstStderrLine = (r.stderr ?? "").trim().split("\n")[0] ?? "";
  return {
    ok: false,
    nodeVersion: spawnedVersion,
    detail:
      `${spawnedVersion} (PATH \`${nodeBin}\`) — hook 子进程无法加载 node:sqlite ` +
      `(${firstStderrLine || `exit ${r.status ?? "null"}`})`,
  };
}

/** Convenience boolean wrapper around {@link probeNodeSqlite}. */
export function canLoadNodeSqlite(): boolean {
  return probeNodeSqlite().ok;
}
