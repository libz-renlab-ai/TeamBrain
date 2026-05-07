import {
  writeWarmupState,
  type WarmupState,
} from "../warmup-state.js";

export interface WarmupEmbedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface WarmupOptions {
  embedder?: WarmupEmbedder;
  /** stderr writer; tests inject silent sink */
  stderr?: (msg: string) => void;
  /** force render mode (overrides TTY detection) — testing aid */
  forceProgressMode?: "tty" | "log" | "off";
  /**
   * Issue #91: when set, every meaningful progress update plus the final
   * outcome is persisted to this JSON path so other processes can read it.
   */
  stateFilePath?: string;
  /** Override the model name written to the state file (default e5-small). */
  stateModel?: string;
}

export interface WarmupResult {
  ok: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Aggregate per-file download progress and render a single-line bar to stderr.
 *
 * Render modes:
 * - "tty" (default when stderr.isTTY): \r-rewrites a single line, ~5fps throttle
 * - "log" (non-TTY, e.g. CI logs): emits a new line per file `done` event only
 * - "off" (tests): no rendering
 */
function makeProgressRenderer(
  stderr: (msg: string) => void,
  mode: "tty" | "log" | "off",
): (e: import("@teamagent/adapters").XenovaProgressEvent) => void {
  if (mode === "off") return () => {};

  type FileState = { loaded: number; total: number; done: boolean };
  const files = new Map<string, FileState>();
  let lastRender = 0;
  const RENDER_THROTTLE_MS = 200;

  const fmtMb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

  function aggregate() {
    let loaded = 0;
    let total = 0;
    let done = 0;
    let count = 0;
    for (const fs of files.values()) {
      loaded += fs.loaded;
      total += fs.total;
      if (fs.done) done++;
      count++;
    }
    const pct = total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0;
    return { loaded, total, done, count, pct };
  }

  function renderTty(force = false) {
    const now = Date.now();
    if (!force && now - lastRender < RENDER_THROTTLE_MS) return;
    lastRender = now;
    const { loaded, total, done, count, pct } = aggregate();
    const filled = Math.floor(pct / 5);
    const bar = "▓".repeat(filled) + "░".repeat(20 - filled);
    stderr(
      `\r⏳ 下载向量模型 ${bar} ${fmtMb(loaded)}/${fmtMb(total)} MB (${pct}%) [${done}/${count} files]`,
    );
  }

  function renderLog(file: string) {
    const { loaded, total, done, count } = aggregate();
    stderr(
      `   ✓ ${file} (${fmtMb(loaded)}/${fmtMb(total)} MB · ${done}/${count} files)\n`,
    );
  }

  return (e) => {
    if (!e.file) return;
    let st = files.get(e.file);
    if (!st) {
      st = { loaded: 0, total: 0, done: false };
      files.set(e.file, st);
    }
    if (e.status === "progress") {
      st.loaded = e.loaded ?? st.loaded;
      st.total = e.total ?? st.total;
      if (mode === "tty") renderTty();
    } else if (e.status === "done") {
      st.done = true;
      if (st.total > 0) st.loaded = st.total;
      if (mode === "tty") renderTty(true);
      else if (mode === "log") renderLog(e.file);
    }
  };
}

export async function runWarmup(opts: WarmupOptions = {}): Promise<WarmupResult> {
  const stderr = opts.stderr ?? ((m) => process.stderr.write(m));
  const start = Date.now();

  // Decide render mode.
  // - Tests pass in opts.embedder → callback never fires, mode irrelevant; "off" silences any.
  // - opts.forceProgressMode wins (test override).
  // - Real run: TTY → "tty", else "log" (CI-friendly per-file lines).
  let mode: "tty" | "log" | "off";
  if (opts.forceProgressMode) {
    mode = opts.forceProgressMode;
  } else if (opts.embedder) {
    mode = "off";
  } else {
    mode = process.stderr.isTTY ? "tty" : "log";
  }

  // --- Issue #91: state-file plumbing ---
  // Aggregated progress for state writes; updated by the wrapped progress
  // callback below.
  const startedAtIso = new Date(start).toISOString();
  const stateModel = opts.stateModel ?? "Xenova/multilingual-e5-small";
  const aggregated = { loaded_bytes: 0, total_bytes: 0, files_done: 0, files_total: 0 };

  let lastStateWrite = 0;
  const STATE_WRITE_THROTTLE_MS = 500;

  function tryWriteState(state: WarmupState) {
    if (!opts.stateFilePath) return;
    try {
      writeWarmupState(opts.stateFilePath, state);
    } catch {
      // best-effort: never let state-file failure break warmup itself.
    }
  }

  function maybeWriteProgress(force = false) {
    if (!opts.stateFilePath) return;
    const now = Date.now();
    if (!force && now - lastStateWrite < STATE_WRITE_THROTTLE_MS) return;
    lastStateWrite = now;
    tryWriteState({
      status: "downloading",
      started_at: startedAtIso,
      pid: process.pid,
      model: stateModel,
      progress: { ...aggregated },
    });
  }

  // Initial state at process start so readers immediately see "downloading".
  if (opts.stateFilePath) {
    tryWriteState({
      status: "downloading",
      started_at: startedAtIso,
      pid: process.pid,
      model: stateModel,
    });
  }

  let embedder = opts.embedder;
  if (!embedder) {
    const { XenovaRuleEmbedder } = await import("@teamagent/adapters");
    const renderer = makeProgressRenderer(stderr, mode);
    const onProgress = (e: import("@teamagent/adapters").XenovaProgressEvent) => {
      // Update aggregated counters BEFORE the renderer (renderer also tracks
      // its own state but we cannot read into it; mirroring is cheap).
      if (e.file) {
        // We do not bother per-file storage here — the renderer aggregates
        // separately for stderr; for the state file we approximate via the
        // last-event totals. Good enough for a "downloading X%" UX.
        if (e.status === "progress") {
          aggregated.loaded_bytes = Math.max(aggregated.loaded_bytes, e.loaded ?? 0);
          aggregated.total_bytes = Math.max(aggregated.total_bytes, e.total ?? 0);
        } else if (e.status === "done") {
          aggregated.files_done += 1;
          if (e.total) aggregated.loaded_bytes = Math.max(aggregated.loaded_bytes, e.total);
        }
        aggregated.files_total = Math.max(aggregated.files_total, aggregated.files_done);
      }
      renderer(e);
      if (e.status === "progress" || e.status === "done") {
        maybeWriteProgress(e.status === "done");
      }
    };
    embedder = new XenovaRuleEmbedder({ progressCallback: onProgress });
  }

  stderr("⏳ TeamAgent: 预热向量模型 multilingual-e5-small (~120MB)...\n");
  try {
    await embedder.embed(["warmup"]);
    const durationMs = Date.now() - start;
    // 进度条最后一行用 \r 留在那；done 事件后换行 + ✅
    if (mode === "tty") stderr("\n");
    stderr(`✅ TeamAgent: 模型预热完成 (${durationMs}ms)\n`);
    tryWriteState({
      status: "ready",
      started_at: startedAtIso,
      completed_at: new Date().toISOString(),
      pid: process.pid,
      model: stateModel,
      progress: { ...aggregated },
    });
    return { ok: true, durationMs };
  } catch (e) {
    if (mode === "tty") stderr("\n");
    const error = (e as Error).message ?? String(e);
    stderr(`⚠️  TeamAgent: 模型预热失败 (${error})\n`);
    stderr("   不影响安装；首次使用时仍会按需下载。\n");
    tryWriteState({
      status: "failed",
      started_at: startedAtIso,
      completed_at: new Date().toISOString(),
      pid: process.pid,
      model: stateModel,
      error,
    });
    return { ok: false, durationMs: Date.now() - start, error };
  }
}
