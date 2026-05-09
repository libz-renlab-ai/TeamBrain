import { describe, it, expect } from "vitest";
import { executeWhatsNew, parseWhatsNewArgs } from "../commands/whatsnew.js";

const FIXTURE_CHANGELOG = `# CHANGELOG

## Unreleased

### Fixed

- pending only

## [0.10.5] — 2026-05-09

### Fixed

- **Issue #1**: Windows install fixed
- warmup exits 0 with skip message

## [0.10.2] — 2026-05-01

### Added

- Vector matcher BM25+dense RRF

## [0.10.1] — 2026-04-25

### Fixed

- old version
`;

describe("executeWhatsNew", () => {
  it("defaults --since to second-newest H2 and --until to newest H2", () => {
    const r = executeWhatsNew({ loadChangelog: () => FIXTURE_CHANGELOG });
    expect(r.ok).toBe(true);
    expect(r.output).toContain("Windows install fixed");
    expect(r.output).toContain("warmup exits 0");
    // 0.10.2 already surfaced means the from→to was 0.10.2 → 0.10.5; the
    // "Vector matcher" line belongs to 0.10.2 itself (excluded since it's
    // the from-version).
    expect(r.output).not.toContain("Vector matcher BM25");
    expect(r.output).not.toContain("old version");
  });

  it("honors --since to widen the range", () => {
    const r = executeWhatsNew({
      since: "0.10.1",
      loadChangelog: () => FIXTURE_CHANGELOG,
    });
    expect(r.output).toContain("Windows install fixed");
    expect(r.output).toContain("Vector matcher BM25");
    expect(r.output).not.toContain("old version"); // 0.10.1 itself excluded
  });

  it("honors --until to narrow the range", () => {
    const r = executeWhatsNew({
      since: "0.10.1",
      until: "0.10.2",
      loadChangelog: () => FIXTURE_CHANGELOG,
    });
    expect(r.output).toContain("Vector matcher BM25");
    expect(r.output).not.toContain("Windows install fixed");
  });

  it("honors --limit cap", () => {
    const r = executeWhatsNew({
      since: "0.10.1",
      limit: 1,
      loadChangelog: () => FIXTURE_CHANGELOG,
    });
    // Only one bullet should appear in the body; count " • " markers.
    const matches = r.output.match(/^\s*•\s/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it("prints help with --help", () => {
    const r = executeWhatsNew({ help: true });
    expect(r.ok).toBe(true);
    expect(r.output).toContain("Usage:");
    expect(r.output).toContain("whatsnew");
    expect(r.output).toContain("--since");
    expect(r.output).toContain("--until");
    expect(r.output).toContain("--limit");
  });

  it("prints fallback when CHANGELOG is missing", () => {
    const r = executeWhatsNew({ loadChangelog: () => "" });
    expect(r.ok).toBe(true);
    expect(r.output).toContain("CHANGELOG");
    expect(r.output).toContain("github.com/libz-renlab-ai/TeamBrain");
  });

  it("prints message when range has no bullets", () => {
    const r = executeWhatsNew({
      since: "0.10.5",
      until: "0.10.5",
      loadChangelog: () => FIXTURE_CHANGELOG,
    });
    expect(r.output).toContain("没有用户可见的变更");
  });
});

describe("parseWhatsNewArgs", () => {
  it("parses --since/--until/--limit (space form)", () => {
    const opts = parseWhatsNewArgs(["--since", "0.10.1", "--until", "0.10.5", "--limit", "3"]);
    expect(opts.since).toBe("0.10.1");
    expect(opts.until).toBe("0.10.5");
    expect(opts.limit).toBe(3);
  });

  it("parses --since=/--until=/--limit= (equals form)", () => {
    const opts = parseWhatsNewArgs(["--since=0.10.1", "--until=0.10.5", "--limit=3"]);
    expect(opts.since).toBe("0.10.1");
    expect(opts.until).toBe("0.10.5");
    expect(opts.limit).toBe(3);
  });

  it("parses --help", () => {
    expect(parseWhatsNewArgs(["--help"]).help).toBe(true);
    expect(parseWhatsNewArgs(["-h"]).help).toBe(true);
  });

  it("throws when --since lacks value", () => {
    expect(() => parseWhatsNewArgs(["--since"])).toThrow();
  });

  // Issue #225 iter-1 — guard NaN / non-positive --limit values.
  it("throws when --limit value is non-numeric", () => {
    expect(() => parseWhatsNewArgs(["--limit", "foo"])).toThrow(/正整数/);
    expect(() => parseWhatsNewArgs(["--limit=foo"])).toThrow(/正整数/);
  });

  it("throws when --limit value is zero or negative", () => {
    expect(() => parseWhatsNewArgs(["--limit", "0"])).toThrow(/正整数/);
    expect(() => parseWhatsNewArgs(["--limit", "-3"])).toThrow(/正整数/);
    expect(() => parseWhatsNewArgs(["--limit=-1"])).toThrow(/正整数/);
  });
});
