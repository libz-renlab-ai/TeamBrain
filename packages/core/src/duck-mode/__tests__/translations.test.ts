import { describe, it, expect } from "vitest";
import { TRANSLATIONS } from "../translations.js";

const DUCK_SIGNALS = ["呷呷", "鸭鸭", "(>ω<)", "🦆"];

describe("TRANSLATIONS", () => {
  it("every entry has a duck explanation with at least one signal token", () => {
    for (const t of TRANSLATIONS) {
      const hasSignal = DUCK_SIGNALS.some((s) => t.duck.includes(s));
      expect(hasSignal, `entry "${t.term}" missing duck signal token`).toBe(true);
    }
  });

  it("every duck explanation is Chinese-dominant (≥30% CJK chars)", () => {
    for (const t of TRANSLATIONS) {
      const cjk = t.duck.match(/[一-鿿]/g)?.length ?? 0;
      const ratio = cjk / t.duck.length;
      expect(ratio, `entry "${t.term}" not Chinese-dominant (${ratio.toFixed(2)})`).toBeGreaterThan(0.3);
    }
  });

  it("no English duck like 'quack quack'", () => {
    for (const t of TRANSLATIONS) {
      expect(t.duck.toLowerCase(), `entry "${t.term}" contains 'quack'`).not.toContain("quack");
    }
  });

  it("covers core install jargon", () => {
    const required = ["skills", "hooks", "embedding", "matcher", "mcp", "vector"];
    const allTerms = TRANSLATIONS.flatMap((t) => [t.term.toLowerCase(), ...(t.aliases ?? []).map((a) => a.toLowerCase())]);
    for (const r of required) {
      expect(allTerms, `missing core term "${r}"`).toContain(r);
    }
  });

  it("no duplicate term entries", () => {
    const seen = new Set<string>();
    for (const t of TRANSLATIONS) {
      expect(seen.has(t.term), `duplicate term "${t.term}"`).toBe(false);
      seen.add(t.term);
    }
  });
});
