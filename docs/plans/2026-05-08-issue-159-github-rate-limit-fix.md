# Plan — Fix issue #159: GitHub API rate-limit on `update --check`

**Issue**: https://github.com/libz-renlab-ai/TeamBrain/issues/159
**Worktree**: `.codex/worktrees/issue-159-fix`
**Branch**: `fix/issue-159-github-api-rate-limit`
**Base**: `origin/main` @ `dc2ced6`

---

## ① Task description

`teamagent update --check` (and the auto-updater spawned at SessionStart) calls
`https://api.github.com/repos/.../branches/release` with **no Authorization
header** and **no conditional-GET caching**. Anonymous quota is 60 req/h per IP,
which is shared with `gh`, `git ls-remote https://`, and other tools on the same
NAT/VPN. When the quota is exhausted GitHub returns `403`, `fetchRemoteSha`
swallows it as `null`, and the user sees `fetch failed (network/rate-limit)`
without any way to tell rate-limit from a real network outage.

This PR fixes four things that together close the gap:

1. **Token support** — accept `TEAMAGENT_GITHUB_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`
   (in that order); send as `Authorization: Bearer …`. Authed quota is 5000 req/h.
2. **ETag / conditional GET** — persist the response ETag, send `If-None-Match`
   on the next call. `304 Not Modified` does **not** consume quota.
3. **Graceful error classification** — replace catch-all `null` return with a
   discriminated `FetchShaResult` union (`ok:true / ok:false + reason`). The CLI
   surfaces a per-reason message that tells the user what to do.
4. **Failure backoff** — track `consecutive_rate_limits` and `next_check_after_ts`
   in `update-state.json`. On rate-limit, exponential backoff `1h → 2h → 4h …`,
   capped at 24h. On success, reset to 0.

### What this PR is NOT doing

- Not migrating to `octokit` or any HTTP client library — we keep the
  `node:https` shim so the CJS bundle stays small.
- Not adding a separate `~/.teamagent/auth.json` config file — env vars only.
- Not changing the `release` branch / repo name or the polling interval.
- Not adding telemetry; failures still go to `~/.teamagent/update.log` only.
- Not changing the `runAdvancedHook` shape in `bin-updater.ts` (manualResources
  + Updater channel stays as-is).

---

## ② Locked contracts (single source of truth)

All four workers MUST conform to the types and behaviour below. Workers that
diverge from this contract will be rejected by the reporter.

### 2.1 `packages/cli/src/github-api.ts` — public API

```ts
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

export interface HttpsResponse {
  statusCode: number;
  body: string;
  /** Lowercased response headers. Required for ETag + X-RateLimit-Remaining inspection.
   *  Backwards-compat: callers must tolerate this being undefined (older mocks). */
  headers?: Record<string, string | undefined>;
}

export type HttpsGet = (url: string, headers: Record<string, string>) => Promise<HttpsResponse>;

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

export function fetchRemoteSha(input: FetchRemoteShaInput): Promise<FetchShaResult>;
```

#### Behavioural rules (slice A must implement, all other workers can rely on)

- **200**: parse `commit.sha`. Return `{ok:true, sha, etag: headers.etag ?? null, source:"200"}`.
- **304**: return `{ok:true, sha: input.cachedSha ?? "", etag: input.ifNoneMatch ?? null, source:"304"}`.
  If `cachedSha` is absent, return `{ok:false, reason:"parse", status:304, message:"304 received but no cachedSha provided"}`.
- **401**: `{ok:false, reason:"auth", status:401, message:"GitHub auth rejected (token invalid or expired)"}`.
- **403** with `headers["x-ratelimit-remaining"] === "0"`:
  - if `input.token` was set → `rate_limit_authed`, message: `"GitHub authenticated rate limit exhausted; retry later"`.
  - else → `rate_limit_anonymous`, message: `"GitHub anonymous rate limit exhausted; set TEAMAGENT_GITHUB_TOKEN to authenticate (5000 req/h)"`.
- **403** in any other shape → `auth` (treat as forbidden). This explicitly
  covers three cases: (a) `headers` is undefined (e.g. legacy mocks);
  (b) `x-ratelimit-remaining` header absent; (c) header present but non-zero.
  All three must NOT be misclassified as rate-limit; SSO/permission failures
  belong here.
- **404** → `not_found`, message: `"branch not found: ${owner}/${repo}@${branch}"`.
- **5xx** → `server`, message: `"GitHub server error ${status}"`.
- **JSON parse failure on 200** → `parse`, status: 200, message: `"malformed response body"`.
- **transport throw** (`https.get` rejects) → `network`, status: 0, message: `(e as Error).message`.

The function MUST NOT throw. Every code path returns a `FetchShaResult`.

#### ETag handling rule

GitHub uses **weak** ETags, e.g. `W/"5e8c4d…"`. The implementation MUST store
and resend the ETag **byte-for-byte** as received. Do NOT strip the `W/`
prefix, do NOT remove the surrounding quotes, do NOT normalize whitespace. The
server's `If-None-Match` matching is exact-string. Any normalization breaks
the 304 path silently and quota stops being conserved.

### 2.2 `packages/core/src/update/update-state.ts` — schema additions

Add these fields to `UpdateState`. All MUST be optional in `parseUpdateState`
(backwards-compat: state files written by older versions must still load).

```ts
export interface UpdateState {
  // ... existing fields unchanged ...

  /** ETag returned by GitHub on the last 200 response. Empty string = none. */
  last_branch_etag: string;

  /** SHA returned alongside last_branch_etag. Used to fill cachedSha for 304.
   *  Distinct from last_installed_sha — etag tracks "what's on the remote",
   *  sha tracks "what we have locally installed". They diverge between
   *  detection and install. */
  last_branch_sha: string;

  /** Epoch ms; if non-zero and now < this, skip the next check (backoff active).
   *  0 = no active backoff. */
  next_check_after_ts: number;

  /** Counter for exponential backoff. Reset to 0 on any successful fetch. */
  consecutive_rate_limits: number;
}
```

Defaults in `defaultUpdateState`: all four = `""` / `0`.

`parseUpdateState` adds four typeof-guarded reads with the same fallback shape
as the existing fields.

### 2.3 Token resolution helper (lives in slice C, not in github-api.ts)

```ts
// In packages/cli/src/commands/update.ts AND packages/cli/src/bin-updater.ts
function resolveGithubToken(): string | undefined {
  return process.env.TEAMAGENT_GITHUB_TOKEN
      || process.env.GITHUB_TOKEN
      || process.env.GH_TOKEN
      || undefined;
}
```

Resolution order is **strict**: `TEAMAGENT_GITHUB_TOKEN` first so users can give
TeamAgent its own token without colliding with `gh`. Empty string is treated
as unset.

### 2.4 `commands/update.ts checkCmd` — graceful errors + ETag persistence

```ts
async function checkCmd(): Promise<UpdateRunResult> {
  const { fetchRemoteSha } = await import("../github-api.js");
  const s = readState();
  const result = await fetchRemoteSha({
    owner: REPO_OWNER, repo: REPO_NAME, branch: REPO_BRANCH,
    token: resolveGithubToken(),
    ifNoneMatch: s.last_branch_etag || undefined,
    cachedSha: s.last_branch_sha || undefined,
  });
  if (!result.ok) {
    return { ok: false, output: formatCheckFailure(result) + "\n" };
  }
  // Persist etag/sha for next conditional GET
  writeState({ ...s, last_branch_etag: result.etag ?? "", last_branch_sha: result.sha });
  const local = s.last_installed_sha;
  if (result.sha === local) return { ok: true, output: `up-to-date (${local.slice(0, 7)})\n` };
  return { ok: true, output: `update available: ${(local || "(none)").slice(0, 7)} -> ${result.sha.slice(0, 7)}\n` };
}
```

`formatCheckFailure(result: FetchShaFailure): string` returns the per-reason
message verbatim from `result.message` (the github-api layer already produced a
user-actionable string per § 2.1).

### 2.5 `updater-logic.ts runUpdater` — backoff integration

```ts
// Before fetch:
if (state.next_check_after_ts > 0 && deps.now() < state.next_check_after_ts) {
  deps.log(`backoff active until ${new Date(state.next_check_after_ts).toISOString()}; skip`);
  return;
}

const result = await deps.fetchRemoteSha();

if (!result.ok) {
  if (result.reason === "rate_limit_anonymous" || result.reason === "rate_limit_authed") {
    const next = state.consecutive_rate_limits + 1;
    const delayHours = Math.min(2 ** (next - 1), 24);  // 1, 2, 4, 8, 16, 24, 24…
    deps.writeState({
      ...state,
      consecutive_rate_limits: next,
      next_check_after_ts: deps.now() + delayHours * 3600 * 1000,
      // IMPORTANT: do NOT bump consecutive_install_failures or set
      // last_install_error here. Those two fields are reserved for actual
      // install/migrate failures (runNpmInstall / runMigrateAuto), and
      // shouldCheckUpdate gates on consecutive_install_failures>=3 with its
      // own 24h backoff. Mixing rate-limit signals into the install-failure
      // counter would compound two backoffs and break the existing gate.
    });
    deps.log(`rate-limited (${result.reason}); backoff ${delayHours}h`);
    return;
  }
  deps.log(`fetch failed (${result.reason}): ${result.message}`);
  return;
}

// Success path:
const remoteSha = result.sha;
deps.writeState({
  ...state,
  consecutive_rate_limits: 0,
  next_check_after_ts: 0,
  last_branch_etag: result.etag ?? "",
  last_branch_sha: remoteSha,
});

if (remoteSha === state.last_installed_sha) {
  deps.log("up-to-date");
  return;
}
// ... existing install / migrate flow continues unchanged ...
```

### 2.5b checkCmd vs auto-updater write contention (intentional)

Both `checkCmd` (foreground CLI) and `runUpdater` (background hook) write
`last_branch_etag` and `last_branch_sha` without a shared lock. This is
intentional and harmless: when both paths see the same upstream sha, they
write the same value; when upstream advances between the two calls, the
later writer wins and the next conditional GET picks up the newer ETag.
Either way the worst case is a single extra unconditional GET, not data
loss. The `update.lock` file in `bin-updater.ts:acquireLock` protects the
install/migrate critical section, not the read-side state writes.

### 2.6 `bin-updater.ts` — closure construction

`UpdaterDeps.fetchRemoteSha` signature changes from `Promise<string | null>` to
`Promise<FetchShaResult>`. The closure now reads state + token before each call:

```ts
fetchRemoteSha: () => {
  const s = readState();
  return fetchRemoteSha({
    owner: REPO_OWNER, repo: REPO_NAME, branch: REPO_BRANCH,
    token: resolveGithubToken(),
    ifNoneMatch: s.last_branch_etag || undefined,
    cachedSha: s.last_branch_sha || undefined,
  });
},
```

---

## ③ Expected outputs

Reviewer-checkable artefacts:

### Files added/edited

- `packages/cli/src/github-api.ts` — new types, new behaviour, new headers.
- `packages/cli/src/__tests__/github-api.test.ts` — coverage for every reason
  branch (200, 304, 401, 403+remaining=0+anon, 403+remaining=0+authed,
  403+remaining>0, 404, 500, network, malformed JSON, missing cachedSha on 304).
- `packages/core/src/update/update-state.ts` — 4 new fields + parser updates.
- `packages/core/src/update/__tests__/update-state.test.ts` — parser
  backwards-compat for old state files (no new fields), forward-compat for
  new state files.
- `packages/cli/src/commands/update.ts` — `resolveGithubToken`, graceful error
  formatting in `checkCmd`, ETag persistence on success.
- `packages/cli/src/updater-logic.ts` — backoff guard + rate-limit/state update.
- `packages/cli/src/bin-updater.ts` — closure reads state+token per call.
- `packages/cli/src/__tests__/updater-logic.test.ts` — backoff branches, state
  persistence on success, rate-limit retry counter.
- `packages/cli/src/__tests__/update.test.ts` — error message formatting,
  ETag persistence in `checkCmd`.
- `docs/plans/2026-05-08-issue-159-github-rate-limit-fix.md` — this file.
- `docs/plans/2026-05-08-issue-159-report.md` — written by reporter at end.

### CLI behaviour (manual / FASTPROBE-verifiable)

- `pnpm teamagent update --check` with `TEAMAGENT_GITHUB_TOKEN=<valid>` →
  returns `up-to-date (...)` or `update available: ...`. Persists ETag.
- Same command after artificially exhausting quota → output starts with
  `GitHub anonymous rate limit exhausted; set TEAMAGENT_GITHUB_TOKEN`.
- Two consecutive runs with the same remote sha → second run sees `source:"304"`
  in the underlying call (verified via test mock; in production this means 0
  quota cost on the second call).
- `update-state.json` after a check: contains `last_branch_etag`,
  `last_branch_sha`, `next_check_after_ts: 0`, `consecutive_rate_limits: 0`.

### Anti-goals (must NOT change)

- `runAdvancedHook` channel/escape config in `bin-updater.ts`.
- The set of update subcommands (`check / now / status / disable / enable / rollback / logs`).
- `findUpdaterBinary` path resolution (PR #151 fix stays).
- The `release` branch / repo coordinates.

---

## ④ How-to-verify (judge harness)

### 4a. Project-wide gate (1+2+3 from `docs/feature-verification.md`)

The module under test is `packages/cli/src/github-api.ts`. Hard-match canonical
JSON between `claudefast` and `codex exec`:

```bash
# Probe 1
claudefast -p \
  --output-format stream-json --include-partial-messages --verbose \
  --debug hooks --debug-file .fastprobe/issue-159-cf.log \
  --permission-mode acceptEdits \
  "Read packages/cli/src/github-api.ts. Output canonical JSON with keys: \
   { exports: [...], FetchShaResult_kind: 'discriminated_union', \
     reasons: [...], headers_inspected: [...] }"

# Probe 2 — Codex
codex exec "Read packages/cli/src/github-api.ts. Output the same canonical JSON."

# 3. jq -S then diff -u; must be byte-identical.
```

`/export <path>` from a tmux interactive `claudefast` session attached to PR.

### 4b. Plan-specific judge harness

**RUN**:

```bash
cd .codex/worktrees/issue-159-fix
pnpm install --frozen-lockfile=false
pnpm --filter @teamagent/core build
pnpm --filter @teamagent/cli build
pnpm --filter @teamagent/cli test -- github-api updater-logic update-state update.test
pnpm --filter @teamagent/core test -- update-state
pnpm typecheck
```

**DUMP**: capture stdout/stderr to `.judge/issue-159/run.log`,
`.judge/issue-159/judge.json`:

```json
{
  "exit_code": 0,
  "metrics": {
    "github_api_tests_passed": <int>,
    "updater_logic_tests_passed": <int>,
    "update_state_tests_passed": <int>,
    "typecheck_errors": 0
  },
  "evidence_dir": ".judge/issue-159/"
}
```

**READ**: A fresh `claudefast -p` (or `codex exec`) reads only `judge.json` +
the test file diffs and grades PASS/FAIL. The PR author / executing agent
does NOT grade.

### 4c. Live rate-limit simulation

Three manual probes (recorded in `report.md`):

1. **Without token** — point `httpsGet` mock at a fixture returning
   `403 + x-ratelimit-remaining: 0`. CLI must print
   `GitHub anonymous rate limit exhausted; set TEAMAGENT_GITHUB_TOKEN`.
2. **With token** — same mock with `Authorization: Bearer …` echoed back; CLI
   prints `GitHub authenticated rate limit exhausted; retry later`.
3. **ETag hit** — first call returns `200 + etag: "W/abc"`. State now has
   `last_branch_etag: "W/abc"`. Second call: mock asserts
   `If-None-Match: W/abc` was sent and returns `304`. CLI returns the cached
   sha with no quota consumed.

---

## ⑤ Slices (TEAMWORK N=4 parallel workers)

Each slice owns a disjoint set of files. Workers MUST NOT touch files outside
their slice.

| Slice | Owner files | Scope |
|-------|-------------|-------|
| **A** github-api.ts core | `packages/cli/src/github-api.ts`, `packages/cli/src/__tests__/github-api.test.ts` | Implement § 2.1 contract: types, headers, behaviour rules. **The 5 existing tests in `github-api.test.ts` use mocks of shape `{statusCode, body}` only and assert `toBeNull()` on the legacy `Promise<string \| null>` return — these MUST be migrated to (a) include a `headers` map in mock responses (b) assert on the new `FetchShaResult` discriminated union (`expect(result.ok).toBe(true/false)`, `expect(result.reason).toBe(...)`).** Add new test cases for: 200 + etag header captured; 304 path with cachedSha echoed; 304 without cachedSha → parse failure; 403 + remaining=0 + no token → rate_limit_anonymous; 403 + remaining=0 + token → rate_limit_authed; 403 with no remaining header → auth; 401 → auth; 5xx → server; weak ETag (`W/"abc"`) preserved byte-for-byte. |
| **B** state schema | `packages/core/src/update/update-state.ts`, `packages/core/src/update/__tests__/update-state.test.ts` | § 2.2 schema additions + parseUpdateState backwards-compat tests. |
| **C** consumers | `packages/cli/src/commands/update.ts`, `packages/cli/src/updater-logic.ts`, `packages/cli/src/bin-updater.ts`, `packages/cli/src/__tests__/updater-logic.test.ts`, `packages/cli/src/__tests__/update.test.ts` | § 2.3 / § 2.4 / § 2.5 / § 2.6 — wire fetch result into CLI + updater + closure. |
| **D** integration tests + docs | `packages/cli/src/__tests__/integration-issue-159.test.ts` (NEW), `docs/SELF-UPDATE.md` (append "Token & ETag" section), no edits to source files | End-to-end: simulate full updater flow with mocked httpsGet for each scenario in § 4c. Document opt-in env vars. |

### Per-worker probe spec (2 probes each, 8 total)

Slice A probes:
- P1: `claudefast -p "Read packages/cli/src/github-api.ts in worktree
  .codex/worktrees/issue-159-fix. Confirm fetchRemoteSha returns a
  discriminated union with ok:true and ok:false branches, that 304 returns
  source='304' and echoes cachedSha, that anonymous 403 maps to
  rate_limit_anonymous, and that no code path throws. Output JSON
  {confirms_contract: true|false, gaps: [...]}"`
- P2: `claudefast -p "Run pnpm --filter @teamagent/cli test -- github-api in
  .codex/worktrees/issue-159-fix and report number of test cases passed and
  any failure messages."`

Slice B probes:
- P1: `claudefast -p "Read packages/core/src/update/update-state.ts. Confirm
  the four new fields (last_branch_etag, last_branch_sha, next_check_after_ts,
  consecutive_rate_limits) are present in UpdateState, defaultUpdateState, and
  parseUpdateState with typeof guards. Output JSON {confirms_contract: bool,
  gaps: [...]}"`
- P2: `claudefast -p "Run pnpm --filter @teamagent/core test -- update-state.
  Report passed count and any failures."`

Slice C probes:
- P1: `claudefast -p "Read packages/cli/src/commands/update.ts and
  updater-logic.ts and bin-updater.ts. Confirm: (1) resolveGithubToken
  reads TEAMAGENT_GITHUB_TOKEN > GITHUB_TOKEN > GH_TOKEN; (2) checkCmd uses
  result.ok branching with per-reason messages; (3) updater-logic has the
  backoff guard before fetch and the rate-limit branch resets state on
  success; (4) bin-updater closure reads state+token per call. Output JSON
  {confirms_contract: bool, gaps: [...]}"`
- P2: `claudefast -p "Run pnpm --filter @teamagent/cli test -- updater-logic
  update.test in .codex/worktrees/issue-159-fix. Report passed count."`

Slice D probes:
- P1: `claudefast -p "Read packages/cli/src/__tests__/integration-issue-159.test.ts.
  Confirm it covers: (a) anonymous 403+remaining=0 → rate_limit_anonymous
  message; (b) authed 403+remaining=0 → rate_limit_authed; (c) 200 then
  304 with If-None-Match echoed; (d) backoff state set on rate limit, cleared
  on success. Output JSON {scenarios_covered: [...], gaps: [...]}"`
- P2: `claudefast -p "Read docs/SELF-UPDATE.md and confirm there is a
  Token & ETag section explaining TEAMAGENT_GITHUB_TOKEN, the env var fallback
  order, and the conditional GET behaviour. Output JSON {present: bool,
  missing_topics: [...]}"`

---

## ⑥ Reporter spec (opus 1M, after all 4 workers complete)

The reporter:

1. Reads every worker's report (file content + 2 probes).
2. Cross-checks that A's exported types are imported correctly by C.
3. Cross-checks that B's state fields are read by C with the correct names.
4. Runs the final acceptance probe: `pnpm install --frozen-lockfile=false &&
   pnpm --filter @teamagent/core build && pnpm --filter @teamagent/cli build
   && pnpm test && pnpm typecheck` in the worktree; captures full output.
5. Issues structured PASS / FAIL with a list of issues found.

On PASS, lead commits + pushes + opens PR.
On FAIL, lead reroles only the failing slice(s).

---

## ⑦ POSTPR plan

After PR opens:

1. Wait for CI green.
2. Run `/review` skill on the PR.
3. Triage findings (P1/P2/P3).
4. P1/P2 → write `docs/plans/2026-05-08-pr-<n>-fix-plan.md`, fix in this PR
   branch via TEAMWORK; never open follow-up issue, never merge with P1/P2
   open. P3 may be deferred only with explicit reviewer approval.
5. Loop until `/review` PASS + no merge conflict.
