import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/update/fetch-latest.ts
init_esm_shims();
import https from "https";
var DEFAULT_PAGES_URL = "https://libz-renlab-ai.github.io/TeamBrain/latest.json";
var DEFAULT_NPM_URL = "https://registry.npmjs.org/teamagent/latest";
async function attemptPages(get, url, ua) {
  let res;
  try {
    res = await get(url, {
      "User-Agent": ua,
      "Accept": "application/json"
    });
  } catch (e) {
    const msg = e.message;
    if (/timeout/i.test(msg)) {
      return { ok: false, reason: "pages_timeout", message: msg };
    }
    return { ok: false, reason: "pages_network", message: msg };
  }
  if (res.statusCode === 404) {
    return {
      ok: false,
      reason: "pages_404",
      message: `Pages latest.json not found at ${url}`
    };
  }
  if (res.statusCode >= 500 && res.statusCode <= 599) {
    return {
      ok: false,
      reason: "pages_5xx",
      message: `Pages server error ${res.statusCode}`
    };
  }
  if (res.statusCode !== 200) {
    return {
      ok: false,
      reason: "pages_5xx",
      message: `Pages unexpected status ${res.statusCode}`
    };
  }
  let payload;
  try {
    payload = JSON.parse(res.body);
  } catch {
    return {
      ok: false,
      reason: "pages_parse",
      message: "Pages latest.json malformed JSON"
    };
  }
  if (typeof payload.version !== "string" || payload.version.length === 0) {
    return {
      ok: false,
      reason: "pages_parse",
      message: "Pages latest.json missing version string"
    };
  }
  const sha = typeof payload.sha === "string" && payload.sha.length > 0 ? payload.sha : void 0;
  const pr_creator_login = typeof payload.pr_creator_login === "string" && payload.pr_creator_login.length > 0 ? payload.pr_creator_login : void 0;
  const pr_number = typeof payload.pr_number === "number" && Number.isFinite(payload.pr_number) ? payload.pr_number : void 0;
  const merged_at = typeof payload.merged_at === "string" && payload.merged_at.length > 0 ? payload.merged_at : void 0;
  return { ok: true, version: payload.version, sha, pr_creator_login, pr_number, merged_at };
}
async function attemptNpm(get, url, ua) {
  let res;
  try {
    res = await get(url, {
      "User-Agent": ua,
      "Accept": "application/json"
    });
  } catch (e) {
    const msg = e.message;
    if (/timeout/i.test(msg)) {
      return { ok: false, reason: "npm_timeout", message: msg };
    }
    return { ok: false, reason: "npm_network", message: msg };
  }
  if (res.statusCode === 404) {
    return {
      ok: false,
      reason: "npm_404",
      message: "npm registry: teamagent@latest not found"
    };
  }
  if (res.statusCode >= 500 && res.statusCode <= 599) {
    return {
      ok: false,
      reason: "npm_5xx",
      message: `npm registry server error ${res.statusCode}`
    };
  }
  if (res.statusCode !== 200) {
    return {
      ok: false,
      reason: "npm_5xx",
      message: `npm registry unexpected status ${res.statusCode}`
    };
  }
  let payload;
  try {
    payload = JSON.parse(res.body);
  } catch {
    return {
      ok: false,
      reason: "npm_parse",
      message: "npm registry response malformed JSON"
    };
  }
  if (typeof payload.version !== "string" || payload.version.length === 0) {
    return {
      ok: false,
      reason: "npm_parse",
      message: "npm registry response missing version"
    };
  }
  return { ok: true, version: payload.version };
}
async function fetchLatestVersion(input) {
  const get = input?.httpsGet ?? makeDefaultHttpsGet(input?.timeoutMs ?? 1e4);
  const pagesUrl = input?.pagesUrl ?? DEFAULT_PAGES_URL;
  const npmUrl = input?.npmUrl ?? DEFAULT_NPM_URL;
  const ua = input?.userAgent ?? "teamagent-updater";
  const pages = await attemptPages(get, pagesUrl, ua);
  if (pages.ok) {
    return {
      ok: true,
      version: pages.version,
      sha: pages.sha,
      source: "pages",
      pr_creator_login: pages.pr_creator_login,
      pr_number: pages.pr_number,
      merged_at: pages.merged_at
    };
  }
  const npm = await attemptNpm(get, npmUrl, ua);
  if (npm.ok) {
    return {
      ok: true,
      version: npm.version,
      source: "npm"
    };
  }
  return {
    ok: false,
    pagesReason: pages.reason,
    pagesMessage: pages.message,
    npmReason: npm.reason,
    npmMessage: npm.message
  };
}
function makeDefaultHttpsGet(timeoutMs) {
  return (url, headers) => new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const safeReject = (e) => {
      if (!settled) {
        settled = true;
        reject(e);
      }
    };
    const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => safeResolve({
        statusCode: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf-8"),
        headers: res.headers
      }));
      res.on("error", safeReject);
    });
    req.on("timeout", () => {
      safeReject(new Error("timeout"));
      req.destroy();
    });
    req.on("error", safeReject);
  });
}
export {
  DEFAULT_NPM_URL,
  DEFAULT_PAGES_URL,
  fetchLatestVersion
};
