import {
  llmBasedKnowledgeExtractor,
  ruleBasedCorrectionDetector,
  runVerify,
  type ScenarioResult,
} from "@teamagent/core";
import { InMemoryKnowledgeStore } from "@teamagent/adapters";
import { allScenarios } from "../../../../fixtures/scenarios/index.js";

export type FixtureReplayTier = "a";

export interface FixtureReplayOptions {
  subcommand: "replay";
  tier: FixtureReplayTier;
  scenarioId?: string;
  json?: boolean;
}

export interface FixtureReplayScenario {
  id: string;
  passed: boolean;
  prr: number;
  kp: number;
  phases: {
    correctionDetected: boolean;
    ruleGenerated: boolean;
    interceptMatched: boolean;
    expectedBehavior: ScenarioResult["phaseC"]["expectedBehavior"];
    actualBehavior: ScenarioResult["phaseC"]["actualBehavior"];
  };
}

export interface FixtureReplayResult {
  ok: boolean;
  command: "fixture replay";
  tier: FixtureReplayTier;
  total: number;
  passed: number;
  scenarios: FixtureReplayScenario[];
}

export class FixtureReplayArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureReplayArgError";
  }
}

export function parseFixtureReplayArgs(argv: string[]): FixtureReplayOptions {
  const subcommand = argv[0];
  if (subcommand !== "replay") {
    throw new FixtureReplayArgError(
      "fixture: expected subcommand 'replay'. Usage: teamagent fixture replay --tier=a [--scenario <id>] [--json]",
    );
  }

  const opts: FixtureReplayOptions = { subcommand: "replay", tier: "a" };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--tier") {
      opts.tier = parseTier(readValue(argv, ++i, "--tier"));
    } else if (a.startsWith("--tier=")) {
      opts.tier = parseTier(a.slice("--tier=".length));
    } else if (a === "--scenario" || a === "--slug") {
      opts.scenarioId = readValue(argv, ++i, a);
    } else if (a.startsWith("--scenario=")) {
      opts.scenarioId = readInlineValue(a, "--scenario");
    } else if (a.startsWith("--slug=")) {
      opts.scenarioId = readInlineValue(a, "--slug");
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--help" || a === "-h") {
      throw new FixtureReplayArgError(renderFixtureReplayHelp());
    } else if (a.startsWith("--")) {
      throw new FixtureReplayArgError(`fixture replay: unknown flag "${a}"`);
    }
  }
  return opts;
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new FixtureReplayArgError(`fixture replay: ${flag} requires a value`);
  }
  return value;
}

function readInlineValue(arg: string, flag: string): string {
  const value = arg.slice(`${flag}=`.length);
  if (!value) {
    throw new FixtureReplayArgError(`fixture replay: ${flag} requires a value`);
  }
  return value;
}

function parseTier(value: string): FixtureReplayTier {
  if (value === "a") return "a";
  throw new FixtureReplayArgError(
    `fixture replay: unsupported tier "${value}". This implementation currently supports --tier=a.`,
  );
}

export function renderFixtureReplayHelp(): string {
  return [
    "Usage: teamagent fixture replay --tier=a [--scenario <id>] [--json]",
    "",
    "Replays deterministic scenario fixtures through the existing TeamAgent",
    "three-phase harness: correction detection -> rule extraction -> intercept.",
    "",
    "Options:",
    "  --tier=a          Run the deterministic offline replay tier",
    "  --scenario ID     Run one scenario only, e.g. moment-dayjs",
    "  --slug ID         Alias for --scenario, matching ADR-0010 docs",
    "  --json            Print machine-readable JSON",
    "",
  ].join("\n");
}

export async function executeFixtureReplay(
  opts: FixtureReplayOptions,
): Promise<FixtureReplayResult> {
  const scenarios = opts.scenarioId
    ? allScenarios.filter((s) => s.id === opts.scenarioId)
    : allScenarios;

  if (opts.scenarioId && scenarios.length === 0) {
    throw new FixtureReplayArgError(
      `fixture replay: unknown scenario "${opts.scenarioId}"`,
    );
  }

  const verify = await runVerify(scenarios, {
    detector: ruleBasedCorrectionDetector,
    extractor: llmBasedKnowledgeExtractor,
    makeStore: () => new InMemoryKnowledgeStore(),
    now: () => new Date("2026-05-11T00:00:00Z"),
  });

  const replayScenarios = verify.scenarios.map((s) => ({
    id: s.scenarioId,
    passed: s.passed,
    prr: s.prr,
    kp: s.kp,
    phases: {
      correctionDetected: s.phaseA.passed,
      ruleGenerated: s.phaseB.passed,
      interceptMatched: s.phaseC.passed,
      expectedBehavior: s.phaseC.expectedBehavior,
      actualBehavior: s.phaseC.actualBehavior,
    },
  }));

  return {
    ok: verify.passed === verify.total,
    command: "fixture replay",
    tier: opts.tier,
    total: verify.total,
    passed: verify.passed,
    scenarios: replayScenarios,
  };
}

export function renderFixtureReplayResult(result: FixtureReplayResult): string {
  const lines: string[] = [];
  lines.push("TeamAgent fixture replay");
  lines.push(`tier: ${result.tier}`);
  lines.push(`passed: ${result.passed}/${result.total}`);
  lines.push("");
  for (const s of result.scenarios) {
    const mark = s.passed ? "PASS" : "FAIL";
    lines.push(
      `${mark} ${s.id} PRR=${s.prr} KP=${s.kp.toFixed(2)} expected=${s.phases.expectedBehavior} actual=${s.phases.actualBehavior}`,
    );
  }
  return lines.join("\n") + "\n";
}
