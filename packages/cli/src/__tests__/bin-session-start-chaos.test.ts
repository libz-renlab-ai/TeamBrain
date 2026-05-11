import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Issue #280 chaos test for the SessionStart hook bundle.
 *
 * Background: the user reported `MODULE_NOT_FOUND: web-tree-sitter` when
 * spawning the staged `~/.teamagent/hooks/bin-session-start.cjs`. The
 * existing `hook-bundle-contract.test.ts` scans `packages/cli/dist/` —
 * but the **staged copy** is built by `packages/teamagent/tsup.config.ts`
 * and lives at `packages/teamagent/dist/bin-session-start.cjs` before
 * postinstall copies it to `~/.teamagent/hooks/`. The teamagent dist
 * uses a different `noExternal` set (e.g. `@xenova/transformers` is
 * inlined for the hook bundles) and is the actual surface area where
 * issue #280's MODULE_NOT_FOUND surfaced.
 *
 * Chaos protocol — for every hook bundle we ship:
 *   1. Copy the .cjs to a tmpdir that has NO sibling `node_modules/`
 *      (mirrors `~/.teamagent/hooks/`'s placement on a real install).
 *   2. Spawn `node <tmpdir>/<bin>` with empty stdin and no signal env vars
 *      (CLAUDE_PROJECT_DIR / TEAMAGENT_ALLOW_BARE_SESSIONSTART). Empty
 *      stdin → `parseInput` returns null → the hook fast-exits 0.
 *   3. Assert exit code 0. Any non-zero means a transitive `require()`
 *      fired at module-load time and could not resolve, which is exactly
 *      the issue-280 failure mode.
 *
 * The probe verifies the **import graph loads cleanly** outside any
 * node_modules tree. It does not verify business logic (parseInput's
 * null branch deliberately bypasses auto-init / cleanup / decideAction).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Resolve dist paths relative to this test file. cli dist sits at
// `packages/cli/dist/`; teamagent dist sits at `packages/teamagent/dist/`.
const CLI_DIST = path.resolve(HERE, "..", "..", "dist");
const TEAMAGENT_DIST = path.resolve(HERE, "..", "..", "..", "teamagent", "dist");

interface SpawnReport {
  exitCode: number | null;
  stderrTail: string;
  timedOut: boolean;
  spawnError?: string;
}

async function spawnHookOutsideNodeModules(
  binPath: string,
): Promise<SpawnReport> {
  // Stage into a tmpdir that has no sibling node_modules — mirrors the
  // ~/.teamagent/hooks/ placement on a real install.
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "issue-280-chaos-"));
  const staged = path.join(stageRoot, path.basename(binPath));
  fs.copyFileSync(binPath, staged);

  return new Promise<SpawnReport>((resolve) => {
    const env = { ...process.env };
    delete env["CLAUDE_PROJECT_DIR"];
    delete env["TEAMAGENT_ALLOW_BARE_SESSIONSTART"];

    let child;
    try {
      child = spawn(process.execPath, [staged], {
        cwd: stageRoot,
        stdio: ["pipe", "pipe", "pipe"],
        env,
        windowsHide: true,
      });
    } catch (err) {
      resolve({ exitCode: null, stderrTail: "", timedOut: false, spawnError: String(err) });
      return;
    }

    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* already dead */ }
      const tail = stderr.split("\n").slice(-10).join("\n");
      resolve({ exitCode: null, stderrTail: tail, timedOut: true });
    }, 15_000);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stderrTail: stderr, timedOut: false, spawnError: String(err) });
    });
    child.stderr?.on("data", (d) => { stderr += d.toString("utf-8"); });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const tail = stderr.split("\n").slice(-10).join("\n");
      resolve({ exitCode: code, stderrTail: tail, timedOut: false });
    });

    child.stdin?.end();
  });
}

describe("bin-session-start chaos: load graph outside node_modules (issue #280)", () => {
  const cliBin = path.join(CLI_DIST, "bin-session-start.cjs");
  const tmBin = path.join(TEAMAGENT_DIST, "bin-session-start.cjs");

  it.skipIf(!fs.existsSync(cliBin))(
    "packages/cli/dist/bin-session-start.cjs spawns clean from tmpdir with empty stdin",
    async () => {
      const report = await spawnHookOutsideNodeModules(cliBin);
      expect(report.spawnError, `spawn failed: ${report.spawnError}`).toBeUndefined();
      expect(report.timedOut, `timed out — likely stuck in require chain. stderr:\n${report.stderrTail}`).toBe(false);
      expect(
        report.exitCode,
        `non-zero exit ${report.exitCode} — issue #280 regression. stderr tail:\n${report.stderrTail}`,
      ).toBe(0);
    },
  );

  it.skipIf(!fs.existsSync(tmBin))(
    "packages/teamagent/dist/bin-session-start.cjs (the staged bundle) spawns clean from tmpdir",
    async () => {
      const report = await spawnHookOutsideNodeModules(tmBin);
      expect(report.spawnError, `spawn failed: ${report.spawnError}`).toBeUndefined();
      expect(report.timedOut, `timed out — likely stuck in require chain. stderr:\n${report.stderrTail}`).toBe(false);
      expect(
        report.exitCode,
        `non-zero exit ${report.exitCode} — issue #280 regression. stderr tail:\n${report.stderrTail}`,
      ).toBe(0);
    },
  );
});
