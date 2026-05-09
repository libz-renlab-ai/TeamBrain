import https from "node:https";

// ── Discriminated union result ───────────────────────────────────────────────

export type FetchShaSuccess = {
  ok: true;
  /** SHA of the branch HEAD. For source="304", this is the cachedSha echoed back. */
  sha: string;
  /** ETag value the caller should persist for next conditional GET. null = server omitted it. */
  etag: string | null;
  /** "200" = fresh fetch (consumed quota), "304" = cache hit (zero quota). */
  source: "200" | "304";
};

export type FetchShaFailureReason =
  | "rate_limit_anonymous"   // 403 + X-RateLimit-Remaining: 0, no Authorization header sent
  | "rate_limit_authed"      // 403 + X-RateLimit-Remaining: 0, with Authorization header
  | "auth"                   // 401, or 403 with bad creds (NOT rate-limit)
  | "not_found"              // 404
  | "server"                 // 5xx
  | "network"                // connection refused / timeout / DNS / TLS
  | "parse";                 // 200 received but JSON malformed / missing commit.sha

export type FetchShaFailure = {
  ok: false;
  reason: FetchShaFailureReason;
  /** HTTP status if a response was received; 0 for transport-layer failure. */
  status: number;
  /** Human-readable message safe for logs and CLI output. */
  message: string;
};

export type FetchShaResult = FetchShaSuccess | FetchShaFailure;

// ── HTTP shim types ──────────────────────────────────────────────────────────

export interface HttpsResponse {
  statusCode: number;
  body: string;
  /** Lowercased response headers. Required for ETag + X-RateLimit-Remaining inspection.
   *  Backwards-compat: callers must tolerate this being undefined (older mocks). */
  headers?: Record<string, string | undefined>;
}

export type HttpsGet = (url: string, headers: Record<string, string>) => Promise<HttpsResponse>;

// ── Input ────────────────────────────────────────────────────────────────────

export interface FetchRemoteShaInput {
  owner: string;
  repo: string;
  branch: string;
  /** Test-injection point. Default = real https.get. */
  httpsGet?: HttpsGet;
  userAgent?: string;
  /** Optional bearer token. When present, send Authorization: Bearer <token>. */
  token?: string;
  /** Send as If-None-Match. Empty/undefined = unconditional GET. */
  ifNoneMatch?: string;
  /** SHA to return when the server replies 304 (304 has empty body). Required
   *  whenever ifNoneMatch is set; if absent, a 304 will be downgraded to a
   *  parse-failure result. */
  cachedSha?: string;
}

// ── Implementation ───────────────────────────────────────────────────────────

export async function fetchRemoteSha(input: FetchRemoteShaInput): Promise<FetchShaResult> {
  const { owner, repo, branch } = input;
  const get = input.httpsGet ?? defaultHttpsGet;
  const url = `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`;

  // Build request headers
  const reqHeaders: Record<string, string> = {
    "User-Agent": input.userAgent ?? "teamagent-updater",
    "Accept": "application/vnd.github+json",
  };

  // Token → Authorization header (only when truthy)
  if (input.token) {
    reqHeaders["Authorization"] = `Bearer ${input.token}`;
  }

  // ETag → If-None-Match header (only when truthy, preserved byte-for-byte)
  if (input.ifNoneMatch) {
    reqHeaders["If-None-Match"] = input.ifNoneMatch;
  }

  let res: HttpsResponse;
  try {
    res = await get(url, reqHeaders);
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      status: 0,
      message: (e as Error).message,
    };
  }

  const { statusCode, headers } = res;

  // ── 304 Not Modified ────────────────────────────────────────────────────
  // Spec: server only returns 304 when If-None-Match matched, which means the
  // caller MUST have sent both ifNoneMatch and cachedSha. Any other shape
  // (e.g. proxy that returns 304 unconditionally) is degenerate — return parse
  // failure rather than silently echoing back ifNoneMatch=undefined and
  // wiping last_branch_etag on the next writeState in updater-logic.
  if (statusCode === 304) {
    if (!input.ifNoneMatch || !input.cachedSha) {
      return {
        ok: false,
        reason: "parse",
        status: 304,
        message: "304 received but ifNoneMatch + cachedSha not both provided",
      };
    }
    return {
      ok: true,
      sha: input.cachedSha,
      etag: input.ifNoneMatch,
      source: "304",
    };
  }

  // ── 401 Unauthorized ────────────────────────────────────────────────────
  if (statusCode === 401) {
    return {
      ok: false,
      reason: "auth",
      status: 401,
      message: "GitHub auth rejected (token invalid or expired)",
    };
  }

  // ── 403 Forbidden ───────────────────────────────────────────────────────
  if (statusCode === 403) {
    // Check for rate-limit: headers present AND remaining counter is exhausted.
    // Coerce + trim the header so proxies/test mocks that send 0 (number),
    // " 0", "00", etc. still classify as rate-limit (the only spec-compliant
    // GitHub value is "0", but be lenient to keep backoff behaviour robust).
    const remaining = String(headers?.["x-ratelimit-remaining"] ?? "").trim();
    if (remaining === "0") {
      if (input.token) {
        return {
          ok: false,
          reason: "rate_limit_authed",
          status: 403,
          message: "GitHub authenticated rate limit exhausted; retry later",
        };
      } else {
        return {
          ok: false,
          reason: "rate_limit_anonymous",
          status: 403,
          message: "GitHub anonymous rate limit exhausted; set TEAMAGENT_GITHUB_TOKEN to authenticate (5000 req/h)",
        };
      }
    }
    // All other 403 shapes (no headers, header absent, header non-zero) → auth
    return {
      ok: false,
      reason: "auth",
      status: 403,
      message: "GitHub request forbidden (check token permissions or SSO)",
    };
  }

  // ── 404 Not Found ────────────────────────────────────────────────────────
  if (statusCode === 404) {
    return {
      ok: false,
      reason: "not_found",
      status: 404,
      message: `branch not found: ${owner}/${repo}@${branch}`,
    };
  }

  // ── 5xx Server Error ─────────────────────────────────────────────────────
  if (statusCode >= 500 && statusCode <= 599) {
    return {
      ok: false,
      reason: "server",
      status: statusCode,
      message: `GitHub server error ${statusCode}`,
    };
  }

  // ── 200 OK ───────────────────────────────────────────────────────────────
  if (statusCode === 200) {
    let sha: string | undefined;
    try {
      const obj = JSON.parse(res.body) as { commit?: { sha?: string } };
      sha = obj.commit?.sha;
    } catch {
      return {
        ok: false,
        reason: "parse",
        status: 200,
        message: "malformed response body",
      };
    }
    if (!sha) {
      return {
        ok: false,
        reason: "parse",
        status: 200,
        message: "malformed response body",
      };
    }
    return {
      ok: true,
      sha,
      etag: headers?.["etag"] ?? null,
      source: "200",
    };
  }

  // ── Unexpected status ────────────────────────────────────────────────────
  return {
    ok: false,
    reason: "server",
    status: statusCode,
    message: `GitHub server error ${statusCode}`,
  };
}

// ── Default real HTTPS implementation ────────────────────────────────────────

const defaultHttpsGet: HttpsGet = (url, headers) =>
  new Promise((resolve, reject) => {
    // Guard against double-resolve: on a stalled TLS handshake `req.destroy(err)`
    // does not reliably emit `'error'`, so the timeout handler must reject the
    // promise itself. The settled flag prevents subsequent error/end events
    // from triggering a second settle.
    let settled = false;
    const safeResolve = (v: HttpsResponse) => { if (!settled) { settled = true; resolve(v); } };
    const safeReject = (e: Error) => { if (!settled) { settled = true; reject(e); } };
    const req = https.get(url, { headers, timeout: 10_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c as Buffer));
      res.on("end", () => safeResolve({
        statusCode: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf-8"),
        // IncomingHttpHeaders values may be string | string[] | undefined;
        // cast to our declared type — the headers we inspect are always single strings.
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
