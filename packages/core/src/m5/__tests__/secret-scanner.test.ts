import { describe, it, expect } from "vitest";
import { runSecretScanPortContract } from "@teamagent/ports/contracts";
import { createSecretScanner, scanForSecrets } from "../secret-scanner.js";

describe("secret-scanner (regex)", () => {
  runSecretScanPortContract(() => createSecretScanner());
});

describe("secret-scanner W15 hardening", () => {
  it("W15-004: base64-encoded sk_proj API key is detected", () => {
    // Decodes to "sk_proj1234567890123456789"
    const text = "my secret token in b64: c2tfcHJvajEyMzQ1Njc4OTAxMjM0NTY3ODkw";
    const r = scanForSecrets(text);
    expect(r.hit).toBe(true);
    expect(r.matches.some((m) => m.kind === "api_token")).toBe(true);
  });

  it("W15-005: space-fragmented sk- prefix is detected", () => {
    const text = "key: sk - proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const r = scanForSecrets(text);
    expect(r.hit).toBe(true);
    expect(r.matches.some((m) => m.kind === "api_token")).toBe(true);
  });

  it("W15-006: Slack webhook URL is detected", () => {
    const text =
      "webhook: https://hooks.slack.com/services/T012AB3C4/B567CD89EF/abcDEFghijklmnopqrstuvw";
    const r = scanForSecrets(text);
    expect(r.hit).toBe(true);
    expect(r.matches.some((m) => m.kind === "api_token")).toBe(true);
  });

  it("W15-006: Discord webhook URL is detected", () => {
    const text =
      "https://discord.com/api/webhooks/123456789012345678/abcdEFGH-ijklMNOP_qrstUVWXyz0123456789ABCdef";
    const r = scanForSecrets(text);
    expect(r.hit).toBe(true);
    expect(r.matches.some((m) => m.kind === "api_token")).toBe(true);
  });

  it("W15-008: sk- + 19-char suffix is reported as api_token (not credit_card)", () => {
    const text = "API key sk-1234567890123456789";
    const r = scanForSecrets(text);
    expect(r.hit).toBe(true);
    const apiMatches = r.matches.filter((m) => m.kind === "api_token");
    const cardMatches = r.matches.filter((m) => m.kind === "credit_card");
    expect(apiMatches.length).toBeGreaterThanOrEqual(1);
    // credit_card must not be reported on the same span when api_token already
    // covers the suffix.
    expect(cardMatches.length).toBe(0);
  });

  it("W15-013: 600-char digit-rich text scans in <100ms (no regex backtracking cliff)", () => {
    const text =
      "1 ".repeat(100) + "2 ".repeat(100) + "3 ".repeat(100);
    const t0 = Date.now();
    scanForSecrets(text);
    const elapsed = Date.now() - t0;
    expect(elapsed, `scan took ${elapsed}ms (budget 100ms)`).toBeLessThan(100);
  });

  it("W15-013: 6KB pathological digit blob also stays well under 1s", () => {
    const text =
      "1 ".repeat(1000) + "2 ".repeat(1000) + "3 ".repeat(1000);
    const t0 = Date.now();
    scanForSecrets(text);
    const elapsed = Date.now() - t0;
    expect(elapsed, `scan took ${elapsed}ms (budget 1000ms)`).toBeLessThan(1000);
  });

  it("preserves: standard credit-card-like digit run still flags credit_card", () => {
    const text = "card: 4111 1111 1111 1111";
    const r = scanForSecrets(text);
    expect(r.matches.some((m) => m.kind === "credit_card")).toBe(true);
  });
});
