```text
                    teamagent pack — stack pack management
                    ──────────────────────────────────────
   pack list ◄── meta.json     pack add ──► seed/packs/<name>.jsonl
                                 │              │
                                 ▼              ▼
                          fs.existsSync       SqliteKnowledgeStore
                          observed files      tags=["pack:<name>"]

   teamagent init (no --pack)
        │
        ▼
   <!-- teamagent-pack-prompt v1 --> markdown block
        │
        ▼
   user's coding agent (Claude Code / Codex) reads, decides, runs
   `teamagent pack add frontend-js,ops-safety`
```

# Feature: `teamagent pack` CLI + agent-driven init prompt

Implements ADR 0002 (`docs/adr/0002-stack-detection-via-coding-agent.md`):
TeamAgent does **not** auto-detect stacks. Instead, `teamagent init` emits a
versioned markdown prompt describing observed project files and the available
pack registry; the user's coding agent (Claude Code / Codex) reads the prompt
and runs the appropriate `teamagent pack add` invocation.

Sibling issues that fill this in with real rule content:

- [#88](https://github.com/libz-renlab-ai/TeamBrain/issues/88) — `seed/packs/universal.jsonl` (~15 cross-language avoidance rules)
- [#89](https://github.com/libz-renlab-ai/TeamBrain/issues/89) — `seed/packs/{frontend-js,python-data,ops-safety,golang,rust}.jsonl`

This feature only ships the **mechanism** (CLI + meta schema + prompt
contract). Real pack content lands in those PRs.

## CLI surface

```
teamagent pack list [--json]      list installed + available packs
teamagent pack add <names>        e.g. pack add frontend-js,ops-safety
teamagent pack remove <names>     deletes entries tagged pack:<name>

teamagent init                    appends v1 prompt block (no --pack)
teamagent init --pack all         install every available pack, no prompt
teamagent init --pack X,Y         install listed packs, no prompt
```

Pack registry layout (under `packages/teamagent/seed/packs/` once issues
#88/#89 land — empty `.gitkeep` in this PR):

```
seed/packs/<name>.jsonl       # KnowledgeEntry[] (one per line)
seed/packs/<name>.meta.json   # { name, description, tags[], file_hints[], prompt_version: 1 }
```

Pack rules are written into the user-global store (`~/.teamagent/global.db`)
with `source: "imported"` and a `tags: ["pack:<name>", ...]` marker. `pack
remove <name>` filters by that marker tag and deletes the matching entries.

## Prompt contract (v1, frozen)

Open marker: `<!-- teamagent-pack-prompt v1 -->`
Close marker: `<!-- /teamagent-pack-prompt v1 -->`

Six observed files in fixed order: `package.json`, `pyproject.toml`,
`Cargo.toml`, `Dockerfile`, `requirements.txt`, `go.mod`. Each row
displays `✓` (present) or `✗` (absent).

Per-pack row format: `**<name>** [tags: a, b, c] — <description>. file_hints: \`f1\`, \`f2\``.

The recommended-action line literally contains `teamagent pack add`. The
power-user section literally contains `--pack all` and `--pack X,Y`.

Any change to markers, observed-file ordering, or section field names is a
**breaking change** and requires bumping `PROMPT_VERSION` in
`packages/core/src/packs/index.ts`.

## Verification

- Unit: `pnpm test packages/core/src/packs/__tests__/packs.test.ts`
- Unit: `pnpm test packages/cli/src/__tests__/pack.test.ts`
- Integration: `pnpm test packages/cli/src/__tests__/init-pack-prompt.test.ts`
- Judge harness: `bash docs/features/pack-cli/run-judge.sh (utility, retained per docs/legacy/judge-scripts/README.md exemption)`
- Verification per `docs/feature-verification.md`: `claudefast -p` runs
  `pnpm teamagent pack list --json` and the canonical JSON is diffed against
  `snapshots/pack-list.canonical.json` via `jq -S` (byte-identical).

## See also

- `docs/adr/0002-stack-detection-via-coding-agent.md` — agent-driven detection
- `docs/specs/2026-05-07-landing-copy-actually-needed.md` — decision 6 (N3)
- `docs/plans/2026-05-07-issue-90-pack-cli/{plan,research,report}.md`
