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
