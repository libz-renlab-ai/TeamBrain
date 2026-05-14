import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STOREFRONT_ENTRIES,
  STOREFRONT_COMMANDS,
  FOLDED_COMMANDS,
  BACKGROUND_COMMANDS,
  ALL_TRIAGED_COMMANDS,
  buildStorefrontHelp,
  isShowAll,
} from "../help-text.js";

/**
 * CLI surface triage — 67 subcommands cut into 3 tiers by the knife
 * "can this command prove a business feature?":
 *   - 8 storefront  (default `teamagent --help`)
 *   - 13 folded     (one-line list in `--help`)
 *   - 46 background (only under `teamagent help --all`)
 *
 * Presentation-only: every command keeps its `case` in bin.ts and stays
 * callable. These tests lock the tier counts, assert the union of the three
 * tiers exactly equals the `case` labels declared in bin.ts (drift guard),
 * and pin the `--all` flag semantics.
 */
describe("CLI surface triage — 3-tier command split", () => {
  it("tier sizes are 8 / 13 / 46, totalling 67", () => {
    expect(STOREFRONT_COMMANDS).toHaveLength(8);
    expect(FOLDED_COMMANDS).toHaveLength(13);
    expect(BACKGROUND_COMMANDS).toHaveLength(46);
    expect(ALL_TRIAGED_COMMANDS).toHaveLength(67);
  });

  it("the three tiers are disjoint (no command in two tiers)", () => {
    const seen = new Map<string, number>();
    for (const cmd of ALL_TRIAGED_COMMANDS) {
      seen.set(cmd, (seen.get(cmd) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c);
    expect(dupes).toEqual([]);
  });

  it("storefront tier matches the 8 commands chosen by the 3 business features", () => {
    expect([...STOREFRONT_COMMANDS]).toEqual([
      "init",
      "analyze",
      "doctor",
      "dashboard",
      "presence",
      "daily",
      "record",
      "video",
    ]);
  });

  it("STOREFRONT_ENTRIES is the single source: well-formed, unique, derives STOREFRONT_COMMANDS", () => {
    // STOREFRONT_COMMANDS is .map(e => e.name) of STOREFRONT_ENTRIES, so this
    // pins that no second hand-maintained name list can drift from it.
    expect(STOREFRONT_ENTRIES.map((e) => e.name)).toEqual([
      ...STOREFRONT_COMMANDS,
    ]);
    const names = STOREFRONT_ENTRIES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length); // no dupes
    for (const e of STOREFRONT_ENTRIES) {
      expect(e.group.length, `entry ${e.name} needs a group`).toBeGreaterThan(0);
      expect(e.usage, `entry ${e.name} usage`).toContain(`teamagent ${e.name}`);
      expect(e.desc.length, `entry ${e.name} needs a desc`).toBeGreaterThan(0);
    }
  });

  it("default `teamagent --help` lists every storefront command", () => {
    const help = buildStorefrontHelp();
    for (const cmd of STOREFRONT_COMMANDS) {
      expect(help).toContain(`teamagent ${cmd}`);
    }
  });

  it("default help lists all 13 folded commands and never leaks a background command", () => {
    const help = buildStorefrontHelp();
    expect(help).toContain("teamagent help --all");
    // The 13 folded commands render as a one-line list — assert each appears.
    for (const cmd of FOLDED_COMMANDS) {
      expect(help, `folded command ${cmd} missing from storefront help`).toContain(cmd);
    }
    // Background commands must not appear as a `teamagent <cmd>` line in the
    // storefront view — they live behind --all.
    for (const cmd of BACKGROUND_COMMANDS) {
      expect(help).not.toContain(`teamagent ${cmd}`);
    }
  });

  it("isShowAll triggers only on the explicit --all flag", () => {
    expect(isShowAll([])).toBe(false);
    expect(isShowAll(["--help"])).toBe(false);
    expect(isShowAll(["-h"])).toBe(false);
    expect(isShowAll(["--all"])).toBe(true);
    expect(isShowAll(["--help", "--all"])).toBe(true);
    // A bare positional `all` must NOT flip to full help — only `--all` does.
    expect(isShowAll(["all"])).toBe(false);
    expect(isShowAll(["help", "all"])).toBe(false);
  });

  it("union of the 3 tiers exactly equals the command `case` labels in bin.ts (drift guard)", () => {
    const binPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "bin.ts",
    );
    const src = fs.readFileSync(binPath, "utf8");
    // Collect every `case "<name>":` label from the dispatch switch. Anchored
    // to line start (after indent) so `case "..."` appearing inside a comment
    // or a string literal — e.g. a `// ... case "team": ...` doc comment — is
    // not mistaken for a real dispatch label.
    const caseLabels = new Set<string>();
    for (const m of src.matchAll(/^\s*case\s+"([^"]+)":/gm)) {
      if (m[1]) caseLabels.add(m[1]);
    }
    // Drop the non-command aliases: version/help variants and global flags.
    const NON_COMMANDS = new Set([
      "--version",
      "-V",
      "version",
      "--help",
      "-h",
      "help",
    ]);
    const realCommands = [...caseLabels].filter((c) => !NON_COMMANDS.has(c));

    const triaged = new Set(ALL_TRIAGED_COMMANDS);
    const untriaged = realCommands.filter((c) => !triaged.has(c)).sort();
    const stale = [...triaged].filter((c) => !caseLabels.has(c)).sort();

    // untriaged: a command exists in bin.ts but no tier claims it.
    expect(untriaged, `bin.ts commands missing a tier: ${untriaged.join(", ")}`).toEqual([]);
    // stale: a tier names a command that no longer exists in bin.ts.
    expect(stale, `triaged commands no longer in bin.ts: ${stale.join(", ")}`).toEqual([]);
  });
});
