import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  executeRecordingCommand,
  formatRecordingMemoryInjection,
  retrieveRecordingMemoriesForPrompt,
} from "../commands/recording.js";

let tmpDir: string | undefined;

afterEach(() => {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

function workspace() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "teamagent-recording-"));
  const cwd = path.join(tmpDir, "repo");
  const homeA = path.join(tmpDir, "home-a");
  const homeB = path.join(tmpDir, "home-b");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(homeA, { recursive: true });
  fs.mkdirSync(homeB, { recursive: true });
  return { cwd, homeA, homeB };
}

function materialFile(
  dir: string,
  overrides: Partial<Record<string, unknown>> = {},
): string {
  const filePath = path.join(dir, `${String(overrides["id"] ?? "recording")}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        id: "rec-import-decision",
        title: "Recording Memory import decision",
        source: "file:///recordings/import-decision.mp3",
        transcript:
          "Full transcript says recording memory starts transcript-first and source references are required.",
        uploadedBy: "liushiyu",
        useWhen: "Use when designing recording memory import and source references.",
        summary: "Recording Memory should import transcripts and cite sources.",
        visibility: "public",
        ...overrides,
      },
      null,
      2,
    ),
    "utf-8",
  );
  return filePath;
}

describe("recording command", () => {
  it("renders stable JSON help", async () => {
    const { cwd, homeA } = workspace();
    const out = JSON.parse(
      await executeRecordingCommand(["--help"], { cwd, homeDir: homeA }),
    );
    expect(out.command).toBe("teamagent recording");
    expect(out.subcommands.map((s: { name: string }) => s.name)).toEqual([
      "import",
      "search",
      "show",
      "inject",
      "metrics",
      "benchmark",
    ]);
  });

  it("imports and searches a source-backed recording without returning full transcript", async () => {
    const { cwd, homeA } = workspace();
    const filePath = materialFile(tmpDir!);
    const imported = JSON.parse(
      await executeRecordingCommand(["import", "--file", filePath], { cwd, homeDir: homeA }),
    );
    expect(imported.status).toBe("created");
    expect(imported.record.source).toBe("file:///recordings/import-decision.mp3");

    const search = JSON.parse(
      await executeRecordingCommand(
        ["search", "--query", "recording memory source references"],
        { cwd, homeDir: homeA },
      ),
    );
    expect(search.results[0].record.id).toBe("rec-import-decision");
    expect(search.results[0].record.transcript).toBeUndefined();
    expect(search.results[0].whyRelevant).toContain("matched");
  });

  it("keeps private recordings invisible to a different home directory", async () => {
    const { cwd, homeA, homeB } = workspace();
    const privateFile = materialFile(tmpDir!, {
      id: "rec-private",
      source: "file:///recordings/private.mp3",
      visibility: "private",
    });
    const publicFile = materialFile(tmpDir!, {
      id: "rec-public",
      source: "file:///recordings/public.mp3",
      visibility: "public",
    });
    await executeRecordingCommand(["import", "--file", privateFile], { cwd, homeDir: homeA });
    await executeRecordingCommand(["import", "--file", publicFile], { cwd, homeDir: homeA });

    const otherUserSearch = JSON.parse(
      await executeRecordingCommand(
        ["search", "--query", "recording memory source references"],
        { cwd, homeDir: homeB },
      ),
    );
    expect(otherUserSearch.results.map((r: { record: { id: string } }) => r.record.id)).toEqual([
      "rec-public",
    ]);
  });

  it("injects short prompt context once per session and excludes full transcript", async () => {
    const { cwd, homeA } = workspace();
    await executeRecordingCommand(["import", "--file", materialFile(tmpDir!)], {
      cwd,
      homeDir: homeA,
    });

    const first = retrieveRecordingMemoriesForPrompt({
      userMessage: "continue recording memory import design",
      cwd,
      homeDir: homeA,
      sessionSeenIds: new Set(),
    });
    const text = formatRecordingMemoryInjection(first.matches);
    expect(text).toContain("TeamAgent Recording Memory");
    expect(text).toContain("file:///recordings/import-decision.mp3");
    expect(text).not.toContain("Full transcript says");

    const second = retrieveRecordingMemoriesForPrompt({
      userMessage: "continue recording memory import design",
      cwd,
      homeDir: homeA,
      sessionSeenIds: new Set(first.injectedIds),
    });
    expect(second.matches).toHaveLength(0);
  });

  it("writes golden benchmark evidence", async () => {
    const { cwd, homeA } = workspace();
    const reportPath = path.join(tmpDir!, "golden.json");
    const result = JSON.parse(
      await executeRecordingCommand(
        ["benchmark", "--json", `--report=${reportPath}`],
        { cwd, homeDir: homeA },
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.passCount).toBeGreaterThanOrEqual(8);
    expect(fs.readFileSync(reportPath, "utf-8")).toContain("Recording Memory Golden Prompt Benchmark");
  });
});
