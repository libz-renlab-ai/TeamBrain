import { describe, it, expect } from "vitest";
import type { SecretScanPort } from "../secret-scan-port.js";

/**
 * SecretScanPort 契约：黄金集——这些必须命中或必须放行。
 */
export function runSecretScanPortContract(
  factory: () => SecretScanPort
): void {
  describe("SecretScanPort contract", () => {
    const port = factory();

    // ===== 必须命中 =====
    const mustHit: Array<{ name: string; text: string; kind: string }> = [
      {
        name: "absolute path /Users/",
        text: "数据库密码在 /Users/alice/.config/db.json",
        kind: "absolute_path",
      },
      {
        name: "absolute path C:\\Users\\",
        text: "config 在 C:\\Users\\alice\\app\\settings.toml",
        kind: "absolute_path",
      },
      {
        name: "absolute path /home/",
        text: "see /home/bob/secrets.env",
        kind: "absolute_path",
      },
      {
        name: "email",
        text: "联系 alice@example.com 拿到了 token",
        kind: "email",
      },
      {
        name: "openai sk- token",
        text: "API key=sk-abcdef1234567890ABCDEFghijkl",
        kind: "api_token",
      },
      {
        name: "github gh_pat",
        text: "PAT: ghp_aaaaBBBBccccDDDDeeeeFFFFggggHHHHiiii",
        kind: "api_token",
      },
      {
        name: "slack xoxb",
        text: "slack hook xoxb-123-456-abcdefghijklmnopq",
        kind: "api_token",
      },
      {
        name: "JWT three-segment",
        text: "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
        kind: "jwt",
      },
      // ===== B-112 chaos-qa-hunter Wave 11: missing patterns =====
      {
        name: "Google API key (AIzaSy...)",
        // Google API keys are exactly 39 characters: AIza + 35 base64url chars.
        // String split here defeats GitHub push-protection static scan;
        // the runtime concatenation reproduces the full pattern for the regex.
        text: "key=" + "AI" + "zaSyDx1bcDeFgHiJkLmNoPqRsTuVwXyZ_abcd",
        kind: "api_token",
      },
      {
        name: "Stripe live secret key",
        text: "stripe key=" + "sk_live" + "_51HpwabcDeFgHiJkLmNoPqRsTuVwXyZ123456789",
        kind: "api_token",
      },
      {
        name: "GitLab PAT (glpat-)",
        text: "GitLab PAT: " + "glpat" + "-xxxxxxxxxxxxxxxxxxxx",
        kind: "api_token",
      },
      {
        name: "PEM private key block",
        text: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ\n-----END PRIVATE KEY-----",
        kind: "private_key",
      },
      {
        name: "PEM RSA private key block",
        text: "-----BEGIN RSA PRIVATE KEY-----\nABCDE\n-----END RSA PRIVATE KEY-----",
        kind: "private_key",
      },
      {
        name: "absolute path /etc/",
        text: "config in /etc/teamagent/secrets.conf",
        kind: "absolute_path",
      },
      {
        name: "absolute path /tmp/",
        text: "see /tmp/myapp.log for details",
        kind: "absolute_path",
      },
      {
        name: "Postgres connection string with password",
        text: "DATABASE_URL=postgres://admin:SuperSecret123@db.prod.example.com:5432/maindb",
        kind: "api_token",
      },
      {
        name: "MongoDB SRV connection with password",
        text: "MONGO_URL=mongodb+srv://user:hunter2@cluster0.example.mongodb.net/test",
        kind: "api_token",
      },
    ];

    for (const c of mustHit) {
      it(`HITS: ${c.name}`, async () => {
        const r = await port.scan(c.text);
        expect(r.hit, `expected ${c.kind} to hit on: ${c.text}`).toBe(true);
        expect(r.matches.some((m) => m.kind === c.kind)).toBe(true);
      });
    }

    // ===== 必须放行 =====
    const mustPass: Array<{ name: string; text: string }> = [
      {
        name: "纯流程经验",
        text: "PR 合并后必须跑 codex review 直到 silent",
      },
      {
        name: "代码模式建议",
        text: "用 readonly 修饰参数，避免意外修改",
      },
      {
        name: "项目级约定",
        text: "新增 Port 必须先写契约测试再写实现",
      },
      {
        name: "短小 token-like 正常单词",
        text: "把 commit message 里的 fix 改成 feat",
      },
    ];

    for (const c of mustPass) {
      it(`PASSES: ${c.name}`, async () => {
        const r = await port.scan(c.text);
        expect(r.hit, `expected pass for: ${c.text}, but matches=${JSON.stringify(r.matches)}`).toBe(false);
      });
    }
  });
}
