/**
 * M5 SessionStart 集成：用户在任意 git 项目里活动时
 *   1. 自动 infect（如果项目尚未传染）
 *   2. 自动 bootstrap --apply（如果本机配置不齐）
 *   3. 自动 sync --apply（拉团队规则到本地 KB）
 *
 * 全部非阻塞、不抛错——SessionStart hook 设计契约。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { findTeamagentRoot } from "./find-teamagent-root.js";
import { runM5Infect } from "./commands/m5-infect.js";
import { runM5Bootstrap } from "./commands/m5-bootstrap.js";
import { runM5Sync } from "./commands/m5-sync.js";
import { runM5Publish } from "./commands/m5-publish.js";

export interface M5SessionResult {
  infected: boolean;
  bootstrapped: boolean;
  synced: boolean;
  published_changes: number;
  pushed: boolean;
  /** W15-014: number of team rule files skipped during sync (corrupt JSON / future ts / schema) */
  skipped_count: number;
  errors: string[];
}

/**
 * 检测当前用户机器是否已经"装了 TeamAgent"——按是否有用户级 knowledge.db 判断。
 * 这是"传染源"判定：只有自己装过 TA 的用户，进新项目才会自动 infect。
 */
export function userHasTeamAgent(homeDir: string): boolean {
  const dbPath = path.join(homeDir, ".teamagent", "global.db");
  return fs.existsSync(dbPath);
}

/** 当前项目是否是 git 仓库（infect 的前提）。 */
export function isGitProject(projectRoot: string): boolean {
  // worktree 时 .git 是文件，主仓库是目录——都算
  return fs.existsSync(path.join(projectRoot, ".git"));
}

/** 当前项目是否已被 infect。
 *
 * Pure predicate over the directory passed in — does NOT walk up. The walk-up
 * for issue #161 happens at `runM5Session` entry so that the entire pipeline
 * (`isInfected` + `runM5Infect`/`runM5Bootstrap`/`runM5Sync`/`runM5Publish`)
 * sees the same resolved project root. Walking up inside this predicate alone
 * would make `isInfected(sub)` return true while the downstream commands still
 * operate on `sub`, leaving them to no-op against a non-existent
 * `sub/.teamagent/`.
 */
export function isInfected(projectRoot: string): boolean {
  return fs.existsSync(path.join(projectRoot, ".teamagent", "manifest.json"));
}

/**
 * 在 SessionStart 阶段自动跑 M5 全套。降级模式：任一失败不影响其它。
 */
export async function runM5Session(input: {
  projectRoot: string;
  homeDir: string;
  /** 是否真的"传染"——默认按 userHasTeamAgent 判断 */
  shouldInfect?: boolean;
  /** 是否在自动 commit 后也自动 push（默认 false） */
  autoPush?: boolean;
}): Promise<M5SessionResult> {
  const r: M5SessionResult = {
    infected: false,
    bootstrapped: false,
    synced: false,
    published_changes: 0,
    pushed: false,
    skipped_count: 0,
    errors: [],
  };

  // Issue #161: SessionStart can fire from a sub-directory of an already-
  // infected project. Walk up ONCE here and use the resolved project root for
  // every downstream command — keeps `isInfected` honest as a pure predicate
  // and ensures `runM5Infect`/`Bootstrap`/`Sync`/`Publish` all operate on the
  // same root the predicate answered for. `findTeamagentRoot` falls back to
  // the input on miss, preserving the original cwd-only behaviour for fresh
  // projects with no ancestor `.teamagent/`.
  const projectRoot = findTeamagentRoot(input.projectRoot);

  if (!isGitProject(projectRoot)) {
    return r; // 非 git 项目不动
  }

  // 1) 传染：如果当前用户是 "传染源" 且项目未被传染，自动 infect
  const shouldInfect =
    input.shouldInfect ?? userHasTeamAgent(input.homeDir);
  if (shouldInfect && !isInfected(projectRoot)) {
    try {
      const inf = await runM5Infect({ projectRoot });
      r.infected = !inf.skipped;
    } catch (e) {
      r.errors.push(`infect: ${(e as Error).message}`);
    }
  }

  // 2) bootstrap apply：项目已被 infect 时检查并补齐本机
  if (isInfected(projectRoot)) {
    try {
      const bs = await runM5Bootstrap({
        projectRoot,
        checkOnly: false,
      });
      r.bootstrapped = !!(bs.applied && bs.diff?.needs_bootstrap);
    } catch (e) {
      r.errors.push(`bootstrap: ${(e as Error).message}`);
    }
  }

  // 3) sync apply：把团队规则拉进本地 KB
  if (isInfected(projectRoot)) {
    try {
      const sync = await runM5Sync({
        projectRoot,
        apply: true,
      });
      r.synced =
        !!sync.applied &&
        (sync.applied.upserted.length > 0 || sync.applied.deleted.length > 0);
      r.skipped_count = sync.skipped_files?.length ?? 0;
    } catch (e) {
      r.errors.push(`sync: ${(e as Error).message}`);
    }
  }

  // 4) publish：auto-commit pending L2 changes 并 push（spec §7 激进模式默认 push）
  // push 失败时降级为 push_error，不抛——commit 已留在本地，下次 SessionStart 再推
  if (isInfected(projectRoot)) {
    try {
      const pub = await runM5Publish({
        projectRoot,
        push: input.autoPush ?? true,
      });
      r.published_changes = pub.changes_count;
      r.pushed = pub.pushed;
    } catch (e) {
      r.errors.push(`publish: ${(e as Error).message}`);
    }
  }

  return r;
}

/** 渲染成 stderr 友好的 banner（SessionStart 的输出渠道）。 */
export function renderM5SessionBanner(r: M5SessionResult): string | null {
  const parts: string[] = [];
  if (r.infected) parts.push("🦠 项目已自动 infect");
  if (r.bootstrapped) parts.push("📦 本机已自动补齐缺失项");
  if (r.synced) parts.push("🔄 已同步团队规则");
  if (r.skipped_count > 0) {
    parts.push(
      `⚠ 同步时跳过 ${r.skipped_count} 个团队规则文件（运行 \`teamagent m5-sync\` 查看详情）`,
    );
  }
  if (r.published_changes > 0) {
    const pushNote = r.pushed ? " + push" : "（未 push）";
    parts.push(`📤 已 commit ${r.published_changes} 处 team 变化${pushNote}`);
  }
  if (r.errors.length) {
    parts.push(`⚠ M5 部分失败: ${r.errors.join("; ")}`);
  }
  if (parts.length === 0) return null;
  return `[teamagent M5] ${parts.join("，")}`;
}
