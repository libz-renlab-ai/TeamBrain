```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Issue #92 — Research notes (release/install.sh)                     │
 │                                                                      │
 │   spec ──────────► issue ──────────► research (this doc)             │
 │   landing-copy     #92 AC            release branch state,           │
 │   2026-05-07.md    list 9 items      POSIX sh patterns,              │
 │                                       README anchors,                 │
 │                                       CONVENTIONS.md tension          │
 │                                       (run-judge vs probe-feature)   │
 └──────────────────────────────────────────────────────────────────────┘
```

# Research — Issue #92: release/install.sh

## What the issue asks for

[Issue #92](https://github.com/libz-renlab-ai/TeamBrain/issues/92):

- File `release/install.sh` (POSIX sh, not bash-only) at repo root
- Verifies `node ≥ 22` and `pnpm`/`npm` available; refuses otherwise
- Runs `npm install -g https://github.com/libz-renlab-ai/TeamBrain/archive/refs/heads/release.tar.gz`
- Idempotent re-run upgrades cleanly
- Single one-liner CTA in README hero: `curl -fsSL .../release/install.sh | sh && teamagent init`
- `set -eu`, clear errors with exit codes
- No domain registration; URLs on `raw.githubusercontent.com`
- `docs/features/install-sh/run-judge.sh` returns exit 0
- `pnpm test` passes
- Listed in `docs/PRODUCT-FEATURES.md` as VERIFIED

## Spec context

`docs/specs/2026-05-07-landing-copy-actually-needed.md`:
- 决策 5 — two-stage install: `curl|sh` brings substring matcher + universal pack live in 30s; vector model upgrades in background.
- Hero markdown lines 265–290 (canonical Hero copy) ends with the `curl|sh && teamagent init` CTA — install.sh must satisfy that URL contract.

## Release branch state (`origin/release`)

- Latest commit: `0016b30` "release: 866cb9a..." — single force-pushed commit.
- 39 files: `dist/bin-*.cjs`, `dist/chunk-*.js`, 30 compiled JS chunks, `package.json`, `postinstall.mjs`, `release-meta.json`.
- **No `install.sh` on release branch yet.**
- Tarball URL `https://github.com/.../archive/refs/heads/release.tar.gz` ships built artifacts (already-installable npm package), not source.

## Release-publish pipeline

`.github/workflows/release-branch.yml:1-50` triggers on every push to `main`:
1. checkout, setup node 22, corepack enable, `pnpm install --frozen-lockfile`
2. `pnpm --filter teamagent build`
3. Stage to `/tmp/release-stage/`: dist/, package.json, postinstall.mjs, release-meta.json
4. `git init -q -b release`, force-push to release branch via `GITHUB_TOKEN`

→ To deploy `install.sh` to release branch root, add `cp release/install.sh /tmp/release-stage/install.sh` + `chmod 0755` to step 3.

## URL resolution clarification

`https://raw.githubusercontent.com/libz-renlab-ai/TeamBrain/release/install.sh` parses as:
- `<owner>=libz-renlab-ai`
- `<repo>=TeamBrain`
- `<ref>=release` (branch)
- `<file>=install.sh` (root of branch)

So `install.sh` MUST end up at root of `release` branch. The source-of-truth on `main` lives at `release/install.sh` (subdir on main); the workflow patch reconciles the two.

## POSIX sh patterns in the repo

**No existing POSIX sh.** All scripts use bash + `set -euo pipefail`:
- `scripts/setup-codex-cloud.sh:1-2` → `#!/usr/bin/env bash; set -euo pipefail`
- `scripts/bugreport-collect.sh:1, 19` → bash, `set -euo pipefail`
- `.codex/setup.sh:1-2` → bash, `set -euo pipefail`

Node version checks elsewhere are presence-only (`command -v node`), not semver. We must implement `node -v ≥ 22.x` parsing manually in POSIX sh.

POSIX-safe constructs to use: `command -v`, `[ ]`, `case`, `if`, `printf`, plain function syntax, `set -eu` (no `pipefail`).

POSIX-unsafe constructs to avoid: `[[ ]]`, `(( ))`, `local`, arrays `arr=(...)`, `==`, `set -o pipefail`.

## README hero anchor

`README.md:25-37` is the "5–10 分钟上手" section:
- Line 27: opening triple-backtick
- Line 29: current install command (`npm install -g <tarball>`)
- Line 31: `teamagent init`
- Line 33: `teamagent init --target=both`

Plus `README.md:39-40`: tarball-vs-`github:`-shorthand explanation. To preserve, move into `<details>` fallback block.

## CONVENTIONS.md tension

`docs/features/CONVENTIONS.md:43-52` deprecates `canned-answer-snippet.md` and prefers `verify-canned-answer.sh` + live `probe-feature.sh`. It does not explicitly require or forbid `run-judge.sh`. Issue #92 AC explicitly demands `docs/features/install-sh/run-judge.sh`. Five existing features already use `run-judge.sh` (`internet-rag`, `canned-answers`, `cursor-compiler`, `calibrator-v2`, `mcp-server`). Resolution: honor issue AC → use `run-judge.sh`; do NOT add `canned-answer-snippet.md`.

## Pattern to mirror

`docs/features/doctor-install/run-judge.sh:1-336` is the closest analogue:
- `set -euo pipefail` bash harness
- `RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"` + `EVIDENCE_DIR=tmp/.judge/<feature>/<run_id>`
- `exec > >(tee -a STDOUT_LOG) 2>&1`
- Multi-scenario blocks, each captures stdout/stderr/exit, computes `_PASS=true|false`
- Final `judge.json` via inline `node --no-warnings -e "…"` writing fixed schema
- Exit 0 only if `ALL_PASSED=true`

## Open questions resolved

| # | Question | Resolution |
|---|---|---|
| 1 | install.sh on `release` root vs `release/install.sh` on main? | **Both**: source on main; workflow copies to release branch root. |
| 2 | Auto-run `teamagent init` from install.sh? | **No** — preserve two-stage CTA per spec 决策 5. |
| 3 | Replace tarball CTA in README entirely? | **No** — keep as `<details>` fallback for offline / Windows / CI. |
| 4 | `run-judge.sh` vs `probe-feature.sh`? | **`run-judge.sh`** per issue AC. |
| 5 | Add new VERIFIED row to PRODUCT-FEATURES? | **Yes** (#60). Increment counts. |

## Risks logged in plan

- Workflow patch: minimal (single `cp` line), worst case is install.sh missing on release branch; existing artifacts unaffected.
- POSIX portability: judge scenario F runs script under `dash` to catch bashism leakage.
- Idempotency: `npm install -g <tarball>` upgrades in place; install.sh writes no external state.
- CDN propagation: `raw.githubusercontent.com` 5–10s lag — verify post-merge via real curl.
