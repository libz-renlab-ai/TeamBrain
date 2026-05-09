import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  executeBugReport,
  parseBugReportArgs,
  redactSecrets,
} from "../commands/bug-report.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ta-bug-report-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("parseBugReportArgs", () => {
  it("parses --out and --stdout", () => {
    expect(parseBugReportArgs(["--out", "/tmp/r.md", "--stdout"])).toEqual({
      outputPath: "/tmp/r.md",
      stdout: true,
    });
    expect(parseBugReportArgs(["--out=/tmp/r.md"])).toEqual({
      outputPath: "/tmp/r.md",
      stdout: false,
    });
  });
});

describe("redactSecrets", () => {
  it("redacts common token and env assignment patterns", () => {
    const out = redactSecrets(
      "Authorization: Bearer sk-ant-api03-secret\nGITHUB_TOKEN=ghp_abcdef1234567890\n",
    );
    expect(out).toContain("Authorization: Bearer [redacted]");
    expect(out).toContain("GITHUB_TOKEN=[redacted]");
    expect(out).not.toContain("sk-ant-api03-secret");
    expect(out).not.toContain("ghp_abcdef1234567890");
  });
});

describe("executeBugReport", () => {
  it("writes a markdown report with system info and raw redacted logs", async () => {
    const cwd = path.join(tmp, "project");
    const homeDir = path.join(tmp, "home");
    const teamagentHome = path.join(homeDir, ".teamagent");
    fs.mkdirSync(path.join(cwd, ".teamagent"), { recursive: true });
    fs.mkdirSync(teamagentHome, { recursive: true });
    fs.writeFileSync(
      path.join(teamagentHome, "update.log"),
      "install failed\nTOKEN=secret-value\n",
    );
    fs.writeFileSync(
      path.join(cwd, ".teamagent", "events.jsonl"),
      "{\"event\":\"hook_error\",\"message\":\"boom\"}\n",
    );

    const outputPath = path.join(tmp, "report.md");
    const result = await executeBugReport({
      cwd,
      homeDir,
      outputPath,
      now: new Date("2026-04-29T12:34:56Z"),
      teamagentVersion: "0.10.1-test",
      runCommand: (cmd) => (cmd === "claude" ? "Claude Code 2.0.0" : "9.0.0"),
    });

    expect(result.outputPath).toBe(outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
    const md = fs.readFileSync(outputPath, "utf-8");
    expect(md).toContain("# TeamAgent Bug Report");
    expect(md).toContain("Claude Code 2.0.0");
    expect(md).toContain("teamagent: 0.10.1-test");
    expect(md).toContain("## Raw Logs");
    expect(md).toContain("install failed");
    expect(md).toContain("[redacted]");
    expect(md).not.toContain("secret-value");
    expect(md).toContain("\"hook_error\"");
  });

  it("--stdout mode appends issue-new URL footer and suppresses ## Summary template", async () => {
    const cwd = path.join(tmp, "project");
    const homeDir = path.join(tmp, "home");
    const teamagentHome = path.join(homeDir, ".teamagent");
    fs.mkdirSync(path.join(cwd, ".teamagent"), { recursive: true });
    fs.mkdirSync(teamagentHome, { recursive: true });

    const result = await executeBugReport({
      cwd,
      homeDir,
      stdout: true,
      now: new Date("2026-04-29T12:34:56Z"),
      teamagentVersion: "0.10.1-test",
      runCommand: (cmd) => (cmd === "claude" ? "Claude Code 2.0.0" : "9.0.0"),
    });

    expect(result.outputPath).toBeUndefined();
    const md = result.markdown;
    expect(md).not.toContain("## Summary");
    expect(md).toContain("https://github.com/libz-renlab-ai/TeamBrain/issues/new");
    // Last non-blank lines should contain the issue-new URL.
    const nonBlankLines = md.split("\n").filter((l) => l.trim().length > 0);
    const tail = nonBlankLines.slice(-5).join("\n");
    expect(tail).toContain("https://github.com/libz-renlab-ai/TeamBrain/issues/new");
  });

  it("--out=path mode keeps ## Summary template and omits issue-new URL footer", async () => {
    const cwd = path.join(tmp, "project");
    const homeDir = path.join(tmp, "home");
    const teamagentHome = path.join(homeDir, ".teamagent");
    fs.mkdirSync(path.join(cwd, ".teamagent"), { recursive: true });
    fs.mkdirSync(teamagentHome, { recursive: true });

    const outputPath = path.join(tmp, "report-file.md");
    const result = await executeBugReport({
      cwd,
      homeDir,
      outputPath,
      now: new Date("2026-04-29T12:34:56Z"),
      teamagentVersion: "0.10.1-test",
      runCommand: (cmd) => (cmd === "claude" ? "Claude Code 2.0.0" : "9.0.0"),
    });

    expect(result.outputPath).toBe(outputPath);
    const md = fs.readFileSync(outputPath, "utf-8");
    expect(md).toContain("## Summary");
    expect(md).not.toContain("https://github.com/libz-renlab-ai/TeamBrain/issues/new");
  });
});
