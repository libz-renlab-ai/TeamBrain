import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface MigrateAutoOptions {
  /** 注入 spawn（测试用），返回 0=ok。 */
  runStep?: (binJs: string, cmd: string) => Promise<number>;
}

export interface MigrateAutoResult {
  ok: boolean;
  steps: { cmd: string; code: number }[];
  error?: string;
}

const STEPS = ["migrate-v6", "migrate-v7"] as const;

export async function runMigrateAuto(opts: MigrateAutoOptions = {}): Promise<MigrateAutoResult> {
  const binJs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin.js");
  const runStep = opts.runStep ?? defaultRunStep;
  const steps: { cmd: string; code: number }[] = [];
  for (const cmd of STEPS) {
    const code = await runStep(binJs, cmd);
    steps.push({ cmd, code });
    if (code !== 0) {
      return { ok: false, steps, error: `step ${cmd} exit ${code}` };
    }
  }
  return { ok: true, steps };
}

function defaultRunStep(binJs: string, cmd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [binJs, cmd], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}
