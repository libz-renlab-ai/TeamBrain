/**
 * Sandbox integration tests for all TeamAgent CLI features.
 * Tests non-interactive, non-destructive paths only.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { parseScanErrorsArgs, resolveSince } from "../commands/scan-errors.js";
import { parsePitfallArgs } from "../commands/pitfall.js";
import { parseAnalyzeArgs } from "../commands/analyze.js";
import { parseReviewArgs } from "../commands/review.js";
import { parseInitArgs } from "../commands/init.js";
import { parseCompileArgs } from "../commands/compile.js";
import { parseCalibrateArgs } from "../commands/calibrate.js";
import { parseVerifyArgs } from "../commands/verify.js";
import { parseE2EEvaluateArgs, executeE2EEvaluate } from "../commands/e2e-evaluate.js";
import { parseBugReportArgs } from "../commands/bug-report.js";
import { parseDogfoodReportArgs } from "../commands/dogfood-report.js";
import { parseDashboardArgs } from "../commands/dashboard.js";
import { parseIngestArgs } from "../commands/ingest.js";
import { parseDoctorArgs } from "../commands/doctor.js";
import { parseInstallPluginsArgs } from "../commands/install-plugins.js";
import { executeConfig } from "../commands/config.js";
import { executeDemoHook, parseDemoHookArgs } from "../commands/demo-hook.js";
import { runSkeletonDemo } from "../commands/skeleton-demo.js";
import { parseUninstallArgs } from "../commands/uninstall.js";
import { parsePrCycleArgs } from "../commands/pr-cycle.js";
import { parseReviewCandidatesArgs } from "../commands/review-candidates.js";
import { deterministicRuleEmbedder } from "./deterministic-rule-embedder.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ta-sandbox-"));
}

const NOW = new Date("2026-05-02T00:00:00Z");

// ─── Feature: scan-errors --since duration parsing ───────────────────────────

describe("Feature: scan-errors --since duration parsing", () => {
  let home: string;
  beforeEach(() => { home = tmpDir(); });
  afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

  it("parses --since=24h (hours)", () => {
    const result = resolveSince("24h", home, NOW);
    expect(result.getTime()).toBe(NOW.getTime() - 24 * 3600_000);
  });

  it("parses --since=1h", () => {
    const result = resolveSince("1h", home, NOW);
    expect(result.getTime()).toBe(NOW.getTime() - 1 * 3600_000);
  });

  it("parses --since=7d (days) — was broken", () => {
    const result = resolveSince("7d", home, NOW);
    expect(result.getTime()).toBe(NOW.getTime() - 7 * 24 * 3600_000);
  });

  it("parses --since=1d", () => {
    const result = resolveSince("1d", home, NOW);
    expect(result.getTime()).toBe(NOW.getTime() - 1 * 24 * 3600_000);
  });

  it("parses --since=30d", () => {
    const result = resolveSince("30d", home, NOW);
    expect(result.getTime()).toBe(NOW.getTime() - 30 * 24 * 3600_000);
  });

  it("parses ISO date string", () => {
    const result = resolveSince("2026-01-01", home, NOW);
    expect(result.toISOString().startsWith("2026-01-01")).toBe(true);
  });

  it("throws on invalid format 'bad'", () => {
    expect(() => resolveSince("bad", home, NOW)).toThrow("格式无效");
  });

  it("throws on format like '7days'", () => {
    expect(() => resolveSince("7days", home, NOW)).toThrow("格式无效");
  });

  it("defaults to 24h ago when no state file exists", () => {
    const result = resolveSince(undefined, home, NOW);
    expect(result.getTime()).toBe(NOW.getTime() - 24 * 3600_000);
  });

  it("uses saved lastScanAt state when sinceRaw is undefined", () => {
    const stateDir = path.join(home, ".teamagent");
    fs.mkdirSync(stateDir, { recursive: true });
    const savedAt = "2026-04-28T00:00:00.000Z";
    fs.writeFileSync(path.join(stateDir, "scan-state.json"), JSON.stringify({ lastScanAt: savedAt }));
    const result = resolveSince(undefined, home, NOW);
    expect(result.toISOString()).toBe(savedAt);
  });

  it("CLI parseScanErrorsArgs stores sinceRaw='7d'", () => {
    const opts = parseScanErrorsArgs(["--since=7d"]);
    expect(opts.sinceRaw).toBe("7d");
  });

  it("CLI parseScanErrorsArgs --since 7d (space separator)", () => {
    const opts = parseScanErrorsArgs(["--since", "7d"]);
    expect(opts.sinceRaw).toBe("7d");
  });

  it("CLI parseScanErrorsArgs --since=2026-04-01", () => {
    const opts = parseScanErrorsArgs(["--since=2026-04-01"]);
    expect(opts.sinceRaw).toBe("2026-04-01");
  });
});

// ─── Feature: pitfall arg parsing ───────────────────────────────────────────

describe("Feature: pitfall --non-interactive arg parsing", () => {
  it("returns null without --non-interactive flag", () => {
    expect(parsePitfallArgs([])).toBeNull();
    expect(parsePitfallArgs(["--trigger=t"])).toBeNull();
  });

  it("parses required fields and returns PitfallInput", () => {
    const args = parsePitfallArgs([
      "--non-interactive",
      "--trigger=foo trigger",
      "--wrong=bad thing",
      "--correct=good thing",
      "--reason=because",
    ]);
    expect(args).not.toBeNull();
    expect(args!.trigger).toBe("foo trigger");
    expect(args!.wrong).toBe("bad thing");
    expect(args!.correct).toBe("good thing");
    expect(args!.reason).toBe("because");
  });

  it("parses optional category=E", () => {
    const args = parsePitfallArgs([
      "--non-interactive",
      "--trigger=t", "--wrong=w", "--correct=c", "--reason=r",
      "--category=E",
    ]);
    expect(args!.category).toBe("E");
  });

  it("parses optional level=team", () => {
    const args = parsePitfallArgs([
      "--non-interactive",
      "--trigger=t", "--wrong=w", "--correct=c", "--reason=r",
      "--level=team",
    ]);
    expect(args!.level).toBe("team");
  });

  it("omits category/level from returned object when not specified", () => {
    const args = parsePitfallArgs([
      "--non-interactive",
      "--trigger=t", "--wrong=w", "--correct=c", "--reason=r",
    ]);
    expect(args!.category).toBeUndefined();
    expect(args!.level).toBeUndefined();
  });

  it("parses all valid categories C/E/S/K", () => {
    for (const cat of ["C", "E", "S", "K"] as const) {
      const args = parsePitfallArgs([
        "--non-interactive",
        "--trigger=t", "--wrong=w", "--correct=c", "--reason=r",
        `--category=${cat}`,
      ]);
      expect(args!.category).toBe(cat);
    }
  });

  it("parses all valid levels personal/team/global", () => {
    for (const level of ["personal", "team", "global"] as const) {
      const args = parsePitfallArgs([
        "--non-interactive",
        "--trigger=t", "--wrong=w", "--correct=c", "--reason=r",
        `--level=${level}`,
      ]);
      expect(args!.level).toBe(level);
    }
  });

  it("throws on invalid category", () => {
    expect(() => parsePitfallArgs([
      "--non-interactive",
      "--trigger=t", "--wrong=w", "--correct=c", "--reason=r",
      "--category=Z",
    ])).toThrow();
  });

  it("throws when required fields are missing", () => {
    expect(() => parsePitfallArgs([
      "--non-interactive",
      "--trigger=t",
      // missing --correct and --reason
    ])).toThrow();
  });
});

// ─── Feature: analyze arg parsing ───────────────────────────────────────────

describe("Feature: analyze arg parsing", () => {
  it("defaults commit=undefined verbose=undefined", () => {
    const args = parseAnalyzeArgs([]);
    expect(args.commit).toBeUndefined();
    expect(args.verbose).toBeUndefined();
  });

  it("parses --commit flag", () => {
    const args = parseAnalyzeArgs(["--commit"]);
    expect(args.commit).toBe(true);
  });

  it("parses --verbose flag", () => {
    const args = parseAnalyzeArgs(["--verbose"]);
    expect(args.verbose).toBe(true);
  });

  it("parses --session=<path>", () => {
    const args = parseAnalyzeArgs(["--session=/tmp/foo.jsonl"]);
    expect(args.session).toBe("/tmp/foo.jsonl");
  });

  it("parses --session <path> (space)", () => {
    const args = parseAnalyzeArgs(["--session", "/tmp/bar.jsonl"]);
    expect(args.session).toBe("/tmp/bar.jsonl");
  });
});

// ─── Feature: review arg parsing ────────────────────────────────────────────

describe("Feature: review arg parsing", () => {
  it("defaults to limit=undefined (executeReview uses 10)", () => {
    const args = parseReviewArgs([]);
    expect(args.limit).toBeUndefined();
  });

  it("parses positional N as limit", () => {
    const args = parseReviewArgs(["5"]);
    expect(args.limit).toBe(5);
  });

  it("parses --limit=N", () => {
    const args = parseReviewArgs(["--limit=20"]);
    expect(args.limit).toBe(20);
  });

  it("parses --scope=team", () => {
    const args = parseReviewArgs(["--scope=team"]);
    expect(args.scope).toBe("team");
  });

  it("parses --scope=global", () => {
    const args = parseReviewArgs(["--scope=global"]);
    expect(args.scope).toBe("global");
  });
});

// ─── Feature: init arg parsing ──────────────────────────────────────────────

describe("Feature: init arg parsing", () => {
  it("defaults all flags undefined, target undefined (executeInit applies defaults)", () => {
    const args = parseInitArgs([]);
    expect(args.dryRun).toBeUndefined();
    expect(args.skipImport).toBeUndefined();
    expect(args.skipHook).toBeUndefined();
    expect(args.target).toBeUndefined();
  });

  it("parses --dry-run", () => {
    expect(parseInitArgs(["--dry-run"]).dryRun).toBe(true);
  });

  it("parses --skip-import", () => {
    expect(parseInitArgs(["--skip-import"]).skipImport).toBe(true);
  });

  it("parses --target=codex", () => {
    expect(parseInitArgs(["--target=codex"]).target).toBe("codex");
  });

  it("parses --target=both", () => {
    expect(parseInitArgs(["--target=both"]).target).toBe("both");
  });

  it("parses --target=claude explicitly", () => {
    expect(parseInitArgs(["--target=claude"]).target).toBe("claude");
  });

  it("parses --install-plugins", () => {
    expect(parseInitArgs(["--install-plugins"]).installPlugins).toBe(true);
  });
});

// ─── Feature: compile arg parsing ───────────────────────────────────────────

describe("Feature: compile arg parsing", () => {
  it("defaults all flags undefined (executeCompile applies defaults)", () => {
    const args = parseCompileArgs([]);
    expect(args.dryRun).toBeUndefined();
    expect(args.skillsOnly).toBeUndefined();
    expect(args.markdownOnly).toBeUndefined();
    expect(args.force).toBeUndefined();
    expect(args.target).toBeUndefined();
  });

  it("parses --dry-run", () => {
    expect(parseCompileArgs(["--dry-run"]).dryRun).toBe(true);
  });

  it("parses --skills-only", () => {
    expect(parseCompileArgs(["--skills-only"]).skillsOnly).toBe(true);
  });

  it("parses --markdown-only", () => {
    expect(parseCompileArgs(["--markdown-only"]).markdownOnly).toBe(true);
  });

  it("parses --force", () => {
    expect(parseCompileArgs(["--force"]).force).toBe(true);
  });

  it("parses --target=codex", () => {
    expect(parseCompileArgs(["--target=codex"]).target).toBe("codex");
  });

  it("parses --target=both", () => {
    expect(parseCompileArgs(["--target=both"]).target).toBe("both");
  });
});

// ─── Feature: calibrate arg parsing ─────────────────────────────────────────

describe("Feature: calibrate arg parsing", () => {
  it("defaults days/dryRun undefined (executeCalibrate applies defaults)", () => {
    const args = parseCalibrateArgs([]);
    expect(args.days).toBeUndefined();
    expect(args.dryRun).toBeUndefined();
  });

  it("parses --days=30", () => {
    expect(parseCalibrateArgs(["--days=30"]).days).toBe(30);
  });

  it("parses --days=7 explicitly", () => {
    expect(parseCalibrateArgs(["--days=7"]).days).toBe(7);
  });

  it("parses --dry-run", () => {
    expect(parseCalibrateArgs(["--dry-run"]).dryRun).toBe(true);
  });
});

// ─── Feature: verify arg parsing ─────────────────────────────────────────────

describe("Feature: verify arg parsing", () => {
  it("defaults reportPath=undefined", () => {
    const args = parseVerifyArgs([]);
    expect(args.reportPath).toBeUndefined();
  });

  it("parses --report=<path> into reportPath", () => {
    const args = parseVerifyArgs(["--report=/tmp/report.json"]);
    expect(args.reportPath).toBe("/tmp/report.json");
  });

  it("parses --report <path> (space)", () => {
    const args = parseVerifyArgs(["--report", "/tmp/r.json"]);
    expect(args.reportPath).toBe("/tmp/r.json");
  });
});

// ─── Feature: e2e-evaluate arg parsing ──────────────────────────────────────

describe("Feature: e2e-evaluate arg parsing", () => {
  it("defaults json/keepTemp undefined (executeE2EEvaluate applies defaults)", () => {
    const args = parseE2EEvaluateArgs([]);
    expect(args.json).toBeUndefined();
    expect(args.keepTemp).toBeUndefined();
  });

  it("parses --json", () => {
    expect(parseE2EEvaluateArgs(["--json"]).json).toBe(true);
  });

  it("parses --keep-temp", () => {
    expect(parseE2EEvaluateArgs(["--keep-temp"]).keepTemp).toBe(true);
  });
});

// ─── Feature: doctor arg parsing ─────────────────────────────────────────────

describe("Feature: doctor arg parsing", () => {
  it("defaults fix=false json=false", () => {
    const args = parseDoctorArgs([]);
    expect(args.fix).toBe(false);
    expect(args.json).toBe(false);
  });

  it("parses --fix", () => {
    expect(parseDoctorArgs(["--fix"]).fix).toBe(true);
  });

  it("parses --json", () => {
    expect(parseDoctorArgs(["--json"]).json).toBe(true);
  });
});

// ─── Feature: install-plugins arg parsing ───────────────────────────────────

describe("Feature: install-plugins arg parsing", () => {
  it("defaults dryRun=false", () => {
    expect(parseInstallPluginsArgs([]).dryRun).toBe(false);
  });

  it("parses --dry-run", () => {
    expect(parseInstallPluginsArgs(["--dry-run"]).dryRun).toBe(true);
  });

  it("parses --only=superpowers,caveman", () => {
    const args = parseInstallPluginsArgs(["--only=superpowers,caveman"]);
    expect(args.only).toContain("superpowers");
    expect(args.only).toContain("caveman");
  });

  it("parses --scope=project", () => {
    expect(parseInstallPluginsArgs(["--scope=project"]).scope).toBe("project");
  });
});

// ─── Feature: bug-report arg parsing ────────────────────────────────────────

describe("Feature: bug-report arg parsing", () => {
  it("defaults stdout=false", () => {
    expect(parseBugReportArgs([]).stdout).toBe(false);
  });

  it("parses --stdout", () => {
    expect(parseBugReportArgs(["--stdout"]).stdout).toBe(true);
  });

  it("parses --out=<path> into outputPath", () => {
    expect(parseBugReportArgs(["--out=/tmp/bug.md"]).outputPath).toBe("/tmp/bug.md");
  });
});

// ─── Feature: dogfood-report arg parsing ────────────────────────────────────

describe("Feature: dogfood-report arg parsing", () => {
  it("defaults outputPath=undefined", () => {
    expect(parseDogfoodReportArgs([]).outputPath).toBeUndefined();
  });

  it("parses --output=<path> into outputPath", () => {
    expect(parseDogfoodReportArgs(["--output=/tmp/df.md"]).outputPath).toBe("/tmp/df.md");
  });
});

// ─── Feature: dashboard arg parsing ─────────────────────────────────────────

describe("Feature: dashboard arg parsing", () => {
  it("parses --once mode", () => {
    const args = parseDashboardArgs(["--once"]);
    expect(args.once).toBe(true);
    expect(args.watch).toBeUndefined();
  });

  it("parses --watch mode", () => {
    const args = parseDashboardArgs(["--watch"]);
    expect(args.watch).toBe(true);
  });

  it("parses --port=9000", () => {
    const args = parseDashboardArgs(["--watch", "--port=9000"]);
    expect(args.port).toBe(9000);
  });

  it("defaults port=8787", () => {
    const args = parseDashboardArgs(["--watch"]);
    expect(args.port).toBe(8787);
  });

  it("throws when --watch and --once combined", () => {
    expect(() => parseDashboardArgs(["--watch", "--once"])).toThrow();
  });
});

// ─── Feature: ingest arg parsing ────────────────────────────────────────────

describe("Feature: ingest arg parsing", () => {
  it("parses --from-audit → source='npm-audit'", () => {
    expect(parseIngestArgs(["--from-audit"]).source).toBe("npm-audit");
  });

  it("parses --from-git → source='git-hotspot'", () => {
    expect(parseIngestArgs(["--from-git"]).source).toBe("git-hotspot");
  });

  it("parses --from-ci → source='ci-failure'", () => {
    expect(parseIngestArgs(["--from-ci"]).source).toBe("ci-failure");
  });

  it("parses --dry-run with --from-audit", () => {
    expect(parseIngestArgs(["--from-audit", "--dry-run"]).dryRun).toBe(true);
  });

  it("throws when no source flag given", () => {
    expect(() => parseIngestArgs([])).toThrow();
  });
});

// ─── Feature: uninstall arg parsing ─────────────────────────────────────────

describe("Feature: uninstall arg parsing", () => {
  it("defaults deleteData/dryRun undefined", () => {
    const args = parseUninstallArgs([]);
    expect(args.deleteData).toBeUndefined();
    expect(args.dryRun).toBeUndefined();
  });

  it("parses --delete-data", () => {
    expect(parseUninstallArgs(["--delete-data"]).deleteData).toBe(true);
  });

  it("parses --dry-run", () => {
    expect(parseUninstallArgs(["--dry-run"]).dryRun).toBe(true);
  });
});

// ─── Feature: pr-cycle arg parsing ──────────────────────────────────────────

describe("Feature: pr-cycle arg parsing", () => {
  it("parses --pr=16", () => {
    expect(parsePrCycleArgs(["--pr=16"]).pr).toBe(16);
  });

  it("parses --dry-run", () => {
    expect(parsePrCycleArgs(["--dry-run"]).dryRun).toBe(true);
  });

  it("defaults pr=undefined dryRun=false", () => {
    const args = parsePrCycleArgs([]);
    expect(args.pr).toBeUndefined();
    expect(args.dryRun).toBe(false);
  });
});

// ─── Feature: review-candidates arg parsing ──────────────────────────────────

describe("Feature: review-candidates arg parsing", () => {
  it("defaults limit to a number", () => {
    const args = parseReviewCandidatesArgs([]);
    expect(typeof args.limit).toBe("number");
  });

  it("parses --limit=5", () => {
    expect(parseReviewCandidatesArgs(["--limit=5"]).limit).toBe(5);
  });
});

// ─── Feature: config executeConfig ───────────────────────────────────────────

describe("Feature: config show", () => {
  it("returns JSON string with stop_mode key", () => {
    const result = executeConfig({ subcommand: "show" });
    expect(result).toBeDefined();
    const parsed = JSON.parse(result ?? "{}") as Record<string, unknown>;
    expect(parsed).toHaveProperty("stop_mode");
  });

  it("returns known stop_mode values sync or async", () => {
    const result = executeConfig({ subcommand: "show" });
    const parsed = JSON.parse(result ?? "{}") as Record<string, unknown>;
    expect(["sync", "async"]).toContain(parsed.stop_mode);
  });
});

// ─── Feature: demo-hook arg parsing + execute ────────────────────────────────

describe("Feature: demo hook", () => {
  it("parseDemoHookArgs sets tool and input map", () => {
    const args = parseDemoHookArgs(["Bash", "command=npm install"]);
    expect(args).not.toBeNull();
    expect(args!.tool).toBe("Bash");
    expect(args!.input).toMatchObject({ command: "npm install" });
  });

  it("parseDemoHookArgs returns null for empty args", () => {
    expect(parseDemoHookArgs([])).toBeNull();
  });

  it("executeDemoHook returns a result with decision field (synchronous)", () => {
    const args = parseDemoHookArgs(["Bash", "command=ls"]);
    const result = executeDemoHook(args!);
    expect(result).toBeDefined();
    expect(result.decision).toMatch(/allow|deny/);
  });

  it("executeDemoHook returns allow for safe command", () => {
    const args = parseDemoHookArgs(["Bash", "command=echo hello"]);
    const result = executeDemoHook(args!);
    expect(result.decision).toBe("allow");
  });
});

// ─── Feature: skeleton-demo ──────────────────────────────────────────────────

describe("Feature: skeleton-demo", () => {
  it("runSkeletonDemo completes without error", async () => {
    await expect(runSkeletonDemo()).resolves.not.toThrow();
  });
});

// ─── Feature: e2e-evaluate full integration run ──────────────────────────────

describe("Feature: e2e-evaluate full run", () => {
  it("runs end-to-end and reports results with passed/failed counts", async () => {
    const result = await executeE2EEvaluate({
      json: true,
      keepTemp: false,
      embedder: deterministicRuleEmbedder,
    });
    expect(result).toBeDefined();
    expect(typeof result.passed).toBe("number");
    expect(typeof result.failed).toBe("number");
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.failures).toBeDefined();
  }, 120000);
});
