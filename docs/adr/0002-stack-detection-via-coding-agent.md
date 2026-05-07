---
Status: proposed
Date: 2026-05-07
---

# Stack pack detection delegated to the user's coding agent

Instead of shipping hardcoded stack detection inside `teamagent` (parsing `package.json`, `pyproject.toml`, `Dockerfile`, etc. to guess "this is a React project"), `teamagent init` prints a structured markdown prompt to stdout that describes the project files it observed and lists the available packs with their descriptions and tag sets; the user's Claude Code or Codex agent reads this prompt and selects which packs to install by running `teamagent pack add frontend-js,ops-safety` (or similar). The rationale is that LLM agents are already excellent at reading project structure and matching it against tagged options — they handle polyglot repositories, monorepos, and unconventional setups better than any hand-written heuristic — while hardcoded detection is brittle in precisely the edge cases that matter most and creates a continuous maintenance treadmill as ecosystems evolve.

## Considered Options

- **(a) Hardcoded detection inside teamagent** — Rejected. Parsing `package.json` to infer "React + TypeScript" sounds simple but degrades badly in polyglots (Python backend + JS frontend + Rust WASM in one repo), in workspaces where the root `package.json` is just a workspace config, and when new ecosystems emerge. False detections are worse than no detection because they install irrelevant rules that generate false-positive interceptions, eroding user trust.
- **(b) One giant pack with everything** — Rejected. A single all-language pack would include rules targeting idioms from unrelated stacks (e.g., a Python-only project would receive rules about `npm audit fix --force` or Go module pinning). Cross-language false positives damage the precision metrics that are a core trust anchor in the landing copy.
- **(c) Explicit `--pack X,Y` flag only, no prompting** — Rejected. Requiring the user to read a pack list before getting any value adds a friction step that competes with the 30-second-hook promise. Most users will skip pack selection entirely and use only the universal pack, forgoing relevant protections.

## Consequences

- The stdout prompt format printed by `teamagent init` becomes an **API contract**: once shipped, Claude Code and Codex agents will parse it programmatically (matching against pack `tags`, `description`, and `file_hints` fields). Any field rename or structural change is a breaking change and must be versioned (e.g., a `prompt_version` header in the output).
- Power users who do not run through a coding agent still have `--pack all` (install every available pack) and `--pack X,Y` (explicit comma-separated list) as non-agent paths; these must be documented in `teamagent init --help`.
- The pack registry (`seed/packs/`) must include machine-readable metadata per pack (tags, description, representative file hints such as `package.json`, `pyproject.toml`, `go.mod`) so the agent has enough signal to make an informed choice without needing to fetch external documentation.
