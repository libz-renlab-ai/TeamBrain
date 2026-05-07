import type { RuleEmbedder } from "@teamagent/ports";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XenovaPipeline = (
  texts: string | string[],
  opts?: Record<string, unknown>,
) => Promise<{ tolist(): number[][] }>;

/**
 * Progress event shape from @xenova/transformers `progress_callback`.
 * Source: node_modules/@xenova/transformers/src/utils/hub.js dispatchCallback sites.
 *
 * Status lifecycle per file: `initiate` → `download` → multiple `progress` → `done`
 * Plus `ready` once after all files finish.
 */
export interface XenovaProgressEvent {
  status: "initiate" | "download" | "progress" | "done" | "ready";
  /** Repo / model name (e.g. `Xenova/multilingual-e5-small`) */
  name?: string;
  /** Specific file (`onnx/model_quantized.onnx`, `tokenizer.json`, ...) */
  file?: string;
  /** Bytes downloaded so far (only on `progress`) */
  loaded?: number;
  /** Total bytes for this file (only on `progress`) */
  total?: number;
  /** Percentage 0–100 (only on `progress`) */
  progress?: number;
}

const DEFAULT_MODEL = "Xenova/multilingual-e5-small";
const DEFAULT_DIM = 384;

/**
 * RuleEmbedder implementation backed by @xenova/transformers.
 * Uses multilingual-e5-small (384-dim) for multilingual rule matching.
 *
 * Pass `progressCallback` to receive download progress events on first model
 * load — used by the warmup CLI to render a TTY progress bar.
 */
export class XenovaRuleEmbedder implements RuleEmbedder {
  readonly modelId: string;
  readonly dim: number;

  private pipeline: XenovaPipeline | null = null;
  private loadPromise: Promise<void> | null = null;
  private progressCallback?: (e: XenovaProgressEvent) => void;

  constructor(
    opts: {
      modelId?: string;
      dim?: number;
      progressCallback?: (e: XenovaProgressEvent) => void;
    } = {},
  ) {
    this.modelId = opts.modelId ?? DEFAULT_MODEL;
    this.dim = opts.dim ?? DEFAULT_DIM;
    this.progressCallback = opts.progressCallback;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensureLoaded();
    // multilingual-e5 requires "query: " or "passage: " prefix.
    // Both rules and queries are treated as passages.
    const prefixed = texts.map((t) => `passage: ${t}`);
    const output = await this.pipeline!(prefixed, {
      pooling: "mean",
      normalize: true,
    });
    return output.tolist();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.pipeline) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.loadModel();
    return this.loadPromise;
  }

  private async loadModel(): Promise<void> {
    const { pipeline, env } = await import("@xenova/transformers");
    // Support HuggingFace mirror (e.g. for environments without direct HF access).
    const mirror =
      process.env["HF_ENDPOINT"] ?? process.env["TEAMAGENT_HF_ENDPOINT"];
    if (mirror) {
      env.remoteHost = mirror;
    }
    console.error(`Loading rule embedder: ${this.modelId}...`);
    const pipelineOpts: Record<string, unknown> = {};
    if (this.progressCallback) {
      pipelineOpts.progress_callback = this.progressCallback;
    }
    this.pipeline = (await pipeline(
      "feature-extraction",
      this.modelId,
      pipelineOpts,
    )) as unknown as XenovaPipeline;
    console.error(`Rule embedder ready (${this.modelId}, dim=${this.dim}).`);
  }
}
