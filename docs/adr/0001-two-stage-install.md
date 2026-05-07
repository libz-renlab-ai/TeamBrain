---
Status: proposed
Date: 2026-05-07
---

# Two-stage install: legacy substring immediate, vector model background upgrade

We install TeamAgent in two stages so that `teamagent init` returns in ~30 seconds with the legacy substring matcher and the universal avoidance pack already active and protecting the user, while the ~120 MB Xenova vector model downloads in the background and silently upgrades matching to BM25+dense RRF semantic ranking after approximately 10 minutes. This trades initial semantic-matching accuracy (substring matching is coarser and more prone to false negatives on paraphrased prompts) for a 20× faster time-to-first-interception, which is critical for the landing copy's 30-second-hook promise: a user who sees their first interception within seconds of install is far more likely to stay than one who waits through a multi-minute model download before anything happens.

## Considered Options

- **(a) Keep current single-stage install (~5–10 minutes including vector model download)** — Rejected. A 5–10 minute install window breaks the landing copy's core conversion claim ("see it work in 30 seconds"). Users who queue up a long install and walk away are unlikely to complete onboarding.
- **(b) Docker image** — Rejected. Docker introduces a persistent daemon model that is architecturally misaligned with TeamAgent's design as a Claude Code local-hook sidecar. It also adds heavy setup friction for developers who simply want hooks, not a container runtime.
- **(c) brew / apt packaging** — Rejected. Platform-specific packaging (Homebrew on macOS, apt on Debian/Ubuntu) is distro-specific, increases release logistics, and does not solve the underlying vector-model warmup time problem — the 120 MB model still needs to download regardless of how the CLI itself was installed.

## Consequences

- Documentation must be transparent that semantic matching (BM25+dense RRF) is not active immediately after `teamagent init`; users should be told to expect "smarter matching in ~10 minutes" rather than experiencing an unexplained quality improvement.
- The universal avoidance pack (`seed/packs/universal.jsonl`) **must use substring-friendly patterns** — literal keyword anchors such as `moment`, `/Users/`, `.env`, `rm -rf`, `hardcode` — so that the legacy matcher can produce reliable hits from the first session. Rules using only semantic paraphrases or vague descriptions will be silent until the vector model is ready.
- The background downloader must handle interrupted downloads gracefully (resume on restart) and must not block the main Claude Code session process.
