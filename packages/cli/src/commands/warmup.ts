import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { duckifyText } from "@teamagent/core";
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
  /**
   * Issue #160: detect whether @xenova/transformers + onnxruntime-node are
   * installed alongside teamagent. Returning false triggers a graceful skip
   * (ok=true skipped=true) instead of an exit=1 failure. Tests inject a fake
   * to exercise the skip path without filesystem mocking.
   */
  haveVectorOptionals?: () => boolean;
}

export interface WarmupResult {
  ok: boolean;
  durationMs: number;
  error?: string;
  /**
   * Issue #160: true when warmup short-circuited because the optional vector
   * deps (@xenova/transformers + onnxruntime-node) were not installed. Distinct
   * from `ok=false` (genuine runtime failure); skipped runs return `ok=true`.
   */
  skipped?: boolean;
  /** Identifier explaining why the run was skipped (when skipped=true). */
  reason?: "optional-deps-missing";
}

/**
 * Default detector for the optional vector deps. Mirrors the AND check in
 * packages/cli/src/commands/init.ts:haveVectorOptionals and
 * packages/teamagent/postinstall.mjs:vectorOptionalsInstalled. Both
 * @xenova/transformers AND onnxruntime-node must be resolvable; partial
 * installs (only one present) still need the skip path because the runtime
 * fails on missing native bindings.
 */
function defaultHaveVectorOptionals(): boolean {
  // Strategy 1: bounded fs walk peer to teamagent (npm hoist) or under
  // teamagent/node_modules (local install).
  try {
    const here = fileURLToPath(import.meta.url);
    let dir = path.dirname(here);
    for (let i = 0; i < 8; i++) {
      const hasXenova =
        fs.existsSync(path.join(dir, "node_modules", "@xenova", "transformers", "package.json")) ||
        fs.existsSync(path.join(dir, "..", "@xenova", "transformers", "package.json"));
      const hasOnnx =
        fs.existsSync(path.join(dir, "node_modules", "onnxruntime-node", "package.json")) ||
        fs.existsSync(path.join(dir, "..", "onnxruntime-node", "package.json"));
      if (hasXenova && hasOnnx) return true;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    // Strategy 2: pnpm CAS layout — let Node's resolver follow symlinks. Constrain
    // to known global roots so we don't false-positive on the user's unrelated
    // nvm/system @xenova install.
    try {
      const req = createRequire(here);
      const home = os.homedir();
      // Walk up from `here` to the nearest enclosing package.json so the first
      // knownRoot points at the actual install (npm hoisted, pnpm symlinked,
      // custom `npm config set prefix /opt/...`, Volta, etc.) instead of
      // `dist/commands` which can never contain @xenova. Mirrors the
      // Wave-9 P3 fix in init.ts:299-308.
      const pkgRoot = (() => {
        let cur = path.dirname(here);
        for (let i = 0; i < 16; i++) {
          if (fs.existsSync(path.join(cur, "package.json"))) return cur;
          const parent = path.dirname(cur);
          if (parent === cur) return path.dirname(here);
          cur = parent;
        }
        return path.dirname(here);
      })();
      const knownRoots = [
        pkgRoot,
        path.join(home, ".local", "share", "pnpm"),
        path.join(home, ".npm-global"),
        path.join(home, ".pnpm-global"),
      ];
      const isUnderKnownRoot = (resolved: string) =>
        knownRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root);
      let rxResolved: string | undefined;
      try { rxResolved = req.resolve("@xenova/transformers/package.json"); } catch { /* not found */ }
      let onnxResolved: string | undefined;
      try { onnxResolved = req.resolve("onnxruntime-node/package.json"); } catch { /* not found */ }
      if (rxResolved && onnxResolved && isUnderKnownRoot(rxResolved) && isUnderKnownRoot(onnxResolved)) {
        return true;
      }
    } catch {
      // best-effort
    }
    return false;
  } catch {
    return false;
  }
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
  const stderr = opts.stderr ?? ((m) => process.stderr.write(duckifyText(m)));
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

  // --- Issue #160: graceful skip when optional vector deps are absent ---
  // Only check when the caller is using the real embedder path (no injection).
  // With a mock embedder (tests), the optional deps don't matter — we trust the
  // injected behavior. Returning ok=true here lets `teamagent warmup` exit 0
  // and lets postinstall log `status=skipped` instead of `exit=1`.
  if (!opts.embedder) {
    const haveOptionals = (opts.haveVectorOptionals ?? defaultHaveVectorOptionals)();
    if (!haveOptionals) {
      // Don't trample a live detached warmup: if init/postinstall just spawned
      // a real download child and we're a manual `teamagent warmup` racing it,
      // overwriting state="downloading" with state="skipped" would briefly tell
      // bin-pre-tool-use to fall back to legacy until the real child finishes.
      // Read existing state; if a live writer is in flight, leave it alone.
      let liveDownloadPid: number | null = null;
      if (opts.stateFilePath) {
        try {
          const { readWarmupState, isPidAlive } = await import("../warmup-state.js");
          const existing = readWarmupState(opts.stateFilePath);
          if (existing && existing.status === "downloading" && isPidAlive(existing.pid)) {
            liveDownloadPid = existing.pid;
          }
        } catch {
          // best-effort
        }
      }
      stderr(
        "ℹ️  TeamAgent: 跳过向量模型预热 (vector matcher 未启用; @xenova/transformers + onnxruntime-node 未安装)\n",
      );
      stderr(
        "   启用方式: 重装时设 TEAMAGENT_INCLUDE_OPTIONAL=1，或 npm install -g @xenova/transformers@^2.17.0 onnxruntime-node@1.14.0\n",
      );
      if (liveDownloadPid === null) {
        // pid=0 (placeholder convention) instead of process.pid: the writing
        // process has already exited by the time anyone reads it, and older
        // teamagent readers (pre-PR-213) that don't recognize "skipped" fall
        // through to the "downloading" branch — pid=0 is treated as alive
        // (per writeInitialPlaceholder), so they see a soft "downloading"
        // rather than a hard `stale_downloading` FAIL.
        tryWriteState({
          status: "skipped",
          started_at: startedAtIso,
          completed_at: new Date().toISOString(),
          pid: 0,
          model: stateModel,
        });
      } else {
        stderr(
          `   (注意: 检测到正在后台预热 (pid=${liveDownloadPid})，本次跳过不覆盖该状态)\n`,
        );
      }
      return {
        ok: true,
        durationMs: Date.now() - start,
        skipped: true,
        reason: "optional-deps-missing",
      };
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
