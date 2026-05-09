import { describe, it, expect } from "vitest";
import { parseChangelog, compareVersion } from "../changelog-parser.js";

const SAMPLE = `# TeamBrain CHANGELOG

intro paragraph

## Unreleased

### Fixed

- This belongs to a future version, must not surface

## [0.10.5] — 2026-05-09

### Fixed

- **Issue #158**: Windows install no longer destroys prior teamagent install (#158)
  This is a continuation line indented under the bullet that should not surface
- **Issue #160**: warmup now exits 0 with friendly skip message

### Changed

- Hooks bundled at \`~/.teamagent/hooks/\` so worktree cleanup doesn't break them

## [0.10.2] — 2026-05-01

### Added

- Vector matcher BM25+dense RRF
- Stack packs first-class: \`teamagent pack list\`

## [0.10.1] — 2026-04-25

### Fixed

- This version is FROM, must not surface
`;

describe("parseChangelog", () => {
  it("returns bullets only between fromVersion (exclusive) and toVersion (inclusive)", () => {
    const out = parseChangelog(SAMPLE, "0.10.1", "0.10.5");
    const versions = new Set(out.map((b) => b.version));
    expect(versions).toEqual(new Set(["0.10.2", "0.10.5"]));
    // 0.10.1 must be excluded
    expect(out.find((b) => b.version === "0.10.1")).toBeUndefined();
    // Unreleased must be excluded
    expect(out.find((b) => b.bullet.includes("future version"))).toBeUndefined();
  });

  it("strips **Issue #N**: prefix and trailing (#N) reference", () => {
    const out = parseChangelog(SAMPLE, "0.10.1", "0.10.5");
    const winFix = out.find((b) => b.bullet.includes("Windows install"));
    expect(winFix).toBeDefined();
    expect(winFix!.bullet).not.toContain("**Issue");
    expect(winFix!.bullet).not.toMatch(/\(#\d+\)/);
  });

  it("preserves theme from ### subsection", () => {
    const out = parseChangelog(SAMPLE, "0.10.1", "0.10.5");
    const fixed = out.filter((b) => b.theme === "Fixed");
    const changed = out.filter((b) => b.theme === "Changed");
    expect(fixed.length).toBeGreaterThan(0);
    expect(changed.length).toBeGreaterThan(0);
  });

  it("returns [] when fromVersion >= toVersion", () => {
    expect(parseChangelog(SAMPLE, "0.10.5", "0.10.5")).toEqual([]);
    expect(parseChangelog(SAMPLE, "0.10.5", "0.10.2")).toEqual([]);
  });

  it("returns [] for empty content", () => {
    expect(parseChangelog("", "0.10.1", "0.10.5")).toEqual([]);
  });

  it("respects maxBullets cap (default 7, custom honored)", () => {
    const longSample = `## [1.0.0]\n\n### Added\n\n- a\n- b\n- c\n- d\n- e\n- f\n- g\n- h\n- i\n- j\n`;
    expect(parseChangelog(longSample, "0.0.0", "1.0.0")).toHaveLength(7);
    expect(parseChangelog(longSample, "0.0.0", "1.0.0", { maxBullets: 3 })).toHaveLength(3);
  });

  it("ignores continuation lines (indented under a bullet)", () => {
    const out = parseChangelog(SAMPLE, "0.10.1", "0.10.5");
    expect(out.find((b) => b.bullet.includes("continuation line"))).toBeUndefined();
  });

  it("handles unreleased-only changelog as []", () => {
    const onlyUnreleased = `## Unreleased\n\n### Fixed\n\n- pending\n`;
    expect(parseChangelog(onlyUnreleased, "0.10.1", "0.10.5")).toEqual([]);
  });
});

describe("compareVersion", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersion("1.2.3", "1.2.3")).toBe(0);
  });
  it("returns -1 when a < b", () => {
    expect(compareVersion("0.10.1", "0.10.5")).toBe(-1);
    expect(compareVersion("0.9.99", "0.10.0")).toBe(-1);
    expect(compareVersion("1.0.0", "1.0.1")).toBe(-1);
  });
  it("returns 1 when a > b", () => {
    expect(compareVersion("0.10.5", "0.10.1")).toBe(1);
    expect(compareVersion("1.2.3", "1.2.0")).toBe(1);
  });
  it("treats missing parts as 0", () => {
    expect(compareVersion("1", "1.0.0")).toBe(0);
    expect(compareVersion("1.2", "1.2.1")).toBe(-1);
  });
});
