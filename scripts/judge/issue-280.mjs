#!/usr/bin/env node
/**
 * V4 judge harness for FIXEDFLOW issue #280.
 *
 * Per docs/plans/2026-05-11-issue-280/judge.md:
 *
 *   §V1 RUN    — run three independent probes (unit / chaos / doctor)
 *   §V2 DUMP   — emit a canonical dump.json roll-up
 *   §V3 READ   — an external LLM judge consumes dump.json and writes
 *                verdict.json with `pass | fail | uncertain`. This script
 *                produces the input artifact; it does not judge itself.
 *
 * Usage (from repo root):
 *
 *   node scripts/judge/issue-280.mjs run
 *
 * Outputs land under `.fixedflow/judge/issue-280/`:
 *
 *   unit.json     — vitest reporter output for the relevant test files
 *   chaos.json    — exit/stderr/elapsed of a clean-tmpdir spawn of
 *                   bin-session-start.cjs
 *   doctor.json   — abbreviated `teamagent doctor` JSON before vs. after
 *                   a deliberately broken hook script
 *   dump.json     — canonical roll-up consumed by the §V3 LLM judge
 *
 * The harness is intentionally dependency-free: only Node builtins +
 * pnpm/node child processes. It does not assert PASS/FAIL itself — the
 * LLM judge is the authoritative §V3 verdict per
 * docs/AGENTIC-CODING-POLICY.md §3.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const OUT_DIR = path.join(REPO_ROOT, ".fixedflow", "judge", "issue-280");
const ISO = () => new Date().toISOString();

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function writeJson(name, payload) {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  return file;
}

// ---------- §V1 Probe 1: unit ----------

function runUnitProbe() {
  const startedAt = ISO();
  const targets = [
    "packages/cli/src/__tests__/doctor.test.ts",
    "packages/adapters/src/llm/__tests__/claude-code-client.test.ts",
    "packages/cli/src/__tests__/bin-session-start-chaos.test.ts",
    "packages/cli/src/__tests__/hook-bundle-contract.test.ts",
  ];
  const reportFile = path.join(OUT_DIR, "_vitest-raw.json");
  // pnpm exec vitest run <files...> --reporter=json --outputFile=...
  // We capture vitest's own JSON so the LLM judge can introspect every
  // describe/it without re-running the suite.
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", ...targets, "--reporter=json", `--outputFile=${reportFile}`],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      windowsHide: true,
      shell: process.platform === "win32",
    },
  );
  let raw = null;
  if (fs.existsSync(reportFile)) {
    try { raw = JSON.parse(fs.readFileSync(reportFile, "utf-8")); }
    catch { raw = { parseError: "vitest report file existed but was not valid JSON" }; }
  }
  const payload = {
    probe: "unit",
    name: "vitest-run",
    targets,
    startedAt,
    finishedAt: ISO(),
    spawnStatus: result.status,
    spawnError: result.error ? String(result.error) : null,
    stdoutTail: (result.stdout ?? "").split("\n").slice(-20).join("\n"),
    stderrTail: (result.stderr ?? "").split("\n").slice(-20).join("\n"),
    rawReport: raw,
    passed:
      result.status === 0 &&
      raw &&
      typeof raw.numFailedTests === "number" &&
      raw.numFailedTests === 0,
  };
  writeJson("unit.json", payload);
  return payload;
}

// ---------- §V1 Probe 2: chaos ----------

async function runChaosProbe() {
  const startedAt = ISO();
  // Prefer the staged-style bundle (packages/teamagent/dist/) over the
  // cli-local dist, because that is what postinstall actually copies to
  // ~/.teamagent/hooks/. Fall back to the cli dist if teamagent dist is
  // not built (allows running the probe on a partial build).
  const candidates = [
    path.join(REPO_ROOT, "packages", "teamagent", "dist", "bin-session-start.cjs"),
    path.join(REPO_ROOT, "packages", "cli", "dist", "bin-session-start.cjs"),
  ];
  const binPath = candidates.find((p) => fs.existsSync(p));
  if (!binPath) {
    const payload = {
      probe: "chaos",
      name: "spawn-from-tmpdir",
      startedAt,
      finishedAt: ISO(),
      skipped: true,
      reason: "no bin-session-start.cjs found; build the cli or teamagent package first",
      passed: false,
    };
    writeJson("chaos.json", payload);
    return payload;
  }
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "issue-280-judge-chaos-"));
  const staged = path.join(stageRoot, path.basename(binPath));
  fs.copyFileSync(binPath, staged);

  const result = await new Promise((resolve) => {
    const env = { ...process.env };
    delete env["CLAUDE_PROJECT_DIR"];
    delete env["TEAMAGENT_ALLOW_BARE_SESSIONSTART"];
    const child = spawn(process.execPath, [staged], {
      cwd: stageRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env,
      windowsHide: true,
    });
    const t0 = Date.now();
    let stderr = "";
    let stdout = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGKILL"); } catch { /* dead */ }
      resolve({ exitCode: null, stderr, stdout, timedOut: true, elapsedMs: Date.now() - t0 });
    }, 15_000);
    child.stderr?.on("data", (d) => { stderr += d.toString("utf-8"); });
    child.stdout?.on("data", (d) => { stdout += d.toString("utf-8"); });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stderr, stdout, timedOut: false, spawnError: String(err), elapsedMs: Date.now() - t0 });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stderr, stdout, timedOut: false, elapsedMs: Date.now() - t0 });
    });
    child.stdin?.end();
  });

  const payload = {
    probe: "chaos",
    name: "spawn-from-tmpdir",
    startedAt,
    finishedAt: ISO(),
    binPath: path.relative(REPO_ROOT, binPath),
    stageRoot,
    exitCode: result.exitCode,
    timedOut: result.timedOut === true,
    spawnError: result.spawnError ?? null,
    elapsedMs: result.elapsedMs,
    stderrTail: (result.stderr ?? "").split("\n").slice(-10).join("\n"),
    stdoutTail: (result.stdout ?? "").split("\n").slice(-10).join("\n"),
    passed: result.exitCode === 0,
  };
  writeJson("chaos.json", payload);
  return payload;
}

// ---------- §V1 Probe 3: doctor ----------

function extractLeadingJson(stdout) {
  // doctor --json emits a single top-level object terminated by a newline
  // before any wrapper noise (pnpm ELIFECYCLE banner, deprecation notices,
  // etc.) can appear. Walk forward to find the matching brace, then parse
  // only that slice. Best-effort: if extraction fails, fall back to full
  // JSON.parse so callers see a structured failure rather than a silent null.
  if (!stdout) return null;
  const trimmed = stdout.replace(/^﻿/, "");
  const start = trimmed.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const slice = trimmed.slice(start, i + 1);
        try { return JSON.parse(slice); } catch { return null; }
      }
    }
  }
  // Unbalanced; try a raw parse as a last resort.
  try { return JSON.parse(trimmed); } catch { return null; }
}

function invokeCheckHookSpawn(scriptPath) {
  // Direct call into doctor.ts's `checkHookSpawn` via a small tsx-runnable
  // helper. Going through the full `teamagent doctor` command short-circuits
  // before reaching hook-spawn on a fresh tmpdir (knowledge.db precedes it
  // in the check chain and triggers an early return). Bypassing the outer
  // chain isolates the spawn-probe behavior, which is what the V4 judge
  // cares about.
  const helper = path.join(REPO_ROOT, "scripts", "judge", "run-hook-spawn-probe.mjs");
  const result = spawnSync(
    "node",
    ["--no-warnings", "--import", "tsx", helper, scriptPath],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      windowsHide: true,
    },
  );
  const parsed = extractLeadingJson(result.stdout ?? "");
  return {
    scriptPath,
    spawnStatus: result.status,
    spawnError: result.error ? String(result.error) : null,
    rawStdoutTail: (result.stdout ?? "").split("\n").slice(-5).join("\n"),
    rawStderrTail: (result.stderr ?? "").split("\n").slice(-5).join("\n"),
    parsed,
  };
}

function runDoctorProbe() {
  const startedAt = ISO();

  // Broken case: a .cjs that throws on `require()` of a missing module —
  // simulates the issue-280 failure mode without depending on a globally
  // installed teamagent. Expect status === "fail".
  const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-280-judge-broken-"));
  const brokenBin = path.join(brokenDir, "broken-session-start.cjs");
  fs.writeFileSync(brokenBin, "require('this-module-does-not-exist-issue-280');\n");

  // Fixed case: point at the freshly-built teamagent dist (or cli dist) —
  // the same bundle postinstall would stage. Expect status === "pass".
  const realBinCandidates = [
    path.join(REPO_ROOT, "packages", "teamagent", "dist", "bin-session-start.cjs"),
    path.join(REPO_ROOT, "packages", "cli", "dist", "bin-session-start.cjs"),
  ];
  const realBin = realBinCandidates.find((p) => fs.existsSync(p)) ?? null;

  const broken = invokeCheckHookSpawn(brokenBin);
  const fixed = realBin ? invokeCheckHookSpawn(realBin) : null;

  const payload = {
    probe: "doctor",
    name: "checkHookSpawn-direct",
    startedAt,
    finishedAt: ISO(),
    broken: {
      result: broken.parsed,
      spawnStatus: broken.spawnStatus,
      stdoutTail: broken.rawStdoutTail,
      stderrTail: broken.rawStderrTail,
    },
    fixed: fixed
      ? {
          binPath: path.relative(REPO_ROOT, realBin),
          result: fixed.parsed,
          spawnStatus: fixed.spawnStatus,
          stdoutTail: fixed.rawStdoutTail,
          stderrTail: fixed.rawStderrTail,
        }
      : { skipped: true, reason: "no bin-session-start.cjs found to use as the 'fixed' case" },
    // Mechanical pass: broken must be "fail", fixed (when present) must be "pass".
    passed:
      broken.parsed?.status === "fail" &&
      (fixed === null || fixed.parsed?.status === "pass"),
  };
  writeJson("doctor.json", payload);
  return payload;
}

// ---------- §V2 DUMP ----------

function writeDump(unit, chaos, doctorR) {
  const probes = [
    { name: "unit", passed: Boolean(unit.passed), details: { spawnStatus: unit.spawnStatus, numFailedTests: unit.rawReport?.numFailedTests ?? null, numTotalTests: unit.rawReport?.numTotalTests ?? null } },
    { name: "chaos", passed: Boolean(chaos.passed), details: { exitCode: chaos.exitCode, timedOut: chaos.timedOut, binPath: chaos.binPath ?? null } },
    { name: "doctor", passed: Boolean(doctorR.passed), details: { brokenHookSpawnStatus: doctorR.broken.result?.status ?? null, fixedHookSpawnStatus: doctorR.fixed?.result?.status ?? null } },
  ];
  const dump = {
    issue: 280,
    ranAt: ISO(),
    host: os.hostname(),
    platform: process.platform,
    nodeVersion: process.version,
    probes,
    overall: probes.every((p) => p.passed),
    expectedSchema: "issue-280/v1",
    judgePromptHint:
      "You are evaluating whether the implementation of FIXEDFLOW issue #280 satisfies its grill plan. " +
      "Read each probe's mechanical `passed` and decide whether it is trustworthy or masks a regression. " +
      "Return strict JSON: { verdict: 'pass'|'fail'|'uncertain', rationale: string, concerns: string[], " +
      "reproCommand: 'node scripts/judge/issue-280.mjs run', counterExampleInputs: string[], " +
      "judgedAt: <ISO>, judgeModel: <name> }.",
  };
  return writeJson("dump.json", dump);
}

// ---------- entry ----------

async function main() {
  const cmd = process.argv[2] ?? "run";
  if (cmd !== "run") {
    process.stderr.write(`unknown command: ${cmd}\n`);
    process.stderr.write("usage: node scripts/judge/issue-280.mjs run\n");
    process.exit(2);
  }
  ensureOutDir();
  process.stdout.write(`[issue-280 judge] writing to ${OUT_DIR}\n`);
  process.stdout.write("[issue-280 judge] probe 1: unit\n");
  const unit = runUnitProbe();
  process.stdout.write(`  passed=${unit.passed}\n`);
  process.stdout.write("[issue-280 judge] probe 2: chaos\n");
  const chaos = await runChaosProbe();
  process.stdout.write(`  passed=${chaos.passed} exitCode=${chaos.exitCode}\n`);
  process.stdout.write("[issue-280 judge] probe 3: doctor\n");
  const doctorR = runDoctorProbe();
  process.stdout.write(`  passed=${doctorR.passed}\n`);
  const dumpFile = writeDump(unit, chaos, doctorR);
  process.stdout.write(`[issue-280 judge] dump written: ${dumpFile}\n`);
  process.stdout.write(`[issue-280 judge] overall mechanical pass: ${unit.passed && chaos.passed && doctorR.passed}\n`);
  process.stdout.write("[issue-280 judge] feed dump.json to an LLM judge per §V3 in judge.md\n");
}

main().catch((err) => {
  process.stderr.write(`[issue-280 judge] fatal: ${err && err.stack ? err.stack : String(err)}\n`);
  process.exit(1);
});
