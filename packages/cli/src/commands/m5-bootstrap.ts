import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { parseManifest, computeBootstrapDiff } from "@teamagent/core";
import { FsBootstrap } from "@teamagent/adapters/m5/fs-bootstrap";
import type { BootstrapDiff } from "@teamagent/types";
import { executeInstallPlugins, type InstallPluginsResult } from "./install-plugins.js";
import { createDefaultBootstrapPort } from "../m5-default-port.js";

export interface M5BootstrapOptions {
  projectRoot: string;
  /** 仅检查、不执行安装动作（默认 true）。--apply 翻成 false 实际跑安装。 */
  checkOnly?: boolean;
  /** 注入自定义 BootstrapPort（测试用）；默认走 createDefaultBootstrapPort() */
  port?: FsBootstrap;
}

export interface M5BootstrapResult {
  diff: BootstrapDiff | null;
  reason?: string;
  /** --apply 模式下，实际执行的安装动作 */
  applied?: {
    plugins?: InstallPluginsResult;
    teamagent_install_command?: string;
    skills_pending?: string[];
    hooks_pending?: string[];
    /** B-150: whether `git config core.hooksPath .githooks` was set on this clone. */
    git_hookspath_set?: boolean;
  };
}

export async function runM5Bootstrap(
  opts: M5BootstrapOptions
): Promise<M5BootstrapResult> {
  const port = opts.port ?? createDefaultBootstrapPort(opts.projectRoot);

  const manifestRaw = await port.readManifest(opts.projectRoot);
  if (manifestRaw === null) {
    // No manifest file at all → project not infected; this is a normal,
    // expected state (return ok). Distinguish from "" / corrupt content,
    // which W15-011 requires we surface via parseManifest's throw.
    return { diff: null, reason: "no manifest (project not infected)" };
  }
  const manifest = parseManifest(manifestRaw);
  const localState = await port.getLocalState();
  const diff = computeBootstrapDiff(manifest, localState);

  // --check 模式：只报 diff
  if (opts.checkOnly !== false) {
    return { diff };
  }

  // --apply 模式：跑实际安装动作（降级模式：失败不阻塞）
  const applied: NonNullable<M5BootstrapResult["applied"]> = {};

  if (diff.install_plugins.length > 0) {
    try {
      applied.plugins = await executeInstallPlugins({
        only: diff.install_plugins,
      });
    } catch (e) {
      // 安装失败也不抛——降级为空报告
      applied.plugins = {
        ok: false,
        dryRun: false,
        marketplaces: [],
        plugins: diff.install_plugins.map((name) => ({
          name,
          status: "failed" as const,
          detail: `install threw: ${(e as Error).message}`,
        })),
        summary: {
          added: 0,
          alreadyPresent: 0,
          failed: diff.install_plugins.length,
          wouldDo: 0,
        },
      };
    }
  }

  if (diff.install_teamagent_version) {
    applied.teamagent_install_command =
      `npm install -g github:libz-renlab-ai/TeamBrain#release  # 升级到 ${diff.install_teamagent_version}+`;
  }

  if (diff.install_project_skills.length > 0) {
    applied.skills_pending = diff.install_project_skills;
  }
  if (diff.install_hooks.length > 0) {
    applied.hooks_pending = diff.install_hooks;
  }

  // B-150: viral propagation needs `core.hooksPath = .githooks` on this clone
  // so that the post-merge hook fires after every git pull. m5-infect sets it
  // for the originator; bootstrap --apply sets it for downstream teammates
  // who clone the repo. Idempotent — re-runs are safe.
  if (existsSync(path.join(opts.projectRoot, ".githooks"))) {
    try {
      execSync("git config core.hooksPath .githooks", {
        cwd: opts.projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      applied.git_hookspath_set = true;
    } catch {
      applied.git_hookspath_set = false;
    }
  }

  return { diff, applied };
}

export function parseM5BootstrapArgs(
  args: readonly string[]
): M5BootstrapOptions {
  const opts: M5BootstrapOptions = {
    projectRoot: process.cwd(),
    checkOnly: true,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--project-root") {
      opts.projectRoot = args[++i] ?? process.cwd();
    } else if (a.startsWith("--project-root=")) {
      opts.projectRoot = a.slice("--project-root=".length);
    } else if (a === "--check") {
      opts.checkOnly = true;
    } else if (a === "--apply") {
      opts.checkOnly = false;
    }
  }
  return opts;
}

export function renderM5BootstrapResult(r: M5BootstrapResult): {
  output: string;
  exitCode: number;
} {
  if (!r.diff) {
    return {
      output: `[m5-bootstrap] ${r.reason ?? "ok"}`,
      exitCode: 0,
    };
  }
  if (!r.diff.needs_bootstrap) {
    return { output: "[m5-bootstrap] OK，无需动作。", exitCode: 0 };
  }
  if (r.applied) {
    const lines: string[] = ["[m5-bootstrap] 自动安装完成（apply 模式）："];
    if (r.applied.plugins) {
      const s = r.applied.plugins.summary;
      lines.push(
        `  插件：added=${s.added} already=${s.alreadyPresent} failed=${s.failed}`
      );
      for (const p of r.applied.plugins.plugins) {
        lines.push(`    [${p.status}] ${p.name} — ${p.detail}`);
      }
    }
    if (r.applied.teamagent_install_command) {
      lines.push(`  CLI 升级（手动跑）：${r.applied.teamagent_install_command}`);
    }
    if (r.applied.skills_pending && r.applied.skills_pending.length) {
      lines.push(`  Skill 待补：${r.applied.skills_pending.join(", ")}（M5-D2 自动）`);
    }
    if (r.applied.hooks_pending && r.applied.hooks_pending.length) {
      lines.push(`  Hook 待补：${r.applied.hooks_pending.join(", ")}（teamagent install-user-hook）`);
    }
    // apply 模式即使有失败也 exit 0（降级原则）
    return { output: lines.join("\n"), exitCode: 0 };
  }
  return {
    output: "[m5-bootstrap] 需要补齐：\n" + JSON.stringify(r.diff, null, 2),
    exitCode: 2,
  };
}
