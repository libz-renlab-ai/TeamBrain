import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeInit, parseInitArgs, renderInitResult } from "../commands/init.js";
import { DualLayerStore, SqliteKnowledgeStore, openDb } from "@teamagent/adapters";
import type { LLMClient } from "@teamagent/ports";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "init-"));
  const cwd = path.join(root, "project");
  const home = path.join(root, "home");
  nodeFs.mkdirSync(cwd, { recursive: true });
  nodeFs.mkdirSync(home, { recursive: true });
  return {
    root,
    cwd,
    home,
    projectDbPath: path.join(cwd, ".teamagent", "knowledge.db"),
    userGlobalDbPath: path.join(home, ".teamagent", "global.db"),
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

const OK_LLM_RESPONSE = JSON.stringify({
  category: "E",
  tags: ["imported"],
  type: "practice",
  nature: "subjective",
  trigger: "imported trigger",
  wrong_pattern: "",
  correct_pattern: "imported correct",
  reasoning: "imported reason",
});

const stubLLM = (r: string): LLMClient => ({ complete: async () => r });

describe("executeInit", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let ctr = 0;
  beforeEach(() => {
    tmp = mkTmp();
    ctr = 0;
  });
  afterEach(() => tmp.cleanup());

  const commonOpts = () => ({
    cwd: tmp.cwd,
    homeDir: tmp.home,
    skipHook: true,
    skipSeed: true,
    idGen: () => `pers-test-${++ctr}`,
    now: () => new Date("2026-04-14T12:00:00Z"),
  });
  const itWithFileSymlink = process.platform === "win32" ? it.skip : it;

  it("dry-run: no files written, plans are reported", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Rules\n- existing rule one\n- existing rule two\n",
    );

    const r = await executeInit({
      ...commonOpts(),
      dryRun: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    // No knowledge DB files created
    expect(nodeFs.existsSync(tmp.userGlobalDbPath)).toBe(false);
    expect(nodeFs.existsSync(tmp.projectDbPath)).toBe(false);
    // CLAUDE.md untouched (no TEAMAGENT block added)
    const md = nodeFs.readFileSync(path.join(tmp.cwd, "CLAUDE.md"), "utf-8");
    expect(md).not.toContain("TEAMAGENT:START");
  });

  it("happy path: preset + import + compile all succeed (issue #42 nested rules)", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "CLAUDE.md"),
      "# Team rules\n- Prefer fetch over axios\n- Use pnpm\n",
    );

    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    // 8 presets written to global DB (4 base meta + 4 canonical team rules)
    const globalStore = new SqliteKnowledgeStore(openDb(tmp.userGlobalDbPath));
    const globalCount = globalStore.count();
    globalStore.close();
    expect(globalCount).toBe(8);

    // 2 imported rules in project DB (both CLAUDE.md bullets)
    const projectStore = new SqliteKnowledgeStore(openDb(tmp.projectDbPath));
    const personalCount = projectStore.count();
    projectStore.close();
    expect(personalCount).toBe(2);

    // CLAUDE.md remains human-maintained; init no longer writes a TEAMAGENT block.
    const md = nodeFs.readFileSync(path.join(tmp.cwd, "CLAUDE.md"), "utf-8");
    expect(md).not.toContain("TEAMAGENT:START");
    expect(md).not.toContain("TEAMAGENT:END");
    expect(md).toContain("# Team rules");
    expect(r.steps.find((s) => s.step === "compile-skills")?.status).toBe("ok");

    expect(r.summary.presetAdded).toBe(8);
    expect(r.summary.importedRules).toBe(2);
    expect(r.summary.totalActiveEntries).toBeGreaterThanOrEqual(10);
  });

  it("target=codex exports Skills and links .codex/skills", async () => {
    const r = await executeInit({
      ...commonOpts(),
      target: "codex",
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(r.steps.find((s) => s.step === "compile-skills")?.status).toBe("ok");
    expect(r.steps.find((s) => s.step === "link-codex-files")?.status).toBe("ok");
    const codexSkillsPath = path.join(tmp.cwd, ".codex", "skills");
    const teamagentSkillsPath = path.join(tmp.home, ".claude", "skills", "teamagent");
    expect(nodeFs.existsSync(path.join(tmp.cwd, "AGENTS.md"))).toBe(false);
    expect(nodeFs.existsSync(path.join(tmp.cwd, "CLAUDE.md"))).toBe(false);
    expect(nodeFs.lstatSync(codexSkillsPath).isSymbolicLink()).toBe(true);
    expect(path.resolve(tmp.cwd, ".codex", nodeFs.readlinkSync(codexSkillsPath))).toBe(
      teamagentSkillsPath,
    );
  });

  it("target=codex pre-check validates readable CLAUDE.md for import", async () => {
    const claudePath = path.join(tmp.cwd, "CLAUDE.md");
    nodeFs.writeFileSync(claudePath, "# locked\n");

    const accessSpy = vi.spyOn(nodeFs, "accessSync").mockImplementation((p, mode) => {
      if (p === claudePath) {
        throw new Error("EACCES");
      }
      return undefined as unknown as void;
    });

    const r = await executeInit({
      ...commonOpts(),
      target: "codex",
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    accessSpy.mockRestore();
    expect(r.ok).toBe(false);
    expect(r.steps[0]).toMatchObject({
      step: "pre-check",
      status: "failed",
      detail: "CLAUDE.md 文件无读取权限，请运行: chmod 644 CLAUDE.md",
    });
  });

  it("target=codex pre-check only requires read access for existing AGENTS.md", async () => {
    const agentsPath = path.join(tmp.cwd, "AGENTS.md");
    nodeFs.writeFileSync(agentsPath, "# Agent guidance\n");

    const accessSpy = vi.spyOn(nodeFs, "accessSync").mockImplementation((p, mode) => {
      if (p === agentsPath && typeof mode === "number" && (mode & nodeFs.constants.W_OK) !== 0) {
        throw new Error("unexpected write access check");
      }
      return undefined as unknown as void;
    });

    const r = await executeInit({
      ...commonOpts(),
      target: "codex",
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(accessSpy).toHaveBeenCalledWith(agentsPath, nodeFs.constants.R_OK);
    accessSpy.mockRestore();
    expect(nodeFs.readFileSync(agentsPath, "utf-8")).toBe("# Agent guidance\n");
  });

  itWithFileSymlink(
    "target=codex removes old TeamAgent AGENTS.md symlink and does not import it",
    async () => {
      const oldRulesDir = path.join(tmp.home, ".claude", "teamagent", "rules");
      const oldRulesPath = path.join(oldRulesDir, "INDEX.md");
      const agentsPath = path.join(tmp.cwd, "AGENTS.md");
      nodeFs.mkdirSync(oldRulesDir, { recursive: true });
      nodeFs.writeFileSync(oldRulesPath, "- stale generated rule\n", "utf-8");
      nodeFs.symlinkSync(oldRulesPath, agentsPath, "file");

      const r = await executeInit({
        ...commonOpts(),
        target: "codex",
        llmClient: stubLLM(OK_LLM_RESPONSE),
      });

      expect(r.ok).toBe(true);
      expect(nodeFs.existsSync(agentsPath)).toBe(false);
      expect(r.summary.importedRules).toBe(0);
      expect(r.steps.find((s) => s.step === "link-codex-files")?.detail).toContain(
        "AGENTS.md legacy link (removed)",
      );
    }
  );

  itWithFileSymlink(
    "target=both removes old AGENTS.md link to CLAUDE.md after import",
    async () => {
      const claudePath = path.join(tmp.cwd, "CLAUDE.md");
      const agentsPath = path.join(tmp.cwd, "AGENTS.md");
      nodeFs.writeFileSync(claudePath, "- current Claude rule\n", "utf-8");
      nodeFs.symlinkSync(claudePath, agentsPath, "file");

      const r = await executeInit({
        ...commonOpts(),
        target: "both",
        llmClient: stubLLM(OK_LLM_RESPONSE),
      });

      expect(r.ok).toBe(true);
      expect(nodeFs.existsSync(agentsPath)).toBe(false);
      expect(r.summary.importedRules).toBe(1);
    }
  );

  it("target=both exports Skills and links .codex/skills", async () => {
    const r = await executeInit({
      ...commonOpts(),
      target: "both",
      skipImport: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(nodeFs.existsSync(path.join(tmp.cwd, "CLAUDE.md"))).toBe(false);
    expect(r.steps.find((s) => s.step === "compile-skills")?.status).toBe("ok");
    const codexSkillsPath = path.join(tmp.cwd, ".codex", "skills");
    expect(nodeFs.lstatSync(codexSkillsPath).isSymbolicLink()).toBe(true);
  });

  it("idempotent: running init twice doesn't duplicate presets", async () => {
    await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const r2 = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r2.ok).toBe(true);
    // Second run should add 0 new presets (all 8 already present)
    expect(r2.summary.presetAdded).toBe(0);
    const globalStore = new SqliteKnowledgeStore(openDb(tmp.userGlobalDbPath));
    const globalCount = globalStore.count();
    globalStore.close();
    expect(globalCount).toBe(8); // still 8
  });

  it("no CLAUDE.md + no .cursorrules → import step reports '无规则可导入'", async () => {
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const structureStep = r.steps.find((s) => s.step === "structure-rules")!;
    expect(structureStep.status).toBe("ok");
    expect(structureStep.detail).toContain("无规则");
    expect(r.summary.importedRules).toBe(0);
  });

  it("pre-check accepts missing CLAUDE.md", async () => {
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r.ok).toBe(true);
    expect(r.steps.find((s) => s.step === "pre-check")?.status).toBe("ok");
    expect(nodeFs.existsSync(path.join(tmp.cwd, "CLAUDE.md"))).toBe(false);
  });

  it("reads .cursorrules and imports from it", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, ".cursorrules"),
      "- cursor rule one\n- cursor rule two\n- cursor rule three\n",
    );
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r.summary.importedRules).toBe(3);
  });

  it("--skip-import skips LLM structure step but still loads presets", async () => {
    nodeFs.writeFileSync(path.join(tmp.cwd, "CLAUDE.md"), "- one\n- two\n");
    const r = await executeInit({
      ...commonOpts(),
      skipImport: true,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r.ok).toBe(true);
    expect(r.summary.presetAdded).toBe(8);
    expect(r.summary.importedRules).toBe(0);
    const structureStep = r.steps.find((s) => s.step === "structure-rules")!;
    expect(structureStep.detail).toContain("skipImport");
  });

  it("LLM returning null for all rules → 0 imported, no failure", async () => {
    nodeFs.writeFileSync(path.join(tmp.cwd, "CLAUDE.md"), "- a\n- b\n");
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM("null"),
    });
    expect(r.ok).toBe(true);
    expect(r.summary.importedRules).toBe(0);
  });

  it("per-rule LLM error does not abort init", async () => {
    nodeFs.writeFileSync(path.join(tmp.cwd, "CLAUDE.md"), "- a\n- b\n");
    let calls = 0;
    const flakyLLM: LLMClient = {
      complete: async () => {
        calls++;
        if (calls === 1) throw new Error("rate limited");
        return OK_LLM_RESPONSE;
      },
    };
    const r = await executeInit({ ...commonOpts(), llmClient: flakyLLM });
    expect(r.ok).toBe(true);
    expect(r.summary.importedRules).toBe(1);
  });

  it("detect-stack reports typescript + react", async () => {
    nodeFs.writeFileSync(
      path.join(tmp.cwd, "package.json"),
      JSON.stringify({ dependencies: { react: "^18" } }),
    );
    nodeFs.writeFileSync(path.join(tmp.cwd, "tsconfig.json"), "{}");
    nodeFs.writeFileSync(path.join(tmp.cwd, "pnpm-lock.yaml"), "");
    const r = await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const stackStep = r.steps.find((s) => s.step === "detect-stack")!;
    expect(stackStep.detail).toContain("typescript");
    expect(stackStep.detail).toContain("react");
    expect(stackStep.detail).toContain("pnpm");
  });

  it("load-seed: injects bundled rules when seedPath is provided", async () => {
    const seedFile = path.join(tmp.root, "rules.jsonl");
    const seedEntry = {
      id: "seed-demo-1",
      scope: { level: "global" },
      category: "E",
      tags: ["seed"],
      type: "practice",
      nature: "subjective",
      trigger: "test seed",
      wrong_pattern: "",
      correct_pattern: "use seed value",
      reasoning: "bundled",
      confidence: 0.9,
      enforcement: "suggest",
      status: "active",
      hit_count: 0,
      success_count: 0,
      override_count: 0,
      evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
      created_at: "2026-04-14T12:00:00Z",
      last_hit_at: "",
      last_validated_at: "2026-04-14T12:00:00Z",
      source: "preset",
      conflict_with: [],
      current_tier: "experimental",
      max_tier_ever: "experimental",
      tier_entered_at: "",
      demerit: 0,
      demerit_last_updated: "",
      resurrect_count: 0,
    };
    nodeFs.writeFileSync(seedFile, JSON.stringify(seedEntry) + "\n");

    const r = await executeInit({
      ...commonOpts(),
      skipSeed: false,
      seedPath: seedFile,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });

    expect(r.ok).toBe(true);
    expect(r.summary.seedAdded).toBe(1);
    const globalStore = new SqliteKnowledgeStore(openDb(tmp.userGlobalDbPath));
    expect(globalStore.getById("seed-demo-1")).toBeDefined();
    expect(globalStore.count()).toBe(9); // 8 presets + 1 seed
    globalStore.close();

    // idempotent second run
    const r2 = await executeInit({
      ...commonOpts(),
      skipSeed: false,
      seedPath: seedFile,
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    expect(r2.summary.seedAdded).toBe(0);
  });

  it("writes install-log on successful run", async () => {
    await executeInit({
      ...commonOpts(),
      llmClient: stubLLM(OK_LLM_RESPONSE),
    });
    const logPath = path.join(tmp.home, ".teamagent", ".install-log");
    expect(nodeFs.existsSync(logPath)).toBe(true);
    const content = nodeFs.readFileSync(logPath, "utf-8").trim();
    expect(content).toContain("pre-check");
    expect(content).toContain("compile-skills");
  });
});

describe("parseInitArgs", () => {
  it("empty → {}", () => {
    expect(parseInitArgs([])).toEqual({});
  });
  it("--dry-run", () => {
    expect(parseInitArgs(["--dry-run"])).toEqual({ dryRun: true });
  });
  it("--skip-import + --skip-hook combined", () => {
    expect(parseInitArgs(["--skip-import", "--skip-hook"])).toEqual({
      skipImport: true,
      skipHook: true,
    });
  });
  it("--install-plugins opt-in flag", () => {
    expect(parseInitArgs(["--install-plugins"])).toEqual({
      installPlugins: true,
    });
  });
  it("--codex and --target=both", () => {
    expect(parseInitArgs(["--codex"])).toEqual({ target: "codex" });
    expect(parseInitArgs(["--target=both"])).toEqual({ target: "both" });
  });
});

describe("executeInit --install-plugins (opt-in plugin install)", () => {
  let tmp2: ReturnType<typeof mkTmp>;
  beforeEach(() => (tmp2 = mkTmp()));
  afterEach(() => tmp2.cleanup());

  const fakeInstaller = (calls: string[]) =>
    ({
      addMarketplace: async (m: { name: string }) => {
        calls.push(`mp:${m.name}`);
        return { status: "already" as const, detail: "already" };
      },
      installPlugin: async (p: { plugin: string; marketplace: string }) => {
        calls.push(`pl:${p.plugin}@${p.marketplace}`);
        return { status: "added" as const, detail: "ok" };
      },
    }) as unknown as import("@teamagent/adapters").ClaudePluginInstaller;

  it("runs plugin install step only when --install-plugins is set", async () => {
    const calls: string[] = [];
    const base = {
      cwd: tmp2.cwd,
      homeDir: tmp2.home,
      skipHook: true,
      skipImport: true,
      projectDbPath: tmp2.projectDbPath,
      userGlobalDbPath: tmp2.userGlobalDbPath,
      pluginInstaller: fakeInstaller(calls),
    };

    const off = await executeInit(base);
    expect(off.steps.find((s) => s.step === "install-plugins")).toBeUndefined();
    expect(calls).toEqual([]);

    const on = await executeInit({ ...base, installPlugins: true });
    const step = on.steps.find((s) => s.step === "install-plugins");
    expect(step?.status).toBe("ok");
    expect(calls.length).toBeGreaterThan(0);
  });

  it("reports failed when plugin install has any failure", async () => {
    const failingInstaller = {
      addMarketplace: async () => ({ status: "added" as const, detail: "" }),
      installPlugin: async () => ({ status: "failed" as const, detail: "boom" }),
    } as unknown as import("@teamagent/adapters").ClaudePluginInstaller;

    const result = await executeInit({
      cwd: tmp2.cwd,
      homeDir: tmp2.home,
      skipHook: true,
      skipImport: true,
      projectDbPath: tmp2.projectDbPath,
      userGlobalDbPath: tmp2.userGlobalDbPath,
      installPlugins: true,
      pluginInstaller: failingInstaller,
    });
    const step = result.steps.find((s) => s.step === "install-plugins");
    expect(step?.status).toBe("failed");
    expect(result.ok).toBe(false);
  });
});

describe("renderInitResult", () => {
  it("success → includes step list + summary", () => {
    const out = renderInitResult({
      ok: true,
      dryRun: false,
      steps: [
        { step: "pre-check", status: "ok", detail: "ok" },
        { step: "detect-stack", status: "ok", detail: "lang=typescript" },
      ],
      summary: {
        stack: "lang=typescript",
        presetAdded: 4,
        seedAdded: 0,
        importedRules: 2,
        totalActiveEntries: 6,
      },
    });
    expect(out).toContain("✅ TeamAgent 安装成功");
    expect(out).toContain("前置检查");
    expect(out).toContain("lang=typescript");
    expect(out).toContain("重新打开 Claude Code");
  });

  it("failure → shows warning footer", () => {
    const out = renderInitResult({
      ok: false,
      dryRun: false,
      steps: [{ step: "pre-check", status: "failed", detail: "bad permissions" }],
      summary: { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 },
    });
    expect(out).toContain("❌ 安装未完成");
    expect(out).toContain("前置检查");
  });

  it("success without --install-plugins shows hint about team plugins", () => {
    const out = renderInitResult({
      ok: true,
      dryRun: false,
      steps: [{ step: "pre-check", status: "ok", detail: "ok" }],
      summary: {
        stack: "lang=typescript",
        presetAdded: 4,
        seedAdded: 0,
        importedRules: 0,
        totalActiveEntries: 4,
      },
    });
    expect(out).toMatch(/install-plugins/);
  });

  it("success with install-plugins step present does NOT show the hint", () => {
    const out = renderInitResult({
      ok: true,
      dryRun: false,
      steps: [
        { step: "pre-check", status: "ok", detail: "ok" },
        { step: "install-plugins", status: "ok", detail: "all ok" },
      ],
      summary: {
        stack: "lang=typescript",
        presetAdded: 4,
        seedAdded: 0,
        importedRules: 0,
        totalActiveEntries: 4,
      },
    });
    expect(out).not.toMatch(/teamagent install-plugins.*\n.*运行/);
  });
});

describe("renderInitResult — new UX", () => {
  it("shows success banner when all steps pass", () => {
    const result = {
      ok: true,
      dryRun: false,
      steps: [
        { step: "pre-check", status: "ok" as const, detail: "所有前置检查通过" },
        { step: "detect-stack", status: "ok" as const, detail: "lang=typescript" },
        { step: "create-dirs", status: "ok" as const, detail: ".teamagent/" },
        { step: "load-presets", status: "ok" as const, detail: "加载 12 条元原则" },
        { step: "import-rules", status: "ok" as const, detail: "导入 5 条" },
        { step: "install-hook", status: "ok" as const, detail: "已写入" },
        { step: "compile-skills", status: "ok" as const, detail: "导出 3 条" },
      ],
      summary: { stack: "typescript", presetAdded: 12, seedAdded: 0, importedRules: 5, totalActiveEntries: 17 },
    };
    const out = renderInitResult(result);
    expect(out).toContain("✅ TeamAgent 安装成功");
    expect(out).toContain("重新打开 Claude Code");
    expect(out).toContain("teamagent doctor");
  });

  it("shows failure banner when a step fails", () => {
    const result = {
      ok: false,
      dryRun: false,
      steps: [
        { step: "pre-check", status: "failed" as const, detail: "CLAUDE.md 文件不可读，请检查权限" },
      ],
      summary: { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 },
    };
    const out = renderInitResult(result);
    expect(out).toContain("❌ 安装未完成");
    expect(out).toContain("teamagent doctor");
    expect(out).not.toContain("ENOENT"); // no raw errors
  });

  it("shows dry-run banner when dryRun=true", () => {
    const result = {
      ok: true,
      dryRun: true,
      steps: [],
      summary: { stack: "", presetAdded: 0, seedAdded: 0, importedRules: 0, totalActiveEntries: 0 },
    };
    const out = renderInitResult(result);
    expect(out).toContain("预览模式");
    expect(out).toContain("--dry-run");
  });
});
