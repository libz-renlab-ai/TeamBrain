# Archived ports

This drawer holds port interfaces that previously lived in `packages/ports/src/` but failed the deletion-test described in `docs/adr/0005-archive-hypothetical-port-seams.md` and the architecture skill's LANGUAGE.md ("one adapter = hypothetical seam, two adapters = real seam").

## Currently archived

| Port file | Lone implementation | Why archived |
|---|---|---|
| `correction-detector.ts` | `ruleBasedCorrectionDetector` @ `packages/core/src/correction-detector/rule-based.ts` | Port had no contract test; callers always imported the impl directly |
| `success-detector.ts` | `ruleBasedSuccessDetector` @ `packages/core/src/success-detector/rule-based.ts` | Same as above |
| `candidate-queue.ts` | `SqliteCandidateQueue` @ `packages/adapters/src/storage/sqlite/sqlite-candidate-queue.ts` | Contract test exists but was only ever validated against the lone SQLite adapter |
| `error-signal-collector.ts` | `CompositeErrorSignalCollector` @ `packages/adapters/src/error-collector/composite-error-signal-collector.ts` | Contract test exists but only ever validated against the lone Composite adapter |
| `bootstrap-port.ts` | `FsBootstrap` @ `packages/adapters/src/m5/fs-bootstrap.ts` | M5 viral sync; CONTEXT.md states "git-backed transport is the唯一 channel" — second prod adapter is forbidden by domain rules |
| `team-rule-store-port.ts` | `FsTeamRuleStore` @ `packages/adapters/src/m5/fs-team-rule-store.ts` | Same as above |

Type definitions (e.g., `CorrectionDetector`, `CandidateQueue`, `BootstrapPort`) have been **inlined into the lone-implementation files** by Workers 3 and 4 and re-exported from `@teamagent/core` (for the first two) or `@teamagent/adapters` (for the latter four). Callers now import from those packages instead of `@teamagent/ports`.

## Revival conditions

A port may move back out of `_archived/` to `packages/ports/src/` only if:

1. **Two real production adapters exist**, OR
2. **A non-trivial in-memory fake adapter exists** that meaningfully exercises the contract test (more than a typed wrapper around the prod adapter).

When reviving, also restore the `export type { … }` block in `packages/ports/src/index.ts` and update `docs/CONTEXT.md` "Module structure → Archived port" to remove the file from the table above.

## Out of scope

- The CLAUDE.md元约束「Port 接口冻结于 M0」 does **not** apply to files inside this drawer; archived ports may be modified or deleted without contract-test or plan-document updates.
- `git history` for moved files is preserved via `git mv`; use `git log --follow packages/ports/src/_archived/<file>.ts` to trace evolution.
