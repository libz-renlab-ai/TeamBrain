import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * BareGitBridge：本地 bare git 仓库作为两个工作 clone（用户 A、用户 B）之间的传输通道，
 * 模拟真实 `git push` / `git pull` 而不需要 GitHub 远程。用于 m5-share/m5-sync 的端到端
 * 测试场景（issue #332）。
 *
 * 实现约束：
 * - 必须跨平台（Windows + POSIX）
 * - 用 execFileSync（非 spawn）配合 stdio: "pipe" 抓取 git 错误
 * - cleanup 必须幂等
 */
export interface BareGitBridge {
  /** Bare 仓库的绝对路径；可作 `file://${bareRepoPath}`（POSIX）或纯路径（Windows）。 */
  bareRepoPath: string;
  /**
   * 在 targetDir 上克隆出一个工作 clone，配置 git 身份并推一个空的 initial commit
   * 让 bare 仓库拿到 main 分支 ref。
   */
  cloneInto(
    targetDir: string,
    gitIdentity: { email: string; name: string },
  ): Promise<string>;
  /** 删除 bare 仓库；幂等。 */
  cleanup: () => Promise<void>;
}

export interface BareGitBridgeOptions {
  /** Bare 仓库目录前缀，默认 "teamagent-m5-bare"。 */
  prefix?: string;
}

const DEFAULT_PREFIX = "teamagent-m5-bare";

/**
 * 创建一个全新的本地 bare git 仓库，返回封装好的 bridge。
 *
 * 调用方负责在测试结束时 await bridge.cleanup()。
 */
export async function setupBareGitBridge(
  opts?: BareGitBridgeOptions,
): Promise<BareGitBridge> {
  const prefix = opts?.prefix ?? DEFAULT_PREFIX;
  const bareRepoPath = await fs.mkdtemp(
    path.join(os.tmpdir(), `${prefix}-`),
  );

  // git init --bare in the temp dir; with `initial-branch=main` so we don't
  // depend on the host's `init.defaultBranch` setting.
  runGit(bareRepoPath, ["init", "--bare", "--initial-branch=main"]);

  return {
    bareRepoPath,
    cloneInto: (targetDir, gitIdentity) =>
      cloneInto(bareRepoPath, targetDir, gitIdentity),
    cleanup: async () => {
      await fs.rm(bareRepoPath, { recursive: true, force: true });
    },
  };
}

/**
 * Clone 出一个工作 clone，配置身份，推一个空 initial commit 让 bare 拿到 main ref。
 * 返回 clone 的绝对路径。
 *
 * Windows 上传入纯路径（file:// 加盘符会有坑），POSIX 上传 file:// URL。
 */
async function cloneInto(
  bareRepoPath: string,
  targetDir: string,
  gitIdentity: { email: string; name: string },
): Promise<string> {
  const absTarget = path.resolve(targetDir);

  // 父目录必须存在，git clone 才不报错。
  await fs.mkdir(path.dirname(absTarget), { recursive: true });

  const cloneUrl = repoUrlFor(bareRepoPath);
  // git clone <url> <dir>
  // 关键：从 cwd 跑（而非 absTarget 内），因为 absTarget 还不存在。
  // 注意：不用 --branch main——首次 clone bare 仓库时其 HEAD 指向 main 但 main
  // 还没 commit（unborn）；--branch main 会因为 ref 不存在而失败。bare 仓库 init
  // 时已经用 --initial-branch=main 设置默认分支，clone 出来的工作 tree HEAD 自动
  // 指向 main（即使 unborn）。
  runGitFromCwd(path.dirname(absTarget), [
    "clone",
    cloneUrl,
    absTarget,
  ]);

  // 配置 user identity，否则 commit 会失败（特别是 CI 上没有全局 git 配置时）。
  runGit(absTarget, ["config", "user.email", gitIdentity.email]);
  runGit(absTarget, ["config", "user.name", gitIdentity.name]);
  // Windows 上 git 默认会做 CRLF 转换；测试需要 byte-stable round-trip，关掉。
  runGit(absTarget, ["config", "core.autocrlf", "false"]);
  // 测试用 bridge 不需要 GPG 签名（CI 上可能没配 GPG key 会卡住）。
  runGit(absTarget, ["config", "commit.gpgsign", "false"]);

  // bare 仓库刚 init 出来时没有 ref；clone 得到的也是空 working tree（没 HEAD commit）。
  // 推一个空 initial commit 让 bare 拿到 main 分支 ref，后续 push / pull 才有基线。
  // 注意：如果 bare 已经被前一个 clone 推过了（同一个 bare 被复用），这一步会成为
  // 第二个 commit；这没问题——只要 bare 仓库有 main ref，后续 clone 直接拿到，
  // 不需要再 push initial commit。检测方法：clone 之后如果工作 tree 已经有 .git/HEAD
  // 指向真实 commit（不是 unborn branch），就跳过初始化。
  if (await isUnbornBranch(absTarget)) {
    runGit(absTarget, ["commit", "--allow-empty", "-m", "initial"]);
    runGit(absTarget, ["push", "-u", "origin", "main"]);
  }

  return absTarget;
}

/**
 * 检测 clone 是否处于 unborn-branch 状态（bare 仓库还没 main ref，
 * 所以 clone 出来 HEAD 指向一个还不存在的分支）。
 *
 * `git rev-parse --verify HEAD` 在 unborn 状态会非零退出。
 */
async function isUnbornBranch(repoDir: string): Promise<boolean> {
  try {
    runGit(repoDir, ["rev-parse", "--verify", "HEAD"]);
    return false;
  } catch {
    return true;
  }
}

/**
 * Windows: 用纯绝对路径；POSIX: 用 file:// URL。
 * 原因：Windows 上 file://C:/path 这种带盘符的写法 git 解析有边界 case；
 * 纯路径 git 在两个平台都能接受，但 POSIX 上历史习惯用 file://，保持惯例。
 */
function repoUrlFor(bareRepoPath: string): string {
  if (process.platform === "win32") {
    return bareRepoPath;
  }
  return `file://${bareRepoPath}`;
}

/**
 * 在给定 repo dir 内跑 git 子命令；用 execFileSync + stdio:"pipe" 抓 stderr。
 */
function runGit(repoDir: string, args: readonly string[]): void {
  try {
    execFileSync("git", [...args], {
      cwd: repoDir,
      stdio: "pipe",
    });
  } catch (e) {
    throw wrapGitError(e, args, repoDir);
  }
}

/**
 * 从 cwd 跑 git（clone 时父目录还在，子目录不在的场景）。
 */
function runGitFromCwd(cwd: string, args: readonly string[]): void {
  try {
    execFileSync("git", [...args], {
      cwd,
      stdio: "pipe",
    });
  } catch (e) {
    throw wrapGitError(e, args, cwd);
  }
}

function wrapGitError(
  e: unknown,
  args: readonly string[],
  cwd: string,
): Error {
  if (e instanceof Error) {
    // execFileSync 把 stderr 挂在 .stderr 上（Buffer | string）；用结构性窄化读出来。
    const stderr = extractStderr(e);
    return new Error(
      `git ${args.join(" ")} failed in ${cwd}: ${e.message}${
        stderr ? `\nstderr: ${stderr}` : ""
      }`,
    );
  }
  return new Error(`git ${args.join(" ")} failed in ${cwd}: ${String(e)}`);
}

/**
 * 从 execFileSync 抛出的错误对象上读 stderr（可能是 Buffer / string / 缺失），
 * 通过 Reflect.get 拿动态字段，无需 `as` cast 或 any。
 */
function extractStderr(e: Error): string {
  const raw: unknown = Reflect.get(e, "stderr");
  if (typeof raw === "string") return raw;
  if (raw instanceof Buffer) return raw.toString("utf8");
  return "";
}
