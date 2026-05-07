import { describe, it, expect, vi, beforeEach } from "vitest";
import { ruleEmbedderContractSuite } from "@teamagent/ports/contracts";

const DIM = 384;
// Normalized vector: L2 norm = sqrt(DIM * v^2) = 1 => v = 1/sqrt(DIM)
const UNIT_COMPONENT = 1 / Math.sqrt(DIM);

// Mock @xenova/transformers before any imports that use it.
// The mock returns normalized vectors (L2 norm == 1) so the contract
// "normalized vectors" test passes, and all texts in a batch get the
// same vector (satisfies "batch and single give the same vector").
vi.mock("@xenova/transformers", () => ({
  pipeline: vi.fn().mockImplementation(() =>
    Promise.resolve(
      vi.fn().mockImplementation((texts: string | string[], _opts?: unknown) => {
        const inputTexts = Array.isArray(texts) ? texts : [texts];
        return Promise.resolve({
          tolist: () =>
            inputTexts.map(() => Array<number>(DIM).fill(UNIT_COMPONENT)),
        });
      }),
    ),
  ),
  env: {
    remoteHost: "https://huggingface.co/",
  },
}));

// Import after mock is set up
const { XenovaRuleEmbedder } = await import("../xenova-rule-embedder.js");

describe("XenovaRuleEmbedder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Run the shared RuleEmbedder contract suite
  ruleEmbedderContractSuite(() => new XenovaRuleEmbedder());

  it("embed([]) returns empty array", async () => {
    const e = new XenovaRuleEmbedder();
    expect(await e.embed([])).toEqual([]);
  });

  it("model is only loaded once (second embed does not re-load)", async () => {
    const { pipeline } = await import("@xenova/transformers");
    const e = new XenovaRuleEmbedder();
    await e.embed(["first"]);
    await e.embed(["second"]);
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it("uses multilingual-e5-small model by default", async () => {
    const { pipeline } = await import("@xenova/transformers");
    const e = new XenovaRuleEmbedder();
    await e.embed(["hello"]);
    expect(pipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/multilingual-e5-small",
      // pipelineOpts: empty object when no progressCallback
      {},
    );
  });

  it("forwards progressCallback to pipeline as progress_callback", async () => {
    const { pipeline } = await import("@xenova/transformers");
    const cb = vi.fn();
    const e = new XenovaRuleEmbedder({ progressCallback: cb });
    await e.embed(["hello"]);
    expect(pipeline).toHaveBeenCalledWith(
      "feature-extraction",
      "Xenova/multilingual-e5-small",
      { progress_callback: cb },
    );
  });

  it("reports dim=384 and modelId", () => {
    const e = new XenovaRuleEmbedder();
    expect(e.dim).toBe(384);
    expect(e.modelId).toBe("Xenova/multilingual-e5-small");
  });
});
