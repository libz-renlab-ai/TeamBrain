```
   issue #284 grill  ──►  pick slice 1  ──►  required-check + init wiring
       │                       │                       │
       ▼                       ▼                       ▼
   gstack-style          Vertical: ship a          Slice 2 (next PR):
   Claude repo           merge-worthy MVP          CLAUDE.md block,
   enforcement           that exists, can          settings.json
                         exit non-zero, and        PreToolUse merge
                         is wired by init
```

# research.md — issue #284 implementation map

Ground truth for relevant code paths in the TeamBrain monorepo as of `worktree-issue-284` (HEAD = `50d21ac7`, slice 1 of #332 just merged).

Issue: https://github.com/libz-renlab-ai/TeamBrain/issues/284
Grill (2026-05-11): https://github.com/libz-renlab-ai/TeamBrain/issues/284#issuecomment-... (`GRILL result for #284`)

## 1. `teamagent init`

- Source: `packages/cli/src/commands/init.ts` (1757 lines, 62 KB).
- Exports: `executeInit(opts)`, `parseInitArgs(args)`, `renderInitResult(result)`.
- Currently writes:
  - `.teamagent/` dir + knowledge DB (`db.sqlite`).
  - Meta-principles seed into KB.
  - LLM-driven rule import (skippable).
  - `installHook()` writes project-level `.claude/settings.local.json` (+ user-level `~/.claude/settings.json`).
  - `executeCompile()` exports Skills (`~/.claude/skills/teamagent/...`).
- Flags: `--dry-run`, `--skip-import`, `--skip-hook`, `--skip-seed`, `--skip-warmup`, `--install-plugins`, `--target=claude|codex|both`, `--pack`, `--no-user-level-hook`, `--force-nested-init`, `--cwd`, `--home`.
- CLI registration: `packages/cli/src/bin.ts:495` `case "init"`.

## 2. `m5-infect`

- Source: `packages/cli/src/commands/m5-infect.ts` (220 lines).
- Exports: `runM5Infect`, `parseM5InfectArgs`, `renderM5InfectResult`.
- Writes `.githooks/` via `FsBootstrap.applyInfection()`, sets `git config core.hooksPath .githooks`.
- Grill says: emit a one-line deprecation banner pointing at `teamagent init .`. Do NOT hard-delete.
- CLI registration: `packages/cli/src/bin.ts:262`.

## 3. CLAUDE.md managed-block writer

- Source: `packages/core/src/compiler/markdown.ts:8-9, 233-258`.
- Marker pair: `BLOCK_START = <!-- TEAMAGENT:START - 自动管理，请勿手动编辑 -->`, `BLOCK_END = <!-- TEAMAGENT:END -->`.
- Function `injectBlockIntoDoc(existing, block)` replaces/appends an EXISTING marker pair only — does NOT support multiple block kinds in one file.
- Grill asks for a DIFFERENT marker pair (`TEAMAGENT:REQUIRED:START` / `TEAMAGENT:REQUIRED:END`). Implementing that needs either a parameterized version of `injectBlockIntoDoc` or a second copy. **Deferred to slice 2** to keep slice 1 mergeable.

## 4. `.claude/settings.json` writer

- Source: `packages/cli/src/commands/install-hook.ts`.
- Export: `installHook({ projectRoot, target, userLevel, ... })`.
- Pattern: deep-merges hook channels under `hooks.PreToolUse[]` etc., dedups by `_teamagentTag`, atomic write.
- Already adds compiled `bin-pre-tool-use.cjs` PreToolUse entry. Adding a SECOND PreToolUse entry that invokes `.claude/hooks/check-teamagent.sh` would require a new channel + new `_teamagentTag`. **Deferred to slice 2.**

## 5. Existing repo hook scripts

- Project-level shell hooks at `.claude/hooks/`:
  - `self-report-fused.sh` (Stop hook, JSON-on-stdout pattern).
  - `newsboard-session-start.sh` (SessionStart hook).
- No reference PreToolUse `.sh` script exists yet. The PreToolUse hook is currently the compiled `bin-pre-tool-use.cjs` bundle.
- This issue introduces the FIRST `.sh` PreToolUse script. Slice 1 writes the script via init but does NOT yet wire it into `.claude/settings.json`.

## 6. Existing health-check command

- `packages/cli/src/commands/doctor.ts` (46 KB, very comprehensive).
- `executeDoctor()` verifies hook bundles, settings.json validity, DB integrity, embedding warmup, sqlite-vec load, legacy block cleanup.
- The grill says `required-check` is a SEPARATE command — narrower contract, hook-safe (must not write, must exit fast). Implementing it as a thin wrapper over a subset of doctor checks vs. its own logic: choosing **its own logic** (smaller surface, hook-safe, no DB access). Slice 1 builds it standalone.

## 7. CLI command registry

- `packages/cli/src/bin.ts` (1386 lines).
- Pattern: top-level imports per command file, then `switch (cmd)` dispatch in `main()`.
- `case "init"` at line 495; `case "doctor"` at line 1084; `case "m5-infect"` at line 262.

## 8. Test patterns

- Vitest, mkdtempSync, manual fs ops.
- Mirror: `packages/cli/src/__tests__/init.test.ts` and `packages/cli/src/__tests__/compile.test.ts`.

## 9. Atomic-write helpers

- No central `safeWriteFile`. Pattern is `fs.writeFileSync(tmp); fs.renameSync(tmp, dest)`.
- For idempotent writes I'll write a local helper in slice 1 (`writeManagedFile(path, content)`) that:
  - Read-if-exists.
  - Diff bytes; if identical, return `{ written: false, path }`.
  - Else atomic-write (tmp + rename); return `{ written: true, path }`.

## 10. PreToolUse hook reference shape

- `packages/cli/src/bin-pre-tool-use.ts:76-80` defines `PreToolUseEnvelopeOut`:
  ```ts
  interface PreToolUseEnvelopeOut {
    permissionDecision: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    systemMessage?: string;
  }
  ```
- Output is JSON on stdout. The shell hook in slice 1 produces:
  ```json
  {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}
  ```
- Matches what the grill prescribes.

## Slice scope decisions

What this PR (slice 1) ships:
1. `teamagent required-check` command — new file `packages/cli/src/commands/required-check.ts` + CLI registration.
2. `.teamagent/required.json` schema v1 + writer wired into `executeInit()`, idempotent.
3. `.claude/hooks/check-teamagent.sh` writer wired into `executeInit()`, idempotent, with the deny-JSON shape.
4. `m5-infect` deprecation banner pointing at `teamagent init .`.
5. Tests: `required-check.test.ts`, extension to `init.test.ts`, extension to `m5-infect.test.ts`.

What this PR explicitly does NOT do (slice 2 / later PRs, tracked via PR-PLAN if findings emerge in review):
- CLAUDE.md `TEAMAGENT:REQUIRED:START` / `END` managed-block append.
- `.claude/settings.json` PreToolUse merge for the shell hook entry.
- Removing `.githooks` from `m5-infect` (deprecation only, no behaviour delete).

Acceptance-criteria coverage after slice 1:
- ✅ (4) Repeated init does not duplicate the generated files (idempotency proven via test).
- ✅ (5) `.teamagent/required.json` schema/content matches grill.
- ✅ (10) Denial message in `.claude/hooks/check-teamagent.sh` tells user to install/update + restart Claude.
- ✅ (11) Missing and stale TeamAgent use the same remediation path (single deny branch).
- ✅ (12) Normal human git workflows unaffected (no git hook touched).
- ✅ (13) `.githooks` not generated or modified by `teamagent init`.
- ✅ (14) `m5-*` no longer recommended (deprecation warning).
- ✅ (15) Legacy `m5-infect` points at `teamagent init .`.
- ⏳ (1, 2, 3, 6, 7, 8, 9) Deferred to slice 2 (CLAUDE.md block + settings.json wiring).

Rationale for the cut: slice 1 is the merge-worthy "infrastructure ready, not yet wired into PreToolUse settings" cut. The unwired script + JSON config is internally consistent — a user can run `bash .claude/hooks/check-teamagent.sh` manually and it works; slice 2 just adds the `.claude/settings.json` entry that makes Claude invoke it automatically.
