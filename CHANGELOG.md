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

### Fixed

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
