# Auto-update channel — three-tier version-check (issue #313)

> **Goal**: every user auto-updates to the latest version, no matter the network
> environment, no manual configuration. Achieved by routing version-check away
> from the 60 req/hr anonymous GitHub API.

## Overview

```
                            TeamAgent SessionStart
                                   │
                                   ▼
                          ┌────────────────┐
                          │  runUpdater()  │
                          └───────┬────────┘
                                  │ fetchLatestVersion()
                                  │
       ┌──────────────────────────┴──────────────────────────┐
       ▼                          ▼                          ▼
  Tier 1 (主路)             Tier 2 (兜底)              Tier 3 (人话)
  GitHub Pages               npm registry             SessionStart banner
       │                          │                          │
  latest.json on              teamagent/latest          (fires when both
  gh-pages branch,            on registry.npmjs.org      tiers above failed)
  CDN-served (Fastly)         (npm public infra)
                                                       
  unlimited rate              unlimited rate           recovery paths:
  毫秒级延迟                   滞后约 1 周                • npm i -g teamagent@latest
                              (per `docs/PUBLISHING.md`) • 等下次启动重试
                                                         • set TEAMAGENT_GITHUB_TOKEN
```

**完全不再 touch `api.github.com`**. The previous codepath
(`fetchRemoteSha → api.github.com/repos/.../branches/release`) is still
exported from `packages/cli/src/github-api.ts` for potential future
install-path SHA pinning, but no SessionStart codepath calls it any more.

## Tier 1: `latest.json` on gh-pages

### URL
`https://libz-renlab-ai.github.io/TeamBrain/latest.json`

### Schema

```jsonc
{
  // Semver, e.g. "0.11.5". Required.
  "version": "0.11.5",

  // Release-branch HEAD SHA when the release fired. Optional but recommended
  // for rollback bookkeeping. Used by runUpdater to set last_branch_sha /
  // last_installed_sha (alongside the version) when present.
  "sha": "0123456789abcdef…",

  // Release time, RFC 3339 UTC. Optional, advisory only.
  "releasedAt": "2026-05-11T13:04:02Z",

  // Static-asset URL the install path actually downloads. Provided as a
  // convenience field so the next-tier tooling can verify install-path
  // continuity. The runtime updater does NOT fetch this URL directly via
  // latest.json — it has its own constant in bin-updater.ts (PACKAGE_SPEC).
  "tarball": "https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz",

  // Provenance string for forensic / debugging purposes. Format:
  // `release-branch.yml@<github_run_id>`.
  "generatedBy": "release-branch.yml@1234567890",

  // ── Post-merge PR-creator force-update feature (additive) ────────────────
  // The three fields below are OPTIONAL — published only when the release-
  // branch workflow could resolve the PR associated with this commit via
  // `gh api .../commits/{sha}/pulls`. Direct pushes to main (bypassing PR
  // flow), private fork race, or any API hiccup will omit them. Consumers
  // MUST treat all three as optional and fall back to legacy behaviour when
  // absent.

  // Number of the PR that landed in this release (1..N). Validated to
  // ^[0-9]{1,9}$ at publish time.
  "pr_number": 348,

  // GitHub login of the PR author. Used by the local updater to decide
  // whether the user running it authored the just-merged PR; if so, the
  // updater stamps pending_banner with pr_creator:true so SessionStart
  // renders the distinct 🎯 banner. Only the public login is published —
  // no email, no real name. Validated to ^[A-Za-z0-9-]{1,39}$ at publish
  // time (matches GitHub login charset and length cap).
  "pr_creator_login": "LiuShiyuMath",

  // ISO 8601 UTC timestamp of when the PR was merged. Advisory only — not
  // used by the updater state machine.
  "merged_at": "2026-05-12T03:13:00Z"
}
```

### Who writes it

CI workflow `.github/workflows/release-branch.yml` step
**"Publish latest.json to gh-pages (issue #313 Tier 1)"** — runs after the
release tarball + GitHub Release have shipped. The step:

1. Reads `VERSION` from the package.json (already validated as strict semver).
2. **Resolves PR creator metadata** via the previous **"Resolve PR creator
   for merge commit"** step (`gh api .../commits/{sha}/pulls`, defensively
   regex-validated; fail-soft on empty / private fork / non-PR push).
3. Clones the `gh-pages` branch shallow.
4. Overwrites `latest.json` using `jq` object-add to conditionally include
   the three new optional fields (`pr_number`, `pr_creator_login`,
   `merged_at`) only when they validated successfully.
5. Commits & force-pushes only if the file changed.

The landing page (also hosted on `gh-pages`) is untouched — only the
`latest.json` file at the repo root is modified.

### Guarantees

- **No rate limit**: GitHub Pages → Fastly CDN. Users globally read the same
  cached content at edge nodes; the origin server is rarely hit and never per
  user.
- **No auth required**: the file is public; no token, no headers.
- **Eventually consistent**: CI commits land in `gh-pages` then propagate to
  Fastly within seconds.
- **Freshness**: written on every successful release CI run, so the file
  effectively tracks `release` branch HEAD with at most the CI's own delay
  (~1-2 minutes).

### Who reads it

`packages/cli/src/update/fetch-latest.ts` `fetchLatestVersion()`:
- `User-Agent: teamagent-updater`
- `Accept: application/json`
- 10 second default timeout

On any of: timeout, network error, 5xx, 404, malformed JSON, missing `version`
field → falls through to Tier 2.

## Tier 2: npm registry fallback

### URL
`https://registry.npmjs.org/teamagent/latest`

### Why it's the fallback (not the primary)

npm publish cadence is documented as
[`Publish per 10 PRs`](../PUBLISHING.md) — npm `latest` lags the release branch
HEAD by approximately 1 week.

For the *primary* version-check path we want near-zero lag (users on the
release-branch-HEAD bleeding edge), which Tier 1 (`latest.json` published per
release) provides. Tier 2 is intentionally chosen as a *fallback* so that even
when Pages briefly hiccups, users still get a plausibly-recent version, even
if slightly stale.

### Schema (subset used)

```jsonc
{
  "name": "teamagent",
  "version": "0.11.0",
  // (other npm registry fields ignored)
}
```

### Guarantees

- **No rate limit**: npm is internet infrastructure; if it's hard-down, that
  is an industry event, not something TeamAgent should fix here.
- **No auth required for public packages**.
- 10s timeout, same `User-Agent`.

## Tier 3: Tier-3 banner (human-readable failure)

When **both** Tier 1 and Tier 2 fail:

1. `runUpdater` writes `state.last_install_error` with a structured prefix:

   ```
   version-check failed: pages=<reason> (<message>); npm=<reason> (<message>)
   ```

2. **`consecutive_install_failures` is NOT bumped** — that counter is
   semantically reserved for npm-install / migrate failures, and mixing
   version-check failures into it would compound exponential backoff in
   `shouldCheckUpdate`.

3. Next SessionStart, `bin-session-start.ts` calls
   `maybeShowVersionCheckBanner` (`session-start-logic.ts`), which renders:

   ```
   ⚠️  TeamAgent: 暂时查不到新版本
      version-check failed: pages=<reason> (<message>); npm=<reason> (<message>)
      建议:
        • 手动: npm i -g teamagent@latest
        • 或等下次启动 (我们会重试)
        • 高级用户: 设 TEAMAGENT_GITHUB_TOKEN 走认证通道
   ```

4. **No throttle**: fires every SessionStart while the error string persists.
   Self-clears when the next version-check succeeds (Pages or npm comes back
   → `runUpdater` writes `last_install_error: null` in the success path).

This is intentionally different from `maybeShowReinstallBanner` (24h throttle),
because version-check failures are usually transient: a single retry that
goes through Tier 1 again clears the state in seconds. If we throttled this
banner, the user would see a stale error long after the underlying issue
healed.

## Failure-reason taxonomy

`FetchLatestFailure` discriminates each tier's failure mode:

| Reason | Meaning | Typical cause |
|--------|---------|---------------|
| `pages_network` | TCP/TLS/DNS error | CDN unreachable, blocked, DNS failure |
| `pages_5xx` | HTTP 5xx | Fastly origin error |
| `pages_404` | HTTP 404 | `latest.json` not yet published; first deploy |
| `pages_parse` | malformed JSON or missing `version` | CI bug, manual override gone wrong |
| `pages_timeout` | exceeded 10s | flaky network, throttling |
| `npm_network` | TCP/TLS/DNS error | npm registry unreachable, blocked |
| `npm_5xx` | HTTP 5xx | npm origin error |
| `npm_404` | HTTP 404 | should never happen unless package unpublished |
| `npm_parse` | malformed JSON | npm registry quirk |
| `npm_timeout` | exceeded 10s | flaky network |

These propagate into the Tier 3 message so the user (or someone they paste
the message to) can diagnose without reading TeamAgent source.

## Why these specific tiers (and not others)

| Candidate | Why rejected |
|-----------|--------------|
| `api.github.com` (status quo) | The whole point — 60 req/hr per IP kills shared NAT |
| `raw.githubusercontent.com` | Also rate-limited per IP, similar to API |
| `git ls-remote` | Requires `git` on user PATH; not guaranteed on Windows or minimal containers |
| `data.jsdelivr.com` proxy | Introduces third-party dependency (jsdelivr); privacy / political concerns |
| Bundle PAT in npm package | Security violation; PAT extractable from any user's tarball |

The chosen Tier 1 + Tier 2 chain:
- Requires no user configuration.
- Requires no third-party (we own Pages; npm is industry infra).
- Works on every OS without external binaries.
- Survives single-source outage (Pages OR npm can be down).

## Out of scope (`#313` won't change these)

- The actual binary download path (`PACKAGE_SPEC` tarball URL) stays as-is.
- The npm publish cadence (`Publish per 10 PRs`) stays as-is.
- The exponential backoff math (no longer reached on the main path) stays as-is.
- The token authentication path stays as-is (5000 req/hr) for users who
  explicitly set `TEAMAGENT_GITHUB_TOKEN`.
- Offline / air-gapped install (genuinely no internet) is not addressed; that's
  a different feature.

## Verification

Full judge harness in `docs/plans/2026-05-12-issue-313/judge.md`. Quick check:

```bash
# Fresh machine, no token. Should never hit api.github.com:
unset TEAMAGENT_GITHUB_TOKEN GITHUB_TOKEN GH_TOKEN
teamagent update --check
# Expected: "up-to-date (X.Y.Z; source=pages)" — within seconds, no rate-limit text
```

Capture outbound HTTP with mitmproxy / instrumented `https.get` and assert:

- 0 requests to `api.github.com/*` during version-check
- 0 requests to `raw.githubusercontent.com/*`
- ≥1 request to `libz-renlab-ai.github.io/TeamBrain/latest.json`
