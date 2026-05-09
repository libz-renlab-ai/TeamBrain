import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { hasProjectMarker } from "./project-markers.js";

/**
 * Adapter-side mirror of `@teamagent/cli/lib/walk-up`. Kept identical because
 * `@teamagent/adapters` cannot import from `@teamagent/cli` (dependency
 * direction). Consolidate to a shared util package as future refactor.
 *
 * Walks from `start` (inclusive) up to the user's home directory boundary.
 * Returns the first ancestor where ALL of the following are true:
 *  (a) `<dir>/.teamagent/knowledge.db` exists as a regular file (lstat — does
 *      NOT follow symlinks; a symlink-to-file at that path is rejected),
 *  (b) at least one project-marker is present in `<dir>`.
 *
 * Returns null if no such ancestor is found before reaching `os.homedir()` or
 * the filesystem root, whichever comes first.
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
    if (cur === homeDir) return null;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}
