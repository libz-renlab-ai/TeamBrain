/**
 * Shared argv helpers used by individual command parsers.
 *
 * `assertNoUnknownFlags` lets a command surface a clear error for any
 * `--foo` argument it does not understand instead of silently ignoring
 * the typo and proceeding to perform real side effects (B-127, B-149
 * from chaos-qa-hunter Wave 12).
 *
 * Commands pass their full known-flag list (including value-bearing
 * flags). Both `--flag` and `--flag=value` forms are accepted; the
 * helper trims any `=...` suffix before checking.
 */

export class UnknownFlagError extends Error {
  /** The offending argv entry, e.g. "--dyr-run". */
  readonly flag: string;
  /** The command label used to compose the error message. */
  readonly command: string;
  constructor(command: string, flag: string) {
    super(`${command}: unknown flag "${flag}". Run 'teamagent --help' for valid flags.`);
    this.name = "UnknownFlagError";
    this.command = command;
    this.flag = flag;
  }
}

/**
 * Throw UnknownFlagError when argv contains a `--something` we don't know.
 * Non-flag positional args (e.g. a numeric `N` after `review`) are not
 * inspected — pass them through.
 */
export function assertNoUnknownFlags(
  command: string,
  argv: readonly string[],
  knownFlags: ReadonlySet<string>,
): void {
  for (const a of argv) {
    if (typeof a !== "string") continue;
    if (!a.startsWith("--")) continue;
    const base = a.split("=")[0]!;
    if (!knownFlags.has(base)) {
      throw new UnknownFlagError(command, a);
    }
  }
}
