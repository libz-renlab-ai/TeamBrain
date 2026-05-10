---
Status: proposed
Date: 2026-05-10
---

```text
            before this ADR (order-2 plan v1)         after this ADR (M5=B)
            ================================          =====================

            packages/core/src/install-state/          packages/ports/src/
              ├── pure.ts (FCIS-clean)                  └── install-state-store.ts ◀── interface frozen
              ├── schema.ts                                 (+ __tests__/install-state-store-contract.ts
              ├── project-id.ts                                exported via @teamagent/ports/contracts)
              └── store.ts ◀── BANNED:                            │
                    `import { promises as fs }`                   │ contract reused
                    `from "node:fs"`                              ▼
                                                          packages/cli/src/install-state-fs-store.ts
                                                            (FsInstallStateStore lives in imperative shell;
                                                             passes the @teamagent/ports/contracts suite)

                    pure logic in packages/core/        packages/core/src/install-state/
                    (UNCHANGED — fs-free)                 ├── pure.ts (markStepDone / isStepDone /
                                                          │            nextPendingStep / makeEmptyState)
                                                          ├── schema.ts (serializeState / parseState
                                                          │              + Zod migration)
                                                          └── project-id.ts (resolveProjectId — pure)
```

# Open InstallStateStore Port for cross-session install resume; keep `packages/core/` fs-free

## Status

Proposed.

## Date

2026-05-10.

## Context

Issue #155 closes issue #114 (Ctrl-C mid-install wedges the user with no
way to re-enter without re-prompting every approved payload). Order-2 of
the issue #155 implementation chain
(`docs/plans/issue-155/order-2-resume-state/plan.md`, "续命小本本") adds a
durable resume-notebook module that records which install steps a user
has already approved, keyed by a per-machine project ID, so a re-run of
the install command picks up exactly where the interrupt happened.

The order-2 plan v1 layout placed the entire module — pure functions
AND the `FsInstallStateStore` class importing `node:fs/promises` — under
`packages/core/src/install-state/`. The plan justified the fs import in
core as "exported as an imperative-shell helper." That justification
collides with CLAUDE.md's M0 元约束:

> **Functional Core, Imperative Shell**. `packages/core/` 下禁止 import
> `fs` / `node:fs` / `node:child_process` / 任何 IO 模块.

The M0 invariant is a hard ban, not a stylistic preference; once
`packages/core/` is allowed one fs caller "as imperative shell," the
next contributor reading the rule has no principled cutoff for the
second, third, and fourth. Issue #155 grill round 2 (2026-05-10) flagged
the violation and surfaced four options for resolving it (A/B/C/D
below); the user's choice was **B** — open a new Port, move the
concrete fs adapter out of core.

The secondary tension is CLAUDE.md's M0 clause `Port 接口冻结于 M0`,
which would forbid opening any new Port post-M0. This ADR records the
justification for crossing that line: cross-session install state is
genuine cross-process I/O state (not in-process pure logic), the
two-real-adapters bar from ADR-0005 is satisfiable at land time, and the
alternatives (option C — relax the fs ban; option D — drop the feature)
are strictly worse for the rest of the codebase.

## Decision

Open an 11th Port at `packages/ports/src/install-state-store.ts` with a
contract test suite at
`packages/ports/src/__tests__/install-state-store-contract.ts` exported
via the existing `@teamagent/ports/contracts` subpath (per CLAUDE.md
`新增 Port 必须先写契约测试再写实现`). Pure logic
(`serializeState`, `parseState`, `nextPendingStep`, `isStepDone`,
`markStepDone`, `makeEmptyState`, `resolveProjectId`) stays in
`packages/core/src/install-state/` and remains fs-free; the schema
migration is a pure transform on the typed value, not a transform on
raw bytes. The concrete fs-backed implementation
`FsInstallStateStore` moves out of `packages/core/` into
`packages/cli/src/install-state-fs-store.ts`, where it imports
`node:fs/promises` legally as imperative shell. A second adapter
(in-memory, used by the install command's own test suite) lands at-or-near
this PR so the two-real-adapters rule of ADR-0005 is satisfied at land
time, not deferred. Both adapters MUST pass the contract suite from
`@teamagent/ports/contracts`.

## Considered Options

- **(A) Move `FsInstallStateStore` to `packages/cli/` but skip the Port** —
  Rejected. Fixes the M0 fs-import violation but freezes the surface at one
  concrete adapter, defeating the contract-test-first discipline that
  CLAUDE.md mandates for any cross-package I/O seam. Future swappable
  backends (in-memory test store, remote KV store) would land without a
  shared contract and re-create the same drift the Ports + adapters layout
  exists to prevent.
- **(B, accepted)** Open a new `InstallStateStore` Port at
  `packages/ports/src/install-state-store.ts` with a contract test suite
  at `packages/ports/src/__tests__/install-state-store-contract.ts`
  (exported via `@teamagent/ports/contracts`); concrete `FsInstallStateStore`
  moves to `packages/cli/src/install-state-fs-store.ts`; pure functions stay
  in `packages/core/src/install-state/`. Two real adapters land at-or-near
  this PR (production fs adapter + an in-memory adapter used by the CLI's
  own test suite), satisfying ADR-0005's "no hypothetical seam" rule.
- **(C) Relax the CLAUDE.md M0 fs ban — `packages/core/` may import `fs`
  for "imperative-shell helpers"** — Rejected. Pollutes the meta-rule that
  every other module in the repo respects; once `packages/core/` is allowed
  one fs caller "as imperative shell," the next contributor reading the
  rule has no principled cutoff for the second, third, and fourth. The
  Functional Core / Imperative Shell discipline is the single load-bearing
  invariant that lets `packages/core/` stay testable without a sandbox; a
  rule with exceptions is a rule the next agent ignores.
- **(D) Drop the cross-session resume feature; install always re-prompts
  every payload on re-run** — Rejected. Returns the project to the issue
  \#114 root cause (Ctrl-C mid-install wedges the user; re-running the
  install command floods them with payload prompts they already approved
  once). Issue #155's whole reason for existence is closing #114; deleting
  the feature to avoid the architectural question is a non-decision.

## Consequences

- **`packages/ports/src/install-state-store.ts` is the canonical Port for
  install-state I/O.** Surface is two methods on `InstallStateStore`:
  `load(projectId: string): Promise<InstallStateV1 | null>` and
  `save(projectId: string, state: InstallStateV1): Promise<void>`. Schema-version
  migration is intentionally split off into `packages/core/src/install-state/schema.ts`
  (`parseState` does the migration on the typed value, not on raw bytes) so
  the Port stays narrow.
- **`packages/ports/src/__tests__/install-state-store-contract.ts`
  is the contract test suite.** Exported via the existing
  `@teamagent/ports/contracts` subpath (see `packages/ports/package.json`'s
  `"./contracts": "./src/contracts.ts"` export). Any new `InstallStateStore`
  implementation MUST run the suite under its own `__tests__/` to be
  considered production-ready; `packages/ports/src/contracts.ts` re-exports
  the new suite alongside the existing 11 contract suites
  (`attribution-bus-contract`, `calibrator-contract`, etc.).
- **`packages/cli/src/install-state-fs-store.ts` is the production fs
  adapter.** Imports `node:fs/promises`, `node:path`, and `node:os` legally
  as `packages/cli/` is imperative shell. Writes to
  `~/.teamagent/install-state/<project-id>.json`. An in-memory adapter
  (e.g., `packages/cli/src/install-state-memory-store.ts` or co-located with
  install command tests) satisfies ADR-0005's two-real-adapters rule and
  serves the CLI test suite — both adapters MUST pass
  `installStateStoreContract` from `@teamagent/ports/contracts`.
- **`packages/core/src/install-state/` stays fs-free.** Pure functions
  (`makeEmptyState`, `markStepDone`, `isStepDone`, `nextPendingStep`,
  `serializeState`, `parseState`, `resolveProjectId`) own all the resume-notebook
  logic that does not touch disk; `serializeState` returns a string,
  `parseState` accepts a string and a now timestamp injected by the caller,
  and the schema-version migration is a pure transform on the typed value.
  CLAUDE.md M0 元约束 ("`packages/core/` 下禁止 import `fs` / `node:fs` /
  `node:child_process` / 任何 IO 模块") is upheld with no exception.
- **Order-2 plan (`docs/plans/issue-155/order-2-resume-state/plan.md`) is
  amended in this PR** to relocate `FsInstallStateStore` from
  `packages/core/src/install-state/store.ts` to
  `packages/cli/src/install-state-fs-store.ts`, drop the `store.ts` file
  inside `packages/core/`, add the new Port at
  `packages/ports/src/install-state-store.ts`, and add the contract suite
  at `packages/ports/src/__tests__/install-state-store-contract.ts`. The
  amendment is a sibling worker's job (per the round 2 division of labor);
  this ADR only records the architectural call.
- **Port count goes from 10 to 11 post-M0.** CLAUDE.md's `Port 接口冻结于
  M0` clause is intentionally bent here, with this ADR as the recorded
  justification: cross-session install state is genuine cross-process /
  cross-session I/O state (not in-process pure logic), the two-real-adapters
  test (per ADR-0005) is satisfied at land, and the alternative
  (option C — relax the fs ban) is strictly worse for the rest of the
  codebase. Future Port additions still require their own ADR.
- **Lint impact.** A future lint rule MAY enforce "`packages/core/**/*.ts`
  must not import from `node:fs*`, `node:child_process`, `node:os`, or
  `fs-extra`." This ADR provides the first precedent that justifies such a
  rule existing; before this round, the implicit reading was "core SHOULD
  be IO-free unless you can argue an imperative-shell exception," which
  produced exactly the order-2-plan-v1 violation that triggered this ADR.
  After this ADR, the rule is "core MUST be IO-free, period; any IO seam
  becomes a Port + cli-side adapter."
- **Cross-refs.** ADR-0005 (`archive hypothetical port seams`) governs the
  two-real-adapters bar; ADR-0008 (`HookShell as imperative shell`) is the
  ratified-precedent for FCIS discipline in this codebase; CLAUDE.md M0
  元约束 is the meta-rule this ADR refuses to relax. Issue #155 grill round
  2 transcript (decision M5=B) is the originating record.
- **Verification gate.** This ADR is "shipped" when (1) the new Port file
  exists and exports the `InstallStateStore` interface; (2) the contract
  suite at `packages/ports/src/__tests__/install-state-store-contract.ts`
  is re-exported from `packages/ports/src/contracts.ts`; (3) `pnpm test`
  passes the contract suite for both the production fs adapter and an
  in-memory adapter; (4) `grep -r "node:fs" packages/core/` returns zero
  matches (the M0 invariant); (5) `pnpm typecheck` passes across the
  workspace.
