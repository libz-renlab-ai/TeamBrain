/**
 * Issue #477: the Node flags every TeamAgent hook subprocess needs to load
 * `node:sqlite`.
 *
 * `node:sqlite` is an experimental builtin (added in Node 22.5). On Node
 * 22.5–23.3 it only loads with `--experimental-sqlite`; on 23.4+ the flag is a
 * no-op. Claude Code spawns hooks as child processes that do NOT inherit the
 * calling shell's `NODE_OPTIONS`, so the flag must be baked into the hook
 * registration command itself — otherwise every hook is DOA with
 * `ERR_UNKNOWN_BUILTIN_MODULE` even though the CLI (run by the user's own
 * shell, which may carry the flag) works fine.
 *
 * `--no-warnings` suppresses the "ExperimentalWarning: SQLite is an
 * experimental feature" line that node:sqlite prints on every load — that line
 * would otherwise leak into hook stderr on every single tool call.
 *
 * Forward intent (doc only — see docs/CLEAN-UNINSTALL.md): once the Node floor
 * is raised to 24, `node:sqlite` is non-experimental and these flags can be
 * dropped.
 */

/** Flags as an argv array — for `spawn(process.execPath, [...NODE_SQLITE_FLAGS, bin])`. */
export const NODE_SQLITE_FLAGS = [
  "--experimental-sqlite",
  "--no-warnings",
] as const;

/** Flags as a single space-joined string — for hook registration command strings. */
export const NODE_SQLITE_FLAGS_STR = NODE_SQLITE_FLAGS.join(" ");
