export interface WarmupEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface WarmupOptions {
  embedder?: WarmupEmbedder;
  /** stderr writer; tests inject silent sink */
  stderr?: (msg: string) => void;
}

export interface WarmupResult {
  ok: boolean;
  durationMs: number;
  error?: string;
}

export async function runWarmup(opts: WarmupOptions = {}): Promise<WarmupResult> {
  const stderr = opts.stderr ?? ((m) => process.stderr.write(m));
  let embedder = opts.embedder;
  if (!embedder) {
    const { XenovaRuleEmbedder } = await import("@teamagent/adapters");
    embedder = new XenovaRuleEmbedder();
  }
  const start = Date.now();
  stderr("⏳ TeamAgent: 预热向量模型 multilingual-e5-small (~120MB)...\n");
  try {
    await embedder.embed(["warmup"]);
    const durationMs = Date.now() - start;
    stderr(`✅ TeamAgent: 模型预热完成 (${durationMs}ms)\n`);
    return { ok: true, durationMs };
  } catch (e) {
    const error = (e as Error).message ?? String(e);
    stderr(`⚠️  TeamAgent: 模型预热失败 (${error})\n`);
    stderr("   不影响安装；首次使用时仍会按需下载。\n");
    return { ok: false, durationMs: Date.now() - start, error };
  }
}
