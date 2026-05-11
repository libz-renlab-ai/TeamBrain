#!/usr/bin/env node
/**
 * Issue #280 V4 helper: invoke `checkHookSpawn(scriptPath)` directly so
 * the judge harness can observe its DoctorCheckResult independent of the
 * other doctor checks (which short-circuit on a fresh tmpdir without a
 * knowledge.db).
 *
 * Usage: node --import tsx scripts/judge/run-hook-spawn-probe.mjs <hookScriptPath>
 *
 * Prints exactly one line of JSON: the DoctorCheckResult shape.
 */

import { checkHookSpawn } from "../../packages/cli/src/commands/doctor.ts";

const scriptPath = process.argv[2];
if (!scriptPath) {
  process.stderr.write("usage: node --import tsx scripts/judge/run-hook-spawn-probe.mjs <hookScriptPath>\n");
  process.exit(2);
}

const result = await checkHookSpawn(scriptPath);
process.stdout.write(JSON.stringify(result) + "\n");
