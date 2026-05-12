// packages/cli/src/__tests__/doctor.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { openDb } from "@teamagent/adapters";
import {
  checkClaudeMd,
  checkInstallTableBundles,
  checkDigitalTwinUploader,
  executeDoctor,
  renderDoctorResult,
  renderDoctorHelp,
  parseDoctorArgs,
  backupFile,
  checkClaudeCode,
  checkHookSpawn,
  checkTeamSharingStatus,
  pathContainsNodeModulesBin,
  checkSettingsJsonScope,
  checkPluginSync,
  checkCodexBin,
  checkMcpReachability,
  type InstallTableEnumerator,
  type InstallTableEntry,
  type ClaudeProbe,
  type ClaudeProbeResult,
  type CodexProbe,
  type HookProbe,
  type HookProbeResult,
  type McpProbe,
  type UploaderProbe,
  type DoctorCheckResult,
  type DoctorResult,
  type FixOutcome,
} from "../commands/doctor.js";
import { digitalTwinPaths } from "@teamagent/digital-twin";

function makeResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return {
    checks: [],
    passed: 0,
    failed: 0,
    skipped: 0,
    allPassed: true,
    ...overrides,
  };
}

describe("renderDoctorResult", () => {
  it("shows all-pass message when allPassed=true", () => {
    const out = renderDoctorResult(makeResult({ allPassed: true, passed: 8 }));
    expect(out).toContain("全部检查通过");
    expect(out).toContain("TeamAgent 运行正常");
  });

  it("shows failure count and fix hint when failed > 0", () => {
    const checks: DoctorCheckResult[] = [
      { name: "node-version", status: "fail", detail: "v18.0.0 (需要 ≥ 22)", fix: "nvm install 22" },
      { name: "claude-code", status: "skip", detail: "跳过" },
    ];
    const out = renderDoctorResult(makeResult({
      checks,
      passed: 0,
      failed: 1,
      skipped: 1,
      allPassed: false,
    }));
    expect(out).toContain("❌ node-version");
    expect(out).toContain("nvm install 22");
    expect(out).toContain("⏭");
    expect(out).toContain("1 项失败");
  });

  it("shows ✅ for passing checks", () => {
    const checks: DoctorCheckResult[] = [
      { name: "node-version", status: "pass", detail: "v22.4.0" },
    ];
    const out = renderDoctorResult(makeResult({ checks, passed: 1, allPassed: true }));
    expect(out).toContain("✅ node-version");
    expect(out).toContain("v22.4.0");
  });

  it("does not say everything passed when checks are skipped", () => {
    const checks: DoctorCheckResult[] = [
      { name: "hook-script", status: "skip", detail: "knowledge.db 先修" },
    ];
    const out = renderDoctorResult(makeResult({ checks, skipped: 1, allPassed: true }));
    expect(out).not.toContain("全部检查通过");
    expect(out).toContain("跳过项");
  });
});

describe("checkTeamSharingStatus", () => {
  it("reports M5 viral-sync as pass after end-to-end verification (B-150 fix)", () => {
    const result = checkTeamSharingStatus();
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("M5 viral-sync");
    expect(result.detail).toContain("gate-1");
    expect(result.detail).toContain("LWW");
  });
});

describe("parseDoctorArgs", () => {
  it("defaults all false", () => {
    const opts = parseDoctorArgs([]);
    expect(opts.fix).toBe(false);
    expect(opts.json).toBe(false);
    expect(opts.postinstall).toBe(false);
  });

  it("parses --fix --json --postinstall", () => {
    const opts = parseDoctorArgs(["--fix", "--json", "--postinstall"]);
    expect(opts.fix).toBe(true);
    expect(opts.json).toBe(true);
    expect(opts.postinstall).toBe(true);
  });
});

describe("doctor CLAUDE.md checks", () => {
  it("parseDoctorArgs recognizes --fix", () => {
    expect(parseDoctorArgs(["--fix"]).fix).toBe(true);
  });

  it("does not require CLAUDE.md or suggest compile as a fix", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-cli-"));
    try {
      const claudeMd = checkClaudeMd(path.join(root, "CLAUDE.md"));
      expect(claudeMd?.status).not.toBe("fail");
      expect(claudeMd?.fix).toBeUndefined();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags old generated TEAMAGENT blocks and points users at --fix (B-109)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-cli-"));
    try {
      fs.writeFileSync(
        path.join(root, "CLAUDE.md"),
        "# Manual\n\n<!-- TEAMAGENT:START - old -->\n- generated\n<!-- TEAMAGENT:END -->\n",
      );
      const claudeMd = checkClaudeMd(path.join(root, "CLAUDE.md"));
      expect(claudeMd?.status).toBe("fail");
      expect(claudeMd?.detail).toContain("旧 TEAMAGENT:START");
      // The fix suggestion must NOT call `compile` (which would re-write the
      // block); it must point at `doctor --fix` which strips the block.
      expect(claudeMd?.fix).toBeDefined();
      expect(claudeMd?.fix).toContain("doctor --fix");
      expect(claudeMd?.fix).not.toMatch(/\bcompile\b/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("executeDoctor team-sharing boundary", () => {
  const passingClaudeProbe: ClaudeProbe = () => ({
    ok: true,
    stdout: "2.1.126 (Claude Code)\n",
    stderr: "",
  });

  function makeTempWorkspace(): { cwd: string; homeDir: string; cleanup: () => void } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-doctor-"));
    const cwd = path.join(root, "workspace");
    const homeDir = path.join(root, "home");
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
    return {
      cwd,
      homeDir,
      cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
  }

  function createKnowledgeDb(cwd: string): void {
    const dbPath = path.join(cwd, ".teamagent", "knowledge.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = openDb(dbPath);
    db.close();
  }

  it("reports team-sharing pass even when knowledge.db is missing (M5 viral-sync is independent of L1 knowledge.db)", async () => {
    const workspace = makeTempWorkspace();
    try {
      const result = await executeDoctor({
        cwd: workspace.cwd,
        homeDir: workspace.homeDir,
        claudeProbe: passingClaudeProbe,
      });
      const names = result.checks.map((check) => check.name);
      expect(names).toContain("knowledge-db");
      expect(names).toContain("team-sharing");
      expect(result.checks.find((check) => check.name === "knowledge-db")?.status).toBe("fail");
      expect(result.checks.find((check) => check.name === "team-sharing")).toMatchObject({
        status: "pass",
        detail: expect.stringContaining("M5 viral-sync"),
      });
    } finally {
      workspace.cleanup();
    }
  });

  it("reports team-sharing pass when hook registration is missing (team sync layer is decoupled from per-clone hook install)", async () => {
    const workspace = makeTempWorkspace();
    try {
      createKnowledgeDb(workspace.cwd);
      const result = await executeDoctor({
        cwd: workspace.cwd,
        homeDir: workspace.homeDir,
        claudeProbe: passingClaudeProbe,
      });
      const names = result.checks.map((check) => check.name);
      expect(names).toContain("hook-registered");
      expect(names).toContain("team-sharing");
      expect(result.checks.find((check) => check.name === "hook-registered")?.status).toBe("fail");
      expect(result.checks.find((check) => check.name === "team-sharing")).toMatchObject({
        status: "pass",
        detail: expect.stringContaining("M5 viral-sync"),
      });
    } finally {
      workspace.cleanup();
    }
  });

  // From #74: user-level settings.json should satisfy hook-registered
  it("passes hook-registered when only user-level settings.json has a teamagent hook", async () => {
    const workspace = makeTempWorkspace();
    try {
      createKnowledgeDb(workspace.cwd);
      const userClaudeDir = path.join(workspace.homeDir, ".claude");
      fs.mkdirSync(userClaudeDir, { recursive: true });
      fs.writeFileSync(
        path.join(userClaudeDir, "settings.json"),
        JSON.stringify({
          hooks: {
            SessionStart: [
              {
                _teamagentTag: "teamagent-session-start",
                hooks: [{ type: "command", command: "node /fake/bin-session-start.cjs", timeout: 10 }],
              },
            ],
          },
        }),
      );
      const result = await executeDoctor({
        cwd: workspace.cwd,
        homeDir: workspace.homeDir,
        claudeProbe: passingClaudeProbe,
      });
      expect(result.checks.find((c) => c.name === "hook-registered")?.status).toBe("pass");
    } finally {
      workspace.cleanup();
    }
  });

  // B-109: doctor --fix should strip the legacy TEAMAGENT block from CLAUDE.md
  it("--fix strips legacy TEAMAGENT:START block and re-checks pass (B-109)", async () => {
    const workspace = makeTempWorkspace();
    try {
      createKnowledgeDb(workspace.cwd);
      const claudeMdPath = path.join(workspace.cwd, "CLAUDE.md");
      fs.writeFileSync(
        claudeMdPath,
        "# Project\n\nManual notes here.\n\n<!-- TEAMAGENT:START - old -->\n- generated rule\n<!-- TEAMAGENT:END -->\n\nFooter.\n",
      );
      const result = await executeDoctor({
        cwd: workspace.cwd,
        homeDir: workspace.homeDir,
        claudeProbe: passingClaudeProbe,
        fix: true,
      });
      const claudeMd = result.checks.find((c) => c.name === "claude-md");
      expect(claudeMd?.status).toBe("pass");
      const after = fs.readFileSync(claudeMdPath, "utf-8");
      expect(after).not.toContain("TEAMAGENT:START");
      expect(after).toContain("Manual notes here.");
      expect(after).toContain("Footer.");
    } finally {
      workspace.cleanup();
    }
  });

  it("--fix removes CLAUDE.md when the file was only the legacy block (B-109)", async () => {
    const workspace = makeTempWorkspace();
    try {
      createKnowledgeDb(workspace.cwd);
      const claudeMdPath = path.join(workspace.cwd, "CLAUDE.md");
      fs.writeFileSync(
        claudeMdPath,
        "<!-- TEAMAGENT:START - old -->\n- only rule\n<!-- TEAMAGENT:END -->\n",
      );
      await executeDoctor({
        cwd: workspace.cwd,
        homeDir: workspace.homeDir,
        claudeProbe: passingClaudeProbe,
        fix: true,
      });
      expect(fs.existsSync(claudeMdPath)).toBe(false);
    } finally {
      workspace.cleanup();
    }
  });
});

describe("checkClaudeCode", () => {
  function makeProbe(opts: {
    localResult: ClaudeProbeResult;
    globalResult?: ClaudeProbeResult;
  }): { probe: ClaudeProbe; callCount: () => number } {
    let count = 0;
    const probe: ClaudeProbe = (env) => {
      count += 1;
      if (env === undefined) return opts.localResult;
      return opts.globalResult ?? { ok: false, stdout: "", stderr: "command not found: claude" };
    };
    return { probe, callCount: () => count };
  }

  // process.env.PATH must contain node_modules/.bin for the retry path to fire
  // (envWithoutNodeModulesBin returns null when there's nothing to strip).
  function withInjectedNodeModulesPath(fn: () => void): void {
    const originalPath = process.env.PATH;
    if (!originalPath || !pathContainsNodeModulesBin(originalPath)) {
      process.env.PATH = `/repo/node_modules/.bin${originalPath ? ":" + originalPath : ""}`;
    }
    try {
      fn();
    } finally {
      if (originalPath !== undefined) process.env.PATH = originalPath;
      else delete process.env.PATH;
    }
  }

  const BROKEN_STUB_STDERR =
    "Error: claude native binary not installed.\n\nEither postinstall did not run (--ignore-scripts, some pnpm configs)\nor the platform-native optional dependency was not downloaded\n(--omit=optional).\n\nRun the postinstall manually:\n  node node_modules/@anthropic-ai/claude-code/install.cjs\n";

  it("(a) local broken + global working → pass with fallback note", () => {
    withInjectedNodeModulesPath(() => {
      const { probe, callCount } = makeProbe({
        localResult: { ok: false, stdout: "", stderr: BROKEN_STUB_STDERR },
        globalResult: { ok: true, stdout: "2.1.126 (Claude Code)\n", stderr: "" },
      });
      const result = checkClaudeCode(probe);
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("2.1.126");
      expect(result.detail).toMatch(/全局|fallback|本地 pnpm 副本损坏/);
      expect(callCount()).toBe(2);
    });
  });

  it("(b) local broken + global missing → fail with new fix message", () => {
    withInjectedNodeModulesPath(() => {
      const { probe } = makeProbe({
        localResult: { ok: false, stdout: "", stderr: BROKEN_STUB_STDERR },
        globalResult: { ok: false, stdout: "", stderr: "claude: command not found" },
      });
      const result = checkClaudeCode(probe);
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("本地 pnpm 副本");
      expect(result.fix).toContain("install.cjs");
      expect(result.fix).toContain("全局 claude");
    });
  });

  it("(c) global pass on first try → pass as today", () => {
    const { probe, callCount } = makeProbe({
      localResult: { ok: true, stdout: "2.1.126 (Claude Code)\n", stderr: "" },
    });
    const result = checkClaudeCode(probe);
    expect(result.status).toBe("pass");
    expect(result.detail).toBe("2.1.126 (Claude Code)");
    expect(result.fix).toBeUndefined();
    expect(callCount()).toBe(1);
  });

  it("(d) generic command-not-found (no broken-stub signature) → original fail message", () => {
    const { probe } = makeProbe({
      localResult: { ok: false, stdout: "", stderr: "claude: command not found" },
    });
    const result = checkClaudeCode(probe);
    expect(result.status).toBe("fail");
    expect(result.detail).toBe("未找到 claude 命令");
    expect(result.fix).toBe("npm install -g @anthropic-ai/claude-code");
  });
});

describe("checkSettingsJsonScope", () => {
  function makeTmpDir(): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-scope-"));
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  function writeHookSettings(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({
      hooks: {
        PreToolUse: [{ _teamagentTag: "teamagent-pre-tool-use", hooks: [] }],
      },
    }));
  }

  it("pass when project-level settings.local.json has hook", () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const projectSettings = path.join(dir, ".claude", "settings.local.json");
      writeHookSettings(projectSettings);
      const result = checkSettingsJsonScope(projectSettings, path.join(dir, "user", ".claude", "settings.json"));
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("项目级");
    } finally { cleanup(); }
  });

  it("pass when only user-level settings.json has hook", () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const userSettings = path.join(dir, ".claude", "settings.json");
      writeHookSettings(userSettings);
      const result = checkSettingsJsonScope(
        path.join(dir, "project", ".claude", "settings.local.json"),
        userSettings,
      );
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("用户级");
    } finally { cleanup(); }
  });

  it("fail when neither settings file has a hook", () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const result = checkSettingsJsonScope(
        path.join(dir, "no-project", ".claude", "settings.local.json"),
        path.join(dir, "no-user", ".claude", "settings.json"),
      );
      expect(result.status).toBe("fail");
      expect(result.fix).toContain("install-hook");
    } finally { cleanup(); }
  });
});

describe("checkPluginSync", () => {
  function makeTmpDir(): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-plugins-"));
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  it("pass when project .claude/plugins has at least one plugin dir", () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const pluginsDir = path.join(dir, ".claude", "plugins", "some-plugin");
      fs.mkdirSync(pluginsDir, { recursive: true });
      const result = checkPluginSync(dir, path.join(dir, "home"));
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("1");
    } finally { cleanup(); }
  });

  it("pass when user .claude/plugins has at least one plugin dir", () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const pluginsDir = path.join(dir, "home", ".claude", "plugins", "plugin-a");
      fs.mkdirSync(pluginsDir, { recursive: true });
      const result = checkPluginSync(path.join(dir, "project"), path.join(dir, "home"));
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("用户级");
    } finally { cleanup(); }
  });

  it("fail when plugins dir does not exist", () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const result = checkPluginSync(dir, path.join(dir, "home"));
      expect(result.status).toBe("fail");
      expect(result.fix).toContain("install-plugins");
    } finally { cleanup(); }
  });

  it("fail when plugins dir is empty", () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      fs.mkdirSync(path.join(dir, ".claude", "plugins"), { recursive: true });
      const result = checkPluginSync(dir, path.join(dir, "home"));
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("空");
    } finally { cleanup(); }
  });
});

describe("checkCodexBin", () => {
  it("pass when codex probe returns ok", () => {
    const probe: CodexProbe = () => ({ ok: true, stdout: "0.1.0 codex\n", stderr: "" });
    const result = checkCodexBin(probe);
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("0.1.0");
  });

  it("fail when codex probe fails", () => {
    const probe: CodexProbe = () => ({ ok: false, stdout: "", stderr: "command not found" });
    const result = checkCodexBin(probe);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("codex");
    expect(result.fix).toBeDefined();
  });
});

describe("checkMcpReachability", () => {
  function makeTmpDir(): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-mcp-"));
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  it("skip when no mcpServers configured", async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const result = await checkMcpReachability(dir);
      expect(result.status).toBe("skip");
    } finally { cleanup(); }
  });

  it("pass when all MCP servers are reachable", async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const settingsPath = path.join(dir, ".claude", "settings.local.json");
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({
        mcpServers: { my_server: { url: "http://localhost:12345" } },
      }));
      const probe: McpProbe = async () => ({ reachable: true, detail: "HTTP 200" });
      const result = await checkMcpReachability(dir, probe);
      expect(result.status).toBe("pass");
      expect(result.detail).toContain("1");
    } finally { cleanup(); }
  });

  it("fail when an MCP server is unreachable", async () => {
    const { dir, cleanup } = makeTmpDir();
    try {
      const settingsPath = path.join(dir, ".claude", "settings.local.json");
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify({
        mcpServers: { bad: { url: "http://localhost:1" } },
      }));
      const probe: McpProbe = async () => ({ reachable: false, detail: "ECONNREFUSED" });
      const result = await checkMcpReachability(dir, probe);
      expect(result.status).toBe("fail");
      expect(result.detail).toContain("http://localhost:1");
      expect(result.fix).toBeDefined();
    } finally { cleanup(); }
  });
});

// Issue #172: --dry-run + backup + doctor --help safety net.
describe("doctor --fix safety net (issue #172)", () => {
  const passingClaudeProbe172: ClaudeProbe = () => ({
    ok: true,
    stdout: "2.1.126 (Claude Code)\n",
    stderr: "",
  });

  function makeWorkspace172(): { cwd: string; homeDir: string; cleanup: () => void } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-doctor-172-"));
    const cwd = path.join(root, "workspace");
    const homeDir = path.join(root, "home");
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
    return { cwd, homeDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
  }

  function createKnowledgeDb172(cwd: string): void {
    const dbPath = path.join(cwd, ".teamagent", "knowledge.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = openDb(dbPath);
    db.close();
  }

  it("parseDoctorArgs picks up --dry-run (alone and with --fix)", () => {
    expect(parseDoctorArgs(["--dry-run"]).dryRun).toBe(true);
    const both = parseDoctorArgs(["--fix", "--dry-run"]);
    expect(both.fix).toBe(true);
    expect(both.dryRun).toBe(true);
    expect(parseDoctorArgs([]).dryRun).toBeFalsy();
  });

  it("--fix --dry-run produces a unified diff outcome and leaves CLAUDE.md untouched", async () => {
    const ws = makeWorkspace172();
    try {
      createKnowledgeDb172(ws.cwd);
      const claudeMdPath = path.join(ws.cwd, "CLAUDE.md");
      const original =
        "# Project\n\nManual notes.\n\n<!-- TEAMAGENT:START - old -->\n- generated rule A\n- generated rule B\n<!-- TEAMAGENT:END -->\n\nFooter.\n";
      fs.writeFileSync(claudeMdPath, original);

      const result = await executeDoctor({
        cwd: ws.cwd,
        homeDir: ws.homeDir,
        claudeProbe: passingClaudeProbe172,
        fix: true,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.fixOutcomes).toBeDefined();
      const claudeMdOutcome = (result.fixOutcomes ?? []).find(
        (o: FixOutcome) => o.name === "claude-md",
      );
      expect(claudeMdOutcome?.status).toBe("preview");
      expect(claudeMdOutcome?.diff).toBeDefined();
      expect(claudeMdOutcome?.diff).toContain(`--- ${claudeMdPath}`);
      expect(claudeMdOutcome?.diff).toContain(`+++ ${claudeMdPath}`);
      expect(claudeMdOutcome?.diff).toMatch(/^-.*generated rule A/m);
      // No backup directory should have been created (dry-run does no I/O).
      expect(fs.existsSync(path.join(ws.homeDir, ".teamagent", "backups"))).toBe(false);
      // File on disk is untouched (sha-via-content equality).
      expect(fs.readFileSync(claudeMdPath, "utf-8")).toBe(original);
      // The claude-md check still reports fail because no real fix ran.
      expect(result.checks.find((c) => c.name === "claude-md")?.status).toBe("fail");
    } finally {
      ws.cleanup();
    }
  });

  it("--fix without --dry-run writes backup before mutating CLAUDE.md", async () => {
    const ws = makeWorkspace172();
    try {
      createKnowledgeDb172(ws.cwd);
      const claudeMdPath = path.join(ws.cwd, "CLAUDE.md");
      const original =
        "# Project\n\nManual notes.\n\n<!-- TEAMAGENT:START - old -->\n- generated rule\n<!-- TEAMAGENT:END -->\n\nFooter.\n";
      fs.writeFileSync(claudeMdPath, original);

      const result = await executeDoctor({
        cwd: ws.cwd,
        homeDir: ws.homeDir,
        claudeProbe: passingClaudeProbe172,
        fix: true,
      });

      expect(result.dryRun).toBe(false);
      const claudeMdOutcome = (result.fixOutcomes ?? []).find(
        (o: FixOutcome) => o.name === "claude-md",
      );
      expect(claudeMdOutcome?.status).toBe("applied");
      expect(claudeMdOutcome?.filePath).toBe(claudeMdPath);
      expect(claudeMdOutcome?.backupPath).toBeDefined();
      // Backup file exists with pre-fix content.
      expect(fs.existsSync(claudeMdOutcome!.backupPath!)).toBe(true);
      expect(fs.readFileSync(claudeMdOutcome!.backupPath!, "utf-8")).toBe(original);
      // Backup lives under <homeDir>/.teamagent/backups/.
      expect(claudeMdOutcome!.backupPath!).toContain(
        path.join(ws.homeDir, ".teamagent", "backups"),
      );
      // CLAUDE.md was rewritten without the legacy block.
      const after = fs.readFileSync(claudeMdPath, "utf-8");
      expect(after).not.toContain("TEAMAGENT:START");
      expect(after).toContain("Manual notes.");
      expect(after).toContain("Footer.");
    } finally {
      ws.cleanup();
    }
  });

  it("--fix on a CLAUDE.md that is entirely the legacy block deletes the file but keeps a backup", async () => {
    const ws = makeWorkspace172();
    try {
      createKnowledgeDb172(ws.cwd);
      const claudeMdPath = path.join(ws.cwd, "CLAUDE.md");
      const blockOnly = "<!-- TEAMAGENT:START - old -->\n- only rule\n<!-- TEAMAGENT:END -->\n";
      fs.writeFileSync(claudeMdPath, blockOnly);

      const result = await executeDoctor({
        cwd: ws.cwd,
        homeDir: ws.homeDir,
        claudeProbe: passingClaudeProbe172,
        fix: true,
      });

      const outcome = (result.fixOutcomes ?? []).find(
        (o: FixOutcome) => o.name === "claude-md",
      );
      expect(outcome?.status).toBe("applied");
      expect(fs.existsSync(claudeMdPath)).toBe(false);
      expect(outcome?.backupPath).toBeDefined();
      expect(fs.readFileSync(outcome!.backupPath!, "utf-8")).toBe(blockOnly);
    } finally {
      ws.cleanup();
    }
  });

  it("--fix --dry-run on full-block CLAUDE.md renders +++ /dev/null and does not delete file", async () => {
    const ws = makeWorkspace172();
    try {
      createKnowledgeDb172(ws.cwd);
      const claudeMdPath = path.join(ws.cwd, "CLAUDE.md");
      const blockOnly = "<!-- TEAMAGENT:START - old -->\n- only rule\n<!-- TEAMAGENT:END -->\n";
      fs.writeFileSync(claudeMdPath, blockOnly);

      const result = await executeDoctor({
        cwd: ws.cwd,
        homeDir: ws.homeDir,
        claudeProbe: passingClaudeProbe172,
        fix: true,
        dryRun: true,
      });

      const outcome = (result.fixOutcomes ?? []).find(
        (o: FixOutcome) => o.name === "claude-md",
      );
      expect(outcome?.status).toBe("preview");
      expect(outcome?.diff).toContain("+++ /dev/null");
      expect(fs.existsSync(claudeMdPath)).toBe(true);
      expect(fs.readFileSync(claudeMdPath, "utf-8")).toBe(blockOnly);
    } finally {
      ws.cleanup();
    }
  });

  it("backupFile creates a Windows-safe filename and copies content byte-for-byte", () => {
    const ws = makeWorkspace172();
    try {
      const filePath = path.join(ws.cwd, "CLAUDE.md");
      const original = "hello\nworld\n";
      fs.writeFileSync(filePath, original);
      const backupPath = backupFile(filePath, { homeDir: ws.homeDir });
      expect(fs.readFileSync(backupPath, "utf-8")).toBe(original);
      const basename = path.basename(backupPath);
      // Must not contain ':' (Windows reserved) and must end with .bak
      expect(basename).not.toContain(":");
      expect(basename.endsWith(".bak")).toBe(true);
      expect(basename.startsWith("CLAUDE.md.")).toBe(true);
    } finally {
      ws.cleanup();
    }
  });

  it("renderDoctorHelp prints subcommand help (no diagnostics) covering --dry-run, backup, --json, --cwd", () => {
    const out = renderDoctorHelp();
    expect(out).toContain("--dry-run");
    expect(out).toContain("--json");
    expect(out).toContain("--cwd");
    expect(out).toContain("备份");
    expect(out).toContain("~/.teamagent/backups/");
    // Must NOT contain the diagnostic header that real `doctor` execution prints.
    expect(out).not.toContain("环境诊断 / Environment Check");
  });

  it("renderDoctorResult appends a dry-run preview section with diff lines", () => {
    const fakeResult: DoctorResult = {
      checks: [],
      passed: 0,
      failed: 1,
      skipped: 0,
      allPassed: false,
      dryRun: true,
      fixOutcomes: [
        {
          name: "claude-md",
          status: "preview",
          filePath: "/tmp/proj/CLAUDE.md",
          diff: "--- /tmp/proj/CLAUDE.md\n+++ /tmp/proj/CLAUDE.md\n@@ -1,3 +1,1 @@\n header\n-old block\n footer\n",
          detail: "将剥离 legacy TEAMAGENT 块",
        },
      ],
    };
    const out = renderDoctorResult(fakeResult);
    expect(out).toContain("doctor --fix --dry-run");
    expect(out).toContain("将剥离");
    expect(out).toContain("-old block");
    expect(out).toContain("不会写入");
  });

  it("renderDoctorResult appends an applied section with backup + restore command", () => {
    const fakeResult: DoctorResult = {
      checks: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      allPassed: true,
      dryRun: false,
      fixOutcomes: [
        {
          name: "claude-md",
          status: "applied",
          filePath: "/tmp/proj/CLAUDE.md",
          backupPath: "/tmp/home/.teamagent/backups/CLAUDE.md.2026-05-09T16-22-34-000Z.bak",
          detail: "已剥离 legacy TEAMAGENT 块",
        },
      ],
    };
    const out = renderDoctorResult(fakeResult);
    expect(out).toContain("doctor --fix");
    expect(out).toContain("已剥离");
    expect(out).toContain("备份: /tmp/home/.teamagent/backups/CLAUDE.md.2026-05-09T16-22-34-000Z.bak");
    expect(out).toContain(
      `还原: cp "/tmp/home/.teamagent/backups/CLAUDE.md.2026-05-09T16-22-34-000Z.bak" "/tmp/proj/CLAUDE.md"`,
    );
  });
});

/**
 * Issue #280: `checkHookSpawn` strict contract (since commit 4 of the
 * issue-280 chain). Probe is injectable so tests do not touch real
 * child_process.
 */
describe("checkHookSpawn (issue #280)", () => {
  function makeProbe(result: HookProbeResult): HookProbe {
    return async () => result;
  }

  it("passes when the probe reports exit code 0", async () => {
    const probe = makeProbe({ exitCode: 0, stderr: "", timedOut: false });
    const out = await checkHookSpawn("/fake/bin-session-start.cjs", probe);
    expect(out.name).toBe("hook-spawn");
    expect(out.status).toBe("pass");
    expect(out.detail).toContain("成功启动");
    expect(out.detail).toContain("fast-exit 0");
    expect(out.fix).toBeUndefined();
  });

  it("fails on non-zero exit and surfaces the last stderr line", async () => {
    const stderr = [
      "node:internal/modules/cjs/loader:1248",
      "  throw err;",
      "  ^",
      "Error: Cannot find module 'web-tree-sitter'",
    ].join("\n");
    const probe = makeProbe({ exitCode: 1, stderr, timedOut: false });
    const out = await checkHookSpawn("/fake/bin-session-start.cjs", probe);
    expect(out.status).toBe("fail");
    expect(out.detail).toContain("exit=1");
    expect(out.detail).toContain("Cannot find module 'web-tree-sitter'");
    expect(out.fix).toBeDefined();
  });

  it("fails when the probe reports a spawn error", async () => {
    const probe = makeProbe({
      exitCode: null,
      stderr: "",
      timedOut: false,
      spawnError: "Error: ENOENT: no such file or directory, open '/missing/node'",
    });
    const out = await checkHookSpawn("/fake/bin-session-start.cjs", probe);
    expect(out.status).toBe("fail");
    expect(out.detail).toContain("启动失败");
    expect(out.detail).toContain("ENOENT");
    expect(out.fix).toContain("npm install -g teamagent");
  });

  it("fails when the probe times out", async () => {
    const probe = makeProbe({ exitCode: null, stderr: "", timedOut: true });
    const out = await checkHookSpawn("/fake/bin-session-start.cjs", probe);
    expect(out.status).toBe("fail");
    expect(out.detail).toContain("5s");
    expect(out.detail).toContain("require/import");
  });

  it("truncates long stderr tails so doctor output stays readable", async () => {
    const longLine = "a".repeat(2_000);
    const probe = makeProbe({ exitCode: 1, stderr: longLine, timedOut: false });
    const out = await checkHookSpawn("/fake/bin-session-start.cjs", probe);
    expect(out.status).toBe("fail");
    // Detail prefix + truncated stderr should be bounded.
    expect(out.detail.length).toBeLessThan(600);
  });

  it("strictly fails on every non-pass variant — flipping allPassed", async () => {
    // After commit 4 the warn-only era is over: spawn-error / timeout /
    // non-zero exit all return `fail`, so an installation with a broken
    // hook surfaces red. The underlying spawn fix (commit 2) + import-
    // graph contract (commit 3) keep healthy installs at zero
    // false-positive rate, so this strict gate does not paint green
    // installs red.
    const variants: HookProbeResult[] = [
      { exitCode: 1, stderr: "Error: ...", timedOut: false },
      { exitCode: null, stderr: "", timedOut: false, spawnError: "EACCES" },
      { exitCode: null, stderr: "", timedOut: true },
    ];
    for (const v of variants) {
      const r = await checkHookSpawn("/x", makeProbe(v));
      expect(r.status).toBe("fail");
      expect(r.status).not.toBe("skip");
    }
  });
});

/**
 * Issue #368: `checkDigitalTwinUploader` — surfaces `digital-twin-uploader:
 * OK | BROKEN` for the staged uploader daemon. Probe is injectable; the
 * staged bin's presence is faked on disk.
 */
describe("checkDigitalTwinUploader (issue #368)", () => {
  // A staged bin built post-#368 contains the dry-run marker; the probe spawns
  // it. A pre-#368 bin lacks the marker; the check must skip (never spawn it).
  function makeHomeWithStagedBin(content = "// staged bin\nprocess.env.TEAMAGENT_UPLOADER_DRYRUN;\n"): {
    home: string;
    cleanup: () => void;
  } {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-dtup-"));
    const dir = digitalTwinPaths(home).digitalTwinDir;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "bin-uploader.cjs"), content, "utf-8");
    return { home, cleanup: () => fs.rmSync(home, { recursive: true, force: true }) };
  }
  function probeReturning(result: HookProbeResult): UploaderProbe {
    return async () => result;
  }

  it("skips when the staged bin-uploader.cjs is not present", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-dtup-none-"));
    try {
      const out = await checkDigitalTwinUploader(home, probeReturning({ exitCode: 0, stderr: "", timedOut: false }));
      expect(out.name).toBe("digital-twin-uploader");
      expect(out.status).toBe("skip");
      expect(out.detail).toContain("未安装");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("skips (does NOT spawn) when the staged bin predates the dry-run probe", async () => {
    // Pre-#368 binary: no TEAMAGENT_UPLOADER_DRYRUN marker. Spawning it would
    // run the real upload loop + race the live daemon for the PID lock.
    const { home, cleanup } = makeHomeWithStagedBin("// old staged bin, no marker\n");
    let probeCalled = false;
    try {
      const out = await checkDigitalTwinUploader(home, async () => {
        probeCalled = true;
        return { exitCode: 0, stderr: "", timedOut: false };
      });
      expect(out.status).toBe("skip");
      expect(out.detail).toContain("install-hook");
      expect(probeCalled).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("passes (OK) when the dry-run probe exits 0 with no MODULE_NOT_FOUND", async () => {
    const { home, cleanup } = makeHomeWithStagedBin();
    try {
      const out = await checkDigitalTwinUploader(home, probeReturning({ exitCode: 0, stderr: "", timedOut: false }));
      expect(out.status).toBe("pass");
      expect(out.detail).toContain("digital-twin-uploader: OK");
      expect(out.fix).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("fails (BROKEN) when the probe surfaces MODULE_NOT_FOUND on stderr", async () => {
    const { home, cleanup } = makeHomeWithStagedBin();
    try {
      const stderr = ["node:internal/modules/cjs/loader", "Error: Cannot find module 'ulid'", "  code: 'MODULE_NOT_FOUND'"].join("\n");
      const out = await checkDigitalTwinUploader(home, probeReturning({ exitCode: 1, stderr, timedOut: false }));
      expect(out.status).toBe("fail");
      expect(out.detail).toContain("digital-twin-uploader: BROKEN");
      expect(out.detail).toContain("MODULE_NOT_FOUND");
      expect(out.fix).toContain("pnpm --filter @teamagent/digital-twin build");
    } finally {
      cleanup();
    }
  });

  it("fails (BROKEN) on a spawn error", async () => {
    const { home, cleanup } = makeHomeWithStagedBin();
    try {
      const out = await checkDigitalTwinUploader(home, probeReturning({ exitCode: null, stderr: "", timedOut: false, spawnError: "ENOENT" }));
      expect(out.status).toBe("fail");
      expect(out.detail).toContain("BROKEN");
      expect(out.detail).toContain("ENOENT");
    } finally {
      cleanup();
    }
  });

  it("fails (BROKEN) on timeout", async () => {
    const { home, cleanup } = makeHomeWithStagedBin();
    try {
      const out = await checkDigitalTwinUploader(home, probeReturning({ exitCode: null, stderr: "", timedOut: true }));
      expect(out.status).toBe("fail");
      expect(out.detail).toContain("BROKEN");
      expect(out.detail).toContain("5s");
    } finally {
      cleanup();
    }
  });

  it("passes but notes a historical uploader.log error when one exists", async () => {
    const { home, cleanup } = makeHomeWithStagedBin();
    try {
      fs.writeFileSync(digitalTwinPaths(home).uploaderLogFile, "Error: Cannot find module 'ulid' [MODULE_NOT_FOUND]\n", "utf-8");
      const out = await checkDigitalTwinUploader(home, probeReturning({ exitCode: 0, stderr: "", timedOut: false }));
      expect(out.status).toBe("pass");
      expect(out.detail).toContain("digital-twin-uploader: OK");
      expect(out.detail).toMatch(/历史错误.*MODULE_NOT_FOUND/);
    } finally {
      cleanup();
    }
  });
});

describe("checkInstallTableBundles (issue #299)", () => {
  const userScope: ReadonlyArray<"project" | "user"> = ["user"];

  it("passes when every install-table bundle exists", () => {
    const enumerate: InstallTableEnumerator = () => [
      { channel: "Stop", tag: "teamagent-stop", bundleFilename: "bin-stop.cjs", absPath: "/fake/dist/bin-stop.cjs", scopes: userScope },
      { channel: "Stop", tag: "teamagent-digital-twin-tap", bundleFilename: "bin-digital-twin-tap.cjs", absPath: "/fake/dist/bin-digital-twin-tap.cjs", scopes: userScope },
    ];
    const result = checkInstallTableBundles(enumerate, () => true);
    expect(result.status).toBe("pass");
    expect(result.name).toBe("install-table-bundles");
  });

  it("fails when one bundle is missing and names the filename in detail", () => {
    const entries: InstallTableEntry[] = [
      { channel: "Stop", tag: "teamagent-stop", bundleFilename: "bin-stop.cjs", absPath: "/fake/dist/bin-stop.cjs", scopes: userScope },
      { channel: "Stop", tag: "teamagent-digital-twin-tap", bundleFilename: "bin-digital-twin-tap.cjs", absPath: "/fake/dist/bin-digital-twin-tap.cjs", scopes: userScope },
    ];
    const enumerate: InstallTableEnumerator = () => entries;
    const existsFn = (p: string) => !p.includes("digital-twin-tap");
    const result = checkInstallTableBundles(enumerate, existsFn);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("bin-digital-twin-tap.cjs");
    expect(result.fix).toBeDefined();
  });

  it("lists every missing filename when multiple bundles are absent", () => {
    const entries: InstallTableEntry[] = [
      { channel: "PreToolUse", tag: "t1", bundleFilename: "bin-pre-tool-use.cjs", absPath: "/x/dist/bin-pre-tool-use.cjs", scopes: userScope },
      { channel: "Stop", tag: "t2", bundleFilename: "bin-stop.cjs", absPath: "/x/dist/bin-stop.cjs", scopes: userScope },
      { channel: "Stop", tag: "t3", bundleFilename: "bin-digital-twin-tap.cjs", absPath: "/x/dist/bin-digital-twin-tap.cjs", scopes: userScope },
    ];
    const enumerate: InstallTableEnumerator = () => entries;
    const existsFn = (p: string) => p.includes("bin-pre-tool-use");
    const result = checkInstallTableBundles(enumerate, existsFn);
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("bin-stop.cjs");
    expect(result.detail).toContain("bin-digital-twin-tap.cjs");
    expect(result.detail).not.toContain("bin-pre-tool-use.cjs");
  });
});

describe("executeDoctor → install-table-bundles wiring (issue #299)", () => {
  it("flips allPassed=false when an install-table bundle is missing", async () => {
    const enumerate: InstallTableEnumerator = () => [
      { channel: "Stop", tag: "teamagent-digital-twin-tap", bundleFilename: "bin-digital-twin-tap.cjs", absPath: "/missing/bin-digital-twin-tap.cjs", scopes: ["user"] as const },
    ];
    const r = await executeDoctor({
      cwd: os.tmpdir(),
      homeDir: os.tmpdir(),
      installTableEnumerator: enumerate,
      bundleExistsFn: () => false,
      // Suppress noise from unrelated checks; we only assert the install-table outcome.
      claudeProbe: () => ({ ok: false, stdout: "", stderr: "" }),
      codexProbe: () => ({ ok: false, stdout: "", stderr: "" }),
      mcpProbe: async () => ({ reachable: false, detail: "skipped" }),
    });
    const itb = r.checks.find((c) => c.name === "install-table-bundles");
    expect(itb).toBeDefined();
    expect(itb?.status).toBe("fail");
    expect(r.allPassed).toBe(false);
  });
});
