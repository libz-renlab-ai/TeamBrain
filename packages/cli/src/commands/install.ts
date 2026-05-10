import { spawn as nodeSpawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkpoint,
  isStepDone,
  resolveProjectId,
  type StepKey,
} from "@teamagent/core/install-state";
import type { InstallStateStore } from "@teamagent/ports";
import { FsInstallStateStore } from "../install-state-fs-store.js";
import { defaultWarmupStatePath, writeInitialPlaceholder } from "../warmup-state.js";
import {
  formatInstallManifest,
  renderInstallManifest,
  type InstallArgs,
} from "./install-manifest.js";

type Awaitable<T> = T | Promise<T>;

export interface InstallStepOutcome {
  id: StepKey;
  label: string;
  status: "ran" | "skipped";
  detail: string;
}

export interface WarmupLaunchResult {
  ok: boolean;
  pid: number | null;
  detail: string;
  stateFile?: string;
  logFile?: string;
}

export interface InstallHealthResult {
  status: "ok" | "fail";
  hooks: boolean;
  kb: boolean;
  model: true | "warmup-pending";
}

export interface InstallResult {
  ok: boolean;
  refused: boolean;
  output: string;
  promptCount: number;
  steps: InstallStepOutcome[];
  warmup: WarmupLaunchResult | null;
  health: InstallHealthResult | null;
}

export interface InstallDeps {
  installHook: () => Awaitable<{ settingsPath: string; alreadyInstalled: boolean }>;
  installPlugins: () => Promise<{ ok: boolean; summary?: unknown }>;
  installUserHook: () => Awaitable<{ settingsPath: string; alreadyInstalled: boolean }>;
  healthCheck: () => Promise<InstallHealthResult>;
  warmup: () => Promise<WarmupLaunchResult>;
  confirm: (question: string) => Promise<boolean>;
  store: InstallStateStore;
  projectId: string;
}

const INSTALL_STEPS: Array<{
  id: StepKey;
  label: string;
  run: (deps: InstallDeps) => Promise<string>;
}> = [
  {
    id: "hook-write",
    label: "Installing hooks",
    run: async (deps) => {
      const result = await deps.installHook();
      return result.alreadyInstalled
        ? `already installed at ${result.settingsPath}`
        : `registered at ${result.settingsPath}`;
    },
  },
  {
    id: "plugin-copy",
    label: "Installing plugins",
    run: async (deps) => {
      const result = await deps.installPlugins();
      if (!result.ok) throw new Error("install-plugins failed");
      return "plugins installed or already present";
    },
  },
  {
    id: "config-write",
    label: "Installing user hook",
    run: async (deps) => {
      const result = await deps.installUserHook();
      return result.alreadyInstalled
        ? `already installed at ${result.settingsPath}`
        : `registered at ${result.settingsPath}`;
    },
  },
];

export function renderInstallHelp(): string {
  return [
    "Usage: teamagent install [--preview] [--yes|-y] [--non-interactive]",
    "",
    "Options:",
    "  --preview          Print the install manifest and exit without writes",
    "  --yes, -y          Accept the single install permission prompt",
    "  --non-interactive  CI alias for --yes; still emits the prompt line once",
    "  --help, -h         Show this help",
    "",
    "Vector model warmup runs detached after install; no foreground skip flag is exposed.",
  ].join("\n") + "\n";
}

export function createDefaultInstallDeps(opts: {
  cwd?: string;
  homeDir?: string;
  args?: InstallArgs;
} = {}): InstallDeps {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os.homedir();
  return {
    installHook: async () => {
      const { installHook } = await import("./install-hook.js");
      return installHook({ cwd, homeDir });
    },
    installPlugins: async () => {
      const { executeInstallPlugins } = await import("./install-plugins.js");
      return executeInstallPlugins();
    },
    installUserHook: async () => {
      const { installUserHook } = await import("./install-user-hook.js");
      return installUserHook({ homeDir });
    },
    healthCheck: async () => {
      const { executeDoctor } = await import("./doctor.js");
      const result = await executeDoctor({ cwd, homeDir });
      return {
        status: "ok",
        hooks: result.checks.some((c) => c.name === "hook-registered" && c.status === "pass"),
        kb: result.checks.some((c) => c.name === "knowledge-db" && c.status === "pass"),
        model: "warmup-pending",
      };
    },
    warmup: () => spawnDetachedWarmup(homeDir),
    confirm: (question) => confirmPrompt(question, opts.args),
    store: new FsInstallStateStore({ rootDir: path.join(homeDir, ".teamagent") }),
    projectId: resolveProjectId(cwd),
  };
}

export async function runInstall(
  args: InstallArgs,
  deps: InstallDeps = createDefaultInstallDeps({ args }),
): Promise<InstallResult> {
  const lines: string[] = [];
  lines.push(formatInstallManifest(renderInstallManifest()).trimEnd());
  lines.push("");

  const question = "Install TeamAgent hooks and knowledge base? (Y/n)";
  lines.push(question);
  const accepted = await deps.confirm(question);
  const promptCount = 1;
  if (!accepted) {
    lines.push("Install refused; no files were written.");
    return {
      ok: false,
      refused: true,
      output: lines.join("\n") + "\n",
      promptCount,
      steps: [],
      warmup: null,
      health: null,
    };
  }

  const state = await deps.store.load(deps.projectId);
  const firstPendingIndex = INSTALL_STEPS.findIndex((s) => !state || !isStepDone(state, s.id));
  if (state && firstPendingIndex > 0) {
    lines.push(`Resuming from step [${firstPendingIndex + 1}/${INSTALL_STEPS.length}]...`);
  }

  const steps: InstallStepOutcome[] = [];
  for (let i = 0; i < INSTALL_STEPS.length; i++) {
    const step = INSTALL_STEPS[i]!;
    const latest = await deps.store.load(deps.projectId);
    if (latest && isStepDone(latest, step.id)) {
      lines.push(`▶ [${i + 1}/${INSTALL_STEPS.length}] ${step.label}... skipped`);
      steps.push({ id: step.id, label: step.label, status: "skipped", detail: "checkpoint exists" });
      continue;
    }
    lines.push(`▶ [${i + 1}/${INSTALL_STEPS.length}] ${step.label}...`);
    const detail = await step.run(deps);
    await checkpoint(deps.store, deps.projectId, step.id);
    lines.push(`  ✓ ${detail}`);
    steps.push({ id: step.id, label: step.label, status: "ran", detail });
  }

  const warmup = await deps.warmup();
  const warmupPid = warmup.pid === null ? "?" : String(warmup.pid);
  lines.push(`▶ Spawning vector-model warmup in background (pid ${warmupPid}; parent returns immediately)`);
  if (!warmup.ok) lines.push(`  warmup launch warning: ${warmup.detail}`);

  const health = await deps.healthCheck();
  lines.push("");
  lines.push("✓ Install complete.");
  lines.push("");
  lines.push("Auto health check:");
  lines.push(JSON.stringify(health));

  return {
    ok: true,
    refused: false,
    output: lines.join("\n") + "\n",
    promptCount,
    steps,
    warmup,
    health,
  };
}

async function confirmPrompt(question: string, args: InstallArgs | undefined): Promise<boolean> {
  if (args?.yes || args?.nonInteractive) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} `)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function spawnDetachedWarmup(homeDir: string): Promise<WarmupLaunchResult> {
  const stateFile = defaultWarmupStatePath(homeDir);
  const teamagentDir = path.dirname(stateFile);
  fs.mkdirSync(teamagentDir, { recursive: true });
  writeInitialPlaceholder(stateFile, "Xenova/multilingual-e5-small");

  const entry = resolveCliEntry();
  if (!entry) {
    return {
      ok: false,
      pid: null,
      detail: "CLI entry not resolvable; run `teamagent warmup` manually",
      stateFile,
    };
  }

  const logFile = path.join(teamagentDir, "warmup.log");
  const fd = fs.openSync(logFile, "a");
  try {
    const child = nodeSpawn(process.execPath, [entry, "warmup", "--write-state", stateFile], {
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    child.unref();
    return {
      ok: true,
      pid: child.pid ?? null,
      detail: `state=${stateFile} log=${logFile}`,
      stateFile,
      logFile,
    };
  } catch (err) {
    return {
      ok: false,
      pid: null,
      detail: `spawn failed: ${String(err).slice(0, 120)}`,
      stateFile,
      logFile,
    };
  } finally {
    try { fs.closeSync(fd); } catch { /* child inherited it */ }
  }
}

function resolveCliEntry(): string | undefined {
  const argvEntry = process.argv[1];
  if (argvEntry && (argvEntry.endsWith("bin.js") || argvEntry.endsWith("bin.cjs"))) {
    return argvEntry;
  }
  const here = fileURLToPath(import.meta.url);
  let dir = path.dirname(here);
  for (let i = 0; i < 8; i++) {
    const bundled = path.join(dir, "bin.js");
    if (fs.existsSync(bundled)) return bundled;
    const teamagentDist = path.join(dir, "packages", "teamagent", "dist", "bin.js");
    if (fs.existsSync(teamagentDist)) return teamagentDist;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}
