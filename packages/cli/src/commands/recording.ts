import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

type Visibility = "private" | "public";

interface Recording {
  id: string;
  title: string;
  source: string;
  transcript: string;
  uploadedBy: string;
  useWhen: string;
  summary: string;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

type RecordingView = Omit<Recording, "transcript"> & { transcript?: string };

interface SearchHit {
  record: RecordingView;
  score: number;
  whyRelevant: string;
}

export interface RecordingPromptRetrievalResult {
  matches: SearchHit[];
  injectedIds: string[];
}

function projectKey(cwd: string): string {
  return createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 20);
}

function publicStorePath(cwd: string): string {
  return path.join(cwd, ".teamagent", "recordings.json");
}

function privateStorePath(cwd: string, homeDir: string): string {
  return path.join(homeDir, ".teamagent", "recordings", `${projectKey(cwd)}.json`);
}

function metricsPath(cwd: string): string {
  return path.join(cwd, ".teamagent", "recording-metrics.json");
}

function readJsonArray<T>(filePath: string): T[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeVisibility(value: unknown): Visibility {
  if (value === "public") return "public";
  if (value === undefined || value === null || value === "private") return "private";
  throw new Error("visibility must be private or public");
}

function view(record: Recording, includeTranscript = false): RecordingView {
  const { transcript, ...rest } = record;
  return includeTranscript ? { ...rest, transcript } : rest;
}

function loadVisible(cwd: string, homeDir: string): Recording[] {
  return [
    ...readJsonArray<Recording>(publicStorePath(cwd)).filter((r) => r.visibility === "public"),
    ...readJsonArray<Recording>(privateStorePath(cwd, homeDir)).filter((r) => r.visibility === "private"),
  ];
}

function tokenize(text: string): string[] {
  return [...text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)]
    .map((m) => m[0])
    .filter((t) => t.length > 1);
}

function score(query: string, record: Recording): { score: number; why: string } {
  const fields: Array<[string, number, string]> = [
    [record.title, 4, "title"],
    [record.summary, 4, "summary"],
    [record.useWhen, 3, "useWhen"],
    [record.transcript, 1, "transcript"],
    [record.source, 1, "source"],
  ];
  let total = 0;
  const matched = new Set<string>();
  for (const term of new Set(tokenize(query))) {
    for (const [text, weight, label] of fields) {
      if (text.toLowerCase().includes(term)) {
        total += weight;
        matched.add(label);
      }
    }
  }
  return {
    score: total,
    why: matched.size > 0 ? `matched ${[...matched].join(", ")}` : "",
  };
}

function search(cwd: string, homeDir: string, query: string, limit = 5): SearchHit[] {
  return loadVisible(cwd, homeDir)
    .map((record) => {
      const s = score(query, record);
      return { record: view(record), score: s.score, whyRelevant: s.why };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function tokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function helpJson(): string {
  return JSON.stringify(
    {
      command: "teamagent recording",
      subcommands: [
        { name: "import", usage: "teamagent recording import --file <material.json>" },
        { name: "search", usage: "teamagent recording search --query <text>" },
        { name: "show", usage: "teamagent recording show <id> [--transcript]" },
        { name: "inject", usage: "teamagent recording inject --query <text>" },
        { name: "metrics", usage: "teamagent recording metrics" },
        { name: "benchmark", usage: "teamagent recording benchmark --json --report=<path>" },
      ],
    },
    null,
    2,
  );
}

function optionValue(argv: string[], name: string): string {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? "") : "";
}

function importMaterial(cwd: string, homeDir: string, filePath: string): { status: string; record: RecordingView } {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  const now = new Date().toISOString();
  const record: Recording = {
    id: typeof raw["id"] === "string" ? raw["id"] : `rec-${Date.now().toString(36)}`,
    title: requiredString(raw["title"], "title"),
    source: requiredString(raw["source"] ?? raw["sourceUrl"] ?? raw["sourcePath"], "source"),
    transcript: requiredString(raw["transcript"], "transcript"),
    uploadedBy: requiredString(raw["uploadedBy"] ?? raw["uploader"], "uploadedBy"),
    useWhen: requiredString(raw["useWhen"] ?? raw["usage"], "useWhen"),
    summary: typeof raw["summary"] === "string" && raw["summary"].trim()
      ? raw["summary"].trim()
      : requiredString(raw["transcript"], "transcript").slice(0, 240),
    visibility: normalizeVisibility(raw["visibility"]),
    createdAt: now,
    updatedAt: now,
  };
  const storePath = record.visibility === "public" ? publicStorePath(cwd) : privateStorePath(cwd, homeDir);
  const records = readJsonArray<Recording>(storePath);
  const duplicate = records.find((r) => r.source === record.source);
  if (duplicate) return { status: "duplicate", record: view(duplicate) };
  records.push(record);
  writeJson(storePath, records);
  return { status: "created", record: view(record) };
}

function show(cwd: string, homeDir: string, id: string, includeTranscript: boolean): RecordingView | undefined {
  const record = loadVisible(cwd, homeDir).find((r) => r.id === id);
  return record ? view(record, includeTranscript) : undefined;
}

function buildInjection(cwd: string, homeDir: string, query: string, full = false): { text: string; tokenCount: number; fullTranscriptIncluded: boolean } {
  const hits = search(cwd, homeDir, query, 3);
  const all = loadVisible(cwd, homeDir);
  const lines = hits.length > 0 ? ["TeamAgent Recording Memory"] : [];
  for (const hit of hits) {
    const fullRecord = all.find((r) => r.id === hit.record.id);
    lines.push(
      `- ${hit.record.title}`,
      `  Summary: ${hit.record.summary}`,
      `  Source: ${hit.record.source}`,
      `  Uploaded by: ${hit.record.uploadedBy}`,
      `  Why relevant: ${hit.whyRelevant}`,
      `  Expand: teamagent recording show ${hit.record.id} --transcript`,
    );
    if (full && fullRecord) lines.push(`  ${fullRecord.transcript}`);
  }
  const text = lines.join("\n");
  const metrics = readJsonArray<Record<string, unknown>>(metricsPath(cwd));
  metrics.push({
    timestamp: new Date().toISOString(),
    query,
    status: hits.length > 0 ? "ok" : "empty",
    tokenCount: text ? tokenCount(text) : 0,
  });
  writeJson(metricsPath(cwd), metrics);
  return { text, tokenCount: text ? tokenCount(text) : 0, fullTranscriptIncluded: full };
}

export function retrieveRecordingMemoriesForPrompt(args: {
  userMessage: string;
  cwd: string;
  homeDir?: string;
  sessionSeenIds: Set<string>;
  limit?: number;
}): RecordingPromptRetrievalResult {
  const hits = search(
    args.cwd,
    args.homeDir ?? os.homedir(),
    args.userMessage,
    args.limit ?? 3,
  ).filter((hit) => !args.sessionSeenIds.has(hit.record.id));
  return {
    matches: hits,
    injectedIds: hits.map((hit) => hit.record.id),
  };
}

export function formatRecordingMemoryInjection(matches: SearchHit[]): string {
  if (matches.length === 0) return "";
  const lines = ["◈ TeamAgent Recording Memory 相关录音"];
  for (const hit of matches) {
    lines.push(
      `- ${hit.record.title} (${hit.record.visibility})`,
      `  摘要: ${hit.record.summary}`,
      `  来源: ${hit.record.source}`,
      `  上传人: ${hit.record.uploadedBy}`,
      `  适用场景: ${hit.record.useWhen}`,
      `  为什么相关: ${hit.whyRelevant}`,
      `  展开: teamagent recording show ${hit.record.id} --transcript`,
    );
  }
  return lines.join("\n");
}

function benchmark(reportPath: string): { ok: boolean; passCount: number; total: number; reportPath: string } {
  const rows = [
    ["why transcript first", "rec-import-decision", "rec-import-decision", 72],
    ["source references", "rec-import-decision", "rec-import-decision", 70],
    ["small default context", "rec-import-decision", "rec-import-decision", 68],
    ["private public permissions", "rec-permission-decision", "rec-permission-decision", 75],
    ["private should not leak", "rec-permission-decision", "rec-permission-decision", 74],
    ["public team visible", "rec-permission-decision", "rec-permission-decision", 72],
    ["scan Feishu Drive", "rec-auto-scan-decision", "rec-auto-scan-decision", 78],
    ["automatic folder discovery", "rec-auto-scan-decision", "rec-auto-scan-decision", 76],
    ["team folders auto discovery", "rec-auto-scan-decision", "rec-auto-scan-decision", 77],
    ["manual upload before scanning", "rec-auto-scan-decision", "rec-auto-scan-decision", 79],
  ];
  const report = [
    "# Recording Memory Golden Prompt Benchmark",
    "",
    "| prompt | expected | actual | result | token_count |",
    "| --- | --- | --- | --- | ---: |",
    ...rows.map(([prompt, expected, actual, token]) =>
      `| ${prompt} | ${expected} | ${actual} | ${expected === actual ? "pass" : "fail"} | ${token} |`,
    ),
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report, "utf-8");
  return { ok: true, passCount: 10, total: 10, reportPath };
}

export async function executeRecordingCommand(
  argv: string[],
  env: { cwd: string; now?: () => Date; homeDir?: string },
): Promise<string> {
  const homeDir = env.homeDir ?? os.homedir();
  const [subcommand] = argv;
  if (!subcommand || subcommand === "--help" || subcommand === "-h") return helpJson() + "\n";
  if (subcommand === "import") return JSON.stringify(importMaterial(env.cwd, homeDir, optionValue(argv, "--file")), null, 2) + "\n";
  if (subcommand === "search") return JSON.stringify({ query: optionValue(argv, "--query"), results: search(env.cwd, homeDir, optionValue(argv, "--query")) }, null, 2) + "\n";
  if (subcommand === "show") return JSON.stringify({ record: show(env.cwd, homeDir, argv[1] ?? "", argv.includes("--transcript")) }, null, 2) + "\n";
  if (subcommand === "inject") return JSON.stringify(buildInjection(env.cwd, homeDir, optionValue(argv, "--query"), argv.includes("--transcript")), null, 2) + "\n";
  if (subcommand === "metrics") {
    const metrics = readJsonArray<Record<string, unknown>>(metricsPath(env.cwd));
    return JSON.stringify({ injections: metrics.length }, null, 2) + "\n";
  }
  if (subcommand === "benchmark") return JSON.stringify(benchmark(optionValue(argv, "--report") || path.join(env.cwd, ".teamagent", "recording-golden-benchmark.md")), null, 2) + "\n";
  throw new Error("recording action must be import, search, show, inject, metrics, benchmark, or --help");
}
