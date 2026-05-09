---
Status: accepted
Date: 2026-05-07
Revised: 2026-05-09 (issue #164: vector deps now default; long-running embedder daemon shares loaded model across hooks)
Implementation:
  - packages/teamagent/package.json (@xenova/transformers + onnxruntime-node now in `dependencies`; CLI install still ~3s, model download ≤5min in background)
  - release/install.sh (default = tarball only; the heavy npm download for vector deps now happens via npm's normal dependency resolution)
  - packages/teamagent/postinstall.mjs (vectorOptionalsInstalled detection retained as defensive fallback for post-install removal; Stage 2 always detached now)
  - packages/cli/src/bin-embedder.ts (NEW: long-running embedder daemon — issue #164 — loads model once, serves /embed via HTTP)
  - packages/cli/src/daemon-first-embedder.ts (NEW: hook-side wrapper that prefers daemon, falls back to in-process)
  - packages/cli/src/embedder-state.ts (NEW: state file at ~/.teamagent/.embedder-state.json — port + pid + members refcount)
  - packages/cli/src/warmup-state.ts (atomic state file; unchanged — gates between "downloading" and "ready")
  - packages/cli/src/bin-pre-tool-use.ts (legacy substring fallback when daemon down or state !== "ready"; unchanged behavior)
Verifier: docs/plans/2026-05-07-fix-install/judge.md (MD playbook), scripts/verify-real-install-30s.sh + scripts/verify-postinstall-detached.sh (evidence collectors)
Real install measured: 2.76s / 3.32s / 3.44s (3 runs, fresh cache, npm 10.9.4, --prefix=tmp + --cache=tmp; vector-deps download is npm-side and happens within the same install transaction)
---

# Two-stage install: CLI immediate, vector model background-loaded by long-running daemon

We install TeamAgent in two stages so that `npm install -g …` returns in **≤30 seconds** for the CLI (Stage 1), then a detached background process downloads the ~120 MB Xenova vector model + warms it up (Stage 2, ≤5 min). During Stage 2 the legacy substring matcher and universal avoidance pack are already active and protecting the user.

**As of issue #164 (2026-05-09)** the vector deps (`@xenova/transformers`, `onnxruntime-node`) ship in `dependencies` (no longer opt-in). To avoid the catastrophic per-hook cold-load tax (~3-4s and ~650MB RSS *every* PreToolUse), a long-running **embedder daemon** (`bin-embedder.cjs`) loads the model once and serves embeddings to short-lived hooks over HTTP on `127.0.0.1:<random-port>`. Hooks discover the daemon via `~/.teamagent/.embedder-state.json` and fall back gracefully to the legacy substring matcher when the daemon is unreachable.

## Why opt-in instead of detached background download (historical)

The original ADR §V1 proposed a `detached background download after install` so that the model would be ready ~10 minutes after a normal install. We initially measured that approach as broken when `@xenova/transformers` and `onnxruntime-node` were listed under `optionalDependencies` (npm 10 ignored `--omit=optional` for tarball installs). The 2026-05-07 revision moved the deps out of `package.json` entirely behind a `TEAMAGENT_INCLUDE_OPTIONAL=1` flag.

**As of 2026-05-09 (issue #164) we reverted to the original §V1 design**: vector deps live in `dependencies` again, so npm itself fetches them in Stage 1 (the install step). The model file (~120MB ONNX from HuggingFace) is downloaded by the detached `bin warmup` process in Stage 2 (post-install), which is independent of npm and runs in the background while the user's terminal is already free.

The reason the original revision rejected this: per-hook cold-load latency (3-4s × 650MB RSS × every PreToolUse) was unacceptable. The 2026-05-09 fix is **the long-running embedder daemon** (`bin-embedder.cjs`) — model loads once per machine, hooks talk to it over HTTP. Without the daemon, default-installing the deps would hang every Claude Code session.

## Considered Options

- **(a) Keep current single-stage install (~5–10 minutes including vector model download)** — Rejected. A 5–10 minute install window breaks the landing copy's core conversion claim ("see it work in 30 seconds"). Users who queue up a long install and walk away are unlikely to complete onboarding.
- **(b) Docker image** — Rejected. Docker introduces a persistent daemon model that is architecturally misaligned with TeamAgent's design as a Claude Code local-hook sidecar. It also adds heavy setup friction for developers who simply want hooks, not a container runtime.
- **(c) brew / apt packaging** — Rejected. Platform-specific packaging (Homebrew on macOS, apt on Debian/Ubuntu) is distro-specific, increases release logistics, and does not solve the underlying vector-model warmup time problem — the 120 MB model still needs to download regardless of how the CLI itself was installed.
- **(d) `optionalDependencies` + detached background warmup** — Considered but blocked. npm 10 ignores `--omit=optional` for tarball installs (verified: 51s wall-clock with `--omit=optional`, optionals still installed). Requires moving the optionals out of `package.json` entirely, which precludes the "auto background upgrade" UX.

## Consequences

- **Default behavior** (post #164): semantic matching is active out of the box for all users — no opt-in flag needed. Stage 1 install still fits in ≤30s because npm's tarball download is parallel and fast; the model warm-up (which dominates wall-clock) runs detached after Stage 1 returns.
- The universal avoidance pack (`seed/packs/universal.jsonl`) still uses substring-friendly patterns, retained as the bulletproof fallback when (a) Stage 2 warmup is mid-download (status="downloading") or (b) the embedder daemon is unreachable. Two-tier defense.
- `postinstall.mjs` retains `vectorOptionalsInstalled()` as a defensive gate for edge cases (manual `npm uninstall @xenova/transformers`, `--no-optional`, lockfile drift, mirror that strips deps). When deps unexpectedly absent, warmup is skipped cleanly.
- The embedder daemon (`bin-embedder.cjs`) is spawned lazily on `SessionStart` (fire-and-forget). One daemon per machine; sessions register/deregister via `/register` and `/shutdown` HTTP endpoints; idle-exit at 30 min when no sessions remain.
- HTTP socket binds to `127.0.0.1` only; no token auth in v1 (YAGNI for personal-machine scope; v2 may add token if needed for shared dev environments).
- A `teamagent install-vector` runtime opt-in command is no longer needed — superseded by the default-install route.
