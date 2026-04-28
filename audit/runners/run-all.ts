import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type DecisionStatus = "passed" | "failed" | "blocked" | "missing";

interface RunnerSpec {
  id: string;
  file: string;
  expectedFailure?: boolean;
}

interface RunnerSummary {
  id: string;
  file: string;
  exitCode: number | null;
  status: DecisionStatus;
  expectedFailure: boolean;
  decisionPath: string | null;
  stdoutPath: string;
  stderrPath: string;
  summary: string;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(repoRoot, "audit", "out", "run-all", runId);

const runners: RunnerSpec[] = [
  { id: "feature-01-init", file: "feature-01-init.ts" },
  { id: "feature-02-doctor-json", file: "feature-02-doctor-json.ts" },
  { id: "feature-03-stats", file: "feature-03-stats.ts" },
  { id: "feature-04-review", file: "feature-04-review.ts" },
  { id: "feature-05-pitfall", file: "feature-05-pitfall.ts" },
  { id: "feature-06-compile", file: "feature-06-compile.ts" },
  // This runner intentionally exposes the current v2 calibrate gap:
  // DB/compile change, but no calibrator.adjusted event is written.
  { id: "feature-07-calibrate", file: "feature-07-calibrate.ts", expectedFailure: true },
  { id: "feature-08-analyze-commit", file: "feature-08-analyze-commit.ts" },
  { id: "feature-09-wiki", file: "feature-09-wiki.ts" },
  { id: "feature-10-install-plugins", file: "feature-10-install-plugins.ts" },
  { id: "feature-11-hooks-enable-disable", file: "feature-11-hooks-enable-disable.ts" },
  { id: "feature-12-uninstall-delete-data", file: "feature-12-uninstall-delete-data.ts" },
  { id: "feature-13-benchmark", file: "feature-13-benchmark.ts" },
  { id: "feature-19-statusline", file: "feature-19-statusline.ts" },
  { id: "feature-20-attribution-visibility", file: "feature-20-attribution-visibility.ts" },
];

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

function featurePathNeedles(featureId: string): string[] {
  const needles = [featureId];
  const match = /^feature-(\d+)-(.+)$/.exec(featureId);
  if (match) needles.push(`${match[1]}-${match[2]}`);
  return needles;
}

function newestDecision(featureId: string, sinceMs: number): string | null {
  const root = path.join(repoRoot, "audit", "out");
  if (!existsSync(root)) return null;
  const candidates: string[] = [];
  const needles = featurePathNeedles(featureId);
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (
        name === "decision.json" &&
        needles.some((needle) => full.includes(needle)) &&
        st.mtimeMs >= sinceMs - 2000
      ) {
        candidates.push(full);
      }
    }
  }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0] ?? null;
}

function parseDecision(file: string | null): { status: DecisionStatus; summary: string } {
  if (!file) return { status: "missing", summary: "未找到 decision.json" };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
      status?: DecisionStatus;
      summary?: string;
    };
    return {
      status: parsed.status ?? "missing",
      summary: parsed.summary ?? "",
    };
  } catch (err) {
    return { status: "missing", summary: `decision.json 解析失败: ${String(err)}` };
  }
}

function writeReport(summaries: RunnerSummary[]): void {
  const report = {
    generatedAt: new Date().toISOString(),
    expectedFailures: summaries.filter((s) => s.expectedFailure).map((s) => s.id),
    totals: {
      passed: summaries.filter((s) => s.status === "passed").length,
      failed: summaries.filter((s) => s.status === "failed").length,
      blocked: summaries.filter((s) => s.status === "blocked").length,
      missing: summaries.filter((s) => s.status === "missing").length,
    },
    summaries,
  };
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(report, null, 2) + "\n", "utf-8");

  const lines = [
    "# TeamAgent Non-Self Audit Run",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Feature | Status | Exit | Expected Failure | Decision |",
    "|---|---|---:|---|---|",
    ...summaries.map((s) => {
      const decision = s.decisionPath ? path.relative(repoRoot, s.decisionPath) : "(missing)";
      return `| ${s.id} | ${s.status} | ${s.exitCode ?? "null"} | ${s.expectedFailure ? "yes" : "no"} | ${decision} |`;
    }),
    "",
    "## Notes",
    "",
    "- `feature-07-calibrate` is currently marked as an expected failure because the audit exposes the missing `calibrator.adjusted` event in the default v2 path.",
    "- Every runner writes its own evidence directory under `audit/out/<feature>/<timestamp>/`.",
    "",
  ];
  writeFileSync(path.join(outDir, "summary.md"), lines.join("\n"), "utf-8");
}

function main(): void {
  mkdirSync(outDir, { recursive: true });
  const summaries: RunnerSummary[] = [];

  for (const runner of runners) {
    const startedAt = Date.now();
    const base = safeName(runner.id);
    const stdoutPath = path.join(outDir, `${base}.stdout.txt`);
    const stderrPath = path.join(outDir, `${base}.stderr.txt`);
    const command = ["pnpm", "exec", "tsx", path.join("audit", "runners", runner.file)];
    writeFileSync(
      path.join(outDir, `${base}.command.json`),
      JSON.stringify({ command, cwd: repoRoot }, null, 2) + "\n",
      "utf-8",
    );

    const result = spawnSync(command[0]!, command.slice(1), {
      cwd: repoRoot,
      env: process.env,
      encoding: "utf-8",
      maxBuffer: 100 * 1024 * 1024,
    });
    writeFileSync(stdoutPath, result.stdout ?? "", "utf-8");
    writeFileSync(stderrPath, result.stderr ?? "", "utf-8");
    writeFileSync(path.join(outDir, `${base}.exit-code.txt`), `${result.status ?? "null"}\n`, "utf-8");

    const decisionPath = newestDecision(runner.id, startedAt);
    const parsed = parseDecision(decisionPath);
    summaries.push({
      id: runner.id,
      file: runner.file,
      exitCode: result.status,
      status: parsed.status,
      expectedFailure: runner.expectedFailure === true,
      decisionPath,
      stdoutPath,
      stderrPath,
      summary: parsed.summary,
    });
  }

  writeReport(summaries);

  const unexpected = summaries.filter((s) => {
    if (s.expectedFailure) return s.status !== "failed";
    return s.status !== "passed";
  });

  process.stdout.write(`Audit summary: ${path.join(outDir, "summary.md")}\n`);
  for (const s of summaries) {
    process.stdout.write(`${s.status.padEnd(7)} ${s.id}${s.expectedFailure ? " (expected failure)" : ""}\n`);
  }
  if (unexpected.length > 0) {
    process.stderr.write(`Unexpected audit outcomes: ${unexpected.map((s) => s.id).join(", ")}\n`);
    process.exitCode = 1;
  }
}

main();
