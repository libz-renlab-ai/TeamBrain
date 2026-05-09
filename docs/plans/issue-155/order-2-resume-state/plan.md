```
 ╔══════════════════════════════════════════════════════════════════════════════╗
 ║   Issue #155 — Strict-permission-mode install: resume after interrupt        ║
 ║                                                                              ║
 ║   Order 1  →  [Order 2: RESUME-STATE]  →  Order 3  →  Order 4  →           ║
 ║              ↑ THIS FILE                  Order 5  →  Order 6               ║
 ║                                                                              ║
 ║   Sub-order 2: 续命小本本 (Resume Notebook)                                   ║
 ║   Pure module + unit tests. No install command. No CLI surface.              ║
 ╚══════════════════════════════════════════════════════════════════════════════╝
```

**鸭语 TL;DR**：呷呷~ 鸭鸭要做一个专门记断点的小本本模块，写好状态、读回状态、坏了自动重建，不碰安装命令，让第 3 张单的人来装管道！(>ω<)

---

## § 1. Task description

### What we are doing

Implement `packages/core/src/install-state/` — a **standalone, pure module** that
provides durable resume-notebook semantics for the strict-permission-mode install
flow introduced by issue #155 (fixes #114).

The module must:

1. **Write** progress state after each completed install step into a global,
   per-machine notebook file at `~/.teamagent/install-state/<project-id>.json`.
2. **Read** that notebook back and surface which steps are still pending, so the
   install command can skip already-completed ones on re-run.
3. **Handle schema-version skew** between the on-disk file and the current code by
   performing a deterministic migration or full-rebuild (see § 2 — corruption contract).
4. **Recover from corruption** (missing file, partial JSON, wrong schema version)
   without data loss and without surfacing a stack trace to the user.

The module is deliberately scoped as an inert library: it provides pure functions
over a typed `InstallState` value and a separate `InstallStateStore` interface for
I/O. The I/O adapter that writes to disk lives in `packages/core/src/install-state/`
but is **not** imported by any install command in this sub-order.

### How we are doing it

- Define a Zod schema for the on-disk notebook (`InstallStateSchema`, `schemaVersion: "v1"`).
- Define a `StepKey` union type for all recognized install steps (per-payload
  granularity: one step per discrete user-visible action such as `"npm-global-install"`,
  `"hook-write"`, `"plugin-copy"`, `"config-write"`, etc.).
- Implement pure functions: `markStepDone`, `isStepDone`, `pendingSteps`.
- Implement `InstallStateStore` interface with two methods: `load(projectId)` and
  `save(projectId, state)`.
- Implement `FsInstallStateStore` concrete class that reads/writes
  `~/.teamagent/install-state/<project-id>.json`.
- Expose a `resolveProjectId(projectDir: string): string` helper (deterministic
  sha256-based slug, no fs I/O, pure function suitable for `packages/core/`).
- Export everything from `packages/core/src/install-state/index.ts`; add the
  subpath export `"./install-state"` to `packages/core/package.json`.
- Write unit tests under `packages/core/src/install-state/__tests__/` covering all
  four contracts (see § 2).

### Step granularity decision (per Decision 3 / 4 of issue #155)

Steps are **per-payload** (not per-prompt, not per-file). The install command may
bundle multiple atomic operations into one step key; what matters is that each step
maps 1-to-1 to a user-visible prompt that the strict-permission gate surfaced. This
lets V3 (`Ctrl-C mid-install → rerun → resume`) skip already-approved payloads
precisely.

### What we are NOT doing (anti-goals)

- **DO NOT** modify `packages/cli/src/commands/install-hook.ts`,
  `install-user-hook.ts`, `install-plugins.ts`, or any other install command. Sub-order 3
  wires this module into the install command.
- **DO NOT** add any new CLI sub-command or flag.
- **DO NOT** trigger any user-visible prompt from this module.
- **DO NOT** import `node:fs`, `node:child_process`, or any I/O module from
  `packages/core/` pure functions. The `FsInstallStateStore` class (which uses
  `node:fs/promises`) is placed inside `packages/core/src/install-state/` but is
  exported as an imperative-shell helper; the core pure functions remain IO-free
  (`Functional Core, Imperative Shell` rule from `CLAUDE.md`).
- **DO NOT** add a `Port` interface in `packages/ports/` for this sub-order. The
  `InstallStateStore` interface is defined alongside the implementation in
  `packages/core/src/install-state/` and may be promoted to a Port in a future
  sub-order if needed.
- **DO NOT** change `~/.teamagent/` directory layout for existing files
  (`scan-state.json`, `update-state.json`, `first-run-state.json`); only add
  `install-state/<project-id>.json`.

---

## § 2. Expected outputs

### Files added

```
packages/core/src/install-state/
├── index.ts                      ← public API barrel
├── schema.ts                     ← Zod schema + TypeScript types
├── step-keys.ts                  ← StepKey union + KNOWN_STEPS const
├── pure.ts                       ← markStepDone / isStepDone / pendingSteps
├── store.ts                      ← InstallStateStore interface + FsInstallStateStore
├── project-id.ts                 ← resolveProjectId pure helper
└── __tests__/
    ├── pure.test.ts              ← pure function unit tests
    ├── schema-migration.test.ts  ← schema-version skew + corruption recovery
    └── store.test.ts             ← FsInstallStateStore read/write/corrupt cycle
```

`packages/core/package.json` — add `"./install-state": "./src/install-state/index.ts"` to `"exports"`.

### Public API surface (exported from `@teamagent/core/install-state`)

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

// Pure functions
export function markStepDone(state: InstallState, step: StepKey, now?: number): InstallState;
export function isStepDone(state: InstallState, step: StepKey): boolean;
export function pendingSteps(state: InstallState, allSteps?: readonly StepKey[]): StepKey[];
export function makeEmptyState(projectId: string, now?: number): InstallState;

// Store interface
export interface InstallStateStore {
  load(projectId: string): Promise<InstallState | null>;
  save(projectId: string, state: InstallState): Promise<void>;
}

// Concrete fs-based store (imperative shell)
export class FsInstallStateStore implements InstallStateStore { ... }

// Utility
export function resolveProjectId(projectDir: string): string;
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

`FsInstallStateStore.load()` **never throws**. On any parse/validation failure it:
1. Renames the bad file to `<file>.corrupt.<epoch>.bak` (preserves evidence).
2. Returns `null` (caller gets a clean slate).
3. Does **not** log to stdout; emits no user-visible message (no `AttributionBus`
   event from within this pure module).

### Anti-goals (outputs that must NOT appear)

- No changes to `packages/cli/` source files.
- No new `packages/ports/` port interface.
- No new `teamagent` sub-command.
- `packages/core/src/index.ts` is **not** modified (the new subpath export is
  sufficient for sub-order 3 to consume).

---

## § 3. How-to-verify (judge harness)

### Module under test

`@teamagent/core/install-state` (via `packages/core/src/install-state/index.ts`).

### 1+2+3 gate (project-wide, from `docs/feature-verification.md`)

This sub-order ships a pure module + tests, not a CLI subcommand, so steps 1+2 of
the 1+2+3 gate are adapted:

1. **`claudefast -p` probe** — runs `pnpm --filter @teamagent/core test
   --reporter=json --outputFile=.judge/resume-state/vitest-results.json` and
   confirms exit code 0.
2. **`codex exec` probe** — runs the same test command and produces an independent
   `vitest-results-codex.json`; the two JSON files are byte-compared (`jq -S` then
   `diff -u`).
3. **Interactive `/export`** — run `pnpm --filter @teamagent/core test` inside tmux,
   verify all tests green, `/export .judge/resume-state/interactive-session.md`; attach
   to PR description.

### Plan-specific judge harness (third-party, three-step)

**RUN**:
```bash
pnpm --filter @teamagent/core test \
  --reporter=json \
  --outputFile=.judge/resume-state/vitest-results.json
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
    "schema_version_covered": true,    // schema.test.ts has ≥1 v1 round-trip test
    "corruption_recovery_test": true,  // schema-migration.test.ts has corrupt-file test
    "step_granularity_covered": true   // pure.test.ts covers all StepKey values
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
Verify: (1) exit_code == 0; (2) passed == unit_tests and failed == 0;
(3) schema_version_covered == true; (4) corruption_recovery_test == true;
(5) step_granularity_covered == true.
Output ONE LINE strict JSON:
{"verdict":"PASS"|"FAIL","all_checks_passed":true|false,"failed_checks":["..."],"notes":"<=140 chars"}
```

The module does NOT grade itself. The judge is a separate claudefast invocation with
no write access to the source files.

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

### Probe C — review packages/ports for any port we should hide this behind

```bash
claudefast -p "Read /Users/m1/projects/TeamBrain/.claude/worktrees/newissue/packages/ports/src/index.ts and list all exported Port interfaces. Then read CLAUDE.md (the M0 meta-constraints section) and answer: should a resume-state notebook (writes JSON to ~/.teamagent/install-state/, pure logic in core, IO in shell) be hidden behind a new Port in packages/ports, or is it acceptable as an internal interface defined in packages/core? Give a 2-sentence recommendation."
```

Expected result: recommendation to define `InstallStateStore` interface locally in
`packages/core/src/install-state/` for this sub-order (no new Port required; the
interface can be promoted later if other packages need to depend on it).

---

*Authored for issue #155, sub-order 2. Sub-order 3 (install-merge) will consume this
module by importing `@teamagent/core/install-state` and wiring `FsInstallStateStore`
into the install command. This plan is independently shippable: all outputs are new
files in packages/core; no existing file is modified.*
