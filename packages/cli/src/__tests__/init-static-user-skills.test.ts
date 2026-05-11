import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STATIC_USER_SKILLS } from "@teamagent/core";
import { executeInit } from "../commands/init.js";

/**
 * End-to-end coverage for the static-user-skills mirror step added by this
 * PR (issue #288, follow-up to #218 / #287).
 *
 * Strategy: run `executeInit` with a fake HOME under `os.tmpdir()`, with
 * `cwd` pointed at the real repo root so the source `.claude/skills/<name>/SKILL.md`
 * files exist. Then assert that all static skills landed in both
 * `~/.claude/skills/<name>/` and `~/.codex/skills/<name>/`.
 */
describe("teamagent init mirrors static user skills to ~/.claude + ~/.codex", () => {
  let tmpHome: string;
  let tmpCwd: string;
  const repoRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../../../..",
  );

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-init-skills-home-"));
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-init-skills-cwd-"));
    // Symlink .claude/skills source so the mirror function finds it via paths.cwd.
    fs.mkdirSync(path.join(tmpCwd, ".claude"), { recursive: true });
    fs.symlinkSync(
      path.join(repoRoot, ".claude", "skills"),
      path.join(tmpCwd, ".claude", "skills"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  test("dry-run reports every static skill target without writing", async () => {
    const result = await executeInit({
      cwd: tmpCwd,
      homeDir: tmpHome,
      dryRun: true,
      skipImport: true,
      skipHook: true,
      skipSeed: true,
      skipWarmup: true,
      target: "both",
    });

    const step = result.steps.find((s) => s.step === "mirror-static-user-skills");
    expect(step).toBeDefined();
    expect(step!.status).toBe("ok");
    expect(step!.detail).toMatch(/dry-run/);
    expect(step!.detail).toContain(`created=${STATIC_USER_SKILLS.length * 2}`);

    // No files written.
    expect(fs.existsSync(path.join(tmpHome, ".claude", "skills"))).toBe(false);
    expect(fs.existsSync(path.join(tmpHome, ".codex", "skills"))).toBe(false);
  });

  test("real run with target=both writes all static skills to ~/.claude + ~/.codex", async () => {
    await executeInit({
      cwd: tmpCwd,
      homeDir: tmpHome,
      dryRun: false,
      skipImport: true,
      skipHook: true,
      skipSeed: true,
      skipWarmup: true,
      userLevelHook: false,
      target: "both",
    });

    for (const name of STATIC_USER_SKILLS) {
      const claudePath = path.join(tmpHome, ".claude", "skills", name, "SKILL.md");
      const codexPath = path.join(tmpHome, ".codex", "skills", name, "SKILL.md");
      expect(fs.existsSync(claudePath), `${claudePath} missing`).toBe(true);
      expect(fs.existsSync(codexPath), `${codexPath} missing`).toBe(true);
      // Content non-empty and starts with frontmatter delimiter.
      expect(fs.readFileSync(claudePath, "utf8").startsWith("---\n")).toBe(true);
      expect(fs.readFileSync(codexPath, "utf8").startsWith("---\n")).toBe(true);
    }
  });

  test("target=claude only writes ~/.claude/skills/, leaves ~/.codex/skills/ untouched", async () => {
    await executeInit({
      cwd: tmpCwd,
      homeDir: tmpHome,
      dryRun: false,
      skipImport: true,
      skipHook: true,
      skipSeed: true,
      skipWarmup: true,
      userLevelHook: false,
      target: "claude",
    });

    expect(
      fs.existsSync(path.join(tmpHome, ".claude", "skills", "grill-me", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(tmpHome, ".codex", "skills", "grill-me", "SKILL.md")),
    ).toBe(false);
  });

  test("existing user SKILL.md is NOT overwritten (skip-exists)", async () => {
    const userClaudePath = path.join(
      tmpHome,
      ".claude",
      "skills",
      "grill-me",
      "SKILL.md",
    );
    fs.mkdirSync(path.dirname(userClaudePath), { recursive: true });
    fs.writeFileSync(userClaudePath, "USER_CUSTOM_CONTENT", "utf8");

    await executeInit({
      cwd: tmpCwd,
      homeDir: tmpHome,
      dryRun: false,
      skipImport: true,
      skipHook: true,
      skipSeed: true,
      skipWarmup: true,
      userLevelHook: false,
      target: "both",
    });

    // Existing user file preserved.
    expect(fs.readFileSync(userClaudePath, "utf8")).toBe("USER_CUSTOM_CONTENT");
    // But the other skills + codex side still got installed.
    expect(
      fs.existsSync(
        path.join(tmpHome, ".codex", "skills", "grill-me", "SKILL.md"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(tmpHome, ".claude", "skills", "grill-via-web", "SKILL.md"),
      ),
    ).toBe(true);
  });
});
