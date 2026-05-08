import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { LocalState, InfectionPlan } from "@teamagent/types";

/**
 * BootstrapPort：M5-A 引导/传染所需的 IO 抽象。
 *
 * 实现约束：
 * - 所有写入必须幂等（同样输入跑两次结果一致）
 * - applyInfection 不得覆盖已存在的文件
 * - readManifest 不存在时返回 null（不抛错）
 */
export interface BootstrapPort {
  /** 读项目的 manifest；不存在返回 null。 */
  readManifest(projectRoot: string): Promise<string | null>;

  /** 探测项目当前状态。 */
  probeProject(projectRoot: string): Promise<ProjectProbe>;

  /**
   * 把 InfectionPlan 写入项目。
   * - dirs_to_create 中已存在的目录跳过
   * - files_to_create 中已存在的文件跳过（不覆盖）
   * - 创建的 .githooks/pre-commit 应该 chmod +x（Windows 上可能 no-op）
   */
  applyInfection(projectRoot: string, plan: InfectionPlan): Promise<void>;

  /** 探测本机 TeamAgent 状态。 */
  getLocalState(): Promise<LocalState>;
}

export interface ProjectProbe {
  has_manifest: boolean;
  has_team_dir: boolean;
  has_shared_skills_dir: boolean;
  has_shared_claude_md: boolean;
  has_githooks_dir: boolean;
  has_pre_commit_hook: boolean;
  has_post_merge_hook: boolean;
}

export interface FsBootstrapDeps {
  /** 探测本机 TeamAgent 版本（如读包 package.json）。注入便于测试。 */
  readTeamagentVersion: () => Promise<string | null>;
  /** 已装插件名列表来源。 */
  readInstalledPlugins: () => Promise<string[]>;
  /** 已装项目级 skill 路径列表来源。 */
  readInstalledProjectSkills: () => Promise<string[]>;
  /** 已装 hook 列表来源。 */
  readInstalledHooks: () => Promise<LocalState["installed_hooks"]>;
}

export class FsBootstrap implements BootstrapPort {
  constructor(private deps: FsBootstrapDeps) {}

  async readManifest(projectRoot: string): Promise<string | null> {
    const p = path.join(projectRoot, ".teamagent", "manifest.json");
    try {
      return await fs.readFile(p, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async probeProject(projectRoot: string): Promise<ProjectProbe> {
    const exists = async (rel: string) => {
      try {
        await fs.access(path.join(projectRoot, rel));
        return true;
      } catch {
        return false;
      }
    };
    return {
      has_manifest: await exists(".teamagent/manifest.json"),
      has_team_dir: await exists(".teamagent/team"),
      has_shared_skills_dir: await exists(".teamagent/shared-skills"),
      has_shared_claude_md: await exists(".teamagent/shared-claude.md"),
      has_githooks_dir: await exists(".githooks"),
      has_pre_commit_hook: await exists(".githooks/pre-commit"),
      has_post_merge_hook: await exists(".githooks/post-merge"),
    };
  }

  async applyInfection(
    projectRoot: string,
    plan: InfectionPlan
  ): Promise<void> {
    for (const dir of plan.dirs_to_create) {
      await fs.mkdir(path.join(projectRoot, dir), { recursive: true });
    }
    for (const [rel, content] of Object.entries(plan.files_to_create)) {
      const p = path.join(projectRoot, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      try {
        // wx 标记：已存在则报错，确保幂等不覆盖
        await fs.writeFile(p, content, { flag: "wx" });
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw e;
        // 已存在跳过
        continue;
      }
      if (
        rel.endsWith("pre-commit") ||
        rel.endsWith("post-merge") ||
        rel.endsWith(".sh")
      ) {
        try {
          await fs.chmod(p, 0o755);
        } catch {
          // Windows 上 chmod 可能 no-op，忽略
        }
      }
    }
  }

  async getLocalState(): Promise<LocalState> {
    return {
      teamagent_version: await this.deps.readTeamagentVersion(),
      installed_plugins: await this.deps.readInstalledPlugins(),
      installed_project_skills: await this.deps.readInstalledProjectSkills(),
      installed_hooks: await this.deps.readInstalledHooks(),
    };
  }
}
