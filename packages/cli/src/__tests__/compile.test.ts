import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nodeFs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  executeCompile,
  parseCompileArgs,
  renderCompileResult,
  type CompileOptions,
} from "../commands/compile.js";
import { DualLayerStore, SqliteKnowledgeStore, openDb } from "@teamagent/adapters";
import type { KnowledgeEntry } from "@teamagent/types";

function mkTmp() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "compile-cli-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "cwd");
  nodeFs.mkdirSync(home, { recursive: true });
  nodeFs.mkdirSync(cwd, { recursive: true });
  const projectDbPath = path.join(cwd, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(home, ".teamagent", "global.db");
  const claudeMdPath = path.join(cwd, "CLAUDE.md");
  const agentsMdPath = path.join(cwd, "AGENTS.md");
  const skillsDir = path.join(home, "skills");
  const userRulesDir = path.join(home, ".claude", "teamagent", "rules");
  return {
    home,
    cwd,
    projectDbPath,
    userGlobalDbPath,
    claudeMdPath,
    agentsMdPath,
    skillsDir,
    userRulesDir,
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
}

function seedEntry(dbPath: string, e: KnowledgeEntry): void {
  nodeFs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new SqliteKnowledgeStore(openDb(dbPath));
  store.add(e);
  store.close();
}

function entry(over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: "rule-1",
    scope: { level: "personal" },
    category: "C",
    tags: [],
    type: "avoidance",
    nature: "objective",
    trigger: "use-fetch",
    wrong_pattern: "axios",
    correct_pattern: "fetch",
    reasoning: "项目用原生 fetch",
    confidence: 0.85,
    enforcement: "warn",
    status: "active",
    hit_count: 3,
    success_count: 2,
    override_count: 0,
    evidence: { success_sessions: 0, success_users: 0, correction_sessions: 0 },
    created_at: "2026-04-15T00:00:00Z",
    last_hit_at: "",
    last_validated_at: "2026-04-15T00:00:00Z",
    source: "accumulated",
    conflict_with: [],
    current_tier: "canonical" as const,
    max_tier_ever: "canonical" as const,
    tier_entered_at: "2026-04-10T00:00:00Z",
    demerit: 0,
    demerit_last_updated: "",
    resurrect_count: 0,
    ...over,
  };
}

describe("parseCompileArgs", () => {
  it("parses --dry-run", () => {
    expect(parseCompileArgs(["--dry-run"])).toMatchObject({ dryRun: true });
  });
  it("parses --skills-only", () => {
    expect(parseCompileArgs(["--skills-only"])).toMatchObject({ skillsOnly: true });
  });
  it("parses --markdown-only", () => {
    expect(parseCompileArgs(["--markdown-only"])).toMatchObject({ markdownOnly: true });
  });
  it("parses --force", () => {
    expect(parseCompileArgs(["--force"])).toMatchObject({ force: true });
  });
  it("parses --preset-only", () => {
    expect(parseCompileArgs(["--preset-only"])).toMatchObject({ presetOnly: true });
  });
  it("parses --legacy-claude-md (issue #42 opt-in for old behavior)", () => {
    expect(parseCompileArgs(["--legacy-claude-md"])).toMatchObject({ legacyClaudeMd: true });
    expect(parseCompileArgs(["--no-legacy-claude-md"])).toMatchObject({ legacyClaudeMd: false });
  });
  it("parses Codex targets", () => {
    expect(parseCompileArgs(["--codex"])).toMatchObject({ target: "codex" });
    expect(parseCompileArgs(["--target=both"])).toMatchObject({ target: "both" });
  });
  it("no flags → all false", () => {
    const opts = parseCompileArgs([]);
    expect(opts.dryRun).toBeFalsy();
    expect(opts.skillsOnly).toBeFalsy();
    expect(opts.markdownOnly).toBeFalsy();
  });
});

describe("executeCompile", () => {
  let tmp: ReturnType<typeof mkTmp>;
  let opts: CompileOptions;

  beforeEach(() => {
    tmp = mkTmp();
    opts = {
      cwd: tmp.cwd,
      homeDir: tmp.home,
      projectDbPath: tmp.projectDbPath,
      userGlobalDbPath: tmp.userGlobalDbPath,
      claudeMdPath: tmp.claudeMdPath,
      agentsMdPath: tmp.agentsMdPath,
      skillsDir: tmp.skillsDir,
      userRulesDir: tmp.userRulesDir,
    };
  });

  afterEach(() => {
    tmp.cleanup();
  });

  it("no flags: writes skills and leaves CLAUDE.md untouched", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "canonical" }));
    const result = await executeCompile(opts);
    expect(result.markdown.path).toBe("(skipped)");
    expect(result.markdown.blockLineCount).toBe(0);
    expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(false);
    expect(nodeFs.existsSync(path.join(tmp.userRulesDir, "INDEX.md"))).toBe(false);
    // skill written
    expect(result.skills.written).toContain("rule-1");
    const skillFile = path.join(tmp.skillsDir, "rule-1", "SKILL.md");
    expect(nodeFs.existsSync(skillFile)).toBe(true);
  });

  it("--legacy-claude-md restores old behavior (writes CLAUDE.md)", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "canonical" }));
    const result = await executeCompile({ ...opts, legacyClaudeMd: true });
    expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(true);
    expect(result.markdown.path).toBe(tmp.claudeMdPath);
    // No nested rules dir created in legacy mode
    expect(nodeFs.existsSync(path.join(tmp.userRulesDir, "INDEX.md"))).toBe(false);
  });

  it("--dry-run: reports what would be written without writing files", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "canonical" }));
    const result = await executeCompile({ ...opts, dryRun: true });
    // No actual file written
    expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(false);
    expect(nodeFs.existsSync(path.join(tmp.userRulesDir, "INDEX.md"))).toBe(false);
    const skillFile = path.join(tmp.skillsDir, "rule-1", "SKILL.md");
    expect(nodeFs.existsSync(skillFile)).toBe(false);
    // But result reflects what would have been done
    expect(result.markdown.path).toBe("(skipped)");
    expect(result.skills.written).toContain("rule-1");
  });

  it("--markdown-only: legacy no-op; does not write CLAUDE.md or skills", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "stable" }));
    const result = await executeCompile({ ...opts, markdownOnly: true });
    expect(result.markdown.path).toBe("(skipped)");
    expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(false);
    expect(result.skills.written).toHaveLength(0);
    const skillFile = path.join(tmp.skillsDir, "rule-1", "SKILL.md");
    expect(nodeFs.existsSync(skillFile)).toBe(false);
    expect(nodeFs.existsSync(path.join(tmp.userRulesDir, "INDEX.md"))).toBe(false);
  });

  it("--skills-only: writes skills but skips markdown out", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "stable" }));
    const result = await executeCompile({ ...opts, skillsOnly: true });
    expect(result.markdown.path).toBe("(skipped)");
    expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(false);
    expect(nodeFs.existsSync(path.join(tmp.userRulesDir, "INDEX.md"))).toBe(false);
    // stable entry should be written to skills
    expect(result.skills.written).toContain("rule-1");
  });

  it("--target=codex: exposes compiled skills to Codex without AGENTS.md link", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "canonical" }));
    const result = await executeCompile({ ...opts, target: "codex" });
    // Skills/docs propagation mode: AGENTS.md NOT linked (no CLAUDE.md to link to)
    expect(result.agentsMarkdown).toBeUndefined();
    expect(nodeFs.existsSync(tmp.agentsMdPath)).toBe(false);
    // But codex skills symlink still exists
    const codexSkillsPath = path.join(tmp.cwd, ".codex", "skills");
    expect(nodeFs.lstatSync(codexSkillsPath).isSymbolicLink()).toBe(true);
    expect(path.resolve(tmp.cwd, ".codex", nodeFs.readlinkSync(codexSkillsPath))).toBe(
      tmp.skillsDir,
    );
    expect(result.skills.written).toContain("rule-1");
    expect(nodeFs.existsSync(path.join(tmp.skillsDir, "rule-1", "SKILL.md"))).toBe(true);
  });

  it("--target=codex --legacy-claude-md: writes CLAUDE.md, links AGENTS.md, and exposes skills", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "canonical" }));
    const result = await executeCompile({ ...opts, target: "codex", legacyClaudeMd: true });
    expect(result.markdown.path).toBe(tmp.claudeMdPath);
    expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(true);
    expect(nodeFs.existsSync(tmp.agentsMdPath)).toBe(true);
    expect(nodeFs.lstatSync(tmp.agentsMdPath).isSymbolicLink()).toBe(true);
    expect(path.resolve(tmp.cwd, nodeFs.readlinkSync(tmp.agentsMdPath))).toBe(tmp.claudeMdPath);
    const codexSkillsPath = path.join(tmp.cwd, ".codex", "skills");
    expect(nodeFs.lstatSync(codexSkillsPath).isSymbolicLink()).toBe(true);
    expect(result.skills.written).toContain("rule-1");
  });

  it("--target=both --legacy-claude-md: writes CLAUDE.md, links AGENTS.md, and writes Claude skills", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "canonical" }));
    const result = await executeCompile({ ...opts, target: "both", legacyClaudeMd: true });
    expect(result.markdown.path).toBe(tmp.claudeMdPath);
    expect(result.agentsMarkdown?.path).toBe(tmp.agentsMdPath);
    expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(true);
    expect(nodeFs.existsSync(tmp.agentsMdPath)).toBe(true);
    expect(nodeFs.lstatSync(tmp.agentsMdPath).isSymbolicLink()).toBe(true);
    expect(result.skills.written).toContain("rule-1");
  });

  it("env TEAMAGENT_LEGACY_CLAUDE_MD=1 forces legacy mode", async () => {
    seedEntry(tmp.projectDbPath, entry({ current_tier: "canonical" }));
    const prev = process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
    process.env["TEAMAGENT_LEGACY_CLAUDE_MD"] = "1";
    try {
      const result = await executeCompile(opts);
      expect(nodeFs.existsSync(tmp.claudeMdPath)).toBe(true);
      expect(result.markdown.path).toBe(tmp.claudeMdPath);
    } finally {
      if (prev === undefined) delete process.env["TEAMAGENT_LEGACY_CLAUDE_MD"];
      else process.env["TEAMAGENT_LEGACY_CLAUDE_MD"] = prev;
    }
  });

  it("--preset-only is ignored by Skills output and does not create rule markdown", async () => {
    seedEntry(
      tmp.projectDbPath,
      entry({ id: "preset-rule", source: "preset", current_tier: "canonical" }),
    );
    seedEntry(
      tmp.projectDbPath,
      entry({ id: "user-rule", source: "accumulated", current_tier: "canonical" }),
    );
    await executeCompile({ ...opts, presetOnly: true });
    const presetSkill = path.join(tmp.skillsDir, "preset-rule", "SKILL.md");
    const userSkill = path.join(tmp.skillsDir, "user-rule", "SKILL.md");
    expect(nodeFs.existsSync(presetSkill)).toBe(true);
    expect(nodeFs.existsSync(userSkill)).toBe(true);
    expect(nodeFs.existsSync(path.join(tmp.userRulesDir, "INDEX.md"))).toBe(false);
  });

  it("empty store: no errors, zero skills written", async () => {
    const result = await executeCompile(opts);
    expect(result.skills.written).toHaveLength(0);
    expect(result.skills.removed).toHaveLength(0);
  });
});

describe("renderCompileResult", () => {
  it("dry-run mode shows dry-run tag", () => {
    const out = renderCompileResult(
      { markdown: { path: "(skipped)", blockLineCount: 0 }, skills: { written: ["a", "b"], removed: [] } },
      true,
    );
    expect(out).toContain("dry-run");
    expect(out).toContain("2");
    expect(out).toContain("disabled");
  });

  it("normal mode shows skills and disabled CLAUDE.md output", () => {
    const out = renderCompileResult(
      { markdown: { path: "(skipped)", blockLineCount: 0 }, skills: { written: ["r1"], removed: ["r2"] } },
      false,
    );
    expect(out).toContain("CLAUDE.md");
    expect(out).toContain("disabled");
    expect(out).toContain("r1");
    expect(out).toContain("r2");
  });
});
