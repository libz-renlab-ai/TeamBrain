import { execSync, execFileSync } from "node:child_process";

/**
 * m5-publish：把 .teamagent/team/ 下的本地未提交修改自动 commit 到 git，
 * 可选 push 到 remote。设计为"幂等 + 降级"：没改动就 no-op；commit/push
 * 失败不抛错，仅返回结果。
 *
 * 由 SessionStart 或显式命令触发；不阻塞用户工作。
 */

export interface M5PublishOptions {
  projectRoot: string;
  /**
   * 是否同时 push 到 origin。**默认 false**（与 CLI help 文本"--push 同时推 origin"一致；
   * 历史上曾默认 true 但与文档不符，2026-05 修正——见 BUGS.md B-111）。
   * push 失败会落到 result.push_error 上，不抛——commit 已在本地、下次再推。
   * 启用：传 push=true 或 CLI 参数 --push。
   */
  push?: boolean;
  /** 自定义 commit message 前缀；默认 [teamagent-sync] */
  commitMsgPrefix?: string;
}

export interface M5PublishResult {
  changes_count: number;
  committed: boolean;
  commit_sha?: string;
  pushed: boolean;
  push_error?: string;
  reason?: string;
}

export async function runM5Publish(
  opts: M5PublishOptions
): Promise<M5PublishResult> {
  const result: M5PublishResult = {
    changes_count: 0,
    committed: false,
    pushed: false,
  };

  // 探测 .teamagent/team/ 下的变化
  let status = "";
  try {
    status = execSync(
      `git status --porcelain -- .teamagent/team/`,
      { cwd: opts.projectRoot, encoding: "utf8" }
    );
  } catch (e) {
    result.reason = `git status failed: ${(e as Error).message}`;
    return result;
  }

  const lines = status.split("\n").filter((l) => l.trim().length > 0);
  result.changes_count = lines.length;
  if (lines.length === 0) {
    result.reason = "no .teamagent/team/ changes to publish";
    return result;
  }

  // git add
  try {
    execSync(`git add .teamagent/team/`, {
      cwd: opts.projectRoot,
      encoding: "utf8",
    });
  } catch (e) {
    result.reason = `git add failed: ${(e as Error).message}`;
    return result;
  }

  // git commit
  const prefix = opts.commitMsgPrefix ?? "[teamagent-sync]";
  const msg = `${prefix} sync ${lines.length} team rule(s)`;
  try {
    execFileSync("git", ["commit", "-m", msg], {
      cwd: opts.projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    result.committed = true;
    result.commit_sha = execSync("git rev-parse HEAD", {
      cwd: opts.projectRoot,
      encoding: "utf8",
    }).trim();
  } catch (e) {
    result.reason = `git commit failed: ${(e as Error).message}`;
    return result;
  }

  // 默认不 push（与 CLI help "--push 同时推 origin" 一致；显式 --push 才推）
  const shouldPush = opts.push ?? false;
  if (shouldPush) {
    try {
      execSync("git push", {
        cwd: opts.projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      result.pushed = true;
    } catch (e) {
      result.push_error = (e as Error).message;
    }
  }

  return result;
}

export function parseM5PublishArgs(args: readonly string[]): M5PublishOptions {
  const opts: M5PublishOptions = { projectRoot: process.cwd() };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--project-root") {
      opts.projectRoot = args[++i] ?? process.cwd();
    } else if (a.startsWith("--project-root=")) {
      opts.projectRoot = a.slice("--project-root=".length);
    } else if (a === "--push") {
      opts.push = true;
    } else if (a === "--no-push") {
      opts.push = false;
    }
  }
  return opts;
}

export function renderM5PublishResult(r: M5PublishResult): string {
  if (r.changes_count === 0) {
    return `[m5-publish] ${r.reason ?? "no changes"}`;
  }
  const lines: string[] = [];
  lines.push(`[m5-publish] ${r.changes_count} 处变化`);
  if (r.committed) {
    lines.push(`  ✓ committed: ${r.commit_sha?.slice(0, 12) ?? ""}`);
  } else {
    lines.push(`  ✗ commit failed: ${r.reason}`);
  }
  if (r.pushed) {
    lines.push(`  ✓ pushed to origin`);
  } else if (r.push_error) {
    lines.push(`  ✗ push failed: ${r.push_error}`);
  }
  return lines.join("\n");
}
