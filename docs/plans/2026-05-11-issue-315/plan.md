# Plan — issue #315 embedder RAM bomb

Format: 3-section per `docs/PLAN-RESEARCH-REPORT.md`.
Spec source: locked grill comment on issue #315
(<https://github.com/libz-renlab-ai/TeamBrain/issues/315#issuecomment-4427736189>).

## ① Task description

### What we are doing

Stop multi-Claude-window usage from spawning N independent 650MB
in-process embedder loads. Specifically:

1. **A — UserPromptSubmit hook** now uses the same
   `DaemonFirstEmbedder` singleton as PreToolUse / Stop.
   `retrieveRulesForPrompt`'s previous `?? new XenovaRuleEmbedder()`
   default becomes a hard throw, so future callers cannot silently
   regress.
2. **B — DaemonFirstEmbedder daemon-unreachable branch** returns one
   empty vector per input text. The retriever's existing per-stage
   try/catch in `SqliteSemanticRetriever` makes this degrade to
   BM25-only without any new code paths.
3. **C — Spawn-race locks** at both `tryDetachedSpawn` (Race α) and
   inside the daemon's `bin-embedder.ts:runDaemon` startup (Race β).
   Atomic `fs.openSync(path, "wx")` only; 30s mtime stale-cleanup;
   no third-party `proper-lockfile` dependency.

### How (commit-by-commit)

| # | Commit | Files |
|---|---|---|
| A | `feat(issue-315): xenova ctor tracker + FAIL_FAST gate` | `packages/adapters/src/embedding/xenova-rule-embedder.ts` + test |
| B1 | `feat(issue-315): wire UserPromptSubmit to DaemonFirstEmbedder` | `packages/cli/src/bin-user-prompt-submit.ts`, `packages/cli/src/user-prompt-rule-retriever.ts`, `scripts/show-injection.ts` + test |
| B2 | `refactor(issue-315): DaemonFirstEmbedder returns empty vectors when daemon unreachable` | `packages/cli/src/daemon-first-embedder.ts` + rewritten test |
| C1 | `fix(issue-315): fs.openSync(wx) lock around tryDetachedSpawn (Race α)` | `packages/cli/src/embedder-spawn-lock.ts` (new), `packages/cli/src/daemon-first-embedder.ts`, new test |
| C2 | `fix(issue-315): fs.openSync(wx) lock inside bin-embedder startup (Race β)` | `packages/cli/src/bin-embedder.ts` (reuses lock helper) |
| D | `feat(judge): scripts/judge/issue-315.mjs + plan trio` | `scripts/judge/issue-315.mjs`, `docs/plans/2026-05-11-issue-315/{research,plan,judge}.md` |
| E | `docs(changelog): UserPromptSubmit daemon path + BM25 fallback` | `CHANGELOG.md` |

### What we are NOT doing

- ❌ Touch CLI sidetrack commands (analyze / pitfall / warmup / migrate-v6 / migrate-v7 / scripts/show-injection.ts beyond the required B1 plumbing). They're not on the per-dialog hot path.
- ❌ Delete the `XenovaRuleEmbedder` class. It remains for the CLI sidetracks.
- ❌ Change BM25-only RRF ranking / threshold. We rely on the existing degrade path.
- ❌ Change daemon idle-exit / refcount / /health / /register / /shutdown interfaces.
- ❌ Add third-party `proper-lockfile`. Stdlib `fs.openSync(wx)` only.
- ❌ Change diagnostic surfaces other than what `teamagent doctor` already has.
- ❌ Switch model / add quantization / model cache cleanup. Out of #315 scope.

## ② Expected outputs

| # | Output | Verification |
|---|---|---|
| **A1** | `bin-user-prompt-submit.ts` passes `embedder: getEmbedder()` to `retrieveRulesForPrompt`; `user-prompt-rule-retriever.ts:179` throws when no embedder is provided. | grep + `user-prompt-rule-retriever.test.ts` rejects.toThrow test |
| **A2** | `DaemonFirstEmbedder.embed()` returns `texts.map(() => [])` when daemon unreachable; **never instantiates `XenovaRuleEmbedder`**. | `daemon-first-embedder.test.ts` asserts `xenovaConstructCount === 0` |
| **A3** | `SqliteSemanticRetriever.retrieve` with empty `contextVec`/`actionVec` returns BM25-only results (existing graceful degrade). | retriever's per-stage try/catch already covers; harness V1.5/V1.6 prove no Xenova load end-to-end |
| **A4** | Concurrent SessionStart / daemon spawn → only one `XenovaRuleEmbedder` ctor across the whole fan-out. Locks released after winner finishes; stale lock auto-takeover after 30s mtime. | `embedder-spawn-lock.test.ts` 5 unit tests + harness V1.6 |
| **A5** | End-to-end: 5 concurrent SessionStart + 5 concurrent PreToolUse all share one daemon; tracker file has ≤ 1 line, and that line's argv contains `bin-embedder.cjs`. | `scripts/judge/issue-315.mjs` §V1.6 |
| **A6** | `CHANGELOG.md` Unreleased section documents the user-visible change. | grep + `git diff CHANGELOG.md` |

## ③ How to verify (judge harness)

`scripts/judge/issue-315.mjs` (commit D) implements `docs/PLAN-RESEARCH-REPORT.md`'s
"third-party harness that outputs a ton of JSON and lets LLM-judge it":

```
§V1 RUN      typecheck / test-cli / test-adapters / build /
             single-tracker / concurrent-tracker
§V2 DUMP     .fixedflow/judge/issue-315/judge.json
§V3 READ     LLM judge consumes judge.json + evidence files →
             verdict.json with `pass | fail | uncertain`
```

Tracker instrument (commit A) is the cornerstone — it measures the
**cause** (XenovaRuleEmbedder ctor calls) not the **effect** (RSS), so
the verdict is not polluted by browsers, IDEs, or unrelated processes.
`FAIL_FAST=1` in the concurrent probe means the moment a regression
shows a 2nd loader, all 10 child processes self-terminate before the
test machine itself OOMs from the bug it's verifying.

## Anti-goals (also encoded in grill body)

See § "What we are NOT doing" above. The grill comment lists the same
items in the public-facing acceptance criteria so reviewers can hold
the PR to it.
