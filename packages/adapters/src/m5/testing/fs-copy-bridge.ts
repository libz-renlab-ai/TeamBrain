import { promises as fs } from "node:fs";
import * as path from "node:path";

/**
 * Fast-track transit alternative for the m5-share/m5-sync dual-home test
 * harness: directly copy `.teamagent/team/<author>/*.json` between two
 * project checkouts, bypassing git entirely.
 *
 * Mirrors the on-disk shape produced by FsTeamRuleStore (see
 * `packages/adapters/src/m5/fs-team-rule-store.ts`):
 *   <projectRoot>/.teamagent/team/<claim_author>/<rule_id>.json
 *
 * Atomicity contract is preserved: each destination file is written via
 * `<dest>.tmp.<pid>.<ts>` + `rename`, matching FsTeamRuleStore.writeRule, so
 * a concurrent reader on the destination side never sees a partial file.
 *
 * Idempotent: re-running with the same source/destination is safe; existing
 * destination files are overwritten last-write-wins per the m5-sync LWW
 * contract.
 */
export interface FsCopyBridge {
  /**
   * Copy ALL `.teamagent/team/<author>/*.json` files from `fromProjectRoot` to
   * `toProjectRoot`.
   *
   * - Creates destination directory structure as needed.
   * - If source `.teamagent/team/` does not exist, returns 0 (NOT an error).
   * - Only top-level `*.json` files inside `<author>/` are copied. Non-JSON
   *   files and nested subdirectories are skipped, not recursed.
   * - Idempotent / overwrite-on-collision.
   *
   * @returns the number of files actually copied.
   */
  copyTeamRules(fromProjectRoot: string, toProjectRoot: string): Promise<number>;
}

/** Factory for the default FsCopyBridge implementation. */
export function createFsCopyBridge(): FsCopyBridge {
  return new FsCopyBridgeImpl();
}

class FsCopyBridgeImpl implements FsCopyBridge {
  async copyTeamRules(
    fromProjectRoot: string,
    toProjectRoot: string,
  ): Promise<number> {
    const srcTeamDir = path.join(fromProjectRoot, ".teamagent", "team");
    const dstTeamDir = path.join(toProjectRoot, ".teamagent", "team");

    let authors: string[];
    try {
      authors = await fs.readdir(srcTeamDir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw e;
    }

    let copied = 0;
    for (const claimAuthor of authors) {
      const srcAuthorDir = path.join(srcTeamDir, claimAuthor);
      let stat;
      try {
        stat = await fs.stat(srcAuthorDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      let entries: string[];
      try {
        entries = await fs.readdir(srcAuthorDir);
      } catch {
        continue;
      }

      const dstAuthorDir = path.join(dstTeamDir, claimAuthor);
      let dstAuthorDirReady = false;

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const srcFile = path.join(srcAuthorDir, entry);
        let entryStat;
        try {
          entryStat = await fs.stat(srcFile);
        } catch {
          continue;
        }
        // Only direct files; do not recurse subdirectories even if named *.json.
        if (!entryStat.isFile()) continue;

        if (!dstAuthorDirReady) {
          await fs.mkdir(dstAuthorDir, { recursive: true });
          dstAuthorDirReady = true;
        }

        const finalPath = path.join(dstAuthorDir, entry);
        const tmpPath = `${finalPath}.tmp.${process.pid}.${Date.now()}.${copied}`;
        await fs.copyFile(srcFile, tmpPath);
        await fs.rename(tmpPath, finalPath);
        copied += 1;
      }
    }
    return copied;
  }
}
