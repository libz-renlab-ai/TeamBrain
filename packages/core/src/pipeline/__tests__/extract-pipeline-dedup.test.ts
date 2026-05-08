import { describe, it, expect } from "vitest";
import {
  runExtractPipeline,
  momentSignature,
  type ExtractPipelineDeps,
} from "../extract-pipeline.js";
import type {
  KnowledgeExtractor,
  KnowledgeStore,
} from "@teamagent/ports";
import type {
  CorrectionDetector,
  CorrectionMoment,
} from "../../correction-detector/rule-based.js";
import type {
  KnowledgeEntry,
  ParsedSession,
  Scope,
} from "@teamagent/types";

function makeSession(): ParsedSession {
  return {
    sessionId: "s1",
    startTime: "2026-04-14T00:00:00Z",
    endTime: "2026-04-14T01:00:00Z",
    turns: [],
  };
}

function makeMoment(overrides: Partial<CorrectionMoment> = {}): CorrectionMoment {
  return {
    signal: "explicit_denial",
    weight: 0.95,
    turnIndex: 3,
    correctionText: "不用 axios，用 fetch",
    previousAssistantText: "用 axios 发请求吧",
    previousToolCalls: [],
    timestamp: "2026-04-14T00:00:00Z",
    ...overrides,
  };
}

class StubDetector implements CorrectionDetector {
  constructor(public moments: CorrectionMoment[]) {}
  detect(): CorrectionMoment[] { return this.moments; }
}

class CountingExtractor implements KnowledgeExtractor {
  calls = 0;
  constructor(
    public result: Partial<KnowledgeEntry> | null | { throw: string } = {
      category: "E",
      tags: [],
      type: "avoidance",
      nature: "subjective",
      trigger: "t",
      wrong_pattern: "wp",
      correct_pattern: "cp",
      reasoning: "r",
    },
  ) {}
  async extract(): Promise<Partial<KnowledgeEntry> | null> {
    this.calls++;
    if (this.result && typeof this.result === "object" && "throw" in this.result) {
      throw new Error(this.result.throw);
    }
    return this.result as Partial<KnowledgeEntry> | null;
  }
}

class InMemoryStore implements KnowledgeStore {
  entries: KnowledgeEntry[] = [];
  getAll() { return [...this.entries]; }
  getActive() { return this.entries.filter((e) => e.status === "active"); }
  getById(id: string) { return this.entries.find((e) => e.id === id); }
  query() { return this.getActive(); }
  add(e: KnowledgeEntry) { this.entries.push(e); }
  update(id: string, p: Partial<KnowledgeEntry>) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) throw new Error("not found");
    this.entries[i] = { ...this.entries[i]!, ...p };
  }
  delete(id: string) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }
  count() { return this.entries.length; }
}

const SCOPE: Scope = { level: "personal" };

function makeDeps(overrides: Partial<ExtractPipelineDeps> = {}): ExtractPipelineDeps {
  let c = 0;
  return {
    detector: new StubDetector([]),
    extractor: new CountingExtractor(),
    callLLM: async () => "",
    store: new InMemoryStore(),
    scope: SCOPE,
    now: () => new Date("2026-04-14T12:00:00Z"),
    idGen: () => `id-${++c}`,
    ...overrides,
  };
}

describe("momentSignature", () => {
  it("is deterministic for identical moments", () => {
    const a = momentSignature(makeMoment());
    const b = momentSignature(makeMoment());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when turnIndex changes", () => {
    const a = momentSignature(makeMoment({ turnIndex: 3 }));
    const b = momentSignature(makeMoment({ turnIndex: 4 }));
    expect(a).not.toBe(b);
  });

  it("changes when correctionText changes", () => {
    const a = momentSignature(makeMoment({ correctionText: "x" }));
    const b = momentSignature(makeMoment({ correctionText: "y" }));
    expect(a).not.toBe(b);
  });

  it("changes when signal changes", () => {
    const a = momentSignature(makeMoment({ signal: "explicit_denial" }));
    const b = momentSignature(makeMoment({ signal: "multi_failure" }));
    expect(a).not.toBe(b);
  });

  it("ignores content beyond first 200 chars of correctionText", () => {
    const base = "x".repeat(200);
    const a = momentSignature(makeMoment({ correctionText: base + "A" }));
    const b = momentSignature(makeMoment({ correctionText: base + "B" }));
    expect(a).toBe(b);
  });
});

describe("runExtractPipeline dedup", () => {
  it("skips LLM when isMomentSeen returns true and increments deduped", async () => {
    const extractor = new CountingExtractor();
    const moments = [makeMoment({ turnIndex: 1 }), makeMoment({ turnIndex: 2 })];
    const seen = new Set<string>([momentSignature(moments[0]!)]);
    const deps = makeDeps({
      detector: new StubDetector(moments),
      extractor,
      isMomentSeen: (sig) => seen.has(sig),
    });
    const result = await runExtractPipeline(makeSession(), deps);
    expect(extractor.calls).toBe(1);
    expect(result.deduped).toBe(1);
    expect(result.extracted.length).toBe(1);
  });

  it("calls markMomentSeen on successful extraction", async () => {
    const marked: string[] = [];
    const m = makeMoment({ turnIndex: 5 });
    const deps = makeDeps({
      detector: new StubDetector([m]),
      extractor: new CountingExtractor(),
      markMomentSeen: (sig) => marked.push(sig),
    });
    await runExtractPipeline(makeSession(), deps);
    expect(marked).toEqual([momentSignature(m)]);
  });

  it("calls markMomentSeen when extractor returns null (skip)", async () => {
    const marked: string[] = [];
    const m = makeMoment();
    const deps = makeDeps({
      detector: new StubDetector([m]),
      extractor: new CountingExtractor(null),
      markMomentSeen: (sig) => marked.push(sig),
    });
    await runExtractPipeline(makeSession(), deps);
    expect(marked).toEqual([momentSignature(m)]);
  });

  it("does NOT call markMomentSeen when extractor throws (failure retries next run)", async () => {
    const marked: string[] = [];
    const m = makeMoment();
    const deps = makeDeps({
      detector: new StubDetector([m]),
      extractor: new CountingExtractor({ throw: "boom" }),
      markMomentSeen: (sig) => marked.push(sig),
    });
    const result = await runExtractPipeline(makeSession(), deps);
    expect(result.failed).toBe(1);
    expect(marked).toEqual([]);
  });

  it("result.deduped is 0 when no dedup hooks provided", async () => {
    const deps = makeDeps({
      detector: new StubDetector([makeMoment()]),
      extractor: new CountingExtractor(),
    });
    const result = await runExtractPipeline(makeSession(), deps);
    expect(result.deduped).toBe(0);
  });
});
