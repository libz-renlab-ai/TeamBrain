import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface MigrateAutoOptions {
  /** 注入 spawn（测试用），返回 0=ok。 */
  runStep?: (binPath: string, cmd: string) => Promise<number>;
}

export interface MigrateAutoResult {
  ok: boolean;
  steps: { cmd: string; code: number }[];
  error?: string;
}

const STEPS = ["migrate-v6", "migrate-v7"] as const;

/**
 * Resolve the CLI bin path. Production builds publish `bin.js` next to this
 * file; dev/tsx runs do not produce a `.js` artifact so we fall back to
 * `bin.ts` and the caller's interpreter (process.execPath via tsx loader).
 *
 * B-148: previously hard-coded to `bin.js`, which made every dev-mode run of
 * `migrate-auto` fail with a misleading `step migrate-v6 exit 1` error
 * because the child spawn could not find `bin.js`. We now detect the
 * available artifact and report a precise error if neither is present.
 */
function resolveBinPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const binJs = path.resolve(here, "..", "bin.js");
  if (existsSync(binJs)) return binJs;
  const binTs = path.resolve(here, "..", "bin.ts");
  if (existsSync(binTs)) return binTs;
  // Last resort: argv[1] points at whatever brought us here (tsx / direct js).
  return process.argv[1] ?? binJs;
}

export async function runMigrateAuto(opts: MigrateAutoOptions = {}): Promise<MigrateAutoResult> {
  const binPath = resolveBinPath();
  const runStep = opts.runStep ?? defaultRunStep;
  const steps: { cmd: string; code: number }[] = [];
  for (const cmd of STEPS) {
    const code = await runStep(binPath, cmd);
    steps.push({ cmd, code });
    if (code !== 0) {
      return {
        ok: false,
        steps,
        error: `step ${cmd} exit ${code} (binPath=${binPath})`,
      };
    }
  }
  return { ok: true, steps };
}

function defaultRunStep(binPath: string, cmd: string): Promise<number> {
  return new Promise((resolve) => {
    // For .ts entry points spawn through tsx; for .js spawn process.execPath directly.
    const isTs = binPath.endsWith(".ts");
    const args = isTs
      ? ["--import", "tsx/esm", binPath, cmd]
      : [binPath, cmd];
    const child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}
