import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  parseDailyArgs,
  renderDailyHelp,
  buildDailyResult,
  executeDaily,
  renderDailyStdout,
} from "../commands/daily.js";

describe("parseDailyArgs", () => {
  it("defaults format to json", () => {
    expect(parseDailyArgs([])).toEqual({ format: "json" });
  });

  it("parses --help", () => {
    expect(parseDailyArgs(["--help"])).toMatchObject({ help: true });
    expect(parseDailyArgs(["-h"])).toMatchObject({ help: true });
  });

  it("parses --archive", () => {
    expect(parseDailyArgs(["--archive"])).toMatchObject({ archive: true });
  });

  it("parses --projects-root=", () => {
    expect(parseDailyArgs(["--projects-root=/tmp/p"])).toMatchObject({
      projectsRoot: "/tmp/p",
    });
    expect(parseDailyArgs(["--projects-root", "/tmp/p"])).toMatchObject({
      projectsRoot: "/tmp/p",
    });
  });

  it("parses --format=", () => {
    expect(parseDailyArgs(["--format=context"])).toMatchObject({
      format: "context",
    });
    expect(parseDailyArgs(["--format", "json"])).toMatchObject({
      format: "json",
    });
  });

  it("rejects unknown --format", () => {
    expect(() => parseDailyArgs(["--format=yaml"])).toThrow(/Unknown --format/);
  });

  it("rejects unknown flags", () => {
    expect(() => parseDailyArgs(["--no-such-flag"])).toThrow(/Unknown flag/);
  });
});

describe("renderDailyHelp", () => {
  it("emits canonical JSON with required keys", () => {
    const out = renderDailyHelp();
    const parsed = JSON.parse(out);
    expect(parsed).toMatchObject({
      command: "teamagent daily",
      summary: expect.any(String),
      usage: expect.any(String),
      flags: expect.any(Object),
    });
    expect(parsed.flags).toMatchObject({
      "--help": expect.any(String),
      "--archive": expect.any(String),
      "--projects-root": expect.any(String),
      "--format": expect.any(String),
    });
  });
});

describe("buildDailyResult + executeDaily integration", () => {
  let tmpHome: string;
  let projectsRoot: string;
  const originalEnv = process.env["TEAMAGENT_HOME"];

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "tb-daily-"));
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

  function writeSession(dir: string, sessionId: string, lines: object[]) {
    const subdir = path.join(projectsRoot, dir);
    fs.mkdirSync(subdir, { recursive: true });
    const filePath = path.join(subdir, `${sessionId}.jsonl`);
    fs.writeFileSync(
      filePath,
      lines.map((o) => JSON.stringify(o)).join("\n") + "\n",
    );
    // Force today-ish mtime so the scanner accepts it.
    const now = new Date();
    fs.utimesSync(filePath, now, now);
  }

  it("returns an empty result when there are no sessions today", () => {
    const result = buildDailyResult({ projectsRoot, homeDir: tmpHome });
    expect(result.projects).toEqual([]);
    expect(result.worktreeMergedCount).toBe(0);
    expect(result.triggeredBy).toBe("cli");
  });

  it("aggregates a host repo and its worktree under the same display name", () => {
    writeSession("-tmp-tb-projA", "main", [
      { type: "user", message: { role: "user", content: "host turn" } },
    ]);
    writeSession("-tmp-tb-projA-.codex-worktrees-task1", "wt", [
      { type: "user", message: { role: "user", content: "worktree turn" } },
    ]);

    const result = buildDailyResult({ projectsRoot, homeDir: tmpHome });
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.displayName).toBe("projA");
    expect(result.projects[0]?.sessionCount).toBe(2);
    expect(result.worktreeMergedCount).toBe(1);
  });

  it("writes the archive to <homeDir>/.teamagent/daily/<date>.md when --archive set", () => {
    writeSession("-tmp-tb-projA", "main", [
      { type: "user", message: { role: "user", content: "first" } },
    ]);
    const out = executeDaily({
      projectsRoot,
      homeDir: tmpHome,
      archive: true,
    });
    const expected = path.join(tmpHome, ".teamagent", "daily", `${out.result.date}.md`);
    expect(out.archivePath).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
    const body = fs.readFileSync(expected, "utf-8");
    expect(body).toMatch(/^# Daily activity/);
    expect(body).toContain("projA");
  });

  it("honors TEAMAGENT_HOME for archive root", () => {
    writeSession("-tmp-tb-projA", "main", [
      { type: "user", message: { role: "user", content: "first" } },
    ]);
    const overrideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tb-daily-override-"));
    try {
      process.env["TEAMAGENT_HOME"] = overrideRoot;
      const out = executeDaily({
        projectsRoot,
        homeDir: tmpHome,
        archive: true,
      });
      const expected = path.join(overrideRoot, "daily", `${out.result.date}.md`);
      expect(out.archivePath).toBe(expected);
      expect(fs.existsSync(expected)).toBe(true);
    } finally {
      fs.rmSync(overrideRoot, { recursive: true, force: true });
    }
  });

  it("renderDailyStdout emits json by default and context on demand", () => {
    writeSession("-tmp-tb-projA", "main", [
      { type: "user", message: { role: "user", content: "first" } },
    ]);
    const out = executeDaily({ projectsRoot, homeDir: tmpHome });
    expect(renderDailyStdout(out, { format: "json" })).toContain('"projects"');
    expect(renderDailyStdout(out, { format: "context" })).toContain(
      "# TeamAgent daily summary",
    );
  });
});
