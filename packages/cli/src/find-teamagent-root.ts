import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Walk up from `cwd` to find the nearest ancestor directory containing
 * `.teamagent/knowledge.db`. Returns that ancestor, or `cwd` if none found.
 *
 * Mirrors `git`'s ancestor-walk semantics for `.git/`.
 *
 * Cross-platform: uses `path.parse(dir).root` to detect the filesystem root
 * on both Windows (`C:\`) and POSIX (`/`), preventing infinite loops.
 */
export function findTeamagentRoot(cwd: string): string {
  let dir = path.resolve(cwd);
  // path.parse(dir).root gives "C:\\" on Windows or "/" on POSIX
  const fsRoot = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, ".teamagent", "knowledge.db"))) {
      return dir;
    }
    if (dir === fsRoot) return cwd;
    const parent = path.dirname(dir);
    if (parent === dir) return cwd;
    dir = parent;
  }
}
