/**
 * M5 综合面板（M5-D 可见性）：把 manifest、bootstrap diff、团队规则集
 * 合在一处显示，便于 审计/确认 当前 M5 状态。
 *
 * 设计意图：用户可见性优先于隐藏（spec §7）——所有自动动作（封存、
 * 分类、写 L2、merge）的累积结果都能在这里查到。
 */
import { runM5Bootstrap } from "./m5-bootstrap.js";
import { runM5Sync } from "./m5-sync.js";
import { createDefaultBootstrapPort } from "../m5-default-port.js";

export interface M5StatusOptions {
  projectRoot: string;
}

export interface M5StatusResult {
  has_manifest: boolean;
  manifest_summary?: {
    teamagent_version: string;
    required_plugins: string[];
    required_hooks: string[];
    created_by: string;
  };
  bootstrap_diff_brief?: string;
  team_rules_total_claims: number;
  team_rules_alive: number;
  team_rules_tombstoned: number;
}

export async function runM5Status(
  opts: M5StatusOptions
): Promise<M5StatusResult> {
  const port = createDefaultBootstrapPort(opts.projectRoot);

  const manifestRaw = await port.readManifest(opts.projectRoot);
  const result: M5StatusResult = {
    has_manifest: !!manifestRaw,
    team_rules_total_claims: 0,
    team_rules_alive: 0,
    team_rules_tombstoned: 0,
  };

  if (manifestRaw) {
    const m = JSON.parse(manifestRaw);
    result.manifest_summary = {
      teamagent_version: m.teamagent_version,
      required_plugins: m.required_plugins,
      required_hooks: m.required_hooks,
      created_by: m.created_by,
    };
    const bs = await runM5Bootstrap({
      projectRoot: opts.projectRoot,
      checkOnly: true,
    });
    if (bs.diff) {
      if (bs.diff.needs_bootstrap) {
        const bits: string[] = [];
        if (bs.diff.install_teamagent_version)
          bits.push(`teamagent→${bs.diff.install_teamagent_version}`);
        if (bs.diff.install_plugins.length)
          bits.push(`plugins:${bs.diff.install_plugins.join(",")}`);
        if (bs.diff.install_hooks.length)
          bits.push(`hooks:${bs.diff.install_hooks.join(",")}`);
        result.bootstrap_diff_brief = `需补齐 ${bits.join("; ")}`;
      } else {
        result.bootstrap_diff_brief = "OK，无需动作";
      }
    }
  }

  const sync = await runM5Sync({ projectRoot: opts.projectRoot });
  result.team_rules_total_claims = sync.total_claims;
  for (const m of sync.merged) {
    if (m.state === "alive") result.team_rules_alive++;
    else result.team_rules_tombstoned++;
  }

  return result;
}

export function parseM5StatusArgs(args: readonly string[]): M5StatusOptions {
  const opts: M5StatusOptions = { projectRoot: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--project-root") {
      opts.projectRoot = args[++i] ?? process.cwd();
    } else if (a.startsWith("--project-root=")) {
      opts.projectRoot = a.slice("--project-root=".length);
    }
  }
  return opts;
}

export function renderM5StatusResult(r: M5StatusResult): string {
  const lines: string[] = [];
  lines.push("=== TeamAgent M5 状态 ===");
  if (!r.has_manifest) {
    lines.push("项目尚未传染（无 .teamagent/manifest.json）。");
    lines.push("提示：跑 `teamagent m5-infect` 写入契约。");
    return lines.join("\n");
  }
  const m = r.manifest_summary!;
  lines.push(`契约（manifest）：`);
  lines.push(`  创建者：${m.created_by}`);
  lines.push(`  TeamAgent 版本：${m.teamagent_version}`);
  lines.push(`  必备插件：${m.required_plugins.join(", ") || "(无)"}`);
  lines.push(`  必备 hook：${m.required_hooks.join(", ") || "(无)"}`);
  lines.push(`本机 vs 契约：${r.bootstrap_diff_brief}`);
  lines.push(``);
  lines.push(
    `团队规则集：${r.team_rules_total_claims} 个 claim，合并后 alive=${r.team_rules_alive} / tombstoned=${r.team_rules_tombstoned}`
  );
  return lines.join("\n");
}
