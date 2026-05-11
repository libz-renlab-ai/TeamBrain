import { describe, expect, test } from "vitest";
import path from "node:path";
import {
  STATIC_USER_SKILLS,
  STATIC_USER_SKILL_TARGETS,
  STATIC_USER_SKILL_CONTENT,
  computeDestPath,
  planStaticUserSkillInstall,
} from "../index.js";

describe("planStaticUserSkillInstall", () => {
  const joinPath = path.posix.join;
  const homeDir = "/home/test";

  test("returns one entry per (skill, target) pair when no filters", () => {
    const plan = planStaticUserSkillInstall({
      homeDir,
      fileExists: () => false,
      joinPath,
    });
    expect(plan).toHaveLength(
      STATIC_USER_SKILLS.length * STATIC_USER_SKILL_TARGETS.length,
    );
  });

  test("missing target files get action 'create' with content", () => {
    const plan = planStaticUserSkillInstall({
      homeDir,
      fileExists: () => false,
      joinPath,
    });
    for (const entry of plan) {
      expect(entry.action).toBe("create");
      expect(entry.content).toBe(STATIC_USER_SKILL_CONTENT[entry.skill]);
      expect(entry.content.length).toBeGreaterThan(0);
    }
  });

  test("existing target files get action 'skip-exists' (do NOT overwrite)", () => {
    const plan = planStaticUserSkillInstall({
      homeDir,
      fileExists: () => true,
      joinPath,
    });
    for (const entry of plan) {
      expect(entry.action).toBe("skip-exists");
    }
  });

  test("filtering targets marks others as 'skip-disabled'", () => {
    const plan = planStaticUserSkillInstall({
      homeDir,
      fileExists: () => false,
      joinPath,
      targets: ["claude"],
    });
    const claudeEntries = plan.filter((e) => e.target === "claude");
    const codexEntries = plan.filter((e) => e.target === "codex");
    expect(claudeEntries.every((e) => e.action === "create")).toBe(true);
    expect(codexEntries.every((e) => e.action === "skip-disabled")).toBe(true);
  });

  test("filtering skills marks others as 'skip-disabled'", () => {
    const plan = planStaticUserSkillInstall({
      homeDir,
      fileExists: () => false,
      joinPath,
      skills: ["grill-me"],
    });
    const grillMe = plan.filter((e) => e.skill === "grill-me");
    const others = plan.filter((e) => e.skill !== "grill-me");
    expect(grillMe.every((e) => e.action === "create")).toBe(true);
    expect(others.every((e) => e.action === "skip-disabled")).toBe(true);
  });

  test("destPath derivation: claude target uses .claude/skills/<name>/SKILL.md", () => {
    const dest = computeDestPath(
      joinPath,
      "/home/u",
      "claude",
      "grill-via-web",
    );
    expect(dest).toBe("/home/u/.claude/skills/grill-via-web/SKILL.md");
  });

  test("destPath derivation: codex target uses .codex/skills/<name>/SKILL.md", () => {
    const dest = computeDestPath(
      joinPath,
      "/home/u",
      "codex",
      "fixed-flow-driver",
    );
    expect(dest).toBe("/home/u/.codex/skills/fixed-flow-driver/SKILL.md");
  });

  test("each (skill, target) appears exactly once with stable order", () => {
    const plan = planStaticUserSkillInstall({
      homeDir,
      fileExists: () => false,
      joinPath,
    });
    const keys = plan.map((e) => `${e.skill}/${e.target}`);
    expect(new Set(keys).size).toBe(keys.length); // unique
    // STATIC_USER_SKILLS x STATIC_USER_SKILL_TARGETS — order: skill outer, target inner
    const expected: string[] = [];
    for (const s of STATIC_USER_SKILLS) {
      for (const t of STATIC_USER_SKILL_TARGETS) {
        expected.push(`${s}/${t}`);
      }
    }
    expect(keys).toEqual(expected);
  });

  test("inline content is non-empty for every static skill", () => {
    for (const skill of STATIC_USER_SKILLS) {
      const content = STATIC_USER_SKILL_CONTENT[skill];
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
      // Every SKILL.md must start with the YAML frontmatter delimiter.
      expect(content.startsWith("---\n")).toBe(true);
    }
  });
});
