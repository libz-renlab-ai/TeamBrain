import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  estimateRecordingTokens,
  executeRecording,
  formatRecordingMemoryInjection,
  loadRecordingMetrics,
  parseRecordingArgs,
  retrieveRecordingMemoriesForPrompt,
  summarizeRecordingMetrics,
} from "../commands/recording.js";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-recording-test-"));
}

const now = () => new Date("2026-04-29T12:00:00.000Z");

async function seedRecording(cwd: string, homeDir = tmpdir()) {
  const filePath = path.join(cwd, "material.json");
  fs.writeFileSync(filePath, JSON.stringify({
    title: "Recording Memory import decision",
    source: "docs/specs/2026-04-29-recording-memory-performance-verification.md",
    transcript:
      "Full transcript: Alice said importing existing meeting transcripts is useful. Bob said source references are required. Chen said do not dump the whole transcript into prompt context unless explicitly requested.",
    uploadedBy: "teamagent",
    useWhen: "Questions about recording memory import, source references, and prompt injection.",
    summary:
      "Recording Memory should import transcripts and summaries, cite source references, and keep default injected context small.",
    visibility: "public",
  }), "utf-8");
  return executeRecording({
    action: "import",
    filePath,
    cwd,
    homeDir,
    now,
    idGen: () => "rec-import-decision",
  });
}

describe("recording memory", () => {
  it("renders stable JSON help for canonical hard-match verification", async () => {
    const result = await executeRecording(parseRecordingArgs(["--help"]));
    expect(result.kind).toBe("help");
    if (result.kind === "help") {
      expect(result.command).toBe("teamagent recording");
      expect(result.subcommands.map((s) => s.name)).toEqual([
        "import",
        "search",
        "show",
        "inject",
        "metrics",
        "benchmark",
      ]);
    }
  });

  it("imports and searches source-cited recording memory", async () => {
    const cwd = tmpdir();
    const homeDir = tmpdir();
    await seedRecording(cwd, homeDir);

    const result = await executeRecording({
      action: "search",
      query: "where did we decide source references for recording memory import",
      cwd,
      homeDir,
      now,
    });

    expect(result.kind).toBe("search");
    if (result.kind === "search") {
      expect(result.results[0]?.record.id).toBe("rec-import-decision");
      expect(result.results[0]?.record.source).toContain("recording-memory-performance");
      expect(result.results[0]?.record.transcript).toBeUndefined();
    }
  });

  it("injects small default context with source reference and no full transcript", async () => {
    const cwd = tmpdir();
    const homeDir = tmpdir();
    await seedRecording(cwd, homeDir);

    const result = await executeRecording({
      action: "inject",
      query: "recording memory import source references",
      cwd,
      homeDir,
      now,
    });

    expect(result.kind).toBe("inject");
    if (result.kind === "inject") {
      expect(result.text).toContain("TeamAgent Recording Memory");
      expect(result.text).toContain("来源:");
      expect(result.text).toContain("docs/specs/2026-04-29-recording-memory-performance-verification.md");
      expect(result.text).not.toContain("Full transcript: Alice said");
      expect(result.tokenCount).toBeLessThanOrEqual(800);
      expect(result.fullTranscriptIncluded).toBe(false);
    }
  });

  it("includes full transcript only after explicit expansion", async () => {
    const cwd = tmpdir();
    const homeDir = tmpdir();
    await seedRecording(cwd, homeDir);

    const show = await executeRecording({
      action: "show",
      id: "rec-import-decision",
      expandTranscript: true,
      cwd,
      homeDir,
      now,
    });

    expect(show.kind).toBe("show");
    if (show.kind === "show") {
      expect(show.record?.transcript).toContain("Full transcript: Alice said");
    }
  });

  it("records injection metrics for ok and empty retrievals", async () => {
    const cwd = tmpdir();
    const homeDir = tmpdir();
    await seedRecording(cwd, homeDir);

    await executeRecording({ action: "inject", query: "recording memory import", cwd, homeDir, now });
    await executeRecording({ action: "inject", query: "unrelated rust borrow checker", cwd, homeDir, now });

    const summary = summarizeRecordingMetrics(loadRecordingMetrics(cwd));
    expect(summary.injections).toBe(2);
    expect(summary.empty).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.p50LatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("retrieves prompt injection text for UserPromptSubmit hook", async () => {
    const cwd = tmpdir();
    const homeDir = tmpdir();
    await seedRecording(cwd, homeDir);

    const result = await retrieveRecordingMemoriesForPrompt({
      userMessage: "what did recording memory decide about source references",
      cwd,
      homeDir,
      sessionSeenIds: new Set(),
    });

    expect(result.injectedIds).toEqual(["rec-import-decision"]);
    expect(result.injectionText).toContain("来源:");
    expect(result.injectionText).not.toContain("Full transcript: Alice said");
  });

  it("runs the golden prompt benchmark and writes raw evidence report", async () => {
    const cwd = tmpdir();
    const homeDir = tmpdir();
    const reportPath = path.join(cwd, "evidence", "golden.md");

    const result = await executeRecording({
      action: "benchmark",
      cwd,
      homeDir,
      now,
      reportPath,
    });

    expect(result.kind).toBe("benchmark");
    if (result.kind === "benchmark") {
      expect(result.ok).toBe(true);
      expect(result.passCount).toBeGreaterThanOrEqual(8);
    }
    expect(fs.readFileSync(reportPath, "utf-8")).toContain("Recording Memory Golden Prompt Benchmark");
  });

  it("walks up to project root for public store / metrics / private key (issue #161)", async () => {
    // Create root with .teamagent/knowledge.db marker, then call from a
    // subfolder. publicStorePath, metricsPath, and the privateStorePath hash
    // must all resolve to the project root, not the subfolder.
    const root = tmpdir();
    const homeDir = tmpdir();
    fs.mkdirSync(path.join(root, ".teamagent"), { recursive: true });
    fs.writeFileSync(path.join(root, ".teamagent", "knowledge.db"), "");
    // Project marker so hardened walk-up accepts root
    fs.writeFileSync(path.join(root, "package.json"), "{}");

    const subdir = path.join(root, "packages", "cli");
    fs.mkdirSync(subdir, { recursive: true });

    // Import a public recording from the subdir.
    const filePath = path.join(subdir, "material.json");
    fs.writeFileSync(filePath, JSON.stringify({
      title: "walk-up public",
      source: "docs/walkup-public.md",
      transcript: "transcript body",
      uploadedBy: "teamagent",
      useWhen: "When verifying issue #161 walk-up.",
      summary: "Public store should resolve to project root.",
      visibility: "public",
    }), "utf-8");

    await executeRecording({
      action: "import",
      filePath,
      cwd: subdir,
      homeDir,
      now,
      idGen: () => "rec-walkup-public",
    });

    // Public store written at root, NOT under subdir
    expect(fs.existsSync(path.join(root, ".teamagent", "recordings.json"))).toBe(true);
    expect(fs.existsSync(path.join(subdir, ".teamagent", "recordings.json"))).toBe(false);

    // Metrics written at root, not subdir
    expect(fs.existsSync(path.join(root, ".teamagent", "recording-memory", "metrics.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(subdir, ".teamagent", "recording-memory", "metrics.jsonl"))).toBe(false);

    // Search from subdir should find the recording (via the same project root)
    const search = await executeRecording({
      action: "search",
      query: "walk up",
      cwd: subdir,
      homeDir,
      now,
    });
    expect(search.kind).toBe("search");
    if (search.kind === "search") {
      expect(search.results[0]?.record.id).toBe("rec-walkup-public");
    }

    // Importing a private recording from a deeper subfolder must also map to
    // the same project key (so root and subfolder share the private store).
    const privateFile = path.join(subdir, "private-material.json");
    fs.writeFileSync(privateFile, JSON.stringify({
      title: "walk-up private",
      source: "docs/walkup-private.md",
      transcript: "private transcript",
      uploadedBy: "teamagent",
      useWhen: "Private walk-up.",
      summary: "Private store key must hash project root.",
      visibility: "private",
    }), "utf-8");

    await executeRecording({
      action: "import",
      filePath: privateFile,
      cwd: subdir,
      homeDir,
      now,
      idGen: () => "rec-walkup-private",
    });

    const fromRoot = await executeRecording({
      action: "search",
      query: "walk up",
      cwd: root,
      homeDir,
      now,
    });
    expect(fromRoot.kind).toBe("search");
    if (fromRoot.kind === "search") {
      const ids = fromRoot.results.map((r) => r.record.id);
      expect(ids).toContain("rec-walkup-public");
      expect(ids).toContain("rec-walkup-private");
    }
  });

  it("migrates legacy private recordings keyed by sha256(cwd) to the walk-up key (#161)", async () => {
    // Pre-walk-up upgrade scenario: a user imported a private recording from
    // a sub-folder when `projectKey` still hashed the literal `cwd`. After
    // upgrading to the walk-up release, `projectKey` hashes the resolved
    // project root instead. We must transparently surface the legacy file
    // on first read and migrate its contents to the new key, otherwise the
    // user silently loses their private recordings.
    const root = tmpdir();
    const homeDir = tmpdir();
    fs.mkdirSync(path.join(root, ".teamagent"), { recursive: true });
    fs.writeFileSync(path.join(root, ".teamagent", "knowledge.db"), "");
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    const subdir = path.join(root, "packages", "cli");
    fs.mkdirSync(subdir, { recursive: true });

    // Manually plant a legacy-keyed private recording at the OLD path:
    //   `~/.teamagent/recordings/<sha256(subdir)>.json`.
    const { createHash } = await import("node:crypto");
    const legacyKey = createHash("sha256")
      .update(path.resolve(subdir))
      .digest("hex")
      .slice(0, 20);
    const legacyDir = path.join(homeDir, ".teamagent", "recordings");
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacyFile = path.join(legacyDir, `${legacyKey}.json`);
    const legacyRecord = {
      id: "legacy-private-1",
      title: "legacy private",
      source: "docs/legacy.md",
      transcript: "old transcript",
      uploadedBy: "teamagent",
      useWhen: "Pre-walk-up imports.",
      summary: "Should still be findable after upgrade.",
      visibility: "private" as const,
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
    };
    fs.writeFileSync(legacyFile, JSON.stringify([legacyRecord], null, 2), "utf-8");

    // Search from the same sub-folder. The walk-up + migration should pick up
    // the legacy file even though the new key targets a different path.
    const search = await executeRecording({
      action: "search",
      query: "legacy",
      cwd: subdir,
      homeDir,
      now,
      visibility: "private",
    });
    expect(search.kind).toBe("search");
    if (search.kind === "search") {
      const ids = search.results.map((r) => r.record.id);
      expect(ids).toContain("legacy-private-1");
    }

    // The new walk-up keyed path now exists with the migrated content.
    const newKey = createHash("sha256")
      .update(path.resolve(root))
      .digest("hex")
      .slice(0, 20);
    const newFile = path.join(homeDir, ".teamagent", "recordings", `${newKey}.json`);
    expect(fs.existsSync(newFile)).toBe(true);
    const migrated = JSON.parse(fs.readFileSync(newFile, "utf-8")) as Array<{ id: string }>;
    expect(migrated.map((r) => r.id)).toContain("legacy-private-1");
  });

  it("keeps token estimation monotonic and formatter under default budget", () => {
    expect(estimateRecordingTokens("abcd")).toBe(1);
    expect(estimateRecordingTokens("a".repeat(100))).toBeGreaterThan(estimateRecordingTokens("a".repeat(20)));
    const text = formatRecordingMemoryInjection([
      {
        score: 1,
        whyRelevant: "matched summary",
        record: {
          id: "r",
          title: "Long",
          source: "source.md",
          uploadedBy: "teamagent",
          useWhen: "a".repeat(4_000),
          summary: "b".repeat(4_000),
          visibility: "public",
          createdAt: now().toISOString(),
          updatedAt: now().toISOString(),
        },
      },
    ]);
    expect(estimateRecordingTokens(text)).toBeLessThanOrEqual(820);
  });
});
