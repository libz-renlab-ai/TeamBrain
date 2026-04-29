import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { isDetachedPipelineInvocation, runStopPipeline, type StopHookInput } from "../bin-stop.js";

vi.mock("../commands/analyze.js", () => ({
  executeAnalyze: vi.fn().mockResolvedValue("analyze done"),
}));
vi.mock("../commands/calibrate.js", () => ({
  executeCalibrate: vi.fn().mockResolvedValue({ dryRun: false }),
}));
vi.mock("../commands/compile.js", () => ({
  executeCompile: vi.fn().mockResolvedValue({
    markdown: { path: "CLAUDE.md", blockLineCount: 5 },
    skills: { written: [], removed: [] },
  }),
}));
vi.mock("../commands/scan-errors.js", () => ({
  executeScanErrors: vi.fn().mockResolvedValue(""),
}));
vi.mock("../commands/recent-entries.js", () => ({
  getRecentEntries: vi.fn(),
}));
// Prevent tests from writing to the real project's .teamagent/last-harvest.md
vi.mock("../harvest-writer.js", () => ({
  appendHarvest: vi.fn(),
  getHarvestPath: vi.fn((cwd: string) => `${cwd}/.teamagent/last-harvest.md`),
}));
// Prevent tests from touching real scan-cursor.json
vi.mock("../scan-cursor.js", () => ({
  readCursor: vi.fn(() => -1),
  writeCursor: vi.fn(),
  clearCursor: vi.fn(),
  readSeen: vi.fn(() => new Set<string>()),
  writeSeen: vi.fn(),
}));

import { executeAnalyze } from "../commands/analyze.js";
import { executeCalibrate } from "../commands/calibrate.js";
import { executeCompile } from "../commands/compile.js";
import { getRecentEntries } from "../commands/recent-entries.js";

describe("runStopPipeline", () => {
  // B-070: analyze is now skipped when transcript_path doesn't exist on disk.
  // Tests that need analyze to run use this real (empty) transcript file.
  let transcriptPath: string;
  // B-085: redirect logError destination to a tmp dir so test runs don't
  // append to the developer's real ~/.teamagent/stop-errors.log.
  let testTeamagentHome: string;
  let originalTeamagentHome: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    transcriptPath = path.join(os.tmpdir(), `bin-stop-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    fs.writeFileSync(transcriptPath, "", "utf-8");
    testTeamagentHome = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-home-"));
    originalTeamagentHome = process.env.TEAMAGENT_HOME;
    process.env.TEAMAGENT_HOME = testTeamagentHome;
  });
  afterEach(() => {
    try { fs.unlinkSync(transcriptPath); } catch { /* ignore */ }
    if (originalTeamagentHome === undefined) delete process.env.TEAMAGENT_HOME;
    else process.env.TEAMAGENT_HOME = originalTeamagentHome;
    fs.rmSync(testTeamagentHome, { recursive: true, force: true });
  });

  it("calls analyze with transcript_path and commit=true", async () => {
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    expect(executeAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({
        session: transcriptPath,
        commit: true,
        cwd: process.cwd(),
      })
    );
  });

  it("calls calibrate and compile after analyze", async () => {
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    expect(executeCalibrate).toHaveBeenCalled();
    expect(executeCompile).toHaveBeenCalled();
  });

  it("continues pipeline even if analyze throws", async () => {
    vi.mocked(executeAnalyze).mockRejectedValueOnce(new Error("analyze failed"));
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await expect(runStopPipeline(input)).resolves.not.toThrow();
    expect(executeCalibrate).toHaveBeenCalled();
    expect(executeCompile).toHaveBeenCalled();
  });

  // B-085: logError must respect TEAMAGENT_HOME so that test runs don't
  // pollute the developer's real ~/.teamagent/stop-errors.log. Failing this
  // test means the production log file accumulates ~16 fake entries per
  // bin-stop test run.
  it("logError writes to TEAMAGENT_HOME, not real ~/.teamagent/", async () => {
    vi.mocked(executeAnalyze).mockRejectedValueOnce(new Error("isolated-analyze-fail"));
    const input: StopHookInput = {
      session_id: "iso-1",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    const isolatedLog = path.join(testTeamagentHome, ".teamagent", "stop-errors.log");
    expect(fs.existsSync(isolatedLog)).toBe(true);
    const content = fs.readFileSync(isolatedLog, "utf-8");
    expect(content).toContain("step=analyze");
    expect(content).toContain("isolated-analyze-fail");
  });

  it("resolves even if all steps throw", async () => {
    vi.mocked(executeAnalyze).mockRejectedValueOnce(new Error("fail"));
    vi.mocked(executeCalibrate).mockRejectedValueOnce(new Error("fail"));
    vi.mocked(executeCompile).mockRejectedValueOnce(new Error("fail"));
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await expect(runStopPipeline(input)).resolves.toBeUndefined();
  });

  // Regression: Stop hook can fire before Claude flushes the transcript jsonl.
  // Previous behavior threw on the first "Session not found" and skipped to
  // calibrate/compile; analyze must retry instead so most sessions actually
  // produce candidates.
  it("retries analyze when it throws Session not found", async () => {
    vi.mocked(executeAnalyze)
      .mockRejectedValueOnce(new Error("Session not found: " + transcriptPath))
      .mockRejectedValueOnce(new Error("Session not found: " + transcriptPath))
      .mockResolvedValueOnce("analyze done");
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    expect(executeAnalyze).toHaveBeenCalledTimes(3);
  });

  // B-070: subagent / vitest sessions never persist a transcript jsonl.
  // Stop hook would otherwise burn 9s on 4 retries, plus log noise.
  it("skips analyze without retry when transcript_path doesn't exist", async () => {
    const ghostPath = path.join(os.tmpdir(), `ghost-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    expect(fs.existsSync(ghostPath)).toBe(false);
    const input: StopHookInput = {
      session_id: "subagent-x",
      transcript_path: ghostPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    expect(executeAnalyze).not.toHaveBeenCalled();
    // Calibrate/compile still run — only analyze is skipped
    expect(executeCalibrate).toHaveBeenCalled();
    expect(executeCompile).toHaveBeenCalled();
  });

  it("still calls analyze when transcript_path exists", async () => {
    const realPath = path.join(os.tmpdir(), `real-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    fs.writeFileSync(realPath, "", "utf-8");
    try {
      const input: StopHookInput = {
        session_id: "real",
        transcript_path: realPath,
        cwd: process.cwd(),
        hook_event_name: "Stop",
      };
      await runStopPipeline(input);
      expect(executeAnalyze).toHaveBeenCalled();
    } finally {
      try { fs.unlinkSync(realPath); } catch { /* ignore */ }
    }
  });

  it("does not retry on unrelated errors", async () => {
    vi.mocked(executeAnalyze).mockRejectedValueOnce(new Error("unexpected format"));
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    expect(executeAnalyze).toHaveBeenCalledTimes(1);
  });

  it("retries on permission denied (Windows file lock race)", async () => {
    vi.mocked(executeAnalyze)
      .mockRejectedValueOnce(new Error("EACCES: permission denied, open '/tmp/session.jsonl'"))
      .mockResolvedValueOnce("分析完成\n");
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    expect(executeAnalyze).toHaveBeenCalledTimes(2);
  });

  it("outputs stdout learning summary when recent entries exist", async () => {
    vi.mocked(getRecentEntries).mockResolvedValue([
      { tldr: "用 dayjs 代替 moment", confidence: 0.92 },
      { tldr: "凭据持久化", confidence: 0.80 },
    ]);
    const stdoutWrites: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    const combined = stdoutWrites.join("");
    expect(combined).toContain("✦ TeamAgent 本会话学到 2 条新经验");
    expect(combined).toContain("dayjs");
    expect(combined).toContain("0.92");
    stdoutSpy.mockRestore();
  });

  it("stdout is silent when no recent entries", async () => {
    vi.mocked(getRecentEntries).mockResolvedValue([]);
    const stdoutWrites: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    const input: StopHookInput = {
      session_id: "abc123",
      transcript_path: transcriptPath,
      cwd: process.cwd(),
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    const combined = stdoutWrites.join("");
    expect(combined).not.toContain("✦ TeamAgent");
    stdoutSpy.mockRestore();
  });
});

describe("isDetachedPipelineInvocation (B-068 env-leak resilience)", () => {
  let tmpFile: string;
  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `bin-stop-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({}), "utf-8");
  });
  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  });

  it("returns true when env=1 AND argv[2] is an existing file", () => {
    const env = { TEAMAGENT_STOP_PIPELINE: "1" };
    const argv = ["/path/to/node", "/path/to/bin-stop.cjs", tmpFile];
    expect(isDetachedPipelineInvocation(env, argv)).toBe(true);
  });

  it("returns false when env is unset (foreground hook)", () => {
    const env = {};
    const argv = ["/path/to/node", "/path/to/bin-stop.cjs", tmpFile];
    expect(isDetachedPipelineInvocation(env, argv)).toBe(false);
  });

  it("returns false when env=1 but argv[2] is missing — env was leaked", () => {
    // This is the real-world bug: TEAMAGENT_STOP_PIPELINE leaks into Claude
    // Code's hook spawn, so the foreground hook (no argv[2]) sees env=1 and
    // previously crashed by trying to read argv[2]. Must fall through instead.
    const env = { TEAMAGENT_STOP_PIPELINE: "1" };
    const argv = ["/path/to/node", "/path/to/bin-stop.cjs"];
    expect(isDetachedPipelineInvocation(env, argv)).toBe(false);
  });

  it("returns false when env=1 but argv[2] points to a non-existent file", () => {
    const env = { TEAMAGENT_STOP_PIPELINE: "1" };
    const ghostPath = path.join(os.tmpdir(), `does-not-exist-${Date.now()}.json`);
    const argv = ["/path/to/node", "/path/to/bin-stop.cjs", ghostPath];
    expect(isDetachedPipelineInvocation(env, argv)).toBe(false);
  });

  it("supports custom env key for SessionEnd binary", () => {
    const env = { TEAMAGENT_SESSION_END_PIPELINE: "1" };
    const argv = ["/path/to/node", "/path/to/bin-session-end.cjs", tmpFile];
    expect(isDetachedPipelineInvocation(env, argv, "TEAMAGENT_SESSION_END_PIPELINE")).toBe(true);
    // wrong env key → false
    expect(isDetachedPipelineInvocation(env, argv)).toBe(false);
  });

  it("returns false when env value is not exactly '1'", () => {
    expect(isDetachedPipelineInvocation({ TEAMAGENT_STOP_PIPELINE: "true" }, ["", "", tmpFile])).toBe(false);
    expect(isDetachedPipelineInvocation({ TEAMAGENT_STOP_PIPELINE: "" }, ["", "", tmpFile])).toBe(false);
    expect(isDetachedPipelineInvocation({ TEAMAGENT_STOP_PIPELINE: "0" }, ["", "", tmpFile])).toBe(false);
  });
});

describe("runStopPipeline lock file", () => {
  let tmpCwd: string;
  let lockTranscriptPath: string;
  // B-085: redirect logError destination away from real ~/.teamagent.
  let lockTestTeamagentHome: string;
  let lockOriginalTeamagentHome: string | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore baseline resolving mocks (earlier describe's mockRejectedValueOnce
    // queue may have drained already, but reset to be safe).
    vi.mocked(executeAnalyze).mockResolvedValue("analyze done");
    vi.mocked(executeCalibrate).mockResolvedValue({ dryRun: false } as never);
    vi.mocked(executeCompile).mockResolvedValue({
      markdown: { path: "CLAUDE.md", blockLineCount: 5 },
      skills: { written: [], removed: [] },
    } as never);
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "stop-lock-"));
    // B-070: analyze fast-skips when transcript missing; create a real one.
    lockTranscriptPath = path.join(tmpCwd, "transcript.jsonl");
    fs.writeFileSync(lockTranscriptPath, "", "utf-8");
    lockTestTeamagentHome = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-home-"));
    lockOriginalTeamagentHome = process.env.TEAMAGENT_HOME;
    process.env.TEAMAGENT_HOME = lockTestTeamagentHome;
  });
  afterEach(() => {
    fs.rmSync(tmpCwd, { recursive: true, force: true });
    if (lockOriginalTeamagentHome === undefined) delete process.env.TEAMAGENT_HOME;
    else process.env.TEAMAGENT_HOME = lockOriginalTeamagentHome;
    fs.rmSync(lockTestTeamagentHome, { recursive: true, force: true });
  });

  it("writes and deletes lock file during pipeline run", async () => {
    const lockPath = path.join(tmpCwd, ".teamagent", ".stop-running.lock");
    let lockSeenDuringAnalyze = false;
    let lockPayload: { pid?: number; started_at?: string } | null = null;

    vi.mocked(executeAnalyze).mockImplementationOnce(async () => {
      lockSeenDuringAnalyze = fs.existsSync(lockPath);
      if (lockSeenDuringAnalyze) {
        lockPayload = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
      }
      return "analyze done";
    });

    const input: StopHookInput = {
      session_id: "x",
      transcript_path: lockTranscriptPath,
      cwd: tmpCwd,
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    expect(lockSeenDuringAnalyze).toBe(true);
    const payload = lockPayload as { pid?: number; started_at?: string } | null;
    expect(payload?.pid).toBe(process.pid);
    expect(typeof payload?.started_at).toBe("string");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("removes lock even if pipeline throws", async () => {
    const lockPath = path.join(tmpCwd, ".teamagent", ".stop-running.lock");
    vi.mocked(executeAnalyze).mockRejectedValueOnce(new Error("boom"));
    vi.mocked(executeCalibrate).mockRejectedValueOnce(new Error("boom2"));
    vi.mocked(executeCompile).mockRejectedValueOnce(new Error("boom3"));

    const input: StopHookInput = {
      session_id: "x",
      transcript_path: lockTranscriptPath,
      cwd: tmpCwd,
      hook_event_name: "Stop",
    };
    await runStopPipeline(input);
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
