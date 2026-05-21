import {
  ClaudePluginInstaller
} from "./chunk-NPSW37EI.js";
import {
  DEFAULT_MARKETPLACES,
  DEFAULT_PLUGINS,
  formatPluginSpec
} from "./chunk-4Y7LCJVR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/install-plugins.ts
init_esm_shims();
function parseInstallPluginsArgs(argv) {
  const opts = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") opts.dryRun = true;
    else if (a.startsWith("--only=")) {
      opts.only = a.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith("--scope=")) {
      const s = a.slice("--scope=".length);
      if (s === "user" || s === "project" || s === "local") opts.scope = s;
    }
  }
  return opts;
}
async function executeInstallPlugins(opts = {}) {
  const dryRun = opts.dryRun ?? false;
  const installer = opts.installer ?? new ClaudePluginInstaller();
  const { plugins, unknown } = resolvePlugins(opts.only);
  const marketplaces = resolveMarketplaces(plugins);
  const marketplaceResults = [];
  const pluginResults = [];
  for (const m of marketplaces) {
    if (dryRun) {
      marketplaceResults.push({
        name: m.name,
        status: "would-do",
        detail: `(dry-run) would add marketplace ${m.repo}`
      });
      continue;
    }
    const outcome = await installer.addMarketplace(m);
    marketplaceResults.push(outcomeToItem(m.name, outcome));
  }
  for (const p of plugins) {
    const spec = formatPluginSpec(p);
    if (dryRun) {
      pluginResults.push({
        name: spec,
        status: "would-do",
        detail: `(dry-run) would install ${spec}`
      });
      continue;
    }
    const scopeOpt = opts.scope ? { scope: opts.scope } : {};
    const outcome = await installer.installPlugin(p, scopeOpt);
    pluginResults.push(outcomeToItem(spec, outcome));
  }
  for (const name of unknown) {
    pluginResults.push({
      name,
      status: "failed",
      detail: `unknown plugin: '${name}' is not in the default bundle`
    });
  }
  const summary = {
    added: countStatus([...marketplaceResults, ...pluginResults], "added"),
    alreadyPresent: countStatus([...marketplaceResults, ...pluginResults], "already"),
    failed: countStatus([...marketplaceResults, ...pluginResults], "failed"),
    wouldDo: countStatus([...marketplaceResults, ...pluginResults], "would-do")
  };
  const ok = summary.failed === 0;
  return { ok, dryRun, marketplaces: marketplaceResults, plugins: pluginResults, summary };
}
function renderInstallPluginsResult(result) {
  const lines = [];
  if (result.dryRun) {
    lines.push("\u26A0\uFE0F  \u9884\u89C8\u6A21\u5F0F\uFF08--dry-run\uFF09\uFF1A\u4EE5\u4E0B\u64CD\u4F5C\u4E0D\u4F1A\u5B9E\u9645\u6267\u884C");
    lines.push("");
  }
  if (result.marketplaces.length > 0) {
    lines.push("\u{1F4E6} Marketplaces:");
    for (const m of result.marketplaces) {
      lines.push(`   ${iconFor(m.status)} ${m.name}  ${truncate(m.detail, 100)}`);
    }
    lines.push("");
  }
  if (result.plugins.length > 0) {
    lines.push("\u{1F50C} Plugins:");
    for (const p of result.plugins) {
      lines.push(`   ${iconFor(p.status)} ${p.name}  ${truncate(p.detail, 100)}`);
    }
    lines.push("");
  }
  const s = result.summary;
  const parts = [];
  if (s.added) parts.push(`${s.added} \u65B0\u88C5`);
  if (s.alreadyPresent) parts.push(`${s.alreadyPresent} \u5DF2\u5B58\u5728`);
  if (s.failed) parts.push(`${s.failed} \u5931\u8D25`);
  if (s.wouldDo) parts.push(`${s.wouldDo} \u5C06\u6267\u884C`);
  lines.push("\u2500".repeat(36));
  lines.push(parts.length > 0 ? parts.join("\uFF0C") : "\u65E0\u4E8B\u53EF\u505A");
  if (result.ok && !result.dryRun) {
    lines.push("\u91CD\u542F Claude Code \u8BA9\u63D2\u4EF6\u52A0\u8F7D");
  }
  return lines.join("\n") + "\n";
}
function resolvePlugins(only) {
  if (!only || only.length === 0) {
    return { plugins: [...DEFAULT_PLUGINS], unknown: [] };
  }
  const byName = new Map(DEFAULT_PLUGINS.map((p) => [p.plugin, p]));
  const plugins = [];
  const unknown = [];
  for (const name of only) {
    const hit = byName.get(name);
    if (hit) plugins.push(hit);
    else unknown.push(name);
  }
  return { plugins, unknown };
}
function resolveMarketplaces(plugins) {
  const needed = new Set(plugins.map((p) => p.marketplace));
  return DEFAULT_MARKETPLACES.filter((m) => needed.has(m.name));
}
function outcomeToItem(name, outcome) {
  return { name, status: outcome.status, detail: outcome.detail };
}
function countStatus(items, status) {
  return items.filter((i) => i.status === status).length;
}
function iconFor(status) {
  switch (status) {
    case "added":
      return "\u2705";
    case "already":
      return "\u23ED ";
    case "failed":
      return "\u274C";
    case "would-do":
      return "\u{1F4DD}";
  }
}
function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

export {
  parseInstallPluginsArgs,
  executeInstallPlugins,
  renderInstallPluginsResult
};
