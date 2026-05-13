import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { findTeamagentRoot } from "../find-teamagent-root.js";

export type RecordingVisibility = "private" | "public";
export type RecordingAction = "help" | "import" | "search" | "show" | "inject" | "metrics" | "benchmark";
export type RecordingMetricOperation = "import" | "search" | "inject" | "benchmark";
export type RecordingMetricStatus = "ok" | "empty" | "failed";

export interface RecordingCommandOptions {
  action: RecordingAction;
  filePath?: string;
  query?: string;
  id?: string;
  visibility?: RecordingVisibility | "all";
  limit?: number;
  expandTranscript?: boolean;
  json?: boolean;
  reportPath?: string;
  cwd?: string;
  homeDir?: string;
  now?: () => Date;
  idGen?: () => string;
}

export interface RecordingMemory {
  id: string;
  title: string;
  source: string;
  transcript: string;
  uploadedBy: string;
  useWhen: string;
  summary: string;
  visibility: RecordingVisibility;
  createdAt: string;
  updatedAt: string;
}

export type RecordingMemoryView = Omit<RecordingMemory, "transcript"> & {
  transcript?: string;
};

export interface RecordingSearchResult {
  record: RecordingMemoryView;
  score: number;
  whyRelevant: string;
}

export interface RecordingMetric {
  id: string;
  operation: RecordingMetricOperation;
  status: RecordingMetricStatus;
  timestamp: string;
  latencyMs: number;
  query?: string;
  recordingId?: string;
  score?: number;
  injectionTokens?: number;
  sourceReference?: string;
  slow: boolean;
  empty: boolean;
  failed: boolean;
  oversized: boolean;
  fullTranscriptIncluded: boolean;
  error?: string;
}

export interface RecordingMetricsSummary {
  total: number;
  imports: number;
  searches: number;
  injections: number;
  benchmarks: number;
  slow: number;
  empty: number;
  failed: number;
  oversized: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  latest: RecordingMetric[];
}

export type RecordingCommandResult =
  | {
      kind: "help";
      command: string;
      subcommands: Array<{ name: string; usage: string; output: string }>;
    }
  | {
      kind: "import";
      status: "created" | "duplicate";
      record: RecordingMemoryView;
      storage: "private" | "public";
    }
  | {
      kind: "search";
      query: string;
      results: RecordingSearchResult[];
    }
  | {
      kind: "show";
      record?: RecordingMemoryView;
    }
  | {
      kind: "inject";
      text: string;
      match?: RecordingSearchResult;
      tokenCount: number;
      fullTranscriptIncluded: boolean;
    }
  | {
      kind: "metrics";
      summary: RecordingMetricsSummary;
    }
  | {
      kind: "benchmark";
      ok: boolean;
      passCount: number;
      total: number;
      reportPath: string;
      rows: Array<{
        prompt: string;
        expectedId: string;
        actualId: string;
        pass: boolean;
        injectionTokens: number;
      }>;
    };

export interface RecordingPromptRetrievalArgs {
  userMessage: string;
  cwd: string;
  homeDir?: string;
  sessionSeenIds: Set<string>;
  limit?: number;
}

export interface RecordingPromptRetrievalResult {
  matches: RecordingSearchResult[];
  injectedIds: string[];
  injectionText: string;
  injectionTokens: number;
}

interface RecordingMaterialInput {
  title?: unknown;
  source?: unknown;
  sourceUrl?: unknown;
  sourcePath?: unknown;
  transcript?: unknown;
  uploadedBy?: unknown;
  uploader?: unknown;
  useWhen?: unknown;
  usage?: unknown;
  summary?: unknown;
  visibility?: unknown;
}

const DEFAULT_MAX_INJECTION_TOKENS = 800;
const SLOW_THRESHOLD_MS = 300;

const GOLDEN_MATERIALS: RecordingMaterialInput[] = [
  {
    title: "Recording Memory import design review",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md",
    transcript:
      "Alice: Recording Memory should turn existing meeting transcripts and summaries into agent-loadable memory. Bob: Import must preserve source references. Chen: Do not inject the full transcript by default; cite the source and include a short summary unless explicitly expanded.",
    uploadedBy: "teamagent",
    useWhen: "Questions about recording-memory import, source references, concise prompt injection, and transcript expansion.",
    summary:
      "Recording Memory import stores transcripts, summaries, and source references. Default prompt injection cites the source and stays concise.",
    visibility: "public",
  },
  {
    title: "Recording Memory dashboard and latency review",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard",
    transcript:
      "Alice: We need externally visible evidence, not SelfVerify. Bob: The dashboard has to show latency numbers and counts for slow or empty queries. Chen: It should update after recording-memory activity.",
    uploadedBy: "teamagent",
    useWhen: "Questions about dashboard metrics, latency, slow retrievals, empty retrievals, failures, and oversized injections.",
    summary:
      "The dashboard must surface latency, slow retrievals, empty retrievals, failed retrievals, oversized injections, and latest Recording Memory activity.",
    visibility: "public",
  },
  {
    title: "Recording Memory golden prompt benchmark",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark",
    transcript:
      "Alice: We should use three real examples. Bob: Ten fixed prompts are enough for the first gate. Chen: Each row needs expected recording, actual recording, pass/fail, and injection token count. Dana: Full transcript should only appear with explicit expansion.",
    uploadedBy: "teamagent",
    useWhen: "Questions about golden prompt benchmark acceptance, ten prompts, three examples, pass rate, and token budget.",
    summary:
      "Golden benchmark uses three recording examples and ten fixed prompts. It passes at 8/10 correct retrievals with default injection under 800 tokens.",
    visibility: "public",
  },
];

const GOLDEN_PROMPTS = [
  { prompt: "What did we decide about importing recording transcripts?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "Where should recording memory cite source references?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "Should the full transcript be injected by default?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md" },
  { prompt: "How do we monitor slow recording-memory retrievals?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "What dashboard counts are required for recording memory?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "What evidence should show latency and empty retrievals?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#dashboard" },
  { prompt: "How many golden prompts are used for acceptance?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "What is the default recording memory token budget?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "What pass rate does the golden benchmark require?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
  { prompt: "When is a full recording transcript allowed in context?", expectedSource: "docs/specs/2026-04-29-recording-memory-performance-verification.md#golden-prompt-benchmark" },
];

// Walk up to project root so subfolder writes land in the same .teamagent
// directory as the project root (issue #161). Falls back to cwd when no
// .teamagent/knowledge.db exists yet (e.g. `recording import` against a
// fresh tmp dir in tests).
function projectRoot(cwd: string): string {
  return findTeamagentRoot(cwd);
}

function projectKey(cwd: string): string {
  return createHash("sha256").update(path.resolve(projectRoot(cwd))).digest("hex").slice(0, 20);
}

/**
 * Pre-walk-up project key (issue #161 follow-up). Existing users who imported
 * private recordings from a sub-folder before walk-up landed have files at
 * `~/.teamagent/recordings/<sha256(cwd)>.json`. After walk-up, the canonical
 * key is `sha256(projectRoot)`. We try the legacy key on read so those
 * records aren't silently orphaned, then migrate them to the new path on
 * the first read so subsequent writes land at one place.
 */
function legacyProjectKey(cwd: string): string {
  return createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 20);
}

function publicStorePath(cwd: string): string {
  return path.join(projectRoot(cwd), ".teamagent", "recordings.json");
}

function privateStorePath(cwd: string, homeDir: string): string {
  return path.join(
    homeDir,
    ".teamagent",
    "recordings",
    `${projectKey(cwd)}.json`,
  );
}

function legacyPrivateStorePath(cwd: string, homeDir: string): string {
  return path.join(
    homeDir,
    ".teamagent",
    "recordings",
    `${legacyProjectKey(cwd)}.json`,
  );
}

function metricsPath(cwd: string): string {
  return path.join(projectRoot(cwd), ".teamagent", "recording-memory", "metrics.jsonl");
}

function readJsonl<T>(filePath: string): T[] {
  try {
    return fs.readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

function appendJsonl<T>(filePath: string, item: T): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(item) + "\n", "utf-8");
}

export function estimateRecordingTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function appendMetric(
  cwd: string,
  now: () => Date,
  metric: Omit<RecordingMetric, "id" | "timestamp" | "slow" | "empty" | "failed" | "oversized">,
): RecordingMetric {
  const full: RecordingMetric = {
    ...metric,
    id: `rm-${now().getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now().toISOString(),
    slow: metric.latencyMs > SLOW_THRESHOLD_MS,
    empty: metric.status === "empty",
    failed: metric.status === "failed",
    oversized: (metric.injectionTokens ?? 0) > DEFAULT_MAX_INJECTION_TOKENS,
  };
  appendJsonl(metricsPath(cwd), full);
  return full;
}

export function loadRecordingMetrics(cwd: string): RecordingMetric[] {
  return readJsonl<RecordingMetric>(metricsPath(cwd));
}

export function summarizeRecordingMetrics(metrics: RecordingMetric[]): RecordingMetricsSummary {
  const latencies = metrics.map((m) => m.latencyMs).sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (latencies.length === 0) return 0;
    return latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] ?? 0;
  };
  return {
    total: metrics.length,
    imports: metrics.filter((m) => m.operation === "import").length,
    searches: metrics.filter((m) => m.operation === "search").length,
    injections: metrics.filter((m) => m.operation === "inject").length,
    benchmarks: metrics.filter((m) => m.operation === "benchmark").length,
    slow: metrics.filter((m) => m.slow).length,
    empty: metrics.filter((m) => m.empty).length,
    failed: metrics.filter((m) => m.failed).length,
    oversized: metrics.filter((m) => m.oversized).length,
    p50LatencyMs: percentile(0.5),
    p95LatencyMs: percentile(0.95),
    latest: metrics.slice(-5).reverse(),
  };
}

function readStore(filePath: string): RecordingMemory[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RecordingMemory[]) : [];
  } catch {
    return [];
  }
}

function writeStore(filePath: string, records: RecordingMemory[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2) + "\n", "utf-8");
}

/**
 * Read the private store, transparently migrating from the legacy
 * `sha256(cwd)`-keyed path to the new `sha256(projectRoot(cwd))`-keyed path
 * on first access (issue #161 follow-up). If only the legacy file exists,
 * copy its records to the new path and return them; subsequent reads see
 * only the new path. The legacy file is left in place so a downgrade can
 * still find it.
 */
function loadPrivateStoreWithMigration(
  cwd: string,
  homeDir: string,
): RecordingMemory[] {
  const newPath = privateStorePath(cwd, homeDir);
  if (fs.existsSync(newPath)) return readStore(newPath);
  const legacyPath = legacyPrivateStorePath(cwd, homeDir);
  if (legacyPath !== newPath && fs.existsSync(legacyPath)) {
    const records = readStore(legacyPath);
    if (records.length > 0) writeStore(newPath, records);
    return records;
  }
  return [];
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeVisibility(value: unknown): RecordingVisibility {
  if (value === "public") return "public";
  if (value === undefined || value === null || value === "private") return "private";
  throw new Error("visibility must be private or public");
}

function materialToRecord(
  input: RecordingMaterialInput,
  opts: Required<Pick<RecordingCommandOptions, "now" | "idGen">>,
): RecordingMemory {
  const now = opts.now().toISOString();
  const source = stringField(
    input.source ?? input.sourceUrl ?? input.sourcePath,
    "source",
  );
  return {
    id: opts.idGen(),
    title: stringField(input.title, "title"),
    source,
    transcript: stringField(input.transcript, "transcript"),
    uploadedBy: stringField(input.uploadedBy ?? input.uploader, "uploadedBy"),
    useWhen: stringField(input.useWhen ?? input.usage, "useWhen"),
    summary:
      optionalString(input.summary) ??
      stringField(input.transcript, "transcript").slice(0, 240),
    visibility: normalizeVisibility(input.visibility),
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeRecord(
  record: RecordingMemory,
  expandTranscript = false,
): RecordingMemoryView {
  const { transcript, ...rest } = record;
  return expandTranscript ? { ...rest, transcript } : rest;
}

function loadVisibleRecords(
  cwd: string,
  homeDir: string,
  visibility: RecordingVisibility | "all" = "all",
): RecordingMemory[] {
  const records: RecordingMemory[] = [];
  if (visibility === "all" || visibility === "public") {
    records.push(...readStore(publicStorePath(cwd)).filter((r) => r.visibility === "public"));
  }
  if (visibility === "all" || visibility === "private") {
    records.push(...loadPrivateStoreWithMigration(cwd, homeDir).filter((r) => r.visibility === "private"));
  }
  return records;
}

function tokenize(text: string): string[] {
  return [...text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)]
    .map((m) => m[0])
    .filter((t) => t.length > 1);
}

function scoreRecord(query: string, record: RecordingMemory): { score: number; why: string } {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return { score: 0, why: "" };

  const fields: Array<[keyof RecordingMemory, number, string]> = [
    ["title", 4, "title"],
    ["summary", 4, "summary"],
    ["useWhen", 3, "useWhen"],
    ["transcript", 1, "transcript"],
    ["uploadedBy", 1, "uploadedBy"],
  ];
  let score = 0;
  const matchedFields = new Set<string>();
  for (const term of terms) {
    for (const [field, weight, label] of fields) {
      const value = String(record[field] ?? "").toLowerCase();
      if (value.includes(term)) {
        score += weight;
        matchedFields.add(label);
      }
    }
  }
  const coverage = matchedFields.size > 0 ? terms.length / Math.max(terms.length, 1) : 0;
  return {
    score: score + coverage,
    why:
      matchedFields.size > 0
        ? `matched ${[...matchedFields].join(", ")}`
        : "",
  };
}

function searchRecords(
  query: string,
  records: RecordingMemory[],
  limit: number,
  expandTranscript = false,
): RecordingSearchResult[] {
  return records
    .map((record) => {
      const scored = scoreRecord(query, record);
      return {
        record: sanitizeRecord(record, expandTranscript),
        score: scored.score,
        whyRelevant: scored.why,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.record.createdAt.localeCompare(b.record.createdAt))
    .slice(0, limit);
}

export function parseRecordingArgs(argv: string[]): RecordingCommandOptions {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { action: "help" };
  }

  const [actionRaw, ...rest] = argv;
  if (
    actionRaw !== "import" &&
    actionRaw !== "search" &&
    actionRaw !== "show" &&
    actionRaw !== "inject" &&
    actionRaw !== "metrics" &&
    actionRaw !== "benchmark"
  ) {
    throw new Error("recording action must be import, search, show, inject, metrics, benchmark, or --help");
  }

  const opts: RecordingCommandOptions = { action: actionRaw };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--file" && rest[i + 1]) opts.filePath = rest[++i];
    else if (a === "--query" && rest[i + 1]) opts.query = rest[++i];
    else if (a === "--id" && rest[i + 1]) opts.id = rest[++i];
    else if (a === "--transcript") opts.expandTranscript = true;
    else if (a === "--full") opts.expandTranscript = true;
    else if (a === "--json") opts.json = true;
    else if (a.startsWith("--report=")) opts.reportPath = a.slice("--report=".length);
    else if (a.startsWith("--visibility=")) {
      const raw = a.slice("--visibility=".length);
      if (raw !== "all" && raw !== "private" && raw !== "public") {
        throw new Error("--visibility must be all, private, or public");
      }
      opts.visibility = raw;
    } else if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (!Number.isInteger(n) || n <= 0) throw new Error("--limit must be a positive integer");
      opts.limit = n;
    } else if ((opts.action === "show") && !opts.id && !a.startsWith("--")) {
      opts.id = a;
    } else if ((opts.action === "inject" || opts.action === "search") && !opts.query && !a.startsWith("--")) {
      opts.query = a;
    }
  }
  if (opts.action === "import" && !opts.filePath) {
    throw new Error("recording import requires --file <path>");
  }
  // Issue #296: `teamagent recording` (Recording Memory, transcript JSON) is
  // distinct from `teamagent record` (digital-twin audio recorder). When the
  // user passes an audio file here, the bare JSON.parse error downstream is
  // unhelpful — redirect to the right subsystem instead.
  if (
    opts.action === "import" &&
    opts.filePath &&
    /\.(ogg|opus|wav|mp3|m4a|flac|webm|aac)$/i.test(opts.filePath)
  ) {
    throw new Error(
      `recording import expects a transcript JSON file, got an audio file (${opts.filePath}). ` +
        `Did you mean 'teamagent record import ${opts.filePath}'? ` +
        `'teamagent recording' is the Recording Memory subsystem (transcript-first); ` +
        `'teamagent record' is the digital-twin audio recorder. See 'teamagent record --help'.`,
    );
  }
  if (opts.action === "search" && !opts.query) {
    throw new Error("recording search requires --query <text>");
  }
  if (opts.action === "inject" && !opts.query) {
    throw new Error("recording inject requires --query <text> or a query argument");
  }
  if (opts.action === "show" && !opts.id) {
    throw new Error("recording show requires <id> or --id <id>");
  }
  return opts;
}

export async function executeRecording(
  opts: RecordingCommandOptions,
): Promise<RecordingCommandResult> {
  const cwd = opts.cwd ?? process.cwd();
  const homeDir = opts.homeDir ?? os.homedir();
  const now = opts.now ?? (() => new Date());
  const idGen =
    opts.idGen ??
    (() => `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

  if (opts.action === "help") {
    return {
      kind: "help",
      command: "teamagent recording",
      subcommands: [
        {
          name: "import",
          usage: "teamagent recording import --file <material.json>",
          output: "imports transcript JSON (NOT audio — use 'teamagent record import' for audio files)",
        },
        {
          name: "search",
          usage: "teamagent recording search --query <text> [--visibility=all|private|public]",
          output: "returns source-backed recording memory hits without full transcript",
        },
        {
          name: "show",
          usage: "teamagent recording show <id> [--transcript]",
          output: "shows metadata by default; --transcript expands full transcript",
        },
        {
          name: "inject",
          usage: "teamagent recording inject --query <text> [--full]",
          output: "returns source-cited prompt context without full transcript by default",
        },
        {
          name: "metrics",
          usage: "teamagent recording metrics [--json]",
          output: "summarizes import/search/injection latency and retrieval health",
        },
        {
          name: "benchmark",
          usage: "teamagent recording benchmark [--report=<path>] [--json]",
          output: "runs 3-recording/10-prompt golden retrieval benchmark",
        },
      ],
    };
  }

  if (opts.action === "import") {
    const started = Date.now();
    const raw = fs.readFileSync(opts.filePath!, "utf-8");
    const record = materialToRecord(JSON.parse(raw) as RecordingMaterialInput, {
      now,
      idGen,
    });
    const storePath =
      record.visibility === "public"
        ? publicStorePath(cwd)
        : privateStorePath(cwd, homeDir);
    // Private path: trigger one-time migration from legacy `sha256(cwd)` key
    // so existing pre-walk-up records are folded into the new file before we
    // append. Public path: legacy file is in the same project root, no
    // migration needed.
    const records = record.visibility === "private"
      ? loadPrivateStoreWithMigration(cwd, homeDir)
      : readStore(storePath);
    const duplicate = records.find((r) => r.source === record.source);
    if (duplicate) {
      appendMetric(cwd, now, {
        operation: "import",
        status: "ok",
        latencyMs: Date.now() - started,
        recordingId: duplicate.id,
        sourceReference: duplicate.source,
        fullTranscriptIncluded: false,
      });
      return {
        kind: "import",
        status: "duplicate",
        record: sanitizeRecord(duplicate),
        storage: duplicate.visibility,
      };
    }
    records.push(record);
    writeStore(storePath, records);
    appendMetric(cwd, now, {
      operation: "import",
      status: "ok",
      latencyMs: Date.now() - started,
      recordingId: record.id,
      sourceReference: record.source,
      fullTranscriptIncluded: false,
    });
    return {
      kind: "import",
      status: "created",
      record: sanitizeRecord(record),
      storage: record.visibility,
    };
  }

  if (opts.action === "search") {
    const started = Date.now();
    const records = loadVisibleRecords(cwd, homeDir, opts.visibility ?? "all");
    const results = searchRecords(opts.query!, records, opts.limit ?? 5);
    appendMetric(cwd, now, {
      operation: "search",
      status: results.length > 0 ? "ok" : "empty",
      latencyMs: Date.now() - started,
      query: opts.query,
      recordingId: results[0]?.record.id,
      score: results[0]?.score,
      sourceReference: results[0]?.record.source,
      fullTranscriptIncluded: false,
    });
    return {
      kind: "search",
      query: opts.query!,
      results,
    };
  }

  if (opts.action === "inject") {
    const started = Date.now();
    const records = loadVisibleRecords(cwd, homeDir, opts.visibility ?? "all");
    const results = searchRecords(opts.query!, records, opts.limit ?? 3, Boolean(opts.expandTranscript));
    const text = formatRecordingMemoryInjection(results, opts.expandTranscript);
    const tokenCount = estimateRecordingTokens(text);
    appendMetric(cwd, now, {
      operation: "inject",
      status: results.length > 0 ? "ok" : "empty",
      latencyMs: Date.now() - started,
      query: opts.query,
      recordingId: results[0]?.record.id,
      score: results[0]?.score,
      sourceReference: results[0]?.record.source,
      injectionTokens: tokenCount,
      fullTranscriptIncluded: Boolean(opts.expandTranscript),
    });
    return {
      kind: "inject",
      text,
      match: results[0],
      tokenCount,
      fullTranscriptIncluded: Boolean(opts.expandTranscript),
    };
  }

  if (opts.action === "metrics") {
    return {
      kind: "metrics",
      summary: summarizeRecordingMetrics(loadRecordingMetrics(cwd)),
    };
  }

  if (opts.action === "benchmark") {
    return await runRecordingBenchmark({ cwd, homeDir, now, reportPath: opts.reportPath });
  }

  const records = loadVisibleRecords(cwd, homeDir, "all");
  const record = records.find((r) => r.id === opts.id);
  return {
    kind: "show",
    record: record ? sanitizeRecord(record, opts.expandTranscript) : undefined,
  };
}

export async function retrieveRecordingMemoriesForPrompt(
  args: RecordingPromptRetrievalArgs,
): Promise<RecordingPromptRetrievalResult> {
  const result = await executeRecording({
    action: "inject",
    query: args.userMessage,
    cwd: args.cwd,
    homeDir: args.homeDir,
    limit: args.limit ?? 3,
  });
  const matches =
    result.kind === "inject" && result.match
      ? [result.match].filter((r) => !args.sessionSeenIds.has(r.record.id))
      : [];
  return {
    matches,
    injectedIds: matches.map((m) => m.record.id),
    injectionText: matches.length > 0 ? formatRecordingMemoryInjection(matches) : "",
    injectionTokens: result.kind === "inject" ? result.tokenCount : 0,
  };
}

export function formatRecordingMemoryInjection(
  matches: RecordingSearchResult[],
  includeTranscript = false,
): string {
  if (matches.length === 0) return "";
  const lines = ["◈ TeamAgent Recording Memory 相关录音"];
  for (const match of matches) {
    const r = match.record;
    lines.push(
      `- ${r.title} (${r.visibility})`,
      `  摘要: ${r.summary.slice(0, 220)}`,
      `  来源: ${r.source}`,
      `  上传人: ${r.uploadedBy}`,
      `  适用场景: ${r.useWhen.slice(0, 180)}`,
      `  为什么相关: ${match.whyRelevant}`,
      includeTranscript && r.transcript
        ? `  Transcript: ${r.transcript}`
        : `  展开: teamagent recording show ${r.id} --transcript`,
    );
  }
  const text = lines.join("\n");
  if (includeTranscript || estimateRecordingTokens(text) <= DEFAULT_MAX_INJECTION_TOKENS) {
    return text;
  }
  return `${text.slice(0, DEFAULT_MAX_INJECTION_TOKENS * 4 - 64).trimEnd()}\n[trimmed to ${DEFAULT_MAX_INJECTION_TOKENS} token budget]`;
}

export function renderRecordingResult(result: RecordingCommandResult): string {
  return JSON.stringify(result, null, 2) + "\n";
}

export async function executeRecordingCommand(
  argv: string[],
  env: { cwd: string; now?: () => Date; homeDir?: string },
): Promise<string> {
  const result = await executeRecording({
    ...parseRecordingArgs(argv),
    cwd: env.cwd,
    homeDir: env.homeDir,
    now: env.now,
  });
  return renderRecordingResult(result);
}

function renderBenchmarkReport(result: Extract<RecordingCommandResult, { kind: "benchmark" }>): string {
  const lines = [
    "# Recording Memory Golden Prompt Benchmark",
    "",
    "## Recording Examples",
    "",
    ...GOLDEN_MATERIALS.map((m) => `- ${String(m.title)} (${String(m.source)})`),
    "",
    "## Results",
    "",
    "| # | Prompt | Expected Recording | Actual Recording | Pass | Injection Tokens |",
    "|---|---|---|---|---|---|",
    ...result.rows.map((row, i) =>
      `| ${i + 1} | ${row.prompt.replace(/\|/g, "\\|")} | ${row.expectedId} | ${row.actualId || "(empty)"} | ${row.pass ? "PASS" : "FAIL"} | ${row.injectionTokens} |`,
    ),
    "",
    `Pass rate: ${result.passCount}/${result.total}`,
    `Acceptance: ${result.ok ? "PASS" : "FAIL"}`,
    `Default injection budget: ${DEFAULT_MAX_INJECTION_TOKENS} tokens`,
    "Full transcript appears only after explicit expansion with `teamagent recording show <id> --transcript` or `teamagent recording inject --full`.",
    "",
  ];
  return lines.join("\n");
}

async function runRecordingBenchmark(args: {
  cwd: string;
  homeDir: string;
  now: () => Date;
  reportPath?: string;
}): Promise<Extract<RecordingCommandResult, { kind: "benchmark" }>> {
  const started = Date.now();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-recording-bench-"));
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-recording-home-"));
  const idsBySource = new Map<string, string>();
  for (const [index, material] of GOLDEN_MATERIALS.entries()) {
    const filePath = path.join(tmpRoot, `recording-${index}.json`);
    fs.writeFileSync(filePath, JSON.stringify(material, null, 2), "utf-8");
    const imported = await executeRecording({
      action: "import",
      filePath,
      cwd: tmpRoot,
      homeDir: tmpHome,
      now: args.now,
      idGen: () => `golden-${index + 1}`,
    });
    if (imported.kind === "import") idsBySource.set(imported.record.source, imported.record.id);
  }
  const evaluatedRows: Array<{
    prompt: string;
    expectedId: string;
    actualId: string;
    pass: boolean;
    injectionTokens: number;
  }> = [];
  for (const item of GOLDEN_PROMPTS) {
    const expectedId = idsBySource.get(item.expectedSource) ?? "";
    const injected = await executeRecording({
      action: "inject",
      query: item.prompt,
      cwd: tmpRoot,
      homeDir: tmpHome,
      now: args.now,
    });
    const actualId = injected.kind === "inject" ? injected.match?.record.id ?? "" : "";
    const injectionTokens = injected.kind === "inject" ? injected.tokenCount : 0;
    evaluatedRows.push({
      prompt: item.prompt,
      expectedId,
      actualId,
      pass: actualId === expectedId && injectionTokens <= DEFAULT_MAX_INJECTION_TOKENS,
      injectionTokens,
    });
  }
  const passCount = evaluatedRows.filter((r) => r.pass).length;
  const result: Extract<RecordingCommandResult, { kind: "benchmark" }> = {
    kind: "benchmark",
    ok: passCount >= 8,
    passCount,
    total: evaluatedRows.length,
    reportPath: args.reportPath ?? path.join(args.cwd, "docs", "verification", "recording-memory-golden-benchmark.md"),
    rows: evaluatedRows,
  };
  fs.mkdirSync(path.dirname(result.reportPath), { recursive: true });
  fs.writeFileSync(result.reportPath, renderBenchmarkReport(result), "utf-8");
  appendMetric(args.cwd, args.now, {
    operation: "benchmark",
    status: result.ok ? "ok" : "failed",
    latencyMs: Date.now() - started,
    injectionTokens: Math.max(...evaluatedRows.map((r) => r.injectionTokens)),
    fullTranscriptIncluded: false,
    error: result.ok ? undefined : `passCount=${passCount}`,
  });
  return result;
}
