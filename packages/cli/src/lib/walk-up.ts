import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { hasProjectMarker } from "./project-markers.js";

/**
 * Walks from `start` (inclusive) up to the user's home directory boundary.
 * Returns the first ancestor where ALL of the following are true:
 *  (a) `<dir>/.teamagent/knowledge.db` exists as a regular file (lstat — does
 *      NOT follow symlinks; a symlink-to-file at that path is rejected),
 *  (b) at least one project-marker is present in `<dir>` (.git, package.json,
 *      pyproject.toml, pnpm-workspace.yaml, Cargo.toml, go.mod, pom.xml,
 *      build.gradle, build.gradle.kts, Gemfile, composer.json, or the
 *      TeamAgent-managed `.teamagent/.project-root` marker written by
 *      `teamagent init` so docs-only projects are still discoverable).
 *
 * Returns null if no such ancestor is found before reaching `os.homedir()` or
 * the filesystem root, whichever comes first. The home-directory cap rejects
 * attacker-planted `/tmp/.teamagent/knowledge.db` (and similar locations
 * outside the user's home tree); the project-marker requirement rejects bare
 * DB files that have no real project structure around them — both of these
 * are defense-in-depth against a viral-DB trust-boundary attack where a
 * stray `.teamagent/knowledge.db` upstream of `cwd` would otherwise hijack
 * the agent's project root.
 *
 * Error handling: ENOENT / ENOTDIR / EISDIR are expected (the candidate
 * simply doesn't exist or the path component shape is wrong) and the walk
 * keeps going silently. Any OTHER fs error (EACCES, ELOOP, EPERM, EIO, ...)
 * is logged once to stderr in the form
 *   `teamagent walk-up: <code> at <candidate>; aborting walk\n`
 * and the function returns null — i.e. fail closed. We do not try to keep
 * walking past unreadable directories because doing so could mask a hostile
 * filesystem state and silently fall through to a wrong root.
 *
 * Trade-off: because we use `fs.lstatSync`, a symlink at
 * `<dir>/.teamagent/knowledge.db` pointing at a foreign file is rejected.
 * If a real workflow needs to alias one project's DB into another repo, the
 * recommendation is to add a separate marker (e.g. `.teamagent-link`)
 * rather than to symlink the DB itself — a symlink can be planted by an
 * attacker and is exactly what the lstat check is here to defend against.
 *
 * Used by hook-shell, bin-stop, bin-session-start, session-start-logic
 * to fix issue #161: Claude Code launched from a sub-directory must still
 * find the project's `.teamagent/knowledge.db` registered in an ancestor.
 *
 * Behaviour notes:
 * - "First match wins, starting at cwd inclusive" — if both `cwd` and an
 *   ancestor have a `.teamagent/knowledge.db` (and a project marker),
 *   `cwd` wins.
 * - If `<dir>/.teamagent/knowledge.db` exists but is NOT a regular file
 *   (e.g. a directory or a symlink), this function treats it as "not a
 *   match" and KEEPS WALKING. We do not return null early because a higher
 *   ancestor may still have a valid file.
 * - If `start` does not exist on disk, `path.resolve` still returns an
 *   absolute path; the loop tolerates `fs.lstatSync` throwing ENOENT on
 *   missing candidates and walks up until the homeDir / fs-root cap fires.
 * - Cross-platform: uses `path.resolve` / `path.join` / `path.dirname` so
 *   Windows drive roots (`C:\`) and POSIX root (`/`) are both handled by
 *   the `parent === cur` stop condition.
 *
 * @param start The directory to start walking from (inclusive).
 * @param opts.homeDir Optional override for the home-directory cap. Exists
 *   for tests so they can sandbox the cap inside a tmpdir without polluting
 *   the real `~`. Defaults to `os.homedir()`.
 */
export function findTeamagentRoot(
  start: string,
  opts?: { homeDir?: string },
): string | null {
  const homeDir = opts?.homeDir ?? os.homedir();
  let cur = path.resolve(start);
  while (true) {
    const candidate = path.join(cur, ".teamagent", "knowledge.db");
    try {
      if (fs.lstatSync(candidate).isFile() && hasProjectMarker(cur)) return cur;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") {
        /* expected — candidate simply absent; keep walking */
      } else {
        process.stderr.write(
          `teamagent walk-up: ${code ?? String(err)} at ${candidate}; aborting walk\n`,
        );
        return null;
      }
    }
    if (cur === homeDir) return null; // hit $HOME boundary; do not walk above
    const parent = path.dirname(cur);
    if (parent === cur) return null; // fs root
    cur = parent;
  }
}
