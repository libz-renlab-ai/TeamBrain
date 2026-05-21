import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/warmup-state.ts
init_esm_shims();
import fs from "fs";
import path from "path";
import os from "os";
var WARMUP_STATE_FILENAME = ".warmup-state.json";
function defaultWarmupStatePath(homeDir = os.homedir()) {
  return path.join(homeDir, ".teamagent", WARMUP_STATE_FILENAME);
}
function writeWarmupState(filePath, state) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}
function readWarmupState(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.status !== "string" || typeof parsed.started_at !== "string" || typeof parsed.pid !== "number" || typeof parsed.model !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function isPidAlive(pid) {
  if (pid === 0) return true;
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = err.code;
    if (code === "EPERM") return true;
    return false;
  }
}
function describeWarmupReadiness(filePath) {
  const raw = (() => {
    try {
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
    } catch {
      return null;
    }
  })();
  if (raw === null) {
    return { ready: false, reason: "missing", state: null };
  }
  const state = readWarmupState(filePath);
  if (!state) {
    return { ready: false, reason: "malformed", state: null };
  }
  if (state.status === "ready") {
    return { ready: true, reason: "ready", state };
  }
  if (state.status === "failed") {
    return { ready: false, reason: "failed", state };
  }
  if (state.status === "skipped") {
    return { ready: false, reason: "skipped", state };
  }
  if (!isPidAlive(state.pid)) {
    return { ready: false, reason: "stale_downloading", state };
  }
  return { ready: false, reason: "downloading", state };
}
function writeInitialPlaceholder(filePath, model) {
  writeWarmupState(filePath, {
    status: "downloading",
    started_at: (/* @__PURE__ */ new Date()).toISOString(),
    pid: 0,
    model
  });
}

export {
  WARMUP_STATE_FILENAME,
  defaultWarmupStatePath,
  writeWarmupState,
  readWarmupState,
  isPidAlive,
  describeWarmupReadiness,
  writeInitialPlaceholder
};
