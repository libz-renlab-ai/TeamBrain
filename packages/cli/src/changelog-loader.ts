/**
 * Imperative-shell loader for the bundled CHANGELOG.md (issue #225).
 *
 * Strategy mirrors `resolveSeedPath` in commands/init.ts:
 *   - Bundled tarball:  <pkg>/dist/CHANGELOG.md   (tsup onSuccess copy)
 *   - Dev tree:         <repo>/CHANGELOG.md       (walk up from this file)
 *
 * Returns "" when neither exists. Caller treats empty as "no bullets" and
 * still renders the upgrade prompt without the what's-new section.
 *
 * Lives in `packages/cli/` (imperative shell) because it does fs IO; the
 * pure parser in `@teamagent/core` does the actual line-scan.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadBundledChangelog(): string {
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    // Bundled: <pkg>/dist/CHANGELOG.md
    const bundled = path.join(dir, "CHANGELOG.md");
    try {
      const stat = fs.statSync(bundled);
      if (stat.isFile()) return fs.readFileSync(bundled, "utf-8");
    } catch { /* continue */ }
    // Dev: <repo>/CHANGELOG.md (walk up to monorepo root)
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}
