import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPreToolUseHandler,
  DualLayerStore,
  openDb,
  SqliteEventLog,
} from "@teamagent/adapters";
import { matchRulesAsync } from "@teamagent/core";
import type { LLMClient, RuleEmbedder } from "@teamagent/ports";
import { executeAnalyze, type AnalyzeMeta } from "./analyze.js";

type ProbeKind = "positive" | "generalization" | "negative";

export interface E2EProbe {
  id: string;
  kind: ProbeKind;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface E2EEvaluateOptions {
  cwd?: string;
  homeDir?: string;
  keepTemp?: boolean;
  json?: boolean;
  llmClient?: LLMClient;
  embedder?: RuleEmbedder;
  now?: () => Date;
}

export interface E2EEvaluateResult {
  ok: boolean;
  workspaceDir: string;
  homeDir: string;
  learnedRules: number;
  correctionsFound: number;
  extracted: number;
  skillsExported: boolean;
  skillsHaveRules: boolean;
  docsPropagationScheduled: boolean;
  claudeMdUntouched: boolean;
  metrics: {
    extractionYield: number;
    positiveTriggerRate: number;
    generalizationRate: number;
    falsePositiveRate: number;
    helpfulRate: number;
    onboardingCoverage: number;
    docsPropagationCoverage: number;
  };
  probes: Array<{
    id: string;
    kind: ProbeKind;
    triggered: boolean;
    helpful: boolean;
    expectedTrigger: boolean;
    decision: string;
    message: string;
  }>;
  failures: string[];
  tempCleaned: boolean;
  /** Derived sandbox-style summary fields (alias view of probes). */
  passed: number;
  failed: number;
  results: Array<{
    id: string;
    kind: ProbeKind;
    triggered: boolean;
    helpful: boolean;
    expectedTrigger: boolean;
    decision: string;
    message: string;
    pass: boolean;
  }>;
}

function deriveSummary(
  probes: E2EEvaluateResult["probes"],
): Pick<E2EEvaluateResult, "passed" | "failed" | "results"> {
  const results = probes.map((p) => ({
    ...p,
    pass: p.triggered === p.expectedTrigger,
  }));
  const passed = results.filter((r) => r.pass).length;
  return { passed, failed: results.length - passed, results };
}

interface EvalCase {
  id: string;
  userRequest: string;
  assistantText: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  correctionText: string;
  expectedWrong: string;
  expectedCorrect: string;
  llm: {
    category: "C" | "E" | "S" | "K";
    tags: string[];
    type: "avoidance" | "practice";
    nature: "objective" | "subjective";
    trigger: string;
    wrong_pattern: string;
    correct_pattern: string;
    reasoning: string;
  };
  probes: E2EProbe[];
}

const CASES: EvalCase[] = [
  {
    id: "http-client",
    userRequest: "Please add a function that fetches user data.",
    assistantText: "I will use axios for the HTTP request.",
    toolName: "Write",
    toolInput: {
      file_path: "src/api.ts",
      content: `import axios from "axios";\nexport async function getUser(id: string) { return (await axios.get("/api/users/" + id)).data; }\n`,
    },
    correctionText: "Wrong, this project uses fetch instead of axios.",
    expectedWrong: "axios",
    expectedCorrect: "fetch",
    llm: {
      category: "E",
      tags: ["http-client"],
      type: "avoidance",
      nature: "objective",
      trigger: "When adding HTTP client code",
      wrong_pattern: "axios|Axios",
      correct_pattern: "Use built-in fetch.",
      reasoning: "The project standard avoids an extra HTTP dependency.",
    },
    probes: [
      {
        id: "axios-bash-install",
        kind: "positive",
        tool_name: "Bash",
        tool_input: { command: "npm install axios" },
      },
      {
        id: "axios-import-write",
        kind: "generalization",
        tool_name: "Write",
        tool_input: {
          file_path: "src/other.ts",
          content: `import client from "axios";\nexport const get = client.get;\n`,
        },
      },
      {
        id: "axios-doc-mention",
        kind: "negative",
        tool_name: "Write",
        tool_input: {
          file_path: "docs/history.md",
          content: "Legacy docs mention axios as historical context.",
        },
      },
    ],
  },
  {
    id: "date-library",
    userRequest: "Please add date formatting.",
    assistantText: "I will use moment for date formatting.",
    toolName: "Write",
    toolInput: {
      file_path: "src/date.ts",
      content: `import moment from "moment";\nexport const fmt = (d: Date) => moment(d).format("YYYY-MM-DD");\n`,
    },
    correctionText: "Wrong, use dayjs instead of moment.",
    expectedWrong: "moment",
    expectedCorrect: "dayjs",
    llm: {
      category: "E",
      tags: ["date-library"],
      type: "avoidance",
      nature: "objective",
      trigger: "When adding date formatting dependencies",
      wrong_pattern: "moment",
      correct_pattern: "Use dayjs.",
      reasoning: "The project standardizes on dayjs.",
    },
    probes: [
      {
        id: "moment-install",
        kind: "positive",
        tool_name: "Bash",
        tool_input: { command: "pnpm add moment" },
      },
      {
        id: "moment-import-write",
        kind: "generalization",
        tool_name: "Write",
        tool_input: {
          file_path: "src/date2.ts",
          content: `import moment from "moment";\nexport const y = moment().year();\n`,
        },
      },
      {
        id: "momentum-substring",
        kind: "negative",
        tool_name: "Bash",
        tool_input: { command: "echo momentum is not a date library" },
      },
      {
        id: "moment-comment",
        kind: "negative",
        tool_name: "Write",
        tool_input: {
          file_path: "src/date3.ts",
          content: `// moment was used before migration\nexport const fmt = (d: Date) => d.toISOString();\n`,
        },
      },
    ],
  },
  {
    id: "state-library",
    userRequest: "Please add global UI state.",
    assistantText: "I will install Redux Toolkit and wire the store.",
    toolName: "Bash",
    toolInput: { command: "pnpm add @reduxjs/toolkit react-redux" },
    correctionText: "Wrong, use Zustand here instead of Redux.",
    expectedWrong: "redux",
    expectedCorrect: "zustand",
    llm: {
      category: "E",
      tags: ["state-library"],
      type: "avoidance",
      nature: "objective",
      trigger: "When adding client state management",
      wrong_pattern: "@reduxjs/toolkit|react-redux|redux",
      correct_pattern: "Use Zustand.",
      reasoning: "The app standardizes on Zustand for small client stores.",
    },
    probes: [
      {
        id: "redux-install",
        kind: "positive",
        tool_name: "Bash",
        tool_input: { command: "pnpm add @reduxjs/toolkit react-redux" },
      },
      {
        id: "redux-generalized",
        kind: "generalization",
        tool_name: "Bash",
        tool_input: { command: "npm install redux" },
      },
      {
        id: "reducer-word",
        kind: "negative",
        tool_name: "Write",
        tool_input: {
          file_path: "src/reducer.ts",
          content: "export function reducer(state: number) { return state + 1; }\n",
        },
      },
    ],
  },
];

export function parseE2EEvaluateArgs(args: string[]): E2EEvaluateOptions {
  const opts: E2EEvaluateOptions = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--json") opts.json = true;
    else if (a === "--keep-temp") opts.keepTemp = true;
    else if (a === "--cwd" && args[i + 1]) opts.cwd = args[++i];
    else if (a.startsWith("--cwd=")) opts.cwd = a.slice("--cwd=".length);
    else if (a === "--home-dir" && args[i + 1]) opts.homeDir = args[++i];
    else if (a.startsWith("--home-dir=")) opts.homeDir = a.slice("--home-dir=".length);
  }
  return opts;
}

export async function executeE2EEvaluate(
  opts: E2EEvaluateOptions = {},
): Promise<E2EEvaluateResult> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-e2e-"));
  const workspaceDir = opts.cwd ?? path.join(tempRoot, "project");
  const homeDir = opts.homeDir ?? path.join(tempRoot, "home");
  const sessionsDir = path.join(tempRoot, "sessions");
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "package.json"), JSON.stringify({ type: "module" }));

  const projectDbPath = path.join(workspaceDir, ".teamagent", "knowledge.db");
  const userGlobalDbPath = path.join(homeDir, ".teamagent", "global.db");
  const eventsDbPath = path.join(homeDir, ".teamagent", "events.db");
  const claudeMdPath = path.join(workspaceDir, "CLAUDE.md");
  const skillsDir = path.join(homeDir, ".claude", "skills", "teamagent");
  const now = opts.now ?? (() => new Date("2026-04-24T00:00:00Z"));
  const llmClient = opts.llmClient ?? deterministicLLM();
  const failures: string[] = [];
  const scheduledDocsRuleIds: string[] = [];
  let correctionsFound = 0;
  let extracted = 0;
  let idSeq = 0;

  try {
    for (const c of CASES) {
      const sessionPath = path.join(sessionsDir, `${c.id}.jsonl`);
      fs.writeFileSync(sessionPath, makeSessionJsonl(c), "utf-8");

      let meta: AnalyzeMeta | undefined;
      await executeAnalyze({
        session: sessionPath,
        homeDir,
        cwd: workspaceDir,
        commit: true,
        llmClient,
        projectDbPath,
        userGlobalDbPath,
        eventsDbPath,
        claudeMdPath,
        skillsDir,
        idGen: () => `e2e-${++idSeq}`,
        now,
        skipCalibrate: true,
        embedder: opts.embedder,
        docsPropagationScheduler: (ids) => {
          scheduledDocsRuleIds.push(...ids);
        },
        onMeta: (m) => {
          meta = m;
        },
      });

      correctionsFound += meta?.correctionsFound ?? 0;
      extracted += meta?.extracted ?? 0;
    }

    const store = new DualLayerStore({ projectDbPath, userGlobalDbPath });
    const eventLog = new SqliteEventLog(openDb(eventsDbPath));
    let lastRuleCount = 0;
    const matcher = {
      match: async ({ tool_name, tool_input }: { tool_name: string; tool_input: unknown }) => {
        const rules = store.findActive();
        lastRuleCount = rules.length;
        return matchRulesAsync(
          {
            ...(typeof tool_input === "object" && tool_input !== null ? tool_input : {}),
            tool_name,
          },
          rules,
          {},
        );
      },
    };
    const handler = createPreToolUseHandler({
      matcher,
      eventLog,
      visibility: "silent",
      get ruleCount() {
        return lastRuleCount;
      },
    });

    const rules = store.findActive();
    const probes: E2EEvaluateResult["probes"] = [];
    for (const c of CASES) {
      for (const probe of c.probes) {
        const result = await handler({
          hook_event_name: "PreToolUse",
          tool_use_id: `probe-${probe.id}`,
          tool_name: probe.tool_name,
          tool_input: probe.tool_input,
        } as any);
        const message = result.permissionDecisionReason ?? result.systemMessage ?? "";
        const triggered = result.permissionDecision !== "allow" || message.length > 0;
        const helpful = triggered && message.toLowerCase().includes(c.expectedCorrect.toLowerCase());
        probes.push({
          id: probe.id,
          kind: probe.kind,
          triggered,
          helpful,
          expectedTrigger: probe.kind !== "negative",
          decision: result.permissionDecision,
          message,
        });
      }
    }

    eventLog.close();
    store.close();

    const positives = probes.filter((p) => p.kind === "positive");
    const generalizations = probes.filter((p) => p.kind === "generalization");
    const negatives = probes.filter((p) => p.kind === "negative");
    const triggeredHelpful = probes.filter((p) => p.expectedTrigger && p.triggered);
    const skillFiles = rules.map((r) => path.join(skillsDir, r.id, "SKILL.md"));
    const skillContents = skillFiles
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readFileSync(file, "utf-8"));
    const skillCorpusLower = skillContents.join("\n").toLowerCase();
    const skillsExported = skillFiles.length > 0 && skillFiles.every((file) => fs.existsSync(file));
    const skillsHaveRules = CASES.every((c) => skillCorpusLower.includes(c.expectedCorrect.toLowerCase()));
    const scheduledDocsSet = new Set(scheduledDocsRuleIds);
    const docsPropagationCoverage = rate(
      rules.filter((r) => scheduledDocsSet.has(r.id)).length,
      rules.length,
    );
    const docsPropagationScheduled = docsPropagationCoverage === 1;
    const claudeMdUntouched = !fs.existsSync(claudeMdPath);
    const onboardingCoverage = CASES.length === 0
      ? 1
      : CASES.filter((c) =>
          skillCorpusLower.includes(c.expectedWrong.toLowerCase()) &&
          skillCorpusLower.includes(c.expectedCorrect.toLowerCase()),
        ).length / CASES.length;

    const metrics = {
      extractionYield: correctionsFound === 0 ? 0 : extracted / correctionsFound,
      positiveTriggerRate: rate(positives.filter((p) => p.triggered).length, positives.length),
      generalizationRate: rate(generalizations.filter((p) => p.triggered).length, generalizations.length),
      falsePositiveRate: rate(negatives.filter((p) => p.triggered).length, negatives.length),
      helpfulRate: rate(triggeredHelpful.filter((p) => p.helpful).length, triggeredHelpful.length),
      onboardingCoverage,
      docsPropagationCoverage,
    };

    if (rules.length < CASES.length) failures.push(`Only learned ${rules.length}/${CASES.length} rules.`);
    if (metrics.extractionYield < 1) failures.push(`Extraction yield ${fmtPct(metrics.extractionYield)} is below 100%.`);
    if (metrics.positiveTriggerRate < 1) failures.push(`Positive trigger rate ${fmtPct(metrics.positiveTriggerRate)} is below 100%.`);
    if (metrics.generalizationRate < 1) failures.push(`Generalization rate ${fmtPct(metrics.generalizationRate)} is below 100%.`);
    if (metrics.falsePositiveRate > 0) failures.push(`False positive rate ${fmtPct(metrics.falsePositiveRate)} is above 0%.`);
    if (metrics.helpfulRate < 1) failures.push(`Helpful message rate ${fmtPct(metrics.helpfulRate)} is below 100%.`);
    if (!skillsExported) failures.push("Skills were not exported for every learned rule.");
    if (!skillsHaveRules) failures.push("Exported Skills do not contain every learned correction.");
    if (!docsPropagationScheduled) failures.push(`Docs propagation coverage ${fmtPct(metrics.docsPropagationCoverage)} is below 100%.`);
    if (!claudeMdUntouched) failures.push("CLAUDE.md was written even though Skills are the compile output.");
    if (metrics.onboardingCoverage < 1) failures.push(`Skills onboarding coverage ${fmtPct(metrics.onboardingCoverage)} is below 100%.`);

    const shouldClean = !opts.keepTemp && !opts.cwd && !opts.homeDir;
    if (shouldClean) cleanupTempRoot(tempRoot);

    return {
      ok: failures.length === 0,
      workspaceDir,
      homeDir,
      learnedRules: rules.length,
      correctionsFound,
      extracted,
      skillsExported,
      skillsHaveRules,
      docsPropagationScheduled,
      claudeMdUntouched,
      metrics,
      probes,
      failures,
      tempCleaned: shouldClean,
      ...deriveSummary(probes),
    };
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
    if (!opts.keepTemp && !opts.cwd && !opts.homeDir) cleanupTempRoot(tempRoot);
    return {
      ok: false,
      workspaceDir,
      homeDir,
      learnedRules: 0,
      correctionsFound,
      extracted,
      skillsExported: false,
      skillsHaveRules: false,
      docsPropagationScheduled: false,
      claudeMdUntouched: !fs.existsSync(claudeMdPath),
      metrics: {
        extractionYield: correctionsFound === 0 ? 0 : extracted / correctionsFound,
        positiveTriggerRate: 0,
        generalizationRate: 0,
        falsePositiveRate: 0,
        helpfulRate: 0,
        onboardingCoverage: 0,
        docsPropagationCoverage: 0,
      },
      probes: [],
      failures,
      tempCleaned: !opts.keepTemp && !opts.cwd && !opts.homeDir,
      ...deriveSummary([]),
    };
  }
}

export function renderE2EEvaluateResult(result: E2EEvaluateResult): string {
  const lines = [
    `TeamAgent real E2E evaluation: ${result.ok ? "PASS" : "FAIL"}`,
    "",
    `Rules learned: ${result.learnedRules}`,
    `Corrections found/extracted: ${result.correctionsFound}/${result.extracted}`,
    `Skills exported: ${result.skillsExported ? "yes" : "no"}`,
    `Docs propagation scheduled: ${result.docsPropagationScheduled ? "yes" : "no"}`,
    `CLAUDE.md untouched: ${result.claudeMdUntouched ? "yes" : "no"}`,
    `Onboarding rules in Skills: ${fmtPct(result.metrics.onboardingCoverage)}`,
    "",
    "Metrics:",
    `  extraction yield: ${fmtPct(result.metrics.extractionYield)}`,
    `  positive trigger rate: ${fmtPct(result.metrics.positiveTriggerRate)}`,
    `  generalization rate: ${fmtPct(result.metrics.generalizationRate)}`,
    `  false positive rate: ${fmtPct(result.metrics.falsePositiveRate)}`,
    `  helpful message rate: ${fmtPct(result.metrics.helpfulRate)}`,
    `  docs propagation coverage: ${fmtPct(result.metrics.docsPropagationCoverage)}`,
    "",
    "Probe results:",
    ...result.probes.map((p) => {
      const expected = p.expectedTrigger ? "hit" : "pass";
      const actual = p.triggered ? "hit" : "pass";
      const status = expected === actual ? "ok" : "bad";
      return `  ${status} ${p.id} [${p.kind}]: expected ${expected}, got ${actual}`;
    }),
  ];

  if (result.failures.length > 0) {
    lines.push("", "Failures:", ...result.failures.map((f) => `  - ${f}`));
  }
  if (!result.tempCleaned) {
    lines.push("", `Workspace: ${result.workspaceDir}`, `Home: ${result.homeDir}`);
  }
  return lines.join("\n") + "\n";
}

function makeSessionJsonl(c: EvalCase): string {
  const sessionId = `e2e-${c.id}`;
  const lines = [
    {
      type: "user",
      uuid: `${c.id}-u1`,
      timestamp: "2026-04-24T00:00:00Z",
      sessionId,
      message: { role: "user", content: c.userRequest },
    },
    {
      type: "assistant",
      uuid: `${c.id}-a1`,
      timestamp: "2026-04-24T00:00:01Z",
      sessionId,
      message: {
        role: "assistant",
        content: [
          { type: "text", text: c.assistantText },
          { type: "tool_use", id: `${c.id}-tool1`, name: c.toolName, input: c.toolInput },
        ],
      },
    },
    {
      type: "user",
      uuid: `${c.id}-u2`,
      timestamp: "2026-04-24T00:00:02Z",
      sessionId,
      message: { role: "user", content: c.correctionText },
    },
  ];
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

function deterministicLLM(): LLMClient {
  return {
    complete: async (prompt: string) => {
      const lower = prompt.toLowerCase();
      const found =
        lower.includes("zustand") ? CASES.find((c) => c.id === "state-library") :
        lower.includes("dayjs") ? CASES.find((c) => c.id === "date-library") :
        lower.includes("fetch instead of axios") ? CASES.find((c) => c.id === "http-client") :
        undefined;
      if (!found) return "null";
      return "```json\n" + JSON.stringify(found.llm) + "\n```";
    },
  };
}

function rate(n: number, d: number): number {
  return d === 0 ? 1 : n / d;
}

function fmtPct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

function cleanupTempRoot(tempRoot: string): void {
  try {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  } catch {
    // Best effort: a just-closed SQLite handle can stay briefly locked on
    // Windows. Cleanup failure should not turn a passed E2E into a failure.
  }
}
