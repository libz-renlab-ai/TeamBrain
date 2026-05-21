import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/migrate-auto.ts
init_esm_shims();
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
var STEPS = ["migrate-v6", "migrate-v7"];
function resolveBinPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const binJs = path.resolve(here, "..", "bin.js");
  if (existsSync(binJs)) return binJs;
  const binTs = path.resolve(here, "..", "bin.ts");
  if (existsSync(binTs)) return binTs;
  return process.argv[1] ?? binJs;
}
async function runMigrateAuto(opts = {}) {
  const binPath = resolveBinPath();
  const runStep = opts.runStep ?? defaultRunStep;
  const steps = [];
  for (const cmd of STEPS) {
    const code = await runStep(binPath, cmd);
    steps.push({ cmd, code });
    if (code !== 0) {
      return {
        ok: false,
        steps,
        error: `step ${cmd} exit ${code} (binPath=${binPath})`
      };
    }
  }
  return { ok: true, steps };
}
function defaultRunStep(binPath, cmd) {
  return new Promise((resolve) => {
    const isTs = binPath.endsWith(".ts");
    const args = isTs ? ["--import", "tsx/esm", binPath, cmd] : [binPath, cmd];
    const child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}
export {
  runMigrateAuto
};
