import { describe, expect, it } from "vitest";
import { InMemoryInstallStateStore } from "@teamagent/ports/contracts";
import type { InstallArgs } from "../commands/install-manifest.js";
import {
  renderInstallHelp,
  runInstall,
  type InstallDeps,
  type InstallHealthResult,
  type WarmupLaunchResult,
} from "../commands/install.js";

function args(overrides: Partial<InstallArgs> = {}): InstallArgs {
  return {
    preview: false,
    yes: false,
    nonInteractive: false,
    help: false,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<InstallDeps> = {}): {
  deps: InstallDeps;
  calls: string[];
} {
  const calls: string[] = [];
  const health: InstallHealthResult = {
    status: "ok",
    hooks: true,
    kb: true,
    model: "warmup-pending",
  };
  const warmup: WarmupLaunchResult = {
    ok: true,
    pid: 12345,
    detail: "detached=true unref=true",
    stateFile: "/tmp/.warmup-state.json",
  };
  const deps: InstallDeps = {
    installHook: () => {
      calls.push("hook");
      return { settingsPath: "/tmp/project/.claude/settings.local.json", alreadyInstalled: false };
    },
    installPlugins: async () => {
      calls.push("plugins");
      return { ok: true };
    },
    installUserHook: () => {
      calls.push("user-hook");
      return { settingsPath: "/tmp/home/.claude/settings.json", alreadyInstalled: false };
    },
    healthCheck: async () => {
      calls.push("health");
      return health;
    },
    warmup: async () => {
      calls.push("warmup");
      return warmup;
    },
    confirm: async () => {
      calls.push("confirm");
      return true;
    },
    store: new InMemoryInstallStateStore(),
    projectId: "p_install",
    ...overrides,
  };
  return { deps, calls };
}

describe("runInstall", () => {
  it("fires exactly one consolidated prompt", async () => {
    let prompts = 0;
    const { deps } = makeDeps({
      confirm: async () => {
        prompts++;
        return true;
      },
    });
    const result = await runInstall(args(), deps);
    expect(result.ok).toBe(true);
    expect(result.promptCount).toBe(1);
    expect(prompts).toBe(1);
  });

  it("prints manifest sections before the prompt", async () => {
    const { deps } = makeDeps();
    const result = await runInstall(args(), deps);
    const configLine = result.output.indexOf("[config]");
    const promptLine = result.output.indexOf("Install TeamAgent hooks and knowledge base? (Y/n)");
    expect(configLine).toBeGreaterThanOrEqual(0);
    expect(promptLine).toBeGreaterThan(configLine);
    expect(result.output).toMatch(/\[config\].*\[skills\].*\[kb\].*\[download\].*\[refusal\]/s);
  });

  it("does not write when the consolidated prompt is refused", async () => {
    const { deps, calls } = makeDeps({
      confirm: async () => {
        calls.push("confirm");
        return false;
      },
    });
    const result = await runInstall(args(), deps);
    expect(result.ok).toBe(false);
    expect(result.refused).toBe(true);
    expect(calls).toEqual(["confirm"]);
    expect(result.output).toContain("Install refused");
  });

  it("spawns vector-model warmup after foreground steps without awaiting model readiness", async () => {
    const { deps, calls } = makeDeps();
    const result = await runInstall(args(), deps);
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["confirm", "hook", "plugins", "user-hook", "warmup", "health"]);
    expect(result.warmup).toMatchObject({ ok: true, pid: 12345 });
    expect(result.output).toContain("parent returns immediately");
  });

  it("resumes from checkpoint and does not rerun completed steps", async () => {
    const store = new InMemoryInstallStateStore();
    const first = makeDeps({
      store,
      projectId: "p_resume",
      installPlugins: async () => {
        throw new Error("interrupt at step 2");
      },
    });
    await expect(runInstall(args(), first.deps)).rejects.toThrow("interrupt at step 2");
    expect(first.calls).toEqual(["confirm", "hook"]);

    const second = makeDeps({ store, projectId: "p_resume" });
    const result = await runInstall(args(), second.deps);
    expect(result.ok).toBe(true);
    expect(second.calls).toEqual(["confirm", "plugins", "user-hook", "warmup", "health"]);
    expect(result.output).toContain("Resuming from step [2/3]");
    expect(result.steps[0]).toMatchObject({ id: "hook-write", status: "skipped" });
  });

  it("appends strict JSON health-check tail", async () => {
    const { deps } = makeDeps();
    const result = await runInstall(args(), deps);
    expect(result.output).toContain("Auto health check:");
    expect(result.output).toContain('{"status":"ok","hooks":true,"kb":true,"model":"warmup-pending"}');
  });

  it("help contains no vector-model skip flag", () => {
    const help = renderInstallHelp();
    expect(help).toContain("Usage: teamagent install");
    expect(help).not.toMatch(/--skip-(vector-)?model/);
  });
});
