/**
 * Issue #368 — uploader daemon log helpers.
 *
 * The Stop-hook tap spawns `bin-uploader.cjs` with its stdout+stderr pointed
 * at `~/.teamagent/digital-twin/uploader.log` (see `tap-session.ts`), so a
 * crash (`MODULE_NOT_FOUND`, auth failure, unhandled throw) is recorded rather
 * than swallowed by `stdio: 'ignore'`. `teamagent digital-twin status` and
 * `teamagent doctor` surface the most recent error line from here so a broken
 * upload pipeline is visible instead of silent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { digitalTwinPaths } from '../paths.js';

/**
 * Heuristic for "this log line looks like an error / crash" — used to pick the
 * line to surface in `status` / `doctor`. Tuned to the daemon's actual output:
 * its normal diagnostics ("daemon exiting (idle)", "another daemon is already
 * running", "dry-run OK", "config missing or disabled") don't match, but Node
 * module-resolution failures, the uploader's own `digital-twin daemon crash:` /
 * `auth failed` lines, and stack-trace `Error: ` / `TypeError: ` &c. lines do.
 * Anchored to error-class names + known prefixes rather than loose keywords so
 * a benign line that merely mentions "throw" isn't surfaced as `last_error`.
 */
const ERROR_LINE_RE =
  /MODULE_NOT_FOUND|Cannot find module|daemon crash|auth failed|UnhandledPromiseRejection|\b(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError)\b:|\b(?:EACCES|ENOENT|EPERM|EISDIR|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)\b/;

/** Max length of a surfaced log line before it is truncated with an ellipsis. */
const MAX_LINE_LEN = 400;

export interface UploaderLogError {
  /** The trimmed (and possibly truncated) log line. */
  line: string;
  /** 1-based line number within `uploader.log`. */
  lineno: number;
}

/**
 * Return the last error-looking line from `~/.teamagent/digital-twin/uploader.log`,
 * or `null` when the log doesn't exist, can't be read, or has no error line.
 * Best-effort: never throws.
 */
export function readLastUploaderError(home: string): UploaderLogError | null {
  const logPath = digitalTwinPaths(home).uploaderLogFile;
  if (!existsSync(logPath)) return null;
  let text: string;
  try {
    text = readFileSync(logPath, 'utf-8');
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = (lines[i] ?? '').trim();
    if (raw && ERROR_LINE_RE.test(raw)) {
      const line = raw.length > MAX_LINE_LEN ? `${raw.slice(0, MAX_LINE_LEN)}…` : raw;
      return { line, lineno: i + 1 };
    }
  }
  return null;
}
