import fs from "node:fs";
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
    // Issue #315 — env-gated ctor tracker.
    //
    // When TEAMAGENT_XENOVA_TRACKER is set to a file path, append one line
    // per construction. Used by judge harness to assert that hook-side code
    // never instantiates this class in-process (the bug #315 fixes: only
    // bin-embedder.cjs daemon should construct one XenovaRuleEmbedder per
    // machine). In production the env is unset → cheap branch + zero IO.
    //
    // FAIL_FAST=1 lets the harness terminate the entire fan-out (10 parallel
    // hook child processes) the moment ANY second loader appears, so the
    // test machine itself is not OOM-spiked by the bug being verified.
    const trackerPath = process.env["TEAMAGENT_XENOVA_TRACKER"];
    if (trackerPath) {
      try {
        const line = `${Date.now()} pid=${process.pid} argv=${process.argv.slice(0, 2).join(" ")}\n`;
        fs.appendFileSync(trackerPath, line);
        if (process.env["TEAMAGENT_XENOVA_TRACKER_FAIL_FAST"] === "1") {
          const lines = fs
            .readFileSync(trackerPath, "utf-8")
            .split("\n")
            .filter((l) => l.length > 0).length;
          if (lines > 1) {
            // Hard exit — bypasses normal Node finalizers. Harness reads the
            // tracker file post-mortem to count loaders; even one extra
            // beyond the daemon is a regression.
            process.exit(2);
          }
        }
      } catch {
        /* best-effort: never let tracker IO break the ctor */
      }
    }

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
    // Issue #189 follow-up (review finding): a transient network failure
    // during loadModel must not poison the singleton. If loadPromise is
    // cached as rejected, every subsequent embed() in the process re-throws
    // forever (bin-stop._stopEmbedder is module-scoped). Clear the cached
    // promise on rejection so the next caller can retry.
    this.loadPromise = this.loadModel().catch((err) => {
      this.loadPromise = null;
      throw err;
    });
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
    // Issue #189: @xenova/transformers internally calls Node's built-in
    // fetch() with no AbortSignal when downloading model weights from
    // huggingface.co. If the upstream is slow / blocked / rate-limited,
    // fetch hangs forever inside an undici worker thread; SIGTERM cannot
    // interrupt the worker; the event loop never drains; the hook process
    // refuses to exit. Repeated Stop events accumulate orphan node
    // processes (observed: 71 concurrent, 5+ GB RAM, OOM on 8 GB Macs).
    // Wrap globalThis.fetch with AbortSignal so each fetch can be aborted
    // when the timeout fires; an aborted fetch releases its socket and
    // the loop drains. Restore the original fetch on either path so we
    // don't affect unrelated runtime fetches.
    //
    // Default 90s — multilingual-e5-small ONNX is ~115MB; 15s would abort
    // legitimate first-time downloads on residential / mobile networks.
    // Override via env for slow networks (warmup CLI uses 600s). Use
    // `unref()` so the timer doesn't keep the event loop alive after
    // fetch resolves.
    const fetchTimeoutMs = ((): number => {
      const v = parseInt(
        process.env["TEAMAGENT_EMBEDDER_FETCH_TIMEOUT_MS"] ?? "",
        10,
      );
      return Number.isFinite(v) && v > 0 ? v : 90_000;
    })();
    const origFetch = globalThis.fetch;
    if (typeof origFetch === "function") {
      const wrappedFetch: typeof globalThis.fetch = (input, init) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
        // Don't keep the event loop alive after fetch resolves.
        if (typeof timer === "object" && timer !== null && "unref" in timer) {
          (timer as { unref: () => void }).unref();
        }
        // Compose: if the caller already passed a signal, both their
        // signal AND our timeout signal can fire — whichever first wins.
        // AbortSignal.any is in Node ≥20.3 (project requires 22.5+, OK).
        // This preserves the caller's intent (e.g. user cancellation)
        // while keeping our deadline as a backstop. If AbortSignal.any
        // is unavailable for any reason, fall back to our signal alone.
        let signal: AbortSignal = controller.signal;
        if (init?.signal) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const any = (AbortSignal as any).any;
          if (typeof any === "function") {
            signal = any.call(AbortSignal, [init.signal, controller.signal]);
          }
        }
        return origFetch(input, { ...(init ?? {}), signal })
          .finally(() => clearTimeout(timer));
      };
      globalThis.fetch = wrappedFetch;
    }
    try {
      this.pipeline = (await pipeline(
        "feature-extraction",
        this.modelId,
        pipelineOpts,
      )) as unknown as XenovaPipeline;
    } finally {
      // Only restore if we still own the slot. If a concurrent loadModel
      // call from a sibling instance also wrapped fetch and finishes after
      // us, restoring blindly would re-install its wrapper as the "real"
      // fetch. Best-effort identity check.
      if (typeof origFetch === "function" && globalThis.fetch !== origFetch) {
        globalThis.fetch = origFetch;
      }
    }
    console.error(`Rule embedder ready (${this.modelId}, dim=${this.dim}).`);
  }
}
