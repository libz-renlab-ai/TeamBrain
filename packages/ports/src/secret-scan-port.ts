/**
 * SecretScanPort：闸门 1。检查规则文本是否含密钥/PII/机器特定信息。
 * 命中即"sealed"，规则永停 L1（个人本地），不能进 L2（团队共享）。
 *
 * 实现约束：
 * - 必须是同步或 cheap async（每条规则保存时调用）
 * - 已知模式必须命中（见契约黄金集）
 * - 不抛错；命中信息走返回值
 */
export interface SecretScanPort {
  scan(text: string): Promise<SecretScanResult>;
}

export interface SecretScanResult {
  /** 是否命中任一密钥模式 */
  hit: boolean;
  /** 命中详情（用于事件流和用户提示） */
  matches: SecretMatch[];
}

export interface SecretMatch {
  /** 模式分类 */
  kind:
    | "absolute_path"
    | "email"
    | "phone"
    | "credit_card"
    | "api_token"
    | "jwt"
    | "private_key"
    | "high_entropy";
  /** 命中片段（用于提示，可能被截短） */
  snippet: string;
  /** 命中起始 / 结束 offset（在原文中） */
  start: number;
  end: number;
}
