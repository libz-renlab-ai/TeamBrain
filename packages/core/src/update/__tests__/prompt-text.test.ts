import { describe, it, expect } from "vitest";
import { renderUpgradePrompt, renderWhatsNewTail } from "../prompt-text.js";
import type { ChangelogBullet } from "../changelog-parser.js";

const BULLETS: ChangelogBullet[] = [
  { version: "0.10.5", theme: "Fixed", bullet: "Windows install no longer destroys teamagent" },
  { version: "0.10.5", theme: "Fixed", bullet: "warmup exits 0 when optional vector deps absent" },
  { version: "0.10.2", theme: "Added", bullet: "Vector matcher BM25+dense RRF" },
];

describe("renderUpgradePrompt", () => {
  it("includes from→to version line, bullets, and the three CLI choices", () => {
    const out = renderUpgradePrompt({
      fromVersion: "0.10.1",
      toVersion: "0.10.5",
      bullets: BULLETS,
      snoozeLevel: 0,
    });
    expect(out).toContain("TeamAgent 0.10.5 可用");
    expect(out).toContain("0.10.1");
    expect(out).toContain("Windows install no longer destroys teamagent");
    expect(out).toContain("teamagent update --now");
    expect(out).toContain("teamagent update --snooze");
    expect(out).toContain("teamagent update --never");
  });

  it("prints theme prefix in [brackets] when set", () => {
    const out = renderUpgradePrompt({
      fromVersion: "0.10.1",
      toVersion: "0.10.5",
      bullets: BULLETS,
      snoozeLevel: 0,
    });
    expect(out).toContain("[Fixed]");
    expect(out).toContain("[Added]");
  });

  it("shows snooze counter footnote when snoozeLevel > 0", () => {
    const out = renderUpgradePrompt({
      fromVersion: "0.10.1",
      toVersion: "0.10.5",
      bullets: [],
      snoozeLevel: 2,
    });
    expect(out).toContain("已 snooze 2 次");
  });

  it("hides snooze counter when snoozeLevel = 0", () => {
    const out = renderUpgradePrompt({
      fromVersion: "0.10.1",
      toVersion: "0.10.5",
      bullets: [],
      snoozeLevel: 0,
    });
    expect(out).not.toContain("已 snooze");
  });

  it("falls back to (unknown) when fromVersion is empty", () => {
    const out = renderUpgradePrompt({
      fromVersion: "",
      toVersion: "0.10.5",
      bullets: [],
      snoozeLevel: 0,
    });
    expect(out).toContain("(unknown)");
  });
});

describe("renderWhatsNewTail", () => {
  it("produces the 🆕 tail with bullets", () => {
    const out = renderWhatsNewTail({
      installedVersion: "0.10.5",
      bullets: BULLETS,
    });
    expect(out).toContain("🆕");
    expect(out).toContain("0.10.5");
    expect(out).toContain("Windows install no longer destroys teamagent");
    expect(out).toContain("teamagent whatsnew");
  });

  it("returns empty string when no bullets", () => {
    const out = renderWhatsNewTail({
      installedVersion: "0.10.5",
      bullets: [],
    });
    expect(out).toBe("");
  });
});
