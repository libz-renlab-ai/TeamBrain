```text
                  Issue #90 — `teamagent pack` CLI + init prompt
                  ────────────────────────────────────────────────
   ① plan ─► ② expected outputs ─► ③ how-to-verify ─► ④ claudefast probes
                                                              │
                                                              ▼
                                          research → annotate → implement
                                                              ▼
                                                report.md + verify
                                                              ▼
                                                      open normal PR
                                                              ▼
                                            POSTPR loop until 👍 / silent
```

# Plan — Issue #90

> Companion: [`research.md`](./research.md). Final report: `report.md`
> (written when implementation lands).

This plan follows the four-section template from
[`docs/HOWTO-PLAN-PR.md`](../../HOWTO-PLAN-PR.md): **task description**,
**expected outputs**, **how-to-verify (judge harness)**, **claudefast
probes (run BEFORE coding)**.

## ① Task description

### What we're doing

Build the **mechanism** that ADR 0002 (`stack-detection-via-coding-agent`)
demands: a `teamagent pack` CLI surface and a versioned stdout prompt that
`teamagent init` emits, so the user's Claude Code / Codex agent can choose
stack packs without TeamAgent hardcoding any stack detection.

Concretely:

1. New file `packages/cli/src/commands/pack.ts` exporting three subcommands:
   - `pack list [--json]` — list installed and available packs.
   - `pack add <names>` — install packs (comma-separated) into user-global store.
   - `pack remove <names>` — uninstall packs (deletes entries tagged with their pack source).
2. Pack registry layout under `packages/teamagent/seed/packs/`:
   - `<name>.jsonl` — `KnowledgeEntry[]` lines (same schema as `seed/rules.jsonl`).
   - `<name>.meta.json` — `{ name, description, tags[], file_hints[], prompt_version: 1 }`.
   - **Empty in this PR** (rule content lives in #88/#89). Ship `seed/packs/.gitkeep`
     and at least 2 fixture pack files **under `__tests__/fixtures/packs/`** for unit
     tests, not under `seed/packs/`.
3. Modify `packages/cli/src/commands/init.ts`:
   - Add `--pack <value>` flag where value is `all` or comma-separated names; when
     given, skip the stdout prompt and run `pack add` for the listed packs as a
     normal init step.
   - When no `--pack` flag is given, append a versioned markdown prompt to the
     `renderInitResult` output (between "下一步" section and the trailing newline)
     describing observed project files (raw `fs.existsSync` over a fixed list:
     `package.json` / `pyproject.toml` / `Cargo.toml` / `Dockerfile` /
     `requirements.txt` / `go.mod`) and listing available packs by reading
     `seed/packs/*.meta.json`.
4. Wire `pack` subcommand into the CLI bin entry next to `init`/`stats`/etc.
5. New judge harness `docs/features/pack-cli/run-judge.sh` (PASS/FAIL exit code 0/1).
6. Register feature row in `docs/PRODUCT-FEATURES.md` under
   `### CLI commands` (or new `### Pack management`) — exact ID assigned at
   commit time (≥ 60).

### How

- Functional Core / Imperative Shell: pure logic (parsing pack metadata,
  resolving names, computing prompt body, list-vs-add diffs) lives in
  `packages/core/src/packs/` (no fs / no child_process); IO + render lives in
  `packages/cli/src/commands/pack.ts`.
- Reuse `SqliteKnowledgeStore` for inserts/deletes. Pack-installed entries reuse
  the existing `source: "imported"` enum value (the Zod enum in
  `packages/types/src/knowledge-entry.ts:103` is fixed and we don't bump schema
  in this PR) and identify their pack via a tag `pack:<name>` in `tags[]`.
  `pack remove <name>` filters by `tags.includes("pack:<name>")` and deletes.
- Reuse `cwdFilePresence` from existing init.ts for file-presence observation
  (do **not** call `detectStack`).
- Pack file resolution mirrors `resolveSeedPath`: walk up `import.meta.url`
  looking for `dist/seed/packs/` (bundled) or `packages/teamagent/seed/packs/`
  (dev). Test injects `packsDir` directly.
- `init --pack X,Y` bypasses prompt and emits a `load-pack` step in
  `result.steps` listing what got added, mirroring `load-seed`.
- TDD: write contract test for the prompt format (anchor markers + ordered
  fields) **first**, watch it fail, then implement.

### What we're NOT doing

| Out of scope | Belongs to |
|---|---|
| Real rule content for `universal.jsonl` | #88 (N1) |
| Real rule content for `frontend-js.jsonl` / `python-data.jsonl` / `ops-safety.jsonl` / `golang.jsonl` / `rust.jsonl` | #89 (N2) |
| Two-stage init (legacy substring → background vector) | #91 (N4) |
| `release/install.sh` | #92 (N5) |
| `teamagent demo` command | #93 (N6) |
| Stack auto-detection / inference | rejected by ADR 0002 |
| Replacing existing `detectStack` in `core` | preserved as-is |
| `pack search`, `pack create`, `pack info` subcommands | not in issue acceptance criteria |
| New CLI parser dependency (commander.js etc.) | manual loop matches existing style |
| Changing prompt schema after this PR ships | becomes API contract; future change requires `prompt_version: 2` and migration plan |

## ② Expected outputs

Reviewer-checkable artefacts. Each item below maps to a specific check at
review time.

### 2.1 New / modified files

| Path | Change |
|---|---|
| `packages/cli/src/commands/pack.ts` | **NEW** — `executePackList` / `executePackAdd` / `executePackRemove` + `parsePackArgs` + `renderPackResult` + bin glue |
| `packages/core/src/packs/index.ts` | **NEW** — pure logic: parse meta, render prompt, diff installed vs available |
| `packages/core/src/packs/__tests__/packs.test.ts` | **NEW** — unit tests for pure logic |
| `packages/cli/src/__tests__/pack.test.ts` | **NEW** — CLI integration tests (uses fixture `packsDir`) |
| `packages/cli/src/__tests__/fixtures/packs/frontend-js.{jsonl,meta.json}` | **NEW** — minimal fixture (1 placeholder rule) |
| `packages/cli/src/__tests__/fixtures/packs/ops-safety.{jsonl,meta.json}` | **NEW** — minimal fixture (1 placeholder rule) |
| `packages/cli/src/commands/init.ts` | **MODIFIED** — `--pack` flag, append-prompt render path; ≤ 50 lines added |
| `packages/cli/src/__tests__/init-pack-prompt.test.ts` | **NEW** — assert prompt markers + ordered observed-files + available-packs lines |
| `packages/cli/src/bin.ts` (or current bin entry) | **MODIFIED** — register `pack` subcommand |
| `packages/teamagent/seed/packs/.gitkeep` | **NEW** — empty dir scaffold |
| `docs/features/pack-cli/INDEX.md` | **NEW** — short feature doc with verification links |
| `docs/features/pack-cli/run-judge.sh` | **NEW** — judge harness, exit 0 on PASS |
| `docs/PRODUCT-FEATURES.md` | **MODIFIED** — one row added under CLI / Pack management |
| `docs/plans/2026-05-07-issue-90-pack-cli/report.md` | **NEW** — written at end |

### 2.2 CLI / behaviour contracts

```
$ pnpm teamagent pack list
Installed packs: (none)
Available packs (2):
  - frontend-js [web, react, typescript] — frontend JS/TS avoidance rules
  - ops-safety  [ops, deploy, secrets]   — production / deploy safety rules

$ pnpm teamagent pack list --json
{
  "installed": [],
  "available": [
    { "name": "frontend-js", "tags": ["web","react","typescript"], "description": "...", "file_hints": ["package.json","tsconfig.json"], "prompt_version": 1 },
    { "name": "ops-safety",  "tags": ["ops","deploy","secrets"],   "description": "...", "file_hints": ["Dockerfile",".env"],            "prompt_version": 1 }
  ]
}

$ pnpm teamagent pack add frontend-js,ops-safety
✅ Installed 2 packs (5 rules added; 0 skipped, 0 failed)

$ pnpm teamagent pack add does-not-exist
❌ Unknown pack: "does-not-exist". Run `teamagent pack list` to see available packs.
(exit 1)

$ pnpm teamagent pack remove frontend-js
✅ Removed pack "frontend-js" (3 rules deleted)
```

`teamagent init` stdout (after the standard "下一步" section) includes the
versioned markdown block specified in `research.md`.

### 2.3 Prompt-format invariants (frozen by this PR)

- Marker `<!-- teamagent-pack-prompt v1 -->` opens the block.
- Marker `<!-- /teamagent-pack-prompt v1 -->` closes the block.
- Six fixed `Observed` rows in this exact order: `package.json`, `pyproject.toml`,
  `Cargo.toml`, `Dockerfile`, `requirements.txt`, `go.mod`.
- Each pack row format: `**<name>** [tags: a, b, c] — <description>. file_hints: \`...\`, \`...\``
- CTA line literally contains `teamagent pack add` (so judge harness can grep).
- Power-user paths section literally contains `--pack all` and `--pack X,Y`.

### 2.4 Test gate

- `pnpm test` green.
- `pnpm typecheck` green.
- `bash docs/features/pack-cli/run-judge.sh` exit 0.

### 2.5 Anti-goals (must NOT change)

- `packages/teamagent/seed/rules.jsonl` content unchanged.
- `packages/teamagent/seed/packs/` ships **empty** (only `.gitkeep`); no real
  rule content committed.
- `detectStack` / `doDetectStack` / `summary.stack` field unchanged.
- No new top-level npm dependency.
- No changes to other commands' output (idempotency check via `pnpm test`).

## ③ How-to-verify (third-party judge harness)

Two layers per `docs/HOWTO-PLAN-PR.md` § 3.

### 3a. Project-wide 1+2+3 gate (`docs/feature-verification.md`)

Module under test: `teamagent pack`.

1. `!claudefast -p "run \`pnpm teamagent pack list --json\` and emit the
   parsed JSON object as canonical JSON"` → write `evidence/cf.json`.
2. `!codex exec --skip-git-repo-check -s read-only "<same prompt>"` → write
   `evidence/codex.json`.
3. `jq -S . evidence/cf.json > a.json && jq -S . evidence/codex.json > b.json
   && diff -u a.json b.json` — must be byte-identical.
4. tmux interactive `claudefast` session running the same prompt, ending with
   `/export evidence/export.txt` → attach `export.txt` to PR description.

### 3b. Plan-specific judge harness — `docs/features/pack-cli/run-judge.sh`

**RUN** (deterministic shell):

```bash
TMP=$(mktemp -d)
PACKS_DIR="${TMP}/seed-packs"
HOME_DIR="${TMP}/home"
cp -R packages/cli/src/__tests__/fixtures/packs "${PACKS_DIR}"
mkdir -p "${HOME_DIR}/.teamagent"

# A. pack list against fixture registry
TEAMAGENT_PACKS_DIR="${PACKS_DIR}" \
  HOME="${HOME_DIR}" \
  pnpm --silent teamagent pack list --json > "${EVIDENCE_DIR}/list.json"

# B. pack add then list
TEAMAGENT_PACKS_DIR="${PACKS_DIR}" \
  HOME="${HOME_DIR}" \
  pnpm --silent teamagent pack add frontend-js > "${EVIDENCE_DIR}/add.txt"
TEAMAGENT_PACKS_DIR="${PACKS_DIR}" \
  HOME="${HOME_DIR}" \
  pnpm --silent teamagent pack list --json > "${EVIDENCE_DIR}/list-after-add.json"

# C. init in temp project, no --pack flag → stdout contains prompt block
PROJ=$(mktemp -d) ; touch "${PROJ}/package.json"
TEAMAGENT_PACKS_DIR="${PACKS_DIR}" \
  HOME="${HOME_DIR}" \
  pnpm --silent teamagent init --skip-import --skip-hook --skip-warmup \
    --cwd "${PROJ}" > "${EVIDENCE_DIR}/init-stdout.txt"

# D. init --pack all bypasses prompt
TEAMAGENT_PACKS_DIR="${PACKS_DIR}" \
  HOME="${HOME_DIR}" \
  pnpm --silent teamagent init --skip-import --skip-hook --skip-warmup \
    --cwd "${PROJ}" --pack all > "${EVIDENCE_DIR}/init-pack-all.txt"
```

**DUMP** (`judge.json`):

```json
{
  "run_id": "...",
  "exit_code": 0,
  "checks": {
    "list_empty_installed":     true,
    "list_available_count_ge_2": true,
    "add_success_count_eq_1":    true,
    "list_after_add_installed_eq_frontend_js": true,
    "init_stdout_has_open_marker":  true,
    "init_stdout_has_close_marker": true,
    "init_stdout_has_observed_package_json": true,
    "init_stdout_has_recommended_action": true,
    "init_pack_all_no_marker": true
  },
  "evidence_dir": "...",
  "stdout_path": "..."
}
```

**READ**: a separate `claudefast -p "read judge.json and evidence/* and grade
PASS/FAIL with one-paragraph justification"` invocation. Code under test does
not grade itself.

(Anchors used by mechanical grep are listed in 2.3 above so the judge harness
checks are in lock-step with the rendered prompt.)

## ④ Claudefast probes — run BEFORE coding

Per `docs/HOWTO-PLAN-PR.md` § 4 / `docs/FASTPROBE.md`. **Plan author runs
these before opening the PR**; outputs land in `.fastprobe/issue-90/`.

### 4.1 Orient (already done at plan time)

- `claudefast -h | head -80` — confirms current flag list. ✓ Run during plan
  research; logged in research.md (`claudefast` is the standard CLI).

### 4.2 Parallel probes (≤ 8) — run sequentially or in parallel before coding

| # | Prompt | Why |
|---|---|---|
| P1 | "Read packages/cli/src/commands/init.ts and list every CLI flag currently parsed by parseInitArgs with file:line." | Confirm new `--pack` flag won't collide; lock parser-edit surface. |
| P2 | "Read docs/adr/0002-stack-detection-via-coding-agent.md and list every contract requirement (numbered) the init stdout prompt must satisfy." | Lock contract checklist before writing prompt template. |
| P3 | "Search the repo for the source enum value range used in KnowledgeEntry. Confirm 'pack:<name>' as a new value does not collide with 'preset' / 'imported' / 'derived' / etc. Cite file:line." | Avoid scope/source collisions when inserting pack rules. |
| P4 | "Read packages/cli/src/__tests__/first-run.test.ts and m4a-e2e.test.ts; summarize their setup pattern (tmp homeDir, dryRun, injection points) in 5 bullets." | Lock test scaffolding pattern so pack.test.ts matches house style. |
| P5 | "List any open PR or branch in libz-renlab-ai/TeamBrain with 'pack' or 'seed/packs' in title or diff." | Avoid duplicate work + spot conflicting in-flight changes. |
| P6 | "Read docs/feature-verification.md and produce the exact JSON shape the {MODULE} --help output must use for a new CLI subcommand. Cite section." | Lock the canonical JSON schema for `pack list --json` so 1+2+3 gate hard-matches. |
| P7 | "List every file under docs/features/*/run-judge.sh and summarize the common 'judge.json' field set actually emitted (intersection across files)." | Lock judge.json schema before writing pack-cli/run-judge.sh. |
| P8 | "Read packages/teamagent/seed/rules.jsonl first 3 lines and confirm KnowledgeEntry field set (especially 'source', 'scope', 'category'); list any field a pack-imported entry must populate to satisfy SqliteKnowledgeStore.add validation." | Avoid runtime insert errors when migrating fixture entries. |

Probes P1–P8 are independent; run via 8-way `xargs -P 8` (or 8 separate
backgrounded shells) to keep wall-clock low. Audit-grade outputs that will be
cited in PR body get the stream-json variant per `docs/FASTPROBE.md`:

```bash
claudefast -p \
  --output-format stream-json \
  --include-partial-messages \
  --verbose \
  --debug hooks \
  --debug-file .fastprobe/issue-90/<probe>.debug.log \
  --permission-mode acceptEdits \
  "<prompt>"
```

### 4.3 Hard rules

- Never run `claudefast -p` with only flags (always pass a prompt).
- No `--bare`.
- Token always rendered as `[redacted]` in plan / commits / PR description.
- For PR-time conflict resolution, follow `FASTPROBE about PR+conflict
  resolve` (classify merge / Codex-review / rule-doc; resolve on PR branch;
  never reset / force-push `main`).

## After PR opens — POSTPR loop

Per `docs/POSTPR.md`:

```
PR opened
  → CI + Codex review
  → conflict? classify (merge / Codex-review / rule-doc) and fix on PR branch
  → rerun pnpm test + pnpm typecheck + 1+2+3 gate
  → push same branch
  → fetch Codex review:
      env -u GITHUB_TOKEN gh api repos/libz-renlab-ai/TeamBrain/pulls/<n>/comments \
        --jq '.[] | select(.user.login=="chatgpt-codex-connector[bot]") | {body, path, line}'
  → triage by P1/P2/P3; P1 + P2 fix-before-merge unless explicit punt + follow-up issue
  → loop until CI green AND no conflict AND Codex 👍 / silent
```

Cross-link to #88 / #89 in PR body so reviewers know rule content lands later.

## Quick checklist (paste into PR description)

```
- [ ] plan.md committed at docs/plans/2026-05-07-issue-90-pack-cli/plan.md
      (task description / expected outputs / judge harness)
- [ ] research.md committed
- [ ] fastprobe outputs under .fastprobe/issue-90/ (P1–P8) — at least P2 + P3
      cited in PR body for ADR contract evidence
- [ ] new files: pack.ts / packs core / pack tests / fixtures / run-judge.sh
- [ ] init.ts diff ≤ 50 lines added
- [ ] seed/packs/.gitkeep only (no real rule content — that's #88 / #89)
- [ ] prompt invariants (markers / 6 observed rows / CTA / power-user) verified
      by init-pack-prompt.test.ts
- [ ] pnpm test + pnpm typecheck green
- [ ] docs/features/pack-cli/run-judge.sh exit 0
- [ ] PRODUCT-FEATURES.md row added (next-available ID)
- [ ] 1+2+3 verification: claudefast / codex exec / tmux /export attached
- [ ] non-draft PR opened against main
- [ ] cross-link to issues #88 / #89 in PR body
- [ ] POSTPR loop scheduled — fetch Codex inline comments on first green CI
- [ ] report.md drafted at PR open
```

## See also

- `research.md` (this dir) — context dump and prior-art survey.
- `docs/HOWTO-PLAN-PR.md` — 4-section plan template.
- `docs/feature-verification.md` — 1+2+3 gate.
- `docs/FASTPROBE.md` — claudefast probe recipe.
- `docs/POSTPR.md` — Codex review loop.
- `docs/adr/0002-stack-detection-via-coding-agent.md` — agent-driven detection contract.
- `docs/specs/2026-05-07-landing-copy-actually-needed.md` — decision 6 / N3.
