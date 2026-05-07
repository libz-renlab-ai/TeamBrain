import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";

export interface WizardOpts {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  isTTY?: boolean;
  now?: () => number;
  homeDir?: string;
  spawnImpl?: (cmd: string, args: string[]) => Promise<number>;
}

interface FirstRunState {
  version: 1;
  completedSteps: string[];
  lastRunAt: number;
}

const STEPS: readonly string[] = ["skeleton-demo", "stats", "--help"];

function readState(homeDir: string): FirstRunState {
  const stateFile = path.join(homeDir, ".teamagent", "first-run-state.json");
  try {
    const raw = fs.readFileSync(stateFile, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.completedSteps)) {
      return parsed as FirstRunState;
    }
  } catch {
    // missing or invalid — treat as empty
  }
  return { version: 1, completedSteps: [], lastRunAt: 0 };
}

function writeState(homeDir: string, state: FirstRunState): void {
  const dir = path.join(homeDir, ".teamagent");
  fs.mkdirSync(dir, { recursive: true });
  const stateFile = path.join(dir, "first-run-state.json");
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
}

function nextStep(completedSteps: string[]): string {
  for (const step of STEPS) {
    if (!completedSteps.includes(step)) return step;
  }
  return "stats";
}

function defaultSpawn(cmd: string, args: string[]): Promise<number> {
  // Use process.argv[1] (the current entry script) so this works in both
  // dev (tsx src/bin.ts) and prod (node dist/bin.js) without hardcoding a bin name.
  const entry = process.argv[1] ?? "teamagent";
  return new Promise((resolve) => {
    const child = entry.endsWith(".ts")
      ? spawn("npx", ["tsx", entry, cmd, ...args], { stdio: "inherit" })
      : spawn(process.execPath, [entry, cmd, ...args], { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}

function writeOut(out: NodeJS.WritableStream, text: string): void {
  out.write(text);
}

function renderMenu(out: NodeJS.WritableStream, state: FirstRunState): void {
  if (state.completedSteps.length > 0) {
    const last = state.completedSteps[state.completedSteps.length - 1];
    const next = nextStep(state.completedSteps);
    writeOut(out, `上次你跑了 ${last}，要不要试试 ${next}？\n\n`);
  }

  writeOut(out, `✅ 装好啦 🎉  欢迎使用 TeamAgent！\n\n`);
  writeOut(out, `你可以立刻试试下面这 3 件事：\n\n`);
  writeOut(out, `  1) skeleton-demo  ——  跑一次最小演示，看看 TeamAgent 怎么工作\n`);
  writeOut(out, `  2) stats          ——  查看当前知识库里有多少条经验\n`);
  writeOut(out, `  3) --help         ——  看所有可用命令\n\n`);
}

export async function runFirstRunWizard(opts: WizardOpts = {}): Promise<void> {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const isTTY = opts.isTTY ?? (process.stdin as NodeJS.ReadStream).isTTY;
  const now = opts.now ?? (() => Date.now());
  const homeDir = opts.homeDir ?? os.homedir();
  const spawnImpl = opts.spawnImpl ?? defaultSpawn;

  const state = readState(homeDir);
  renderMenu(stdout, state);

  if (!isTTY) {
    return;
  }

  const choiceMap: Record<string, string> = {
    "1": "skeleton-demo",
    "2": "stats",
    "3": "--help",
  };

  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: false });

  // Buffer lines as they arrive so we don't miss rapid input
  const lineQueue: string[] = [];
  const lineWaiters: Array<(line: string) => void> = [];

  rl.on("line", (line) => {
    const waiter = lineWaiters.shift();
    if (waiter) {
      waiter(line.trim());
    } else {
      lineQueue.push(line.trim());
    }
  });

  const readLine = (): Promise<string> =>
    new Promise((resolve) => {
      const queued = lineQueue.shift();
      if (queued !== undefined) {
        resolve(queued);
      } else {
        lineWaiters.push(resolve);
      }
    });

  let choice: string | undefined;
  const maxAttempts = 3;

  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    writeOut(stdout, `选择 1 / 2 / 3 + Enter (Ctrl+C 退出): `);
    const input = await readLine();
    if (choiceMap[input]) {
      choice = choiceMap[input];
      break;
    }
    const remaining = maxAttempts - attempts - 1;
    if (remaining > 0) {
      writeOut(stdout, `请输入 1、2 或 3。剩余尝试次数：${remaining}\n`);
    }
  }

  rl.close();

  if (!choice) {
    process.stderr.write("无效输入，已退出。请输入 1、2 或 3。\n");
    process.exit(1);
    return;
  }

  const exitCode = await spawnImpl(choice, []);

  if (exitCode === 0) {
    if (!state.completedSteps.includes(choice)) {
      state.completedSteps.push(choice);
    }
    state.lastRunAt = now();
    writeState(homeDir, state);
  }

  process.exit(exitCode);
}
