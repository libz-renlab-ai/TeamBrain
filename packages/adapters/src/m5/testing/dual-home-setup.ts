import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";

/**
 * 双 HOME 测试上下文：模拟两个用户 A 与 B 各自独立的 HOME 与项目
 * checkout，用于验证 m5-share / m5-sync 的规则跨用户传播。
 *
 * 所有路径均为绝对路径；cleanup 必须幂等。
 */
export interface DualHomeContext {
  /** Absolute path to A's HOME (env HOME / USERPROFILE override target). */
  homeA: string;
  /** Absolute path to B's HOME. */
  homeB: string;
  /** A's project checkout root (where .teamagent/team/ lives during share). */
  projectA: string;
  /** B's project checkout root. */
  projectB: string;
  /** Removes all created dirs. Must be idempotent. */
  cleanup: () => Promise<void>;
}

/**
 * setupDualHomes 的可选参数。
 */
export interface DualHomeOptions {
  /** Optional prefix for the tmp dir basename, default "teamagent-m5-l4". */
  prefix?: string;
}

const DEFAULT_PREFIX = "teamagent-m5-l4";

/**
 * 在 os.tmpdir() 下创建一个隔离的父目录，内含 homeA / homeB /
 * projectA / projectB 四个子目录；每个 project 预创 `.teamagent/team/`，
 * 每个 home 预创 `.claude/`，供 m5-share / m5-sync 读写。
 */
export async function setupDualHomes(
  opts: DualHomeOptions = {},
): Promise<DualHomeContext> {
  const prefix = opts.prefix ?? DEFAULT_PREFIX;
  const uuid = randomUUID();
  const parentTemplate = path.join(os.tmpdir(), `${prefix}-${uuid}-`);
  const parent = await fs.mkdtemp(parentTemplate);

  const homeA = path.resolve(parent, "homeA");
  const homeB = path.resolve(parent, "homeB");
  const projectA = path.resolve(parent, "projectA");
  const projectB = path.resolve(parent, "projectB");

  await Promise.all([
    fs.mkdir(path.join(homeA, ".claude"), { recursive: true }),
    fs.mkdir(path.join(homeB, ".claude"), { recursive: true }),
    fs.mkdir(path.join(projectA, ".teamagent", "team"), { recursive: true }),
    fs.mkdir(path.join(projectB, ".teamagent", "team"), { recursive: true }),
  ]);

  const cleanup = async (): Promise<void> => {
    await fs.rm(parent, { recursive: true, force: true });
  };

  return { homeA, homeB, projectA, projectB, cleanup };
}
