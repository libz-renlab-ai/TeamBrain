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
   * - 非 hook 文件已存在则保留原内容（idempotency）
   * - hook 文件 (.githooks/post-merge / .githooks/pre-commit) chain-load
   *   via marker block，而非静默跳过 (W15-003)
   * - 创建的 hook 文件应该 chmod +x（Windows 上可能 no-op）
   *
   * 返回类型 Promise<unknown> 是 archived contract 的宽口径——具体实现可
   * return 任何分类结构（如 adapters 包的 ApplyInfectionResult），契约
   * 自身只关心副作用。
   */
  applyInfection(projectRoot: string, plan: InfectionPlan): Promise<unknown>;

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
