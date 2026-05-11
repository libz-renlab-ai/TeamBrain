# research.md — issue #280

STEP 1 of `docs/HOW-TO-CLAIM-ISSUE.md` (explore agent output). Source-of-truth audit for the files the grill comment references.

## 1. Spawner location — `packages/adapters/src/llm/claude-code-client.ts`

`defaultSpawner` lives at lines 167–226. Spawn options block (lines 171–177):

```ts
child = nodeSpawn(command, args, {
  stdio: ["pipe", "pipe", "pipe"],
  shell: false,
  // Avoid popping up console windows on Windows. Async Stop pipeline can
  // fire this repeatedly; without this the screen floods with terminals.
  windowsHide: true,
});
```

- `command` originates from `this.executable` (constructor line 55), defaulting to `"claude"`. Injectable via `ClaudeCodeLLMClientOptions.executable`.
- `args` are fixed literals: `["-p", "--output-format", "json", "--no-session-persistence"]` plus optional `--model` (lines 69–78). No user-controlled values reach `args`.
- `prompt` is passed via `opts.input` (stdin), not args. **No shell-injection surface** when `shell: true` is added on Windows.

`packages/teamagent/package.json` does **not** depend on `@anthropic-ai/claude-code` — confirms the grill decision to skip the `require.resolve(...)` approach.

Existing unit tests: `packages/adapters/src/llm/__tests__/claude-code-client.test.ts` injects a `Spawner` via `makeSpawner(behavior)` and runs `runLLMClientContract(...)`. Same contract harness used by other LLM client tests.

Other spawn callsite: `packages/adapters/src/plugins/claude-plugin-installer.ts` has its own `defaultSpawner` (out of scope per N4).

## 2. SessionStart hook entry — `packages/cli/src/bin-session-start.ts`

Top-level imports (lines 46–66) are **all relative `.js` files**: `session-start-logic`, `wiki-residue-cleanup`, `db-backup-cleanup`, `m5-session-hook`, `hook-shell`, `walk-up`, `daemon-first-embedder`, `embedder-state`, `embedder-client`. **No direct top-level import of `web-tree-sitter`, `tree-sitter-*`, `@xenova/transformers`, or `onnxruntime-node`.**

Implication: the user-reported `MODULE_NOT_FOUND: web-tree-sitter` (issue body repro `echo '{}' | node ~/.teamagent/hooks/bin-session-start.cjs`) crashes through **transitive** module-load — one of the relative imports loads a sibling that top-level `require`s the missing dep before any code runs.

Suspect chain (to verify in commit 3 by following each import top-to-bottom): `m5-session-hook` → matcher / scorer modules → `ast-context.ts` (lazy is correct) **vs.** `daemon-first-embedder` / `embedder-client` → embedder transitive that pulls `@xenova/transformers` or `onnxruntime-node`. The grill explicitly names `xenova 间接路径` as a target.

`parseInput()` (lines 84–107): returns `null` when stdin is empty **and** neither `CLAUDE_PROJECT_DIR` (signal 1) nor `TEAMAGENT_ALLOW_BARE_SESSIONSTART` (signal 3) is set. In that case the hook fast-exits 0 without running `decideAction` / `spawnAutoInit` / cleanup. This is the doctor probe contract: empty stdin → null → exit 0.

`packages/core/src/matcher/legacy/ast-context.ts:28–37` — existing lazy fallback pattern, the template for new soft-degrade sites:

```ts
export async function initAstMatcher(): Promise<void> {
  if (initialized) return;
  let wts: typeof import("web-tree-sitter");
  try {
    wts = await import("web-tree-sitter");
  } catch {
    initialized = true;
    return;  // conservative fallback: no parser → don't filter
  }
```

## 3. Doctor command — `packages/cli/src/commands/doctor.ts`

15+ `check*` functions exist; relevant subset:

- `checkHookRegistered` (l.625) — verifies hook entry in `settings.local.json`.
- `checkHookScript` (l.660–691) — extracts script path via regex on hook `command` field, asserts `fs.existsSync(scriptPath)`. **File existence only — no spawn**. This is the gap commit 1 closes.
- `checkSettingsJsonScope` (l.697) — project-vs-user-level hook check.

Insertion site: in `executeDoctor`, `checkHookScript` is pushed at line 274. `checkHookSpawn` will be pushed immediately after (only if `hookScriptCheck.status === "pass"`, since spawning a nonexistent file is meaningless).

Injectable probe convention already established (lines 51–52, 438):

```ts
export type ClaudeProbe = (env?: NodeJS.ProcessEnv) => ClaudeProbeResult;
export interface ClaudeProbeResult { ok: boolean; stdout: string; stderr: string; }
export type CodexProbe = (env?: NodeJS.ProcessEnv) => ClaudeProbeResult;
export type McpProbe = (url: string) => Promise<{ reachable: boolean; detail: string }>;
```

`HookProbe` will follow the same shape: a function taking `scriptPath + opts` and returning a `Promise<HookProbeResult>` with `{ exitCode, stderr, timedOut, spawnError? }`. Tests use vitest with injected probes; mocking spawn outcomes is the standard pattern.

## 4. Optional peer deps removal context

Confirmed via `packages/teamagent/package.json`: `dependencies` only contains `@xenova/transformers`, `onnxruntime-node`, `sqlite-vec`, `ulid`. **No `web-tree-sitter` or `tree-sitter-*`** (PR #158 removed them as optional/dev). Their absence in production install is the root cause of the `bin-session-start.cjs` MODULE_NOT_FOUND.

`packages/teamagent/postinstall.mjs` (the file the grill references) emits per-stage log lines of the form `[<ISO>] stage=<name> status=<value> message=<...>` to `~/.teamagent/postinstall.log`. The user-symptom pattern `stage=install-user-hook exit=1` is what doctor commit 4 can pattern-match for hints (optional — main signal is the live spawn probe).

## 5. Existing chaos / spawn test patterns

`packages/adapters/src/llm/__tests__/claude-code-client.test.ts` is the reference shape:

```ts
const spawner: Spawner = async (_cmd, _args, opts) => {
  capturedInput = opts.input;
  return { kind: "exit", code: 0, stdout: JSON.stringify({ result: "done" }), stderr: "" };
};
const client = new ClaudeCodeLLMClient({ spawner });
```

For commit 3 chaos: temporarily rename `node_modules/web-tree-sitter` and the transitive xenova dirs in a temp test-rig, spawn the real built `bin-session-start.cjs`, assert exit 0 + stderr line matching a conservative-mode banner. Vitest `tmpdir` helpers are already used in adapter tests.

## 6. ADR / policy cross-references

- `docs/AGENTIC-CODING-POLICY.md` §3 — Verification subagent must be read-only, must not live in `packages/core/` or `packages/cli/`, must not read `/review` output. After every fix commit in §4 the driver dispatches such a subagent and appends its `pass | fail | uncertain` verdict to the §judge harness section of the current fix-plan.md.
- `docs/feature-verification.md` V4 — LLM-judged JSON dump. Commit 5 emits three structured JSON artifacts (unit test result, chaos hook exit, doctor report) under `.fixedflow/judge/issue-280/` so an independent LLM judge can verify the claim post-merge.

---

End of research. Findings are the input for `plan.md` (next document) and inform every commit in the 5-step implementation.
