import { describe, it, expect } from "vitest";
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
const USER_PROMPT_SUBMIT_BIN = path.join(CLI_DIST, "bin-user-prompt-submit.cjs");
const POST_TOOL_USE_BIN = path.join(CLI_DIST, "bin-post-tool-use.cjs");
const PRE_COMPACT_BIN = path.join(CLI_DIST, "bin-pre-compact.cjs");
const SESSION_END_BIN = path.join(CLI_DIST, "bin-session-end.cjs");
const DIGITAL_TWIN_TAP_BIN = path.join(CLI_DIST, "bin-digital-twin-tap.cjs");

// Convention in this repo (see bin-session-start-chaos.test.ts):
// integration tests that spawn the built `.cjs` bundles use `it.skipIf`
// to no-op when `pnpm build` hasn't run yet (e.g. ubuntu CI runs
// `pnpm test` before any build). The unit-level coverage is still
// exercised by every hook's regular `*.test.ts` suite.
const BUNDLES_EXIST = [
  SESSION_START_BIN,
  PRE_TOOL_USE_BIN,
  STOP_BIN,
  USER_PROMPT_SUBMIT_BIN,
  POST_TOOL_USE_BIN,
  PRE_COMPACT_BIN,
  SESSION_END_BIN,
  DIGITAL_TWIN_TAP_BIN,
].every((bin) => fs.existsSync(bin));

describe.skipIf(!BUNDLES_EXIST)("TEAMAGENT_DISABLED=1 master kill switch", () => {
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

  it("UserPromptSubmit hook bails before injection / matcher / embedder", async () => {
    const report = await spawnHook(
      USER_PROMPT_SUBMIT_BIN,
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        session_id: "issue-343-disabled-userprompt",
        cwd: process.cwd(),
        prompt: "hello world",
      }),
      { TEAMAGENT_DISABLED: "1" },
    );
    expect(report.exitCode).toBe(0);
    assertNoTbRuntimeNoise(report.stderr);
  });

  it("PostToolUse hook bails before event-log write", async () => {
    const report = await spawnHook(
      POST_TOOL_USE_BIN,
      JSON.stringify({
        hook_event_name: "PostToolUse",
        session_id: "issue-343-disabled-posttool",
        cwd: process.cwd(),
        tool_name: "Read",
        tool_input: { file_path: "/tmp/x" },
        tool_response: "ok",
      }),
      { TEAMAGENT_DISABLED: "1" },
    );
    expect(report.exitCode).toBe(0);
    assertNoTbRuntimeNoise(report.stderr);
  });

  it("PreCompact hook bails before detached child spawn", async () => {
    const report = await spawnHook(
      PRE_COMPACT_BIN,
      JSON.stringify({
        hook_event_name: "PreCompact",
        session_id: "issue-343-disabled-precompact",
        cwd: process.cwd(),
        transcript_path: path.join(
          os.tmpdir(),
          `issue-343-disabled-precompact-${Date.now()}.jsonl`,
        ),
      }),
      { TEAMAGENT_DISABLED: "1" },
    );
    expect(report.exitCode).toBe(0);
    assertNoTbRuntimeNoise(report.stderr);
  });

  it("SessionEnd hook bails before embedder /shutdown POST + rescan", async () => {
    const report = await spawnHook(
      SESSION_END_BIN,
      JSON.stringify({
        hook_event_name: "SessionEnd",
        session_id: "issue-343-disabled-sessionend",
        cwd: process.cwd(),
        transcript_path: path.join(
          os.tmpdir(),
          `issue-343-disabled-sessionend-${Date.now()}.jsonl`,
        ),
      }),
      { TEAMAGENT_DISABLED: "1" },
    );
    expect(report.exitCode).toBe(0);
    assertNoTbRuntimeNoise(report.stderr);
  });

  it("digital-twin-tap bails before stdin read / tapSession", async () => {
    const report = await spawnHook(
      DIGITAL_TWIN_TAP_BIN,
      JSON.stringify({
        hook_event_name: "Stop",
        session_id: "issue-343-disabled-digital-twin",
        cwd: process.cwd(),
        transcript_path: path.join(
          os.tmpdir(),
          `issue-343-disabled-digital-twin-${Date.now()}.jsonl`,
        ),
      }),
      { TEAMAGENT_DISABLED: "1" },
    );
    expect(report.exitCode).toBe(0);
    assertNoTbRuntimeNoise(report.stderr);
  });
});
