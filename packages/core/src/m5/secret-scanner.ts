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

/**
 * W15-013: cap input length before scanning to prevent regex perf cliffs on
 * adversarial digit-rich strings. Real rule text is well under 4 KB; users
 * pasting bigger blobs typically have other problems and we want to fail
 * fast rather than stall the share pipeline for >1s.
 */
export const MAX_SCAN_INPUT_BYTES = 4096;

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
  // === api_token rules (placed BEFORE credit_card so overlap dedup picks
  //     the more-specific kind — W15-008) ===
  // OpenAI sk- token / Anthropic sk-ant- — W15-008: min 19 (was 20) so a
  // single character less than the historical limit no longer slips into
  // the credit_card pattern by accident.
  {
    kind: "api_token",
    pattern: /\bsk-[A-Za-z0-9_-]{19,}\b/g,
  },
  // OpenAI org-scoped sk_proj / sk_test variants (W15-004 base64-decoded form)
  {
    kind: "api_token",
    pattern: /\bsk_(?:proj|test|live|org)[A-Za-z0-9_-]{15,}\b/g,
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
  // === Webhook URLs (W15-006) — promoted to api_token kind so they seal
  //     L1 just like a real bearer token. Publishing one of these to a
  //     team git repo lets anyone post arbitrary messages to the channel. ===
  {
    kind: "api_token",
    // Slack incoming webhook
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/g,
  },
  {
    kind: "api_token",
    // Discord incoming webhook
    pattern: /https:\/\/(?:canary\.|ptb\.)?(?:discord(?:app)?\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
  },
  {
    kind: "api_token",
    // Microsoft Teams incoming webhook
    pattern: /https:\/\/[A-Za-z0-9-]+\.webhook\.office\.com\/webhookb2\/[A-Za-z0-9@/-]+\/IncomingWebhook\/[A-Za-z0-9/_-]+/g,
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
  // === credit_card LAST so api_token wins overlap dedup (W15-008) ===
  // Two non-backtracking alternatives: a contiguous 13-19 digit run, or
  // a standard 4-4-4-x card number with consistent separators. The
  // historical pattern /\b(?:\d[ -]?){13,19}\b/g exhibited catastrophic
  // backtracking on long alternating digit/whitespace blobs (W15-013).
  {
    kind: "credit_card",
    pattern: /\b\d{13,19}\b|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b/g,
  },
];

const SPACE_FRAGMENT_RE = /[\s ]+/g;

function isPrintable(s: string): boolean {
  if (!s.length) return false;
  let printable = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (
      (c >= 32 && c < 127) ||
      c === 9 ||
      c === 10 ||
      c === 13
    ) {
      printable++;
    }
  }
  return printable / s.length >= 0.8;
}

function scanRaw(text: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  for (const rule of PATTERNS) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      out.push({
        kind: rule.kind,
        snippet: redact(m[0]),
        start: m.index,
        end: m.index + m[0].length,
      });
      if (m.index === rule.pattern.lastIndex) rule.pattern.lastIndex++;
    }
  }
  return out;
}

/**
 * Recursively decode base64 candidates and feed the result through scanRaw.
 *
 * `outerAnchor` pins the reported {start,end} to the user-visible span in
 * the original input — when we recurse into a nested base64 blob, the
 * inner offsets are meaningless to the caller, so we keep the outer span.
 * `prefix` accumulates "b64:" once per layer, so `snippet` tells the
 * caller how deeply the secret was nested.
 *
 * Caller passes depthRemaining = 2 (PR #282 review follow-up to W15-004:
 * one-level decode missed double-encoded secrets).
 */
function scanBase64Recursive(
  text: string,
  outerAnchor: { start: number; end: number } | null,
  prefix: string,
  depthRemaining: number,
  out: SecretMatch[],
): void {
  if (depthRemaining <= 0) return;
  const re = /[A-Za-z0-9+/]{20,}={0,2}/g;
  let cand: RegExpExecArray | null;
  while ((cand = re.exec(text)) !== null) {
    let decoded: string;
    try {
      decoded = Buffer.from(cand[0], "base64").toString("utf-8");
    } catch {
      continue;
    }
    if (!isPrintable(decoded)) continue;
    const anchor =
      outerAnchor ?? { start: cand.index, end: cand.index + cand[0].length };
    for (const inner of scanRaw(decoded)) {
      out.push({
        kind: inner.kind,
        snippet: `${prefix}${inner.snippet}`,
        start: anchor.start,
        end: anchor.end,
      });
    }
    scanBase64Recursive(decoded, anchor, `b64:${prefix}`, depthRemaining - 1, out);
  }
}

/**
 * Drop credit_card matches whose span overlaps with an api_token match —
 * api_token is the more specific classification (W15-008).
 */
function dedupApiTokenOverCreditCard(matches: SecretMatch[]): SecretMatch[] {
  const apiTokens = matches.filter((m) => m.kind === "api_token");
  return matches.filter((m) => {
    if (m.kind !== "credit_card") return true;
    const overlaps = apiTokens.some(
      (a) => Math.max(a.start, m.start) < Math.min(a.end, m.end),
    );
    return !overlaps;
  });
}

/**
 * 纯函数：扫描文本是否含密钥/PII/机器特定信息。
 *
 * Hardening (Wave 15):
 * - W15-004: long base64-looking blobs are decoded and re-scanned so
 *   tokens hidden behind base64 still seal L1.
 * - W15-005: a whitespace-collapsed copy of the input is scanned in
 *   addition to the original to catch space-fragmented prefixes
 *   ("sk - proj-...").
 * - W15-006: hooks.slack.com / discord.com / *.webhook.office.com URLs
 *   are treated as api_token candidates.
 * - W15-008: api_token matches now win overlap dedup over credit_card so
 *   sk- + 19-digit suffix gets the right kind in diagnostics.
 * - W15-013: input is capped at MAX_SCAN_INPUT_BYTES and the credit_card
 *   pattern was rewritten to avoid catastrophic backtracking.
 */
export function scanForSecrets(text: string): SecretScanResult {
  const safe =
    text.length > MAX_SCAN_INPUT_BYTES
      ? text.slice(0, MAX_SCAN_INPUT_BYTES)
      : text;

  const matches: SecretMatch[] = scanRaw(safe);

  // W15-005: whitespace-collapsed retry. Append matches that the raw scan
  // missed (e.g. "sk - proj-..."). Offsets are mapped relative to the
  // collapsed string and tagged via the snippet so callers can tell.
  const collapsed = safe.replace(SPACE_FRAGMENT_RE, "");
  if (collapsed !== safe) {
    for (const m of scanRaw(collapsed)) {
      const already = matches.some(
        (x) => x.kind === m.kind && x.snippet === m.snippet,
      );
      if (!already) matches.push(m);
    }
  }

  // W15-004 (+ PR #282 review follow-up): base64-decode candidate blobs and
  // re-scan the decoded text. Recurse one extra level (depth 2) so a
  // double-encoded secret — Buffer.from(base64(sk-...)).toString("base64")
  // — does not slip past. Each layer is still capped by MAX_SCAN_INPUT_BYTES
  // (decoded output is shorter than its source, so the budget is
  // monotonically bounded).
  scanBase64Recursive(safe, null, "b64:", 2, matches);

  const deduped = dedupApiTokenOverCreditCard(matches);
  return { hit: deduped.length > 0, matches: deduped };
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
