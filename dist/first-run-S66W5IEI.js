import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/first-run.ts
init_esm_shims();
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { spawn } from "child_process";
var STEPS = ["skeleton-demo", "stats", "--help"];
function readState(homeDir) {
  const stateFile = path.join(homeDir, ".teamagent", "first-run-state.json");
  try {
    const raw = fs.readFileSync(stateFile, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.completedSteps)) {
      return parsed;
    }
  } catch {
  }
  return { version: 1, completedSteps: [], lastRunAt: 0 };
}
function writeState(homeDir, state) {
  const dir = path.join(homeDir, ".teamagent");
  fs.mkdirSync(dir, { recursive: true });
  const stateFile = path.join(dir, "first-run-state.json");
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
}
function nextStep(completedSteps) {
  for (const step of STEPS) {
    if (!completedSteps.includes(step)) return step;
  }
  return "stats";
}
function defaultSpawn(cmd, args) {
  const entry = process.argv[1] ?? "teamagent";
  return new Promise((resolve) => {
    const child = entry.endsWith(".ts") ? spawn("npx", ["tsx", entry, cmd, ...args], { stdio: "inherit" }) : spawn(process.execPath, [entry, cmd, ...args], { stdio: "inherit" });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
}
function writeOut(out, text) {
  out.write(text);
}
function renderMenu(out, state) {
  if (state.completedSteps.length > 0) {
    const last = state.completedSteps[state.completedSteps.length - 1];
    const next = nextStep(state.completedSteps);
    writeOut(out, `\u4E0A\u6B21\u4F60\u8DD1\u4E86 ${last}\uFF0C\u8981\u4E0D\u8981\u8BD5\u8BD5 ${next}\uFF1F

`);
  }
  writeOut(out, `\u2705 \u88C5\u597D\u5566 \u{1F389}  \u6B22\u8FCE\u4F7F\u7528 TeamAgent\uFF01

`);
  writeOut(out, `\u4F60\u53EF\u4EE5\u7ACB\u523B\u8BD5\u8BD5\u4E0B\u9762\u8FD9 3 \u4EF6\u4E8B\uFF1A

`);
  writeOut(out, `  1) skeleton-demo  \u2014\u2014  \u8DD1\u4E00\u6B21\u6700\u5C0F\u6F14\u793A\uFF0C\u770B\u770B TeamAgent \u600E\u4E48\u5DE5\u4F5C
`);
  writeOut(out, `  2) stats          \u2014\u2014  \u67E5\u770B\u5F53\u524D\u77E5\u8BC6\u5E93\u91CC\u6709\u591A\u5C11\u6761\u7ECF\u9A8C
`);
  writeOut(out, `  3) --help         \u2014\u2014  \u770B\u6240\u6709\u53EF\u7528\u547D\u4EE4

`);
}
async function runFirstRunWizard(opts = {}) {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const isTTY = opts.isTTY ?? process.stdin.isTTY;
  const now = opts.now ?? (() => Date.now());
  const homeDir = opts.homeDir ?? os.homedir();
  const spawnImpl = opts.spawnImpl ?? defaultSpawn;
  const state = readState(homeDir);
  renderMenu(stdout, state);
  if (!isTTY) {
    return;
  }
  const choiceMap = {
    "1": "skeleton-demo",
    "2": "stats",
    "3": "--help"
  };
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: false });
  const lineQueue = [];
  const lineWaiters = [];
  rl.on("line", (line) => {
    const waiter = lineWaiters.shift();
    if (waiter) {
      waiter(line.trim());
    } else {
      lineQueue.push(line.trim());
    }
  });
  const readLine = () => new Promise((resolve) => {
    const queued = lineQueue.shift();
    if (queued !== void 0) {
      resolve(queued);
    } else {
      lineWaiters.push(resolve);
    }
  });
  let choice;
  const maxAttempts = 3;
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    writeOut(stdout, `\u9009\u62E9 1 / 2 / 3 + Enter (Ctrl+C \u9000\u51FA): `);
    const input = await readLine();
    if (choiceMap[input]) {
      choice = choiceMap[input];
      break;
    }
    const remaining = maxAttempts - attempts - 1;
    if (remaining > 0) {
      writeOut(stdout, `\u8BF7\u8F93\u5165 1\u30012 \u6216 3\u3002\u5269\u4F59\u5C1D\u8BD5\u6B21\u6570\uFF1A${remaining}
`);
    }
  }
  rl.close();
  if (!choice) {
    process.stderr.write("\u65E0\u6548\u8F93\u5165\uFF0C\u5DF2\u9000\u51FA\u3002\u8BF7\u8F93\u5165 1\u30012 \u6216 3\u3002\n");
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
export {
  runFirstRunWizard
};
