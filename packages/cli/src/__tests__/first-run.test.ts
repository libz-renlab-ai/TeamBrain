import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Writable, PassThrough } from "node:stream";
import { runFirstRunWizard } from "../commands/first-run.js";

function mkTmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-test-"));
}

function rmRetry(p: string) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

function makeStdin(input: string): Readable {
  return Readable.from([input]);
}

function makeStdout(): { stream: Writable; captured: () => string } {
  const chunks: Buffer[] = [];
  const stream = new PassThrough();
  stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  return { stream, captured: () => Buffer.concat(chunks).toString("utf8") };
}

function makeSpawnImpl(recordCalls: Array<{ cmd: string; args: string[] }>, exitCode = 0) {
  return async (cmd: string, args: string[]) => {
    recordCalls.push({ cmd, args });
    return exitCode;
  };
}

describe("runFirstRunWizard", () => {
  const homes: string[] = [];
  afterEach(() => { homes.forEach(rmRetry); homes.length = 0; });

  it("menu render contains 装好啦 / 🎉 + 3 command names", async () => {
    const homeDir = mkTmpHome();
    homes.push(homeDir);
    const { stream, captured } = makeStdout();

    await runFirstRunWizard({
      homeDir,
      isTTY: false,
      stdout: stream,
    });

    const out = captured();
    expect(out).toMatch(/装好啦/);
    expect(out).toMatch(/🎉/);
    expect(out).toContain("skeleton-demo");
    expect(out).toContain("stats");
    expect(out).toContain("--help");
  });

  it("TTY branch + input '1' → spawnImpl called with skeleton-demo", async () => {
    const homeDir = mkTmpHome();
    homes.push(homeDir);
    const { stream, captured: _captured } = makeStdout();
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawnImpl = makeSpawnImpl(calls);

    // Override process.exit so test doesn't bail
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => { exitCode = code; }) as any;

    try {
      await runFirstRunWizard({
        homeDir,
        isTTY: true,
        stdin: makeStdin("1\n"),
        stdout: stream,
        spawnImpl,
      });
    } finally {
      process.exit = origExit;
    }

    expect(calls.length).toBe(1);
    expect(calls[0]!.cmd).toBe("skeleton-demo");
    expect(calls[0]!.args).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("non-TTY branch → menu printed, no spawnImpl call, no state file written", async () => {
    const homeDir = mkTmpHome();
    homes.push(homeDir);
    const { stream, captured } = makeStdout();
    const calls: Array<{ cmd: string; args: string[] }> = [];

    await runFirstRunWizard({
      homeDir,
      isTTY: false,
      stdout: stream,
      spawnImpl: makeSpawnImpl(calls),
    });

    expect(calls.length).toBe(0);
    expect(captured()).toContain("skeleton-demo");

    const stateFile = path.join(homeDir, ".teamagent", "first-run-state.json");
    expect(fs.existsSync(stateFile)).toBe(false);
  });

  it("state first-write: after run with input '1' → JSON file has completedSteps and numeric lastRunAt", async () => {
    const homeDir = mkTmpHome();
    homes.push(homeDir);
    const { stream } = makeStdout();
    const spawnImpl = makeSpawnImpl([], 0);
    let fakeNow = 1715000000000;

    const origExit = process.exit.bind(process);
    process.exit = ((_code: number) => {}) as any;

    try {
      await runFirstRunWizard({
        homeDir,
        isTTY: true,
        stdin: makeStdin("1\n"),
        stdout: stream,
        spawnImpl,
        now: () => fakeNow,
      });
    } finally {
      process.exit = origExit;
    }

    const stateFile = path.join(homeDir, ".teamagent", "first-run-state.json");
    expect(fs.existsSync(stateFile)).toBe(true);
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    expect(state.completedSteps).toContain("skeleton-demo");
    expect(typeof state.lastRunAt).toBe("number");
    expect(state.lastRunAt).toBe(fakeNow);
    expect(state.version).toBe(1);
  });

  it("state second-read: pre-seed with ['skeleton-demo'] → output contains 上次你跑了 skeleton-demo", async () => {
    const homeDir = mkTmpHome();
    homes.push(homeDir);

    // Pre-seed state file
    const teamagentDir = path.join(homeDir, ".teamagent");
    fs.mkdirSync(teamagentDir, { recursive: true });
    fs.writeFileSync(
      path.join(teamagentDir, "first-run-state.json"),
      JSON.stringify({ version: 1, completedSteps: ["skeleton-demo"], lastRunAt: 1714000000000 }, null, 2),
    );

    const { stream, captured } = makeStdout();

    await runFirstRunWizard({
      homeDir,
      isTTY: false,
      stdout: stream,
    });

    expect(captured()).toContain("上次你跑了 skeleton-demo");
    expect(captured()).toContain("stats");
  });

  it("invalid input '9' then '1' → eventually spawns skeleton-demo", async () => {
    const homeDir = mkTmpHome();
    homes.push(homeDir);
    const { stream } = makeStdout();
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawnImpl = makeSpawnImpl(calls, 0);

    const origExit = process.exit.bind(process);
    process.exit = ((_code: number) => {}) as any;

    try {
      await runFirstRunWizard({
        homeDir,
        isTTY: true,
        stdin: makeStdin("9\n1\n"),
        stdout: stream,
        spawnImpl,
      });
    } finally {
      process.exit = origExit;
    }

    expect(calls.length).toBe(1);
    expect(calls[0]!.cmd).toBe("skeleton-demo");
  });
});
