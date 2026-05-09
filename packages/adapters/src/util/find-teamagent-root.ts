import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Walk up from `cwd` to find the nearest ancestor directory containing
 * `.teamagent/knowledge.db`. Returns that ancestor, or `cwd` if none found.
 *
 * Mirrors `git`'s ancestor-walk semantics for `.git/`, so subfolder calls
 * resolve to the project's `.teamagent/` (issue #161).
 *
 * Cross-platform: uses `path.parse(dir).root` to detect the filesystem root
 * on both Windows (`C:\`) and POSIX (`/`), preventing infinite loops.
 *
 * NOTE: this is a copy of the helper in @teamagent/cli/find-teamagent-root.
 * The cli package depends on @teamagent/adapters, so adapters cannot import
 * from cli. The two copies are kept in sync; consolidation is a future
 * refactor (move the canonical helper to a shared/util package).
 */
export function findTeamagentRoot(cwd: string): string {
  let dir = path.resolve(cwd);
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
