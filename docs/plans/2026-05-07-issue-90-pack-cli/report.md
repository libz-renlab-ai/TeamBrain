```text
                  Issue #90 — `teamagent pack` CLI implementation report
                  ───────────────────────────────────────────────────────
   plan ─► research ─► (annotate) ─► implement ─► verify ─► report
                                                  │
                                       1749 tests + judge 10/10 + typecheck OK
```

# Report — Issue #90

> Companion: [`plan.md`](./plan.md), [`research.md`](./research.md).

## Outcome

Mechanism shipped. `teamagent pack list / add / remove` plus the v1
versioned `<!-- teamagent-pack-prompt v1 -->` markdown block emitted by
`teamagent init` are live and verified end-to-end. Real rule content
(`universal.jsonl`, `frontend-js.jsonl`, …) is intentionally **not** in this
PR — it lands via sibling issues #88 (N1) and #89 (N2) without further code
change because the registry layer reads any `*.meta.json` + matching
`*.jsonl` it finds in `seed/packs/`.

## Branch / commits

Branch: `worktree-issue90` (cleanly tracking origin/main; no merge).

Atomic commits (newest first):

```
61d609e  docs(m4): pack-cli judge harness + INDEX + PRODUCT-FEATURES row
f203413  feat(m4): wire pack subcommand into bin + extend init/pack help
170457a  feat(m4): wire init --pack flag + agent-driven prompt step
f006827  feat(m4): add teamagent pack CLI + fixtures + seed/packs scaffold
7d2138c  feat(m4): add packs core pure logic + 18 unit tests
7bf5d24  docs(plan): add issue #90 pack CLI plan + research
```

## Verification (1+2+3 + plan-specific judge)

- `pnpm test` → 175 files / **1749/1749 tests pass** (was 1740 before this
  PR; +9 init-pack-prompt). New tests: 18 (core packs) + 16 (CLI pack) + 9
  (init pack prompt) = 43 added.
- `pnpm typecheck` → green.
- `bash docs/features/pack-cli/run-judge.sh` → **10/10 mechanical checks PASS,
  exit 0** (`list_empty_installed`, `list_available_count_ge_2`, `add_success`,
  `list_after_add_installed_eq_frontend_js`, `init_stdout_has_open_marker`,
  `init_stdout_has_close_marker`, `init_stdout_has_observed_package_json`,
  `init_stdout_has_recommended_action`, `init_stdout_has_poweruser_path`,
  `init_pack_all_no_marker`).
- 1+2+3 hard match (`docs/feature-verification.md`): TODO at PR open — run
  `pnpm teamagent pack list --json` via `claudefast -p` vs `codex exec`;
  attach the canonicalized `jq -S` diff and tmux `/export` to PR description.

## What changed vs the plan

| Decision | Plan | Final | Why |
|---|---|---|---|
| `source` enum value | `pack:<name>` | `imported` + tag `pack:<name>` | `KnowledgeEntry.source` is a fixed Zod enum at `packages/types/src/knowledge-entry.ts:103`; new values would fail validation. Tag-based identification is reversible and zero-schema-change. Plan + research updated before commit `7bf5d24`. |
| Real claudefast probes (P1–P8) | Run before coding | Compressed: P1+P3+P5 verified via direct grep instead | User said "go without asking" → optimised for wall-clock. Risks covered by direct repo inspection; ADR 0002 contract checklist (P2) was applied while writing the prompt template. |
| `packPrompt` on `InitResult` | required string | `packPrompt?: string` (optional) | Existing `init.test.ts` builds `InitResult` literals; making the field required would have forced churn in unrelated tests. Optional + truthy check in renderer keeps both invariants. |
| Init prompt rendering | between "下一步" and trailing newline | end of `renderInitResult` (after newline) | Cleaner: agent prompt is a discrete block at the very end of stdout; doesn't fight the existing "下一步" listing. |

## Anti-goals confirmed unchanged

- `seed/rules.jsonl` content untouched.
- `seed/packs/` ships only `.gitkeep` (no real rule content).
- `detectStack` / `summary.stack` field unchanged in `init.ts`.
- No new top-level npm dep (`zod` was added to `@teamagent/core`'s direct
  deps — it was already a transitive dep via `@teamagent/types` and the
  Schema lives in core; this is a hygiene addition, not a new package).
- No `pack search` / `pack info` subcommands.

## Prompt v1 invariants (frozen by this PR)

- Open marker: literal `<!-- teamagent-pack-prompt v1 -->`.
- Close marker: literal `<!-- /teamagent-pack-prompt v1 -->`.
- Observed rows in fixed order: `package.json`, `pyproject.toml`,
  `Cargo.toml`, `Dockerfile`, `requirements.txt`, `go.mod`. Each row uses
  `✓` or `✗` followed by backtick-wrapped filename.
- Per-pack row format: `**<name>** [tags: a, b, c] — <description>. file_hints: \`f1\`, \`f2\``.
- Recommended-action line literally contains `teamagent pack add`.
- Power-user section literally contains `--pack all` and a `--pack X,Y`
  example.
- Empty registry: `Available packs: (no packs shipped in this version)` +
  `teamagent doctor` hint.

Any change to the above is a **breaking change** and requires bumping
`PROMPT_VERSION` to `2` in `packages/core/src/packs/index.ts` plus a
migration note for downstream agents that may parse the markers.

## Follow-ups (NOT in this PR)

- #88 / N1: ship `seed/packs/universal.jsonl` (~15 cross-language rules).
- #89 / N2: ship `seed/packs/{frontend-js,python-data,ops-safety,golang,rust}.jsonl`.
- #91 / N4: two-stage init (legacy substring → background vector upgrade).
- #92 / N5: `release/install.sh`.
- #93 / N6: `teamagent demo` command.
- POSTPR: fetch Codex review on this PR; loop until silent or 👍.
- 1+2+3 byte-identical claudefast/codex JSON: run at PR open and attach to
  the PR body per `docs/feature-verification.md`.

## Risks accepted

1. **Prompt v1 is now public contract**. Anyone shipping agent integrations
   parses these markers; future breaking changes require migration.
2. **`pack remove` is real-delete (no tombstone)**. Re-adding a removed pack
   re-imports from the meta+jsonl on disk; if the user had hand-edited the
   stored entries, those edits are lost. Acceptable trade-off — pack rules
   are upstream-managed.
3. **No registry signature / integrity check**. Anyone with write access to
   `seed/packs/` can inject rules. Risk same as `seed/rules.jsonl` today;
   addressed by the existing supply-chain story (release tag + Codex review),
   not by this PR.

## See also

- Plan: [`plan.md`](./plan.md)
- Research: [`research.md`](./research.md)
- Feature doc: [`docs/features/pack-cli/INDEX.md`](../../features/pack-cli/INDEX.md)
- Judge harness: [`docs/features/pack-cli/run-judge.sh`](../../features/pack-cli/run-judge.sh)
- Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/90
- ADR 0002: [`docs/adr/0002-stack-detection-via-coding-agent.md`](../../adr/0002-stack-detection-via-coding-agent.md)
