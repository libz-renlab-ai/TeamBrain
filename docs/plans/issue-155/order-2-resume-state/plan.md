> **CANCELLED 2026-05-10 (issue #155 grill, worktree-146, ADR-0011)**
>
> 此 sub-order **取消**。grill Q5 = (a) Pure idempotency 决议:install
> 全程 (`tar -xzf` 覆盖 / `ln -sf` 替换 / `pnpm` 缓存 / `curl -C -` 续传 /
> `teamagent init` 子步骤 skip-if-exists) 已天然幂等,V3 验收无需 notebook。
>
> - `packages/core/src/install-state/` **不创建**
> - 6-order chain → 5-order chain (序号保留, 此为 CANCELLED slot)
> - 决议详见 [`docs/adr/0011-install-resumption-via-idempotency.md`](../../../adr/0011-install-resumption-via-idempotency.md)
>
> 原 plan body 保留作历史记录。如未来出现非幂等步骤需 retroactive 加 notebook,
> 走独立新 ADR 决议。

---

```
 ╔══════════════════════════════════════════════════════════════════════════════╗
 ║   Issue #155 — Strict-permission-mode install: resume after interrupt        ║
 ║                                                                              ║
 ║   Order 1  →  [Order 2: RESUME-STATE]  →  Order 3  →  Order 4  →           ║
 ║              ↑ THIS FILE                  Order 5  →  Order 6               ║
 ║                                                                              ║
 ║   Sub-order 2: 续命小本本 (Resume Notebook) — M5=B / ADR-0011                ║
 ║                                                                              ║
 ║      pure ───────► port ─────────► impl                                      ║
 ║      core         ports            cli                                       ║
 ║   (no fs at all) (interface +    (FsInstallStateStore                        ║
 ║                  contract)        — only fs lives here)                      ║
 ║                                                                              ║
 ║   Three-layer split: pure functions + Port + fs adapter. No install command.║
 ╚══════════════════════════════════════════════════════════════════════════════╝
```

**鸭语 TL;DR**：呷呷~ 鸭鸭把小本本拆成三层啦！纯函数住 core 完全不碰 fs，Port 接口住 ports 还要先写契约测试，真的写文件的 `FsInstallStateStore` 才搬去 cli 当外壳——这样 M0 的「core 禁 fs」铁律就靠 Port 边界硬性兜住，不再靠口头约定！(>ω<)

---

## § 1. Task description

### What we are doing

Implement durable resume-notebook semantics for the strict-permission-mode install
flow introduced by issue #155 (fixes #114), split across three packages per
**M5=B / ADR-0011** (the InstallStateStore Port that reopens the M0 freeze for one
well-justified case):

1. **`packages/core/src/install-state/`** — a **standalone, pure module** of
   fs-free functions over a typed `InstallState` value (encode/decode, lifecycle).
2. **`packages/ports/src/install-state-store.ts`** — a NEW `InstallStateStore`
   Port interface, with a contract suite under
   `packages/ports/src/__tests__/install-state-store-contract.ts` exported via the
   `@teamagent/ports/contracts` subpath.
3. **`packages/cli/src/install-state-fs-store.ts`** — a NEW `FsInstallStateStore`
   concrete implementation that imports `node:fs/promises` and reads/writes
   `~/.teamagent/install-state/<project-id>.json`. Reuses the contract suite for
   its tests.

The combined behaviour must:

1. **Write** progress state after each completed install step into a global,
   per-machine notebook file at `~/.teamagent/install-state/<project-id>.json`.
2. **Read** that notebook back and surface which steps are still pending, so the
   install command can skip already-completed ones on re-run.
3. **Handle schema-version skew** between the on-disk file and the current code by
   performing a deterministic migration or full-rebuild (see § 2 — corruption contract).
4. **Recover from corruption** (missing file, partial JSON, wrong schema version)
   without data loss and without surfacing a stack trace to the user.

This sub-order is deliberately scoped as an inert library + adapter: nothing here
is imported by any install command. Sub-order 3 wires the Port + fs impl into the
install command.

### How we are doing it

**Layer 1 — pure core (`packages/core/src/install-state/`, fs-free)**:

- Define a Zod schema for the on-disk notebook (`InstallStateSchema`, `schemaVersion: "v1"`).
- Define a `StepKey` union type for all recognized install steps (per-payload
  granularity: one step per discrete user-visible action such as `"npm-global-install"`,
  `"hook-write"`, `"plugin-copy"`, `"config-write"`, etc.).
- Implement pure functions: `serializeState`, `parseState`, `nextPendingStep`,
  `makeEmptyState`, `isStepDone`, `markStepDone`, `pendingSteps`.
- Expose a `resolveProjectId(projectDir: string): string` helper (deterministic
  sha256-based slug, **no fs I/O**, pure function suitable for `packages/core/`).
- Export the pure surface from `packages/core/src/install-state/index.ts`; add the
  subpath export `"./install-state"` to `packages/core/package.json`.
- Write unit tests under `packages/core/src/install-state/__tests__/` covering the
  pure-side schema/lifecycle/migration contracts.

**Layer 2 — Port (`packages/ports/`)**:

- Per CLAUDE.md M0 (`新增 Port 必须先写契约测试再写实现`), write the contract
  suite **first** at `packages/ports/src/__tests__/install-state-store-contract.ts`
  and export it via the `@teamagent/ports/contracts` subpath. The suite verifies any
  conforming implementation by running `load`/`save` round-trips, missing-projectId
  returns `null`, and schema-version skew triggers corruption recovery — all on an
  in-memory fake first to guarantee any future impl agrees.
- Define the `InstallStateStore` Port at `packages/ports/src/install-state-store.ts`
  with two methods: `load(projectId): Promise<InstallState | null>` and
  `save(projectId, state): Promise<void>`.
- Add the export to `packages/ports/src/index.ts` and add the `./contracts` subpath
  to `packages/ports/package.json` if not already present.

**Layer 3 — fs adapter (`packages/cli/`)**:

- Implement `FsInstallStateStore` at `packages/cli/src/install-state-fs-store.ts`.
  Imports `node:fs/promises`. Implements `InstallStateStore`. Reads/writes
  `~/.teamagent/install-state/<project-id>.json`.
- Reuse the contract suite for its tests at
  `packages/cli/src/__tests__/install-state-fs-store.test.ts`, plus fs-specific
  cases (file-rename-on-corrupt, directory auto-create, etc.).

### Step granularity decision (per Decision 3 / 4 of issue #155)

Steps are **per-payload** (not per-prompt, not per-file). The install command may
bundle multiple atomic operations into one step key; what matters is that each step
maps 1-to-1 to a user-visible prompt that the strict-permission gate surfaced. This
lets V3 (`Ctrl-C mid-install → rerun → resume`) skip already-approved payloads
precisely.

### What we are NOT doing (anti-goals)

- **DO NOT** modify any install command (`install-hook.ts`, `install-user-hook.ts`,
  `install-plugins.ts`, etc.). Sub-order 3 wires the new Port + fs impl into the
  install command.
- **DO NOT** add any new CLI sub-command or flag.
- **DO NOT** trigger any user-visible prompt from this module.
- **DO NOT** define `InstallStateStore` anywhere other than `packages/ports/`.
  The Port boundary is what structurally enforces M0's `core 禁 fs` rule for this
  feature — `packages/core/src/install-state/` exposes only pure functions, and
  the only file that imports `node:fs` is `packages/cli/src/install-state-fs-store.ts`.
  This is not a written-down convention; it is a package-graph fact.
- **DO NOT** write the fs implementation before the contract suite. Per CLAUDE.md
  M0, the contract test suite must land first; both the in-memory fake (in the
  contract suite itself) and the fs impl run against the same suite.
- **DO NOT** change `~/.teamagent/` directory layout for existing files
  (`scan-state.json`, `update-state.json`, `first-run-state.json`); only add
  `install-state/<project-id>.json`.

---

## § 2. Expected outputs

### 2x. Pure core / imperative shell split (M5=B per ADR-0011)

Per **ADR-0011** (the InstallStateStore Port that reopens the M0 freeze for one
well-justified case), this feature is split across three packages with a strict
dependency direction:

```
   ┌──────────────────────────────────────┐
   │  Layer 1: PURE  (packages/core/)     │  no fs, no I/O of any kind
   │  ─────────────────────────────────   │  schema + lifecycle + project-id
   │  • InstallStateSchema (Zod)          │  fully unit-testable in isolation
   │  • serializeState / parseState       │
   │  • makeEmptyState / markStepDone     │
   │  • isStepDone / nextPendingStep      │
   │  • resolveProjectId                  │
   └──────────────────┬───────────────────┘
                      │  (consumed by Port + fs impl)
                      ▼
   ┌──────────────────────────────────────┐
   │  Layer 2: PORT  (packages/ports/)    │  interface + contract suite
   │  ─────────────────────────────────   │  CONTRACT FIRST (CLAUDE.md M0)
   │  • InstallStateStore interface       │  exported via @teamagent/ports/contracts
   │  • install-state-store-contract.ts   │
   │    └── verified against in-memory    │
   │        fake to guarantee any future  │
   │        impl agrees                   │
   └──────────────────┬───────────────────┘
                      │  (implemented by)
                      ▼
   ┌──────────────────────────────────────┐
   │  Layer 3: IMPL  (packages/cli/)      │  the only file that touches fs
   │  ─────────────────────────────────   │  reads/writes
   │  • FsInstallStateStore               │  ~/.teamagent/install-state/
   │    imports node:fs/promises          │  <project-id>.json
   │  • runs the contract suite + adds    │
   │    fs-specific tests (corrupt-rename,│
   │    directory auto-create, etc.)      │
   └──────────────────────────────────────┘
```

The dependency arrows go core ← ports ← cli. `packages/core/` does not import
`packages/ports/`; `packages/ports/` does not import `packages/cli/`. The result
is that **the only place `node:fs` appears for this feature is
`packages/cli/src/install-state-fs-store.ts`** — the M0 freeze remains intact
everywhere else.

The schema-version + corruption-recovery contract is also split:

- **Pure side** (`encode.ts` + Zod schema) handles schema-version detection: a
  bad / missing / future-version JSON returns a typed `ParseFailure` rather than
  throwing.
- **Fs side** (`FsInstallStateStore.load`) handles file-rename-on-corrupt + auto-rebuild
  by interpreting that `ParseFailure` and renaming the file to
  `<file>.corrupt.<epoch>.bak` before returning `null`.

### Files added

```
packages/core/src/install-state/
  ├── index.ts                 ← exports pure functions only (no fs)
  ├── schema.ts                ← Zod InstallStateSchema (schemaVersion: "v1")
  ├── encode.ts                ← serializeState, parseState
  ├── lifecycle.ts             ← makeEmptyState, isStepDone, markStepDone, nextPendingStep
  ├── project-id.ts            ← resolveProjectId pure helper
  └── __tests__/
      └── ... (unit tests for pure functions only)

packages/ports/src/install-state-store.ts          ← NEW Port interface
packages/ports/src/__tests__/install-state-store-contract.ts  ← NEW contract suite
packages/cli/src/install-state-fs-store.ts         ← NEW fs impl (FsInstallStateStore)
packages/cli/src/__tests__/install-state-fs-store.test.ts     ← runs contract suite + fs-specific cases
```

### Package.json export updates

- `packages/core/package.json` — add `"./install-state": "./src/install-state/index.ts"`
  to `"exports"`. The barrel `./src/install-state/index.ts` re-exports **only the
  pure functions** (schema, encode, lifecycle, project-id). It does not export
  `FsInstallStateStore` or `InstallStateStore` (those live in their own packages).
- `packages/ports/package.json` — add the `./contracts` subpath to `"exports"` if
  not already present (so the fs impl can `import { runInstallStateStoreContract }
  from "@teamagent/ports/contracts"`). Also add `./install-state-store` (or rely on
  the existing `.` barrel re-exporting it) so consumers can pull the interface.

### Public API surface

**Exported from `@teamagent/core/install-state`** (pure side, no fs):

```typescript
// Types
export type StepKey = "npm-global-install" | "hook-write" | "plugin-copy"
  | "config-write" | "migration-apply" | "post-install-verify";

export interface InstallStateV1 {
  schemaVersion: "v1";
  projectId: string;
  createdAt: number;       // epoch ms
  updatedAt: number;       // epoch ms
  completedSteps: StepKey[];
  lastRunAt: number;       // epoch ms
}

export type InstallState = InstallStateV1;

// Pure schema / parse
export const InstallStateSchema: ZodType<InstallState>;
export function serializeState(state: InstallState): string;
export type ParseResult =
  | { ok: true; state: InstallState }
  | { ok: false; reason: "missing" | "invalid-json" | "schema-mismatch" };
export function parseState(raw: string): ParseResult;

// Pure lifecycle
export function makeEmptyState(projectId: string, now?: number): InstallState;
export function markStepDone(state: InstallState, step: StepKey, now?: number): InstallState;
export function isStepDone(state: InstallState, step: StepKey): boolean;
export function pendingSteps(state: InstallState, allSteps?: readonly StepKey[]): StepKey[];
export function nextPendingStep(
  state: InstallState,
  allSteps?: readonly StepKey[],
): StepKey | null;

// Pure utility
export function resolveProjectId(projectDir: string): string;
```

**Exported from `@teamagent/ports`** (the Port — interface only):

```typescript
import type { InstallState } from "@teamagent/core/install-state";

export interface InstallStateStore {
  load(projectId: string): Promise<InstallState | null>;
  save(projectId: string, state: InstallState): Promise<void>;
}
```

**Exported from `@teamagent/ports/contracts`** (the contract suite — usable by
any future implementation):

```typescript
import type { InstallStateStore } from "@teamagent/ports";

// Vitest contract suite. Pass a factory that returns a fresh InstallStateStore
// instance (and an optional teardown) so the suite can run round-trip / null /
// schema-skew / corruption-recovery cases against any conforming impl. The
// suite also runs against an in-memory fake first to lock the contract before
// any real impl ships.
export function runInstallStateStoreContract(
  describe: typeof import("vitest").describe,
  factory: () => Promise<{ store: InstallStateStore; teardown?: () => Promise<void> }>,
): void;
```

**Exported from `@teamagent/cli` (internal — the imperative shell)**:

```typescript
// packages/cli/src/install-state-fs-store.ts
// Imports node:fs/promises. Implements InstallStateStore.
// Reads/writes ~/.teamagent/install-state/<project-id>.json.
export class FsInstallStateStore implements InstallStateStore { ... }
```

### JSON schema for the on-disk notebook

```jsonc
{
  "schemaVersion": "v1",      // string literal; bumped on breaking changes
  "projectId": "sha256-slug", // resolveProjectId(projectDir)
  "createdAt": 1700000000000, // epoch ms
  "updatedAt": 1700000001000, // epoch ms
  "completedSteps": ["npm-global-install", "hook-write"],
  "lastRunAt": 1700000001000  // epoch ms
}
```

File path on disk: `~/.teamagent/install-state/<projectId>.json`
Directory created automatically by `FsInstallStateStore.save()` if absent.

### Schema-version skew contract

| Scenario | Behaviour |
|---|---|
| File missing | `load()` returns `null`; caller creates fresh state with `makeEmptyState()` |
| `schemaVersion` field missing | Treat as unknown/corrupt → auto-rebuild (see below) |
| `schemaVersion: "v1"` (current) | Parse with Zod; on validation error → corrupt path |
| Future `schemaVersion: "v2"` read by v1 code | Treat as unknown → auto-rebuild |

### Corruption-recovery contract

Split across the pure / fs boundary:

- **Pure side** (`parseState` in `packages/core/src/install-state/encode.ts`)
  detects bad / missing-version / future-version JSON and returns a typed
  `ParseResult { ok: false; reason }` rather than throwing.
- **Fs side** (`FsInstallStateStore.load()` in
  `packages/cli/src/install-state-fs-store.ts`) **never throws**. On any
  `ParseResult.ok === false` it:
  1. Renames the bad file to `<file>.corrupt.<epoch>.bak` (preserves evidence).
  2. Returns `null` (caller gets a clean slate).
  3. Does **not** log to stdout; emits no user-visible message (no `AttributionBus`
     event from this layer).

### Anti-goals (outputs that must NOT appear)

- No changes to `packages/cli/src/commands/` (the Port impl lives at
  `packages/cli/src/install-state-fs-store.ts`; the install command is wired in
  sub-order 3).
- No `node:fs` import anywhere under `packages/core/src/install-state/`. (The Port
  boundary makes this a package-graph fact, not a written-down convention.)
- No new `teamagent` sub-command.
- `packages/core/src/index.ts` is **not** modified (the new subpath export is
  sufficient for sub-order 3 to consume).

---

## § 3. How-to-verify (judge harness)

### Module(s) under test

Three packages contribute to this sub-order:

- **`@teamagent/core/install-state`** — pure functions (schema, encode/decode,
  lifecycle, project-id).
- **`@teamagent/ports`** — the `InstallStateStore` Port + the contract suite at
  `@teamagent/ports/contracts`.
- **`@teamagent/cli`** (internal) — `FsInstallStateStore`, which runs the contract
  suite + adds fs-specific cases.

### 1+2+3 gate (project-wide, from `docs/feature-verification.md`)

This sub-order ships pure functions + a Port + a fs adapter + tests, not a CLI
subcommand, so steps 1+2 of the 1+2+3 gate are adapted:

1. **`claudefast -p` probe** — runs
   `pnpm test --reporter=json --outputFile=.judge/resume-state/vitest-results.json`
   across `@teamagent/core`, `@teamagent/ports`, and `@teamagent/cli` (filtered to
   the install-state files) and confirms exit code 0.
2. **`codex exec` probe** — runs the same test command and produces an independent
   `vitest-results-codex.json`; the two JSON files are byte-compared (`jq -S` then
   `diff -u`).
3. **Interactive `/export`** — run the same `pnpm test` inside tmux, verify all
   tests green, `/export .judge/resume-state/interactive-session.md`; attach to PR
   description.

### Plan-specific judge harness (third-party, three-step)

**RUN**:
```bash
# 1. Run all relevant test suites
pnpm --filter @teamagent/core --filter @teamagent/ports --filter @teamagent/cli test \
  --reporter=json \
  --outputFile=.judge/resume-state/vitest-results.json

# 2. Verify Port lives in packages/ports (package-graph fact)
test -f packages/ports/src/install-state-store.ts \
  && echo "port_in_packages_ports=true" \
  || echo "port_in_packages_ports=false"

# 3. Verify packages/core does NOT import node:fs anywhere under install-state/
if grep -RE "from ['\"](node:fs|fs|fs/promises|node:fs/promises)['\"]" \
     packages/core/src/install-state/ >/dev/null 2>&1; then
  echo "core_imports_node_fs=true"
else
  echo "core_imports_node_fs=false"
fi

# 4. Verify the fs impl lives in packages/cli
test -f packages/cli/src/install-state-fs-store.ts \
  && echo "fs_impl_in_packages_cli=true" \
  || echo "fs_impl_in_packages_cli=false"

# 5. Verify the contract suite exists at the canonical path
test -f packages/ports/src/__tests__/install-state-store-contract.ts \
  && echo "contract_suite_present=true" \
  || echo "contract_suite_present=false"
```

**DUMP** — harness writes the following to `.judge/resume-state/judge.json`:
```jsonc
{
  "run_id": "<epoch>",
  "exit_code": 0,
  "metrics": {
    "unit_tests": 12,           // total test count
    "passed": 12,
    "failed": 0,
    "schema_version_covered": true,        // pure-side parseState handles v1 + future-version
    "corruption_recovery_test": true,      // fs-side rename-on-corrupt verified via contract
    "step_granularity_covered": true,      // pure tests cover all StepKey values
    "port_in_packages_ports": true,        // packages/ports/src/install-state-store.ts exists
    "core_imports_node_fs": false,         // grep "node:fs" under packages/core/src/install-state/ → 0
    "fs_impl_in_packages_cli": true,       // packages/cli/src/install-state-fs-store.ts exists
    "contract_suite_present": true         // packages/ports/src/__tests__/install-state-store-contract.ts exists
  },
  "evidence_dir": ".judge/resume-state/",
  "stdout_path": ".judge/resume-state/vitest-results.json"
}
```

**READ** — a separate `claudefast -p` call (not the implementing agent) reads only
`.judge/resume-state/judge.json` and `.judge/resume-state/vitest-results.json` and
outputs a PASS/FAIL verdict with rationale. The probe prompt must be:

```
Read .judge/resume-state/judge.json and .judge/resume-state/vitest-results.json.
Verify ALL of the following:
  (1) exit_code == 0;
  (2) passed == unit_tests and failed == 0;
  (3) schema_version_covered == true;
  (4) corruption_recovery_test == true;
  (5) step_granularity_covered == true;
  (6) port_in_packages_ports == true;
  (7) core_imports_node_fs == false;
  (8) fs_impl_in_packages_cli == true;
  (9) contract_suite_present == true.
Output ONE LINE strict JSON:
{"verdict":"PASS"|"FAIL","all_checks_passed":true|false,"failed_checks":["..."],"notes":"<=140 chars"}
```

The module does NOT grade itself. The judge is a separate claudefast invocation with
no write access to the source files. Checks 6–9 specifically verify the M5=B /
ADR-0011 layering — they are package-graph facts, not test assertions.

### `/export` path

`.judge/resume-state/interactive-session.md`

---

## § 4. Claudefast probes BEFORE coding

Run these probes before writing any source code to de-risk assumptions.

### Probe A — does install-state already exist anywhere?

```bash
claudefast -p "Search the TeamBrain repo at /Users/m1/projects/TeamBrain/.claude/worktrees/newissue for any file or directory named 'install-state'. Also search for any TypeScript type or interface named InstallState or InstallStateStore. List every match with file path and line number. If nothing found, say NONE."
```

Expected result: NONE (module does not exist yet).

### Probe B — what global state files does TeamAgent already write to ~/.teamagent/?

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/packages/core/src/ and /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/packages/cli/src/ to find all places that write JSON files under ~/.teamagent/ or HOME/.teamagent. List each: file path, what JSON is written, and the field names of the top-level JSON object. Also check if any of them already have a 'schemaVersion' or 'version' field."
```

Expected result: `scan-state.json`, `update-state.json`, `first-run-state.json` listed;
none of them uses `schemaVersion` as a string literal (they use `version: number`);
confirms `install-state/<project-id>.json` is a new namespace.

### Probe C — confirm M5=B layering against the existing Port catalogue

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/155/packages/ports/src/index.ts and list all exported Port interfaces along with their concrete implementations (and the package each impl lives in). Then read CLAUDE.md M0 (`新增 Port 必须先写契约测试再写实现` and `packages/core/ 下禁止 import fs ...`) and confirm: (a) every existing Port has a contract suite under packages/ports/src/__tests__/*-contract.ts; (b) every fs-touching impl lives outside packages/core/. Output a short bullet list of any Port that violates either rule, or 'NONE' if all conform."
```

Expected result: a short list confirming that every existing Port already follows
the contract-first + fs-outside-core pattern; this sub-order's `InstallStateStore`
will follow the same pattern (per ADR-0011). If the list shows any prior violations,
they are out of scope here but should be filed as follow-up issues.

---

*Authored for issue #155, sub-order 2 — restructured under M5=B per ADR-0011 (the
InstallStateStore Port that reopens the M0 freeze for one well-justified case).
Sub-order 3 (install-merge) will consume the three layers by importing
`@teamagent/core/install-state` (pure helpers), the `InstallStateStore` Port from
`@teamagent/ports`, and the `FsInstallStateStore` impl from `@teamagent/cli`,
and wiring them into the install command. This plan is independently shippable:
all outputs are new files in `packages/core/`, `packages/ports/`, and
`packages/cli/`; no existing file is modified except the three `package.json`
exports listed above.*
