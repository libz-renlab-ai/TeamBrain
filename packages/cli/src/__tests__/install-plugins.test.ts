import { describe, it, expect } from "vitest";
import {
  executeInstallPlugins,
  parseInstallPluginsArgs,
  renderInstallPluginsResult,
  type InstallPluginsResult,
} from "../commands/install-plugins.js";
import type {
  ClaudePluginInstaller,
  StepOutcome,
} from "@teamagent/adapters";
import type { MarketplaceSpec, PluginSpec } from "@teamagent/core";
import { DEFAULT_MARKETPLACES, DEFAULT_PLUGINS } from "@teamagent/core";

function fakeInstaller(
  behavior: {
    marketplace?: (m: MarketplaceSpec) => StepOutcome;
    plugin?: (p: PluginSpec) => StepOutcome;
  } = {},
): ClaudePluginInstaller {
  return {
    addMarketplace: async (m: MarketplaceSpec) =>
      behavior.marketplace?.(m) ?? { status: "added", detail: `added ${m.name}` },
    installPlugin: async (p: PluginSpec) =>
      behavior.plugin?.(p) ?? {
        status: "added",
        detail: `installed ${p.plugin}@${p.marketplace}`,
      },
  } as unknown as ClaudePluginInstaller;
}

describe("parseInstallPluginsArgs", () => {
  it("defaults are empty", () => {
    const o = parseInstallPluginsArgs([]);
    expect(o.dryRun).toBe(false);
    expect(o.only).toBeUndefined();
    expect(o.scope).toBeUndefined();
  });

  it("parses --dry-run", () => {
    expect(parseInstallPluginsArgs(["--dry-run"]).dryRun).toBe(true);
  });

  it("parses --only as comma-separated plugin names", () => {
    const o = parseInstallPluginsArgs(["--only=superpowers,sales"]);
    expect(o.only).toEqual(["superpowers", "sales"]);
  });

  it("parses --scope=user|project|local", () => {
    expect(parseInstallPluginsArgs(["--scope=project"]).scope).toBe("project");
    expect(parseInstallPluginsArgs(["--scope=user"]).scope).toBe("user");
  });
});

describe("executeInstallPlugins", () => {
  it("adds all default marketplaces + plugins by default", async () => {
    const result = await executeInstallPlugins({
      installer: fakeInstaller(),
    });
    expect(result.marketplaces).toHaveLength(DEFAULT_MARKETPLACES.length);
    expect(result.plugins).toHaveLength(DEFAULT_PLUGINS.length);
    expect(result.marketplaces.every((r) => r.status === "added")).toBe(true);
    expect(result.plugins.every((r) => r.status === "added")).toBe(true);
  });

  it("--only filters plugins but still registers all required marketplaces", async () => {
    const result = await executeInstallPlugins({
      only: ["code-review"],
      installer: fakeInstaller(),
    });
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.name).toBe("code-review@claude-plugins-official");
    // marketplace set is just the ones needed by filtered plugins
    const mpNames = result.marketplaces.map((r) => r.name);
    expect(mpNames).toEqual(["claude-plugins-official"]);
  });

  it("--only with unknown plugin returns failed entry without calling installer", async () => {
    let called = 0;
    const result = await executeInstallPlugins({
      only: ["ghost"],
      installer: fakeInstaller({
        plugin: () => {
          called++;
          return { status: "added", detail: "" };
        },
      }),
    });
    expect(called).toBe(0);
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0]!.status).toBe("failed");
    expect(result.plugins[0]!.detail).toMatch(/unknown|not in bundle/i);
  });

  it("--dry-run never invokes installer and marks each entry 'would-do'", async () => {
    let called = 0;
    const result = await executeInstallPlugins({
      dryRun: true,
      installer: fakeInstaller({
        marketplace: () => {
          called++;
          return { status: "added", detail: "" };
        },
        plugin: () => {
          called++;
          return { status: "added", detail: "" };
        },
      }),
    });
    expect(called).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(result.marketplaces.every((r) => r.status === "would-do")).toBe(true);
    expect(result.plugins.every((r) => r.status === "would-do")).toBe(true);
  });

  it("propagates installer failure without aborting remaining items", async () => {
    const result = await executeInstallPlugins({
      installer: fakeInstaller({
        plugin: (p) =>
          p.plugin === "commit-commands"
            ? { status: "failed", detail: "network down" }
            : { status: "added", detail: "ok" },
      }),
    });
    const failing = result.plugins.find((r) => r.name.startsWith("commit-commands@"));
    expect(failing?.status).toBe("failed");
    // Others still attempted:
    expect(result.plugins.length).toBe(DEFAULT_PLUGINS.length);
    expect(result.summary.failed).toBeGreaterThan(0);
    expect(result.summary.added).toBeGreaterThan(0);
  });

  it("skips marketplace install for already-added ones (idempotent)", async () => {
    const result = await executeInstallPlugins({
      installer: fakeInstaller({
        marketplace: () => ({ status: "already", detail: "already on disk" }),
        plugin: () => ({ status: "already", detail: "already installed" }),
      }),
    });
    expect(result.summary.alreadyPresent).toBe(
      DEFAULT_MARKETPLACES.length + DEFAULT_PLUGINS.length,
    );
    expect(result.ok).toBe(true);
  });
});

describe("renderInstallPluginsResult", () => {
  it("prints summary with counts + per-item lines", () => {
    const result: InstallPluginsResult = {
      ok: true,
      dryRun: false,
      marketplaces: [
        { name: "claude-plugins-official", status: "added", detail: "ok" },
        { name: "knowledge-work-plugins", status: "already", detail: "on disk" },
      ],
      plugins: [
        { name: "superpowers@claude-plugins-official", status: "added", detail: "ok" },
        { name: "sales@knowledge-work-plugins", status: "failed", detail: "oops" },
      ],
      summary: { added: 2, alreadyPresent: 1, failed: 1, wouldDo: 0 },
    };
    const out = renderInstallPluginsResult(result);
    expect(out).toContain("claude-plugins-official");
    expect(out).toContain("sales@knowledge-work-plugins");
    expect(out).toContain("✅");
    expect(out).toContain("❌");
  });

  it("shows dry-run banner when dryRun=true", () => {
    const out = renderInstallPluginsResult({
      ok: true,
      dryRun: true,
      marketplaces: [],
      plugins: [],
      summary: { added: 0, alreadyPresent: 0, failed: 0, wouldDo: 0 },
    });
    expect(out).toMatch(/dry-run|预览/);
  });
});
