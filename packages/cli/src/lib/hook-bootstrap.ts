/**
 * Issue #477: last-resort guard for hook bundles that fail to load `node:sqlite`.
 *
 * Every hook bundle transitively `require("node:sqlite")` at module-init time
 * (primarily via `@teamagent/adapters` → `storage/sqlite/schema.ts`; a few bins
 * have additional lazy `node:sqlite` loads, but those are self-guarded with
 * try/catch). On a Node runtime where that builtin can't load — too old
 * (< 22.5), or 22.5–23.3 spawned without `--experimental-sqlite` — the require
 * throws `ERR_UNKNOWN_BUILTIN_MODULE` *before* the hook's own `main()` (and the
 * hook-shell try/finally) ever runs. Without this guard the user sees a 30-line
 * raw Node stack dump on every single Claude Code event.
 *
 * This module installs a `process.on("uncaughtException")` handler **at module
 * load time** (the top-level `arm()` call below) that catches exactly that
 * module-init throw, replaces the stack dump with one actionable line, and
 * exits 0 so the hook fails open (never blocks Claude Code). Any *other*
 * uncaught exception is left to crash loudly — this guard is deliberately
 * narrow.
 *
 * Ordering contract: bin entries must list `import { armHookBootstrap } from
 * "./lib/hook-bootstrap.js"` as their **first** import. ESM evaluates imports
 * depth-first in source order, so this module's body (the `arm()` call) then
 * runs before `@teamagent/adapters` is evaluated. The named import + an
 * `armHookBootstrap()` call keep the import *referenced* — a bare
 * side-effect-only `import "..."` is the shape a bundler is most likely to
 * reorder or tree-shake away.
 */

/**
 * True when `err` (or its one-level `cause`) is the `node:sqlite` builtin-load
 * failure. Tight predicate: requires BOTH a load-failure error code AND a
 * `node:sqlite` mention in the message, so unrelated errors are NOT swallowed.
 *
 * Accepted codes: `ERR_UNKNOWN_BUILTIN_MODULE` (the code Node throws for a
 * `node:`-prefixed-but-unknown builtin — the shape #477's reporter hit) and
 * `MODULE_NOT_FOUND` (a defensive hedge in case an older / differently-built
 * Node surfaces the missing builtin under the generic loader code). Both are
 * still gated on the message naming `node:sqlite`, which keeps the predicate
 * tight — a generic `MODULE_NOT_FOUND` for some other module is not matched.
 *
 * Walks one level of `err.cause` because `createRequire` / loader paths can
 * wrap the original throw.
 */
export function isSqliteLoadError(err: unknown): boolean {
  const candidates: unknown[] = [err];
  if (err && typeof err === "object" && "cause" in err) {
    candidates.push((err as { cause?: unknown }).cause);
  }
  for (const e of candidates) {
    if (!e || typeof e !== "object") continue;
    const code = (e as { code?: unknown }).code;
    const message = (e as { message?: unknown }).message;
    const isLoadFailureCode =
      code === "ERR_UNKNOWN_BUILTIN_MODULE" || code === "MODULE_NOT_FOUND";
    if (
      isLoadFailureCode &&
      /node:sqlite/i.test(typeof message === "string" ? message : "")
    ) {
      return true;
    }
  }
  return false;
}

/** One actionable stderr line shown instead of the raw stack. */
export const HOOK_SQLITE_FALLBACK_MESSAGE =
  "teamagent hook: node:sqlite unavailable on this Node runtime " +
  "(needs Node >= 22.5 spawned with --experimental-sqlite) — " +
  "run `teamagent doctor` for the fix. Hook skipped.";

/**
 * The `uncaughtException` handler body. Exported so it can be unit-tested
 * deterministically without spawning a real subprocess.
 *
 * - `node:sqlite` load failure → one actionable stderr line, exit 0 (fail open;
 *   never block Claude Code).
 * - anything else → restore default fatal behavior: print the stack, exit 1.
 */
export function handleHookUncaughtException(err: unknown): void {
  if (isSqliteLoadError(err)) {
    process.stderr.write(HOOK_SQLITE_FALLBACK_MESSAGE + "\n");
    process.exit(0);
    return;
  }
  process.stderr.write(
    String((err as { stack?: unknown })?.stack ?? err) + "\n",
  );
  process.exit(1);
}

let armed = false;

function arm(): void {
  if (armed) return;
  // Never install the handler under the test runner. bin-*.ts entries are
  // imported by their own vitest suites (e.g. bin-stop.test.ts imports
  // bin-stop.ts), and a `process.exit`-calling `uncaughtException` handler
  // would preempt vitest's crash reporting and kill the worker. The handler
  // body itself is unit-tested directly via the exported
  // `handleHookUncaughtException`. Same spirit as bin-embedder's
  // `TEAMAGENT_EMBEDDER_NO_AUTOSTART` test guard.
  if (process.env.VITEST) {
    armed = true;
    return;
  }
  armed = true;
  process.on("uncaughtException", handleHookUncaughtException);
}

// Arm on module load. Placed at top level so the handler is installed the
// moment this module is evaluated — which, when this module is the FIRST
// import of a bin entry, is before `@teamagent/adapters` (whose schema.ts
// throws `ERR_UNKNOWN_BUILTIN_MODULE` at module-init on a Node without
// node:sqlite) is evaluated.
arm();

/**
 * No-op re-entry point. Exists so bin entries can `import { armHookBootstrap }`
 * and call it: a *referenced* import survives tree-shaking and keeps its
 * position in evaluation order, which a bare `import "..."` might not. The
 * actual arming already happened at module load (see `arm()` above); this is
 * idempotent.
 */
export function armHookBootstrap(): void {
  arm();
}
