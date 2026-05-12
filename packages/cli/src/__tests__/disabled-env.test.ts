import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Issue #343 PR-1: TEAMAGENT_DISABLED=1 master kill switch.
 *
 * Each hook handler must early-return when this env is set, without:
 *   - touching ~/.teamagent state
 *   - emitting AttributionBus events
 *   - producing TB-specific stderr (matcher / M5 / analyze / embedder noise)
 *
 * PR-2/PR-3 rely on this for paired TB-ON vs TB-OFF token-cost ablation;
 * if disabled mode is not byte-for-byte indistinguishable from "TB not
 * installed", the cost delta measurement is biased.
 *
 * The test spawns each built hook bundle with TEAMAGENT_DISABLED=1 and a
 * minimal valid stdin payload, then asserts exit 0 + no TB-specific noise.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_DIST = path.resolve(HERE, "..", "..", "dist");

interface SpawnReport {
  exitCode: number | null;
  stderr: string;
  durationMs: number;
}

async function spawnHook(
  binPath: string,
  stdinPayload: string,
  extraEnv: Record<string, string>,
  timeoutMs = 8000,
): Promise<SpawnReport> {
  const stageRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "issue-343-disabled-"),
  );
  const staged = path.join(stageRoot, path.basename(binPath));
  fs.copyFileSync(binPath, staged);

  return new Promise<SpawnReport>((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
    // Strip env that would change hook decisioning (we want a clean
    // single-variable measurement: TEAMAGENT_DISABLED only).
    delete env.CLAUDE_PROJECT_DIR;
    delete env.TEAMAGENT_ALLOW_BARE_SESSIONSTART;
    delete env.TEAMAGENT_STOP_PIPELINE;

    const t0 = Date.now();
    const child = spawn(process.execPath, [staged], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let timedOut = false;
    const to = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stderr.on("data", (b: Buffer) => {
      stderr += String(b);
    });
    child.on("close", (code) => {
      clearTimeout(to);
      try {
        fs.rmSync(stageRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      resolve({
        exitCode: timedOut ? -1 : code,
        stderr,
        durationMs: Date.now() - t0,
      });
    });
    if (stdinPayload) child.stdin.write(stdinPayload);
    child.stdin.end();
  });
}

// Regexes that match TB-specific runtime work (matcher dispatch, M5
// pipeline, embedder daemon, AttributionBus emit, analyze pipeline).
// Disabled hooks must not produce any of these in stderr.
const TB_RUNTIME_NOISE = [
  /\bmatcher\b/i,
  /\bM5\b/,
  /\banalyze\b/i,
  /\bembedder\b/i,
  /attribution/i,
];

function assertNoTbRuntimeNoise(stderr: string): void {
  for (const re of TB_RUNTIME_NOISE) {
    expect(stderr).not.toMatch(re);
  }
}

const SESSION_START_BIN = path.join(CLI_DIST, "bin-session-start.cjs");
const PRE_TOOL_USE_BIN = path.join(CLI_DIST, "bin-pre-tool-use.cjs");
const STOP_BIN = path.join(CLI_DIST, "bin-stop.cjs");

beforeAll(() => {
  for (const bin of [SESSION_START_BIN, PRE_TOOL_USE_BIN, STOP_BIN]) {
    if (!fs.existsSync(bin)) {
      throw new Error(
        `Missing ${bin}. Run \`pnpm -F @teamagent/cli build\` (or \`pnpm build\` at repo root) before running this integration test.`,
      );
    }
  }
});

describe("TEAMAGENT_DISABLED=1 master kill switch", () => {
  it("SessionStart hook returns silently without TB runtime work", async () => {
    const report = await spawnHook(
      SESSION_START_BIN,
      JSON.stringify({
        hook_event_name: "SessionStart",
        session_id: "issue-343-disabled-session",
        cwd: process.cwd(),
      }),
      { TEAMAGENT_DISABLED: "1" },
    );
    expect(report.exitCode).toBe(0);
    assertNoTbRuntimeNoise(report.stderr);
  });

  it("PreToolUse hook returns allow without matcher work", async () => {
    const report = await spawnHook(
      PRE_TOOL_USE_BIN,
      JSON.stringify({
        hook_event_name: "PreToolUse",
        session_id: "issue-343-disabled-pretool",
        cwd: process.cwd(),
        tool_name: "Read",
        tool_input: { file_path: "/tmp/issue-343-disabled-probe.txt" },
      }),
      { TEAMAGENT_DISABLED: "1" },
    );
    expect(report.exitCode).toBe(0);
    assertNoTbRuntimeNoise(report.stderr);
  });

  it("Stop hook bails before pipeline / lock / spawn", async () => {
    const report = await spawnHook(
      STOP_BIN,
      JSON.stringify({
        hook_event_name: "Stop",
        session_id: "issue-343-disabled-stop",
        cwd: process.cwd(),
        transcript_path: path.join(
          os.tmpdir(),
          `issue-343-disabled-nonexistent-${Date.now()}.jsonl`,
        ),
      }),
      { TEAMAGENT_DISABLED: "1" },
    );
    expect(report.exitCode).toBe(0);
    assertNoTbRuntimeNoise(report.stderr);
  });
});
