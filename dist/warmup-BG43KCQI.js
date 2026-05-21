import {
  writeWarmupState
} from "./chunk-ZIUCUPFV.js";
import {
  duckifyText
} from "./chunk-4Y7LCJVR.js";
import "./chunk-4RSUQUKR.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/warmup.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { createRequire } from "module";
function defaultHaveVectorOptionals() {
  try {
    const here = fileURLToPath(import.meta.url);
    let dir = path.dirname(here);
    for (let i = 0; i < 8; i++) {
      const hasXenova = fs.existsSync(path.join(dir, "node_modules", "@xenova", "transformers", "package.json")) || fs.existsSync(path.join(dir, "..", "@xenova", "transformers", "package.json"));
      const hasOnnx = fs.existsSync(path.join(dir, "node_modules", "onnxruntime-node", "package.json")) || fs.existsSync(path.join(dir, "..", "onnxruntime-node", "package.json"));
      if (hasXenova && hasOnnx) return true;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    try {
      const req = createRequire(here);
      const home = os.homedir();
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
        path.join(home, ".pnpm-global")
      ];
      const isUnderKnownRoot = (resolved) => knownRoots.some((root) => resolved.startsWith(root + path.sep) || resolved === root);
      let rxResolved;
      try {
        rxResolved = req.resolve("@xenova/transformers/package.json");
      } catch {
      }
      let onnxResolved;
      try {
        onnxResolved = req.resolve("onnxruntime-node/package.json");
      } catch {
      }
      if (rxResolved && onnxResolved && isUnderKnownRoot(rxResolved) && isUnderKnownRoot(onnxResolved)) {
        return true;
      }
    } catch {
    }
    return false;
  } catch {
    return false;
  }
}
function makeProgressRenderer(stderr, mode) {
  if (mode === "off") return () => {
  };
  const files = /* @__PURE__ */ new Map();
  let lastRender = 0;
  const RENDER_THROTTLE_MS = 200;
  const fmtMb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  function aggregate() {
    let loaded = 0;
    let total = 0;
    let done = 0;
    let count = 0;
    for (const fs2 of files.values()) {
      loaded += fs2.loaded;
      total += fs2.total;
      if (fs2.done) done++;
      count++;
    }
    const pct = total > 0 ? Math.min(100, Math.floor(loaded / total * 100)) : 0;
    return { loaded, total, done, count, pct };
  }
  function renderTty(force = false) {
    const now = Date.now();
    if (!force && now - lastRender < RENDER_THROTTLE_MS) return;
    lastRender = now;
    const { loaded, total, done, count, pct } = aggregate();
    const filled = Math.floor(pct / 5);
    const bar = "\u2593".repeat(filled) + "\u2591".repeat(20 - filled);
    stderr(
      `\r\u23F3 \u4E0B\u8F7D\u5411\u91CF\u6A21\u578B ${bar} ${fmtMb(loaded)}/${fmtMb(total)} MB (${pct}%) [${done}/${count} files]`
    );
  }
  function renderLog(file) {
    const { loaded, total, done, count } = aggregate();
    stderr(
      `   \u2713 ${file} (${fmtMb(loaded)}/${fmtMb(total)} MB \xB7 ${done}/${count} files)
`
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
async function runWarmup(opts = {}) {
  const stderr = opts.stderr ?? ((m) => process.stderr.write(duckifyText(m)));
  const start = Date.now();
  let mode;
  if (opts.forceProgressMode) {
    mode = opts.forceProgressMode;
  } else if (opts.embedder) {
    mode = "off";
  } else {
    mode = process.stderr.isTTY ? "tty" : "log";
  }
  const startedAtIso = new Date(start).toISOString();
  const stateModel = opts.stateModel ?? "Xenova/multilingual-e5-small";
  const aggregated = { loaded_bytes: 0, total_bytes: 0, files_done: 0, files_total: 0 };
  let lastStateWrite = 0;
  const STATE_WRITE_THROTTLE_MS = 500;
  function tryWriteState(state) {
    if (!opts.stateFilePath) return;
    try {
      writeWarmupState(opts.stateFilePath, state);
    } catch {
    }
  }
  if (!opts.embedder) {
    const haveOptionals = (opts.haveVectorOptionals ?? defaultHaveVectorOptionals)();
    if (!haveOptionals) {
      let liveDownloadPid = null;
      if (opts.stateFilePath) {
        try {
          const { readWarmupState, isPidAlive } = await import("./warmup-state-4E7RVQWL.js");
          const existing = readWarmupState(opts.stateFilePath);
          if (existing && existing.status === "downloading" && isPidAlive(existing.pid)) {
            liveDownloadPid = existing.pid;
          }
        } catch {
        }
      }
      stderr(
        "\u2139\uFE0F  TeamAgent: \u8DF3\u8FC7\u5411\u91CF\u6A21\u578B\u9884\u70ED (@xenova/transformers + onnxruntime-node \u672A\u5728 node_modules \u4E2D\u627E\u5230)\n"
      );
      stderr(
        "   issue #164 / PR #227 \u8D77\u5411\u91CF\u5305\u5DF2\u9ED8\u8BA4\u8FDB dependencies\uFF1B\u5982\u679C\u672A\u627E\u5230\u8BF4\u660E\u672C\u6B21\u5B89\u88C5\u4E0D\u5B8C\u6574\u3002\u91CD\u88C5\u5373\u53EF\u6062\u590D\uFF1Anpm install -g teamagent\n"
      );
      if (liveDownloadPid === null) {
        tryWriteState({
          status: "skipped",
          started_at: startedAtIso,
          completed_at: (/* @__PURE__ */ new Date()).toISOString(),
          pid: 0,
          model: stateModel
        });
      } else {
        stderr(
          `   (\u6CE8\u610F: \u68C0\u6D4B\u5230\u6B63\u5728\u540E\u53F0\u9884\u70ED (pid=${liveDownloadPid})\uFF0C\u672C\u6B21\u8DF3\u8FC7\u4E0D\u8986\u76D6\u8BE5\u72B6\u6001)
`
        );
      }
      return {
        ok: true,
        durationMs: Date.now() - start,
        skipped: true,
        reason: "optional-deps-missing"
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
      progress: { ...aggregated }
    });
  }
  if (opts.stateFilePath) {
    tryWriteState({
      status: "downloading",
      started_at: startedAtIso,
      pid: process.pid,
      model: stateModel
    });
  }
  let embedder = opts.embedder;
  if (!embedder) {
    const { XenovaRuleEmbedder } = await import("./src-F33CQC7S.js");
    const renderer = makeProgressRenderer(stderr, mode);
    const onProgress = (e) => {
      if (e.file) {
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
  stderr("\u23F3 TeamAgent: \u9884\u70ED\u5411\u91CF\u6A21\u578B multilingual-e5-small (~120MB)...\n");
  try {
    await embedder.embed(["warmup"]);
    const durationMs = Date.now() - start;
    if (mode === "tty") stderr("\n");
    stderr(`\u2705 TeamAgent: \u6A21\u578B\u9884\u70ED\u5B8C\u6210 (${durationMs}ms)
`);
    tryWriteState({
      status: "ready",
      started_at: startedAtIso,
      completed_at: (/* @__PURE__ */ new Date()).toISOString(),
      pid: process.pid,
      model: stateModel,
      progress: { ...aggregated }
    });
    return { ok: true, durationMs };
  } catch (e) {
    if (mode === "tty") stderr("\n");
    const error = e.message ?? String(e);
    stderr(`\u26A0\uFE0F  TeamAgent: \u6A21\u578B\u9884\u70ED\u5931\u8D25 (${error})
`);
    stderr("   \u4E0D\u5F71\u54CD\u5B89\u88C5\uFF1B\u9996\u6B21\u4F7F\u7528\u65F6\u4ECD\u4F1A\u6309\u9700\u4E0B\u8F7D\u3002\n");
    tryWriteState({
      status: "failed",
      started_at: startedAtIso,
      completed_at: (/* @__PURE__ */ new Date()).toISOString(),
      pid: process.pid,
      model: stateModel,
      error
    });
    return { ok: false, durationMs: Date.now() - start, error };
  }
}
export {
  runWarmup
};
