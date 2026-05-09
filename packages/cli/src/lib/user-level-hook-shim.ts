/**
 * Issue #209: graceful shim for user-level Claude Code hook commands.
 *
 * `install-hook`'s `applyUserLevelChannelOps` and `install-user-hook`'s SessionStart
 * registration both stage hook bundles to `~/.teamagent/hooks/<basename>` and
 * point `~/.claude/settings.json` at that staged path. If the staged file is
 * later removed (manual cleanup, `~/.teamagent/hooks/` rm -rf, partial install,
 * disk-full mid-stage) the entry stays in settings.json forever — `node
 * <missing>.cjs` then dumps a `MODULE_NOT_FOUND` loader trace into every Stop /
 * PreToolUse / PostToolUse / UserPromptSubmit / SessionStart that fires.
 *
 * Fix: wrap the staged path in a tiny inline `bash -c` shim that exits 0 when
 * the file is missing. Mirror of the project-level B-103 pattern in
 * `.claude/hooks/digital-twin-tap.sh`, kept inline here so the user-level
 * settings entry is self-contained — there is no second shim file to lose.
 *
 * Properties:
 * - bundle missing  -> silent exit 0 (Stop hook never blocks session close).
 * - bundle present  -> `exec node <path>` replaces the shell, so the bundle's
 *   real exit code (incl. Stop-hook-feedback exit 2 → ask Claude to retry)
 *   propagates intact and stdin/stdout/stderr are forwarded as-is.
 * - cross-platform: relies on `bash` being on PATH, the same assumption made
 *   by `.claude/hooks/digital-twin-tap.sh` and the install-hook docs.
 */

export function toForwardSlash(p: string): string {
  return p.replace(/\\/g, "/");
}

export function shellQuote(p: string): string {
  if (/^[A-Za-z0-9_./:\\-]+$/.test(p)) return p;
  return `"${p.replace(/"/g, '\\"')}"`;
}

/**
 * Build the settings.json `command` string for a user-level hook entry that
 * targets a staged bundle at `stagedPath`. Returns a bash -c invocation that
 * exits 0 silently when the bundle is missing, otherwise execs node on it.
 *
 * Quoting strategy: the path is passed as a *positional argv* (`$1`) rather
 * than inlined into the bash body. This keeps the outer single-quoted body
 * a constant string with zero path interpolation, so paths containing single
 * quotes (e.g. `/home/Jane O'Brien/...`) cannot break the body's outer
 * `'...'` quoting. The path-as-argv is double-quoted via `shellQuote`, where
 * single quotes are POSIX-literal, sidestepping the regression that an inline
 * form would have introduced over the pre-shim raw `node "<path>"` command.
 *
 * The literal `_` between body and path is a conventional placeholder for
 * `$0` (script name); `$1` is the staged path.
 */
export function buildUserLevelHookCommand(stagedPath: string): string {
  const q = shellQuote(toForwardSlash(stagedPath));
  return `bash -c '[ -f "$1" ] || exit 0; exec node "$1"' _ ${q}`;
}
