import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Project markers — the canonical list of files/directories whose presence
 * marks a directory as a "real project". Used by:
 *   - findTeamagentRoot (walk-up.ts) — security boundary; only directories
 *     with a marker are accepted as ancestor project roots.
 *   - decideAction (session-start-logic.ts) — auto-init heuristic; we only
 *     auto-init in directories that look like real projects.
 *
 * The list is intentionally generic: a docs-only TeamAgent project that
 * lacks any of these markers also gets a TeamAgent-managed
 * `.teamagent/.project-root` marker on init, which is included below so
 * walk-up still finds the project.
 *
 * Adding a new marker: add it ONCE here. Both walk-up and session-start-logic
 * import this list; there is no other source of truth.
 */
export const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "pyproject.toml",
  "pnpm-workspace.yaml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  // TeamAgent-managed marker. `teamagent init` writes
  // `<dir>/.teamagent/.project-root` on first run so docs-only projects
  // (no .git, no package.json) are still discoverable by walk-up.
  path.join(".teamagent", ".project-root"),
];

export function hasProjectMarker(dir: string): boolean {
  for (const m of PROJECT_MARKERS) {
    if (fs.existsSync(path.join(dir, m))) return true;
  }
  return false;
}
