import type { TeamRuleFile } from "@teamagent/types";

/**
 * TeamRuleStorePort：对 .teamagent/team/<author>/<rule_id>.json 的读写抽象。
 *
 * 实现约束：
 * - listAll 必须包含所有 author 子目录的所有 rule
 * - writeRule 用 atomic write（temp + rename）确保不留半文件
 * - 同一 (claim_author, rule_id) 的 writeRule 会覆盖（因为是同一作者更新自己的 claim）
 *   ——这是 LWW 的本地体现：同一作者只保留最新版本
 */
export interface TeamRuleStorePort {
  /** 列出 .teamagent/team/ 下所有 (claim_author, file)。 */
  listAll(projectRoot: string): Promise<TeamRuleClaim[]>;

  /** 读单条；不存在返回 null。 */
  readRule(
    projectRoot: string,
    claimAuthor: string,
    ruleId: string
  ): Promise<TeamRuleFile | null>;

  /** 写单条（覆盖同 claim_author 的旧版本）。 */
  writeRule(
    projectRoot: string,
    claimAuthor: string,
    rule: TeamRuleFile
  ): Promise<void>;
}

export interface TeamRuleClaim {
  /** 文件所在的 author 子目录（= claim 写入者） */
  claim_author: string;
  file: TeamRuleFile;
}
