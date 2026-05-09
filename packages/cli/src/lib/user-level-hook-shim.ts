/**
 * Issue #209: graceful shim for user-level Claude Code hook commands.
 *
 * `install-hook`'s `mergeUserLevelHooks` and `install-user-hook`'s SessionStart
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
 */
export function buildUserLevelHookCommand(stagedPath: string): string {
  const q = shellQuote(toForwardSlash(stagedPath));
  return `bash -c '[ -f ${q} ] || exit 0; exec node ${q}'`;
}
