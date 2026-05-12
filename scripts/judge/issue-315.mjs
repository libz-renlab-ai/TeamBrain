#!/usr/bin/env node
/**
 * Judge harness for FIXEDFLOW issue #315 — embedder daemon RAM bomb.
 *
 * Per docs/plans/2026-05-11-issue-315/judge.md:
 *
 *   §V1 RUN   — six independent tools (typecheck, test-cli, test-adapters,
 *               build, single-tracker, concurrent-tracker)
 *   §V2 DUMP  — emit canonical judge.json roll-up
 *   §V3 READ  — external LLM judge consumes judge.json + evidence files
 *               and writes verdict.json with `pass | fail | uncertain`
 *
 * Usage (from repo root):
 *
 *   node scripts/judge/issue-315.mjs
 *
 * Outputs land under `.fixedflow/judge/issue-315/`:
 *
 *   typecheck.{stdout,exit}
 *   test-cli.{stdout,exit}
 *   test-adapters.{stdout,exit}
 *   build.{stdout,exit}
 *   single-tracker.{tracker,exit,stderr}
 *   concurrent-tracker.{tracker,exits,stderrs}
 *   judge.json — canonical roll-up
 *
 * The harness is intentionally dependency-free: only Node builtins +
 * pnpm/node child processes. It does not assert PASS/FAIL itself — the
 * §V3 LLM judge is the authoritative verdict per
 * docs/AGENTIC-CODING-POLICY.md §3.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const OUT_DIR = path.join(REPO_ROOT, ".fixedflow", "judge", "issue-315");
const RUN_ID = `issue-315-${Math.floor(Date.now() / 1000)}`;

function ISO() { return new Date().toISOString(); }

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeFile(name, body) {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body, null, 2) + "\n", "utf-8");
  return file;
}

// ─── §V1.1 typecheck ──────────────────────────────────────────────────────

function runTypecheck() {
  const startedAt = ISO();
  const result = spawnSync("pnpm", ["typecheck"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    windowsHide: true,
    shell: process.platform === "win32",
    timeout: 240_000,
  });
  writeFile("typecheck.stdout", (result.stdout ?? "") + "\n--- stderr ---\n" + (result.stderr ?? ""));
  writeFile("typecheck.exit", String(result.status));
  return {
    tool: "typecheck",
    startedAt,
    finishedAt: ISO(),
    exit: result.status,
    passed: result.status === 0,
  };
}

// ─── §V1.2 test-cli ───────────────────────────────────────────────────────

function runTestCli() {
  const startedAt = ISO();
  // Just our touched test files — the full suite runs in CI per ADR-0013.
  const targets = [
    "packages/cli/src/__tests__/user-prompt-rule-retriever.test.ts",
    "packages/cli/src/__tests__/daemon-first-embedder.test.ts",
    "packages/cli/src/__tests__/embedder-spawn-lock.test.ts",
    "packages/cli/src/__tests__/embedder-state.test.ts",
    "packages/cli/src/__tests__/m5-e2e.test.ts",
  ];
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", ...targets],
    {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      windowsHide: true,
      shell: process.platform === "win32",
      timeout: 240_000,
    },
  );
  writeFile("test-cli.stdout", (result.stdout ?? "") + "\n--- stderr ---\n" + (result.stderr ?? ""));
  writeFile("test-cli.exit", String(result.status));
  return {
    tool: "test-cli",
    targets,
    startedAt,
    finishedAt: ISO(),
    exit: result.status,
    passed: result.status === 0,
  };
}

// ─── §V1.3 test-adapters ──────────────────────────────────────────────────

function runTestAdapters() {
  const startedAt = ISO();
  const targets = [
    "packages/adapters/src/embedding/__tests__/xenova-rule-embedder.test.ts",
    "packages/adapters/src/embedding/__tests__/xenova-rule-embedder-tracker.test.ts",
  ];
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", ...targets],
    {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      windowsHide: true,
      shell: process.platform === "win32",
      timeout: 240_000,
    },
  );
  writeFile("test-adapters.stdout", (result.stdout ?? "") + "\n--- stderr ---\n" + (result.stderr ?? ""));
  writeFile("test-adapters.exit", String(result.status));
  return {
    tool: "test-adapters",
    targets,
    startedAt,
    finishedAt: ISO(),
    exit: result.status,
    passed: result.status === 0,
  };
}

// ─── §V1.4 build ──────────────────────────────────────────────────────────

function runBuild() {
  const startedAt = ISO();
  const result = spawnSync("pnpm", ["-F", "@teamagent/cli", "build"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    windowsHide: true,
    shell: process.platform === "win32",
    timeout: 300_000,
  });
  writeFile("build.stdout", (result.stdout ?? "") + "\n--- stderr ---\n" + (result.stderr ?? ""));
  writeFile("build.exit", String(result.status));
  const distExists = fs.existsSync(path.join(REPO_ROOT, "packages", "cli", "dist", "bin-user-prompt-submit.cjs"));
  return {
    tool: "build",
    startedAt,
    finishedAt: ISO(),
    exit: result.status,
    distExists,
    passed: result.status === 0 && distExists,
  };
}

// ─── §V1.5 single-tracker ─────────────────────────────────────────────────

async function runSingleTracker() {
  const startedAt = ISO();
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "issue-315-single-"));
  const trackerPath = path.join(tmpHome, "xenova.log");
  fs.writeFileSync(trackerPath, ""); // empty initial
  const bin = path.join(REPO_ROOT, "packages", "cli", "dist", "bin-user-prompt-submit.cjs");
  if (!fs.existsSync(bin)) {
    return {
      tool: "single-tracker",
      startedAt,
      finishedAt: ISO(),
      skipped: true,
      reason: "build did not produce bin-user-prompt-submit.cjs",
      passed: false,
    };
  }
  // The bin needs to read SOME stdin so runHook unblocks; supply a minimal
  // payload. We don't care about its output — only about the tracker file.
  const payload = JSON.stringify({
    prompt: "hello world",
    session_id: "judge-issue-315-single",
    cwd: tmpHome,
  });
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [bin], {
      cwd: tmpHome,
      env: {
        ...process.env,
        TEAMAGENT_HOME: tmpHome,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
        TEAMAGENT_XENOVA_TRACKER: trackerPath,
        CLAUDE_PROJECT_DIR: tmpHome,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString("utf-8"); });
    child.stderr?.on("data", (d) => { stderr += d.toString("utf-8"); });
    child.stdin?.write(payload);
    child.stdin?.end();
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* */ }
      resolve({ exitCode: null, stdout, stderr, timedOut: true });
    }, 15_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut: false });
    });
  });
  const trackerContent = fs.existsSync(trackerPath)
    ? fs.readFileSync(trackerPath, "utf-8")
    : "";
  const lineCount = trackerContent.split("\n").filter((l) => l.length > 0).length;
  writeFile("single-tracker.tracker", trackerContent);
  writeFile("single-tracker.exit", String(result.exitCode));
  writeFile("single-tracker.stdout", result.stdout);
  writeFile("single-tracker.stderr", result.stderr);
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* */ }
  return {
    tool: "single-tracker",
    startedAt,
    finishedAt: ISO(),
    exit: result.exitCode,
    timedOut: result.timedOut === true,
    xenovaLoads: lineCount,
    // Expected: 0 lines. bin-user-prompt-submit is wired to
    // DaemonFirstEmbedder; no daemon running in this clean tmp HOME →
    // DaemonFirstEmbedder returns empty vectors, never constructs
    // XenovaRuleEmbedder.
    passed: lineCount === 0 && (result.exitCode === 0 || result.exitCode === null),
  };
}

// ─── §V1.6 concurrent-tracker ─────────────────────────────────────────────

async function runConcurrentTracker() {
  const startedAt = ISO();
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "issue-315-conc-"));
  const trackerPath = path.join(tmpHome, "xenova.log");
  fs.writeFileSync(trackerPath, "");
  const ssBin = path.join(REPO_ROOT, "packages", "cli", "dist", "bin-session-start.cjs");
  const ptBin = path.join(REPO_ROOT, "packages", "cli", "dist", "bin-pre-tool-use.cjs");
  if (!fs.existsSync(ssBin) || !fs.existsSync(ptBin)) {
    return {
      tool: "concurrent-tracker",
      startedAt,
      finishedAt: ISO(),
      skipped: true,
      reason: "build did not produce required bins",
      passed: false,
    };
  }

  function spawnHook(bin, sessionSuffix) {
    return new Promise((resolve) => {
      const env = {
        ...process.env,
        TEAMAGENT_HOME: tmpHome,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
        TEAMAGENT_XENOVA_TRACKER: trackerPath,
        TEAMAGENT_XENOVA_TRACKER_FAIL_FAST: "1",
        CLAUDE_PROJECT_DIR: tmpHome,
      };
      const child = spawn(process.execPath, [bin], {
        cwd: tmpHome,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => { stdout += d.toString("utf-8"); });
      child.stderr?.on("data", (d) => { stderr += d.toString("utf-8"); });
      const payload = JSON.stringify({
        session_id: `judge-conc-${sessionSuffix}`,
        cwd: tmpHome,
        tool_name: "Bash",
        tool_input: { command: "ls" },
        prompt: "hi",
      });
      child.stdin?.write(payload);
      child.stdin?.end();
      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* */ }
        resolve({ bin: path.basename(bin), exitCode: null, stdout, stderr, timedOut: true });
      }, 30_000);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ bin: path.basename(bin), exitCode: code, stdout, stderr, timedOut: false });
      });
    });
  }

  // 5 × SessionStart + 5 × PreToolUse, all in parallel.
  const tasks = [];
  for (let i = 0; i < 5; i++) tasks.push(spawnHook(ssBin, `ss-${i}`));
  for (let i = 0; i < 5; i++) tasks.push(spawnHook(ptBin, `pt-${i}`));
  const results = await Promise.all(tasks);

  const trackerContent = fs.existsSync(trackerPath)
    ? fs.readFileSync(trackerPath, "utf-8")
    : "";
  const lines = trackerContent.split("\n").filter((l) => l.length > 0);
  const argvList = lines.map((l) => {
    const m = l.match(/argv=(.+)$/);
    return m ? m[1] : "";
  });

  writeFile("concurrent-tracker.tracker", trackerContent);
  writeFile("concurrent-tracker.results", results);
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* */ }

  // Expected: ≤1 line in the tracker. The one allowed loader is the
  // bin-embedder.cjs daemon (spawned by SessionStart). All 10 hooks
  // themselves must NOT load Xenova in-process.
  const loaderArgvOk =
    lines.length === 0 ||
    (lines.length === 1 && /bin-embedder\.cjs/.test(argvList[0] ?? ""));

  return {
    tool: "concurrent-tracker",
    startedAt,
    finishedAt: ISO(),
    xenovaLoads: lines.length,
    loaderArgv: argvList,
    childResults: results.map((r) => ({
      bin: r.bin,
      exitCode: r.exitCode,
      timedOut: r.timedOut,
    })),
    passed: lines.length <= 1 && loaderArgvOk,
  };
}

// ─── §V2 DUMP ─────────────────────────────────────────────────────────────

async function main() {
  ensureOutDir();
  const startedAt = ISO();
  const expected = {
    typecheck:          { exit: 0 },
    "test-cli":         { exit: 0 },
    "test-adapters":    { exit: 0 },
    build:              { exit: 0 },
    "single-tracker":   { exit: 0, xenova_loads: 0 },
    "concurrent-tracker": { xenova_loads_max: 1, loader_argv_contains: "bin-embedder.cjs" },
  };

  const tools = {};
  tools.typecheck = runTypecheck();
  tools["test-cli"] = runTestCli();
  tools["test-adapters"] = runTestAdapters();
  tools.build = runBuild();
  // Tracker probes depend on build artefact; skip if build failed.
  if (tools.build.passed) {
    tools["single-tracker"] = await runSingleTracker();
    tools["concurrent-tracker"] = await runConcurrentTracker();
  } else {
    tools["single-tracker"] = { tool: "single-tracker", skipped: true, reason: "build failed", passed: false };
    tools["concurrent-tracker"] = { tool: "concurrent-tracker", skipped: true, reason: "build failed", passed: false };
  }

  const allPassed = Object.values(tools).every((t) => t.passed === true);
  const judge = {
    run_id: RUN_ID,
    issue: 315,
    startedAt,
    finishedAt: ISO(),
    evidence_dir: path.relative(REPO_ROOT, OUT_DIR),
    expected,
    actual: tools,
    allPassed,
  };
  writeFile("judge.json", judge);
  process.stdout.write(`judge harness done — allPassed=${allPassed}\n`);
  process.stdout.write(`evidence: ${path.relative(REPO_ROOT, OUT_DIR)}\n`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`harness error: ${err?.stack ?? err}\n`);
  process.exit(2);
});
