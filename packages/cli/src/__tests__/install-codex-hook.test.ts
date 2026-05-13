import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { executeInit } from "../commands/init.js";

/**
 * Issue #291 — Codex hooks installer (init.ts doInstallCodexHooks).
 *
 * Tests the three Acceptance facts:
 *   (1) `init --target=both` (and `--target=codex`) writes ~/.codex/hooks.json.
 *   (2) Re-running is idempotent: no duplicate teamagent entries, no clobber.
 *   (3) `target=claude` behavior is unchanged (no Codex files written).
 *
 * Plus grill §15 verdict (idempotent + no clobber via _teamagentTag merge):
 *   (4) User-authored untagged entries survive a re-init.
 *   (5) Project hook scripts are staged into ~/.teamagent/hooks/codex/.
 *
 * Out of scope (deferred — see PR notes):
 *   - --strict exit code (grill §14)
 *   - --json output formatter (grill §14)
 *   - .teamagent/init-state.json + hook_config_hash (grill §15 enhancement)
 *
 * Notes on test setup (mirrors existing init.test.ts conventions):
 *   - No CLAUDE.md in tmp cwd → doImportRules is a no-op so no LLM needed.
 *   - skipSeed: true, installPlugins: false, skipWarmup: true.
 *   - FAKE_HOOK_ENTRY (this test file) is passed to executeInit so Claude
 *     installHook() finds a valid existing file when target includes Claude.
 *     installHook() only requires hookEntry to point at a real file; the file
 *     contents are never executed by these tests.
 */

interface CodexBlock {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
  _teamagentTag?: string;
}
interface CodexCfg {
  hooks?: Record<string, CodexBlock[]>;
  [k: string]: unknown;
}

const FAKE_HOOK_ENTRY = fileURLToPath(import.meta.url);

function mkTmp(): { cwd: string; home: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "install-codex-hook-"));
  const cwd = path.join(root, "project");
  const home = path.join(root, "home");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  return {
    cwd,
    home,
    cleanup: () => {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  };
}

function seedProjectCodex(cwd: string): void {
  // Mirror the structure of the real .codex/ after #290 merged.
  const hooksDir = path.join(cwd, ".codex", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".codex", "hooks.json"),
    JSON.stringify(
      {
        hooks: {
          SessionStart: [
            {
              matcher: "*",
              hooks: [
                {
                  type: "command",
                  command:
                    'repo="${CODEX_PROJECT_DIR:-$PWD}"; root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null || printf "%s" "$repo"); bash "$root/.codex/hooks/newsboard-session-start.sh"',
                  timeout: 5,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: "Bash|apply_patch|WebFetch",
              hooks: [
                {
                  type: "command",
                  command:
                    'repo="${CODEX_PROJECT_DIR:-$PWD}"; root=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null || printf "%s" "$repo"); bash "$root/.codex/hooks/pre-tool-use-adapter.sh"',
                  timeout: 30,
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(hooksDir, "newsboard-session-start.sh"),
    "#!/usr/bin/env bash\nexit 0\n",
  );
  fs.writeFileSync(
    path.join(hooksDir, "pre-tool-use-adapter.sh"),
    "#!/usr/bin/env bash\nexit 0\n",
  );
}

function baseOpts(cwd: string, home: string) {
  return {
    cwd,
    homeDir: home,
    skipSeed: true,
    skipWarmup: true,
    installPlugins: false,
    hookEntry: FAKE_HOOK_ENTRY,
    userLevelHook: false,
    now: () => new Date("2026-05-13T03:30:00Z"),
  };
}

describe("init doInstallCodexHooks (issue #291)", () => {
  let tmp: ReturnType<typeof mkTmp>;

  beforeEach(() => {
    tmp = mkTmp();
    seedProjectCodex(tmp.cwd);
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("target=codex writes ~/.codex/hooks.json with _teamagentTag per event block", async () => {
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "codex", skipHook: false });
    const userHooksPath = path.join(tmp.home, ".codex", "hooks.json");
    expect(fs.existsSync(userHooksPath)).toBe(true);
    const cfg: CodexCfg = JSON.parse(fs.readFileSync(userHooksPath, "utf-8"));
    expect(cfg.hooks?.SessionStart?.[0]?._teamagentTag).toBe("teamagent:codex-SessionStart:v1");
    expect(cfg.hooks?.PreToolUse?.[0]?._teamagentTag).toBe("teamagent:codex-PreToolUse:v1");
  });

  it("stages .codex/hooks/*.sh into ~/.teamagent/hooks/codex/", async () => {
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "codex", skipHook: false });
    const stagedDir = path.join(tmp.home, ".teamagent", "hooks", "codex");
    expect(fs.existsSync(path.join(stagedDir, "newsboard-session-start.sh"))).toBe(true);
    expect(fs.existsSync(path.join(stagedDir, "pre-tool-use-adapter.sh"))).toBe(true);
  });

  it("rewrites $root/.codex/hooks/X.sh commands to staged absolute paths", async () => {
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "codex", skipHook: false });
    const cfg: CodexCfg = JSON.parse(
      fs.readFileSync(path.join(tmp.home, ".codex", "hooks.json"), "utf-8"),
    );
    const cmd = cfg.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command ?? "";
    expect(cmd).not.toMatch(/\$root|CODEX_PROJECT_DIR|git -C/);
    expect(cmd).toContain("pre-tool-use-adapter.sh");
    expect(cmd).toContain(".teamagent");
    expect(cmd).toContain("codex");
  });

  it("is idempotent: re-running produces byte-identical user hooks.json", async () => {
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "codex", skipHook: false });
    const userHooksPath = path.join(tmp.home, ".codex", "hooks.json");
    const first = fs.readFileSync(userHooksPath, "utf-8");
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "codex", skipHook: false });
    const second = fs.readFileSync(userHooksPath, "utf-8");
    expect(second).toBe(first);
  });

  it("preserves user-authored untagged entries on re-init (no clobber)", async () => {
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "codex", skipHook: false });
    const userHooksPath = path.join(tmp.home, ".codex", "hooks.json");
    const cfg: CodexCfg = JSON.parse(fs.readFileSync(userHooksPath, "utf-8"));
    cfg.hooks ??= {};
    cfg.hooks.Stop = [
      {
        hooks: [{ type: "command", command: "echo user-custom", timeout: 5 }],
      },
    ];
    fs.writeFileSync(userHooksPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");

    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "codex", skipHook: false });
    const after: CodexCfg = JSON.parse(fs.readFileSync(userHooksPath, "utf-8"));
    const stopBlocks = after.hooks?.Stop ?? [];
    expect(stopBlocks.length).toBe(1);
    expect(stopBlocks[0]?._teamagentTag).toBeUndefined();
    expect(stopBlocks[0]?.hooks?.[0]?.command).toBe("echo user-custom");
    expect(after.hooks?.SessionStart?.[0]?._teamagentTag).toBe("teamagent:codex-SessionStart:v1");
    expect(after.hooks?.PreToolUse?.[0]?._teamagentTag).toBe("teamagent:codex-PreToolUse:v1");
  });

  it("target=claude does NOT write ~/.codex/hooks.json (unchanged behavior)", async () => {
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "claude", skipHook: false });
    expect(fs.existsSync(path.join(tmp.home, ".codex", "hooks.json"))).toBe(false);
  });

  it("target=both writes BOTH Claude settings and Codex hooks.json", async () => {
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "both", skipHook: false });
    expect(fs.existsSync(path.join(tmp.cwd, ".claude", "settings.local.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmp.home, ".codex", "hooks.json"))).toBe(true);
  });

  it("skipHook=true skips BOTH Claude and Codex installers", async () => {
    await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "both", skipHook: true });
    expect(fs.existsSync(path.join(tmp.cwd, ".claude", "settings.local.json"))).toBe(false);
    expect(fs.existsSync(path.join(tmp.home, ".codex", "hooks.json"))).toBe(false);
  });

  it("project has no .codex/hooks.json: returns ok with skip-friendly detail (no failure)", async () => {
    fs.rmSync(path.join(tmp.cwd, ".codex"), { recursive: true, force: true });
    const res = await executeInit({ ...baseOpts(tmp.cwd, tmp.home), target: "codex", skipHook: false });
    const step = res.steps.find((s) => s.step === "install-codex-hook");
    expect(step?.status).toBe("ok");
    expect(step?.detail).toMatch(/无 .codex\/hooks\.json/);
  });
});
