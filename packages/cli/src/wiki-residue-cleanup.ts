import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * B-090: clean up Wiki subsystem residue.
 *
 * Wiki was removed in 280e4e8 but ~/.teamagent/wiki-refresh-errors.log can
 * persist on dev machines that ran wiki refresh before the removal. The log
 * is misleading (a fresh `grep wiki ~/.teamagent/` would suggest wiki is
 * still active) and serves no purpose post-removal.
 *
 * Best-effort: silently swallow any fs error so this never blocks SessionStart.
 */
export function cleanupWikiResidue(homeDir: string = os.homedir()): void {
  try {
    const target = path.join(homeDir, ".teamagent", "wiki-refresh-errors.log");
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
    }
  } catch {
    /* best-effort */
  }
}
