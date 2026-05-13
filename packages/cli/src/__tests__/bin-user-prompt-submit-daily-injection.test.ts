import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  matchPrompt,
  parseExtraTriggersEnv,
} from "@teamagent/core";
import { executeDaily } from "../commands/daily.js";

/**
 * The UserPromptSubmit hook composes its `additionalContext` envelope by:
 *   1. Running `matchPrompt(prompt, { disabled, extraTriggers })` from
 *      @teamagent/core.
 *   2. When matched, calling `executeDaily({ projectsRoot, homeDir, archive,
 *      format: "context" })` and pushing `out.contextMarkdown` into the
 *      block list.
 *
 * This test exercises the same wiring without spawning the bundled hook
 * (spawn-bundle integration is on the wip/** CI per ADR-0013). The goal is
 * a unit-level guard that a prompt change to either side does not
 * accidentally drop the integration.
 */
describe("UserPromptSubmit ↔ daily-summary wiring", () => {
  let tmpHome: string;
  let projectsRoot: string;
  const originalEnv = process.env["TEAMAGENT_HOME"];

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tb-hook-daily-"));
    projectsRoot = path.join(tmpHome, ".claude", "projects");
    fs.mkdirSync(projectsRoot, { recursive: true });
    delete process.env["TEAMAGENT_HOME"];
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env["TEAMAGENT_HOME"];
    } else {
      process.env["TEAMAGENT_HOME"] = originalEnv;
    }
  });

  function writeSession(dir: string, sessionId: string, content: string) {
    const subdir = path.join(projectsRoot, dir);
    fs.mkdirSync(subdir, { recursive: true });
    const fp = path.join(subdir, `${sessionId}.jsonl`);
    fs.writeFileSync(
      fp,
      JSON.stringify({ type: "user", message: { role: "user", content } }) +
        "\n",
    );
    const now = new Date();
    fs.utimesSync(fp, now, now);
  }

  it("does not fire daily-summary on unrelated prompts", () => {
    expect(matchPrompt("run the tests please").fire).toBe(false);
  });

  it("fires on each grill-mandated whitelist phrase", () => {
    expect(matchPrompt("总结一下今天的日报").fire).toBe(true);
    expect(matchPrompt("今日日报").fire).toBe(true);
    expect(matchPrompt("生成日报").fire).toBe(true);
    expect(matchPrompt("/daily").fire).toBe(true);
  });

  it("honors TEAMAGENT_DAILY_TRIGGERS env additions like the hook does", () => {
    const triggers = parseExtraTriggersEnv("custom-trigger,周报");
    expect(matchPrompt("custom-trigger", { extraTriggers: triggers }).fire).toBe(true);
    expect(matchPrompt("周报", { extraTriggers: triggers }).fire).toBe(true);
  });

  it("honors TEAMAGENT_DAILY_DISABLED=1 like the hook does", () => {
    expect(matchPrompt("总结一下今天的日报", { disabled: true }).fire).toBe(false);
  });

  it("end-to-end: matcher fires → executeDaily injects context referencing today's session", () => {
    writeSession("-tmp-tb-projA", "main", "morning standup");
    const match = matchPrompt("/daily --archive");
    expect(match.fire).toBe(true);

    const out = executeDaily({
      projectsRoot,
      homeDir: tmpHome,
      archive: true,
      format: "context",
    });
    expect(out.contextMarkdown).toContain("# TeamAgent daily summary");
    expect(out.contextMarkdown).toContain("projA");
    // Archive file written, includes the host repo display name.
    const archive = fs.readFileSync(out.archivePath, "utf-8");
    expect(archive).toMatch(/^# Daily activity/);
    expect(archive).toContain("projA");
  });
});
