# TeamBrain CHANGELOG

```
   plan ──► implement ──► review ──► ship
                          │
                          ▼
                    CHANGELOG entry
```

User-visible behaviour changes go here. Internal refactors that don't change
observable behaviour (CLI flags, file layouts, hook side-effects, on-disk
artifacts the user sees) do NOT need an entry.

## Unreleased

## 0.11.0 — 2026-05-09

Closes the three follow-ups captured in PR #232 § 8 ("Follow-up captured for next major version") via one bundled cleanup PR. See `docs/plans/2026-05-09-install-hook-cleanup-v0.11/plan.md` for the full scope decision.

### Deprecated

- **`teamagent install-user-hook` is now a soft-retire shim**. The
  command body is reduced to a thin wrapper around the shared
  `applyUserLevelChannelOps` helper added in this PR; the deprecation
  warning is updated to mention the new helper name. The standalone
  command remains functional through the v1.0 deprecation window because
  `packages/teamagent/postinstall.mjs:365` still calls it directly during
  every `npm install -g teamagent` — hard-deletion is the v1.0 cut.

### Fixed

- **In-TeamBrain double-tap on Stop hook eliminated**. Pre-v0.11 the
  TeamBrain repo's committed `.claude/settings.json` registered both a
  `digital-twin-tap.sh` bash wrapper AND `bin-digital-twin-tap.cjs`
  (user-level via `teamagent init`), so every Stop event spawned the
  digital-twin tap twice. `tapSession()`'s `(cwd, session_id)` idempotency
  dedup'd the database write, but the wasted process spawns and file
  reads (~50ms per Stop) added up. v0.11.0 drops the `.sh` wrapper and
  collapses to the `.cjs` user-level path alone — net 1 spawn per Stop
  in TeamBrain (previously 2) and unchanged in other projects (still 1).
- **Issue #158**: `npm i -g github:libz-renlab-ai/TeamBrain#release` no longer
  fails on Windows + destroys the user's prior teamagent install. The 3
  tree-sitter native deps (`web-tree-sitter`, `tree-sitter-typescript`,
  `tree-sitter-python`) have been removed from `packages/teamagent/package.json`
  entirely — their install scripts spawn `cmd.exe` during npm reify and abort
  with `ENOENT`, which left users with no teamagent at all because npm reify
  removes the prior package before downstream install scripts run.
  `packages/core/src/matcher/legacy/ast-context.ts:initAstMatcher` already had
  a try/catch fallback returning false → "conservative mode" (matcher does NOT
  filter comment/string false-positives), so removing the deps degrades match
  precision but does not break functionality. `postinstall.log` gains a new
  positive `stage=ast-matcher status=skipped reason=tree-sitter-deps-absent`
  line — symmetric to #160 `vector-deps-absent` — so doctor and bug-report
  tooling can distinguish "skipped on purpose" from "ast-matcher never
  reached." Users wanting AST-precise filtering can opt back in:
  `npm install -g teamagent web-tree-sitter@^0.26 tree-sitter-typescript@^0.23 tree-sitter-python@^0.23`.
  Defense-in-depth install-time backup + rollback in `release/install.sh`
  guards against future analogous failures (any cause). (#158)
- **Issue #160**: `teamagent warmup` now exits 0 with a friendly skip message
  when the optional vector deps (`@xenova/transformers` + `onnxruntime-node`)
  are not installed, instead of exit 1 with a misleading "warmup failed"
  error. The state file (`~/.teamagent/.warmup-state.json`) records
  `status="skipped"` rather than `status="failed"`, and the postinstall log
  (`~/.teamagent/postinstall.log`) gains a positive
  `stage=warmup status=skipped reason=optional-not-installed` line so doctor
  and bug-report tooling can distinguish "skipped on purpose" from "warmup
  never reached." `teamagent doctor` reports `vector_model: skip` (not
  `fail`) for the same state.
- **Issue #161**: hooks fired from a sub-directory now correctly resolve to
  the project root's `.teamagent/knowledge.db` via walk-up. Previously
  `findTeamagentRoot` was missing entirely and every hook entry hard-coded
  `path.join(cwd, ".teamagent", "knowledge.db")`, so the project DB was
  invisible from any child cwd. (#181)

### Changed

- `teamagent init` now writes hooks to user-level `~/.claude/settings.json`
  by default, so Claude Code launched from any cwd triggers TeamAgent. Use
  `--no-user-level-hook` to opt out and keep the previous project-level-only
  behaviour. (#181)
- `teamagent init` from a sub-directory of an already-initialized project
  refuses by default to avoid creating duplicate `.teamagent/` state. The
  init step `nested-init-guard` reports the detected ancestor and the user
  is told to `cd` to the project root or pass `--force-nested-init` to
  override. (#181)
- Hook bundles are now staged to `~/.teamagent/hooks/` before being
  referenced from `~/.claude/settings.json`, so worktree cleanup, npm
  reinstalls, nvm version switches, and last-init-from-a-different-project
  no longer break user-level hooks across every project on the machine. The
  `~/.claude/settings.json` PreToolUse / PostToolUse / UserPromptSubmit /
  Stop commands point at `~/.teamagent/hooks/bin-*.cjs` instead of at a
  transient `node_modules/.../dist/` path. (#181)
