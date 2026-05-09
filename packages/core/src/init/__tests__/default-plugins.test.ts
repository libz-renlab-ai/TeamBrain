import { describe, it, expect } from "vitest";
import {
  DEFAULT_MARKETPLACES,
  DEFAULT_PLUGINS,
  parsePluginSpec,
  formatPluginSpec,
  type PluginSpec,
} from "../default-plugins.js";

describe("DEFAULT_MARKETPLACES", () => {
  it("contains the 1 team-standard marketplace", () => {
    const names = DEFAULT_MARKETPLACES.map((m) => m.name);
    expect(names).toEqual([
      "claude-plugins-official",
    ]);
  });

  it("maps each marketplace to an owner/repo github spec", () => {
    const byName = Object.fromEntries(
      DEFAULT_MARKETPLACES.map((m) => [m.name, m.repo]),
    );
    expect(byName["claude-plugins-official"]).toBe("anthropics/claude-plugins-official");
  });
});

describe("DEFAULT_PLUGINS", () => {
  it("contains the 6 team-standard plugins (mirrors .claude/settings.json enabledPlugins)", () => {
    const specs = DEFAULT_PLUGINS.map((p) => `${p.plugin}@${p.marketplace}`);
    expect(specs).toEqual([
      "playground@claude-plugins-official",
      "claude-code-setup@claude-plugins-official",
      "code-review@claude-plugins-official",
      "code-simplifier@claude-plugins-official",
      "commit-commands@claude-plugins-official",
      "frontend-design@claude-plugins-official",
    ]);
  });

  it("every plugin references a known marketplace", () => {
    const mpNames = new Set(DEFAULT_MARKETPLACES.map((m) => m.name));
    for (const p of DEFAULT_PLUGINS) {
      expect(mpNames.has(p.marketplace)).toBe(true);
    }
  });
});

describe("parsePluginSpec", () => {
  it('parses "plugin@marketplace"', () => {
    expect(parsePluginSpec("playground@claude-plugins-official")).toEqual({
      plugin: "playground",
      marketplace: "claude-plugins-official",
    } satisfies PluginSpec);
  });

  it("throws on missing @", () => {
    expect(() => parsePluginSpec("playground")).toThrow(/invalid plugin spec/);
  });

  it("throws on empty plugin or marketplace", () => {
    expect(() => parsePluginSpec("@foo")).toThrow(/invalid plugin spec/);
    expect(() => parsePluginSpec("foo@")).toThrow(/invalid plugin spec/);
    expect(() => parsePluginSpec("@")).toThrow(/invalid plugin spec/);
  });

  it("trims surrounding whitespace", () => {
    expect(parsePluginSpec("  playground@claude-plugins-official  ")).toEqual({
      plugin: "playground",
      marketplace: "claude-plugins-official",
    });
  });
});

describe("formatPluginSpec", () => {
  it('produces "plugin@marketplace"', () => {
    expect(formatPluginSpec({ plugin: "frontend-design", marketplace: "claude-plugins-official" })).toBe(
      "frontend-design@claude-plugins-official",
    );
  });

  it("roundtrips with parsePluginSpec", () => {
    for (const p of DEFAULT_PLUGINS) {
      expect(parsePluginSpec(formatPluginSpec(p))).toEqual(p);
    }
  });
});
