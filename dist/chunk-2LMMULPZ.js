import {
  NODE_SQLITE_FLAGS
} from "./chunk-DC7TE56Y.js";
import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/lib/node-sqlite-probe.ts
init_esm_shims();
import { spawnSync } from "child_process";
var PROBE_SCRIPT = "process.stdout.write(process.version);const s = require('node:sqlite');if (!s || typeof s.DatabaseSync !== 'function') process.exit(3);";
function probeNodeSqlite(nodeBin = "node") {
  let r;
  try {
    r = spawnSync(
      nodeBin,
      [...NODE_SQLITE_FLAGS, "-e", PROBE_SCRIPT],
      { encoding: "utf-8", windowsHide: true, timeout: 1e4 }
    );
  } catch (e) {
    return {
      ok: false,
      nodeVersion: "unknown",
      detail: `\u65E0\u6CD5 spawn \`${nodeBin}\` \u63A2\u6D4B node:sqlite: ${e instanceof Error ? e.message : String(e)}`
    };
  }
  const spawnedVersion = (r.stdout ?? "").trim() || "unknown";
  if (r.error) {
    return {
      ok: false,
      nodeVersion: spawnedVersion,
      detail: `\u65E0\u6CD5 spawn \`${nodeBin}\` \u63A2\u6D4B node:sqlite: ${r.error.message}`
    };
  }
  if (r.status === 0) {
    return {
      ok: true,
      nodeVersion: spawnedVersion,
      detail: `${spawnedVersion} (PATH \`${nodeBin}\`) \u2014 hook \u5B50\u8FDB\u7A0B\u53EF\u52A0\u8F7D node:sqlite`
    };
  }
  const firstStderrLine = (r.stderr ?? "").trim().split("\n")[0] ?? "";
  return {
    ok: false,
    nodeVersion: spawnedVersion,
    detail: `${spawnedVersion} (PATH \`${nodeBin}\`) \u2014 hook \u5B50\u8FDB\u7A0B\u65E0\u6CD5\u52A0\u8F7D node:sqlite (${firstStderrLine || `exit ${r.status ?? "null"}`})`
  };
}

export {
  probeNodeSqlite
};
