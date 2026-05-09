/**
 * 团队标准插件 bundle —— 与项目级 `.claude/settings.json` 的 enabledPlugins
 * 保持一致；`.claude/settings.json` 是 source of truth，本文件镜像它。
 *
 * `teamagent install-plugins` 按本列表依次:
 *   1. 注册 marketplace（`claude plugin marketplace add`）
 *   2. 安装各 plugin（`claude plugin install <plugin>@<marketplace>`）
 *
 * 修改方式：同步更新本文件 + `.claude/settings.json:enabledPlugins`，
 * 二者必须保持一致。单用户可以 `--plugins=<list>` 或
 * `teamagent plugin uninstall` 运行时覆盖。
 */

export interface MarketplaceSpec {
  readonly name: string;
  readonly repo: string;
}

export interface PluginSpec {
  readonly plugin: string;
  readonly marketplace: string;
}

export const DEFAULT_MARKETPLACES: readonly MarketplaceSpec[] = [
  { name: "claude-plugins-official", repo: "anthropics/claude-plugins-official" },
];

export const DEFAULT_PLUGINS: readonly PluginSpec[] = [
  { plugin: "playground", marketplace: "claude-plugins-official" },
  { plugin: "claude-code-setup", marketplace: "claude-plugins-official" },
  { plugin: "code-review", marketplace: "claude-plugins-official" },
  { plugin: "code-simplifier", marketplace: "claude-plugins-official" },
  { plugin: "commit-commands", marketplace: "claude-plugins-official" },
  { plugin: "frontend-design", marketplace: "claude-plugins-official" },
];

export function parsePluginSpec(raw: string): PluginSpec {
  const spec = raw.trim();
  const atIdx = spec.indexOf("@");
  if (atIdx <= 0 || atIdx === spec.length - 1) {
    throw new Error(`invalid plugin spec: "${raw}" (expected "plugin@marketplace")`);
  }
  return {
    plugin: spec.slice(0, atIdx),
    marketplace: spec.slice(atIdx + 1),
  };
}

export function formatPluginSpec(p: PluginSpec): string {
  return `${p.plugin}@${p.marketplace}`;
}
