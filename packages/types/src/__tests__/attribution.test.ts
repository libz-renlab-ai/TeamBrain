import { describe, it, expect } from "vitest";
import { parseVisibilityMode, DEFAULT_VISIBILITY, sanitizeUserFacingText } from "../attribution.js";

describe("sanitizeUserFacingText", () => {
  it("strips 7-bit CSI sequences", () => {
    // \x1b[2J (erase display) + \x1b[H (cursor home)
    expect(sanitizeUserFacingText("\x1b[2J\x1b[H")).toBe("");
  });

  it("strips 7-bit OSC with BEL terminator", () => {
    expect(sanitizeUserFacingText("\x1b]0;hacked\x07")).toBe("");
  });

  it("strips 7-bit OSC with ST terminator", () => {
    expect(sanitizeUserFacingText("\x1b]0;hacked\x1b\\")).toBe("");
  });

  it("strips 8-bit CSI sequences", () => {
    // \x9b is C1 CSI; \x9b2J = erase display in 8-bit encoding
    expect(sanitizeUserFacingText("\x9b2J")).toBe("");
  });

  it("strips 8-bit OSC with ST terminator (\\x9c)", () => {
    expect(sanitizeUserFacingText("\x9d0;hacked\x9c")).toBe("");
  });

  it("strips lone high surrogate", () => {
    // \uD800 is a lone high surrogate (no following low surrogate)
    const lone = String.fromCharCode(0xD800);
    expect(sanitizeUserFacingText(lone)).toBe("");
  });

  it("strips lone low surrogate", () => {
    // \uDC00 is a lone low surrogate (no preceding high surrogate)
    const lone = String.fromCharCode(0xDC00);
    expect(sanitizeUserFacingText(lone)).toBe("");
  });

  it("passes clean UTF-8 with newlines and tabs intact", () => {
    expect(sanitizeUserFacingText("hello\nworld\t!")).toBe("hello\nworld\t!");
  });

  it("returns empty string for non-string input", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeUserFacingText(42 as any)).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeUserFacingText(null as any)).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeUserFacingText(undefined as any)).toBe("");
  });

  it("round-trips adversarial payload combining all attack vectors", () => {
    // Combines: 7-bit CSI, 7-bit OSC BEL, 7-bit OSC ST, 8-bit CSI, 8-bit OSC,
    // plus clean content that must survive.
    const adversarial =
      "\x1b[2J" +          // 7-bit CSI
      "keep1" +
      "\x1b]0;hijack\x07" + // 7-bit OSC + BEL
      "keep2" +
      "\x1b]0;hijack\x1b\\" + // 7-bit OSC + ST
      "keep3" +
      "\x9b2J" +           // 8-bit CSI
      "keep4" +
      "\x9d0;hijack\x9c" + // 8-bit OSC + ST
      "keep5";

    const result = sanitizeUserFacingText(adversarial);

    // All escape bytes must be gone
    expect(result).not.toContain("\x1b");
    expect(result).not.toContain("\x9b");
    expect(result).not.toContain("\x9d");
    expect(result).not.toContain("\x07");

    // Clean content must survive
    expect(result).toContain("keep1");
    expect(result).toContain("keep2");
    expect(result).toContain("keep3");
    expect(result).toContain("keep4");
    expect(result).toContain("keep5");
  });

  it("strips unterminated 8-bit OSC (\\x9d without ST/BEL)", () => {
    // The terminated-only 8-bit OSC regex would not catch this; the
    // C1-blanket strip is what catches it.
    expect(sanitizeUserFacingText("\x9dpayload")).toBe("payload");
  });

  it("strips bare 8-bit OSC + C1 control bytes without their sequences", () => {
    // C1 controls in isolation (e.g. malformed input) must not leak.
    // Note: bare \x9b followed by an ASCII letter in [@-~] gets consumed
    // by the terminated 8-bit CSI regex (the letter is the final byte),
    // which is correct behavior. Bare \x9d (no ST/BEL) and other C1
    // bytes (\x84, \x9f) are caught by the C1-blanket strip.
    expect(sanitizeUserFacingText("a\x9dc\x84d\x9fe")).toBe("acde");
  });

  it("strips ALL C1 control bytes in the \\x80-\\x9f range", () => {
    // Construct a string with every C1 byte; assert all stripped.
    const c1 = Array.from({ length: 32 }, (_, i) => String.fromCharCode(0x80 + i)).join("");
    expect(sanitizeUserFacingText(`pre${c1}post`)).toBe("prepost");
  });

  it("preserves Latin-1 supplement printable chars (\\xa0+)", () => {
    // \xa0 (non-breaking space) and above are valid printable chars; must
    // not be caught by the C1 strip.
    const text = "café — naïve¶";
    expect(sanitizeUserFacingText(text)).toBe(text);
  });
});

describe("parseVisibilityMode", () => {
  it("parses valid modes", () => {
    expect(parseVisibilityMode("silent")).toBe("silent");
    expect(parseVisibilityMode("smart")).toBe("smart");
    expect(parseVisibilityMode("verbose")).toBe("verbose");
  });

  it("falls back to default for unknown values", () => {
    expect(parseVisibilityMode("dev")).toBe(DEFAULT_VISIBILITY);
    expect(parseVisibilityMode(undefined)).toBe(DEFAULT_VISIBILITY);
    expect(parseVisibilityMode("")).toBe(DEFAULT_VISIBILITY);
  });

  it("default is verbose", () => {
    expect(DEFAULT_VISIBILITY).toBe("verbose");
  });
});
