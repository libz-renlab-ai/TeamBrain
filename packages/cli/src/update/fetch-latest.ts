import https from "node:https";

// ── Types (compatible with github-api.ts HttpsGet shape so callers can share mocks) ──

export interface HttpsResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string | undefined>;
}

export type HttpsGet = (
  url: string,
  headers: Record<string, string>,
) => Promise<HttpsResponse>;

// ── Discriminated result ──────────────────────────────────────────────────────

export type FetchLatestSuccess = {
  ok: true;
  /** semver, e.g. "0.11.5" */
  version: string;
  /** Optional release-branch HEAD SHA. Present when source="pages" and the
   *  latest.json payload included `sha`. Never present from npm. */
  sha?: string;
  source: "pages" | "npm";
  /**
   * Post-merge PR-creator force-update feature. Published in latest.json by
   * the release-branch.yml workflow after `gh api ... /pulls` lookup of the
   * just-merged commit. GitHub login of the PR author. Present only when
   * source="pages" and the workflow successfully resolved a PR for the SHA.
   */
  pr_creator_login?: string;
  /** PR number that landed in this release. Paired with pr_creator_login. */
  pr_number?: number;
  /** ISO 8601 merge timestamp of the PR. Advisory only. */
  merged_at?: string;
};

export type FetchLatestFailureReason =
  | "pages_network"
  | "pages_5xx"
  | "pages_404"
  | "pages_parse"
  | "pages_timeout"
  | "npm_network"
  | "npm_5xx"
  | "npm_404"
  | "npm_parse"
  | "npm_timeout";

export type FetchLatestFailure = {
  ok: false;
  pagesReason: FetchLatestFailureReason;
  pagesMessage: string;
  npmReason: FetchLatestFailureReason;
  npmMessage: string;
};

export type FetchLatestResult = FetchLatestSuccess | FetchLatestFailure;

// ── Input shape (test-injectable) ─────────────────────────────────────────────

export interface FetchLatestInput {
  httpsGet?: HttpsGet;
  pagesUrl?: string;
  npmUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
}

export const DEFAULT_PAGES_URL =
  "https://libz-renlab-ai.github.io/TeamBrain/latest.json";
export const DEFAULT_NPM_URL =
  "https://registry.npmjs.org/teamagent/latest";

// ── Per-source attempts ───────────────────────────────────────────────────────

type PagesAttempt =
  | { ok: true; version: string; sha?: string; pr_creator_login?: string; pr_number?: number; merged_at?: string }
  | { ok: false; reason: Extract<FetchLatestFailureReason, `pages_${string}`>; message: string };

type NpmAttempt =
  | { ok: true; version: string }
  | { ok: false; reason: Extract<FetchLatestFailureReason, `npm_${string}`>; message: string };

async function attemptPages(
  get: HttpsGet,
  url: string,
  ua: string,
): Promise<PagesAttempt> {
  let res: HttpsResponse;
  try {
    res = await get(url, {
      "User-Agent": ua,
      "Accept": "application/json",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (/timeout/i.test(msg)) {
      return { ok: false, reason: "pages_timeout", message: msg };
    }
    return { ok: false, reason: "pages_network", message: msg };
  }
  if (res.statusCode === 404) {
    return {
      ok: false,
      reason: "pages_404",
      message: `Pages latest.json not found at ${url}`,
    };
  }
  if (res.statusCode >= 500 && res.statusCode <= 599) {
    return {
      ok: false,
      reason: "pages_5xx",
      message: `Pages server error ${res.statusCode}`,
    };
  }
  if (res.statusCode !== 200) {
    return {
      ok: false,
      reason: "pages_5xx",
      message: `Pages unexpected status ${res.statusCode}`,
    };
  }
  let payload: {
    version?: unknown;
    sha?: unknown;
    pr_creator_login?: unknown;
    pr_number?: unknown;
    merged_at?: unknown;
  };
  try {
    payload = JSON.parse(res.body) as typeof payload;
  } catch {
    return {
      ok: false,
      reason: "pages_parse",
      message: "Pages latest.json malformed JSON",
    };
  }
  if (typeof payload.version !== "string" || payload.version.length === 0) {
    return {
      ok: false,
      reason: "pages_parse",
      message: "Pages latest.json missing version string",
    };
  }
  const sha = typeof payload.sha === "string" && payload.sha.length > 0
    ? payload.sha
    : undefined;
  const pr_creator_login =
    typeof payload.pr_creator_login === "string" && payload.pr_creator_login.length > 0
      ? payload.pr_creator_login
      : undefined;
  const pr_number =
    typeof payload.pr_number === "number" && Number.isFinite(payload.pr_number)
      ? payload.pr_number
      : undefined;
  const merged_at =
    typeof payload.merged_at === "string" && payload.merged_at.length > 0
      ? payload.merged_at
      : undefined;
  return { ok: true, version: payload.version, sha, pr_creator_login, pr_number, merged_at };
}

async function attemptNpm(
  get: HttpsGet,
  url: string,
  ua: string,
): Promise<NpmAttempt> {
  let res: HttpsResponse;
  try {
    res = await get(url, {
      "User-Agent": ua,
      "Accept": "application/json",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (/timeout/i.test(msg)) {
      return { ok: false, reason: "npm_timeout", message: msg };
    }
    return { ok: false, reason: "npm_network", message: msg };
  }
  if (res.statusCode === 404) {
    return {
      ok: false,
      reason: "npm_404",
      message: "npm registry: teamagent@latest not found",
    };
  }
  if (res.statusCode >= 500 && res.statusCode <= 599) {
    return {
      ok: false,
      reason: "npm_5xx",
      message: `npm registry server error ${res.statusCode}`,
    };
  }
  if (res.statusCode !== 200) {
    return {
      ok: false,
      reason: "npm_5xx",
      message: `npm registry unexpected status ${res.statusCode}`,
    };
  }
  let payload: { version?: unknown };
  try {
    payload = JSON.parse(res.body) as { version?: unknown };
  } catch {
    return {
      ok: false,
      reason: "npm_parse",
      message: "npm registry response malformed JSON",
    };
  }
  if (typeof payload.version !== "string" || payload.version.length === 0) {
    return {
      ok: false,
      reason: "npm_parse",
      message: "npm registry response missing version",
    };
  }
  return { ok: true, version: payload.version };
}

// ── Public entry ─────────────────────────────────────────────────────────────

export async function fetchLatestVersion(
  input?: FetchLatestInput,
): Promise<FetchLatestResult> {
  const get = input?.httpsGet ?? makeDefaultHttpsGet(input?.timeoutMs ?? 10_000);
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
      merged_at: pages.merged_at,
    };
  }

  const npm = await attemptNpm(get, npmUrl, ua);
  if (npm.ok) {
    return {
      ok: true,
      version: npm.version,
      source: "npm",
    };
  }

  return {
    ok: false,
    pagesReason: pages.reason,
    pagesMessage: pages.message,
    npmReason: npm.reason,
    npmMessage: npm.message,
  };
}

// ── Default real HTTPS implementation ────────────────────────────────────────

function makeDefaultHttpsGet(timeoutMs: number): HttpsGet {
  return (url, headers) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const safeResolve = (v: HttpsResponse) => {
        if (!settled) { settled = true; resolve(v); }
      };
      const safeReject = (e: Error) => {
        if (!settled) { settled = true; reject(e); }
      };
      const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => safeResolve({
          statusCode: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf-8"),
          headers: res.headers as Record<string, string | undefined>,
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
