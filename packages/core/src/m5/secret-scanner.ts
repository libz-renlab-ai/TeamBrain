import type {
  SecretScanPort,
  SecretScanResult,
  SecretMatch,
} from "@teamagent/ports";

/**
 * 闸门 1：硬性密钥扫描器。
 * 纯函数 + Port 实现工厂。
 *
 * 模式来源：spec §6.2 + 业内常见 secret 形态。
 * 设计原则：宁错杀不漏放（高熵阈值偏严）。
 */

interface PatternRule {
  kind: SecretMatch["kind"];
  pattern: RegExp;
}

const PATTERNS: PatternRule[] = [
  // 绝对路径
  {
    kind: "absolute_path",
    pattern: /(?:\/Users|\/home|\/root|\/etc|\/var|\/opt|\/tmp|\/mnt|\/data|\/private\/var)\/[A-Za-z0-9._-]+/g,
  },
  {
    kind: "absolute_path",
    pattern: /[A-Za-z]:\\(?:Users|Program Files|Program Files \(x86\)|Windows|ProgramData)\\[A-Za-z0-9._\\-]+/g,
  },
  // 邮箱
  {
    kind: "email",
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  // 电话（中美常见格式；保守以避免误杀短数字串）
  {
    kind: "phone",
    pattern: /(?:\+?1[\s-]?)?\(?\d{3}\)?[\s-]\d{3}[\s-]\d{4}\b|\b1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}\b/g,
  },
  // 信用卡（13-19 位连续数字，可带分隔）
  {
    kind: "credit_card",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
  },
  // OpenAI sk- token / Anthropic sk-ant-
  {
    kind: "api_token",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  },
  // Stripe live/test key (sk_live_, sk_test_, pk_live_, pk_test_, rk_live_, etc.)
  {
    kind: "api_token",
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
  },
  // GitHub PAT
  {
    kind: "api_token",
    pattern: /\bgh[psuro]_[A-Za-z0-9_]{16,}\b/g,
  },
  // GitLab PAT
  {
    kind: "api_token",
    pattern: /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
  },
  // Slack tokens
  {
    kind: "api_token",
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  // AWS Access Key
  {
    kind: "api_token",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  // Google API Key (AIzaSy...)
  {
    kind: "api_token",
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g,
  },
  // PEM-encoded private keys (RSA/EC/OPENSSH/generic)
  {
    kind: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  // Database connection string with embedded password
  // postgres://user:password@host, mongodb://user:pass@host, mysql://, redis://
  {
    kind: "api_token",
    pattern: /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|redis|amqp|amqps):\/\/[A-Za-z0-9._%+-]+:[^\s@]{4,}@[A-Za-z0-9.-]+/g,
  },
  // JWT 三段式（base64url. base64url. base64url）
  {
    kind: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
];

/**
 * 纯函数：扫描文本是否含密钥/PII/机器特定信息。
 */
export function scanForSecrets(text: string): SecretScanResult {
  const matches: SecretMatch[] = [];
  for (const rule of PATTERNS) {
    rule.pattern.lastIndex = 0; // global regex 状态重置
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      matches.push({
        kind: rule.kind,
        snippet: redact(m[0]),
        start: m.index,
        end: m.index + m[0].length,
      });
      // 防御无穷循环（zero-width match）
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
    }
  }
  return { hit: matches.length > 0, matches };
}

/**
 * 把命中片段脱敏成 `xxxx[redacted-N]` 形式（保留前 4 字符 + 长度提示），
 * 避免事件流把完整密钥又输出一次。
 */
function redact(s: string): string {
  if (s.length <= 4) return "[redacted]";
  return `${s.slice(0, 4)}[redacted-${s.length}]`;
}

/** Port 实现工厂。 */
export function createSecretScanner(): SecretScanPort {
  return {
    async scan(text: string): Promise<SecretScanResult> {
      return scanForSecrets(text);
    },
  };
}
