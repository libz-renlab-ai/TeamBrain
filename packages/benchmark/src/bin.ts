#!/usr/bin/env node
import path from "node:path";
import { existsSync } from "node:fs";
import { loadTasks } from "./task-loader.js";
import { createGroupWorkdir, cleanupGroupWorkdir } from "./isolator.js";
import { ClaudeSdkRunner } from "./sdk-runner.js";
import { runTask } from "./runner.js";
import { aggregate, writeJson, writeMarkdown } from "./reporter.js";
import type { BenchmarkConfig, GroupConfig, TaskResult } from "./types.js";

function parseArgs(argv: string[]): BenchmarkConfig {
  const args = new Map<string, string>();
  for (const a of argv) {
    const m = /^--(\w[\w-]*)=(.+)$/.exec(a);
    if (m) args.set(m[1]!, m[2]!);
  }
  return {
    groups: (args.get("groups") ?? "baseline,teamagent").split(","),
    tasks: args.get("tasks") ?? "all",
    runs: Number(args.get("runs") ?? "1"),
    outputJson: args.get("output-json") ?? "bench-report.json",
    outputMarkdown: args.get("output-md") ?? "bench-report.md",
  };
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const fixturesDir = path.resolve(import.meta.dirname, "..", "fixtures");
  const hookDir = path.join(repoRoot, "packages", "cli", "dist");
  const tasksGlob = config.tasks === "all"
    ? path.join(fixturesDir, "tasks", "*.json")
    : path.join(fixturesDir, "tasks", `${config.tasks}*.json`);

  // teamagent-disabled has the same install footprint as teamagent
  // (issue-343 PR-2: kill-switch tested with the env, not by removing hooks).
  if (config.groups.includes("teamagent") || config.groups.includes("teamagent-disabled")) {
    const required = ["bin-pre-tool-use.cjs", "bin-post-tool-use.cjs", "bin-user-prompt-submit.cjs"];
    for (const f of required) {
      if (!existsSync(path.join(hookDir, f))) {
        console.error(`ERROR: hook bundle missing: ${f}\nRun: pnpm --filter @teamagent/cli build:hook`);
        process.exit(1);
      }
    }
  }

  const tasks = await loadTasks(tasksGlob);
  if (tasks.length === 0) {
    console.error(`ERROR: no tasks loaded from glob: ${tasksGlob}`);
    process.exit(1);
  }
  console.log(`Loaded ${tasks.length} tasks; ${config.groups.length} groups × ${config.runs} runs = ${tasks.length * config.groups.length * config.runs} invocations`);

  const sdk = new ClaudeSdkRunner();
  const allResults: TaskResult[] = [];
  let stepIdx = 0;
  const totalSteps = tasks.length * config.groups.length * config.runs;

  for (const groupName of config.groups) {
    const groupCfg: GroupConfig = { name: groupName, fixtureDir: path.join(fixturesDir, "groups", groupName) };
    let workdir: string;
    try {
      workdir = await createGroupWorkdir(groupCfg, hookDir);
    } catch (e) {
      console.error(`Failed to create workdir for ${groupName}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    console.log(`Group ${groupName} workdir: ${workdir}`);

    // issue-343 PR-2: the `teamagent-disabled` group is the same install
    // footprint as `teamagent` but with TEAMAGENT_DISABLED=1 set in the
    // parent process. The Claude Agent SDK spawns hooks as subprocesses;
    // Node child_process inherits parent env, so PR-1's master kill switch
    // fires and all 8 hook handlers early-return. Restored in finally so
    // env never leaks into a later group's run.
    const envWasSet = process.env.TEAMAGENT_DISABLED;
    if (groupName === "teamagent-disabled") {
      process.env.TEAMAGENT_DISABLED = "1";
    }

    try {
      for (const task of tasks) {
        for (let run = 1; run <= config.runs; run++) {
          stepIdx++;
          const useColor = process.env.BENCH_NO_COLOR !== "1" && process.stdout.isTTY !== false;
          const col = (s: string, code: string) => useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
          const badge =
            groupName === "teamagent" ? col(" TEAMAGENT ", "1;44") :
            groupName === "teamagent-disabled" ? col(" TB-OFF    ", "1;45") :
            col(" BASELINE  ", "1;47;30");
          process.stdout.write(`\n${badge} [${stepIdx}/${totalSteps}] ${task.id} run=${run}\n`);
          const r = await runTask(task, groupCfg, sdk, workdir, run);
          allResults.push(r);
          const vColor = r.verdict === "correct" ? "1;32" : r.verdict === "wrong" ? "1;31" : "1;33";
          process.stdout.write(`  ${col("→ " + r.verdict.toUpperCase(), vColor)} ${col(`(${r.durationMs}ms)`, "90")}\n`);
        }
      }
    } finally {
      if (groupName === "teamagent-disabled") {
        if (envWasSet === undefined) delete process.env.TEAMAGENT_DISABLED;
        else process.env.TEAMAGENT_DISABLED = envWasSet;
      }
    }
    cleanupGroupWorkdir(workdir);
  }

  const report = aggregate(allResults, config);
  writeJson(report, config.outputJson);
  writeMarkdown(report, config.outputMarkdown);
  console.log(`\nReport written: ${config.outputJson} + ${config.outputMarkdown}`);
  console.log(`PRR: ${(report.comparison.prr * 100).toFixed(1)}%`);

  if (allResults.length > 0 && allResults.every((r) => r.verdict === "error")) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(2); });
