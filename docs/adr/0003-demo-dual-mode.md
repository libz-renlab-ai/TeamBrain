---
Status: proposed
Date: 2026-05-07
---

# teamagent demo command ships in three modes: real-IDE, inline-hook-bin, and vhs-recording

`teamagent demo` (default) injects a fixture rule into a sandboxed `.teamagent/demo-{epoch}.db` and waits for the user's real Claude Code IDE to fire the PreToolUse hook against that fixture — this is the most authentic path and is what the landing copy's "see the red box in your IDE" promise describes, at the cost of requiring the user to be in a running IDE session. `teamagent demo --inline` spawns the real `bin-pre-tool-use.cjs` hook process with mock stdin and renders the stdout JSON as an ANSI red box, making it CI-safe, IDE-free, and exercising exactly the same hook code path; `teamagent demo --record demo.gif` generates a vhs tape describing the inline flow and auto-invokes vhs if it is on PATH, otherwise prints install instructions, keeping GIF generation deterministic and entirely out of the install-time dependency tree. The accepted trade-off is paying CLI surface area (one command with three modes rather than three separate commands) in exchange for satisfying three legitimate use cases — live user verification, CI automation, and maintainer GIF production — without forcing any path on users who only need one.

## Considered Options

- **(a) Inline-only** — Rejected. Misses the landing copy's "real IDE red box" promise; users evaluating locally want their actual Claude Code session to fire the hook, not a mocked subprocess.
- **(b) Real-IDE-only** — Rejected. A three-step user flow (launch IDE, switch windows, trigger tool) kills CI usability and makes deterministic GIF generation impossible in headless environments.
- **(c) Built-in screen recording (FFmpeg / Chromium-headless)** — Rejected. Adds 30 MB+ to the install footprint; IDE capture is platform-specific (Quartz on macOS, X11 on Linux, DWM on Windows); vhs already excels at terminal recording with ~5 MB overhead and is a far better building block than a custom recorder.
- **(d) Multiple subcommands `demo run` / `demo record` / `demo replay`** — Rejected. YAGNI; a single command with two flags suffices and matches the project's existing one-flag-changes-mode pattern (e.g., `teamagent stats --json`).

## Consequences

- Default real-IDE mode requires the user to have Claude Code running locally; `--inline` must be documented as the CI-safe fallback and used in all automated verification scripts.
- vhs is a maintainer dependency for refreshing the landing-page GIF, NOT an install-time dependency — this contract must hold to keep `teamagent init` lean.
- The fixture rule (`moment → dayjs`, conf 0.83, block) becomes the canonical demo example referenced by landing copy, README, and `docs/PRODUCT-FEATURES.md`; changing it requires updating all three together.
- `docs/landing/demo.tape` becomes maintained surface area; any update to the demo flow requires a matching tape update.
